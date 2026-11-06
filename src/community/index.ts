import { Events, PermissionFlagsBits, type Client, type GuildMember, type Message } from "discord.js";
import type { SafeGuardClient } from "../safeguard-client.js";
import type { CommunityConfig as BaseConfig } from "./config.js";
import { buildFeed } from "./feed.js";
import { strings } from "./i18n.js";
import { findBlockedLinks } from "./links.js";
import { ensurePanel, policiesPanel, ticketPanel } from "./panels.js";
import { handleTicketInteraction } from "./tickets.js";

type Log = Pick<Console, "info" | "warn" | "error">;
/** Community settings plus the one guild the bot serves. */
type CommunityConfig = BaseConfig & { guildId: string };

/** Gateway intents each optional feature needs on top of `Guilds`. */
export function communityIntents(cfg: BaseConfig): { members: boolean; messages: boolean } {
  return { members: cfg.autoRole !== undefined, messages: cfg.antiLink !== undefined };
}

async function onMemberJoin(member: GuildMember, cfg: CommunityConfig, log: Log): Promise<void> {
  const auto = cfg.autoRole;
  if (!auto || member.guild.id !== cfg.guildId) return;
  const roles = member.user.bot && auto.botRoleIds.length > 0 ? auto.botRoleIds : auto.roleIds;
  if (roles.length === 0) return;
  await member.roles.add(roles, strings(cfg.lang).autoRoleReason).catch((err) => log.warn(`auto role failed for ${member.id}`, err));
}

/** strikes per user inside the rolling window */
const strikes = new Map<string, number[]>();
const STRIKE_WINDOW_MS = 10 * 60_000;

async function onMessage(message: Message, cfg: CommunityConfig, log: Log): Promise<void> {
  const al = cfg.antiLink;
  if (!al || !message.inGuild() || message.guildId !== cfg.guildId || message.author.bot || message.webhookId) return;
  if (al.exemptChannelIds.includes(message.channelId) || (message.channel.isThread() && message.channel.parentId && al.exemptChannelIds.includes(message.channel.parentId))) return;
  const member = message.member;
  if (!member) return;
  if (member.permissions.has(PermissionFlagsBits.ManageMessages) || member.roles.cache.some((r) => al.exemptRoleIds.includes(r.id))) return;

  const blocked = findBlockedLinks(message.content, al.allowedDomains);
  if (blocked.length === 0) return;
  const s = strings(cfg.lang);

  await message.delete().catch((err) => log.warn("anti-link delete failed", err));
  const now = Date.now();
  const recent = (strikes.get(member.id) ?? []).filter((t) => now - t < STRIKE_WINDOW_MS);
  recent.push(now);
  strikes.set(member.id, recent);

  let timedOut = false;
  if (al.timeoutMinutes > 0 && recent.length >= al.strikes && member.moderatable) {
    timedOut = await member
      .timeout(al.timeoutMinutes * 60_000, `Anti-link: ${recent.length} blocked links in 10 minutes`)
      .then(() => true)
      .catch((err) => (log.warn("anti-link timeout failed", err), false));
    if (timedOut) strikes.delete(member.id);
  }

  const notice = timedOut ? s.linkTimedOut(`<@${member.id}>`, al.timeoutMinutes) : s.linkBlocked(`<@${member.id}>`);
  const warn = await message.channel.send({ content: notice, allowedMentions: { users: [member.id] } }).catch(() => null);
  if (warn) setTimeout(() => void warn.delete().catch(() => undefined), 8_000);

  if (cfg.logChannelId) {
    const ch = await message.client.channels.fetch(cfg.logChannelId).catch(() => null);
    if (ch?.isSendable()) {
      await ch
        .send({
          allowedMentions: { parse: [] },
          embeds: [
            {
              title: `🔗 ${s.linkLogTitle}`,
              color: timedOut ? 0xef4444 : 0xf59e0b,
              fields: [
                { name: s.linkLogUser, value: `<@${member.id}> (${member.id})`, inline: true },
                { name: s.linkLogChannel, value: `<#${message.channelId}>`, inline: true },
                ...(timedOut ? [{ name: s.linkLogTimeout, value: `${al.timeoutMinutes} min`, inline: true }] : []),
                { name: s.linkLogLinks, value: blocked.slice(0, 10).map((l) => `\`${l.replace(/`/g, "")}\``).join("\n").slice(0, 1024) },
                { name: s.linkLogMessage, value: (message.content.replace(/`/g, "'").slice(0, 1000) || "—") },
              ],
              timestamp: new Date().toISOString(),
            },
          ],
        })
        .catch((err) => log.warn("anti-link log failed", err));
    }
  }
}

/**
 * Posts the live feed once and edits it every `intervalSeconds`. The message is only edited when its contents change,
 * which keeps the bot far below Discord's rate limits. API failures leave the last good version in place.
 */
function startFeed(client: Client<true>, cfg: CommunityConfig, safeguard: SafeGuardClient, log: Log): () => void {
  const feed = cfg.feed;
  if (!feed) return () => undefined;
  const s = strings(cfg.lang);
  let message: Message | undefined;
  let lastSignature = "";
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const view = buildFeed(await safeguard.publicStats(), s, new Date());
      if (message && view.signature === lastSignature) return;
      const payload = { embeds: view.embeds, components: [] };
      if (message) message = await message.edit(payload);
      else message = await ensurePanel(client, feed.channelId, s.feedMarker, payload);
      lastSignature = view.signature;
    } catch (err) {
      // A deleted message is re-created on the next tick.
      if ((err as { code?: number }).code === 10008) message = undefined;
      log.warn("live feed update failed", err);
    } finally {
      running = false;
    }
  };

  void tick();
  const timer = setInterval(() => void tick(), feed.intervalSeconds * 1000);
  return () => clearInterval(timer);
}

/** Wires every configured community feature to the client. Returns a function that stops background work. */
export function attachCommunity(client: Client, base: BaseConfig, guildId: string, safeguard: SafeGuardClient, log: Log = console): () => void {
  const cfg: CommunityConfig = { ...base, guildId };
  const s = strings(cfg.lang);
  let stopFeed: () => void = () => undefined;

  client.once(Events.ClientReady, async (ready) => {
    if (cfg.policies) {
      await ensurePanel(ready, cfg.policies.channelId, s.policiesMarker, policiesPanel(cfg.policies.links, s)).catch((err) => log.error("policies panel failed", err));
    }
    if (cfg.tickets) {
      await ensurePanel(ready, cfg.tickets.panelChannelId, s.ticketPanelMarker, ticketPanel(s)).catch((err) => log.error("ticket panel failed", err));
    }
    stopFeed = startFeed(ready, cfg, safeguard, log);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!cfg.tickets || interaction.guildId !== cfg.guildId) return;
    if (!interaction.isButton() && !interaction.isModalSubmit()) return;
    try {
      await handleTicketInteraction(interaction, { config: cfg.tickets, s, log });
    } catch (err) {
      log.error("ticket interaction failed", err);
    }
  });

  if (cfg.autoRole) client.on(Events.GuildMemberAdd, (m) => void onMemberJoin(m, cfg, log));
  if (cfg.antiLink) {
    client.on(Events.MessageCreate, (m) => void onMessage(m, cfg, log).catch((err) => log.error("anti-link failed", err)));
    client.on(Events.MessageUpdate, (_old, m) => {
      if (m.partial) return;
      void onMessage(m, cfg, log).catch((err) => log.error("anti-link failed", err));
    });
  }

  return () => stopFeed();
}
