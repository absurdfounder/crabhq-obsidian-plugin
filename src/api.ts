/**
 * CrabsHQ Bridge API client.
 * Uses Obsidian's requestUrl to avoid CORS issues.
 */
import { requestUrl, RequestUrlParam } from "obsidian";
import { MemoryRecord } from "./utils";

export interface ApiConfig {
  bridgeUrl: string;
  apiKey: string;
}

export interface ChangesResponse {
  since: number;
  updated: MemoryRecord[];
  deleted: { id: string; deleted_at: string }[];
}

export interface ConflictRecord {
  id: string;
  memory_id: string;
  local_version: Partial<MemoryRecord>;
  server_version: Partial<MemoryRecord>;
  created_at?: string;
}

export class CrabsHQApi {
  private base: string;
  private key: string;

  constructor(config: ApiConfig) {
    this.base = config.bridgeUrl.replace(/\/$/, "");
    this.key = config.apiKey;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    noAuth = false
  ): Promise<T> {
    const params: RequestUrlParam = {
      url: `${this.base}${path}`,
      method,
      headers: {
        "Content-Type": "application/json",
        ...(noAuth ? {} : { "X-API-Key": this.key }),
      },
      throw: false,
    };
    if (body !== undefined) {
      params.body = JSON.stringify(body);
    }

    const response = await requestUrl(params);

    if (response.status >= 400) {
      let msg = `HTTP ${response.status}`;
      try {
        const err = response.json;
        if (err?.error || err?.message) msg += `: ${err.error || err.message}`;
      } catch {
        // ignore parse errors
      }
      throw new Error(msg);
    }

    return response.json as T;
  }

  /** List all non-deleted memories */
  async listMemories(): Promise<MemoryRecord[]> {
    return this.request<MemoryRecord[]>("GET", "/api/memories");
  }

  /** Delta sync — returns changes since a timestamp (ms) */
  async getChanges(since: number): Promise<ChangesResponse> {
    return this.request<ChangesResponse>(
      "GET",
      `/api/memories/changes?since=${since}`
    );
  }

  /** Get a single memory */
  async getMemory(id: string): Promise<MemoryRecord> {
    return this.request<MemoryRecord>("GET", `/api/memories/${id}`);
  }

  /** Create a memory */
  async createMemory(
    data: Omit<MemoryRecord, "created_at" | "updated_at" | "last_used_at" | "deleted_at">
  ): Promise<MemoryRecord> {
    return this.request<MemoryRecord>("POST", "/api/memories", data);
  }

  /** Update a memory */
  async updateMemory(id: string, data: Partial<MemoryRecord>): Promise<MemoryRecord> {
    return this.request<MemoryRecord>("PATCH", `/api/memories/${id}`, data);
  }

  /** Soft-delete a memory */
  async deleteMemory(id: string): Promise<void> {
    await this.request<unknown>("DELETE", `/api/memories/${id}`);
  }

  /** Get the full markdown snapshot */
  async getMarkdown(): Promise<string> {
    const res = await this.request<{ markdown: string }>("GET", "/api/memories/markdown");
    return res.markdown;
  }

  /** Report a conflict */
  async reportConflict(
    memoryId: string,
    localVersion: Partial<MemoryRecord>,
    serverVersion: Partial<MemoryRecord>
  ): Promise<ConflictRecord> {
    return this.request<ConflictRecord>("POST", "/api/memories/conflicts", {
      memory_id: memoryId,
      local_version: localVersion,
      server_version: serverVersion,
    });
  }

  /** Resolve a conflict */
  async resolveConflict(
    conflictId: string,
    resolution: "local" | "server" | "merged",
    resolvedVersion: Partial<MemoryRecord>
  ): Promise<void> {
    await this.request<unknown>(
      "POST",
      `/api/memories/conflicts/${conflictId}/resolve`,
      { resolution, resolved_version: resolvedVersion }
    );
  }

  /**
   * Generate a new API key (no auth required).
   * bridgeUrl is passed separately since this.key may not exist yet.
   */
  static async generateApiKey(
    bridgeUrl: string,
    label = "obsidian-sync"
  ): Promise<string> {
    const base = bridgeUrl.replace(/\/$/, "");
    const response = await requestUrl({
      url: `${base}/api/api-keys`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
      throw: false,
    });
    if (response.status >= 400) {
      throw new Error(`Failed to generate key: HTTP ${response.status}`);
    }
    return response.json.key as string;
  }
}
