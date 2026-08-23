import { App, Modal, ButtonComponent, Setting, Notice } from "obsidian";
import MediaImporterPlugin from "../main";

export class WipeConfirmModal extends Modal {
  constructor(app: App, private plugin: MediaImporterPlugin, private targets: string[]) {
    super(app);
  }

  onOpen(): void {
    const { contentEl, titleEl } = this;
    titleEl.setText("Wipe remote data");

    const warning = contentEl.createEl("p");
    warning.style.color = "var(--text-error, #f44336)";
    warning.style.fontWeight = "bold";
    warning.setText(`This will permanently delete ${this.targets.length} file(s) from the active backend. This action is not reversible.`);

    const list = contentEl.createEl("div");
    list.style.maxHeight = "200px";
    list.style.overflowY = "auto";
    list.style.margin = "1em 0";
    for (const url of this.targets) {
      list.createEl("div").setText(url);
    }

    const note = contentEl.createEl("p");
    note.style.color = "var(--text-muted)";
    note.style.fontStyle = "italic";
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
        const interval = setInterval(() => {
          secondsLeft--;
          if (secondsLeft <= 0) {
            clearInterval(interval);
            b.setButtonText(`Delete ${this.targets.length} files`).setDisabled(false);
          } else {
            b.setButtonText(`Delete ${this.targets.length} files (${secondsLeft})`);
          }
        }, 1000);
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
    this.contentEl.empty();
  }
}