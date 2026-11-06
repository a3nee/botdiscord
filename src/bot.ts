import { Client, Events, GatewayIntentBits, MessageFlags, type ChatInputCommandInteraction } from "discord.js";
import { SafeGuardClient } from "./safeguard-client.js";
import { handleCommand, isStaff, type Options } from "./commands.js";
import type { BotConfig } from "./config.js";
import { attachCommunity, communityIntents } from "./community/index.js";
import { loadCommunityConfig } from "./community/config.js";

function memberRoleIds(interaction: ChatInputCommandInteraction): string[] {
  const roles = interaction.member?.roles;
  if (!roles) return [];
  // Cached members expose a role manager, uncached ones the raw id list.
  return Array.isArray(roles) ? roles : [...roles.cache.keys()];
}

/**
 * Connects to the Discord gateway (Guilds intent only — the bot never reads messages) and answers the SafeGuard
 * slash commands. Replies are ephemeral: player data stays visible to the staff member who asked.
 */
export async function startBot(config: BotConfig, log: Pick<Console, "info" | "warn" | "error"> = console): Promise<Client> {
  const safeguard = new SafeGuardClient(config.apiUrl, config.apiKey, config.organizationId);
  const community = loadCommunityConfig(process.env, config.staffRoleIds);
  const needs = communityIntents(community);
  const intents = [GatewayIntentBits.Guilds];
  // Privileged intents (enable them in the Developer Portal) are only requested when the feature is turned on.
  if (needs.members) intents.push(GatewayIntentBits.GuildMembers);
  if (needs.messages) intents.push(GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent);
  const client = new Client({ intents });

  client.once(Events.ClientReady, (c) => log.info(`SafeGuard bot ready as ${c.user.tag}`));
  const stopCommunity = attachCommunity(client, community, config.guildId, safeguard, log);
  client.once("shardDisconnect", () => undefined);
  const destroy = client.destroy.bind(client);
  client.destroy = async () => {
    stopCommunity();
    await destroy();
  };

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    try {
      if (interaction.guildId !== config.guildId || !isStaff(memberRoleIds(interaction), config.staffRoleIds)) {
        await interaction.reply({ content: "You are not allowed to use SafeGuard commands.", flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const opts: Options = {};
      for (const o of interaction.options.data) {
        if (typeof o.value === "string" || typeof o.value === "number") opts[o.name] = o.value;
      }
      const reply = await handleCommand(interaction.commandName, opts, {
        safeguard,
        actor: `discord:${interaction.user.username} (${interaction.user.id})`,
        dashboardUrl: config.dashboardUrl,
        logError: (err) => log.error("command failed", err),
      });
      const { files, ...rest } = reply;
      await interaction.editReply({ ...rest, files: files?.map((f) => ({ attachment: f.data, name: f.name })) ?? [], allowedMentions: { parse: [] } });
    } catch (err) {
      log.error("interaction failed", err);
    }
  });

  client.on(Events.Error, (err) => log.error("discord client error", err));
  await client.login(config.discordToken);
  return client;
}
