/**
 * Frontmatter parsing, slug generation, and misc utilities.
 */

export interface MemoryFrontmatter {
  id?: string;
  scope?: string;
  tags?: string[];
  confidence?: number;
  source?: Record<string, unknown>;
  synced_at?: number;
}

/**
 * Parse YAML frontmatter from a markdown string.
 * Returns { frontmatter, body } where frontmatter is the raw YAML block text
 * and body is the content after the closing ---.
 */
export function parseFrontmatter(content: string): {
  raw: string;
  data: Record<string, unknown>;
  body: string;
} {
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

/**
 * Minimal YAML parser — handles flat key: value, lists with - items,
 * and inline arrays [a, b, c].  Good enough for our frontmatter.
 */
export function parseYaml(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yaml.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const kvMatch = line.match(/^(\w[\w_-]*):\s*(.*)?$/);
    if (kvMatch) {
      const key = kvMatch[1];
      const val = (kvMatch[2] || "").trim();
      if (val === "" || val === "|" || val === ">") {
        // Possible block or nested — skip for simplicity
        result[key] = val;
        i++;
        continue;
      }
      // Inline array
      if (val.startsWith("[")) {
        const inner = val.slice(1, val.lastIndexOf("]"));
        result[key] = inner
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        i++;
        continue;
      }
      // Inline object
      if (val.startsWith("{")) {
        try {
          // Replace bare keys with quoted keys for JSON.parse
          const jsonLike = val.replace(/(\w[\w_-]*):/g, '"$1":');
          result[key] = JSON.parse(jsonLike);
        } catch {
          result[key] = val;
        }
        i++;
        continue;
      }
      // Number
      if (!isNaN(Number(val)) && val !== "") {
        result[key] = Number(val);
        i++;
        continue;
      }
      // Boolean
      if (val === "true") { result[key] = true; i++; continue; }
      if (val === "false") { result[key] = false; i++; continue; }
      // String (strip optional quotes)
      result[key] = val.replace(/^['"]|['"]$/g, "");
      i++;
      continue;
    }
    i++;
  }
  return result;
}

/**
 * Serialize a frontmatter object back to YAML lines.
 */
export function serializeYaml(data: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      lines.push(`${key}: [${value.join(", ")}]`);
    } else if (typeof value === "object") {
      // Inline object
      const parts = Object.entries(value as Record<string, unknown>)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");
      lines.push(`${key}: {${parts}}`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  return lines.join("\n");
}

/**
 * Build a full markdown file string from memory data.
 */
export interface MemoryRecord {
  id: string;
  scope?: string;
  title: string;
  summary: string;
  details?: string;
  tags?: string[];
  source?: Record<string, unknown>;
  confidence?: number;
  created_at?: string;
  updated_at?: string;
  last_used_at?: string;
  deleted_at?: string | null;
}

export function memoryToMarkdown(memory: MemoryRecord, syncedAt: number): string {
  const fm: Record<string, unknown> = {
    id: memory.id,
  };
  if (memory.scope) fm.scope = memory.scope;
  if (memory.tags && memory.tags.length > 0) fm.tags = memory.tags;
  if (memory.confidence !== undefined) fm.confidence = memory.confidence;
  if (memory.source && Object.keys(memory.source).length > 0) fm.source = memory.source;
  fm.synced_at = syncedAt;

  const yaml = serializeYaml(fm);
  let content = `---\n${yaml}\n---\n# ${memory.title}\n\n${memory.summary}`;
  if (memory.details) {
    content += `\n\n## Details\n\n${memory.details}`;
  }
  return content;
}

/**
 * Parse a memory markdown file back into a MemoryRecord-like object.
 */
export function markdownToMemory(content: string): {
  frontmatter: MemoryFrontmatter;
  title: string;
  summary: string;
  details?: string;
} {
  const { data, body } = parseFrontmatter(content);

  const frontmatter: MemoryFrontmatter = {
    id: data.id as string | undefined,
    scope: data.scope as string | undefined,
    tags: data.tags as string[] | undefined,
    confidence: data.confidence as number | undefined,
    source: data.source as Record<string, unknown> | undefined,
    synced_at: data.synced_at as number | undefined,
  };

  // Extract title from first H1
  const titleMatch = body.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : "";

  // Summary = everything after H1 up to ## Details (or end)
  let summary = "";
  let details: string | undefined;

  const detailsMatch = body.match(/^##\s+Details\s*\n+([\s\S]*)$/m);
  if (detailsMatch) {
    details = detailsMatch[1].trim();
    // Summary is between H1 and ## Details
    const h1End = body.indexOf("\n", body.indexOf("# "));
    const detailsStart = body.indexOf("## Details");
    summary = body.slice(h1End + 1, detailsStart).trim();
  } else {
    const h1End = body.indexOf("\n", body.indexOf("# "));
    summary = body.slice(h1End + 1).trim();
  }

  return { frontmatter, title, summary, details };
}

/**
 * Generate a slug ID from a title (mirrors server-side behavior).
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 64);
}

/**
 * Safely get a string from unknown data.
 */
export function getString(val: unknown): string {
  return typeof val === "string" ? val : String(val ?? "");
}
