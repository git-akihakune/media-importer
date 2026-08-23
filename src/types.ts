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
}

export interface Dropped {
  ref: MediaRef;
  reason: "denylist" | "not-in-allowlist" | "too-large" | "already-local" | "unknown";
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