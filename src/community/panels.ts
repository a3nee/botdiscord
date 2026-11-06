import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type APIEmbed, type Client, type Message } from "discord.js";
import type { PolicyLink } from "./config.js";
import { TICKET_CATEGORIES, type Strings, type TicketCategory } from "./i18n.js";

export interface PanelPayload {
  content?: string;
  embeds: APIEmbed[];
  components: ActionRowBuilder<ButtonBuilder>[];
}

const BRAND = 0x3b82f6;

/**
 * Sends a bot message once and edits it from then on. The message is found again after a restart by its footer
 * marker, so no state file is needed: deleting the message makes the bot post a new one.
 */
export async function ensurePanel(client: Client<true>, channelId: string, marker: string, payload: PanelPayload): Promise<Message> {
  const channel = await client.channels.fetch(channelId);
  if (!channel || !channel.isSendable() || channel.isDMBased()) throw new Error(`Channel ${channelId} is not a server text channel the bot can post in`);
  const recent = await channel.messages.fetch({ limit: 50 });
  const mine = recent.find((m) => m.author.id === client.user.id && m.embeds.some((e) => e.footer?.text === marker));
  if (mine) return mine.edit({ content: payload.content ?? null, embeds: payload.embeds, components: payload.components });
  return channel.send({ ...payload, allowedMentions: { parse: [] } });
}

/** Up to 25 link buttons, 5 per row. Link buttons open the page directly — the bot receives no interaction. */
export function policiesPanel(links: readonly PolicyLink[], s: Strings): PanelPayload {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  links.slice(0, 25).forEach((link, i) => {
    if (i % 5 === 0) rows.push(new ActionRowBuilder<ButtonBuilder>());
    rows[rows.length - 1]!.addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(link.label).setURL(link.url));
  });
  return {
    embeds: [
      {
        title: `📜 ${s.policiesTitle}`,
        description: `${s.policiesBody}\n\n${links.map((l) => `• [${l.label}](${l.url})`).join("\n")}`,
        color: BRAND,
        footer: { text: s.policiesMarker },
      },
    ],
    components: rows,
  };
}

const CATEGORY_EMOJI: Record<TicketCategory, string> = { support: "🛠️", billing: "💳", partnership: "🤝" };

export function ticketPanel(s: Strings): PanelPayload {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    TICKET_CATEGORIES.map((cat) =>
      new ButtonBuilder()
        .setCustomId(`ticket:open:${cat}`)
        .setStyle(cat === "support" ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setLabel(s.category[cat])
        .setEmoji(CATEGORY_EMOJI[cat]),
    ),
  );
  return {
    embeds: [{ title: `🎫 ${s.ticketPanelTitle}`, description: s.ticketPanelBody, color: BRAND, footer: { text: s.ticketPanelMarker } }],
    components: [row],
  };
}
