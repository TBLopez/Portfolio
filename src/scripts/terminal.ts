import { audio, type SfxState, type SfxVoice } from './audio';
import {
  commands,
  commandNames,
  el,
  paletteEntries,
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
import { createPalette, type PaletteEntry } from './palette';

export type ProjectEntry = {
  id: string;
  title: string;
  description: string;
  url: string;
  /** File extension used in the directory listing. Defaults to .md */
  ext?: string;
  /** Card badge. Defaults to NOTION. */
  tag?: string;
};

export type TerminalInit = {
  notionProjects: ProjectEntry[];
  notionConnected: boolean;
  /** Injected at build time, surfaced by `status`. */
  builtAt?: string;
  buildSha?: string;
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

const normalizeUrl = (url?: string): string => (url ?? '').replace(/\/+$/, '').toLowerCase();

function buildFiles(projects: ProjectEntry[]): Record<string, SystemFile> {
  const files: Record<string, SystemFile> = { ...localFiles };
  // A project that is already hand-listed (the source repo is also a public
  // repo) would otherwise appear as two cards pointing at the same place.
  // The curated entry wins.
  const seen = new Set(Object.values(localFiles).map((f) => normalizeUrl(f.url)));
  for (const p of projects) {
    if (!p.url || p.url === '#' || seen.has(normalizeUrl(p.url))) continue;
    seen.add(normalizeUrl(p.url));
    const name = p.title.toLowerCase().replace(/\s+/g, '_') + (p.ext ?? '.md');
    files[name] = {
      desc: p.description,
      url: p.url,
      available: !!p.url && p.url !== '#',
      embed: isEmbeddable(p.url),
      tag: p.tag ?? 'NOTION',
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

  // Rain on/off also drives the ambient sound bed.
  const applyMatrix = (on: boolean): boolean => {
    if (on) matrix.start();
    else matrix.stop();
    const active = matrix.isActive();
    audio.setAmbient(active);
    return active;
  };

  const glitchOverlay = document.getElementById('glitch-overlay');
  let glitchTimer: number | undefined;
  const glitch = (messages: string[]): void => {
    if (!glitchOverlay || prefersReducedMotion()) return;
    let index = 0;
    const step = () => {
      if (!glitchOverlay) return;
      glitchOverlay.textContent = messages[index] ?? '';
      glitchOverlay.classList.remove('active');
      // Restart the keyframes even if the class was just removed.
      void glitchOverlay.offsetWidth;
      glitchOverlay.classList.add('active');
      index++;
      if (index < messages.length) {
        glitchTimer = window.setTimeout(step, 820);
      } else {
        glitchTimer = window.setTimeout(() => {
          glitchOverlay.classList.remove('active');
        }, 2400);
      }
    };
    if (glitchTimer) window.clearTimeout(glitchTimer);
    step();
  };

  // ── Déjà vu ──────────────────────────────────────────────────────────
  // Matrix lore: a déjà vu is a glitch — they changed something. Rare, and
  // rate-limited so it stays an event rather than a screensaver.
  const catEl = document.getElementById('dejavu-cat');
  let lastDejavu = 0;
  const dejavu = (force = false): boolean => {
    const now = performance.now();
    if (!force && now - lastDejavu < 90_000) return false;
    if (prefersReducedMotion()) return false;
    lastDejavu = now;

    document.body.classList.add('dejavu');
    window.setTimeout(() => document.body.classList.remove('dejavu'), 1200);

    if (catEl) {
      catEl.classList.remove('walking');
      void catEl.offsetWidth;
      catEl.classList.add('walking');
      window.setTimeout(() => catEl.classList.remove('walking'), 5600);
    }

    audio.play('surge');
    unlock('dejavu');
    note('> deja vu detected in sector 7 — they changed something.', 'opacity-70 text-[11px]');
    glitch(['DÉJÀ VU']);
    return true;
  };

  const maybeDejavu = () => {
    if (Math.random() < 0.045) dejavu();
  };

  /** Dim narration line used by `tour` and glitches. */
  function note(text: string, className = 'opacity-70 text-[11px]'): HTMLElement {
    const node = el('div', { class: `ml-4 mt-2 ${className}` }, text);
    historyContainer.appendChild(node);
    terminalOutput.scrollTo({ top: terminalOutput.scrollHeight + 1000, behavior: 'smooth' });
    return node;
  }

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
    toggleMatrix: () => applyMatrix(!matrix.isActive()),
    setMatrix: (on: boolean) => applyMatrix(on),
    matrixActive: () => matrix.isActive(),
    toggleLogFeed: () => logFeed.toggle(),
    logVisible: () => logFeed.isVisible(),
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
    sfx: {
      state: () => audio.getState(),
      setMuted: (muted: boolean) => audio.setMuted(muted),
      setVolume: (volume: number) => audio.setVolume(volume),
      play: (voice: SfxVoice) => audio.play(voice),
    },
    openPalette: () => palette.open(),
    glitch,
    startTour: () => void runTour(),
    dejavu: () => void dejavu(true),
    build: {
      sha: init.buildSha || 'dev',
      builtAt: init.builtAt || new Date().toISOString(),
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
  document.addEventListener('pointerdown', oneShotInit, { once: true });

  // ── SFX toggle ───────────────────────────────────────────────────────
  const sfxBtn = document.getElementById('sfx-toggle') as HTMLButtonElement | null;
  const syncSfxBtn = (state: SfxState) => {
    if (!sfxBtn) return;
    const pct = Math.round(state.volume * 100);
    sfxBtn.textContent = state.muted ? '[SFX:OFF]' : `[SFX:ON ${pct}%]`;
    sfxBtn.setAttribute('aria-pressed', String(!state.muted));
    sfxBtn.setAttribute(
      'aria-label',
      state.muted
        ? 'Sound effects muted — activate to enable'
        : `Sound effects at ${pct} percent — activate to mute`,
    );
    sfxBtn.title = state.muted
      ? 'SFX muted (type: sfx on)'
      : `SFX ${pct}% (type: sfx 0-100)`;
  };
  syncSfxBtn(audio.getState());
  audio.onChange(syncSfxBtn);
  sfxBtn?.addEventListener('click', () => {
    audio.toggle();
    if (audio.isMuted()) unlock('go_dark');
    if (!audio.isMuted()) {
      audio.init();
      audio.play('done');
    }
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
    if (
      e.key === 'Escape' &&
      sidebar?.getAttribute('aria-hidden') === 'false' &&
      !desktopQuery.matches
    ) {
      closeSidebar(true);
    }
  });

  // ── Typewriter ───────────────────────────────────────────────────────
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

  async function runCommand(
    raw: string,
    opts: { fromClick?: boolean; fast?: boolean } = {},
  ): Promise<void> {
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
      audio.play('error');
    }

    if (!result) return;

    result.node.classList.add('animate-fade-in-up');
    historyContainer.appendChild(result.node);
    terminalOutput.scrollTo({ top: terminalOutput.scrollHeight + 1000, behavior: 'smooth' });

    if (result.typewrite) {
      // `fast` caps the per-character delay for scripted runs (tour, replay).
      await typewrite(result.node, opts.fast ? 2 : 6);
    }
    // Tapping a chip on a phone shouldn't force the soft keyboard back open,
    // and the palette owns focus while it is open.
    if (!palette.isOpen() && !(opts.fromClick && !hasFinePointer)) input.focus();

    // Rare glitch: they changed something.
    maybeDejavu();
  }

  // ── Command palette ──────────────────────────────────────────────────
  const palette = createPalette({
    entries: (): PaletteEntry[] => [
      ...paletteEntries(),
      {
        command: 'theme next',
        label: 'theme next',
        desc: 'Cycle to the next palette',
        kind: 'action',
      },
      {
        command: 'matrix on',
        label: 'matrix on',
        desc: 'Start the rain',
        kind: 'action',
      },
      {
        command: 'matrix off',
        label: 'matrix off',
        desc: 'Stop the rain',
        kind: 'action',
      },
      ...Object.entries(files).map(([name, file]) => ({
        command: `cat ${name}`,
        label: name,
        desc: `${file.desc}${file.available ? '' : ' — sealed'}`,
        kind: 'archive' as const,
      })),
    ],
    onRun: (cmd) => {
      void runCommand(cmd);
    },
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && ['k', 'p'].includes(e.key.toLowerCase())) {
      e.preventDefault();
      if (palette.isOpen()) palette.close();
      else palette.open();
    }
  });

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

  let lastSurge = 0;
  const pulseRain = () => {
    if (!matrix.isActive()) return;
    const now = performance.now();
    if (now - lastSurge < 110) return;
    lastSurge = now;
    matrix.surge();
    if (Math.random() < 0.14) audio.play('surge');
  };

  input.addEventListener('keydown', (e) => {
    // While the BIOS overlay is up, keystrokes belong to it (Escape/Enter skip)
    // — otherwise they typed invisibly into the hidden input and played SFX.
    if (document.body.classList.contains('booting')) {
      e.preventDefault();
      return;
    }

    audio.init();

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
    audio.play('key');
    pulseRain();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const val = input.value;
    input.value = '';
    void runCommand(val);
  });

  // ── Guided tour ──────────────────────────────────────────────────────
  // A scripted walkthrough for people who will not type `help`. Awaiting each
  // runCommand keeps the typewriter pacing instead of dumping everything at
  // once, and Ctrl+C aborts mid-step.
  let tourAborted = false;
  let tourRunning = false;
  async function runTour(): Promise<void> {
    if (tourRunning) return;
    tourRunning = true;
    tourAborted = false;
    const reduced = prefersReducedMotion();
    const pause = (ms: number) => new Promise((r) => window.setTimeout(r, reduced ? 40 : ms));
    const disposers: Array<() => void> = [
      registerInterrupt(() => {
        tourAborted = true;
      }),
    ];
    const stop = () => {
      disposers.forEach((d) => d());
      tourRunning = false;
    };

    const openArchive = Object.entries(files).find(([, f]) => f.available)?.[0];
    const steps: Array<{ note: string; command?: string }> = [
      { note: 'STEP 1/8 — who runs this machine', command: 'whoami' },
      { note: 'STEP 2/8 — the hardware', command: 'neofetch' },
      { note: 'STEP 3/8 — what is mounted', command: 'ls' },
      ...(openArchive
        ? [{ note: 'STEP 4/8 — the viewer module', command: `cat ${openArchive}` }]
        : []),
      { note: 'STEP 5/8 — live DNS, straight from your browser', command: 'dig tonykl.com' },
      { note: 'STEP 6/8 — telemetry from the machine', command: 'tail' },
      { note: 'STEP 7/8 — repaint the room', command: 'theme ice' },
      { note: 'STEP 8/8 — and the rain', command: 'matrix on' },
      { note: 'that is the tour. contact details, then your prompt:', command: 'contact' },
    ];

    await pause(200);
    for (const step of steps) {
      if (tourAborted) break;
      note(`tour: ${step.note}`, 'opacity-60 text-[11px]');
      await pause(180);
      if (step.command && !tourAborted) {
        await runCommand(step.command, { fast: true });
      }
      await pause(260);
    }

    if (tourAborted) {
      note('tour: aborted. Restore the prompt with `clear` whenever you like.', 'text-error text-[11px]');
    } else {
      await pause(200);
      runCommand('theme matrix', { fast: true });
      note('tour: complete — Ctrl+K opens the command palette, `help` lists everything, and five commands are unlisted.', 'opacity-70 text-[11px]');
    }
    stop();
  }

  /** `?replay=a,b,c` — a shareable session that types itself out. */
  async function replayFromUrl(): Promise<void> {
    const params = new URLSearchParams(window.location.search);
    const hash = window.location.hash.replace(/^#/, '');
    const raw =
      params.get('replay') ??
      (hash.startsWith('replay=') ? decodeURIComponent(hash.slice('replay='.length)) : '');
    if (!raw) return;

    const cleaned = stripReplayParam();
    const requested = raw
      .split(/[,\n]/)
      .map((c) => c.trim().slice(0, 120))
      .filter((c) => c.length > 0)
      .slice(0, 20)
      // Only known commands, so a shared link can't poke at internals.
      .filter((c) => commands[c.split(/\s+/)[0].toLowerCase()] !== undefined);
    if (requested.length === 0) return;

    const reduced = prefersReducedMotion();
    const pause = (ms: number) => new Promise((r) => window.setTimeout(r, reduced ? 30 : ms));
    note(
      `> replaying shared session — ${requested.length} command${requested.length === 1 ? '' : 's'}${cleaned ? ' (link cleaned up)' : ''}.`,
      'opacity-70 text-[11px]',
    );
    await pause(500);
    for (const cmd of requested) {
      await runCommand(cmd, { fast: true });
      await pause(240);
    }
    note('> replay complete. Your own prompt is ready.', 'opacity-60 text-[11px]');
  }

  /** Drop ?replay= after reading it so a refresh doesn't re-run the session. */
  function stripReplayParam(): boolean {
    const url = new URL(window.location.href);
    let changed = false;
    if (url.searchParams.has('replay')) {
      url.searchParams.delete('replay');
      changed = true;
    }
    const hash = url.hash.replace(/^#/, '');
    if (hash.startsWith('replay=')) {
      url.hash = '';
      changed = true;
    }
    if (changed) window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    return changed;
  }

  // Keep the palette's archive list honest if anything re-renders files.
  palette.refresh();

  // Async command output (dig/whois/nmap) asks for a scroll when it lands.
  window.addEventListener('firefly:scroll', () => {
    terminalOutput.scrollTo({ top: terminalOutput.scrollHeight + 1000, behavior: 'smooth' });
  });

  // Shared session? Type it out once the prompt is ready.
  if (sessionStorage.getItem('boot.shown')) {
    void replayFromUrl();
  } else {
    window.setTimeout(() => void replayFromUrl(), 2200);
  }

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
  const stamp =
    previousVisit ??
    (buildTime && !Number.isNaN(buildTime.getTime()) ? buildTime : new Date());
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
