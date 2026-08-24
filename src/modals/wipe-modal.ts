import { App, Modal, ButtonComponent, Setting, Notice } from "obsidian";
import MediaImporterPlugin from "../main";

export class WipeConfirmModal extends Modal {
  private countdownInterval: ReturnType<Window["setInterval"]> | null = null;

  constructor(app: App, private plugin: MediaImporterPlugin, private targets: string[]) {
    super(app);
  }

  onOpen(): void {
    const { contentEl, titleEl } = this;
    titleEl.setText("Wipe remote data");

    const warning = contentEl.createEl("p", { cls: "media-importer-wipe-warning" });
    warning.setText(`This will permanently delete ${this.targets.length} file(s) from the active backend. This action is not reversible.`);

    const list = contentEl.createDiv({ cls: "media-importer-wipe-list" });
    for (const url of this.targets) {
      list.createDiv().setText(url);
    }

    const note = contentEl.createEl("p", { cls: "media-importer-wipe-note" });
    note.setText("Note: your notes will keep their (now-broken) links. This only deletes backend files.");

    let secondsLeft = 3;

    new Setting(contentEl)
      .addButton((b: ButtonComponent) => {
        b.setButtonText("Cancel").onClick(() => this.close());
      })
      .addButton((b: ButtonComponent) => {
        b.setButtonText(`Delete ${this.targets.length} files (${secondsLeft})`)
          .setClass("mod-warning")
          .setDisabled(true);
        const interval = window.setInterval(() => {
          secondsLeft--;
          if (secondsLeft <= 0) {
            window.clearInterval(interval);
            this.countdownInterval = null;
            b.setButtonText(`Delete ${this.targets.length} files`).setDisabled(false);
          } else {
            b.setButtonText(`Delete ${this.targets.length} files (${secondsLeft})`);
          }
        }, 1000);
        this.countdownInterval = interval;
        b.onClick(async () => {
          if (secondsLeft > 0) return;
          try {
            const report = await this.plugin.wipeActiveBackend();
            new Notice(`Wiped ${report.deleted} files (${report.failed.length} failed)`);
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            new Notice(`Wipe failed: ${msg}`);
          }
          this.close();
        });
      });
  }

  onClose(): void {
    if (this.countdownInterval !== null) window.clearInterval(this.countdownInterval);
    this.contentEl.empty();
  }
}