import type { SystemFile } from '../data/systemFiles';
import type { ThemeName } from '../scripts/themes';
import type { SfxState, SfxVoice } from '../scripts/audio';
import {
  DNS_TYPE_LIST,
  dnsStatusName,
  dnsTypeName,
  dohQuery,
  isIpLiteral,
  portState,
  rdapLookup,
  resolveA,
  type DohResult,
} from '../scripts/net';
import {
  ACHIEVEMENTS,
  getAll,
  getUnlocked,
  isUnlocked,
  unlock,
} from '../scripts/achievements';

export type CommandContext = {
  files: Record<string, SystemFile>;
  notionConnected: boolean;
  history: string[];
  clear: () => void;
  toggleMatrix: () => boolean;
  setMatrix: (on: boolean) => boolean;
  matrixActive: () => boolean;
  toggleLogFeed: () => boolean;
  logVisible: () => boolean;
  setTheme: (name: ThemeName) => void;
  themes: readonly ThemeName[];
  currentTheme: () => ThemeName;
  triggerReboot: () => Promise<void>;
  setLastLogin: (label: string) => void;
  /** Stop anything long-running (used by Ctrl+C and `clear`). */
  interruptAll: () => void;
  /** Register a cleanup for the current long-running output. */
  registerInterrupt: (fn: () => void) => () => void;
  /** Sound engine surface. */
  sfx: {
    state: () => SfxState;
    setMuted: (muted: boolean) => void;
    setVolume: (volume: number) => void;
    play: (voice: SfxVoice) => void;
  };
  /** Ctrl+K overlay. */
  openPalette: () => void;
  /** Full-screen Matrix flash. */
  glitch: (messages: string[]) => void;
  /** Scripted walkthrough (Ctrl+C aborts). */
  startTour: () => void;
  /** Glitch the screen and send a cat past the prompt. */
  dejavu: () => void;
  /** Injected at build time. */
  build: { sha: string; builtAt: string };
};

export type CommandResult = {
  node: HTMLElement;
  typewrite: boolean;
};

export type Command = (args: string[], ctx: CommandContext) => CommandResult | void;

/**
 * Questions the machine answers in its own voice.
 *
 * These are deliberately not commands: they never appear in `help`, the
 * palette or the badge list, they don't count toward Completionist, and a
 * misspelling just falls through to the normal unknown-command path. Matched
 * against a normalised line, so punctuation and casing don't matter.
 */
const SPOKEN: Array<{ match: RegExp; reply: string }> = [
  { match: /^(am i|are we)( really)? alone$/, reply: 'you are not alone.' },
];

