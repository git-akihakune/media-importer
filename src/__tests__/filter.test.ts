import { describe, it, expect } from "vitest";
import { filterByRules, hostMatches } from "../filter";
import { MediaRef } from "../types";

const ref = (url: string): MediaRef => ({
  notePath: "x.md", rawMatch: url, rawStart: 0, rawEnd: url.length, url, kind: "md-image",
});

describe("hostMatches", () => {
  it("matches exact host and subdomain", () => {
    expect(hostMatches("cdn.example.com", "cdn.example.com")).toBe(true);
    expect(hostMatches("sub.cdn.example.com", "cdn.example.com")).toBe(true);
    expect(hostMatches("attacker.com/cdn.example.com", "cdn.example.com")).toBe(false);
  });
  it("matches regex when pattern starts and ends with /", () => {
    expect(hostMatches("i.imgur.com", "/^i\\.imgur\\.com$/")).toBe(true);
    expect(hostMatches("imgur.com", "/^i\\.imgur\\.com$/")).toBe(false);
  });
  it("matches wildcard * (= all)", () => {
    expect(hostMatches("anything.com", "*")).toBe(true);
  });
});

describe("filterByRules", () => {
  it("default allowlist [*] keeps everything not in denylist", () => {
    const refs = [ref("https://a.com/x.png"), ref("https://b.com/y.png")];
    const result = filterByRules(refs, { allowlist: ["*"], denylist: [] });
    expect(result.kept).toHaveLength(2);
    expect(result.dropped).toHaveLength(0);
  });
  it("denylist drops matching host", () => {
    const refs = [ref("https://cdn.bad.com/x.png"), ref("https://good.com/y.png")];
    const result = filterByRules(refs, { allowlist: ["*"], denylist: ["bad.com"] });
    expect(result.kept).toHaveLength(1);
    expect(result.kept[0].url).toContain("good.com");
    expect(result.dropped[0].reason).toBe("denylist");
  });
  it("allowlist restricts to listed hosts", () => {
    const refs = [ref("https://keep.com/x.png"), ref("https://drop.com/y.png")];
    const result = filterByRules(refs, { allowlist: ["keep.com"], denylist: [] });
    expect(result.kept).toHaveLength(1);
    expect(result.dropped[0].reason).toBe("not-in-allowlist");
  });
});

import { filterBySize } from "../filter";

interface HeadFn { head(url: string): Promise<{ contentLength: number | null }>; }

describe("filterBySize", () => {
  it("passes through when sizeLimitMB is null", async () => {
    const refs = [ref("https://x.com/a.png")];
    const r = await filterBySize(refs, null, { head: async () => ({ contentLength: 999 }) });
    expect(r.kept).toHaveLength(1);
    expect(r.dropped).toHaveLength(0);
  });
  it("drops files over the cap", async () => {
    const refs = [ref("https://x.com/big.png"), ref("https://x.com/small.png")];
    const head: HeadFn = {
      head: async (url) => ({ contentLength: url.includes("big") ? 10 * 1024 * 1024 : 1024 }),
    };
    const r = await filterBySize(refs, 5, head);
    expect(r.kept).toHaveLength(1);
    expect(r.kept[0].url).toContain("small");
    expect(r.dropped[0].reason).toBe("too-large");
  });
  it("keeps when contentLength is unknown (server didn't return it)", async () => {
    const refs = [ref("https://x.com/mystery.png")];
    const head: HeadFn = { head: async () => ({ contentLength: null }) };
    const r = await filterBySize(refs, 5, head);
    expect(r.kept).toHaveLength(1);
  });
});
