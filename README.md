# LocalDeck

A private, offline-first personal productivity dashboard that runs entirely in your browser. It works well as a browser homepage.

- **Quick stats**: greeting, today's date and clock, a ring showing today's habit completion, and a motivational quote generator (the quotes ship with the app).
- **Launchpad**: a grid of your own bookmarks. You can add, edit, remove and reorder them (use **Edit** mode, then drag). Each tile's icon can be:
  - the site's own favicon
  - an emoji
  - an image URL
  - an uploaded image, resized to 96×96 and stored locally
  - a colored letter tile
- **Habit tracker**: daily habits with a one-click checkbox for today. Each habit shows its current streak, best streak, 30-day completion rate and a 16-week matrix of past days. Click any square to fix a past day.
- **Brain dump**: a Markdown scratchpad that saves on every keystroke. It has Write, Split and Preview views, a formatting toolbar, Ctrl/⌘+B/I/K shortcuts, and lists that continue when you press Enter. Task-list checkboxes can be ticked in the preview.
- **Export / Import**: download everything as a formatted JSON file and restore it later. You can also drop a backup file onto the page.
- **Light and dark themes**: the page follows your system setting until you use the toggle.

There is no backend, no build step and nothing to install. The app is plain HTML, CSS and JavaScript and loads no external libraries, fonts or APIs.

## Data and privacy

All data is kept in `window.localStorage` under keys that start with `localdeck.`:

| Key                  | Contents                                             |
| -------------------- | ---------------------------------------------------- |
| `localdeck.habits`   | habits and their completion dates (`YYYY-MM-DD`)     |
| `localdeck.links`    | launchpad bookmarks and icons                        |
| `localdeck.notes`    | brain dump text and last-saved time                  |
| `localdeck.settings` | theme, editor view, current quote                    |

All of your GitHub Pages project sites share one origin (`<user>.github.io`). Because of that, LocalDeck only reads and writes its own `localdeck.*` keys, and Export only includes those keys.

Data stays in the browser you use. Clearing site data erases it, and it does not sync between devices. To move it to another browser, or to keep a backup, use **Export**.

When a tile uses the "Favicon" icon, the page loads `https://<that site>/favicon.ico` directly. No third-party favicon service is used.

### Backup format

```json
{
  "app": "LocalDeck",
  "schemaVersion": 1,
  "exportedAt": "2026-09-30T08:15:00.000Z",
  "summary": { "habits": 3, "habitCompletions": 42, "links": 8, "noteCharacters": 1234 },
  "data": {
    "settings": { "theme": "dark" },
    "habits": [{ "id": "…", "name": "Read", "color": "#6366f1", "createdAt": "2026-09-01", "completions": { "2026-09-29": true } }],
    "links": [{ "id": "…", "title": "GitHub", "url": "https://github.com/", "icon": { "type": "auto", "value": "" } }],
    "notes": { "content": "# Hello", "updatedAt": "2026-09-30T08:14:59.000Z" }
  }
}
```

Imports are validated and cleaned before anything is written. For example, unsafe link URLs such as `javascript:` are dropped. You are asked to confirm before your current data is replaced.

## Deploy to GitHub Pages

**Option A: GitHub Actions (included)**

1. Push this repository to GitHub.
2. Open **Settings → Pages → Build and deployment** and set **Source** to **GitHub Actions**.
3. Push to `main`, or run the **Deploy to GitHub Pages** workflow by hand. The site is published at `https://<user>.github.io/<repo>/`.

The workflow (`.github/workflows/deploy.yml`) publishes only `index.html` and `assets/`.

**Option B: deploy from a branch**

Open **Settings → Pages**, set **Source** to **Deploy from a branch**, and choose `main` (or `gh-pages`) with `/ (root)`. The `.nojekyll` file makes GitHub serve the files as they are.

### Use it as your homepage

Set your browser's homepage or new-tab page to your Pages URL. You can also open `index.html` straight from disk, because the scripts are classic scripts rather than ES modules. Note that `file://` and `https://` are separate origins, so each one keeps its own data.

## Run locally

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Project structure

```
index.html              page markup and dialogs
assets/css/styles.css   design tokens, light/dark themes, responsive layout
assets/js/core.js       namespace, utilities, storage layer, toasts/confirm
assets/js/markdown.js   safe, dependency-free Markdown renderer
assets/js/quotes.js     bundled quotes
assets/js/habits.js     habit tracker, streaks, completion matrix
assets/js/notes.js      brain dump editor with auto-save
assets/js/launchpad.js  bookmarks grid, icon handling, drag to reorder
assets/js/stats.js      date, clock, progress ring, quote generator
assets/js/backup.js     JSON export/import
assets/js/app.js        boot, theme toggle, first-run sample data, day rollover, cross-tab sync
```
