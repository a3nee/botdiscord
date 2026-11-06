import type { Lang } from "./i18n.js";

export interface PolicyLink {
  label: string;
  url: string;
}

export interface TicketsConfig {
  /** Channel where the "open a ticket" panel lives. */
  panelChannelId: string;
  /** Category the ticket channels are created in (optional — top level when absent). */
  categoryId: string | undefined;
  /** Roles that see and answer every ticket. */
  staffRoleIds: string[];
  /** Where transcripts of closed tickets are posted. */
  logChannelId: string | undefined;
}

export interface AutoRoleConfig {
  roleIds: string[];
  botRoleIds: string[];
}

export interface AntiLinkConfig {
  allowedDomains: string[];
  exemptRoleIds: string[];
  exemptChannelIds: string[];
  /** Timeout length once a member reaches `strikes` blocked links in 10 minutes; 0 only deletes. */
  timeoutMinutes: number;
  strikes: number;
}

export interface FeedConfig {
  channelId: string;
  intervalSeconds: number;
}

export interface CommunityConfig {
  lang: Lang;
  siteUrl: string;
  logChannelId: string | undefined;
  policies: { channelId: string; links: PolicyLink[] } | undefined;
  tickets: TicketsConfig | undefined;
  autoRole: AutoRoleConfig | undefined;
  antiLink: AntiLinkConfig | undefined;
  feed: FeedConfig | undefined;
}

const SNOWFLAKE = /^\d{17,20}$/;

function opt(env: NodeJS.ProcessEnv, name: string): string | undefined {
  return env[name]?.trim() || undefined;
}

function snowflake(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const v = opt(env, name);
  if (v && !SNOWFLAKE.test(v)) throw new Error(`${name} must be a Discord id`);
  return v;
}

function snowflakes(env: NodeJS.ProcessEnv, name: string): string[] {
  const ids = (opt(env, name) ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!ids.every((id) => SNOWFLAKE.test(id))) throw new Error(`${name} must be a comma-separated list of Discord ids`);
  return ids;
}

function int(env: NodeJS.ProcessEnv, name: string, fallback: number, min: number, max: number): number {
  const raw = opt(env, name);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${name} must be an integer between ${min} and ${max}`);
  return n;
}

function bool(env: NodeJS.ProcessEnv, name: string, fallback: boolean): boolean {
  const raw = opt(env, name)?.toLowerCase();
  if (raw === undefined) return fallback;
  if (["1", "true", "yes", "sim", "on"].includes(raw)) return true;
  if (["0", "false", "no", "nao", "não", "off"].includes(raw)) return false;
  throw new Error(`${name} must be true or false`);
}

function httpsUrl(value: string, name: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error(`${name} must be an http(s) URL`);
  return url.toString().replace(/\/+$/, "");
}

/** Policy pages of the site (`/legal/<slug>`), in the order they appear on the buttons. */
const DEFAULT_POLICIES: Record<Lang, Array<[string, string]>> = {
  pt: [
    ["Termos de Serviço", "terms"],
    ["Política de Privacidade", "privacy"],
    ["Acordo de Tratamento de Dados", "dpa"],
    ["Política de Reembolsos", "refunds"],
  ],
  en: [
    ["Terms of Service", "terms"],
    ["Privacy Policy", "privacy"],
    ["Data Processing Agreement", "dpa"],
    ["Refund Policy", "refunds"],
  ],
};

/** `Label=https://…;Label 2=https://…` — split on the first `=` so query strings survive. */
export function parsePolicyLinks(raw: string): PolicyLink[] {
  const links = raw
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((pair) => {
      const i = pair.indexOf("=");
      if (i <= 0) throw new Error(`POLICY_LINKS entry "${pair}" must be Label=URL`);
      const label = pair.slice(0, i).trim();
      if (label.length > 80) throw new Error(`POLICY_LINKS label "${label}" is longer than 80 characters`);
      return { label, url: httpsUrl(pair.slice(i + 1).trim(), "POLICY_LINKS") };
    });
  if (links.length > 25) throw new Error("POLICY_LINKS supports at most 25 links");
  return links;
}

/**
 * Community features are optional and independent: each one turns on when its channel/role is configured, so the
 * bot keeps working as a staff-only bot with none of them set.
 */
export function loadCommunityConfig(env: NodeJS.ProcessEnv, staffRoleIds: string[]): CommunityConfig {
  const lang: Lang = opt(env, "BOT_LANGUAGE")?.toLowerCase() === "en" ? "en" : "pt";
  const siteUrl = httpsUrl(opt(env, "SITE_URL") ?? "https://safeguardac.pt", "SITE_URL");
  const logChannelId = snowflake(env, "LOG_CHANNEL_ID");

  const policiesChannel = snowflake(env, "POLICIES_CHANNEL_ID");
  const customLinks = opt(env, "POLICY_LINKS");
  const policies = policiesChannel
    ? {
        channelId: policiesChannel,
        links: customLinks
          ? parsePolicyLinks(customLinks)
          : // The site serves English at the root and other languages under a prefix ("/pt/legal/terms").
            DEFAULT_POLICIES[lang].map(([label, slug]) => ({
              label,
              url: `${siteUrl}${lang === "en" ? "" : `/${lang}`}/legal/${slug}`,
            })),
      }
    : undefined;

  const ticketPanel = snowflake(env, "TICKET_PANEL_CHANNEL_ID");
  const ticketStaff = snowflakes(env, "TICKET_STAFF_ROLE_IDS");
  const tickets = ticketPanel
    ? {
        panelChannelId: ticketPanel,
        categoryId: snowflake(env, "TICKET_CATEGORY_ID"),
        staffRoleIds: ticketStaff.length > 0 ? ticketStaff : staffRoleIds,
        logChannelId: snowflake(env, "TICKET_LOG_CHANNEL_ID") ?? logChannelId,
      }
    : undefined;

  const roleIds = snowflakes(env, "AUTOROLE_ROLE_IDS");
  const botRoleIds = snowflakes(env, "AUTOROLE_BOT_ROLE_IDS");
  const autoRole = roleIds.length > 0 || botRoleIds.length > 0 ? { roleIds, botRoleIds } : undefined;

  const siteHost = new URL(siteUrl).hostname.replace(/^www\./, "");
  const antiLink = bool(env, "ANTILINK_ENABLED", false)
    ? {
        allowedDomains: [
          siteHost,
          ...(opt(env, "ANTILINK_ALLOWED_DOMAINS") ?? "")
            .split(",")
            .map((d) => d.trim().toLowerCase().replace(/^\*?\./, ""))
            .filter(Boolean),
        ],
        exemptRoleIds: [...staffRoleIds, ...snowflakes(env, "ANTILINK_EXEMPT_ROLE_IDS")],
        exemptChannelIds: snowflakes(env, "ANTILINK_EXEMPT_CHANNEL_IDS"),
        timeoutMinutes: int(env, "ANTILINK_TIMEOUT_MINUTES", 10, 0, 40320),
        strikes: int(env, "ANTILINK_STRIKES", 3, 1, 20),
      }
    : undefined;

  const feedChannel = snowflake(env, "FEED_CHANNEL_ID");
  const feed = feedChannel
    ? {
        channelId: feedChannel,
        intervalSeconds: int(env, "FEED_INTERVAL_SECONDS", 60, 30, 3600),
      }
    : undefined;

  return { lang, siteUrl, logChannelId, policies, tickets, autoRole, antiLink, feed };
}
