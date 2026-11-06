// Types of the SafeGuard API responses used by the bot.
// Copied from packages/contracts in the SafeGuard monorepo; keep them in sync when the API changes.

﻿export interface BanDto {
  id: string;
  publicId: string;
  playerId: string;
  playerName: string;
  serverId: string | null;
  serverName: string | null;
  type: "temporary" | "permanent";
  source: "automatic" | "manual" | "ban_wave";
  status: "active" | "expired" | "revoked";
  reason: string;
  publicReason: string;
  issuedBy: string | null;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  revokeReason: string | null;
  notes: string | null;
  detectionId: string | null;
  appealStatus: string | null;
}

export interface DetectionListItemDto {
  id: string;
  serverId: string;
  serverName: string;
  playerId: string | null;
  playerName: string | null;
  type: string;
  category: string;
  severity: string;
  confidence: number;
  origin: string;
  occurredAt: string;
}

export interface PlayerListItemDto {
  id: string;
  displayName: string;
  primaryLicense: string;
  online: boolean;
  /** Server the player is on (or was last on). */
  lastServerId: string | null;
  globalRisk: number;
  riskLevel: string;
  trustScore: number | null;
  tags: string[];
  lastSeenAt: string;
  firstSeenAt: string;
  lastServerName: string | null;
  detections: number;
  activeBan: boolean;
  watched: boolean;
}

export const SERVER_STATUSES = ["online", "degraded", "offline", "never_connected"] as const;

export type ServerStatus = (typeof SERVER_STATUSES)[number];

export const FRAMEWORKS = ["esx", "qbcore", "qbox", "vrp", "vrpex", "standalone", "unknown"] as const;

export type Framework = (typeof FRAMEWORKS)[number];

export interface ServerDto {
  id: string;
  name: string;
  description: string | null;
  status: ServerStatus;
  framework: Framework | null;
  resourceVersion: string | null;
  playersOnline: number;
  maxPlayers: number | null;
  lastHeartbeatAt: string | null;
  lastIp: string | null;
  licenseId: string | null;
  createdAt: string;
}

// ------------------------------------------------------------------ commands (dashboard → agent)

/** Commands staff can send from the dashboard. Spectate sessions have their own endpoints. */
export const STAFF_COMMAND_TYPES = [
  "kick",
  "ban",
  "unban",
  "screenshot",
  "clip",
  "freeze",
  "unfreeze",
  "quarantine",
  "release",
  "message",
  "warn",
  "strip_weapons",
  "clear_risk",
  "heal",
  "revive",
  "slay",
  "teleport",
  "eject_vehicle",
  "delete_vehicle",
  "clear_entities",
] as const;

export const COMMAND_TYPES = [...STAFF_COMMAND_TYPES, "spectate", "spectate_stop", "console"] as const;

export type CommandType = (typeof COMMAND_TYPES)[number];

export const COMMAND_STATUSES = ["pending", "delivered", "done", "failed", "expired"] as const;

export type CommandStatus = (typeof COMMAND_STATUSES)[number];

/** What the dashboard sees of a command it sent (polled until done/failed/expired). */
export interface CommandStatusDto {
  id: string;
  type: CommandType;
  status: CommandStatus;
  /** `evidenceId` for screenshots, `error` for failures. */
  result: Record<string, unknown> | null;
  createdAt: string;
  deliveredAt: string | null;
  completedAt: string | null;
}

// ---------------------------------------------------------------- public website data (no personal data)

/** Totals shown on the website. Only counts; never names, servers or organizations. */
export interface PublicStatsDto {
  /** Servers that sent a heartbeat in the last 7 days. */
  serversProtected: number;
  /** Bans ever issued (automatic and manual). */
  bansIssued: number;
  /** Detections recorded in the last 30 days. */
  detections30d: number;
  /** Detections ever recorded. */
  detectionsTotal: number;
}