/** Returns the reply to a spoken line, or null if it is just a command. */
export function spokenReply(raw: string): string | null {
  const line = raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return SPOKEN.find((phrase) => phrase.match.test(line))?.reply ?? null;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else node.setAttribute(k, v);
  }
  for (const child of children) {
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

function output(className: string, ...children: (Node | string)[]): HTMLElement {
  return el('div', { class: `ml-4 mt-2 ${className}` }, ...children);
}

function errorLine(msg: string): HTMLElement {
  return output('text-error', msg);
}

/** Async output lands after the node is already on screen — nudge the scroll. */
function scrollToEnd(): void {
  window.dispatchEvent(new Event('firefly:scroll'));
}

function dim(text: string, className = 'opacity-70'): HTMLElement {
  return el('div', { class: className }, text);
}

/** `name  TTL  IN  TYPE  data`, the way dig aligns it. */
function rrLine(rr: { name: string; TTL: number; type: number; data: string }): HTMLElement {
  const name = rr.name.padEnd(30, ' ');
  const ttl = String(rr.TTL).padStart(6, ' ');
  const type = dnsTypeName(rr.type).padEnd(7, ' ');
  return el(
    'div',
    { class: 'whitespace-pre-wrap break-words' },
    `${name}${ttl}  IN  ${type}`,
    el('span', { class: 'text-white' }, rr.data),
  );
}

const helpRows: Array<[string, string]> = [
  ['whoami', 'Display current operator info'],
  ['pwd', 'Print working directory'],
  ['date', 'Display system time'],
  ['echo [text]', 'Print arguments'],
  ['ls', 'List available archives'],
  ['cat [file]', 'Open archive inline'],
  ['status', 'Build, runtime and progress report'],
  ['dig [name]', 'Live DNS lookup (type: A/AAAA/MX/TXT/NS/ANY)'],
  ['whois [domain]', 'Live RDAP registration record'],
  ['nmap [host]', 'Resolve a host, then a simulated port scan'],
  ['tour', 'Guided walkthrough of the terminal'],
  ['share', 'Copy a link that replays your session'],
  ['top', 'Live process list'],
  ['neofetch', 'System information'],
  ['matrix', 'Toggle matrix rain effect'],
  ['theme [name]', 'Switch palette: matrix/amber/ice/dracula/mono'],
  ['sfx', 'Sound: on/off, volume 0-100, test'],
  ['tail', 'Toggle live log feed pane'],
  ['reboot', 'Replay the boot sequence'],
  ['palette', 'Open the command palette (Ctrl+K)'],
  ['achievements', 'Show operator badges'],
  ['contact', 'Show contact channels'],
  ['history', 'Show recent commands'],
  ['clear', 'Clear terminal output (Ctrl+L)'],
  ['help', 'Show this command list'],
];

export const commands: Record<string, Command> = {
  help(_args, ctx) {
    const grid = el('div', {
      class:
        'mt-2 grid grid-cols-[110px_1fr] gap-y-1 gap-x-2 sm:grid-cols-[140px_1fr] lg:grid-cols-[200px_1fr]',
    });
    for (const [name, desc] of helpRows) {
      grid.append(
        el('span', { class: 'opacity-70' }, name),
        el('span', {}, desc),
      );
    }
    const status = ctx.notionConnected
      ? el(
          'div',
          { class: 'mt-3 opacity-70 text-[10px] text-primary-container' },
          'DATABASE UPLINK ACTIVE // CMS ENABLED',
        )
      : el(
          'div',
          { class: 'mt-3 opacity-70 text-[10px] text-error' },
          'DATABASE UPLINK OFFLINE // LOCAL MODE',
        );

    const socials = el(
      'div',
      {
        class:
          'mt-3 border-t border-outline-variant/40 pt-2 opacity-70 text-[10px]',
      },
      'SOCIAL_LINKS: ',
    );
    socials.append(
      el(
        'a',
        {
          href: 'https://github.com/TBLopez',
          target: '_blank',
          rel: 'noopener noreferrer',
          class: 'hover:text-white underline',
        },
        'github',
      ),
      document.createTextNode(' | '),
      el(
        'a',
        {
          href: 'https://www.linkedin.com/in/techtony/',
          target: '_blank',
          rel: 'noopener noreferrer',
          class: 'hover:text-white underline',
        },
        'linkedin',
      ),
    );

    const box = el('div', { class: 'text-primary-container ml-4 mt-2' });
    box.append(
      el('div', {}, 'AVAILABLE COMMANDS:'),
      grid,
      socials,
      el(
        'div',
        { class: 'mt-1 opacity-70 text-[10px]' },
        'TIP: Ctrl+K opens the command palette. Tab completes, ↑↓ recall history, and every command name here is clickable.',
      ),
      el(
        'div',
        { class: 'mt-1 opacity-50 text-[10px]' },
        'Unlisted commands exist. Operator badges know more.',
      ),
      status,
    );
    return { node: box, typewrite: true };
  },

  pwd() {
    return {
      node: output('text-primary-container', '/home/operator/firefly/tony'),
      typewrite: true,
    };
  },

  whoami() {
    const box = output('text-primary-container');
    box.append(
      el('span', { class: 'block' }, 'TONY LOPEZ // SECURITY_ANALYST'),
      el(
        'span',
        { class: 'block opacity-80 mt-1' },
        'Specializing in security, penetration testing, and tactical development.',
      ),
      el(
        'span',
        { class: 'block opacity-80 mt-1' },
        "Run 'ls' for archives, 'contact' for channels, or 'neofetch' for machine stats.",
      ),
    );
    return { node: box, typewrite: true };
  },

  sudo() {
    unlock('oops');
    return {
      node: output(
        'text-error font-bold select-none uppercase',
        '[!] SECURITY ALERT [!] ACCESS DENIED: THIS INCIDENT WILL BE REPORTED.',
      ),
      typewrite: true,
    };
  },

  date() {
    return {
      node: output('text-primary-container', new Date().toString()),
      typewrite: true,
    };
  },

  echo(args) {
    return {
      node: output('text-white whitespace-pre-wrap', args.join(' ')),
      typewrite: true,
    };
  },

  contact() {
    const box = output('text-primary-container');
    const row = (label: string, href: string, display: string) =>
      el(
        'div',
        { class: 'flex gap-3' },
        el('span', { class: 'opacity-70 w-20 shrink-0' }, label),
        el(
          'a',
          {
            href,
            target: '_blank',
            rel: 'noopener noreferrer',
            class: 'hover:text-white underline text-secondary break-all',
          },
          display,
        ),
      );
    box.append(
      row('github', 'https://github.com/TBLopez', 'github.com/TBLopez'),
      row(
        'linkedin',
        'https://www.linkedin.com/in/techtony/',
        'linkedin.com/in/techtony',
      ),
      el(
        'div',
        { class: 'mt-2 opacity-60 text-[10px]' },
        'OPEN TO WORK // SECURITY ANALYST / SOC / PENTEST ROLES',
      ),
    );
    return { node: box, typewrite: true };
  },

  history(_args, ctx) {
    const box = output('text-primary-container');
    if (ctx.history.length === 0) {
      box.append(el('div', { class: 'opacity-70' }, '(history empty)'));
    } else {
      ctx.history.forEach((cmd, i) => {
        box.append(
          el(
            'div',
            { class: 'grid grid-cols-[48px_1fr]' },
            el('span', { class: 'opacity-60' }, String(i + 1).padStart(3, ' ')),
            el('span', {}, cmd),
          ),
        );
      });
    }
    return { node: box, typewrite: false };
  },

  clear(_args, ctx) {
    ctx.clear();
  },

  nmap(args, ctx) {
    const target = args[0] || '127.0.0.1';
    const wrapper = output('text-primary-container');
    const head = el('div', { class: 'opacity-70' });
    const stage = el('div', { class: 'mt-1' });
    const table = el('div', { class: 'mt-2 hidden' });
    const verdict = el('div', { class: 'mt-2 hidden' });
    wrapper.append(head, stage, table, verdict);

    const timers: number[] = [];
    const controller = new AbortController();
    ctx.registerInterrupt(() => {
      timers.forEach((id) => window.clearTimeout(id));
      controller.abort();
      stage.textContent = 'nmap: scan aborted.';
    });

    const PORTS: Array<[number, string]> = [
      [22, 'ssh'],
      [25, 'smtp'],
      [53, 'domain'],
      [80, 'http'],
      [111, 'rpcbind'],
      [443, 'https'],
      [445, 'microsoft-ds'],
      [3306, 'mysql'],
      [3389, 'ms-wbt-server'],
      [5432, 'postgresql'],
      [6379, 'redis'],
      [8080, 'http-proxy'],
      [8443, 'https-alt'],
      [27017, 'mongodb'],
    ];

    void (async () => {
      let ip = target;
      head.textContent = `Starting firefly-nmap at ${new Date().toLocaleTimeString()}`;
      stage.textContent = `Resolving ${target} …`;

      if (!isIpLiteral(target)) {
        const resolved = await resolveA(target, controller.signal);
        if (!resolved) {
          stage.textContent = `nmap: failed to resolve "${target}" — no A record (try dig ${target}).`;
          scrollToEnd();
          return;
        }
        ip = resolved;
        stage.replaceChildren(
          el('div', {}, `Nmap scan report for ${target} (${ip})`),
          el('div', { class: 'opacity-70' }, 'DNS resolved live over DoH'),
          el('div', { class: 'opacity-70 text-[10px]' }, '[!] port table below is simulated — no packets leave the browser'),
        );
      } else {
        stage.replaceChildren(
          el('div', {}, `Nmap scan report for ${ip}`),
          el('div', { class: 'opacity-70 text-[10px]' }, '[!] port table below is simulated — no packets leave the browser'),
        );
      }

      table.classList.remove('hidden');
      table.append(el('div', { class: 'text-error' }, 'PORT       STATE      SERVICE'));
      const rows: HTMLElement[] = [];
      for (const [port, service] of PORTS) {
        const state = portState(ip, port);
        rows.push(
          el(
            'div',
            { class: 'text-white' },
            `${`${port}/tcp`.padEnd(11, ' ')}`,
            el(
              'span',
              { class: state === 'open' ? 'text-primary-container' : state === 'filtered' ? 'text-error' : 'opacity-50' },
              state.padEnd(11, ' '),
            ),
            service,
          ),
        );
      }
      rows.forEach((row, i) => {
        const id = window.setTimeout(() => {
          table.append(row);
          ctx.sfx.play('type');
          scrollToEnd();
        }, 130 * i);
        timers.push(id);
      });

      const done = window.setTimeout(() => {
        const open = PORTS.filter(([port]) => portState(ip, port) === 'open');
        const filtered = PORTS.filter(([port]) => portState(ip, port) === 'filtered');
        verdict.classList.remove('hidden');
        verdict.replaceChildren(
          el(
            'div',
            { class: 'mt-2' },
            `${PORTS.length} ports probed · ${open.length} open · ${filtered.length} filtered`,
          ),
          open.length > 0
            ? el(
                'div',
                { class: 'mt-1 text-error font-bold' },
                `[!] ${open.length} EXPOSED SERVICE${open.length === 1 ? '' : 'S'} — harden these first.`,
              )
            : el('div', { class: 'mt-1 text-primary-container' }, '[ok] no open ports in the probe set.'),
          el(
            'div',
            { class: 'mt-2 opacity-70 text-[10px]' },
            'For a real scan of a host you own: nmap -sV -p- <target>',
          ),
        );
        scrollToEnd();
      }, 130 * rows.length + 220);
      timers.push(done);
    })();

    unlock('recon');
    return { node: wrapper, typewrite: false };
  },

  dig(args, ctx) {
    const name = args[0];
    const requested = (args[1] || 'A').toUpperCase();
    if (!name) {
      return {
        node: errorLine(`dig: usage: dig <name> [type] — types: ${DNS_TYPE_LIST}, ANY`),
        typewrite: false,
      };
    }
    const wrapper = output('text-primary-container');
    const header = el(
      'div',
      { class: 'opacity-70' },
      `; <<>> firefly dig 1.0 <<>> ${name} ${requested}`,
    );
    const body = el('div', { class: 'mt-1 opacity-70' }, `;; querying ${requested} for ${name} over DoH …`);
    wrapper.append(header, body);

    const controller = new AbortController();
    ctx.registerInterrupt(() => controller.abort());

    void (async () => {
      const types = requested === 'ANY' ? ['A', 'AAAA', 'MX', 'TXT', 'NS'] : [requested];
      try {
        const results: DohResult[] = [];
        for (const type of types) {
          results.push(await dohQuery(name, type, controller.signal));
        }
        const primary = results[0];
        const answers = results.flatMap((r) => r.answers);
        const authority = results.flatMap((r) => r.authority);

        body.replaceChildren(
          dim(
            `;; ->>HEADER<<- opcode: QUERY, status: ${dnsStatusName(primary.status)}, qdcount: ${types.length}`,
          ),
          dim(';; flags: qr rd ra; QUERY: ' + types.length + ', ANSWER: ' + answers.length + ', AUTHORITY: ' + authority.length),
          el('div', { class: 'mt-2 opacity-70' }, ';; QUESTION SECTION:'),
          ...types.map((type) =>
            el('div', {}, `;${name}.`.padEnd(32, ' '), `IN	${type}`),
          ),
        );

        if (answers.length > 0) {
          body.append(el('div', { class: 'mt-2 opacity-70' }, ';; ANSWER SECTION:'));
          for (const rr of answers) body.append(rrLine(rr));
        } else {
          body.append(
            el(
              'div',
              { class: 'mt-2 text-error' },
              `;; no ${types.join('/')} records — status ${dnsStatusName(primary.status)}`,
            ),
          );
        }

        if (authority.length > 0 && answers.length === 0) {
          body.append(el('div', { class: 'mt-2 opacity-70' }, ';; AUTHORITY SECTION:'));
          for (const rr of authority.slice(0, 4)) body.append(rrLine(rr));
        }

        body.append(
          dim(`;; Query time: ${results.reduce((sum, r) => sum + r.ms, 0)} msec`, 'mt-2 opacity-70'),
          dim(`;; SERVER: ${primary.resolver}`, 'opacity-70'),
          dim(`;; WHEN: ${new Date().toString()}`, 'opacity-70'),
          dim(';; NOTE: resolution happens in your browser; the query name is visible to the resolver.', 'mt-2 opacity-50 text-[10px]'),
        );
      } catch (error) {
        body.replaceChildren(
          el(
            'div',
            { class: 'text-error' },
            `;; connection to the resolvers failed: ${error instanceof Error ? error.message : String(error)}`,
          ),
          dim(';; check your network, or the resolver may be rate limiting.', 'mt-1 opacity-70'),
        );
      }
      scrollToEnd();
    })();

    return { node: wrapper, typewrite: false };
  },

  whois(args, ctx) {
    const query = args[0]?.trim();
    if (!query) {
      return {
        node: errorLine('whois: usage: whois <domain|ip>   e.g. whois tonykl.com'),
        typewrite: false,
      };
    }
    const wrapper = output('text-primary-container');
    const body = el('div', { class: 'mt-1 opacity-70' }, `;; asking RDAP about ${query} …`);
    wrapper.append(body);

    const controller = new AbortController();
    ctx.registerInterrupt(() => controller.abort());

    void (async () => {
      try {
        const info = await rdapLookup(query, controller.signal);
        const rows: Array<[string, string]> = [];
        if (info.kind === 'domain') {
          rows.push(['Domain Name', info.name]);
          if (info.registrar) rows.push(['Registrar', info.registrar]);
          if (info.createdAt) rows.push(['Created', info.createdAt]);
          if (info.updatedAt) rows.push(['Updated', info.updatedAt]);
          if (info.expiresAt) rows.push(['Expires', info.expiresAt]);
          if (info.status.length) rows.push(['Status', info.status.join(', ')]);
          if (info.nameservers.length) rows.push(['Name Servers', info.nameservers.join('\n')]);
          if (info.dnssec) rows.push(['DNSSEC', info.dnssec]);
          if (info.handle) rows.push(['Registry ID', info.handle]);
        } else {
          rows.push(['Network', info.name]);
          if (info.network) rows.push(['CIDR', info.network]);
          if (info.country) rows.push(['Country', info.country]);
          if (info.handle) rows.push(['Handle', info.handle]);
          if (info.status.length) rows.push(['Status', info.status.join(', ')]);
        }

        const grid = el('div', { class: 'mt-2 grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 text-[11px]' });
        for (const [label, value] of rows) {
          grid.append(
            el('span', { class: 'text-secondary opacity-80' }, label),
            el('span', { class: 'text-white/90 whitespace-pre-wrap break-words' }, value),
          );
        }
        body.replaceChildren(
          el('div', { class: 'text-secondary tracking-widest text-[11px]' }, `RDAP RECORD — ${info.kind.toUpperCase()}`),
          grid,
          dim(`;; ${info.ms} msec via rdap.org bootstrap · source of truth: the responsible registry`, 'mt-2 opacity-50 text-[10px]'),
        );
      } catch (error) {
        body.replaceChildren(
          el(
            'div',
            { class: 'text-error' },
            `whois: ${error instanceof Error ? error.message : String(error)}`,
          ),
          dim(';; RDAP covers registered domains and IP allocations. Check the spelling, or try the IP form.', 'mt-1 opacity-70'),
        );
      }
      scrollToEnd();
    })();

    return { node: wrapper, typewrite: false };
  },

  tour(_args, ctx) {
    ctx.startTour();
    return {
      node: output('text-primary-container', 'tour: starting guided walkthrough — Ctrl+C to abort.'),
      typewrite: false,
    };
  },

  share(_args, ctx) {
    const steps = ctx.history
      .filter((c) => !c.startsWith('share') && c !== 'clear' && c !== 'reboot' && c !== 'tour')
      .slice(-12);
    if (steps.length === 0) {
      return {
        node: errorLine('share: nothing to replay yet — run a few commands first.'),
        typewrite: false,
      };
    }
    const url = `${window.location.origin}/?replay=${encodeURIComponent(steps.join(','))}`;
    const box = output('text-primary-container');
    const link = el(
      'div',
      { class: 'mt-1 break-all text-secondary select-all' },
      url,
    );
    box.append(
      el('div', {}, `replay link for ${steps.length} command${steps.length === 1 ? '' : 's'}:`),
      link,
      dim(';; anyone opening it watches this session type itself out.', 'mt-2 opacity-70 text-[10px]'),
    );

    navigator.clipboard
      ?.writeText(url)
      .then(() => {
        box.append(dim(';; copied to clipboard.', 'mt-1 opacity-70 text-[10px]'));
      })
      .catch(() => {
        box.append(dim(';; clipboard blocked — copy the line above.', 'mt-1 opacity-70 text-[10px]'));
      });

    return { node: box, typewrite: false };
  },

  dejavu(_args, ctx) {
    ctx.dejavu();
    return {
      node: output('text-primary-container', 'there is no spoon.'),
      typewrite: false,
    };
  },

  ls(_args, ctx) {
    const entries = Object.entries(ctx.files);
    const wrapper = el('div', { class: 'ml-4 mt-2' });

    if (entries.length === 0) {
      // Previously this rendered an empty grid: indistinguishable from a
      // command that silently failed.
      wrapper.append(
        el('div', { class: 'opacity-80' }, 'total 0 — no archives mounted.'),
        el(
          'div',
          { class: 'mt-1 opacity-60 text-[11px]' },
          ctx.notionConnected
            ? 'Uplink is up but the database returned no entries. Check the data source.'
            : "Uplink offline. Set NOTION_API_KEY + NOTION_DATA_SOURCE_ID to publish project entries.",
        ),
        el(
          'div',
          { class: 'mt-1 opacity-60 text-[11px]' },
          "Try 'contact' for channels or 'whoami' for the operator profile.",
        ),
      );
      return { node: wrapper, typewrite: false };
    }

    const openable = entries.filter(([, f]) => f.available).length;
    wrapper.append(
      el(
        'div',
        { class: 'opacity-60 text-[10px] mb-2' },
        `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} · ${openable} open · ${entries.length - openable} sealed · click a card to cat it`,
      ),
    );

    const grid = el('div', {
      class: 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3',
    });
    // Available archives first so the useful stuff is top-left.
    const ordered = [...entries].sort((a, b) => Number(b[1].available) - Number(a[1].available));
    for (const [name, file] of ordered) {
      const card = el(
        'button',
        {
          type: 'button',
          'data-command': `cat ${name}`,
          'aria-label': file.available
            ? `Open ${name}: ${file.desc}`
            : `${name} is sealed: ${file.desc}`,
          class: 'bento-card hover-lift text-left w-full cursor-pointer',
        },
        el(
          'div',
          {
            class: `font-bold text-sm flex items-center gap-2 ${file.available ? 'text-primary-container' : 'text-primary-container/60'}`,
          },
          el('span', { class: 'truncate' }, name),
          file.available
            ? el('span', { class: 'ml-auto text-[9px] text-secondary shrink-0' }, '[OPEN]')
            : el('span', { class: 'ml-auto text-[9px] text-error shrink-0' }, '[SEALED]'),
        ),
        el(
          'div',
          { class: 'text-[10px] text-white/60 mt-1 line-clamp-2' },
          file.desc,
        ),
        file.tag
          ? el('div', { class: 'text-[9px] opacity-50 mt-2 tracking-widest' }, file.tag)
          : '',
      );
      grid.append(card);
    }
    wrapper.append(grid);
    return { node: wrapper, typewrite: false };
  },

  cat(args, ctx) {
    const filename = args[0];
    if (!filename) {
      return {
        node: output(
          'text-error',
          "cat: missing file operand — usage: cat <file> (run 'ls' for the list)",
        ),
        typewrite: false,
      };
    }
    const file = ctx.files[filename];
    if (!file) {
      return {
        node: errorLine(`cat: ${filename}: No such file or directory`),
        typewrite: false,
      };
    }
    if (!file.available || !file.url || file.url === '#') {
      return {
        node: output(
          'text-error',
          `cat: ${filename}: archive sealed — contact operator for access`,
        ),
        typewrite: false,
      };
    }

    const wrapper = el('div', {
      class: 'ml-4 mt-4 w-full max-w-4xl bg-surface border border-outline-variant mb-8',
    });
    const header = el(
      'div',
      {
        class:
          'bg-primary-container text-black text-[10px] font-bold px-2 py-1 flex justify-between items-center select-none uppercase tracking-widest',
      },
      el('span', { class: 'truncate' }, `VIEWER_MODULE // ${filename}`),
    );
    const link = el(
      'a',
      {
        href: file.url,
        target: '_blank',
        rel: 'noopener noreferrer',
        class:
          'hover:bg-black hover:text-primary-container transition-colors mr-2 flex items-center gap-1 bg-black/15 px-2 py-0.5 shrink-0 font-bold',
        'aria-label': `Open ${filename} in a new tab`,
      },
      '[NEW_SYS_WINDOW]',
    );
    header.append(link);
    wrapper.append(header);

    if (file.embed) {
      const frameBox = el('div', { class: 'w-full bg-black p-1' });
      frameBox.append(
        el('iframe', {
          src: file.url,
          class:
            'w-full h-[60vh] border-none bg-white grayscale-[0.3] contrast-[1.1]',
          title: filename,
          loading: 'lazy',
        }),
      );
      wrapper.append(frameBox);
    } else {
      // GitHub, LinkedIn, Notion and friends all send X-Frame-Options/CSP
      // headers, so an iframe here renders as a silent white void. Show the
      // metadata and a real call to action instead.
      wrapper.append(
        el(
          'div',
          { class: 'p-4 flex flex-col gap-3' },
          el('div', { class: 'text-[11px] opacity-80' }, file.desc),
          el(
            'div',
            { class: 'text-[10px] opacity-60 break-all' },
            file.url,
          ),
          el(
            'div',
            { class: 'text-[10px] opacity-60' },
            'EXTERNAL RESOURCE — browsers block inline embedding, so this opens in a new tab.',
          ),
          el(
            'a',
            {
              href: file.url,
              target: '_blank',
              rel: 'noopener noreferrer',
              class:
                'self-start border border-primary-container text-primary-container px-3 py-1.5 text-[11px] uppercase tracking-widest hover:bg-primary-container hover:text-black transition-colors',
            },
            'Open externally',
          ),
        ),
      );
    }
    unlock('archivist');
    return { node: wrapper, typewrite: false };
  },

  matrix(args, ctx) {
    const arg = (args[0] || '').toLowerCase();
    let on: boolean;
    if (arg === 'on' || arg === 'off') {
      // Explicit state: previously `matrix on` while the rain was already
      // running toggled it OFF and still printed "rain enabled".
      on = ctx.setMatrix(arg === 'on');
    } else {
      on = ctx.toggleMatrix();
    }
    if (on) unlock('rainmaker');
    return {
      node: output(
        'text-primary-container',
        on ? 'matrix: rain enabled — wake up, neo.' : 'matrix: rain disabled.',
      ),
      typewrite: false,
    };
  },

  theme(args, ctx) {
    const requested = (args[0] || '').toLowerCase();
    if (!requested) {
      const box = output('text-primary-container');
      box.append(
        el('div', {}, `current theme: ${ctx.currentTheme()}`),
        el(
          'div',
          { class: 'opacity-80 mt-1' },
          `available: ${ctx.themes.join(', ')}`,
        ),
        el(
          'div',
          { class: 'opacity-60 text-[10px] mt-1' },
          'usage: theme <name> | theme next',
        ),
      );
      return { node: box, typewrite: false };
    }
    const name =
      requested === 'next'
        ? ctx.themes[(ctx.themes.indexOf(ctx.currentTheme()) + 1) % ctx.themes.length]
        : requested;
    if (!(ctx.themes as readonly string[]).includes(name)) {
      return {
        node: errorLine(
          `theme: unknown palette "${requested}". try: ${ctx.themes.join(', ')}`,
        ),
        typewrite: false,
      };
    }
    ctx.setTheme(name as ThemeName);
    return {
      node: output('text-primary-container', `theme: switched to ${name}.`),
      typewrite: false,
    };
  },

  tail(_args, ctx) {
    const visible = ctx.toggleLogFeed();
    if (visible) unlock('packet_sniffer');
    return {
      node: output(
        'text-primary-container',
        visible
          ? 'tail -f /var/log/firefly.log — feed engaged.'
          : 'tail: feed detached.',
      ),
      typewrite: false,
    };
  },

  reboot(_args, ctx) {
    unlock('reboot_loop');
    void ctx.triggerReboot();
    return {
      node: output('text-primary-container', 'reboot: signaling kernel ...'),
      typewrite: false,
    };
  },

  neofetch() {
    const ua = navigator.userAgent;
    const lang = navigator.language || 'en-US';
    const cores = (navigator.hardwareConcurrency || 1) + ' threads';
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    const browser = (() => {
      if (/firefox/i.test(ua)) return 'Firefox';
      if (/edg/i.test(ua)) return 'Edge';
      if (/chrome/i.test(ua)) return 'Chrome';
      if (/safari/i.test(ua)) return 'Safari';
      return 'Unknown';
    })();
    const theme = document.documentElement.getAttribute('data-theme') || 'matrix';
    const logo = [
      '╔═══════════╗',
      '║ ░░▒▒▓▓██  ║',
      '║ ▓▓██▒▒░░  ║',
      '║   FIREFLY ║',
      '║   v.1.0.0 ║',
      '╚═══════════╝',
    ];
    const stats: Array<[string, string]> = [
      ['operator', 'tony@firefly'],
      ['os', 'FireflyOS x86_64'],
      ['kernel', '6.0.8-firefly'],
      ['shell', '/bin/firefly-sh'],
      ['theme', theme],
      ['terminal', browser],
      ['language', lang],
      ['cpu', cores],
      ['viewport', `${w}x${h} @ ${dpr}x`],
      ['uptime', `${Math.floor(performance.now() / 1000)}s`],
    ];
    const wrapper = el('div', { class: 'ml-4 mt-2 flex gap-4 flex-wrap' });
    const logoCol = el('pre', {
      class: 'text-primary-container text-[11px] leading-tight m-0',
    });
    logoCol.textContent = logo.join('\n');
    const statsCol = el('div', { class: 'text-[12px] flex flex-col gap-0.5' });
    for (const [k, v] of stats) {
      statsCol.append(
        el(
          'div',
          { class: 'flex gap-2' },
          el('span', { class: 'text-secondary w-24 shrink-0' }, k),
          el('span', { class: 'text-white' }, v),
        ),
      );
    }
    wrapper.append(logoCol, statsCol);
    return { node: wrapper, typewrite: false };
  },

  top(_args, ctx) {
    const wrapper = el('div', {
      class: 'ml-4 mt-2 text-primary-container font-mono text-[12px]',
    });
    const summary = el('div', { class: 'opacity-80' });
    const headerRow = el(
      'div',
      {
        class:
          'mt-2 grid grid-cols-[44px_52px_52px_1fr] sm:grid-cols-[60px_60px_60px_1fr] gap-2 text-secondary border-b border-outline-variant/40 pb-1',
      },
      el('span', {}, 'PID'),
      el('span', {}, 'CPU%'),
      el('span', {}, 'MEM%'),
      el('span', {}, 'COMMAND'),
    );
    const body = el('div', { class: 'space-y-0.5 mt-1' });
    const footer = el(
      'div',
      { class: 'mt-2 opacity-70 text-[10px]' },
      'live — press Ctrl+C to stop (auto-stops in 8s)',
    );
    wrapper.append(summary, headerRow, body, footer);

    const procs: Array<{ pid: number; cmd: string; cpu: number; mem: number }> = [
      { pid: 1, cmd: '/sbin/firefly-init', cpu: 0.1, mem: 0.5 },
      { pid: 217, cmd: 'sshd', cpu: 0.0, mem: 0.4 },
      { pid: 411, cmd: 'firefly-shell', cpu: 0.3, mem: 0.6 },
      { pid: 612, cmd: 'notion-uplink', cpu: 1.2, mem: 1.4 },
      { pid: 808, cmd: 'tail -f /var/log/firefly.log', cpu: 0.4, mem: 0.3 },
      { pid: 901, cmd: 'matrix-rain --renderer=canvas', cpu: 8.7, mem: 2.1 },
      { pid: 1024, cmd: 'audio-synth --triangle', cpu: 0.6, mem: 0.7 },
      { pid: 1337, cmd: 'recon-daemon --target=lan', cpu: 4.2, mem: 1.9 },
      { pid: 2048, cmd: 'opsec-monitor --strict', cpu: 2.1, mem: 1.2 },
      { pid: 4096, cmd: 'gh-pages --watch', cpu: 0.2, mem: 0.5 },
    ];

    let intervalId: number | undefined;
    let timeoutId: number | undefined;
    const stop = (label?: string) => {
      if (intervalId) window.clearInterval(intervalId);
      if (timeoutId) window.clearTimeout(timeoutId);
      intervalId = undefined;
      timeoutId = undefined;
      dispose();
      if (label) {
        footer.textContent = label;
        footer.classList.add('opacity-50');
      }
    };
    const dispose = ctx.registerInterrupt(() => stop('— stopped —'));

    const tickProcs = () => {
      const now = new Date().toLocaleTimeString();
      const load = (Math.random() * 1.5 + 0.2).toFixed(2);
      summary.textContent = `top - ${now}  load avg: ${load}, ${(parseFloat(load) * 1.1).toFixed(2)}, ${(parseFloat(load) * 1.3).toFixed(2)}  ·  ${procs.length} tasks`;
      for (const p of procs) {
        p.cpu = Math.max(0, p.cpu + (Math.random() - 0.5) * 1.5);
        p.mem = Math.max(0, p.mem + (Math.random() - 0.5) * 0.4);
      }
      const sorted = [...procs].sort((a, b) => b.cpu - a.cpu);
      body.replaceChildren(
        ...sorted.map((p) =>
          el(
            'div',
            {
              class:
                'grid grid-cols-[44px_52px_52px_1fr] sm:grid-cols-[60px_60px_60px_1fr] gap-2 text-white/90',
            },
            el('span', {}, String(p.pid)),
            el(
              'span',
              { class: p.cpu > 5 ? 'text-error' : 'text-primary-container' },
              p.cpu.toFixed(1),
            ),
            el('span', {}, p.mem.toFixed(1)),
            el('span', { class: 'truncate opacity-90' }, p.cmd),
          ),
        ),
      );
    };

    tickProcs();
    intervalId = window.setInterval(tickProcs, 900);
    timeoutId = window.setTimeout(() => stop('— stopped —'), 8000);

    unlock('process_killer');
    return { node: wrapper, typewrite: false };
  },

  status(_args, ctx) {
    const wrapper = el('div', { class: 'ml-4 mt-2 text-primary-container' });
    const ua = navigator.userAgent;
    const os = (() => {
      if (/android/i.test(ua)) return 'Android';
      if (/iphone|ipad|ipod/i.test(ua)) return 'iOS';
      if (/mac os x|macintosh/i.test(ua)) return 'macOS';
      if (/windows/i.test(ua)) return 'Windows';
      if (/linux/i.test(ua)) return 'Linux';
      return 'unknown';
    })();
    const browser = (() => {
      if (/firefox/i.test(ua)) return 'Firefox';
      if (/edg/i.test(ua)) return 'Edge';
      if (/chrome/i.test(ua)) return 'Chrome';
      if (/safari/i.test(ua)) return 'Safari';
      return 'unknown';
    })();
    const conn = (navigator as Navigator & { connection?: { effectiveType?: string } })
      .connection;
    const heap = (
      performance as Performance & { memory?: { usedJSHeapSize: number } }
    ).memory;
    const sfx = ctx.sfx.state();
    const uptime = performance.now() / 1000;
    const uptimeLabel =
      uptime > 3600
        ? `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`
        : uptime > 60
          ? `${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s`
          : `${uptime.toFixed(1)}s`;
    const badges = getUnlocked().length;
    const total = getAll().length;

    const rows: Array<[string, string]> = [
      [
        'build',
        `${ctx.build.sha} · deployed ${new Date(ctx.build.builtAt)
          .toISOString()
          .replace('T', ' ')
          .slice(0, 16)} UTC`,
      ],
      ['runtime', `${browser} · ${os} · ${navigator.hardwareConcurrency || '?'} threads`],
      [
        'viewport',
        `${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio || 1}x · ${navigator.language}`,
      ],
      [
        'network',
        navigator.onLine
          ? `online${conn?.effectiveType ? ` (${conn.effectiveType})` : ''}`
          : 'offline',
      ],
      ['audio', sfx.muted ? 'muted' : `on · ${Math.round(sfx.volume * 100)}% vol${sfx.ambient ? ' · rain bed live' : ''}`],
      [
        'effects',
        `theme ${ctx.currentTheme()} · rain ${ctx.matrixActive() ? 'on' : 'off'} · log feed ${ctx.logVisible() ? 'on' : 'off'}`,
      ],
      ['session', `${uptimeLabel} · ${ctx.history.length} commands issued`],
    ];
    if (heap) {
      rows.push([
        'heap',
        `${(heap.usedJSHeapSize / 1048576).toFixed(1)} MB JS heap in use`,
      ]);
    }

    const grid = el('div', { class: 'mt-2 grid grid-cols-[88px_1fr] gap-x-3 gap-y-1 text-[11px]' });
    for (const [k, v] of rows) {
      grid.append(
        el('span', { class: 'text-secondary opacity-80' }, k),
        el('span', { class: 'text-white/90 break-words' }, v),
      );
    }

    const pct = total === 0 ? 0 : Math.round((badges / total) * 100);
    const progress = el('div', {
      class: 'mt-3 stat-bar',
      role: 'progressbar',
      'aria-valuenow': String(badges),
      'aria-valuemin': '0',
      'aria-valuemax': String(total),
      'aria-label': `Operator badges: ${badges} of ${total}`,
    });
    progress.append(el('span', { style: `width:${pct}%` }));

    wrapper.append(
      el('div', { class: 'text-secondary tracking-widest text-[11px]' }, 'FIREFLY STATUS REPORT'),
      grid,
      el(
        'div',
        { class: 'mt-3 text-[11px]' },
        `OPERATOR PROGRESS — ${badges}/${total} badges (${pct}%)`,
      ),
      progress,
      el(
        'div',
        { class: 'mt-2 opacity-70 text-[10px]' },
        "Run 'achievements' for the full badge list.",
      ),
    );
    return { node: wrapper, typewrite: false };
  },

  sfx(args, ctx) {
    const arg = (args[0] || '').toLowerCase();
    const state = ctx.sfx.state();

    if (arg === 'on') {
      ctx.sfx.setMuted(false);
      ctx.sfx.play('done');
      return {
        node: output('text-primary-container', 'sfx: enabled.'),
        typewrite: false,
      };
    }
    if (arg === 'off') {
      ctx.sfx.setMuted(true);
      unlock('go_dark');
      return {
        node: output('text-primary-container', 'sfx: muted. The room goes quiet.'),
        typewrite: false,
      };
    }
    if (arg === 'test') {
      const voices: Array<'key' | 'type' | 'enter' | 'done' | 'error' | 'boot'> = [
        'key',
        'type',
        'enter',
        'done',
        'error',
        'boot',
      ];
      const timers: number[] = [];
      voices.forEach((voice, i) => {
        timers.push(window.setTimeout(() => ctx.sfx.play(voice), 120 + i * 420));
      });
      ctx.registerInterrupt(() => timers.forEach((id) => window.clearTimeout(id)));
      return {
        node: output(
          'text-primary-container',
          'sfx: playing the full voice set — key · type · enter · done · error · boot',
        ),
        typewrite: false,
      };
    }

    const maybeVolume = Number.parseInt(arg, 10);
    if (arg && Number.isFinite(maybeVolume)) {
      if (maybeVolume < 0 || maybeVolume > 100) {
        return { node: errorLine('sfx: volume must be 0-100'), typewrite: false };
      }
      ctx.sfx.setMuted(maybeVolume === 0);
      ctx.sfx.setVolume(maybeVolume / 100);
      if (maybeVolume > 0) ctx.sfx.play('done');
      return {
        node: output('text-primary-container', `sfx: volume set to ${maybeVolume}%.`),
        typewrite: false,
      };
    }
    if (arg && !['status', 'volume'].includes(arg)) {
      return {
        node: errorLine(
          `sfx: unknown option "${arg}". try: sfx on | sfx off | sfx 0-100 | sfx test`,
        ),
        typewrite: false,
      };
    }

    const box = output('text-primary-container');
    box.append(
      el(
        'div',
        {},
        `state: ${state.muted ? 'MUTED' : `ON at ${Math.round(state.volume * 100)}%`}`,
      ),
      el(
        'div',
        { class: 'opacity-80 mt-1' },
        `engine: ${state.ready ? 'audio context live' : 'idle until first interaction'}`,
      ),
      el(
        'div',
        { class: 'opacity-80' },
        `rain bed: ${state.ambient ? 'playing' : 'off'}`,
      ),
      el(
        'div',
        { class: 'opacity-60 text-[10px] mt-1' },
        'the keyboard is a mechanical switch, the print head is a falling-code tick, and enter rings the carriage bell',
      ),
      el(
        'div',
        { class: 'opacity-60 text-[10px]' },
        'usage: sfx on | sfx off | sfx 0-100 | sfx test',
      ),
    );
    return { node: box, typewrite: false };
  },

  palette(_args, ctx) {
    ctx.openPalette();
    return {
      node: output(
        'text-primary-container',
        'palette: opened — type to filter, ⏎ to run, esc to close.',
      ),
      typewrite: false,
    };
  },

  neo(_args, ctx) {
    unlock('the_one');
    ctx.glitch(['WAKE UP, NEO…', 'THE MATRIX HAS YOU', 'FOLLOW THE WHITE RABBIT']);
    ctx.setMatrix(true);
    ctx.sfx.play('boot');
    return {
      node: output(
        'text-primary-container font-bold tracking-widest',
        'neo: knock, knock.',
      ),
      typewrite: false,
    };
  },

  redpill(_args, ctx) {
    unlock('redpill');
    ctx.setTheme('matrix');
    ctx.setMatrix(true);
    ctx.sfx.play('surge');
    return {
      node: output(
        'text-primary-container',
        'you take the red pill — you stay in Wonderland, and I show you how deep the rabbit hole goes.',
      ),
      typewrite: true,
    };
  },

  bluepill(_args, ctx) {
    unlock('bluepill');
    ctx.setTheme('mono');
    ctx.setMatrix(false);
    return {
      node: output(
        'text-primary-container',
        'you take the blue pill — the story ends, you wake in your bed and believe whatever you want to believe.',
      ),
      typewrite: true,
    };
  },

  achievements() {
    const all = getAll();
    const wrapper = el('div', {
      class: 'ml-4 mt-2 text-primary-container',
    });
    wrapper.append(
      el(
        'div',
        { class: 'text-secondary' },
        `OPERATOR BADGES — ${getUnlocked().length}/${all.length}`,
      ),
      el(
        'div',
        {
          class:
            'mt-2 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-[12px]',
        },
        ...all.map((a) => {
          const got = isUnlocked(a.id);
          return el(
            'div',
            { class: got ? 'text-primary-container' : 'text-white/55' },
            el(
              'span',
              { class: 'inline-block w-5 opacity-80' },
              got ? '◉' : '◌',
            ),
            el('span', { class: 'font-bold' }, a.name),
            el(
              'span',
              { class: 'block opacity-80 ml-5 text-[10px]' },
              got ? 'UNLOCKED' : a.hint,
            ),
          );
        }),
      ),
    );
    void ACHIEVEMENTS; // referenced for potential future use
    return { node: wrapper, typewrite: false };
  },
};

// `clear` is already a key of `commands`, so appending it again used to make
// commandNames one longer than the real command count — which made the
// "Completionist" badge mathematically unreachable.
export const commandNames = Object.keys(commands);

/** Documented commands, for the help grid and the Ctrl+K palette. */
export const commandHelp = helpRows;

/** Easter eggs stay out of the palette — finding them is the point. */
const SECRET_COMMANDS = new Set(['sudo', 'neo', 'redpill', 'bluepill', 'dejavu']);

/**
 * Everything the palette can offer: documented commands, labelled with the
 * usage line from `help` so "cat [file]" doesn't show up as "undocumented".
 */
export function paletteEntries(): Array<{
  command: string;
  label: string;
  desc: string;
  kind: 'command' | 'archive' | 'action';
}> {
  const usage = new Map<string, string>();
  const described = new Map<string, string>();
  for (const [usageLine, desc] of helpRows) {
    const name = usageLine.split(' ')[0];
    usage.set(name, usageLine);
    described.set(name, desc);
  }
  return commandNames
    .filter((name) => !SECRET_COMMANDS.has(name))
    .map((name) => ({
      command: name,
      label: usage.get(name) ?? name,
      desc: described.get(name) ?? 'unlisted command',
      kind: 'command' as const,
    }));
}
