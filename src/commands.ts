import type { BanDto, DetectionListItemDto, PlayerListItemDto, ServerDto, CommandStatusDto } from "./contracts.js";
import { SafeGuardApiError, type SafeGuardClient } from "./safeguard-client.js";

// ------------------------------------------------------------------ Discord command definitions

const STRING = 3;
const INTEGER = 4;
/** Guild text channels only (no DMs). */
const GUILD_ONLY = [0];

/** Slash command definitions, registered as-is through the Discord REST API. */
export const COMMAND_DEFINITIONS = [
  {
    name: "player",
    description: "Show a player's risk profile",
    contexts: GUILD_ONLY,
    options: [{ type: STRING, name: "query", description: "Name, license or Discord id", required: true, max_length: 128 }],
  },
  {
    name: "ban",
    description: "Ban a player on every server of the organization",
    contexts: GUILD_ONLY,
    options: [
      { type: STRING, name: "player", description: "Name, license or Discord id", required: true, max_length: 128 },
      { type: STRING, name: "reason", description: "Internal reason (staff only)", required: true, min_length: 3, max_length: 500 },
      { type: INTEGER, name: "hours", description: "Duration in hours (empty = permanent)", required: false, min_value: 1, max_value: 8760 },
      { type: STRING, name: "public_reason", description: "Reason shown to the player", required: false, min_length: 3, max_length: 200 },
    ],
  },
  {
    name: "unban",
    description: "Revoke a ban",
    contexts: GUILD_ONLY,
    options: [
      { type: STRING, name: "ban_id", description: "Ban id, e.g. AC-4K9Q2M7", required: true, max_length: 16 },
      { type: STRING, name: "reason", description: "Why the ban is revoked", required: true, min_length: 3, max_length: 500 },
    ],
  },
  { name: "server", description: "Status of the protected servers", contexts: GUILD_ONLY },
  {
    name: "detections",
    description: "Latest detections",
    contexts: GUILD_ONLY,
    options: [{ type: INTEGER, name: "count", description: "How many (1–15)", required: false, min_value: 1, max_value: 15 }],
  },
  {
    name: "screenshot",
    description: "Request an evidence screenshot of an online player",
    contexts: GUILD_ONLY,
    options: [{ type: STRING, name: "player", description: "Name, license or Discord id", required: true, max_length: 128 }],
  },
] as const;

export type CommandName = (typeof COMMAND_DEFINITIONS)[number]["name"];

// ------------------------------------------------------------------ replies

export interface Embed {
  title: string;
  description?: string;
  url?: string;
  color?: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  footer?: { text: string };
  image?: { url: string };
}

export interface Reply {
  content?: string;
  embeds?: Embed[];
  /** Attachments, referenced from embeds as attachment://<name>. */
  files?: Array<{ name: string; data: Buffer }>;
}

