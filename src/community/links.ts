/** Zero-width and formatting characters people use to slip links past filters. */
const INVISIBLE = /[​-‏⁠-⁤﻿­]/g;

const WITH_SCHEME = /\b[a-z][a-z0-9+.-]*:\/\/[^\s<>()]+/gi;
const WWW = /\bwww\.[^\s<>()]+/gi;
const INVITE = /\b(?:discord(?:app)?\.com\/invite|discord\.gg|dsc\.gg|discord\.me|discord\.io)\/[\w-]+/gi;
/**
 * Bare domains (`exemplo.com/xyz`), limited to common TLDs so version numbers and file names don't match; e-mail
 * addresses (`nome@gmail.com`) are left alone.
 */
const BARE_DOMAIN =
  /(?<![@\w.-])(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|net|org|info|biz|io|gg|me|co|ly|tk|ml|ga|cf|gq|ru|xyz|top|site|online|store|shop|link|click|app|dev|live|tv|cc|pt|br|es|fr|de|it|nl|eu|uk|us|ca|au|in|pl|tr|to|su|sh|fun|lol|pro|vip|win|bet|gift|gifts)\b(?:\/[^\s<>()]*)?/gi;

function hostOf(candidate: string): string | null {
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate) ? candidate : `http://${candidate}`);
    return url.hostname.toLowerCase().replace(/\.$/, "") || null;
  } catch {
    return null;
  }
}

function isAllowed(host: string, allowedDomains: readonly string[]): boolean {
  return allowedDomains.some((d) => host === d || host.endsWith(`.${d}`));
}

/**
 * Returns the links in `content` whose host is not on the allow list (subdomains of an allowed domain are allowed).
 * Unparseable links are reported as-is: when in doubt the message is treated as containing a link.
 */
export function findBlockedLinks(content: string, allowedDomains: readonly string[]): string[] {
  const text = content.replace(INVISIBLE, "");
  const found = new Set<string>();
  for (const re of [WITH_SCHEME, WWW, INVITE, BARE_DOMAIN]) {
    for (const m of text.matchAll(re)) found.add(m[0].replace(/[.,!?;:'"*_~`|>]+$/, ""));
  }
  const blocked: string[] = [];
  const seenHosts = new Set<string>();
  for (const link of found) {
    const host = hostOf(link);
    if (host && isAllowed(host, allowedDomains)) continue;
    const key = host ?? link;
    if (seenHosts.has(key)) continue;
    seenHosts.add(key);
    blocked.push(link);
  }
  return blocked;
}
