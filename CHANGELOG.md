# What Changed

## 2026

### September
- The terminal answers one question in its own voice now. It takes a moment to
  reply, and the pause is deliberate. Nothing in `help` mentions it
- New `dig` — real DNS over HTTPS (Cloudflare, falling back to Google), with
  `A/AAAA/MX/TXT/NS/CNAME/SOA/CAA/ANY` and a dig-style answer block
- New `whois` — real RDAP records for domains and IP allocations: registrar,
  creation/expiry dates, status flags, nameservers, DNSSEC
- `nmap` now resolves its target with a real DoH lookup and reveals the port
  table line by line with keystroke ticks; results are deterministic per address
  and the table is labelled as simulated
- New `tour` — guided walkthrough of the machine, `Ctrl+C` aborts between steps
- New `share` — copies a `/?replay=` link that retypes your session on load, at
  double speed, restricted to known commands
- New rare **déjà vu** glitch: frame stutter, `DÉJÀ VU` flash, a surge of the
  rain, and an ASCII cat walking past the prompt. Hidden `dejavu` command to
  force it. Own badge; disabled under `prefers-reduced-motion`
- Project entries are now pulled from the public GitHub API at build time (own,
  non-archived repos) and merged with the Notion entries
- Rebuilt the sound: a mechanical switch under each keystroke, a falling-code tick as
  the typewriter prints, a carriage-return thunk and bell on Enter, a data shimmer on
  completion, a gated glitch on bad commands, a sub thump on boot, and a "digital rain"
  ambience that runs while the matrix effect is on. `sfx on|off`, `sfx 0-100`, `sfx test`
- Typing now feeds the rain: keystrokes surge the render loop and occasionally whoosh
  the ambience
- New `Ctrl+K` command palette — fuzzy filter over commands, actions and archives
- New `status` report: real build SHA, runtime, network, audio state and a badge
  progress bar. Boot POST lines now read real device values
- New hidden commands `neo` (full-screen glitch), `redpill`, `bluepill` + three badges
- Cleared the placeholder [SEALED] archives; `ls` lists only real, reachable targets
  unless Notion is connected
- Fixed the ASCII banner, `neofetch` logo and boot screens rendering as
  misaligned noise: added a 5 KB JetBrains Mono symbol subset so box-drawing
  and block glyphs stop falling back to a system font with the wrong advance
- Softened the scanline overlay, which was slicing 1px stems into dashes
- Fixed `reboot`, which cancelled the boot sequence it had just started
- Fixed `matrix on` reporting "enabled" while turning the rain off
- Fixed the Completionist badge being unreachable (command list was double-counting `clear`)
- Fixed the desktop sidebar being `aria-hidden` and invisible to screen readers
- `ls` with no entries now says so instead of printing nothing
- `cat` on an off-site URL shows a real panel instead of a silently blank iframe
- Restored the sealed archive listing, added a link viewer, clickable `ls` cards
- New: quick-command chips, clickable header/sidebar controls, `theme next`,
  `Ctrl+C` cancellation for long-running output
- New: real previous-session timestamp, OG/Twitter cards, JSON-LD, webmanifest,
  sitemap/robots, 180px apple-touch icon
- Housekeeping: untracked `node_modules/` and the legacy `.cache/`, moved the
  Gatsby-era `static/` icons into `public/`

## 2026

### June
- Rewrote README and project documentation
- Restored `Enter` key handler for command submission
- Adjusted typing sound pitch for subtler mechanical feel

### May
- Added command autocomplete and hacking minigame
- Sound effects for typing, command execution, and ambient terminal noise
- Log pane hidden by default, opens on explicit `log` command

### April
- Migrated from Gatsby to Astro for build speed and smaller output
- Ship `.nojekyll` so GitHub Pages serves the `_astro/` bundle correctly
- Refactored terminal core for performance, accessibility, and mobile

### March
- Five color themes with `theme <name>` command
- Matrix rain background effect
- Achievement system tracking discovered commands and themes
- Wardrobe Change achievement for trying every theme
- Mobile-responsive terminal layout

### Earlier
- Initial proof of concept (Gatsby)
- Notion CMS integration for project entries
- Command system with `help`, `ls`, `clear`, and keyboard shortcuts
