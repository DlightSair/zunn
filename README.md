# Zunn

A personal, always-on launcher for Windows built with Electron. It lives in the tray,
comes up on a global hotkey, and gets you into a project, an app or a browser tab in
one keystroke.

![icon](assets/icon.png)

## What it does

**Projects** — name a folder once, then click it to open in VS Code. Every card also
offers the folder, a terminal in that directory, and an optional related URL
(localhost, the repo, a staging link). If the folder is a git repo the card shows the
current branch and how many files are dirty.

**Apps** — Teams, Spotify, Discord, anything. A card accepts an `.exe`/`.lnk` path, a
protocol URI (`msteams:`, `spotify:`), or a web app URL, plus optional arguments. Real
program icons are pulled from Windows automatically.

**Web** — pinned links, and an omnibar that opens whatever you type: a URL goes
straight there, anything else goes to your search engine. Comes with `!yt`, `!gh`,
`!gpt`, `!wiki`, `!ddg`, `!bing`, `!amazon` and `!maps` built in to send a search
straight to that site instead — `!yt lofi hip hop` opens YouTube search results.
Fully user-editable in Settings → Search shortcuts: edit or remove any of the
defaults, or add your own — a trigger word and a URL template with `{q}` where the
search text goes.

**Notes** — as many scratchpad boxes as you want; add and remove them freely, and each one autosaves as you type.

**A background image** — point it at any picture and it sits behind the interface with
its own opacity, blur and fit, entirely separate from the panel's own opacity. The
photo itself is never dimmed by default — the interface stays legible over it with a
hairline border, a drop shadow, a locally frosted patch of blur, and a soft text
shadow, all applied automatically the moment an image is set and dropped again the
moment it's removed. An optional Dim slider is there if a particularly busy photo
still needs it, but starts at zero. The file is copied into the app's own folder, so
moving or deleting the original changes nothing.

**Settings** — reached from the gear in the title bar, and deliberately short: name,
global hotkey, start with Windows, start hidden, hide-on-blur, always on top, theme,
window opacity, panel opacity, blur, corner radius, text size, the background image and
its controls, editor command, search engine, search shortcuts, and JSON export/import.

**Help** — reached from the `?` next to the gear (or the `?` key itself), a plain-text
walkthrough of everything above: every tab, the right-click menu, drag & drop, the
search bangs, and the full keyboard shortcut list.


## Run it

```bash
npm install
npm start
```

## Package it into an installer

```bash
npm run build
```

Output lands in `dist/` — an NSIS installer and a portable `.exe`.

## Default keys

| Key | Action |
| --- | --- |
| `Alt + Space` | show / hide the deck (rebindable in Settings) |
| `Ctrl + 1…4` | switch tabs |
| `Ctrl + ,` | open / close settings |
| `?` | open / close help (not while typing) |
| `Ctrl + N` | add an item to the current tab |
| `Ctrl + F` | focus the search bar |
| `↑ ↓ ← →` | move between cards |
| `Enter` | open the selection, or web-search what you typed |
| `Shift + Enter` | open a project's folder |
| `Ctrl + Enter` | open a terminal in a project |
| `Esc` | clear the search, then hide the window |

Right-click any card for the full menu (pin to top, copy path, edit, remove).
Drag a folder onto the window to add it as a project; drag an `.exe` to add an app.


## Layout

```
src/main/       main process: window, tray, hotkey, IPC, JSON store, launching
src/preload/    the only bridge between main and the UI
src/renderer/   the interface (no framework, no build step)
tools/          the UI preview server
```

## Notes

- The renderer runs with `contextIsolation` on and no Node access; every privileged
  action goes through a named IPC channel in `src/preload/index.js`.
- The window keeps running when closed — quit from the tray menu or Settings.
- `code` is resolved through the shell, so anything on `PATH` works as the editor:
  `code-insiders`, `cursor`, `subl`, `idea`, or a full path to an executable.

## Working on the interface

The renderer has no build step, so it also runs in a plain browser against a stubbed
IPC bridge — handy for design work without restarting Electron each time:

```bash
npm run preview
```

Then open http://localhost:4600. `src/renderer/__preview.html` holds the fake
`window.nexus` and some sample projects, apps and links; it is dev-only and is not
packaged into the app.

## Credits

The app icon is "Anime girl" by oksmith via Open Clipart, released under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) (public domain):
https://commons.wikimedia.org/wiki/File:Anime_girl_publicdomainq.png
