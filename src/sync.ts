/**
 * Sync engine — pull, push, conflict detection.
 */
import { App, Notice, TFile, TFolder, normalizePath } from "obsidian";
import { CrabsHQApi } from "./api";
import { CrabsHQSettings } from "./settings";
import {
  MemoryRecord,
  memoryToMarkdown,
  markdownToMemory,
  slugify,
} from "./utils";

export interface SyncState {
  lastSyncTimestamp: number;
  /** Map of memory id → local file mtime (ms) at last sync */
  localMtimes: Record<string, number>;
  /** Unresolved conflict IDs (memory_id → conflict_id) */
  conflicts: Record<string, string>;
}

export const DEFAULT_SYNC_STATE: SyncState = {
  lastSyncTimestamp: 0,
  localMtimes: {},
  conflicts: {},
};

export type StatusCallback = (msg: string) => void;

export class SyncEngine {
  private app: App;
  private settings: CrabsHQSettings;
  private state: SyncState;
  private onStatus: StatusCallback;
  private isSyncing = false;

  constructor(
    app: App,
    settings: CrabsHQSettings,
    state: SyncState,
    onStatus: StatusCallback
  ) {
    this.app = app;
    this.settings = settings;
    this.state = state;
    this.onStatus = onStatus;
  }

  updateSettings(settings: CrabsHQSettings): void {
    this.settings = settings;
  }

  updateState(state: SyncState): void {
    this.state = state;
  }

  getState(): SyncState {
    return this.state;
  }

  private api(): CrabsHQApi {
    return new CrabsHQApi({
      bridgeUrl: this.settings.bridgeUrl,
      apiKey: this.settings.apiKey,
    });
  }

  private folder(): string {
    return normalizePath(this.settings.memoriesFolder);
  }

  private filePath(id: string): string {
    return normalizePath(`${this.folder()}/${id}.md`);
  }

  /** Ensure the memories folder exists */
  private async ensureFolder(): Promise<void> {
    const folder = this.folder();
    if (!this.app.vault.getAbstractFileByPath(folder)) {
      await this.app.vault.createFolder(folder);
    }
  }

