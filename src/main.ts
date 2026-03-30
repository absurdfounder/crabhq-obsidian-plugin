/**
 * CrabsHQ Memory Sync — Obsidian Plugin
 * Main entry point: commands, ribbon, status bar, file watchers, intervals.
 */
import { Notice, Plugin, TFile, addIcon, normalizePath } from "obsidian";
import { CrabsHQSettings, CrabsHQSettingTab, DEFAULT_SETTINGS } from "./settings";
import { CrabsHQApi } from "./api";
import { SyncEngine, SyncState, DEFAULT_SYNC_STATE } from "./sync";

// SVG brain icon (simple outline)
const BRAIN_ICON = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5C10.5 3.5 8 3 6.5 4.5S4.5 8 5.5 10c-2 1-2.5 3-1.5 4.5 1 1.5 3 2 4.5 1.5-.5 2 .5 4 2.5 4.5M12 5c1.5-1.5 4-2 5.5-.5S18.5 8 17.5 10c2 1 2.5 3 1.5 4.5-1 1.5-3 2-4.5 1.5.5 2-.5 4-2.5 4.5M12 5v14.5"/></svg>`;

addIcon("crabhq-brain", BRAIN_ICON);

interface PluginData {
  settings: CrabsHQSettings;
  syncState: SyncState;
}

export default class CrabsHQPlugin extends Plugin {
  settings: CrabsHQSettings = { ...DEFAULT_SETTINGS };
  syncState: SyncState = { ...DEFAULT_SYNC_STATE };

  private statusBarEl: HTMLElement | null = null;
  private intervalHandle: number | null = null;
  private syncEngine!: SyncEngine;

  // Debounce file modification events
  private modifyDebounce: Map<string, ReturnType<typeof setTimeout>> = new Map();

