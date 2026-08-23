import { describe, it, expect } from "vitest";
import { DryRunAccumulator } from "../progress";
import { MediaRef } from "../types";

const ref = (url: string): MediaRef => ({
  notePath: "x.md", rawMatch: url, rawStart: 0, rawEnd: url.length, url, kind: "md-image",
});

describe("DryRunAccumulator", () => {
  it("accumulates would-download, would-rewrite, dropped, failed", () => {
    const acc = new DryRunAccumulator();
    acc.start(3);
    acc.reportWouldDownload(ref("https://x.com/a.png"), "media/a.png", "x.md");
    acc.reportWouldRewrite("x.md", ref("https://x.com/a.png"), "media/a.png");
    acc.reportWouldDownload(ref("https://x.com/b.png"), "media/b.png", "x.md");
    acc.reportWouldRewrite("x.md", ref("https://x.com/b.png"), "media/b.png");
    acc.reportDropped(ref("https://bad.com/c.png"), "denylist");
    acc.reportFailed(ref("https://x.com/d.png"), "timeout");
    acc.finish({ scannedNotes: 1, candidates: 4, downloaded: 2, rewritten: 2, dropped: [], failed: [], dryRun: true });
    const r = acc.getReport();
    expect(r.wouldDownload).toHaveLength(2);
    expect(r.wouldRewrite).toHaveLength(2);
    expect(r.dropped).toHaveLength(1);
    expect(r.failed).toHaveLength(1);
  });
});