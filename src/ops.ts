import { MediaImporterSettings } from "./settings";
import { Backend } from "./storage/backend";
import { VaultAdapter } from "./vault-adapter";
import { walkVault, ScannerConfig } from "./scanner";

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