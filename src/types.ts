export type MediaKind =
  | "md-image"
  | "md-av"
  | "wikilink"
  | "html-img"
  | "html-source";

export interface MediaRef {
  notePath: string;
  rawMatch: string;
  rawStart: number;
  rawEnd: number;
  url: string;
  kind: MediaKind;
  /**
   * The URL of an enclosing markdown link, when the embed is wrapped as
   * `[![alt](url)](linkUrl)`. Set to the link's URL when it equals the
   * embed's `url` (so the rewriter can collapse the wrapper); otherwise
   * null/undefined (the wrapper, if any, is left untouched).
   */
  linkUrl?: string;
}

export interface Dropped {
  ref: MediaRef;
  reason: "denylist" | "not-in-allowlist" | "too-large" | "already-local" | "non-media" | "unknown";
}

export interface Failed {
  ref: MediaRef;
  error: string;
}

export interface RunReport {
  scannedNotes: number;
  candidates: number;
  downloaded: number;
  rewritten: number;
  dropped: Dropped[];
  failed: Failed[];
  dryRun: boolean;
}

export interface RunContext {
  dryRun: boolean;
}