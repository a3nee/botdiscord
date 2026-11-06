import { describe, expect, it } from "vitest";
import { SafeGuardClient, type FetchLike } from "../src/safeguard-client.js";
import { COMMAND_DEFINITIONS, escapeDiscord, handleCommand, isStaff, type CommandContext } from "../src/commands.js";
import { loadBotConfig } from "../src/config.js";

const ORG = "11111111-2222-3333-4444-555555555555";
const KEY = "ak_abc123.secretpart";

interface Call {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: unknown;
}

/** Fake SafeGuard API: routes are matched on "METHOD path" (without the /v1/orgs/:org prefix). */
function fakeApi(routes: Record<string, (body: unknown) => [number, unknown]>) {
  const calls: Call[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    const path = url.replace(`https://api.safeguard.test/v1/orgs/${ORG}`, "");
    const body = init.body ? (JSON.parse(init.body) as unknown) : undefined;
    calls.push({ method: init.method, url: path, headers: init.headers, body });
    const handler = routes[`${init.method} ${path}`];
    const [status, data] = handler ? handler(body) : [404, { error: { message: "Not found" } }];
    return {
      ok: status < 400,
      status,
      text: async () => JSON.stringify(data),
      arrayBuffer: async () => {
        const b = Buffer.isBuffer(data) ? data : Buffer.from(JSON.stringify(data));
        return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
      },
    };
  };
  const ctx: CommandContext = {
    safeguard: new SafeGuardClient("https://api.safeguard.test", KEY, ORG, fetchImpl),
    actor: "discord:alex (123456789012345678)",
    dashboardUrl: "https://dash.safeguard.test",
    screenshotWaitMs: 5_000,
    sleep: async () => undefined,
  };
  return { calls, ctx };
}

const player = (over: Record<string, unknown> = {}) => ({
  id: "p1",
  displayName: "Cheater",
  online: true,
  globalRisk: 86,
  riskLevel: "critical",
  tags: [],
  lastSeenAt: new Date().toISOString(),
  firstSeenAt: new Date().toISOString(),
  lastServerName: "Main RP",
  detections: 4,
  activeBan: false,
  watched: false,
  ...over,
});

const detail = {
  player: { id: "p1", displayName: "Cheater", primaryLicense: "license:abc", online: true, globalRisk: 86, riskLevel: "critical", lastServerId: "s1", lastSeenAt: new Date().toISOString() },
  bans: [],
  detections: [{ type: "event.honeypot", severity: "critical", occurredAt: new Date().toISOString() }],
};

