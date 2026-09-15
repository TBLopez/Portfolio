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
 * Archives that ship with the terminal itself.
 *
 * These are the operator's own documents. They are listed as SEALED rather
 * than hidden because "request access" reads better than an empty directory,
 * and because `ls` with zero results was previously indistinguishable from a
 * broken command.
 *
 * (The PDFs themselves are not published — hence `available: false`.)
 */
export const localFiles: Record<string, SystemFile> = {
  'capstone.pdf': {
    desc: 'IT Capstone Report',
    url: '',
    available: false,
    tag: 'ACADEMIC',
  },
  'executive_pres.pdf': {
    desc: 'Executive Security Overview',
    url: '',
    available: false,
    tag: 'ACADEMIC',
  },
  'apt28.pdf': {
    desc: 'Threat Actor Profile — APT28 (Fancy Bear)',
    url: '',
    available: false,
    tag: 'THREAT INTEL',
  },
  'apt41.pdf': {
    desc: 'Case Study — APT41 (Double Dragon)',
    url: '',
    available: false,
    tag: 'THREAT INTEL',
  },
  'resume.pdf': {
    desc: 'Operator CV — full history & certifications',
    url: '',
    available: false,
    tag: 'PERSONNEL',
  },
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
};
