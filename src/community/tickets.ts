import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type Guild,
  type GuildBasedChannel,
  type Message,
  type ModalSubmitInteraction,
  type TextChannel,
} from "discord.js";
import { escapeDiscord } from "../commands.js";
import type { TicketsConfig } from "./config.js";
import { TICKET_CATEGORIES, type Strings, type TicketCategory } from "./i18n.js";

/**
 * A ticket channel carries its owner and category in the topic (`ticket:<userId>:<category>`). Members cannot edit
 * the topic (no Manage Channels), so it is a trustworthy marker and the bot keeps no state of its own.
 */
const TOPIC = /^ticket:(\d{17,20}):([a-z]+)$/;

export function ticketTopic(userId: string, category: TicketCategory): string {
  return `ticket:${userId}:${category}`;
}

export function parseTicketTopic(topic: string | null | undefined): { userId: string; category: string } | null {
  const m = topic ? TOPIC.exec(topic) : null;
  return m ? { userId: m[1]!, category: m[2]! } : null;
}

export function isTicketChannel(channel: unknown): boolean {
  return typeof channel === "object" && channel !== null && "topic" in channel && parseTicketTopic((channel as { topic: string | null }).topic) !== null;
}

/** Discord channel names: lowercase, digits and dashes only. */
export function ticketChannelName(category: TicketCategory, username: string): string {
  const user = username.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "user";
  return `${category}-${user}`.slice(0, 90);
}

function isCategory(value: string | undefined): value is TicketCategory {
  return (TICKET_CATEGORIES as readonly string[]).includes(value ?? "");
}

export interface TicketContext {
  config: TicketsConfig;
  s: Strings;
  log: Pick<Console, "info" | "warn" | "error">;
}

type TicketInteraction = ButtonInteraction | ModalSubmitInteraction;

function isTeam(interaction: TicketInteraction, staffRoleIds: readonly string[]): boolean {
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;
  const roles = interaction.member?.roles;
  if (!roles) return false;
  const ids = Array.isArray(roles) ? roles : [...roles.cache.keys()];
  return ids.some((id) => staffRoleIds.includes(id));
}

const pendingCreates = new Set<string>();

function controls(s: Strings, claimed: boolean): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("ticket:claim").setStyle(ButtonStyle.Success).setLabel(s.ticketClaim).setEmoji("🙋").setDisabled(claimed),
    new ButtonBuilder().setCustomId("ticket:close").setStyle(ButtonStyle.Danger).setLabel(s.ticketClose).setEmoji("🔒"),
  );
}

function findOpenTicket(guild: Guild, userId: string): GuildBasedChannel | undefined {
  return guild.channels.cache.find((c) => c.type === ChannelType.GuildText && parseTicketTopic(c.topic)?.userId === userId);
}

async function openModal(interaction: ButtonInteraction, category: TicketCategory, s: Strings): Promise<void> {
  const subject = new TextInputBuilder()
    .setCustomId("subject")
    .setLabel(s.modalSubject)
    .setPlaceholder(s.modalSubjectPlaceholder)
    .setStyle(TextInputStyle.Paragraph)
    .setMinLength(10)
    .setMaxLength(1000)
    .setRequired(true);
  await interaction.showModal(
    new ModalBuilder()
      .setCustomId(`ticket:create:${category}`)
      .setTitle(s.modalTitle(s.category[category]).slice(0, 45))
      .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(subject)),
  );
}

async function createTicket(interaction: ModalSubmitInteraction, category: TicketCategory, ctx: TicketContext): Promise<void> {
  const { s, config } = ctx;
  const guild = interaction.guild;
  if (!guild) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const userId = interaction.user.id;
  const existing = findOpenTicket(guild, userId);
  if (existing) {
    await interaction.editReply(s.ticketAlreadyOpen(`<#${existing.id}>`));
    return;
  }
  if (pendingCreates.has(userId)) return void (await interaction.deleteReply().catch(() => undefined));
  pendingCreates.add(userId);
  try {
    const member = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks];
    const staffRoles = config.staffRoleIds.filter((id) => guild.roles.cache.has(id));
    const channel = await guild.channels.create({
      name: ticketChannelName(category, interaction.user.username),
      type: ChannelType.GuildText,
      parent: config.categoryId ?? null,
      topic: ticketTopic(userId, category),
      reason: `Ticket (${category}) opened by ${interaction.user.tag}`,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: userId, allow: member },
        ...staffRoles.map((id) => ({ id, allow: [...member, PermissionFlagsBits.ManageMessages] })),
        { id: guild.client.user.id, allow: [...member, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages] },
      ],
    });
    const subject = interaction.fields.getTextInputValue("subject");
    await channel.send({
      content: [`<@${userId}>`, ...staffRoles.map((id) => `<@&${id}>`)].join(" "),
      allowedMentions: { users: [userId], roles: staffRoles },
      embeds: [
        new EmbedBuilder()
          .setColor(0x3b82f6)
          .setTitle(`🎫 ${s.category[category]}`)
          .setDescription(`${s.ticketWelcome(`<@${userId}>`)}\n\n**${s.ticketSubject}**\n${escapeDiscord(subject)}`)
          .addFields({ name: s.ticketOpenedBy, value: `<@${userId}>`, inline: true })
          .setTimestamp(new Date()),
      ],
      components: [controls(s, false)],
    });
    await interaction.editReply(s.ticketCreated(`<#${channel.id}>`));
  } catch (err) {
    ctx.log.error("ticket creation failed", err);
    await interaction.editReply(s.ticketCreateFailed).catch(() => undefined);
  } finally {
    pendingCreates.delete(userId);
  }
}