describe("commands", () => {
  it("defines every handled command with Discord-valid names", () => {
    for (const c of COMMAND_DEFINITIONS) {
      expect(c.name).toMatch(/^[a-z_-]{1,32}$/);
      expect(c.description.length).toBeLessThanOrEqual(100);
    }
    expect(COMMAND_DEFINITIONS.map((c) => c.name).sort()).toEqual(["ban", "detections", "player", "screenshot", "server", "unban"]);
  });

  it("/player shows the risk profile and authenticates with the API key", async () => {
    const { calls, ctx } = fakeApi({
      "GET /players?q=Cheater&limit=10": () => [200, { items: [player(), player({ id: "p2", displayName: "Cheater2" })] }],
      "GET /players/p1": () => [200, detail],
    });
    const reply = await handleCommand("player", { query: "Cheater" }, ctx);
    expect(reply.embeds?.[0]).toMatchObject({ title: "Cheater", url: `https://dash.safeguard.test/o/${ORG}/players/p1`, color: 0xe5484d });
    expect(reply.embeds?.[0]?.fields?.find((f) => f.name === "Risk")?.value).toBe("86 / 100 (critical)");
    expect(calls[0]!.headers.authorization).toBe(`Bearer ${KEY}`);
  });

  it("asks for a more specific query when several players match", async () => {
    const { ctx } = fakeApi({ "GET /players?q=che&limit=10": () => [200, { items: [player(), player({ id: "p2", displayName: "Chess" })] }] });
    const reply = await handleCommand("player", { query: "che" }, ctx);
    expect(reply.content).toContain("Several players match");
    expect(reply.embeds).toBeUndefined();
  });

  it("/ban issues a temporary ban on behalf of the Discord member", async () => {
    const { calls, ctx } = fakeApi({
      "GET /players?q=Cheater&limit=10": () => [200, { items: [player()] }],
      "POST /bans": () => [201, { id: "b1", publicId: "AC-4K9Q2M7" }],
    });
    const reply = await handleCommand("ban", { player: "Cheater", reason: "Aimbot on video", hours: 48 }, ctx);
    expect(reply.embeds?.[0]?.description).toContain("AC-4K9Q2M7");
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.body).toMatchObject({ playerId: "p1", type: "temporary", durationMinutes: 2880, reason: "Aimbot on video" });
    expect(post.headers["x-safeguard-on-behalf-of"]).toBe("discord:alex (123456789012345678)");
  });

  it("/ban refuses players that are already banned", async () => {
    const { calls, ctx } = fakeApi({ "GET /players?q=Cheater&limit=10": () => [200, { items: [player({ activeBan: true })] }] });
    expect((await handleCommand("ban", { player: "Cheater", reason: "again" }, ctx)).content).toContain("already banned");
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("/unban validates the id and revokes the matching active ban", async () => {
    const { calls, ctx } = fakeApi({
      "GET /bans?status=active&limit=200": () => [200, { items: [{ id: "b1", publicId: "AC-4K9Q2M7", playerName: "Cheater" }] }],
      "POST /bans/b1/revoke": () => [200, {}],
    });
    expect((await handleCommand("unban", { ban_id: "nope", reason: "x" }, ctx)).content).toContain("AC-");
    const reply = await handleCommand("unban", { ban_id: "ac-4k9q2m7", reason: "Appeal accepted" }, ctx);
    expect(reply.embeds?.[0]?.title).toBe("Ban AC-4K9Q2M7 revoked");
    expect(calls.at(-1)!.body).toEqual({ reason: "Appeal accepted" });
  });

  it("/screenshot targets the server the player is on and posts the picture", async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    let polls = 0;
    const { calls, ctx } = fakeApi({
      "GET /players?q=Cheater&limit=10": () => [200, { items: [player()] }],
      "GET /players/p1": () => [200, detail],
      "POST /servers/s1/commands": () => [202, { id: "c1", status: "pending" }],
      "GET /commands/c1": () => [200, ++polls < 2 ? { id: "c1", status: "delivered", result: null } : { id: "c1", status: "done", result: { evidenceId: "e1" } }],
      "GET /evidence/e1/file": () => [200, jpeg],
    });
    const reply = await handleCommand("screenshot", { player: "Cheater" }, ctx);
    expect(calls.find((c) => c.method === "POST")!.body).toMatchObject({ type: "screenshot", playerLicense: "license:abc" });
    expect(reply.embeds?.[0]).toMatchObject({ title: "Screenshot · Cheater", image: { url: "attachment://screenshot.jpg" } });
    expect(reply.files?.[0]?.name).toBe("screenshot.jpg");
    expect(Buffer.compare(reply.files![0]!.data, jpeg)).toBe(0);
  });

  it("/screenshot explains why a capture failed", async () => {
    const { ctx } = fakeApi({
      "GET /players?q=Cheater&limit=10": () => [200, { items: [player()] }],
      "GET /players/p1": () => [200, detail],
      "POST /servers/s1/commands": () => [202, { id: "c2", status: "pending" }],
      "GET /commands/c2": () => [200, { id: "c2", status: "failed", result: { error: "SafeGuard is not running in the player's game yet" } }],
    });
    const reply = await handleCommand("screenshot", { player: "Cheater" }, ctx);
    expect(reply.content).toContain("failed: SafeGuard is not running");
    expect(reply.files).toBeUndefined();
  });

  it("turns API permission errors into a readable reply", async () => {
    const { ctx } = fakeApi({ "GET /servers": () => [403, { error: { message: "API key lacks the required permission" } }] });
    expect((await handleCommand("server", {}, ctx)).content).toContain("Check the API key permissions");
  });

  it("escapes markdown and mentions in user-controlled names", () => {
    expect(escapeDiscord("@everyone **x**")).toBe("@​everyone \\*\\*x\\*\\*");
  });

  it("only lets configured staff roles run commands", () => {
    expect(isStaff(["1", "2"], ["2"])).toBe(true);
    expect(isStaff(["1"], ["2"])).toBe(false);
    expect(isStaff([], ["2"])).toBe(false);
  });
});

describe("config", () => {
  const base = {
    DISCORD_TOKEN: "token",
    DISCORD_APPLICATION_ID: "123456789012345678",
    DISCORD_GUILD_ID: "223456789012345678",
    DISCORD_STAFF_ROLE_IDS: "323456789012345678, 423456789012345678",
    SAFEGUARD_API_URL: "https://api.safeguard.test/",
    SAFEGUARD_API_KEY: KEY,
    SAFEGUARD_ORG_ID: ORG,
  };

  it("loads a valid configuration", () => {
    expect(loadBotConfig(base)).toMatchObject({ apiUrl: "https://api.safeguard.test", staffRoleIds: ["323456789012345678", "423456789012345678"] });
  });

  it("refuses to send the API key over plain http", () => {
    expect(() => loadBotConfig({ ...base, SAFEGUARD_API_URL: "http://api.safeguard.test" })).toThrow(/https/);
    expect(loadBotConfig({ ...base, SAFEGUARD_API_URL: "http://localhost:4000" }).apiUrl).toBe("http://localhost:4000");
  });

  it("rejects missing or malformed secrets", () => {
    expect(() => loadBotConfig({ ...base, SAFEGUARD_API_KEY: "alk_license.key" })).toThrow(/API key/);
    expect(() => loadBotConfig({ ...base, DISCORD_STAFF_ROLE_IDS: "" })).toThrow(/DISCORD_STAFF_ROLE_IDS/);
  });
});
