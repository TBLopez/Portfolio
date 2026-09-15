# Security Notes

Last reviewed: September 2026

## Dependencies
`npm audit` against the current Astro 6 / Tailwind 3 tree reports no critical or
high-severity advisories in production dependencies. `gh-pages` is the only
runtime-adjacent dev dependency and it is pinned.

## Build Pipeline
- Site is fully static. No server, no database, no runtime user input handling
  beyond the local command parser (which never leaves the browser)
- Notion credentials live in `.env` and are read at build time only; `.env` is
  gitignored
- No GitHub Actions workflow with secrets — deploys run locally via
  `npm run deploy`, which builds `dist/` and pushes it to `gh-pages`

## Content Security
- Notion content is fetched during the build and embedded as JSON in the page
- `index.astro` extracts plain text from Notion properties; nothing is rendered
  through `innerHTML`. Command output is built from DOM nodes with
  `textContent`, so `echo "<script>"` prints literally
- No user-generated content is accepted at runtime
- Third-party requests at runtime: none. Fonts are self-hosted, sound is
  synthesized with the Web Audio API, and the only external links are GitHub
  and LinkedIn (`rel="noopener noreferrer"`)

## Repository Hygiene
- `node_modules/` used to be committed (1,910 files) and a Gatsby-era `.cache/`
  directory (458 files) was tracked alongside it. Both are now untracked and
  gitignored; a fresh clone needs `npm install` once
- The Gatsby-era `static/` directory was not served by Astro at all — the
  favicons it held were 404ing on the live site. They now live in `public/`
- No credentials, tokens or personal documents are present in the tree or in
  the git history

## GitHub Pages
- Deployed from the `gh-pages` branch, with `.nojekyll` present so `_astro/`
  assets are served
- HTTPS enforced, certificate managed by GitHub, custom domain `tonykl.com`
