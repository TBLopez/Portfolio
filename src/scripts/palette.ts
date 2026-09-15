/**
 * Ctrl+K command palette.
 *
 * A single overlay that fuzzy-filters commands and archives, keyboard driven:
 * type to filter, ↑/↓ to move, Enter to run, Esc to close. Built because the
 * terminal is great once you know it and hostile before that.
 */

export type PaletteEntry = {
  /** Text inserted at the prompt. */
  command: string;
  label: string;
  desc: string;
  kind: 'command' | 'archive' | 'action';
};

type Options = {
  entries: () => PaletteEntry[];
  onRun: (command: string) => void;
  onNotify?: (message: string) => void;
};

type Palette = {
  open: () => void;
  close: () => void;
  isOpen: () => boolean;
  /** Re-render if the underlying archive list changed. */
  refresh: () => void;
};

/** Cheap subsequence score: earlier and tighter matches rank higher. */
function score(haystack: string, needle: string): number | null {
  if (!needle) return 0;
  let h = 0;
  let n = 0;
  let total = 0;
  let streak = 0;
  while (h < haystack.length && n < needle.length) {
    if (haystack[h] === needle[n]) {
      streak++;
      total += streak * 2;
      if (h === 0 || haystack[h - 1] === ' ') total += 4;
      n++;
    } else {
      streak = 0;
    }
    h++;
  }
  return n === needle.length ? total - haystack.length * 0.01 : null;
}

export function createPalette(options: Options): Palette {
  let root: HTMLElement | null = null;
  let input: HTMLInputElement | null = null;
  let list: HTMLElement | null = null;
  let foot: HTMLElement | null = null;
  let visible: PaletteEntry[] = [];
  let selected = 0;
  let lastFocused: HTMLElement | null = null;

  const build = () => {
    if (root) return;
    root = document.createElement('div');
    root.id = 'palette-root';
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Command palette');

    const panel = document.createElement('div');
    panel.className = 'palette';

    const inputRow = document.createElement('div');
    inputRow.className = 'palette-input-row';
    const prompt = document.createElement('span');
    prompt.className = 'prompt';
    prompt.textContent = '>';
    input = document.createElement('input');
    input.id = 'palette-input';
    input.type = 'text';
    input.placeholder = 'run a command or search archives…';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('aria-label', 'Search commands and archives');
    input.setAttribute('aria-controls', 'palette-list');
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-expanded', 'true');
    inputRow.append(prompt, input);

    list = document.createElement('div');
    list.className = 'palette-list';
    list.id = 'palette-list';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', 'Results');

    foot = document.createElement('div');
    foot.className = 'palette-foot';
    foot.innerHTML =
      '<span>↑↓ move · ⏎ run · esc close</span><span>ctrl+k</span>';

    panel.append(inputRow, list, foot);
    root.append(panel);
    document.body.append(root);

    root.addEventListener('mousedown', (e) => {
      if (e.target === root) close();
    });
    input.addEventListener('input', () => {
      selected = 0;
      render();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        move(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        move(-1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        commit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        close();
      } else if (e.key === 'Tab') {
        // Keep focus inside the overlay.
        e.preventDefault();
        move(e.shiftKey ? -1 : 1);
      }
    });
  };

  const render = () => {
    if (!list || !input) return;
    const query = input.value.trim().toLowerCase();
    const all = options.entries();
    const scored = all
      .map((entry) => {
        const s = score(entry.label.toLowerCase(), query);
        const alt = score(entry.desc.toLowerCase(), query);
        const best = s === null ? alt : alt === null ? s : Math.max(s, alt);
        return { entry, s: best };
      })
      .filter((x) => x.s !== null)
      .sort((a, b) => (b.s as number) - (a.s as number))
      .slice(0, 12)
      .map((x) => x.entry);

    visible = scored;
    if (selected >= visible.length) selected = Math.max(0, visible.length - 1);

    list.replaceChildren();
    if (visible.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'palette-empty';
      empty.textContent = `no matches for “${input.value.trim()}” — try 'help'`;
      list.append(empty);
      return;
    }

    visible.forEach((entry, index) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'palette-item';
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(index === selected));
      item.id = `palette-item-${index}`;

      const main = document.createElement('span');
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = entry.label;
      const desc = document.createElement('span');
      desc.className = 'desc';
      desc.textContent = entry.desc;
      main.append(name, desc);

      const kind = document.createElement('span');
      kind.className = 'kind';
      kind.textContent = entry.kind;

      item.append(main, kind);
      item.addEventListener('mousemove', () => {
        if (selected === index) return;
        selected = index;
        highlight();
      });
      item.addEventListener('click', () => {
        selected = index;
        commit();
      });
      list!.append(item);
    });
    highlight();
  };

  const highlight = () => {
    if (!list || !input) return;
    [...list.querySelectorAll('.palette-item')].forEach((el, index) => {
      el.setAttribute('aria-selected', String(index === selected));
    });
    const active = list.querySelector<HTMLElement>(`#palette-item-${selected}`);
    if (active) {
      active.scrollIntoView({ block: 'nearest' });
      input.setAttribute('aria-activedescendant', active.id);
    }
  };

  const move = (delta: number) => {
    if (visible.length === 0) return;
    selected = (selected + delta + visible.length) % visible.length;
    highlight();
  };

  const commit = () => {
    const entry = visible[selected];
    if (!entry) return;
    close();
    options.onRun(entry.command);
  };

  const open = () => {
    build();
    if (!root || !input) return;
    lastFocused = document.activeElement as HTMLElement | null;
    root.hidden = false;
    input.value = '';
    selected = 0;
    render();
    input.focus();
  };

  const close = () => {
    if (!root || root.hidden) return;
    root.hidden = true;
    lastFocused?.focus?.();
    lastFocused = null;
  };

  return {
    open,
    close,
    isOpen: () => !!root && !root.hidden,
    refresh: () => {
      if (root && !root.hidden) render();
    },
  };
}
