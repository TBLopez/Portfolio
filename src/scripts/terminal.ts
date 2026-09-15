import { audio } from './audio';
import {
  commands,
  commandNames,
  type CommandContext,
} from '../commands/index';
import { localFiles, type SystemFile } from '../data/systemFiles';
import { getMatrixRain } from './matrixRain';
import { getLogFeed, initLogFeedFromStorage } from './logFeed';
import {
  THEMES,
  applyTheme,
  getTheme,
  initThemeFromStorage,
  type ThemeName,
} from './themes';
import { trackCommand, trackTheme, unlock } from './achievements';
import { runBoot, shouldShowBoot } from './boot';

export type NotionProject = {
  id: string;
  title: string;
  description: string;
  url: string;
};

export type TerminalInit = {
  notionProjects: NotionProject[];
  notionConnected: boolean;
  /** Build timestamp, used as the LAST LOGIN fallback for first-time visitors. */
  builtAt?: string;
};

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/** Off-site pages can't be framed, so only same-origin/file targets embed. */
function isEmbeddable(url: string): boolean {
  if (!url || url === '#') return false;
  try {
    const parsed = new URL(url, window.location.href);
    if (parsed.origin === window.location.origin) return true;
    // Notion/S3-hosted uploads serve files, not pages, and are frameable.
    return /\.(pdf|png|jpe?g|webp|gif|svg|txt|md)$/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

function buildFiles(projects: NotionProject[]): Record<string, SystemFile> {
  const files: Record<string, SystemFile> = { ...localFiles };
  for (const p of projects) {
    const name = p.title.toLowerCase().replace(/\s+/g, '_') + '.md';
    files[name] = {
      desc: p.description,
      url: p.url,
      available: !!p.url && p.url !== '#',
      embed: isEmbeddable(p.url),
      tag: 'NOTION',
    };
  }
  return files;
}

const HISTORY_KEY = 'terminal.history';
const LAST_VISIT_KEY = 'terminal.lastVisit';
const MAX_HISTORY = 100;

function loadHistory(): string[] {
  try {
    const raw = sessionStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveHistory(history: string[]): void {
  try {
    sessionStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-MAX_HISTORY)));
  } catch {
    /* ignore */
  }
}

function formatUtc(date: Date): string {
  return date.toUTCString().replace('GMT', 'UTC').toUpperCase();
}

export function initTerminal(init: TerminalInit): void {
  const inputRaw = document.getElementById('cmd-input') as HTMLInputElement | null;
  const formRaw = document.getElementById('cmd-form') as HTMLFormElement | null;
  const historyContainerRaw = document.getElementById('history-container');
  const terminalOutputRaw = document.getElementById('terminal-output');
  const terminalFooterRaw = document.getElementById('terminal-footer');

  if (
    !inputRaw ||
    !formRaw ||
    !historyContainerRaw ||
    !terminalOutputRaw ||
    !terminalFooterRaw
  ) {
    return;
  }

  const input = inputRaw;
  const form = formRaw;
  const historyContainer = historyContainerRaw;
  const terminalOutput = terminalOutputRaw;
  const terminalFooter = terminalFooterRaw;

  const files = buildFiles(init.notionProjects);
  const history = loadHistory();
  let historyCursor = history.length;
  let activeTypewriter: { skip: () => void } | null = null;

  // Long-running commands (`top`) register here so Ctrl+C / clear can stop them.
  const interruptHandlers = new Set<() => void>();
  const registerInterrupt = (fn: () => void) => {
    interruptHandlers.add(fn);
    return () => interruptHandlers.delete(fn);
  };
  const interruptAll = () => {
    for (const fn of [...interruptHandlers]) {
      try {
        fn();
      } catch {
        /* ignore */
      }
    }
    interruptHandlers.clear();
  };

  // Boot theme + log feed from storage before anything paints text
  initThemeFromStorage();
  initLogFeedFromStorage();
  syncThemeColor(getTheme());

  const matrix = getMatrixRain();
  const logFeed = getLogFeed();

  const ctx: CommandContext = {
    files,
    notionConnected: init.notionConnected,
    history,
    clear: () => {
      activeTypewriter?.skip();
      interruptAll();
      historyContainer.innerHTML = '';
    },
    interruptAll,
    registerInterrupt,
    toggleMatrix: () => matrix.toggle(),
    setMatrix: (on: boolean) => {
      if (on) matrix.start();
      else matrix.stop();
      return matrix.isActive();
    },
    matrixActive: () => matrix.isActive(),
    toggleLogFeed: () => logFeed.toggle(),
    setTheme: (name: ThemeName) => {
      applyTheme(name);
      trackTheme(name, THEMES);
      syncThemeColor(name);
    },
    themes: THEMES,
    currentTheme: () => getTheme(),
    triggerReboot: async () => {
      await runBoot();
    },
    setLastLogin: (label: string) => {
      const el = document.getElementById('last-login-value');
      if (el) el.textContent = label;
    },
  };

  // Track current theme on first load so the wardrobe achievement can progress.
  trackTheme(getTheme(), THEMES);

  // Boot sequence on first visit of the session
  if (shouldShowBoot()) {
    void runBoot();
  }

  // Focus input on first interaction; also on clicks anywhere not selecting text or hitting a control.
  // Skip the document-wide handler on touch devices — otherwise every tap pops the soft keyboard.
  const focusInput = () => setTimeout(() => input.focus(), 0);
  const hasFinePointer =
    window.matchMedia?.('(hover: hover) and (pointer: fine)').matches ?? false;

  terminalFooter.addEventListener('click', focusInput);
  if (hasFinePointer) {
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (window.getSelection()?.toString()) return;
      if (target.closest('a, button, input, iframe, [data-no-focus]')) return;
      focusInput();
    });
  }

  // Audio init on first interaction
  const oneShotInit = () => audio.init();
  document.addEventListener('keydown', oneShotInit, { once: true });
  document.addEventListener('click', oneShotInit, { once: true });

  // SFX mute toggle button wiring
  const sfxBtn = document.getElementById('sfx-toggle') as HTMLButtonElement | null;
  const syncSfxBtn = (muted: boolean) => {
    if (!sfxBtn) return;
    sfxBtn.textContent = muted ? '[SFX:OFF]' : '[SFX:ON]';
    sfxBtn.setAttribute('aria-pressed', muted ? 'false' : 'true');
  };
  syncSfxBtn(audio.isMuted());
  audio.onChange(syncSfxBtn);
  sfxBtn?.addEventListener('click', () => {
    audio.toggle();
    if (audio.isMuted()) unlock('go_dark');
    if (!audio.isMuted()) audio.init();
  });

  // ── Mobile sidebar drawer ────────────────────────────────────────────
  const sidebar = document.getElementById('sidebar');
  const sidebarToggle = document.getElementById('sidebar-toggle');
  const sidebarScrim = document.getElementById('sidebar-scrim');
  const desktopQuery = window.matchMedia('(min-width: 768px)');

  // The drawer is only a drawer below md. Above md the sidebar is always on
  // screen, so it must be exposed to assistive tech there — the old markup
  // hard-coded aria-hidden="true" and hid the whole nav from screen readers
  // on desktop.
  const applySidebarState = (open: boolean) => {
    if (!sidebar) return;
    const desktop = desktopQuery.matches;
    const visible = desktop || open;
    sidebar.classList.toggle('-translate-x-full', !visible);
    sidebar.setAttribute('aria-hidden', visible ? 'false' : 'true');
    sidebarToggle?.setAttribute('aria-expanded', String(!desktop && open));
    if (sidebarScrim) {
      if (visible && !desktop) sidebarScrim.removeAttribute('hidden');
      else sidebarScrim.setAttribute('hidden', '');
    }
  };

  const openSidebar = () => applySidebarState(true);
  const closeSidebar = (restoreFocus = false) => {
    applySidebarState(false);
    if (restoreFocus) sidebarToggle?.focus();
  };

  applySidebarState(false);
  desktopQuery.addEventListener('change', () => applySidebarState(false));

  sidebarToggle?.addEventListener('click', () => {
    openSidebar();
    sidebar?.querySelector<HTMLElement>('button, [href], input')?.focus();
  });
  sidebarScrim?.addEventListener('click', () => closeSidebar(true));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebar?.getAttribute('aria-hidden') === 'false' && !desktopQuery.matches) {
      closeSidebar(true);
    }
  });

  // Typewriter that can be skipped.
  // Duration is capped so a 60-line `help` dump doesn't take four seconds,
  // and the live region is marked busy while glyphs are being appended so
  // screen readers don't announce every character.
  function typewrite(el: HTMLElement, speed = 6): Promise<void> {
    if (prefersReducedMotion()) return Promise.resolve();

    return new Promise<void>((resolve) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
      const nodes: Text[] = [];
      let n: Node | null;
      while ((n = walker.nextNode())) {
        if ((n.nodeValue ?? '').trim() !== '') nodes.push(n as Text);
      }
      if (nodes.length === 0) {
        resolve();
        return;
      }
      const originals = nodes.map((node) => node.nodeValue ?? '');
      const totalChars = originals.reduce((sum, t) => sum + t.length, 0);
      // Fast enough to stay snappy, slow enough to still read as a terminal.
      const delay = Math.max(2, Math.min(speed, Math.round(1200 / Math.max(1, totalChars))));
      nodes.forEach((node) => (node.nodeValue = ''));

      let nodeIdx = 0;
      let charIdx = 0;
      let cancelled = false;
      let timeoutId: number | undefined;

      historyContainer.setAttribute('aria-busy', 'true');

      const finish = () => {
        nodes.forEach((node, i) => (node.nodeValue = originals[i]));
        if (timeoutId) window.clearTimeout(timeoutId);
        activeTypewriter = null;
        historyContainer.removeAttribute('aria-busy');
        audio.play('done');
        resolve();
      };

      const tick = () => {
        if (cancelled) return;
        if (nodeIdx >= nodes.length) {
          finish();
          return;
        }
        const text = originals[nodeIdx];
        if (charIdx < text.length) {
          nodes[nodeIdx].nodeValue = (nodes[nodeIdx].nodeValue ?? '') + text.charAt(charIdx);
          charIdx++;
          if (charIdx % 3 === 0) audio.play('type');
          terminalOutput.scrollTop = terminalOutput.scrollHeight + 1000;
          timeoutId = window.setTimeout(tick, delay);
        } else {
          nodeIdx++;
          charIdx = 0;
          timeoutId = window.setTimeout(tick, delay);
        }
      };

      activeTypewriter = {
        skip: () => {
          if (cancelled) return;
          cancelled = true;
          finish();
        },
      };
      tick();
    });
  }

  function appendPrompt(cmd: string): void {
    const line = document.createElement('div');
    line.className = 'flex items-center gap-2 mt-4';
    const prefix = document.createElement('span');
    prefix.textContent = 'tony@firefly:~$';
    prefix.className = 'text-primary-container font-bold glow-text';
    const echo = document.createElement('span');
    echo.className = 'text-white';
    echo.textContent = cmd;
    line.append(prefix, echo);
    historyContainer.appendChild(line);
  }

  function unknownCommand(cmd: string): HTMLElement {
    const node = document.createElement('div');
    node.className = 'ml-4 mt-2 text-error';
    node.textContent = `bash: ${cmd}: command not found. Type 'help' for available commands.`;
    return node;
  }

  async function runCommand(raw: string, opts: { fromClick?: boolean } = {}): Promise<void> {
    const cmd = raw.trim();

    // A new command always wins over an in-flight typewriter, otherwise two
    // writers fight over the same scroll position.
    if (cmd) {
      activeTypewriter?.skip();
    } else {
      // Bare Enter: echo an empty prompt instead of doing nothing at all.
      appendPrompt('');
      terminalOutput.scrollTo({ top: terminalOutput.scrollHeight + 1000, behavior: 'smooth' });
      return;
    }

    // push onto history
    history.push(cmd);
    saveHistory(history);
    historyCursor = history.length;

    const [base, ...args] = cmd.split(/\s+/);
    const baseCmd = base.toLowerCase();

    if (commands[baseCmd]) {
      trackCommand(baseCmd, commandNames.length);
    }

    if (baseCmd === 'clear') {
      commands.clear([], ctx);
      return;
    }

    appendPrompt(cmd);
    audio.play('enter');

    const handler = commands[baseCmd];
    let result: ReturnType<typeof commands[string]> | null = null;
    if (handler) {
      result = handler(args, ctx) ?? null;
    } else {
      result = { node: unknownCommand(cmd), typewrite: false };
    }

    if (!result) return;

    result.node.classList.add('animate-fade-in-up');
    historyContainer.appendChild(result.node);
    terminalOutput.scrollTo({ top: terminalOutput.scrollHeight + 1000, behavior: 'smooth' });

    if (result.typewrite) {
      await typewrite(result.node);
    }
    // Tapping a chip on a phone shouldn't force the soft keyboard back open.
    if (!(opts.fromClick && !hasFinePointer)) input.focus();
  }

  // Click-to-run: any element carrying data-command behaves like a menu item.
  // (Header "Directory", sidebar entry, welcome-banner chips.)
  document.addEventListener('click', (e) => {
    const node = e.target as HTMLElement | null;
    const action = node?.closest<HTMLElement>('[data-action]')?.dataset.action;
    if (action === 'fullscreen') {
      e.preventDefault();
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
      else void document.documentElement.requestFullscreen?.().catch(() => {});
      return;
    }

    const trigger = node?.closest<HTMLElement>('[data-command]');
    if (!trigger) return;
    e.preventDefault();
    const cmd = trigger.dataset.command ?? '';
    if (!desktopQuery.matches) closeSidebar();
    void runCommand(cmd, { fromClick: true });
  });

  // Tab completion with cycling
  let tabState: { key: string; index: number } | null = null;
  function completeTab(): void {
    const value = input.value;
    const parts = value.split(' ');
    const cycle = (candidates: string[], apply: (m: string) => string) => {
      if (candidates.length === 0) return;
      const key = value.trim().toLowerCase();
      const index = tabState && tabState.key === key ? (tabState.index + 1) % candidates.length : 0;
      const match = candidates[index];
      tabState = { key: match.toLowerCase(), index };
      input.value = apply(match);
    };

    if (parts.length === 1) {
      const prefix = parts[0].toLowerCase();
      cycle(
        commandNames.filter((c) => c.startsWith(prefix)),
        (m) => m + ' ',
      );
    } else if (parts.length === 2 && parts[0].toLowerCase() === 'cat') {
      const prefix = parts[1].toLowerCase();
      cycle(
        Object.keys(files).filter((f) => f.startsWith(prefix)),
        (m) => 'cat ' + m,
      );
    }
  }

  input.addEventListener('keydown', (e) => {
    // While the BIOS overlay is up, keystrokes belong to it (Escape/Enter skip)
    // — otherwise they typed invisibly into the hidden input and played SFX.
    if (document.body.classList.contains('booting')) {
      e.preventDefault();
      return;
    }

    audio.init();
    if (e.key !== 'Tab') tabState = null;

    // Ctrl+L → clear; Ctrl+C → cancel typewriter and any running command
    if (e.ctrlKey && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      commands.clear([], ctx);
      return;
    }
    if (e.ctrlKey && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      activeTypewriter?.skip();
      interruptAll();
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      completeTab();
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (historyCursor > 0) {
        historyCursor--;
        input.value = history[historyCursor] ?? '';
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyCursor < history.length - 1) {
        historyCursor++;
        input.value = history[historyCursor] ?? '';
      } else {
        historyCursor = history.length;
        input.value = '';
      }
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const val = input.value;
      input.value = '';
      void runCommand(val);
      return;
    }

    // Any other keypress while typewriter is active: skip it
    if (activeTypewriter) {
      activeTypewriter.skip();
    }
    audio.play('type');
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const val = input.value;
    input.value = '';
    void runCommand(val);
  });

  // ── Session banner timestamps ────────────────────────────────────────
  // The page is static, so the build-time stamp used to claim every visitor
  // logged in at deploy time. Show the visitor's *previous* session instead.
  const buildTime = init.builtAt ? new Date(init.builtAt) : null;
  let previousVisit: Date | null = null;
  try {
    const raw = localStorage.getItem(LAST_VISIT_KEY);
    if (raw) {
      const parsed = new Date(raw);
      if (!Number.isNaN(parsed.getTime())) previousVisit = parsed;
    }
    localStorage.setItem(LAST_VISIT_KEY, new Date().toISOString());
  } catch {
    /* ignore */
  }
  const stamp = previousVisit ?? (buildTime && !Number.isNaN(buildTime.getTime()) ? buildTime : new Date());
  ctx.setLastLogin(formatUtc(stamp));
}

/** Keep the mobile browser chrome in step with the active palette. */
function syncThemeColor(theme: ThemeName): void {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  const swatch: Record<ThemeName, string> = {
    matrix: '#000000',
    amber: '#0c0700',
    ice: '#000c16',
    dracula: '#111219',
    mono: '#000000',
  };
  meta.setAttribute('content', swatch[theme] ?? '#000000');
}
