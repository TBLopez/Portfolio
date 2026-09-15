# Design Notes

The portfolio runs as a terminal emulator in a browser window.

## Visual Identity
- **Palette**: phosphor green (`#00FF41`) on black, with a dark panel surface (`#131313`)
- **Secondary accents**: muted olive (`#99D688`, `#B9CCB2`, `#84967E`) for hierarchy cues
- **Typography**: JetBrains Mono for everything a terminal would print; Inter for the OS-chrome bits (header brand, sidebar labels)
- **All caps**, tight letter-spacing, `step-end` transitions — the way terminals actually render

## Layout
- Sticky header bar with a `> TONY@FIREFLY:~` prompt, working window controls (minimize = log pane, maximize = fullscreen, close = clear), SFX toggle
- Left sidebar: `SYSTEM_OS` panel, directory nav, uplink status. Static above `md`; a drawer with a scrim below it
- Center: session banner + scrolling terminal output
- Right: the `/var/log/firefly.log` pane, hidden until `tail`
- Below: the command prompt, pinned with a safe-area-aware footer
- Background layers, back to front: grid (`z-3`), matrix rain (`z-5`), content (`z-30`), chrome (`z-40`), achievements (`z-60`), boot overlay (`z-80`); the scanline overlay floats over everything at `z-50`

## Themes
Five palettes, selectable via the `theme` command, persisted in `localStorage`, and mirrored into `<meta name="theme-color">`.

| Name | Accent | Background | Vibe |
|------|--------|------------|------|
| Matrix | `#00FF41` | `#000000` | classic terminal |
| Amber | `#FFB000` | `#0C0700` | CRT warmth |
| Ice | `#4FC3F7` | `#000C16` | cold blue |
| Dracula | `#FF79C6` | `#111219` | synthwave |
| Mono | `#FFFFFF` | `#000000` | stark contrast |

All five keep body text above WCAG AA (lowest pair is Dracula at 7.8:1; the dimmest decorative borders sit near 1.6:1 by design).

## Type
- `--font-mono` in `global.css` is the single source of truth: `'JetBrains Mono', 'JetBrains Mono Symbols', ui-monospace, …`
- `JetBrains Mono Symbols` is a 5 KB subset (`U+2500-257F`, `U+2580-259F`, `U+25A0-25FF`) shipped so the ASCII art renders at the correct advance width on every OS. See the README for why this matters.
- The `@fontsource` imports are still split per-weight/per-subset for the normal text.

## Accessibility
- Skip link to the prompt (or `#main` on pages without a terminal)
- `role="log"` live region for output, marked `aria-busy` while the typewriter runs so screen readers get complete lines instead of single characters
- The sidebar is exposed on desktop and `aria-hidden` only while the mobile drawer is closed
- Command output is real DOM (text nodes for user input, never `innerHTML`), so there's no injection path
- `prefers-reduced-motion` freezes the typewriter, the rain, the scanlines and the toast animations

## Sound
Keystroke and command sounds are synthesized with the Web Audio API (`triangle` oscillator, ~180 Hz blips, 3 ms gain envelopes) — no audio assets are downloaded. The context is created on first user gesture, respects `prefers-reduced-motion` as the default state, and the mute choice persists in `localStorage`.
