/* Achievement / operator badge system.
   Tracks discovered commands, themes seen, and one-shot easter eggs. */

const STORAGE_KEY = 'achievements.v1';

export type Achievement = {
  id: string;
  name: string;
  hint: string;
};

export const ACHIEVEMENTS: Record<string, Achievement> = {
  first_contact: { id: 'first_contact', name: 'First Contact', hint: 'Run your first command.' },
  curious: { id: 'curious', name: 'Curious Operator', hint: 'Discover 5 unique commands.' },
  completionist: { id: 'completionist', name: 'Completionist', hint: 'Discover every command.' },
  go_dark: { id: 'go_dark', name: 'Go Dark', hint: 'Toggle SFX off.' },
  rainmaker: { id: 'rainmaker', name: 'Rainmaker', hint: 'Activate matrix rain.' },
  wardrobe: { id: 'wardrobe', name: 'Wardrobe Change', hint: 'Switch to every theme.' },
  recon: { id: 'recon', name: 'Recon Specialist', hint: 'Run nmap.' },
  packet_sniffer: { id: 'packet_sniffer', name: 'Packet Sniffer', hint: 'Tail the live log feed.' },
  process_killer: { id: 'process_killer', name: 'Process Killer', hint: 'Run top.' },
  reboot_loop: { id: 'reboot_loop', name: 'Reboot Loop', hint: 'Replay the boot sequence.' },
  oops: { id: 'oops', name: 'Permission Denied', hint: 'Try sudo.' },
  archivist: { id: 'archivist', name: 'Archivist', hint: 'Open an archive with cat.' },
  the_one: { id: 'the_one', name: 'The One', hint: "Type 'neo'." },
  redpill: { id: 'redpill', name: 'Red Pill', hint: 'Take the red pill.' },
  bluepill: { id: 'bluepill', name: 'Blue Pill', hint: 'Take the blue pill.' },
  dejavu: { id: 'dejavu', name: 'Déjà Vu', hint: 'They changed something. Watch for the cat.' },
};

type State = {
  unlocked: string[];
  commandsSeen: string[];
  themesSeen: string[];
};

function load(): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as State;
  } catch {
    /* ignore */
  }
  return { unlocked: [], commandsSeen: [], themesSeen: [] };
}

function save(state: State): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

let state = load();
const stack = (): HTMLElement | null =>
  document.getElementById('achievement-stack');

function toast(a: Achievement): void {
  const host = stack();
  if (!host) return;
  const el = document.createElement('div');
  el.className = 'achievement-toast';
  el.setAttribute('role', 'status');
  el.innerHTML = `<span class="label">▶ Achievement Unlocked</span><span class="name"></span>`;
  (el.querySelector('.name') as HTMLElement).textContent = a.name;
  host.appendChild(el);
  window.setTimeout(() => el.remove(), 5500);
}

export function unlock(id: string): void {
  if (state.unlocked.includes(id)) return;
  const a = ACHIEVEMENTS[id];
  if (!a) return;
  state.unlocked.push(id);
  save(state);
  toast(a);
}

export function trackCommand(name: string, totalCommandCount: number): void {
  if (!state.commandsSeen.includes(name)) {
    state.commandsSeen.push(name);
    save(state);
  }
  if (state.commandsSeen.length >= 1) unlock('first_contact');
  if (state.commandsSeen.length >= 5) unlock('curious');
  if (state.commandsSeen.length >= totalCommandCount) unlock('completionist');
}

export function trackTheme(name: string, allThemes: readonly string[]): void {
  if (!state.themesSeen.includes(name)) {
    state.themesSeen.push(name);
    save(state);
  }
  if (allThemes.every((t) => state.themesSeen.includes(t))) {
    unlock('wardrobe');
  }
}

export function getUnlocked(): Achievement[] {
  return state.unlocked
    .map((id) => ACHIEVEMENTS[id])
    .filter((x): x is Achievement => !!x);
}

export function getAll(): Achievement[] {
  return Object.values(ACHIEVEMENTS);
}

export function isUnlocked(id: string): boolean {
  return state.unlocked.includes(id);
}