export interface CommandContext {
  safeguard: SafeGuardClient;
  /** Discord member running the command, e.g. `alex (123456789012345678)`; recorded in the audit log. */
  actor: string;
  dashboardUrl: string | undefined;
  /** Receives unexpected errors (the user only sees a generic message). */
  logError?: (err: unknown) => void;
  /** How long /screenshot waits for the picture (tests use a short wait). */
  screenshotWaitMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export type Options = Record<string, string | number | undefined>;

const COLOURS = { info: 0x0085ff, good: 0x2fb67c, warning: 0xe0a42e, critical: 0xe5484d } as const;

/** Player names are user-controlled: neutralise Discord markdown and mentions before echoing them. */
export function escapeDiscord(text: string): string {
  return text.replace(/([\\*_`~|>#\[\]()-])/g, "\\$1").replace(/@/g, "@\u200b");
}

function riskColour(risk: number): number {
  if (risk > 80) return COLOURS.critical;
  if (risk > 40) return COLOURS.warning;
  return COLOURS.good;
}

const link = (ctx: CommandContext, path: string) => (ctx.dashboardUrl ? `${ctx.dashboardUrl}/o/${ctx.safeguard.organizationId}${path}` : undefined);

// ------------------------------------------------------------------ handlers

class UserError extends Error {}

/** Resolves a player query to exactly one player, or explains why it cannot. */
async function findPlayer(ctx: CommandContext, query: string): Promise<PlayerListItemDto> {
  const { items } = await ctx.safeguard.request<{ items: PlayerListItemDto[] }>("GET", `/players?q=${encodeURIComponent(query)}&limit=10`);
  if (items.length === 0) throw new UserError(`No player matches \`${escapeDiscord(query)}\`.`);
  const exact = items.filter((p) => p.displayName.toLowerCase() === query.toLowerCase());
  if (exact.length === 1) return exact[0]!;
  if (items.length === 1) return items[0]!;
  const names = items.slice(0, 5).map((p) => `• ${escapeDiscord(p.displayName)} — risk ${Math.round(p.globalRisk)}${p.online ? " (online)" : ""}`);
  throw new UserError(`Several players match — be more specific (license or Discord id work too):\n${names.join("\n")}`);
}

interface PlayerDetail {
  player: { id: string; displayName: string; primaryLicense: string; online: boolean; globalRisk: number; riskLevel: string; lastServerId: string | null; lastSeenAt: string };
  bans: Array<{ publicId: string; status: string }>;
  detections: Array<{ type: string; severity: string; occurredAt: string }>;
}

async function player(ctx: CommandContext, opts: Options): Promise<Reply> {
  const found = await findPlayer(ctx, String(opts.query));
  const detail = await ctx.safeguard.request<PlayerDetail>("GET", `/players/${found.id}`);
  const p = detail.player;
  const activeBan = detail.bans.find((b) => b.status === "active");
  const recent = detail.detections.slice(0, 3).map((d) => `\`${d.type}\` (${d.severity}) <t:${Math.floor(Date.parse(d.occurredAt) / 1000)}:R>`);
  return {
    embeds: [
      {
        title: escapeDiscord(p.displayName),
        url: link(ctx, `/players/${p.id}`),
        color: riskColour(p.globalRisk),
        fields: [
          { name: "Risk", value: `${Math.round(p.globalRisk)} / 100 (${p.riskLevel})`, inline: true },
          { name: "Status", value: p.online ? "Online" : `Offline, seen <t:${Math.floor(Date.parse(p.lastSeenAt) / 1000)}:R>`, inline: true },
          { name: "Server", value: found.lastServerName ? escapeDiscord(found.lastServerName) : "—", inline: true },
          { name: "Detections", value: String(found.detections), inline: true },
          { name: "Ban", value: activeBan ? `Active: ${activeBan.publicId}` : "None", inline: true },
          ...(recent.length ? [{ name: "Latest detections", value: recent.join("\n") }] : []),
        ],
      },
    ],
  };
}

async function ban(ctx: CommandContext, opts: Options): Promise<Reply> {
  const target = await findPlayer(ctx, String(opts.player));
  if (target.activeBan) throw new UserError(`${escapeDiscord(target.displayName)} is already banned.`);
  const hours = typeof opts.hours === "number" ? opts.hours : undefined;
  const created = await ctx.safeguard.request<BanDto>("POST", "/bans", {
    actor: ctx.actor,
    body: {
      playerId: target.id,
      type: hours ? "temporary" : "permanent",
      ...(hours ? { durationMinutes: hours * 60 } : {}),
      reason: String(opts.reason),
      publicReason: opts.public_reason ? String(opts.public_reason) : "Violation of the server rules",
    },
  });
  return {
    embeds: [
      {
        title: `Banned ${escapeDiscord(target.displayName)}`,
        url: link(ctx, `/players/${target.id}`),
        color: COLOURS.critical,
        description: `Ban **${created.publicId}** — ${hours ? `${hours} h` : "permanent"}. Every server of the organization applies it within seconds.`,
        footer: { text: "Recorded in the SafeGuard audit log" },
      },
    ],
  };
}

async function unban(ctx: CommandContext, opts: Options): Promise<Reply> {
  const publicId = String(opts.ban_id).trim().toUpperCase();
  if (!/^AC-[0-9A-Z]{7}$/.test(publicId)) throw new UserError("Ban ids look like `AC-4K9Q2M7`.");
  const { items } = await ctx.safeguard.request<{ items: BanDto[] }>("GET", "/bans?status=active&limit=200");
  const target = items.find((b) => b.publicId === publicId);
  if (!target) throw new UserError(`No active ban ${publicId}.`);
  await ctx.safeguard.request("POST", `/bans/${target.id}/revoke`, { actor: ctx.actor, body: { reason: String(opts.reason) } });
  return { embeds: [{ title: `Ban ${publicId} revoked`, color: COLOURS.good, description: `${escapeDiscord(target.playerName)} can join again.` }] };
}

const STATUS_LABEL: Record<ServerDto["status"], string> = { online: "🟢 online", degraded: "🟡 degraded", offline: "🔴 offline", never_connected: "⚪ never connected" };

async function server(ctx: CommandContext): Promise<Reply> {
  const { items } = await ctx.safeguard.request<{ items: ServerDto[] }>("GET", "/servers");
  if (items.length === 0) return { content: "No servers yet. Get a license in the dashboard to protect your first server." };
  return {
    embeds: [
      {
        title: "Protected servers",
        url: link(ctx, "/servers"),
        color: items.every((s) => s.status === "online") ? COLOURS.good : COLOURS.warning,
        fields: items.slice(0, 25).map((s) => ({
          name: escapeDiscord(s.name),
          value: `${STATUS_LABEL[s.status]} · ${s.playersOnline}${s.maxPlayers ? `/${s.maxPlayers}` : ""} players${s.resourceVersion ? ` · v${s.resourceVersion}` : ""}`,
        })),
      },
    ],
  };
}

async function detections(ctx: CommandContext, opts: Options): Promise<Reply> {
  const count = typeof opts.count === "number" ? Math.min(15, Math.max(1, opts.count)) : 10;
  const { items } = await ctx.safeguard.request<{ items: DetectionListItemDto[] }>("GET", `/detections?limit=${count}`);
  if (items.length === 0) return { content: "No detections yet." };
  const lines = items.map(
    (d) => `<t:${Math.floor(Date.parse(d.occurredAt) / 1000)}:R> **${d.severity}** \`${d.type}\` — ${d.playerName ? escapeDiscord(d.playerName) : "unknown player"} on ${escapeDiscord(d.serverName)}`,
  );
  return { embeds: [{ title: `Latest ${items.length} detections`, url: link(ctx, "/detections"), color: COLOURS.info, description: lines.join("\n") }] };
}

async function screenshot(ctx: CommandContext, opts: Options): Promise<Reply> {
  const found = await findPlayer(ctx, String(opts.player));
  const { player: p } = await ctx.safeguard.request<PlayerDetail>("GET", `/players/${found.id}`);
  if (!p.online || !p.lastServerId) throw new UserError(`${escapeDiscord(p.displayName)} is not online.`);
  const { id } = await ctx.safeguard.request<{ id: string }>("POST", `/servers/${p.lastServerId}/commands`, {
    actor: ctx.actor,
    body: { type: "screenshot", playerLicense: p.primaryLicense, reason: "Requested from Discord" },
  });

  // The server usually answers within a couple of seconds: wait for the picture and post it here.
  const sleep = ctx.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const until = Date.now() + (ctx.screenshotWaitMs ?? 20_000);
  let status: CommandStatusDto | null = null;
  while (Date.now() < until) {
    status = await ctx.safeguard.request<CommandStatusDto>("GET", `/commands/${id}`);
    if (status.status === "done" || status.status === "failed" || status.status === "expired") break;
    await sleep(1_000);
  }
  const evidenceId = status?.status === "done" && typeof status.result?.evidenceId === "string" ? status.result.evidenceId : null;
  if (!evidenceId) {
    const error = typeof status?.result?.error === "string" ? status.result.error : null;
    return {
      content: error
        ? `Screenshot of ${escapeDiscord(p.displayName)} failed: ${escapeDiscord(error)}`
        : `Screenshot of ${escapeDiscord(p.displayName)} requested. It appears in the player's evidence${ctx.dashboardUrl ? ` (${link(ctx, `/players/${p.id}`)})` : ""} within a few seconds.`,
    };
  }
  const image = await ctx.safeguard.download(`/evidence/${evidenceId}/file`);
  return {
    embeds: [
      {
        title: `Screenshot · ${escapeDiscord(p.displayName)}`,
        url: link(ctx, `/players/${p.id}`),
        color: COLOURS.info,
        image: { url: "attachment://screenshot.jpg" },
        footer: { text: "Captured from the player's game · stored as evidence" },
      },
    ],
    files: [{ name: "screenshot.jpg", data: image }],
  };
}

const HANDLERS: Record<CommandName, (ctx: CommandContext, opts: Options) => Promise<Reply>> = {
  player,
  ban,
  unban,
  server: (ctx) => server(ctx),
  detections,
  screenshot,
};

/** Runs a command. Never throws: API and input errors become a readable reply. */
export async function handleCommand(name: string, opts: Options, ctx: CommandContext): Promise<Reply> {
  const handler = HANDLERS[name as CommandName];
  if (!handler) return { content: "Unknown command." };
  try {
    return await handler(ctx, opts);
  } catch (err) {
    if (err instanceof UserError) return { content: err.message };
    if (err instanceof SafeGuardApiError) return { content: `SafeGuard API: ${err.message}` };
    ctx.logError?.(err);
    return { content: "Something went wrong. The error was logged." };
  }
}

/** Only members holding one of the configured staff roles may run commands. */
export function isStaff(memberRoleIds: readonly string[], staffRoleIds: readonly string[]): boolean {
  return memberRoleIds.some((id) => staffRoleIds.includes(id));
}
