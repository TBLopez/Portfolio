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
- Below: the command prompt, pinned with a safe-area-aware footer, plus a keyboard-shortcut strip on wide screens
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
Everything is synthesized with the Web Audio API — no audio assets are downloaded and no
third-party requests are made. Voices live in `src/scripts/audio.ts`:

| Voice | Recipe | Fires on |
|-------|--------|----------|
| `key` | highpassed noise click + bandpassed body (1.0–1.8 kHz) + 96–148 Hz thump, randomised per stroke, occasional rattle | every physical keystroke |
| `type` | 5.2–7.2 kHz noise tick + 1.5–2.7 kHz ping | each printed character (every third) |
| `enter` | 88→58 Hz thump + lowpassed noise + two bell partials (1046 / 1570 Hz) | command submitted |
| `done` | bandpass noise sweep 2.6 k→620 Hz + blip | end of a typed output block |
| `error` | square 220→78 Hz with a 7-step gate + noise crack | unknown command |
| `boot` | 42→68 Hz sub + noise swell | boot sequence |
| rain bed | filtered noise loop, 0.07 Hz LFO on the filter, randomly panned crackles every 140–520 ms | while the matrix effect is on |

Signals run through a bus into a short synthesized convolution room (0.42 s, decay 3.2)
then a master gain. Measured peak output sits near −18 dBFS, so fast typing doesn't clip.
Keystroke voices are rate-limited to one per 22 ms on the wall clock —
`performance.now()`, not `AudioContext.currentTime`, because a suspended context freezes
`currentTime` and would mute the keyboard entirely.

The context is created on first user gesture, the default state respects
`prefers-reduced-motion`, and both the mute choice and the volume persist in `localStorage`.

## Interaction
- **Ctrl+K / Ctrl+P** command palette — fuzzy filter over commands, actions and archives, `↑↓` to move, `⏎` to run. Easter-egg commands are deliberately excluded from it.
- **Typing feeds the rain** — keystrokes call `surge()`: the render loop speeds up (55 ms → 32 ms per frame), columns re-seed from the top, canvas opacity lifts to 0.85 for ~280 ms, and the rain bed occasionally whooshes.
- **Click-to-run** — anything carrying `data-command` behaves like a menu item (header, sidebar, welcome chips, `ls` cards).
- `neo`, `redpill`, `bluepill` — full-screen glitch flash, palette swap and badge unlock.
