# Tony Khawaja-Lopez

A personal portfolio presented as a command-line interface. Green text on black, live typing sounds, and a directory of projects pulled from Notion — because sometimes a terminal says more than a landing page.

**[tblopez.github.io/Gatsby-Pages](https://tblopez.github.io/Gatsby-Pages)**

## What's Here

The site pulls project entries from a Notion database and renders them as a browsable "directory." There's an interactive command prompt, keyboard-driven navigation, and a handful of hacker-movie flourishes that make it feel alive.

## Built With

- **Astro** — static site, ships zero JavaScript by default
- **Notion API** — content lives in a database, not markdown files
- **GitHub Pages** — deployed from `gh-pages` branch on push
- **Tailwind CSS** — loaded from CDN, configured inline for the terminal color scheme

## Running Locally

```bash
git clone https://github.com/TBLopez/Gatsby-Pages.git
cd Gatsby-Pages
npm install
npm run dev
```

Build for production:

```bash
npm run build
npm run deploy
```

## Design

Monospaced, uppercase, blinking cursors. The color palette is two colors: a phosphor green and black. Everything else is distraction. The layout borrows from old terminals, sysadmin dashboards, and the feeling of typing something important at 2am.

Fonts: JetBrains Mono throughout. Icons from Material Symbols.

## Notion Integration

The site expects two environment variables:

```
NOTION_API_KEY=ntn_...
NOTION_DATABASE_ID=...
```

Without them it falls back to static content. With them, it queries a Notion database and renders whatever it finds — project names, descriptions, links, file attachments. Change the database, the site updates on next build.

## License

The code is mine. The terminal aesthetic belongs to everyone who's ever typed `ls` in a dark room. © 2024 Tony Khawaja-Lopez.
