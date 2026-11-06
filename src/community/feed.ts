import type { APIEmbed } from "discord.js";
import type { PublicStatsDto } from "../contracts.js";
import type { Strings } from "./i18n.js";

const COLOUR = 0xe5484d;

/** `detectionsTotal` is newer than the other fields: an API that does not send it yet falls back to the 30-day count. */
export type GlobalStats = Pick<PublicStatsDto, "bansIssued" | "detections30d"> & { detectionsTotal?: number };

export interface FeedView {
  embeds: APIEmbed[];
  /** Changes only when the numbers change: the message is edited only then. */
  signature: string;
}

function formatCount(n: number, s: Strings): string {
  return `**${n.toLocaleString(s.numberLocale)}**`;
}

/** Builds the stats message: SafeGuard Anticheat bans and detections across every server. Pure: tested without Discord. */
export function buildFeed(stats: GlobalStats, s: Strings, now: Date): FeedView {
  const total = typeof stats.detectionsTotal === "number";
  const detections = total ? stats.detectionsTotal! : stats.detections30d;
  return {
    signature: JSON.stringify([stats.bansIssued, detections, total]),
    embeds: [
      {
        title: s.feedTitle,
        description: s.feedBody,
        color: COLOUR,
        fields: [
          { name: s.feedBans, value: formatCount(stats.bansIssued, s), inline: true },
          { name: total ? s.feedDetections : s.feedDetections30d, value: formatCount(detections, s), inline: true },
        ],
        footer: { text: s.feedMarker },
        timestamp: now.toISOString(),
      },
    ],
  };
}
