import { App, PluginSettingTab, Setting, TextComponent, ToggleComponent, DropdownComponent } from "obsidian";
import MediaImporterPlugin from "./main";
import { MediaImporterSettings } from "./settings";

export class MediaImporterSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: MediaImporterPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    const s = this.plugin.settings;
    containerEl.empty();

    // ---- Scanning ----
    new Setting(containerEl).setName("Scanning").setHeading();
    new Setting(containerEl)
      .setName("Scan paths")
      .setDesc("Comma-separated folder paths to scan. Empty = whole vault.")
      .addText((t: TextComponent) =>
        t.setValue(s.scanPaths.join(", ")).onChange(async (v: string) => {
          s.scanPaths = v.split(",").map((p: string) => p.trim()).filter(Boolean);
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl).setName("Detectors").setHeading();
    const toggles: [keyof MediaImporterSettings["detectors"], string][] = [
      ["mdImage", "Markdown ![]() (images)"],
      ["mdAv", "Markdown ![]() (audio/video)"],
      ["wikilink", "Wikilink ![[url]]"],
      ["htmlImg", "HTML <img>"],
      ["htmlAv", "HTML <video>/<audio>/<source>"],
    ];
    for (const [key, name] of toggles) {
      new Setting(containerEl)
        .setName(name)
        .addToggle((t: ToggleComponent) => t.setValue(s.detectors[key]).onChange(async (v: boolean) => {
          s.detectors[key] = v;
          await this.plugin.saveSettings();
        }));
    }

    // ---- Filters ----
    new Setting(containerEl).setName("Filters").setHeading();
    new Setting(containerEl)
      .setName("Allowlist")
      .setDesc("Comma-separated hosts. * = all (default).")
      .addText((t: TextComponent) => t.setValue(s.allowlist.join(", ")).onChange(async (v: string) => {
        s.allowlist = v.split(",").map((p: string) => p.trim()).filter(Boolean);
        await this.plugin.saveSettings();
      }));
    new Setting(containerEl)
      .setName("Denylist")
      .setDesc("Comma-separated hosts to skip. Empty by default.")
      .addText((t: TextComponent) => t.setValue(s.denylist.join(", ")).onChange(async (v: string) => {
        s.denylist = v.split(",").map((p: string) => p.trim()).filter(Boolean);
        await this.plugin.saveSettings();
      }));
    new Setting(containerEl)
      .setName("Size limit (MB)")
      .setDesc("Skip files larger than this. 0 = off.")
      .addText((t: TextComponent) => t.setValue(s.sizeLimitMB ? String(s.sizeLimitMB) : "0").onChange(async (v: string) => {
        const n = Number(v);
        s.sizeLimitMB = n > 0 ? n : null;
        await this.plugin.saveSettings();
      }));

    // ---- Backend ----
    new Setting(containerEl).setName("Backend").setHeading();
    new Setting(containerEl)
      .setName("Active backend")
      .addDropdown((d: DropdownComponent) => {
        d.addOption("local", "Local vault")
          .addOption("webdav", "WebDAV")
          .addOption("s3", "S3-compatible")
          .setValue(s.activeBackend)
          .onChange(async (v: string) => {
            s.activeBackend = v as MediaImporterSettings["activeBackend"];
            await this.plugin.saveSettings();
            this.display();
          });
      });

    if (s.activeBackend === "local") {
      new Setting(containerEl)
        .setName("Local folder")
        .setDesc("Vault folder for stored media. Empty = Obsidian attachment folder.")
        .addText((t: TextComponent) => t.setValue(s.local.folder ?? "").onChange(async (v: string) => {
          s.local.folder = v.trim() || null;
          await this.plugin.saveSettings();
        }));
    } else if (s.activeBackend === "webdav") {
      new Setting(containerEl).setName("WebDAV base URL").addText((t: TextComponent) => t.setValue(s.webdav.baseURL).onChange(async (v: string) => { s.webdav.baseURL = v; await this.plugin.saveSettings(); }));
      new Setting(containerEl).setName("Username").addText((t: TextComponent) => t.setValue(s.webdav.username).onChange(async (v: string) => { s.webdav.username = v; await this.plugin.saveSettings(); }));
      new Setting(containerEl).setName("Password").addText((t: TextComponent) => { t.inputEl.type = "password"; t.setValue(s.webdav.password).onChange(async (v: string) => { s.webdav.password = v; await this.plugin.saveSettings(); }); });
      new Setting(containerEl).setName("Avoid overwrite").addToggle((t: ToggleComponent) => t.setValue(s.webdav.avoidOverwrite).onChange(async (v: boolean) => { s.webdav.avoidOverwrite = v; await this.plugin.saveSettings(); }));
    } else if (s.activeBackend === "s3") {
      new Setting(containerEl).setName("Endpoint").addText((t: TextComponent) => t.setValue(s.s3.endpoint).onChange(async (v: string) => { s.s3.endpoint = v; await this.plugin.saveSettings(); }));
      new Setting(containerEl).setName("Region").addText((t: TextComponent) => t.setValue(s.s3.region).onChange(async (v: string) => { s.s3.region = v; await this.plugin.saveSettings(); }));
      new Setting(containerEl).setName("Bucket").addText((t: TextComponent) => t.setValue(s.s3.bucket).onChange(async (v: string) => { s.s3.bucket = v; await this.plugin.saveSettings(); }));
      new Setting(containerEl).setName("Access key ID").addText((t: TextComponent) => t.setValue(s.s3.accessKeyId).onChange(async (v: string) => { s.s3.accessKeyId = v; await this.plugin.saveSettings(); }));
      new Setting(containerEl).setName("Secret access key").addText((t: TextComponent) => { t.inputEl.type = "password"; t.setValue(s.s3.secretAccessKey).onChange(async (v: string) => { s.s3.secretAccessKey = v; await this.plugin.saveSettings(); }); });
      new Setting(containerEl).setName("Key prefix").addText((t: TextComponent) => t.setValue(s.s3.keyPrefix).onChange(async (v: string) => { s.s3.keyPrefix = v; await this.plugin.saveSettings(); }));
      new Setting(containerEl).setName("Public URL template").setDesc("Use {{key}} as placeholder. Empty = <endpoint>/<bucket>/<key>.").addText((t: TextComponent) => t.setValue(s.s3.publicUrlTemplate).onChange(async (v: string) => { s.s3.publicUrlTemplate = v; await this.plugin.saveSettings(); }));
    }

    // ---- Advanced ----
    new Setting(containerEl).setName("Advanced").setHeading();
    new Setting(containerEl)
      .setName("Request timeout (seconds)")
      .addText((t: TextComponent) => t.setValue(String(s.requestTimeoutSec)).onChange(async (v: string) => {
        s.requestTimeoutSec = Number(v) || 30;
        await this.plugin.saveSettings();
      }));
  }
}