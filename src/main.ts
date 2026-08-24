import { Plugin, Notice, Modal } from "obsidian";
import { MediaImporterSettings, DEFAULT_SETTINGS } from "./settings";
import { MediaImporterSettingTab } from "./settings-tab";
import { runImport, ImporterDeps } from "./importer";
import { buildBackendFromSettings } from "./storage/factory";
import {
  ObsidianVaultAdapter,
  ObsidianFetchRequester,
  createSecretStore,
  SafeStorageSecretStore,
} from "./obsidian-deps";
import { DryRunAccumulator, ProgressReporter } from "./progress";
import { RunReport } from "./types";
import { urlBasename } from "./url";
import { wipeBackend, migrateBackend, WipeReport, MigrateReport } from "./ops";
import { Backend } from "./storage/backend";
import { walkVault, ScannerConfig } from "./scanner";
import { SecretStore } from "./secret-store";
import {
  Secrets,
  DEFAULT_SECRETS,
  loadSecrets,
  migratePlaintextSecrets,
  resolveBackendConfig,
  BackendConfig,
} from "./secrets";

const SECRETS_DATA_KEY = "__secrets__";

export default class MediaImporterPlugin extends Plugin {
  settings!: MediaImporterSettings;
  private secretStore!: SecretStore;
  /**
   * Display-only cache of the resolved secrets. Refreshed from
   * {@link secretStore} on load, after `setSecret`, and when the settings tab
   * requests `loadSecretsForDisplay`. Backend-building methods do NOT read
   * this — they call `resolveBackendConfig()` which always loads fresh from
   * the store to avoid race conditions with in-flight `setSecret` calls.
   */
  private secrets: Secrets = { ...DEFAULT_SECRETS };

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new MediaImporterSettingTab(this.app, this));

    this.addCommand({
      id: "import-remote-media",
      name: "Import remote media",
      callback: () => { void this.run(false); },
    });

    this.addCommand({
      id: "import-remote-media-dry-run",
      name: "Import remote media (dry run)",
      callback: () => { void this.run(true); },
    });
  }

  async loadSettings() {
    const raw: Record<string, unknown> = (await this.loadData() as Record<string, unknown> | null) ?? {};
    const persistedSecrets = extractSecretsBag(raw);
    this.secretStore = await createSecretStore(this.app, persistedSecrets);

    // One-shot migration of any pre-1.0.0 plaintext credentials.
    const { data } = await migratePlaintextSecrets(raw, this.secretStore);

    this.settings = mergeSettings(data);
    this.secrets = await loadSecrets(this.secretStore);

    // Persist the normalised state: clean data.json with secrets stripped,
    // plus refreshed __secrets__ bag when using SafeStorageSecretStore.
    await this.persistRaw(this.dataToPersist());
  }

  async saveSettings() {
    await this.persistRaw(this.dataToPersist());
  }

  async setSecret(id: string, value: string | null): Promise<void> {
    await this.secretStore.set(id, value);
    this.secrets = await loadSecrets(this.secretStore);
    await this.persistRaw(this.dataToPersist());
  }

  async loadSecretsForDisplay(): Promise<Secrets> {
    this.secrets = await loadSecrets(this.secretStore);
    return this.secrets;
  }

  /**
   * Resolve non-secret settings (with the attachment-folder fallback for the
   * local backend) plus the current secrets into a {@link BackendConfig}.
   * Always reads fresh from the secret store so a just-typed password is
   * visible even before the async `setSecret` callback has updated the cache.
   */
  private async resolveBackendConfig(): Promise<BackendConfig> {
    const secrets = await loadSecrets(this.secretStore);
    this.secrets = secrets;
    return resolveBackendConfig(this.resolveSettings(), secrets);
  }

  private dataToPersist(): Record<string, unknown> {
    const data: Record<string, unknown> = { ...this.settings as unknown as Record<string, unknown> };
    delete data[SECRETS_DATA_KEY];
    if (this.secretStore instanceof SafeStorageSecretStore) {
      data[SECRETS_DATA_KEY] = this.secretStore.snapshot();
    }
    return data;
  }

  private async persistRaw(data: Record<string, unknown>): Promise<void> {
    await this.saveData(data);
  }

  async testActiveBackend(): Promise<void> {
    const vault = this.makeVault();
    const backend = buildBackendFromSettings(this.resolveSettings(), await this.resolveBackendConfig(), vault);
    await backend.ping();
  }

  private makeVault(): ObsidianVaultAdapter {
    return new ObsidianVaultAdapter(this.app.vault, () => (this.app.vault as unknown as { getConfig?: (k: string) => string })?.getConfig?.("attachmentFolderPath") ?? "");
  }

  async wipeActiveBackend(): Promise<WipeReport> {
    const vault = this.makeVault();
    const backend = buildBackendFromSettings(this.resolveSettings(), await this.resolveBackendConfig(), vault);
    return await wipeBackend({ vault, backend }, this.settings);
  }

  async migrateActiveBackend(dest: Backend): Promise<MigrateReport> {
    const vault = this.makeVault();
    const source = buildBackendFromSettings(this.resolveSettings(), await this.resolveBackendConfig(), vault);
    return await migrateBackend({ vault, source, dest }, this.settings);
  }

  async collectWipeTargets(): Promise<string[]> {
    const vault = this.makeVault();
    const backend = buildBackendFromSettings(this.resolveSettings(), await this.resolveBackendConfig(), vault);
    const scannerCfg: ScannerConfig = { ...this.settings.detectors };
    const refs = await walkVault(vault, this.settings.scanPaths, scannerCfg);
    return [...new Set(refs.filter(r => backend.selfProduced(r.url)).map(r => r.url))];
  }

  private async run(dryRun: boolean) {
    const vault = this.makeVault();
    const fetch = new ObsidianFetchRequester();
    const backend = buildBackendFromSettings(this.resolveSettings(), await this.resolveBackendConfig(), vault);

    const deps: ImporterDeps = {
      vault,
      backend,
      fetch,
      head: fetch,
    };

    let notice: Notice | null = null;
    let lastUpdate = 0;
    const liveProgress: ProgressReporter = {
      start(_total: number) { notice = new Notice("Media import: starting…", 0); },
      update(done: number, current: string) {
        const now = Date.now();
        if (now - lastUpdate < 100) return;
        lastUpdate = now;
        notice?.setMessage(`Media import: ${done} — ${urlBasename(current)}`);
      },
      reportDropped() {},
      reportFailed() {},
      reportWouldDownload() {},
      reportWouldRewrite() {},
      reportDownloaded() {},
      reportRewritten() {},
      finish(r: RunReport) {
        notice?.setMessage(`Media import: done — ${r.downloaded} downloaded, ${r.dropped.length} dropped, ${r.failed.length} failed`);
        window.setTimeout(() => notice?.hide(), 5000);
      },
    };

    const progress: ProgressReporter = dryRun ? new DryRunAccumulator() : liveProgress;

    try {
      const report = await runImport(deps, this.settings, { dryRun }, progress);
      if (dryRun) {
        this.showDryRunModal(progress as DryRunAccumulator);
      } else {
        new Notice(`Imported ${report.downloaded} media (${report.failed.length} failed)`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      new Notice(`Media import failed: ${msg}`);
    }
  }

  private resolveSettings(): MediaImporterSettings {
    const s = this.settings;
    if (s.activeBackend === "local" && s.local.folder == null) {
      const folder = (this.app.vault as unknown as { getConfig: (k: string) => string })?.getConfig("attachmentFolderPath") ?? "";
      return { ...s, local: { folder } };
    }
    return s;
  }

  private showDryRunModal(acc: DryRunAccumulator) {
    const modal = new Modal(this.app);
    modal.titleEl.setText("Media import — dry run preview");
    const body = modal.contentEl.createDiv();
    const section = (title: string, count: number) => {
      const h = body.createEl("h3");
      h.setText(`${title} (${count})`);
    };
    section("Would download", acc.wouldDownload.length);
    for (const w of acc.wouldDownload) body.createDiv().setText(`${w.notePath} → ${w.dest}  (${w.ref.url})`);
    section("Would rewrite", acc.wouldRewrite.length);
    for (const w of acc.wouldRewrite) body.createDiv().setText(`${w.notePath}: ${w.ref.url} → ${w.newUrl}`);
    section("Dropped", acc.dropped.length);
    for (const d of acc.dropped) body.createDiv().setText(`${d.ref.url} — ${d.reason}`);
    section("Failed", acc.failed.length);
    for (const f of acc.failed) body.createDiv().setText(`${f.ref.url} — ${f.error}`);
    modal.open();
  }
}

/**
 * Extract the `__secrets__` bag from raw data.json content. Only present
 * when a previous run used the `SafeStorageSecretStore` fallback; absent
 * when using Obsidian's native `SecretStorage`.
 */
function extractSecretsBag(raw: Record<string, unknown>): Record<string, string> | null {
  const bag = raw[SECRETS_DATA_KEY];
  if (bag && typeof bag === "object" && !Array.isArray(bag)) {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(bag as Record<string, unknown>)) {
      // Skip the __encrypted sentinel — it's metadata, not a secret.
      if (k === "__encrypted") continue;
      if (typeof v === "string") out[k] = v;
    }
    return out;
  }
  return null;
}

/**
 * Merge raw data.json content with {@link DEFAULT_SETTINGS}, dropping any
 * legacy secret fields and the `__secrets__` ciphertext bag so they don't
 * leak back into the in-memory settings object.
 */
function mergeSettings(raw: Record<string, unknown>): MediaImporterSettings {
  const merged = Object.assign({}, DEFAULT_SETTINGS, raw) as MediaImporterSettings & {
    webdav?: { password?: string };
    s3?: { secretAccessKey?: string };
    __secrets__?: unknown;
  };
  if (merged.webdav && typeof merged.webdav.password === "string") {
    merged.webdav = { baseURL: merged.webdav.baseURL, username: merged.webdav.username, avoidOverwrite: merged.webdav.avoidOverwrite };
  }
  if (merged.s3 && typeof merged.s3.secretAccessKey === "string") {
    merged.s3 = { endpoint: merged.s3.endpoint, region: merged.s3.region, bucket: merged.s3.bucket, accessKeyId: merged.s3.accessKeyId, keyPrefix: merged.s3.keyPrefix, publicUrlTemplate: merged.s3.publicUrlTemplate };
  }
  delete merged.__secrets__;
  return merged;
}