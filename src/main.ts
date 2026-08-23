import { Plugin, Notice, Modal } from "obsidian";
import { MediaImporterSettings, DEFAULT_SETTINGS } from "./settings";
import { MediaImporterSettingTab } from "./settings-tab";
import { runImport, ImporterDeps } from "./importer";
import { buildBackendFromSettings } from "./storage/factory";
import {
  ObsidianVaultAdapter,
  ObsidianFetchRequester,
} from "./obsidian-deps";
import { DryRunAccumulator, ProgressReporter } from "./progress";
import { RunReport } from "./types";
import { urlBasename } from "./url";
import { wipeBackend, migrateBackend, WipeReport, MigrateReport } from "./ops";
import { Backend } from "./storage/backend";
import { walkVault, ScannerConfig } from "./scanner";

export default class MediaImporterPlugin extends Plugin {
  settings!: MediaImporterSettings;

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
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  private makeVault(): ObsidianVaultAdapter {
    return new ObsidianVaultAdapter(this.app.vault, () => (this.app.vault as unknown as { getConfig?: (k: string) => string })?.getConfig?.("attachmentFolderPath") ?? "");
  }

  async testActiveBackend(): Promise<void> {
    const vault = this.makeVault();
    const backend = buildBackendFromSettings(this.resolveSettings(), vault);
    await backend.ping();
  }

  async wipeActiveBackend(): Promise<WipeReport> {
    const vault = this.makeVault();
    const backend = buildBackendFromSettings(this.resolveSettings(), vault);
    return await wipeBackend({ vault, backend }, this.settings);
  }

  async migrateActiveBackend(dest: Backend): Promise<MigrateReport> {
    const vault = this.makeVault();
    const source = buildBackendFromSettings(this.resolveSettings(), vault);
    return await migrateBackend({ vault, source, dest }, this.settings);
  }

  async collectWipeTargets(): Promise<string[]> {
    const vault = this.makeVault();
    const backend = buildBackendFromSettings(this.resolveSettings(), vault);
    const scannerCfg: ScannerConfig = { ...this.settings.detectors };
    const refs = await walkVault(vault, this.settings.scanPaths, scannerCfg);
    return [...new Set(refs.filter(r => backend.selfProduced(r.url)).map(r => r.url))];
  }

  private async run(dryRun: boolean) {
    const vault = this.makeVault();
    const fetch = new ObsidianFetchRequester();
    const backend = buildBackendFromSettings(this.resolveSettings(), vault);

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
        setTimeout(() => notice?.hide(), 5000);
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
    const body = modal.contentEl.createEl("div");
    const section = (title: string, count: number) => {
      const h = body.createEl("h3");
      h.setText(`${title} (${count})`);
    };
    section("Would download", acc.wouldDownload.length);
    for (const w of acc.wouldDownload) body.createEl("div").setText(`${w.notePath} → ${w.dest}  (${w.ref.url})`);
    section("Would rewrite", acc.wouldRewrite.length);
    for (const w of acc.wouldRewrite) body.createEl("div").setText(`${w.notePath}: ${w.ref.url} → ${w.newUrl}`);
    section("Dropped", acc.dropped.length);
    for (const d of acc.dropped) body.createEl("div").setText(`${d.ref.url} — ${d.reason}`);
    section("Failed", acc.failed.length);
    for (const f of acc.failed) body.createEl("div").setText(`${f.ref.url} — ${f.error}`);
    modal.open();
  }
}