  /** Write a memory to vault (create or overwrite) */
  private async writeMemoryFile(memory: MemoryRecord): Promise<void> {
    await this.ensureFolder();
    const path = this.filePath(memory.id);
    const syncedAt = Date.now();
    const content = memoryToMarkdown(memory, syncedAt);
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, content);
    } else {
      await this.app.vault.create(path, content);
    }
    // Update mtime record after write
    const file = this.app.vault.getAbstractFileByPath(path) as TFile | null;
    if (file) {
      this.state.localMtimes[memory.id] = file.stat.mtime;
    }
  }

  /** Delete (trash) a memory file by id */
  private async trashMemoryFile(id: string): Promise<void> {
    const path = this.filePath(id);
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      await this.app.vault.trash(file, true);
    }
    delete this.state.localMtimes[id];
  }

  /**
   * PULL: sync server → vault using delta.
   * Returns count of updated/deleted memories.
   */
  async pull(): Promise<{ updated: number; deleted: number }> {
    const api = this.api();
    const since = this.state.lastSyncTimestamp;
    const changes = await api.getChanges(since);

    let updatedCount = 0;
    let deletedCount = 0;

    for (const memory of changes.updated) {
      // Check for conflict: file exists locally AND was modified since last sync
      const path = this.filePath(memory.id);
      const localFile = this.app.vault.getAbstractFileByPath(path);
      if (localFile instanceof TFile) {
        const lastKnownMtime = this.state.localMtimes[memory.id] ?? 0;
        const locallyModified = localFile.stat.mtime > lastKnownMtime && lastKnownMtime > 0;
        if (locallyModified) {
          // Conflict: both sides changed
          if (!this.state.conflicts[memory.id]) {
            try {
              const localContent = await this.app.vault.read(localFile);
              const parsed = markdownToMemory(localContent);
              const localVersion: Partial<MemoryRecord> = {
                id: memory.id,
                title: parsed.title,
                summary: parsed.summary,
                details: parsed.details,
                ...parsed.frontmatter,
              };
              const conflict = await api.reportConflict(
                memory.id,
                localVersion,
                memory
              );
              this.state.conflicts[memory.id] = conflict.id;
              new Notice(
                `⚠️ CrabsHQ conflict detected for "${memory.title}". Resolve in settings.`,
                8000
              );
            } catch (err) {
              console.error("CrabsHQ: Failed to report conflict", err);
            }
          }
          // Don't overwrite — skip this memory
          continue;
        }
      }

      await this.writeMemoryFile(memory);
      updatedCount++;
    }

    for (const del of changes.deleted) {
      await this.trashMemoryFile(del.id);
      delete this.state.conflicts[del.id];
      deletedCount++;
    }

    this.state.lastSyncTimestamp = Date.now();
    return { updated: updatedCount, deleted: deletedCount };
  }

  /**
   * PULL ALL: full re-download ignoring delta.
   */
  async pullAll(): Promise<number> {
    const api = this.api();
    const memories = await api.listMemories();
    for (const memory of memories) {
      await this.writeMemoryFile(memory);
    }
    this.state.lastSyncTimestamp = Date.now();
    return memories.length;
  }

  /**
   * PUSH: push a single file to server.
   * Called on file modify/create events.
   */
  async pushFile(file: TFile): Promise<void> {
    // Only process files in the memories folder
    const folder = this.folder();
    if (!file.path.startsWith(folder + "/")) return;
    // Skip non-md files
    if (!file.path.endsWith(".md")) return;

    const api = this.api();
    const content = await this.app.vault.read(file);
    const { frontmatter, title, summary, details } = markdownToMemory(content);

    if (!title && !summary) return; // Skip empty files

    if (frontmatter.id) {
      // Update existing memory
      // Skip if we just wrote this file during a pull (mtime matches)
      const lastKnownMtime = this.state.localMtimes[frontmatter.id] ?? 0;
      if (file.stat.mtime <= lastKnownMtime) return;

      await api.updateMemory(frontmatter.id, {
        title,
        summary,
        details,
        scope: frontmatter.scope,
        tags: frontmatter.tags,
        source: frontmatter.source,
        confidence: frontmatter.confidence,
      });
      this.state.localMtimes[frontmatter.id] = file.stat.mtime;
    } else {
      // New file — create on server
      const id = slugify(title || file.basename);
      const memory = await api.createMemory({
        id,
        title,
        summary,
        details,
        scope: frontmatter.scope,
        tags: frontmatter.tags,
        source: frontmatter.source,
        confidence: frontmatter.confidence,
      });
      // Update frontmatter in the file with returned id
      await this.updateFileFrontmatter(file, { id: memory.id, synced_at: Date.now() });
      this.state.localMtimes[memory.id] = file.stat.mtime;
    }
  }

  /**
   * PUSH ALL: push all local files to server.
   */
  async pushAll(): Promise<number> {
    const folder = this.folder();
    const folderObj = this.app.vault.getAbstractFileByPath(folder);
    if (!(folderObj instanceof TFolder)) {
      new Notice("CrabsHQ: Memories folder not found");
      return 0;
    }

    let count = 0;
    for (const file of folderObj.children) {
      if (file instanceof TFile && file.extension === "md") {
        try {
          await this.pushFile(file);
          count++;
        } catch (err) {
          console.error(`CrabsHQ: Failed to push ${file.path}`, err);
        }
      }
    }
    return count;
  }

  /**
   * HANDLE DELETE: called when a file is deleted.
   */
  async handleDelete(file: TFile): Promise<void> {
    const folder = this.folder();
    if (!file.path.startsWith(folder + "/")) return;
    if (!file.path.endsWith(".md")) return;

    // Try to find id from basename (id = slug = filename without .md)
    const id = file.basename;
    if (!id) return;

    // Only call API if we have this id in our local mtimes (i.e., it was synced)
    if (this.state.localMtimes[id] !== undefined) {
      try {
        const api = this.api();
        await api.deleteMemory(id);
      } catch (err) {
        console.error(`CrabsHQ: Failed to delete memory ${id}`, err);
      }
      delete this.state.localMtimes[id];
      delete this.state.conflicts[id];
    }
  }

  /**
   * Full bidirectional sync: pull then push changes.
   */
  async sync(): Promise<{ updated: number; deleted: number; pushed: number }> {
    if (this.isSyncing) return { updated: 0, deleted: 0, pushed: 0 };
    this.isSyncing = true;
    this.onStatus("syncing...");

    try {
      const pullResult = await this.pull();
      // After pull, push any local files that are newer than lastSyncTimestamp
      // (We rely on pushFile being called by file watchers for real-time pushes;
      //  pushAll here would double-push so we skip it in auto-sync)
      this.onStatus(this.buildStatusMessage());
      return { ...pullResult, pushed: 0 };
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Generate MEMORY.md in the parent CrabsHQ folder.
   */
  async generateMemoryMd(): Promise<void> {
    const api = this.api();
    const markdown = await api.getMarkdown();

    // Write to CrabsHQ/MEMORY.md
    const parentFolder = this.folder().split("/").slice(0, -1).join("/") || "CrabsHQ";
    const memPath = normalizePath(`${parentFolder}/MEMORY.md`);

    // Ensure parent folder
    const parent = this.app.vault.getAbstractFileByPath(parentFolder);
    if (!parent) {
      await this.app.vault.createFolder(parentFolder);
    }

    const existing = this.app.vault.getAbstractFileByPath(memPath);
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, markdown);
    } else {
      await this.app.vault.create(memPath, markdown);
    }
  }

  buildStatusMessage(): string {
    const conflictCount = Object.keys(this.state.conflicts).length;
    if (conflictCount > 0) {
      return `⚠️ ${conflictCount} conflict${conflictCount > 1 ? "s" : ""}`;
    }
    const memCount = Object.keys(this.state.localMtimes).length;
    return `${memCount} memor${memCount === 1 ? "y" : "ies"} synced`;
  }

  /**
   * Update specific frontmatter keys in a file without disturbing the body.
   */
  private async updateFileFrontmatter(
    file: TFile,
    updates: Record<string, unknown>
  ): Promise<void> {
    const content = await this.app.vault.read(file);
    const fmRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
    const match = content.match(fmRegex);

    let newContent: string;
    if (match) {
      // Parse existing frontmatter and merge
      const lines = match[1].split(/\r?\n/);
      const updatedKeys = new Set<string>();

      const newLines = lines.map((line) => {
        const kv = line.match(/^(\w[\w_-]*):\s*/);
        if (kv && updates[kv[1]] !== undefined) {
          updatedKeys.add(kv[1]);
          return `${kv[1]}: ${updates[kv[1]]}`;
        }
        return line;
      });

      // Add missing keys
      for (const [k, v] of Object.entries(updates)) {
        if (!updatedKeys.has(k)) {
          newLines.push(`${k}: ${v}`);
        }
      }

      newContent = content.replace(fmRegex, `---\n${newLines.join("\n")}\n---\n`);
    } else {
      // No frontmatter — prepend
      const fmLines = Object.entries(updates)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n");
      newContent = `---\n${fmLines}\n---\n${content}`;
    }

    await this.app.vault.modify(file, newContent);
    // Update mtime after our write so file watcher doesn't re-push
    const updated = this.app.vault.getAbstractFileByPath(file.path);
    if (updated instanceof TFile && updates.id) {
      this.state.localMtimes[updates.id as string] = updated.stat.mtime;
    }
  }
}
