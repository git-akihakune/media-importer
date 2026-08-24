import { App, Modal, Setting, DropdownComponent, TextComponent, ButtonComponent, Notice } from "obsidian";
import MediaImporterPlugin from "../main";
import { MediaImporterSettings, DEFAULT_SETTINGS } from "../settings";
import { buildBackendFromSettings } from "../storage/factory";
import { ObsidianVaultAdapter } from "../obsidian-deps";
import { InMemorySecretStore } from "../secret-store";
import { Secrets, DEFAULT_SECRETS, SECRET_KEYS, resolveBackendConfig } from "../secrets";

export class MigrateModal extends Modal {
  private destType: "local" | "webdav" | "s3" = "local";
  private destSettings: MediaImporterSettings = { ...DEFAULT_SETTINGS };
  private destFieldsEl!: HTMLElement;
  private destSecretStore = new InMemorySecretStore();
  private destSecrets: Secrets = { ...DEFAULT_SECRETS };

  constructor(app: App, private plugin: MediaImporterPlugin) {
    super(app);
  }

  onOpen(): void {
    const { contentEl, titleEl } = this;
    titleEl.setText("Migrate to another backend");

    contentEl.createEl("p").setText("Copy files from the active backend to a destination backend and rewrite notes to point at the new locations. Source files are left intact.");

    new Setting(contentEl)
      .setName("Destination backend")
      .addDropdown((d: DropdownComponent) => {
        d.addOption("local", "Local vault")
          .addOption("webdav", "WebDAV")
          .addOption("s3", "S3-compatible")
          .setValue("local")
          .onChange((v: string) => {
            this.destType = v as typeof this.destType;
            this.destSettings.activeBackend = this.destType;
            this.renderDestFields();
          });
      });

    this.destFieldsEl = contentEl.createEl("div");
    this.renderDestFields();

    new Setting(contentEl)
      .addButton((b: ButtonComponent) => {
        b.setButtonText("Cancel").onClick(() => this.close());
      })
      .addButton((b: ButtonComponent) => {
        b.setButtonText("Migrate").setClass("mod-cta").onClick(async () => {
          try {
            const cfg = resolveBackendConfig(this.destSettings, this.destSecrets);
            const dest = buildBackendFromSettings(this.destSettings, cfg, new ObsidianVaultAdapter(this.app.vault, () => ""));
            const report = await this.plugin.migrateActiveBackend(dest);
            new Notice(`Migrated ${report.migrated} files, rewrote ${report.rewritten} (${report.failed.length} failed)`);
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            new Notice(`Migration failed: ${msg}`);
          }
          this.close();
        });
      });
  }

  private renderDestFields(): void {
    this.destFieldsEl.empty();
    const s = this.destSettings;
    if (this.destType === "local") {
      new Setting(this.destFieldsEl).setName("Local folder").addText((t: TextComponent) => {
        t.setValue(s.local.folder ?? "").onChange((v: string) => { s.local.folder = v.trim() || null; });
      });
    } else if (this.destType === "webdav") {
      new Setting(this.destFieldsEl).setName("WebDAV base URL").addText((t: TextComponent) => t.onChange((v: string) => { s.webdav.baseURL = v; }));
      new Setting(this.destFieldsEl).setName("Username").addText((t: TextComponent) => t.onChange((v: string) => { s.webdav.username = v; }));
      new Setting(this.destFieldsEl).setName("Password").addText((t: TextComponent) => {
        t.inputEl.type = "password";
        t.onChange(async (v: string) => {
          await this.destSecretStore.set(SECRET_KEYS.webdavPassword, v);
          this.destSecrets.webdavPassword = v;
        });
      });
    } else if (this.destType === "s3") {
      new Setting(this.destFieldsEl).setName("Endpoint").addText((t: TextComponent) => t.onChange((v: string) => { s.s3.endpoint = v; }));
      new Setting(this.destFieldsEl).setName("Region").addText((t: TextComponent) => t.onChange((v: string) => { s.s3.region = v; }));
      new Setting(this.destFieldsEl).setName("Bucket").addText((t: TextComponent) => t.onChange((v: string) => { s.s3.bucket = v; }));
      new Setting(this.destFieldsEl).setName("Access key ID").addText((t: TextComponent) => t.onChange((v: string) => { s.s3.accessKeyId = v; }));
      new Setting(this.destFieldsEl).setName("Secret access key").addText((t: TextComponent) => {
        t.inputEl.type = "password";
        t.onChange(async (v: string) => {
          await this.destSecretStore.set(SECRET_KEYS.s3SecretAccessKey, v);
          this.destSecrets.s3SecretAccessKey = v;
        });
      });
      new Setting(this.destFieldsEl).setName("Key prefix").addText((t: TextComponent) => t.onChange((v: string) => { s.s3.keyPrefix = v; }));
      new Setting(this.destFieldsEl).setName("Public URL template").addText((t: TextComponent) => t.onChange((v: string) => { s.s3.publicUrlTemplate = v; }));
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}