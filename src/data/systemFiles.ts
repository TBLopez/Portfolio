export type SystemFile = {
  /** One-line description shown on the `ls` card. */
  desc: string;
  /** Where `cat` points. Same-origin files embed; off-site links open out. */
  url: string;
  /** false renders as [SEALED] — the card is listed but `cat` refuses. */
  available: boolean;
  /**
   * Whether the viewer module may render the target inline. Off-site pages
   * (GitHub, LinkedIn, Notion exports) send X-Frame-Options / CSP headers
   * that make an <iframe> silently blank, so those get the link panel.
   * Defaults to false for anything added here.
   */
  embed?: boolean;
  /** Optional grouping label rendered next to the filename. */
  tag?: string;
};

/**
 * Archives that ship with the terminal itself — no CMS required.
 *
 * Deliberately only real, reachable targets. The earlier build listed five
 * personal PDFs as [SEALED] to avoid an empty directory; with Notion
 * credentials absent that made the whole listing read as filler, so the
 * placeholders are gone. Set NOTION_API_KEY + NOTION_DATA_SOURCE_ID (see
 * .env.example) and the directory fills with project entries instead.
 */
export const localFiles: Record<string, SystemFile> = {
  'firefly_src.url': {
    desc: 'This terminal — Astro + Tailwind source on GitHub',
    url: 'https://github.com/TBLopez/Portfolio',
    available: true,
    embed: false,
    tag: 'CODE',
  },
  'operator_repos.url': {
    desc: 'Public repositories & tooling',
    url: 'https://github.com/TBLopez',
    available: true,
    embed: false,
    tag: 'CODE',
  },
  'linkedin.url': {
    desc: 'Professional profile & work history',
    url: 'https://www.linkedin.com/in/techtony/',
    available: true,
    embed: false,
    tag: 'CONTACT',
  },
};
