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