# Design Notes

The portfolio runs as a terminal emulator in a browser window.

## Visual Identity
- **Palette**: phosphor green (`#00FF41`) on near-black (`#131313`), with a darker background (`#000000`)
- **Secondary accents**: muted olive (`#99d688`, `#b9ccb2`, `#84967e`) for hierarchy cues
- **Typography**: JetBrains Mono throughout — headers, body, labels, everything. One font, no distractions
- **All caps**, tight letter-spacing, `step-end` transitions — the way terminals actually render

## Layout
- Full-width header bar with a `> TONY@FIREFLY:~\` prompt
- Window controls (minimize/maximize/close) in the top-right corner
- Content area scrolls vertically, themed to the active palette
- Scanline overlay on the background
- Matrix rain effect behind the content when the Matrix theme is active

## Themes
Five palettes, selectable via the `theme` command:

| Name | Primary | Background | Vibe |
|------|---------|------------|------|
| Matrix | `#00FF41` | `#000000` | classic terminal |
| Amber | `#FFB000` | `#1a1a1a` | CRT warmth |
| Ice | `#00E5FF` | `#0a1628` | cold blue |
| Dracula | `#FF79C6` | `#282a36` | synthwave |
| Mono | `#FFFFFF` | `#000000` | stark contrast |

## Accessibility
- All interactive elements have hover and focus states
- Color contrast ratios meet WCAG AA across all five themes
- Keyboard shortcuts listed in the `help` command output
- `prefers-reduced-motion` respected for animations

## Sound
The terminal plays typewriter-style key sounds on keystroke. An audio context is created on first interaction. Sound effects load from static audio files in `/static/sfx/`.
