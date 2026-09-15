# Tony Khawaja-Lopez

A personal portfolio presented as a command-line interface. Phosphor green on black, a skippable BIOS boot, live typing sounds, and a browsable "directory" of archives — because sometimes a terminal says more than a landing page.

**[tonykl.com](https://tonykl.com)**

## What's Here

The site boots like a machine, then hands you a prompt. Commands drive everything: `help` lists them, `ls` shows the archive directory, `cat` opens one, `theme` repaints the whole UI, and a few hidden ones unlock operator badges. Project entries can come from a Notion database; without credentials it runs in local mode and lists the archives that ship with the site.

## Built With

- **Astro** — static output, one small client script for the terminal
- **Tailwind CSS** — compiled at build time with a CSS-variable palette
- **Notion API** — optional content source, queried at build time only
- **GitHub Pages** — deployed from the `gh-pages` branch
- **Self-hosted JetBrains Mono** — regular/bold/extrabold, plus a 5 KB symbol subset for the box-drawing art (see Design Notes)

## Commands

| Command | What it does |
|---------|--------------|
| `help` | List every command |
| `whoami` `pwd` `date` `echo` | The basics |
| `ls` / `cat <file>` | Browse and open archives |
| `nmap` `top` `neofetch` | Simulated recon, process list, system info |
| `matrix` `theme` `tail` | Rain effect, palette, live log pane |
| `reboot` | Replay the boot sequence |
| `achievements` `history` `contact` | Badges, command history, channels |

Keyboard: `Tab` completes (and cycles matches), `↑`/`↓` walk history, `Ctrl+L` clears, `Ctrl+C` cancels the current output. Every command name in `help`, every `ls` card, and the header buttons are clickable too.

## Themes

Five palettes, switchable from the prompt (`theme <name>`, or `theme next`):

| Theme | Look |
|-------|------|
| Matrix | phosphor green on black |
| Amber | amber CRT on near-black brown |
| Ice | cool blue on deep navy |
| Dracula | pink and lavender on dark slate |
| Mono | white on black |

Trying all five unlocks the Wardrobe Change badge. The choice persists in `localStorage` and updates the browser's `theme-color`.

## Running Locally

Requires Node 22.12+. Clone, install, start:

```bash
git clone https://github.com/TBLopez/Portfolio.git
cd Portfolio
npm install
npm run dev               # → http://localhost:4321
```

Build, preview, deploy:

```bash
npm run build             # → dist/
npm run preview
npm run deploy            # build + push dist/ to gh-pages
```

`.env` is optional. Without it the terminal runs in local mode:

```
NOTION_API_KEY=ntn_...
NOTION_DATA_SOURCE_ID=...
# NOTION_DATABASE_ID=...   ← older name, still accepted
```

`NOTION_DATA_SOURCE_ID` is the Notion SDK v5 name for what used to be a database ID. Entries are read once at build time; nothing is fetched from the browser.

## Adding Archives

Edit `src/data/systemFiles.ts`. Each entry is `{ desc, url, available, embed?, tag? }` — `available: false` renders as `[SEALED]` and `cat` refuses it, `embed: true` renders the target in an inline viewer, and anything else gets a link panel with an "open externally" button.

## Design Notes

Monospaced, uppercase, blinking cursors. The palette is one accent on near-black; everything else is hierarchy. Details live in `DESIGN.md`.

Two things worth knowing before you touch the art:

1. The banner, the `neofetch` logo and the boot screen are monospace ASCII art. They only line up because `public/fonts/jetbrains-mono-symbols-*.woff2` supplies the box-drawing and block glyphs at the font's true 0.6em advance. `@fontsource` subsets JetBrains Mono by unicode-range and ships none of them, so without that subset the browser substitutes a system font with a different advance and every piece of art shears apart.
2. The scanline overlay is deliberately weak (12% black on a 3px period). Anything stronger turns 1px stems into dashes.

## License

The code is mine. The terminal aesthetic belongs to everyone who's ever typed `ls` in a dark room. © 2026 Tony Khawaja-Lopez
