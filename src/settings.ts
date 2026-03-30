/**
 * Settings tab for CrabsHQ Memory Sync plugin.
 */
import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import { CrabsHQApi } from "./api";
import type CrabsHQPlugin from "./main";

export interface CrabsHQSettings {
  bridgeUrl: string;
  apiKey: string;
  memoriesFolder: string;
  syncInterval: number; // 0 = manual, otherwise minutes
  autoSyncOnStartup: boolean;
}

export const DEFAULT_SETTINGS: CrabsHQSettings = {
  bridgeUrl: "",
  apiKey: "",
  memoriesFolder: "CrabsHQ/Memories",
  syncInterval: 0,
  autoSyncOnStartup: true,
};

const SYNC_INTERVAL_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "Manual only" },
  { value: 5, label: "Every 5 minutes" },
  { value: 15, label: "Every 15 minutes" },
  { value: 30, label: "Every 30 minutes" },
  { value: 60, label: "Every 1 hour" },
];

export class CrabsHQSettingTab extends PluginSettingTab {
  plugin: CrabsHQPlugin;

  constructor(app: App, plugin: CrabsHQPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "CrabsHQ Memory Sync" });

    // ── Connection ──────────────────────────────────────────────────────────

    containerEl.createEl("h3", { text: "Connection" });

    new Setting(containerEl)
      .setName("Bridge URL")
      .setDesc(
        "Base URL of your CrabsHQ bridge (e.g. https://org-xyz.crabhq.com or http://localhost:3002)"
      )
      .addText((text) =>
        text
          .setPlaceholder("https://org-xyz.crabhq.com")
          .setValue(this.plugin.settings.bridgeUrl)
          .onChange(async (value) => {
            this.plugin.settings.bridgeUrl = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("API Key")
      .setDesc("Your CrabsHQ API key (starts with chq_)")
      .addText((text) => {
        text
          .setPlaceholder("chq_xxxxx")
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.apiKey = value.trim();
            await this.plugin.saveSettings();
          });
        text.inputEl.type = "password";
        return text;
      })
      .addButton((btn) =>
        btn
          .setButtonText("Generate Key")
          .setTooltip("Generate a new API key using your Bridge URL")
          .onClick(async () => {
            const url = this.plugin.settings.bridgeUrl;
            if (!url) {
              new Notice("Please enter your Bridge URL first.");
              return;
            }
            btn.setDisabled(true);
            btn.setButtonText("Generating...");
            try {
              const key = await CrabsHQApi.generateApiKey(url, "obsidian-sync");
              this.plugin.settings.apiKey = key;
              await this.plugin.saveSettings();
              new Notice(`✅ API key generated and saved!`);
              // Refresh the tab to show the new value
              this.display();
            } catch (err) {
              new Notice(`❌ Failed to generate key: ${err.message}`);
            } finally {
              btn.setDisabled(false);
              btn.setButtonText("Generate Key");
            }
          })
      );

    // ── Sync ────────────────────────────────────────────────────────────────

    containerEl.createEl("h3", { text: "Sync" });

    new Setting(containerEl)
      .setName("Memories folder")
      .setDesc("Vault folder where memory files will be stored")
      .addText((text) =>
        text
          .setPlaceholder("CrabsHQ/Memories")
          .setValue(this.plugin.settings.memoriesFolder)
          .onChange(async (value) => {
            this.plugin.settings.memoriesFolder = value.trim() || "CrabsHQ/Memories";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Sync interval")
      .setDesc("How often to automatically sync with the server")
      .addDropdown((drop) => {
        for (const opt of SYNC_INTERVAL_OPTIONS) {
          drop.addOption(String(opt.value), opt.label);
        }
        drop.setValue(String(this.plugin.settings.syncInterval));
        drop.onChange(async (value) => {
          this.plugin.settings.syncInterval = parseInt(value, 10);
          await this.plugin.saveSettings();
          this.plugin.rescheduleInterval();
        });
        return drop;
      });

    new Setting(containerEl)
      .setName("Auto-sync on startup")
      .setDesc("Automatically sync when Obsidian starts")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoSyncOnStartup)
          .onChange(async (value) => {
            this.plugin.settings.autoSyncOnStartup = value;
            await this.plugin.saveSettings();
          })
      );

    // ── Conflicts ───────────────────────────────────────────────────────────

    const conflictCount = Object.keys(this.plugin.syncState.conflicts).length;
    if (conflictCount > 0) {
      containerEl.createEl("h3", { text: "⚠️ Conflicts" });
      const conflictDesc = containerEl.createEl("p", {
        text: `You have ${conflictCount} unresolved conflict${conflictCount > 1 ? "s" : ""}. Use the commands below to resolve them, or pull/push to force a direction.`,
        cls: "crabhq-conflict-notice",
      });
      conflictDesc.style.color = "var(--text-warning)";

      for (const [memoryId, conflictId] of Object.entries(
        this.plugin.syncState.conflicts
      )) {
        new Setting(containerEl)
          .setName(`Conflict: ${memoryId}`)
          .setDesc(`Conflict ID: ${conflictId}`)
          .addButton((btn) =>
            btn
              .setButtonText("Use Local")
              .setWarning()
              .onClick(async () => {
                await this.plugin.resolveConflict(memoryId, conflictId, "local");
                this.display();
              })
          )
          .addButton((btn) =>
            btn
              .setButtonText("Use Server")
              .onClick(async () => {
                await this.plugin.resolveConflict(memoryId, conflictId, "server");
                this.display();
              })
          );
      }
    }

    // ── Status ──────────────────────────────────────────────────────────────

    containerEl.createEl("h3", { text: "Status" });

    const statusEl = containerEl.createEl("p", {
      text: `Last sync: ${
        this.plugin.syncState.lastSyncTimestamp > 0
          ? new Date(this.plugin.syncState.lastSyncTimestamp).toLocaleString()
          : "Never"
      }`,
    });
    statusEl.style.color = "var(--text-muted)";

    new Setting(containerEl)
      .setName("Sync now")
      .setDesc("Trigger a manual sync immediately")
      .addButton((btn) =>
        btn
          .setButtonText("Sync now")
          .setCta()
          .onClick(async () => {
            btn.setDisabled(true);
            btn.setButtonText("Syncing...");
            try {
              await this.plugin.triggerSync();
              new Notice("✅ CrabsHQ sync complete");
              this.display();
            } catch (err) {
              new Notice(`❌ Sync failed: ${err.message}`);
            } finally {
              btn.setDisabled(false);
              btn.setButtonText("Sync now");
            }
          })
      );
  }
}
