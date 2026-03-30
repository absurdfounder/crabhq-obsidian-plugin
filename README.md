# CrabsHQ Memory Sync

Bidirectional sync between your CrabsHQ team memories and Obsidian vault. Pull server memories as markdown files, push edits back, with conflict detection.

## Features

- **Bidirectional sync** — pull memories from CrabsHQ bridge, push local edits back
- **Delta sync** — only fetches changes since last sync (efficient)
- **Conflict detection** — if both sides changed, reports a conflict and lets you choose
- **File watchers** — automatically pushes when you save a memory file
- **Auto-sync** — configurable interval (5/15/30/60 min) or manual only
- **Commands** — sync, pull-all, push-all, generate MEMORY.md
- **Status bar** — live sync status and conflict count

## Setup

1. Install the plugin
2. Open **Settings → CrabsHQ Memory Sync**
3. Enter your **Bridge URL** (e.g. `https://org-xyz.crabhq.com`)
4. Either paste your existing API key or click **Generate Key** to create a new one
5. Configure the memories folder and sync interval
6. Click **Sync now** or use the 🧠 ribbon icon

## Memory file format

Each memory is stored as a markdown file in your configured folder:

```markdown
---
id: ferndesk-product
scope: org
tags: [company, product]
confidence: 0.8
source: {type: onboarding}
synced_at: 1774829995640
---
# Ferndesk - Product

AI-native help center platform.

## Details

Additional details go here.
```

## Commands

| Command | Description |
|---------|-------------|
| `CrabsHQ: Sync memories now` | Delta sync (pull + push changed) |
| `CrabsHQ: Pull all memories` | Full re-download from server |
| `CrabsHQ: Push all memories` | Push all local files to server |
| `CrabsHQ: Generate MEMORY.md` | Write full memory snapshot to `CrabsHQ/MEMORY.md` |

## Conflict resolution

When both the local file and the server copy have changed since the last sync, the plugin:
1. Reports the conflict to the server via `POST /api/memories/conflicts`
2. Shows a warning notice
3. Does **not** overwrite either version

Go to **Settings → CrabsHQ Memory Sync → Conflicts** to resolve by choosing **Use Local** or **Use Server**.

## Development

```bash
npm install
npm run build   # production build → main.js
npm run dev     # watch mode
```

## License

MIT
