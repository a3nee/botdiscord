export interface BotConfig {
  discordToken: string;
  applicationId: string;
  /** Commands are registered per guild: they appear instantly and never leak to other servers. */
  guildId: string;
  /** Discord role ids allowed to use the commands (checked by the bot before any API call). */
  staffRoleIds: string[];
  apiUrl: string;
  apiKey: string;
  organizationId: string;
  dashboardUrl: string | undefined;
}

const SNOWFLAKE = /^\d{17,20}$/;

function required(env: NodeJS.ProcessEnv, name: string): string {
  const v = env[name]?.trim();
  if (!v) throw new Error(`${name} is required`);
  return v;
}

/** Reads and validates the bot configuration. Secrets only come from the environment. */
export function loadBotConfig(env: NodeJS.ProcessEnv = process.env): BotConfig {
  const apiKey = required(env, "SAFEGUARD_API_KEY");
  if (!/^ak_[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(apiKey)) throw new Error("SAFEGUARD_API_KEY must be a SafeGuard API key (ak_…)");
  const apiUrl = required(env, "SAFEGUARD_API_URL").replace(/\/+$/, "");
  const url = new URL(apiUrl);
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) {
    throw new Error("SAFEGUARD_API_URL must use https (the API key is sent with every request)");
  }
  const organizationId = required(env, "SAFEGUARD_ORG_ID");
  if (!/^[0-9a-f-]{36}$/i.test(organizationId)) throw new Error("SAFEGUARD_ORG_ID must be the organization UUID");

  const staffRoleIds = required(env, "DISCORD_STAFF_ROLE_IDS")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (staffRoleIds.length === 0 || !staffRoleIds.every((id) => SNOWFLAKE.test(id))) throw new Error("DISCORD_STAFF_ROLE_IDS must be a comma-separated list of role ids");
  const applicationId = required(env, "DISCORD_APPLICATION_ID");
  const guildId = required(env, "DISCORD_GUILD_ID");
  if (!SNOWFLAKE.test(applicationId) || !SNOWFLAKE.test(guildId)) throw new Error("DISCORD_APPLICATION_ID and DISCORD_GUILD_ID must be Discord ids");

  return {
    discordToken: required(env, "DISCORD_TOKEN"),
    applicationId,
    guildId,
    staffRoleIds,
    apiUrl,
    apiKey,
    organizationId,
    dashboardUrl: env.SAFEGUARD_DASHBOARD_URL?.trim().replace(/\/+$/, "") || undefined,
  };
}
