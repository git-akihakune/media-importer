import { Dropped, Failed, MediaRef, RunReport } from "./types";

export interface ProgressReporter {
  start(total: number): void;
  update(done: number, current: string): void;
  reportDropped(ref: MediaRef, reason: Dropped["reason"]): void;
  reportFailed(ref: MediaRef, error: string): void;
  reportWouldDownload(ref: MediaRef, dest: string, notePath: string): void;
  reportWouldRewrite(notePath: string, ref: MediaRef, newUrl: string): void;
  reportDownloaded(ref: MediaRef, dest: string): void;
  reportRewritten(notePath: string, ref: MediaRef, newUrl: string): void;
  finish(report: RunReport): void;
}

export interface WouldDownload { ref: MediaRef; dest: string; notePath: string; }
export interface WouldRewrite { notePath: string; ref: MediaRef; newUrl: string; }

export class DryRunAccumulator implements ProgressReporter {
  wouldDownload: WouldDownload[] = [];
  wouldRewrite: WouldRewrite[] = [];
  dropped: Dropped[] = [];
  failed: Failed[] = [];

  start(_total: number) {}
  update(_done: number, _current: string) {}
  reportDropped(ref: MediaRef, reason: Dropped["reason"]) { this.dropped.push({ ref, reason }); }
  reportFailed(ref: MediaRef, error: string) { this.failed.push({ ref, error }); }
  reportWouldDownload(ref: MediaRef, dest: string, notePath: string) {
    this.wouldDownload.push({ ref, dest, notePath });
  }
  reportWouldRewrite(notePath: string, ref: MediaRef, newUrl: string) {
    this.wouldRewrite.push({ notePath, ref, newUrl });
  }
  reportDownloaded(_ref: MediaRef, _dest: string) {}
  reportRewritten(_notePath: string, _ref: MediaRef, _newUrl: string) {}
  finish(_report: RunReport) {}

  getReport() {
    return { wouldDownload: this.wouldDownload, wouldRewrite: this.wouldRewrite, dropped: this.dropped, failed: this.failed };
  }
}

export class NullProgressReporter implements ProgressReporter {
  start(_total: number) {}
  update(_done: number, _current: string) {}
  reportDropped(_ref: MediaRef, _reason: Dropped["reason"]) {}
  reportFailed(_ref: MediaRef, _error: string) {}
  reportWouldDownload(_ref: MediaRef, _dest: string, _notePath: string) {}
  reportWouldRewrite(_notePath: string, _ref: MediaRef, _newUrl: string) {}
  reportDownloaded(_ref: MediaRef, _dest: string) {}
  reportRewritten(_notePath: string, _ref: MediaRef, _newUrl: string) {}
  finish(_report: RunReport) {}
}