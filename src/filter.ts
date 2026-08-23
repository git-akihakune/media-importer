import { MediaRef, Dropped } from "./types";

export interface FilterRules {
  allowlist: string[];
  denylist: string[];
}

export interface FilterResult {
  kept: MediaRef[];
  dropped: Dropped[];
}

export function hostMatches(host: string, pattern: string): boolean {
  if (pattern === "*") return true;
  if (pattern.startsWith("/") && pattern.endsWith("/")) {
    try {
      const re = new RegExp(pattern.slice(1, -1));
      return re.test(host);
    } catch {
      return false;
    }
  }
  return host === pattern || host.endsWith("." + pattern);
}

function urlHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

export function filterByRules(refs: MediaRef[], rules: FilterRules): FilterResult {
  const kept: MediaRef[] = [];
  const dropped: Dropped[] = [];
  for (const ref of refs) {
    const host = urlHost(ref.url);
    if (rules.denylist.some(p => hostMatches(host, p))) {
      dropped.push({ ref, reason: "denylist" });
      continue;
    }
    if (rules.allowlist.length > 0 && !rules.allowlist.some(p => hostMatches(host, p))) {
      dropped.push({ ref, reason: "not-in-allowlist" });
      continue;
    }
    kept.push(ref);
  }
  return { kept, dropped };
}