async function claimTicket(interaction: ButtonInteraction, ctx: TicketContext): Promise<void> {
  const { s } = ctx;
  if (!isTeam(interaction, ctx.config.staffRoleIds)) {
    await interaction.reply({ content: s.staffOnly, flags: MessageFlags.Ephemeral });
    return;
  }
  const original = interaction.message.embeds[0];
  const embed = original ? EmbedBuilder.from(original) : new EmbedBuilder();
  embed.addFields({ name: s.ticketClaimedBy, value: `<@${interaction.user.id}>`, inline: true });
  await interaction.update({ embeds: [embed], components: [controls(s, true)] });
  if (interaction.channel?.isSendable()) {
    await interaction.channel.send({ content: s.ticketClaimed(`<@${interaction.user.id}>`), allowedMentions: { parse: [] } });
  }
}

/** Plain-text transcript, oldest first (up to 2000 messages). */
async function transcript(channel: TextChannel): Promise<string> {
  const all: Message[] = [];
  let before: string | undefined;
  while (all.length < 2000) {
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    all.push(...batch.values());
    const last = batch.last();
    if (batch.size < 100 || !last) break;
    before = last.id;
  }
  return all
    .reverse()
    .map((m) => {
      const parts = [m.content];
      for (const e of m.embeds) parts.push([e.title, e.description].filter(Boolean).join(" — "));
      for (const a of m.attachments.values()) parts.push(`[${a.name}] ${a.url}`);
      return `[${m.createdAt.toISOString()}] ${m.author.tag} (${m.author.id}): ${parts.filter(Boolean).join(" | ")}`;
    })
    .join("\n");
}

async function closeTicket(interaction: ButtonInteraction, ctx: TicketContext): Promise<void> {
  const { s, config } = ctx;
  const channel = interaction.channel;
  const owner = channel && "topic" in channel ? parseTicketTopic(channel.topic) : null;
  if (!channel || channel.type !== ChannelType.GuildText || !owner) {
    await interaction.reply({ content: s.notATicket, flags: MessageFlags.Ephemeral });
    return;
  }
  if (interaction.user.id !== owner.userId && !isTeam(interaction, config.staffRoleIds)) {
    await interaction.reply({ content: s.staffOnly, flags: MessageFlags.Ephemeral });
    return;
  }
  if (interaction.customId === "ticket:close") {
    await interaction.reply({
      content: s.ticketCloseConfirm,
      flags: MessageFlags.Ephemeral,
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId("ticket:close:confirm").setStyle(ButtonStyle.Danger).setLabel(s.ticketCloseYes),
        ),
      ],
    });
    return;
  }

  await interaction.update({ content: s.ticketClosing(`<@${interaction.user.id}>`), components: [] });
  await channel.send({ content: s.ticketClosing(`<@${interaction.user.id}>`), allowedMentions: { parse: [] } });

  const text = await transcript(channel).catch((err) => {
    ctx.log.warn("ticket transcript failed", err);
    return "";
  });
  const file = () => new AttachmentBuilder(Buffer.from(text || "(empty)", "utf8"), { name: `${channel.name}.txt` });
  const category = isCategory(owner.category) ? s.category[owner.category] : owner.category;
  const summary = new EmbedBuilder()
    .setColor(0x64748b)
    .setTitle(`🔒 ${s.ticketClosedLog} — #${channel.name}`)
    .addFields(
      { name: s.ticketOpenedBy, value: `<@${owner.userId}>`, inline: true },
      { name: s.ticketClosedBy, value: `<@${interaction.user.id}>`, inline: true },
      { name: s.ticketCategory, value: category, inline: true },
    )
    .setTimestamp(new Date());

  if (config.logChannelId) {
    const log = await interaction.client.channels.fetch(config.logChannelId).catch(() => null);
    if (log?.isSendable()) await log.send({ embeds: [summary], files: [file()], allowedMentions: { parse: [] } }).catch((err) => ctx.log.warn("ticket log failed", err));
  }
  const user = await interaction.client.users.fetch(owner.userId).catch(() => null);
  // Members with DMs closed simply don't get a copy.
  await user?.send({ content: s.ticketDm(interaction.guild?.name ?? "Discord"), files: [file()] }).catch(() => undefined);

  setTimeout(() => void channel.delete(`Ticket closed by ${interaction.user.tag}`).catch((err) => ctx.log.warn("ticket delete failed", err)), 5_000);
}

/** Handles every `ticket:*` button and modal. Returns false for interactions that are not about tickets. */
export async function handleTicketInteraction(interaction: TicketInteraction, ctx: TicketContext): Promise<boolean> {
  const [scope, action, arg] = interaction.customId.split(":");
  if (scope !== "ticket") return false;
  if (interaction.isButton()) {
    if (action === "open" && isCategory(arg)) {
      const existing = interaction.guild ? findOpenTicket(interaction.guild, interaction.user.id) : undefined;
      if (existing) await interaction.reply({ content: ctx.s.ticketAlreadyOpen(`<#${existing.id}>`), flags: MessageFlags.Ephemeral });
      else await openModal(interaction, arg, ctx.s);
    }
    else if (action === "claim") await claimTicket(interaction, ctx);
    else if (action === "close") await closeTicket(interaction, ctx);
    return true;
  }
  if (interaction.isModalSubmit() && action === "create" && isCategory(arg)) await createTicket(interaction, arg, ctx);
  return true;
}
