# Security Notes

Last reviewed: June 2026

## Dependencies
Ran `npm audit` on current Astro 6 dependency tree. No critical or high-severity vulnerabilities in production dependencies. Dev dependencies (`gh-pages`) are pinned to specific versions.

## Build Pipeline
- Site is fully static — no server, no database, no user input handling at runtime
- Notion API key and database ID stored in `.env`, never committed
- `.gitignore` covers `.env`, `node_modules`, `.cache`, and build artifacts

## Content Security
- Content pulled from Notion at build time only — no runtime API calls
- Markdown and text content rendered through Astro's built-in sanitization
- No user-generated content accepted at runtime

## GitHub Pages
- Deployed from `gh-pages` branch via `gh-pages` npm package
- `.nojekyll` file present in `public/` for clean Astro asset serving
- Repository is public — credentials are never in source
