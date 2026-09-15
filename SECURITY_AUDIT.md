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
- Fonts are self-hosted, sound is synthesized with the Web Audio API, and the
  only outbound links are GitHub and LinkedIn (`rel="noopener noreferrer"`)
- **Runtime network calls are opt-in and visitor-initiated.** Three commands reach
  public, key-less services *from the visitor's browser* — nothing is proxied
  through this site and nothing is logged anywhere by it:
  - `dig` → `cloudflare-dns.com/dns-query`, falling back to `dns.google/resolve`.
    The queried name is visible to that resolver, which the command prints.
  - `whois` → `rdap.org` bootstrap (which redirects to the responsible registry).
  - `nmap` → one DoH A-record lookup to resolve the target. The port table is
    generated locally from a hash of the resolved address and is labelled as
    simulated in the output. No packets are sent to the scanned host.
  All three pass a `domain`/`IP`-only string, time out after 8–9 s, and abort on
  `Ctrl+C`.
- At build time `index.astro` fetches the public GitHub repo list
  (`api.github.com/users/TBLopez/repos`, unauthenticated, read-only, 7 s timeout,
  failures ignored) so the directory stays current without a CMS. Only
  name/description/language/URL fields are read; forks and archived repos are
  dropped. This is the only build-time request besides Notion.

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
