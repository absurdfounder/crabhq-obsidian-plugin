var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/utils.ts
var utils_exports = {};
__export(utils_exports, {
  getString: () => getString,
  markdownToMemory: () => markdownToMemory,
  memoryToMarkdown: () => memoryToMarkdown,
  parseFrontmatter: () => parseFrontmatter,
  parseYaml: () => parseYaml,
  serializeYaml: () => serializeYaml,
  slugify: () => slugify
});
function parseFrontmatter(content) {
  const fmRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
  const match = content.match(fmRegex);
  if (!match) {
    return { raw: "", data: {}, body: content };
  }
  const raw = match[1];
  const body = match[2];
  const data = parseYaml(raw);
  return { raw, data, body };
}
function parseYaml(yaml) {
  const result = {};
  const lines = yaml.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const kvMatch = line.match(/^(\w[\w_-]*):\s*(.*)?$/);
    if (kvMatch) {
      const key = kvMatch[1];
      const val = (kvMatch[2] || "").trim();
      if (val === "" || val === "|" || val === ">") {
        result[key] = val;
        i++;
        continue;
      }
      if (val.startsWith("[")) {
        const inner = val.slice(1, val.lastIndexOf("]"));
        result[key] = inner.split(",").map((s) => s.trim()).filter(Boolean);
        i++;
        continue;
      }
      if (val.startsWith("{")) {
        try {
          const jsonLike = val.replace(/(\w[\w_-]*):/g, '"$1":');
          result[key] = JSON.parse(jsonLike);
        } catch (e) {
          result[key] = val;
        }
        i++;
        continue;
      }
      if (!isNaN(Number(val)) && val !== "") {
        result[key] = Number(val);
        i++;
        continue;
      }
      if (val === "true") {
        result[key] = true;
        i++;
        continue;
      }
      if (val === "false") {
        result[key] = false;
        i++;
        continue;
      }
      result[key] = val.replace(/^['"]|['"]$/g, "");
      i++;
      continue;
    }
    i++;
  }
  return result;
}
function serializeYaml(data) {
  const lines = [];
  for (const [key, value] of Object.entries(data)) {
    if (value === void 0 || value === null) continue;
    if (Array.isArray(value)) {
      lines.push(`${key}: [${value.join(", ")}]`);
    } else if (typeof value === "object") {
      const parts = Object.entries(value).map(([k, v]) => `${k}: ${v}`).join(", ");
      lines.push(`${key}: {${parts}}`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  return lines.join("\n");
}
function memoryToMarkdown(memory, syncedAt) {
  const fm = {
    id: memory.id
  };
  if (memory.scope) fm.scope = memory.scope;
  if (memory.tags && memory.tags.length > 0) fm.tags = memory.tags;
  if (memory.confidence !== void 0) fm.confidence = memory.confidence;
  if (memory.source && Object.keys(memory.source).length > 0) fm.source = memory.source;
  fm.synced_at = syncedAt;
  const yaml = serializeYaml(fm);
  let content = `---
${yaml}
---
# ${memory.title}

${memory.summary}`;
  if (memory.details) {
    content += `

## Details

${memory.details}`;
  }
  return content;
}
function markdownToMemory(content) {
  const { data, body } = parseFrontmatter(content);
  const frontmatter = {
    id: data.id,
    scope: data.scope,
    tags: data.tags,
    confidence: data.confidence,
    source: data.source,
    synced_at: data.synced_at
  };
  const titleMatch = body.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : "";
  let summary = "";
  let details;
  const detailsMatch = body.match(/^##\s+Details\s*\n+([\s\S]*)$/m);
  if (detailsMatch) {
    details = detailsMatch[1].trim();
    const h1End = body.indexOf("\n", body.indexOf("# "));
    const detailsStart = body.indexOf("## Details");
    summary = body.slice(h1End + 1, detailsStart).trim();
  } else {
    const h1End = body.indexOf("\n", body.indexOf("# "));
    summary = body.slice(h1End + 1).trim();
  }
  return { frontmatter, title, summary, details };
}
function slugify(title) {
  return title.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 64);
}
function getString(val) {
  return typeof val === "string" ? val : String(val != null ? val : "");
}
var init_utils = __esm({
  "src/utils.ts"() {
  }
});

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => CrabsHQPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian4 = require("obsidian");

// src/settings.ts
var import_obsidian2 = require("obsidian");

// src/api.ts
var import_obsidian = require("obsidian");
var CrabsHQApi = class {
  constructor(config) {
    this.base = config.bridgeUrl.replace(/\/$/, "");
    this.key = config.apiKey;
  }
  async request(method, path, body, noAuth = false) {
    const params = {
      url: `${this.base}${path}`,
      method,
      headers: {
        "Content-Type": "application/json",
        ...noAuth ? {} : { "X-API-Key": this.key }
      },
      throw: false
    };
    if (body !== void 0) {
      params.body = JSON.stringify(body);
    }
    const response = await (0, import_obsidian.requestUrl)(params);
    if (response.status >= 400) {
      let msg = `HTTP ${response.status}`;
      try {
        const err = response.json;
        if ((err == null ? void 0 : err.error) || (err == null ? void 0 : err.message)) msg += `: ${err.error || err.message}`;
      } catch (e) {
      }
      throw new Error(msg);
    }
    return response.json;
  }
  /** List all non-deleted memories */
  async listMemories() {
    return this.request("GET", "/api/memories");
  }
  /** Delta sync — returns changes since a timestamp (ms) */
  async getChanges(since) {
    return this.request(
      "GET",
      `/api/memories/changes?since=${since}`
    );
  }
  /** Get a single memory */
  async getMemory(id) {
    return this.request("GET", `/api/memories/${id}`);
  }
  /** Create a memory */
  async createMemory(data) {
    return this.request("POST", "/api/memories", data);
  }
  /** Update a memory */
  async updateMemory(id, data) {
    return this.request("PATCH", `/api/memories/${id}`, data);
  }
  /** Soft-delete a memory */
  async deleteMemory(id) {
    await this.request("DELETE", `/api/memories/${id}`);
  }
  /** Get the full markdown snapshot */
  async getMarkdown() {
    const res = await this.request("GET", "/api/memories/markdown");
    return res.markdown;
  }
  /** Report a conflict */
  async reportConflict(memoryId, localVersion, serverVersion) {
    return this.request("POST", "/api/memories/conflicts", {
      memory_id: memoryId,
      local_version: localVersion,
      server_version: serverVersion
    });
  }
  /** Resolve a conflict */
  async resolveConflict(conflictId, resolution, resolvedVersion) {
    await this.request(
      "POST",
      `/api/memories/conflicts/${conflictId}/resolve`,
      { resolution, resolved_version: resolvedVersion }
    );
  }
  /**
   * Generate a new API key (no auth required).
   * bridgeUrl is passed separately since this.key may not exist yet.
   */
  static async generateApiKey(bridgeUrl, label = "obsidian-sync") {
    const base = bridgeUrl.replace(/\/$/, "");
    const response = await (0, import_obsidian.requestUrl)({
      url: `${base}/api/api-keys`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
      throw: false
    });
    if (response.status >= 400) {
      throw new Error(`Failed to generate key: HTTP ${response.status}`);
    }
    return response.json.key;
  }
};

// src/settings.ts
var DEFAULT_SETTINGS = {
  bridgeUrl: "",
  apiKey: "",
  memoriesFolder: "CrabsHQ/Memories",
  syncInterval: 0,
  autoSyncOnStartup: true
};
var SYNC_INTERVAL_OPTIONS = [
  { value: 0, label: "Manual only" },
  { value: 5, label: "Every 5 minutes" },
  { value: 15, label: "Every 15 minutes" },
  { value: 30, label: "Every 30 minutes" },
  { value: 60, label: "Every 1 hour" }
];
var CrabsHQSettingTab = class extends import_obsidian2.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "CrabsHQ Memory Sync" });
    containerEl.createEl("h3", { text: "Connection" });
    new import_obsidian2.Setting(containerEl).setName("Bridge URL").setDesc(
      "Base URL of your CrabsHQ bridge (e.g. https://org-xyz.crabhq.com or http://localhost:3002)"
    ).addText(
      (text) => text.setPlaceholder("https://org-xyz.crabhq.com").setValue(this.plugin.settings.bridgeUrl).onChange(async (value) => {
        this.plugin.settings.bridgeUrl = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("API Key").setDesc("Your CrabsHQ API key (starts with chq_)").addText((text) => {
      text.setPlaceholder("chq_xxxxx").setValue(this.plugin.settings.apiKey).onChange(async (value) => {
        this.plugin.settings.apiKey = value.trim();
        await this.plugin.saveSettings();
      });
      text.inputEl.type = "password";
      return text;
    }).addButton(
      (btn) => btn.setButtonText("Generate Key").setTooltip("Generate a new API key using your Bridge URL").onClick(async () => {
        const url = this.plugin.settings.bridgeUrl;
        if (!url) {
          new import_obsidian2.Notice("Please enter your Bridge URL first.");
          return;
        }
        btn.setDisabled(true);
        btn.setButtonText("Generating...");
        try {
          const key = await CrabsHQApi.generateApiKey(url, "obsidian-sync");
          this.plugin.settings.apiKey = key;
          await this.plugin.saveSettings();
          new import_obsidian2.Notice(`\u2705 API key generated and saved!`);
          this.display();
        } catch (err) {
          new import_obsidian2.Notice(`\u274C Failed to generate key: ${err.message}`);
        } finally {
          btn.setDisabled(false);
          btn.setButtonText("Generate Key");
        }
      })
    );
    containerEl.createEl("h3", { text: "Sync" });
    new import_obsidian2.Setting(containerEl).setName("Memories folder").setDesc("Vault folder where memory files will be stored").addText(
      (text) => text.setPlaceholder("CrabsHQ/Memories").setValue(this.plugin.settings.memoriesFolder).onChange(async (value) => {
        this.plugin.settings.memoriesFolder = value.trim() || "CrabsHQ/Memories";
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("Sync interval").setDesc("How often to automatically sync with the server").addDropdown((drop) => {
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
    new import_obsidian2.Setting(containerEl).setName("Auto-sync on startup").setDesc("Automatically sync when Obsidian starts").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.autoSyncOnStartup).onChange(async (value) => {
        this.plugin.settings.autoSyncOnStartup = value;
        await this.plugin.saveSettings();
      })
    );
    const conflictCount = Object.keys(this.plugin.syncState.conflicts).length;
    if (conflictCount > 0) {
      containerEl.createEl("h3", { text: "\u26A0\uFE0F Conflicts" });
      const conflictDesc = containerEl.createEl("p", {
        text: `You have ${conflictCount} unresolved conflict${conflictCount > 1 ? "s" : ""}. Use the commands below to resolve them, or pull/push to force a direction.`,
        cls: "crabhq-conflict-notice"
      });
      conflictDesc.style.color = "var(--text-warning)";
      for (const [memoryId, conflictId] of Object.entries(
        this.plugin.syncState.conflicts
      )) {
        new import_obsidian2.Setting(containerEl).setName(`Conflict: ${memoryId}`).setDesc(`Conflict ID: ${conflictId}`).addButton(
          (btn) => btn.setButtonText("Use Local").setWarning().onClick(async () => {
            await this.plugin.resolveConflict(memoryId, conflictId, "local");
            this.display();
          })
        ).addButton(
          (btn) => btn.setButtonText("Use Server").onClick(async () => {
            await this.plugin.resolveConflict(memoryId, conflictId, "server");
            this.display();
          })
        );
      }
    }
    containerEl.createEl("h3", { text: "Status" });
    const statusEl = containerEl.createEl("p", {
      text: `Last sync: ${this.plugin.syncState.lastSyncTimestamp > 0 ? new Date(this.plugin.syncState.lastSyncTimestamp).toLocaleString() : "Never"}`
    });
    statusEl.style.color = "var(--text-muted)";
    new import_obsidian2.Setting(containerEl).setName("Sync now").setDesc("Trigger a manual sync immediately").addButton(
      (btn) => btn.setButtonText("Sync now").setCta().onClick(async () => {
        btn.setDisabled(true);
        btn.setButtonText("Syncing...");
        try {
          await this.plugin.triggerSync();
          new import_obsidian2.Notice("\u2705 CrabsHQ sync complete");
          this.display();
        } catch (err) {
          new import_obsidian2.Notice(`\u274C Sync failed: ${err.message}`);
        } finally {
          btn.setDisabled(false);
          btn.setButtonText("Sync now");
        }
      })
    );
  }
};

// src/sync.ts
var import_obsidian3 = require("obsidian");
init_utils();
var DEFAULT_SYNC_STATE = {
  lastSyncTimestamp: 0,
  localMtimes: {},
  conflicts: {}
};
var SyncEngine = class {
  constructor(app, settings, state, onStatus) {
    this.isSyncing = false;
    this.app = app;
    this.settings = settings;
    this.state = state;
    this.onStatus = onStatus;
  }
  updateSettings(settings) {
    this.settings = settings;
  }
  updateState(state) {
    this.state = state;
  }
  getState() {
    return this.state;
  }
  api() {
    return new CrabsHQApi({
      bridgeUrl: this.settings.bridgeUrl,
      apiKey: this.settings.apiKey
    });
  }
  folder() {
    return (0, import_obsidian3.normalizePath)(this.settings.memoriesFolder);
  }
  filePath(id) {
    return (0, import_obsidian3.normalizePath)(`${this.folder()}/${id}.md`);
  }
  /** Ensure the memories folder exists */
  async ensureFolder() {
    const folder = this.folder();
    if (!this.app.vault.getAbstractFileByPath(folder)) {
      await this.app.vault.createFolder(folder);
    }
  }
  /** Write a memory to vault (create or overwrite) */
  async writeMemoryFile(memory) {
    await this.ensureFolder();
    const path = this.filePath(memory.id);
    const syncedAt = Date.now();
    const content = memoryToMarkdown(memory, syncedAt);
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof import_obsidian3.TFile) {
      await this.app.vault.modify(existing, content);
    } else {
      await this.app.vault.create(path, content);
    }
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file) {
      this.state.localMtimes[memory.id] = file.stat.mtime;
    }
  }
  /** Delete (trash) a memory file by id */
  async trashMemoryFile(id) {
    const path = this.filePath(id);
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof import_obsidian3.TFile) {
      await this.app.vault.trash(file, true);
    }
    delete this.state.localMtimes[id];
  }
  /**
   * PULL: sync server → vault using delta.
   * Returns count of updated/deleted memories.
   */
  async pull() {
    var _a;
    const api = this.api();
    const since = this.state.lastSyncTimestamp;
    const changes = await api.getChanges(since);
    let updatedCount = 0;
    let deletedCount = 0;
    for (const memory of changes.updated) {
      const path = this.filePath(memory.id);
      const localFile = this.app.vault.getAbstractFileByPath(path);
      if (localFile instanceof import_obsidian3.TFile) {
        const lastKnownMtime = (_a = this.state.localMtimes[memory.id]) != null ? _a : 0;
        const locallyModified = localFile.stat.mtime > lastKnownMtime && lastKnownMtime > 0;
        if (locallyModified) {
          if (!this.state.conflicts[memory.id]) {
            try {
              const localContent = await this.app.vault.read(localFile);
              const parsed = markdownToMemory(localContent);
              const localVersion = {
                id: memory.id,
                title: parsed.title,
                summary: parsed.summary,
                details: parsed.details,
                ...parsed.frontmatter
              };
              const conflict = await api.reportConflict(
                memory.id,
                localVersion,
                memory
              );
              this.state.conflicts[memory.id] = conflict.id;
              new import_obsidian3.Notice(
                `\u26A0\uFE0F CrabsHQ conflict detected for "${memory.title}". Resolve in settings.`,
                8e3
              );
            } catch (err) {
              console.error("CrabsHQ: Failed to report conflict", err);
            }
          }
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
  async pullAll() {
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
  async pushFile(file) {
    var _a;
    const folder = this.folder();
    if (!file.path.startsWith(folder + "/")) return;
    if (!file.path.endsWith(".md")) return;
    const api = this.api();
    const content = await this.app.vault.read(file);
    const { frontmatter, title, summary, details } = markdownToMemory(content);
    if (!title && !summary) return;
    if (frontmatter.id) {
      const lastKnownMtime = (_a = this.state.localMtimes[frontmatter.id]) != null ? _a : 0;
      if (file.stat.mtime <= lastKnownMtime) return;
      await api.updateMemory(frontmatter.id, {
        title,
        summary,
        details,
        scope: frontmatter.scope,
        tags: frontmatter.tags,
        source: frontmatter.source,
        confidence: frontmatter.confidence
      });
      this.state.localMtimes[frontmatter.id] = file.stat.mtime;
    } else {
      const id = slugify(title || file.basename);
      const memory = await api.createMemory({
        id,
        title,
        summary,
        details,
        scope: frontmatter.scope,
        tags: frontmatter.tags,
        source: frontmatter.source,
        confidence: frontmatter.confidence
      });
      await this.updateFileFrontmatter(file, { id: memory.id, synced_at: Date.now() });
      this.state.localMtimes[memory.id] = file.stat.mtime;
    }
  }
  /**
   * PUSH ALL: push all local files to server.
   */
  async pushAll() {
    const folder = this.folder();
    const folderObj = this.app.vault.getAbstractFileByPath(folder);
    if (!(folderObj instanceof import_obsidian3.TFolder)) {
      new import_obsidian3.Notice("CrabsHQ: Memories folder not found");
      return 0;
    }
    let count = 0;
    for (const file of folderObj.children) {
      if (file instanceof import_obsidian3.TFile && file.extension === "md") {
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
  async handleDelete(file) {
    const folder = this.folder();
    if (!file.path.startsWith(folder + "/")) return;
    if (!file.path.endsWith(".md")) return;
    const id = file.basename;
    if (!id) return;
    if (this.state.localMtimes[id] !== void 0) {
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
  async sync() {
    if (this.isSyncing) return { updated: 0, deleted: 0, pushed: 0 };
    this.isSyncing = true;
    this.onStatus("syncing...");
    try {
      const pullResult = await this.pull();
      this.onStatus(this.buildStatusMessage());
      return { ...pullResult, pushed: 0 };
    } finally {
      this.isSyncing = false;
    }
  }
  /**
   * Generate MEMORY.md in the parent CrabsHQ folder.
   */
  async generateMemoryMd() {
    const api = this.api();
    const markdown = await api.getMarkdown();
    const parentFolder = this.folder().split("/").slice(0, -1).join("/") || "CrabsHQ";
    const memPath = (0, import_obsidian3.normalizePath)(`${parentFolder}/MEMORY.md`);
    const parent = this.app.vault.getAbstractFileByPath(parentFolder);
    if (!parent) {
      await this.app.vault.createFolder(parentFolder);
    }
    const existing = this.app.vault.getAbstractFileByPath(memPath);
    if (existing instanceof import_obsidian3.TFile) {
      await this.app.vault.modify(existing, markdown);
    } else {
      await this.app.vault.create(memPath, markdown);
    }
  }
  buildStatusMessage() {
    const conflictCount = Object.keys(this.state.conflicts).length;
    if (conflictCount > 0) {
      return `\u26A0\uFE0F ${conflictCount} conflict${conflictCount > 1 ? "s" : ""}`;
    }
    const memCount = Object.keys(this.state.localMtimes).length;
    return `${memCount} memor${memCount === 1 ? "y" : "ies"} synced`;
  }
  /**
   * Update specific frontmatter keys in a file without disturbing the body.
   */
  async updateFileFrontmatter(file, updates) {
    const content = await this.app.vault.read(file);
    const fmRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
    const match = content.match(fmRegex);
    let newContent;
    if (match) {
      const lines = match[1].split(/\r?\n/);
      const updatedKeys = /* @__PURE__ */ new Set();
      const newLines = lines.map((line) => {
        const kv = line.match(/^(\w[\w_-]*):\s*/);
        if (kv && updates[kv[1]] !== void 0) {
          updatedKeys.add(kv[1]);
          return `${kv[1]}: ${updates[kv[1]]}`;
        }
        return line;
      });
      for (const [k, v] of Object.entries(updates)) {
        if (!updatedKeys.has(k)) {
          newLines.push(`${k}: ${v}`);
        }
      }
      newContent = content.replace(fmRegex, `---
${newLines.join("\n")}
---
`);
    } else {
      const fmLines = Object.entries(updates).map(([k, v]) => `${k}: ${v}`).join("\n");
      newContent = `---
${fmLines}
---
${content}`;
    }
    await this.app.vault.modify(file, newContent);
    const updated = this.app.vault.getAbstractFileByPath(file.path);
    if (updated instanceof import_obsidian3.TFile && updates.id) {
      this.state.localMtimes[updates.id] = updated.stat.mtime;
    }
  }
};

// src/main.ts
var BRAIN_ICON = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5C10.5 3.5 8 3 6.5 4.5S4.5 8 5.5 10c-2 1-2.5 3-1.5 4.5 1 1.5 3 2 4.5 1.5-.5 2 .5 4 2.5 4.5M12 5c1.5-1.5 4-2 5.5-.5S18.5 8 17.5 10c2 1 2.5 3 1.5 4.5-1 1.5-3 2-4.5 1.5.5 2-.5 4-2.5 4.5M12 5v14.5"/></svg>`;
(0, import_obsidian4.addIcon)("crabhq-brain", BRAIN_ICON);
var CrabsHQPlugin = class extends import_obsidian4.Plugin {
  constructor() {
    super(...arguments);
    this.settings = { ...DEFAULT_SETTINGS };
    this.syncState = { ...DEFAULT_SYNC_STATE };
    this.statusBarEl = null;
    this.intervalHandle = null;
    // Debounce file modification events
    this.modifyDebounce = /* @__PURE__ */ new Map();
  }
  async onload() {
    await this.loadPluginData();
    this.syncEngine = new SyncEngine(
      this.app,
      this.settings,
      this.syncState,
      (msg) => this.setStatus(msg)
    );
    this.statusBarEl = this.addStatusBarItem();
    this.setStatus(this.syncEngine.buildStatusMessage());
    this.addRibbonIcon("crabhq-brain", "CrabsHQ: Sync memories", async () => {
      await this.triggerSync();
    });
    this.addCommand({
      id: "sync-now",
      name: "Sync memories now",
      callback: async () => {
        try {
          await this.triggerSync();
          new import_obsidian4.Notice("\u2705 CrabsHQ sync complete");
        } catch (err) {
          new import_obsidian4.Notice(`\u274C CrabsHQ sync failed: ${err.message}`);
        }
      }
    });
    this.addCommand({
      id: "pull-all",
      name: "Pull all memories",
      callback: async () => {
        this.setStatus("syncing...");
        try {
          const count = await this.syncEngine.pullAll();
          await this.savePluginData();
          const msg = `\u2705 Pulled ${count} memories from CrabsHQ`;
          new import_obsidian4.Notice(msg);
          this.setStatus(this.syncEngine.buildStatusMessage());
        } catch (err) {
          new import_obsidian4.Notice(`\u274C Pull failed: ${err.message}`);
          this.setStatus(this.syncEngine.buildStatusMessage());
        }
      }
    });
    this.addCommand({
      id: "push-all",
      name: "Push all memories",
      callback: async () => {
        this.setStatus("syncing...");
        try {
          const count = await this.syncEngine.pushAll();
          await this.savePluginData();
          new import_obsidian4.Notice(`\u2705 Pushed ${count} memories to CrabsHQ`);
          this.setStatus(this.syncEngine.buildStatusMessage());
        } catch (err) {
          new import_obsidian4.Notice(`\u274C Push failed: ${err.message}`);
          this.setStatus(this.syncEngine.buildStatusMessage());
        }
      }
    });
    this.addCommand({
      id: "generate-memory-md",
      name: "Generate MEMORY.md",
      callback: async () => {
        try {
          await this.syncEngine.generateMemoryMd();
          new import_obsidian4.Notice("\u2705 MEMORY.md generated");
        } catch (err) {
          new import_obsidian4.Notice(`\u274C Failed to generate MEMORY.md: ${err.message}`);
        }
      }
    });
    this.addSettingTab(new CrabsHQSettingTab(this.app, this));
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (!(file instanceof import_obsidian4.TFile)) return;
        const folder = (0, import_obsidian4.normalizePath)(this.settings.memoriesFolder);
        if (!file.path.startsWith(folder + "/")) return;
        if (file.extension !== "md") return;
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
        }, 2e3);
        this.modifyDebounce.set(file.path, handle);
      })
    );
    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (!(file instanceof import_obsidian4.TFile)) return;
        const folder = (0, import_obsidian4.normalizePath)(this.settings.memoriesFolder);
        if (!file.path.startsWith(folder + "/")) return;
        if (file.extension !== "md") return;
        setTimeout(async () => {
          try {
            await this.syncEngine.pushFile(file);
            await this.savePluginData();
            this.setStatus(this.syncEngine.buildStatusMessage());
          } catch (err) {
            console.error("CrabsHQ: push on create failed", err);
          }
        }, 1e3);
      })
    );
    this.registerEvent(
      this.app.vault.on("delete", async (file) => {
        if (!(file instanceof import_obsidian4.TFile)) return;
        try {
          await this.syncEngine.handleDelete(file);
          await this.savePluginData();
          this.setStatus(this.syncEngine.buildStatusMessage());
        } catch (err) {
          console.error("CrabsHQ: delete sync failed", err);
        }
      })
    );
    if (this.settings.autoSyncOnStartup && this.settings.bridgeUrl && this.settings.apiKey) {
      setTimeout(async () => {
        try {
          await this.triggerSync();
        } catch (err) {
          console.error("CrabsHQ: startup sync failed", err);
        }
      }, 3e3);
    }
    this.rescheduleInterval();
    console.log("CrabsHQ Memory Sync loaded");
  }
  async onunload() {
    if (this.intervalHandle !== null) {
      window.clearInterval(this.intervalHandle);
    }
    for (const handle of this.modifyDebounce.values()) {
      clearTimeout(handle);
    }
    await this.savePluginData();
    console.log("CrabsHQ Memory Sync unloaded");
  }
  /** Trigger a full sync and persist state */
  async triggerSync() {
    if (!this.settings.bridgeUrl || !this.settings.apiKey) {
      new import_obsidian4.Notice("\u26A0\uFE0F CrabsHQ: Please configure Bridge URL and API Key in settings.");
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
  async resolveConflict(memoryId, conflictId, resolution) {
    const api = new CrabsHQApi({
      bridgeUrl: this.settings.bridgeUrl,
      apiKey: this.settings.apiKey
    });
    let resolvedVersion = {};
    if (resolution === "local") {
      const path = (0, import_obsidian4.normalizePath)(`${this.settings.memoriesFolder}/${memoryId}.md`);
      const file = this.app.vault.getAbstractFileByPath(path);
      if (file instanceof import_obsidian4.TFile) {
        const content = await this.app.vault.read(file);
        const { frontmatter, title, summary, details } = await Promise.resolve().then(() => (init_utils(), utils_exports)).then(
          (m) => m.markdownToMemory(content)
        );
        resolvedVersion = { id: memoryId, title, summary, details, ...frontmatter };
      }
    } else if (resolution === "server") {
      const memory = await api.getMemory(memoryId);
      const path = (0, import_obsidian4.normalizePath)(`${this.settings.memoriesFolder}/${memoryId}.md`);
      const file = this.app.vault.getAbstractFileByPath(path);
      const { memoryToMarkdown: memoryToMarkdown2 } = await Promise.resolve().then(() => (init_utils(), utils_exports));
      const content = memoryToMarkdown2(memory, Date.now());
      if (file instanceof import_obsidian4.TFile) {
        await this.app.vault.modify(file, content);
      }
      resolvedVersion = memory;
    }
    await api.resolveConflict(conflictId, resolution, resolvedVersion);
    delete this.syncState.conflicts[memoryId];
    await this.savePluginData();
    this.setStatus(this.syncEngine.buildStatusMessage());
    new import_obsidian4.Notice(`\u2705 Conflict resolved (${resolution})`);
  }
  /** Reschedule the auto-sync interval based on current settings */
  rescheduleInterval() {
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
      }, minutes * 60 * 1e3);
    }
  }
  setStatus(msg) {
    if (this.statusBarEl) {
      this.statusBarEl.setText(`\u{1F9E0} CrabsHQ: ${msg}`);
    }
  }
  async saveSettings() {
    this.syncEngine.updateSettings(this.settings);
    await this.savePluginData();
  }
  async loadPluginData() {
    var _a, _b;
    const data = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, (_a = data == null ? void 0 : data.settings) != null ? _a : {});
    this.syncState = Object.assign({}, DEFAULT_SYNC_STATE, (_b = data == null ? void 0 : data.syncState) != null ? _b : {});
    if (!this.syncState.localMtimes) this.syncState.localMtimes = {};
    if (!this.syncState.conflicts) this.syncState.conflicts = {};
  }
  async savePluginData() {
    const data = {
      settings: this.settings,
      syncState: this.syncEngine ? this.syncEngine.getState() : this.syncState
    };
    await this.saveData(data);
  }
};
