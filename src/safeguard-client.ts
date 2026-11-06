import type { GlobalStats } from "./community/feed.js";

export class SafeGuardApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
  arrayBuffer?(): Promise<ArrayBuffer>;
}>;

/**
 * Minimal SafeGuard API client authenticated with an organization API key. Every call names the Discord member
 * it runs for (`x-safeguard-on-behalf-of`), which ends up in the organization's audit log.
 */
export class SafeGuardClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    readonly organizationId: string,
    private readonly fetchImpl: FetchLike = (url, init) => fetch(url, init),
  ) {}

  async request<T>(method: "GET" | "POST", path: string, opts: { body?: unknown; actor?: string } = {}): Promise<T> {
    const headers: Record<string, string> = { authorization: `Bearer ${this.apiKey}` };
    if (opts.body !== undefined) headers["content-type"] = "application/json";
    if (opts.actor) headers["x-safeguard-on-behalf-of"] = opts.actor;
    let res;
    try {
      res = await this.fetchImpl(`${this.baseUrl}/v1/orgs/${this.organizationId}${path}`, {
        method,
        headers,
        ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new SafeGuardApiError(0, "The SafeGuard API is unreachable right now.");
    }
    const text = await res.text();
    const data = text ? (JSON.parse(text) as unknown) : undefined;
    if (!res.ok) {
      const message = (data as { error?: { message?: string } } | undefined)?.error?.message ?? `Request failed (${res.status})`;
      throw new SafeGuardApiError(res.status, res.status === 403 ? `Not allowed: ${message}. Check the API key permissions in Integrations.` : message);
    }
    return data as T;
  }

  /** Global SafeGuard Anticheat totals across every server (public, no API key). */
  async publicStats(): Promise<GlobalStats> {
    let res;
    try {
      res = await this.fetchImpl(`${this.baseUrl}/v1/public/stats`, { method: "GET", headers: {}, signal: AbortSignal.timeout(10_000) });
    } catch {
      throw new SafeGuardApiError(0, "The SafeGuard API is unreachable right now.");
    }
    if (!res.ok) throw new SafeGuardApiError(res.status, `Request failed (${res.status})`);
    return JSON.parse(await res.text()) as GlobalStats;
  }

  /** Downloads a file (evidence screenshot) with the same credentials. */
  async download(path: string): Promise<Buffer> {
    let res;
    try {
      res = await this.fetchImpl(`${this.baseUrl}/v1/orgs/${this.organizationId}${path}`, {
        method: "GET",
        headers: { authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new SafeGuardApiError(0, "The SafeGuard API is unreachable right now.");
    }
    if (!res.ok || !res.arrayBuffer) throw new SafeGuardApiError(res.status, `Download failed (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }
}
