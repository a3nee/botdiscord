import { describe, expect, it } from "vitest";
import { loadCommunityConfig } from "../src/community/config.js";
import { buildFeed } from "../src/community/feed.js";
import { strings } from "../src/community/i18n.js";
import { findBlockedLinks } from "../src/community/links.js";
import { parseTicketTopic, ticketChannelName, ticketTopic } from "../src/community/tickets.js";

const ID = "123456789012345678";

describe("anti-link", () => {
  it("blocks links outside the allow list", () => {
    expect(findBlockedLinks("vê https://evil.example/x", ["safeguardac.pt"])).toHaveLength(1);
    expect(findBlockedLinks("discord.gg/abc entra", [])).toHaveLength(1);
    expect(findBlockedLinks("www.free-nitro.com", [])).toHaveLength(1);
  });
  it("allows the allow-listed domain and its subdomains", () => {
    expect(findBlockedLinks("https://safeguardac.pt/legal/terms e https://docs.safeguardac.pt", ["safeguardac.pt"])).toEqual([]);
  });
  it("ignores plain text, file names and e-mail addresses", () => {
    expect(findBlockedLinks("olá, vê o config.ts e manda para nome@gmail.com", [])).toEqual([]);
  });
});

describe("tickets", () => {
  it("round-trips the topic marker", () => {
    expect(parseTicketTopic(ticketTopic(ID, "billing"))).toEqual({ userId: ID, category: "billing" });
    expect(parseTicketTopic("canal normal")).toBeNull();
    expect(parseTicketTopic(null)).toBeNull();
  });
  it("builds a valid channel name", () => {
    expect(ticketChannelName("support", "João_Silva!!")).toBe("support-joao-silva");
    expect(ticketChannelName("partnership", "★★★")).toBe("partnership-user");
  });
});

describe("global stats message", () => {
  const s = strings("pt");

  it("shows only the bans and detections totals in one embed", () => {
    const view = buildFeed({ bansIssued: 1234, detections30d: 50, detectionsTotal: 98765 }, s, new Date());
    expect(view.embeds).toHaveLength(1);
    const fields = view.embeds[0]?.fields ?? [];
    expect(fields.map((f) => f.name)).toEqual([s.feedBans, s.feedDetections]);
    expect(fields[0]?.value.replace(/\D/g, "")).toBe("1234");
    expect(fields[1]?.value.replace(/\D/g, "")).toBe("98765");
    expect(view.embeds[0]?.footer?.text).toBe(s.feedMarker);
  });

  it("changes signature only when the numbers change", () => {
    const a = buildFeed({ bansIssued: 1, detections30d: 5, detectionsTotal: 9 }, s, new Date("2026-01-01T11:00:00Z"));
    const b = buildFeed({ bansIssued: 1, detections30d: 5, detectionsTotal: 9 }, s, new Date("2026-01-01T12:00:00Z"));
    const c = buildFeed({ bansIssued: 2, detections30d: 5, detectionsTotal: 9 }, s, new Date());
    expect(a.signature).toBe(b.signature);
    expect(c.signature).not.toBe(a.signature);
  });

  it("falls back to the 30-day count on an API without the total", () => {
    const view = buildFeed({ bansIssued: 1, detections30d: 113 }, s, new Date());
    expect(view.embeds[0]?.fields?.[1]).toMatchObject({ name: s.feedDetections30d, value: "**113**" });
  });
});
describe("community config", () => {
  it("turns everything off when nothing is configured", () => {
    const c = loadCommunityConfig({}, [ID]);
    expect(c.tickets).toBeUndefined();
    expect(c.autoRole).toBeUndefined();
    expect(c.feed).toBeUndefined();
    expect(c.policies).toBeUndefined();
  });

  it("builds the default policy buttons from SITE_URL", () => {
    const c = loadCommunityConfig({ POLICIES_CHANNEL_ID: ID, SITE_URL: "https://safeguardac.pt" }, [ID]);
    expect(c.policies?.links.map((l) => l.url)).toContain("https://safeguardac.pt/pt/legal/privacy");
  });

  it("rejects malformed ids", () => {
    expect(() => loadCommunityConfig({ FEED_CHANNEL_ID: "abc" }, [ID])).toThrow();
  });

  it("enables tickets with staff roles falling back to the bot staff roles", () => {
    const c = loadCommunityConfig({ TICKET_PANEL_CHANNEL_ID: ID }, [ID]);
    expect(c.tickets?.staffRoleIds).toEqual([ID]);
  });
});
