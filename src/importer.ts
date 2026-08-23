import { MediaImporterSettings } from "./settings";
import { Backend } from "./storage/backend";
import { VaultAdapter } from "./vault-adapter";
import { FetchRequester } from "./downloader";
import { HeadRequester } from "./filter";
import { walkVault, ScannerConfig } from "./scanner";
import { filterByRules, filterBySize } from "./filter";
import { Downloader } from "./downloader";
import { rewriteNote } from "./rewriter";
import { ProgressReporter, NullProgressReporter } from "./progress";
import { urlBasename } from "./url";
import { MediaRef, RunReport, RunContext, Dropped, Failed } from "./types";

export interface ImporterDeps {
  vault: VaultAdapter;
  backend: Backend;
  fetch: FetchRequester;
  head: HeadRequester;
}

export async function runImport(
  deps: ImporterDeps,
  settings: MediaImporterSettings,
  ctx: RunContext,
  progress: ProgressReporter = new NullProgressReporter(),
): Promise<RunReport> {
  const scannerCfg: ScannerConfig = { ...settings.detectors };
  const refs = await walkVault(deps.vault, settings.scanPaths, scannerCfg);

  const scannedNotes = new Set(refs.map(r => r.notePath)).size;

  // Drop URLs the active backend says it already produced.
  const fresh: MediaRef[] = [];
  const alreadyProduced: Dropped[] = [];
  for (const r of refs) {
    if (deps.backend.selfProduced(r.url)) {
      alreadyProduced.push({ ref: r, reason: "already-local" });
      progress.reportDropped(r, "already-local");
    } else {
      fresh.push(r);
    }
  }

  const ruleFiltered = filterByRules(fresh, { allowlist: settings.allowlist, denylist: settings.denylist });
  for (const d of ruleFiltered.dropped) progress.reportDropped(d.ref, d.reason);

  const sizeFiltered = await filterBySize(ruleFiltered.kept, settings.sizeLimitMB, deps.head);
  for (const d of sizeFiltered.dropped) progress.reportDropped(d.ref, "too-large");

  const candidates = sizeFiltered.kept;

  progress.start(candidates.length);

  const downloader = new Downloader(deps.fetch, { timeoutMs: settings.requestTimeoutSec * 1000 });

  // Group refs by note so we can rewrite atomically.
  const byNote = new Map<string, MediaRef[]>();
  for (const r of candidates) {
    const arr = byNote.get(r.notePath) ?? [];
    arr.push(r);
    byNote.set(r.notePath, arr);
  }

  const downloaded: MediaRef[] = [];
  const failed: Failed[] = [];
  let rewritten = 0;
  let done = 0;

  for (const [notePath, noteRefs] of byNote) {
    const rewrites: { ref: MediaRef; newUrl: string }[] = [];
    let noteFailed = false;
    for (const ref of noteRefs) {
      progress.update(done, ref.url);
      try {
        const result = await downloader.fetch(ref.url, ctx);
        if (result === null) {
          failed.push({ ref, error: "fetch failed" });
          progress.reportFailed(ref, "fetch failed");
          noteFailed = true;
          done++;
          continue;
        }
        const name = urlBasename(ref.url);
        let dest: string;
        if (ctx.dryRun) {
          dest = await deps.backend.dryRunDest(name);
          progress.reportWouldDownload(ref, dest, notePath);
        } else {
          dest = await deps.backend.put(result.buf, name);
          progress.reportDownloaded(ref, dest);
        }
        rewrites.push({ ref, newUrl: dest });
        downloaded.push(ref);
        done++;
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        failed.push({ ref, error });
        progress.reportFailed(ref, error);
        noteFailed = true;
        done++;
      }
    }
    if (!noteFailed && rewrites.length > 0) {
      if (ctx.dryRun) {
        for (const rw of rewrites) progress.reportWouldRewrite(notePath, rw.ref, rw.newUrl);
      } else {
        try {
          const original = await deps.vault.read(notePath);
          const updated = rewriteNote(original, rewrites);
          await deps.vault.modifyText(notePath, updated);
          for (const rw of rewrites) progress.reportRewritten(notePath, rw.ref, rw.newUrl);
          rewritten += rewrites.length;
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          for (const rw of rewrites) {
            failed.push({ ref: rw.ref, error: `rewrite failed: ${error}` });
            progress.reportFailed(rw.ref, `rewrite failed: ${error}`);
          }
        }
      }
    }
  }

  const report: RunReport = {
    scannedNotes,
    candidates: fresh.length,
    downloaded: ctx.dryRun ? 0 : downloaded.length,
    rewritten: ctx.dryRun ? 0 : rewritten,
    dropped: [...alreadyProduced, ...ruleFiltered.dropped, ...sizeFiltered.dropped],
    failed,
    dryRun: ctx.dryRun,
  };
  progress.finish(report);
  return report;
}
