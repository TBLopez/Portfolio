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
| `status` | Build, runtime, audio and badge progress report |
| `dig <name> [type]` | Real DNS lookup over DNS-over-HTTPS (`A`, `AAAA`, `MX`, `TXT`, `NS`, `CNAME`, `SOA`, `CAA`, `ANY`) |
| `whois <domain\|ip>` | Real registration record over RDAP — registrar, dates, status flags, nameservers, DNSSEC |
| `nmap <host>` | Resolves the host for real, then prints a deterministic simulated port table |
| `tour` | Guided walkthrough of the machine, Ctrl+C to abort |
| `share` | Copies a link that replays your session |
| `top` `neofetch` | Process list, system info |
| `matrix` `theme` `tail` | Rain effect, palette, live log pane |
| `sfx` | Sound: `sfx on`, `sfx off`, `sfx 60`, `sfx test` |
| `palette` | Command palette (or just hit `Ctrl+K`) |
| `reboot` | Replay the boot sequence |
| `achievements` `history` `contact` | Badges, command history, channels |

Five commands are unlisted — the badge list gives hints.

`dig` and `whois` are the real thing. Both run in your browser against public
key-less services (Cloudflare/Google DoH for DNS, the RDAP bootstrap at rdap.org
for registrations) — no backend, no API key, nothing proxied through this site.
`nmap` resolves its target the same way, then labels the port table as
simulated, because it is. Try `dig github.com ANY`, `whois tonykl.com`, or
`whois 8.8.8.8`.

Keyboard: `Ctrl+K` (or `Ctrl+P`) opens the command palette, `Tab` completes and cycles matches, `↑`/`↓` walk history, `Ctrl+L` clears, `Ctrl+C` cancels the current output. Every command name in `help`, every `ls` card, the sidebar and the header buttons are clickable too. Typing also feeds the rain — the drops speed up under your fingers.

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

`NOTION_DATA_SOURCE_ID` is the Notion SDK v5 name for what used to be a database ID. Notion entries are read once at build time; the browser never sees the credentials.

The directory also lists `TBLopez`'s public GitHub repos, fetched during the same
build (`api.github.com/users/TBLopez/repos`, read-only). Forks and archived repos
are skipped; a repo with a live `homepage` links there. If the API is unreachable
the build carries on without those entries and logs a warning.

Anonymous GitHub requests are capped at 60/hour per IP, which repeated rebuilds
can exhaust. Set `GITHUB_TOKEN` (any read-only token) to lift it to 5,000/hour —
it is used as a request header only and never reaches the page.

## Adding Archives

Edit `src/data/systemFiles.ts`. Each entry is `{ desc, url, available, embed?, tag? }` — `available: false` renders as `[SEALED]` and `cat` refuses it, `embed: true` renders the target in an inline viewer, and anything else gets a link panel with an "open externally" button.

## Design Notes

Monospaced, uppercase, blinking cursors. The palette is one accent on near-black; everything else is hierarchy. Details live in `DESIGN.md`.

Three things worth knowing before you touch the art or the audio:

0. Sound is fully synthesized (`src/scripts/audio.ts`): a mechanical switch under your finger, a falling-code tick for printed characters, a carriage-return thunk and bell on Enter, a data shimmer when a block finishes, a gated glitch for bad commands, a sub thump on boot, an ambient "digital rain" bed with randomly panned crackles that runs while the
matrix effect is on, and one slow warm swell for the rare line the terminal
prints for itself. No audio files and no third-party requests — all of it behind the SFX master gain (`sfx 0-100`).
1. The banner, the `neofetch` logo and the boot screen are monospace ASCII art. They only line up because `public/fonts/jetbrains-mono-symbols-*.woff2` supplies the box-drawing and block glyphs at the font's true 0.6em advance. `@fontsource` subsets JetBrains Mono by unicode-range and ships none of them, so without that subset the browser substitutes a system font with a different advance and every piece of art shears apart.
2. The scanline overlay is deliberately weak (12% black on a 3px period). Anything stronger turns 1px stems into dashes.

## License

The code is mine. The terminal aesthetic belongs to everyone who's ever typed `ls` in a dark room. © 2026 Tony Khawaja-Lopez
