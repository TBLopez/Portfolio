# What Changed

## 2026

### September
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