  async onload(): Promise<void> {
    await this.loadPluginData();

    // Initialise sync engine
    this.syncEngine = new SyncEngine(
      this.app,
      this.settings,
      this.syncState,
      (msg) => this.setStatus(msg)
    );

    // Status bar
    this.statusBarEl = this.addStatusBarItem();
    this.setStatus(this.syncEngine.buildStatusMessage());

    // Ribbon icon
    this.addRibbonIcon("crabhq-brain", "CrabsHQ: Sync memories", async () => {
      await this.triggerSync();
    });

    // Commands
    this.addCommand({
      id: "sync-now",
      name: "Sync memories now",
      callback: async () => {
        try {
          await this.triggerSync();
          new Notice("✅ CrabsHQ sync complete");
        } catch (err) {
          new Notice(`❌ CrabsHQ sync failed: ${(err as Error).message}`);
        }
      },
    });

    this.addCommand({
      id: "pull-all",
      name: "Pull all memories",
      callback: async () => {
        this.setStatus("syncing...");
        try {
          const count = await this.syncEngine.pullAll();
          await this.savePluginData();
          const msg = `✅ Pulled ${count} memories from CrabsHQ`;
          new Notice(msg);
          this.setStatus(this.syncEngine.buildStatusMessage());
        } catch (err) {
          new Notice(`❌ Pull failed: ${(err as Error).message}`);
          this.setStatus(this.syncEngine.buildStatusMessage());
        }
      },
    });

    this.addCommand({
      id: "push-all",
      name: "Push all memories",
      callback: async () => {
        this.setStatus("syncing...");
        try {
          const count = await this.syncEngine.pushAll();
          await this.savePluginData();
          new Notice(`✅ Pushed ${count} memories to CrabsHQ`);
          this.setStatus(this.syncEngine.buildStatusMessage());
        } catch (err) {
          new Notice(`❌ Push failed: ${(err as Error).message}`);
          this.setStatus(this.syncEngine.buildStatusMessage());
        }
      },
    });

    this.addCommand({
      id: "generate-memory-md",
      name: "Generate MEMORY.md",
      callback: async () => {
        try {
          await this.syncEngine.generateMemoryMd();
          new Notice("✅ MEMORY.md generated");
        } catch (err) {
          new Notice(`❌ Failed to generate MEMORY.md: ${(err as Error).message}`);
        }
      },
    });

    this.addCommand({
      id: "dump-vault-to-vps",
      name: "Upload vault notes to VPS (for memory extraction)",
      callback: async () => {
        if (!this.settings.bridgeUrl || !this.settings.apiKey) {
          new Notice("⚠️ Configure Bridge URL and API Key first.");
          return;
        }
        this.setStatus("uploading vault...");
        try {
          const api = new CrabsHQApi({ bridgeUrl: this.settings.bridgeUrl, apiKey: this.settings.apiKey });
          const mdFiles = this.app.vault.getMarkdownFiles();
          // Skip plugin config folders and the memories sync folder
          const memoriesFolder = normalizePath(this.settings.memoriesFolder);
          const filesToUpload: { path: string; content: string; mtime: number }[] = [];
          for (const file of mdFiles) {
            if (file.path.startsWith('.obsidian/')) continue;
            if (file.path.startsWith(memoriesFolder + '/')) continue;
            const content = await this.app.vault.cachedRead(file);
            filesToUpload.push({ path: file.path, content, mtime: file.stat.mtime });
          }
          // Upload in batches of 50
          let totalUploaded = 0;
          for (let i = 0; i < filesToUpload.length; i += 50) {
            const batch = filesToUpload.slice(i, i + 50);
            const result = await api.uploadVaultFiles(batch);
            totalUploaded += result.uploaded;
            this.setStatus(`uploading... ${Math.min(i + 50, filesToUpload.length)}/${filesToUpload.length}`);
          }
          new Notice(`✅ Uploaded ${totalUploaded} vault notes to VPS`);
          this.setStatus(this.syncEngine.buildStatusMessage());
        } catch (err) {
          new Notice(`❌ Vault upload failed: ${(err as Error).message}`);
          this.setStatus(this.syncEngine.buildStatusMessage());
        }
      },
    });

    // Settings tab
    this.addSettingTab(new CrabsHQSettingTab(this.app, this));

    // File watchers
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (!(file instanceof TFile)) return;
        const folder = normalizePath(this.settings.memoriesFolder);
        if (!file.path.startsWith(folder + "/")) return;
        if (file.extension !== "md") return;

        // Debounce: wait 2s after last modification
        const existing = this.modifyDebounce.get(file.path);
        if (existing) clearTimeout(existing);
        const handle = setTimeout(async () => {
          this.modifyDebounce.delete(file.path);
          try {
            await this.syncEngine.pushFile(file);
            await this.savePluginData();
            this.setStatus(this.syncEngine.buildStatusMessage());
          } catch (err) {
            console.error("CrabsHQ: push on modify failed", err);
          }
        }, 2000);
        this.modifyDebounce.set(file.path, handle);
      })
    );

    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (!(file instanceof TFile)) return;
        const folder = normalizePath(this.settings.memoriesFolder);
        if (!file.path.startsWith(folder + "/")) return;
        if (file.extension !== "md") return;

        // Small delay to let the file content settle
        setTimeout(async () => {
          try {
            await this.syncEngine.pushFile(file);
            await this.savePluginData();
            this.setStatus(this.syncEngine.buildStatusMessage());
          } catch (err) {
            console.error("CrabsHQ: push on create failed", err);
          }
        }, 1000);
      })
    );

    this.registerEvent(
      this.app.vault.on("delete", async (file) => {
        if (!(file instanceof TFile)) return;
        try {
          await this.syncEngine.handleDelete(file);
          await this.savePluginData();
          this.setStatus(this.syncEngine.buildStatusMessage());
        } catch (err) {
          console.error("CrabsHQ: delete sync failed", err);
        }
      })
    );

    // Auto-sync on startup
    if (this.settings.autoSyncOnStartup && this.settings.bridgeUrl && this.settings.apiKey) {
      // Delay to let vault finish loading
      setTimeout(async () => {
        try {
          await this.triggerSync();
        } catch (err) {
          console.error("CrabsHQ: startup sync failed", err);
        }
      }, 3000);
    }

    // Schedule interval sync
    this.rescheduleInterval();

    console.log("CrabsHQ Memory Sync loaded");
  }

  async onunload(): Promise<void> {
    if (this.intervalHandle !== null) {
      window.clearInterval(this.intervalHandle);
    }
    // Clear all debounce timers
    for (const handle of this.modifyDebounce.values()) {
      clearTimeout(handle);
    }
    await this.savePluginData();
    console.log("CrabsHQ Memory Sync unloaded");
  }

  /** Trigger a full sync and persist state */
  async triggerSync(): Promise<void> {
    if (!this.settings.bridgeUrl || !this.settings.apiKey) {
      new Notice("⚠️ CrabsHQ: Please configure Bridge URL and API Key in settings.");
      return;
    }
    this.setStatus("syncing...");
    try {
      const result = await this.syncEngine.sync();
      await this.savePluginData();
      const msg = this.syncEngine.buildStatusMessage();
      this.setStatus(msg);
      console.log(`CrabsHQ sync: +${result.updated} updated, -${result.deleted} deleted`);
    } catch (err) {
      this.setStatus("sync error");
      throw err;
    }
  }

  /** Resolve a conflict */
  async resolveConflict(
    memoryId: string,
    conflictId: string,
    resolution: "local" | "server" | "merged"
  ): Promise<void> {
    const api = new CrabsHQApi({
      bridgeUrl: this.settings.bridgeUrl,
      apiKey: this.settings.apiKey,
    });

    let resolvedVersion = {};
    if (resolution === "local") {
      // Re-read local file and use as resolved
      const path = normalizePath(`${this.settings.memoriesFolder}/${memoryId}.md`);
      const file = this.app.vault.getAbstractFileByPath(path);
      if (file instanceof TFile) {
        const content = await this.app.vault.read(file);
        const { frontmatter, title, summary, details } = await import("./utils").then(
          (m) => m.markdownToMemory(content)
        );
        resolvedVersion = { id: memoryId, title, summary, details, ...frontmatter };
      }
    } else if (resolution === "server") {
      // Pull server version and overwrite local
      const memory = await api.getMemory(memoryId);
      const path = normalizePath(`${this.settings.memoriesFolder}/${memoryId}.md`);
      const file = this.app.vault.getAbstractFileByPath(path);
      const { memoryToMarkdown } = await import("./utils");
      const content = memoryToMarkdown(memory, Date.now());
      if (file instanceof TFile) {
        await this.app.vault.modify(file, content);
      }
      resolvedVersion = memory;
    }

    await api.resolveConflict(conflictId, resolution, resolvedVersion);
    delete this.syncState.conflicts[memoryId];
    await this.savePluginData();
    this.setStatus(this.syncEngine.buildStatusMessage());
    new Notice(`✅ Conflict resolved (${resolution})`);
  }

  /** Reschedule the auto-sync interval based on current settings */
  rescheduleInterval(): void {
    if (this.intervalHandle !== null) {
      window.clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    const minutes = this.settings.syncInterval;
    if (minutes > 0) {
      this.intervalHandle = window.setInterval(async () => {
        if (this.settings.bridgeUrl && this.settings.apiKey) {
          try {
            await this.triggerSync();
          } catch (err) {
            console.error("CrabsHQ: interval sync failed", err);
          }
        }
      }, minutes * 60 * 1000);
    }
  }

  private setStatus(msg: string): void {
    if (this.statusBarEl) {
      this.statusBarEl.setText(`🧠 CrabsHQ: ${msg}`);
    }
  }

  async saveSettings(): Promise<void> {
    this.syncEngine.updateSettings(this.settings);
    await this.savePluginData();
  }

  private async loadPluginData(): Promise<void> {
    const data = (await this.loadData()) as Partial<PluginData> | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data?.settings ?? {});
    this.syncState = Object.assign({}, DEFAULT_SYNC_STATE, data?.syncState ?? {});
    if (!this.syncState.localMtimes) this.syncState.localMtimes = {};
    if (!this.syncState.conflicts) this.syncState.conflicts = {};
  }

  private async savePluginData(): Promise<void> {
    const data: PluginData = {
      settings: this.settings,
      syncState: this.syncEngine ? this.syncEngine.getState() : this.syncState,
    };
    await this.saveData(data);
  }
}
