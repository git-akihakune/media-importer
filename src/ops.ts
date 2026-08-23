import { MediaImporterSettings } from "./settings";
import { Backend } from "./storage/backend";
import { VaultAdapter } from "./vault-adapter";
import { walkVault, ScannerConfig } from "./scanner";
import { rewriteNote } from "./rewriter";
import { urlBasename } from "./url";

export interface WipeDeps {
  vault: VaultAdapter;
  backend: Backend;
}

export interface WipeReport {
  deleted: number;
  failed: { url: string; error: string }[];
  scannedNotes: number;
  candidates: number;
}

export async function wipeBackend(deps: WipeDeps, settings: MediaImporterSettings): Promise<WipeReport> {
  const scannerCfg: ScannerConfig = { ...settings.detectors };
  const refs = await walkVault(deps.vault, settings.scanPaths, scannerCfg);

  const scannedNotes = new Set(refs.map(r => r.notePath)).size;

  const targets = refs.filter(r => deps.backend.selfProduced(r.url));
  const urls = [...new Set(targets.map(r => r.url))];

  let deleted = 0;
  const failed: { url: string; error: string }[] = [];

  for (const url of urls) {
    try {
      await deps.backend.delete(url);
      deleted++;
    } catch (e: unknown) {
      const error = e instanceof Error ? e.message : String(e);
      failed.push({ url, error });
    }
  }

  return { deleted, failed, scannedNotes, candidates: urls.length };
}

export interface MigrateDeps {
  vault: VaultAdapter;
  source: Backend;
  dest: Backend;
}

export interface MigrateReport {
  migrated: number;
  rewritten: number;
  failed: { url: string; error: string }[];
  scannedNotes: number;
  candidates: number;
}

export async function migrateBackend(deps: MigrateDeps, settings: MediaImporterSettings): Promise<MigrateReport> {
  const scannerCfg: ScannerConfig = { ...settings.detectors };
  const refs = await walkVault(deps.vault, settings.scanPaths, scannerCfg);

  const scannedNotes = new Set(refs.map(r => r.notePath)).size;

  const candidates = refs.filter(r => deps.source.selfProduced(r.url));

  const byNote = new Map<string, typeof candidates>();
  for (const r of candidates) {
    const arr = byNote.get(r.notePath) ?? [];
    arr.push(r);
    byNote.set(r.notePath, arr);
  }

  const migrated: string[] = [];
  const failed: { url: string; error: string }[] = [];
  let rewritten = 0;

  for (const [notePath, noteRefs] of byNote) {
    const rewrites: { ref: typeof noteRefs[number]; newUrl: string }[] = [];
    let noteFailed = false;
    for (const ref of noteRefs) {
      try {
        const buf = await deps.source.get(ref.url);
        const name = urlBasename(ref.url);
        const newUrl = await deps.dest.put(buf, name);
        rewrites.push({ ref, newUrl });
        migrated.push(ref.url);
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        failed.push({ url: ref.url, error });
        noteFailed = true;
      }
    }
    if (!noteFailed && rewrites.length > 0) {
      try {
        const original = await deps.vault.read(notePath);
        const updated = rewriteNote(original, rewrites.map(r => ({ ref: r.ref, newUrl: r.newUrl })));
        await deps.vault.modifyText(notePath, updated);
        rewritten += rewrites.length;
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        for (const rw of rewrites) {
          failed.push({ url: rw.ref.url, error: `rewrite failed: ${error}` });
        }
      }
    }
  }

  return { migrated: migrated.length, rewritten, failed, scannedNotes, candidates: candidates.length };
}