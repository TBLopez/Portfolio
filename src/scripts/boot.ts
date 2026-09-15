/* BIOS-style boot sequence shown on first visit (and on `reboot`). */

import { audio } from './audio';

const STORAGE_KEY = 'boot.shown';

/**
 * Only one boot may own the overlay at a time. Running two of these
 * concurrently (page load + `reboot`) used to interleave their DOM writes and
 * the *older* run would tear the overlay down mid-sequence.
 */
let activeRun: { cancel: () => void } | null = null;

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/** Real device values where the browser exposes them, plausible text where not. */
function bootLines(): Array<{ text: string; delay: number; tag?: 'ok' | 'warn' }> {
  const ua = navigator.userAgent;
  const cores = navigator.hardwareConcurrency || 8;
  const arch = /arm64|aarch64|apple/i.test(ua)
    ? 'arm64'
    : /x86_64|win64|x64/i.test(ua)
      ? 'x86_64'
      : 'unknown';
  const os = (() => {
    if (/android/i.test(ua)) return 'Android';
    if (/iphone|ipad|ipod/i.test(ua)) return 'iOS';
    if (/mac os x|macintosh/i.test(ua)) return 'macOS';
    if (/windows/i.test(ua)) return 'Windows';
    if (/linux/i.test(ua)) return 'Linux';
    return 'FireflyOS';
  })();
  const memory = (
    navigator as Navigator & { deviceMemory?: number }
  ).deviceMemory;
  const post = Math.max(1, Math.round(performance.now()));

  return [
    { text: 'FIREFLY-BIOS v6.0.8  (c) Tony Industries', delay: 80 },
    { text: `POST: CPU ......... cores: ${cores} / arch: ${arch}`, delay: 70, tag: 'ok' },
    {
      text: `POST: MEM ......... ${memory ? `${memory} GB reported` : 'capacity hidden by browser'}`,
      delay: 70,
      tag: 'ok',
    },
    {
      text: `POST: NIC ......... ${navigator.onLine ? 'link UP' : 'link DOWN'}`,
      delay: 90,
      tag: navigator.onLine ? 'ok' : 'warn',
    },
    { text: `Mounting /dev/sda1 ................. (${post}ms)`, delay: 110, tag: 'ok' },
    { text: 'Loading kernel modules: nf_conntrack, raw_sock, hidkbd, audio_synth', delay: 120, tag: 'ok' },
    { text: `Initializing terminal subsystem .... ${os} / ${navigator.language}`, delay: 80, tag: 'ok' },
    { text: 'Decrypting /home/operator/firefly ....', delay: 140, tag: 'ok' },
    { text: 'Validating notion uplink ............', delay: 110 },
    { text: 'Spawning shell: /bin/firefly-sh', delay: 90, tag: 'ok' },
    { text: '', delay: 40 },
    { text: '> WELCOME, OPERATOR.', delay: 60 },
  ];
}

export function shouldShowBoot(): boolean {
  return !sessionStorage.getItem(STORAGE_KEY);
}

export function markBootShown(): void {
  sessionStorage.setItem(STORAGE_KEY, '1');
}

export async function runBoot(): Promise<void> {
  // A fresh boot supersedes whatever is on screen.
  activeRun?.cancel();

  const overlay = document.getElementById('boot-overlay');
  if (!overlay) return;

  let cancelled = false;
  const run = {
    cancel: () => {
      cancelled = true;
    },
  };
  activeRun = run;

  overlay.innerHTML = '';
  overlay.classList.add('active');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('booting');
  audio.play('boot');

  const skip = document.createElement('button');
  skip.className = 'boot-skip';
  skip.type = 'button';
  skip.textContent = '[ SKIP ▶ ]';
  overlay.appendChild(skip);

  const finish = () => {
    window.clearTimeout(keyTimerId);
    document.removeEventListener('keydown', onKey);
    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('booting');
    if (activeRun === run) activeRun = null;
    markBootShown();
    document.getElementById('cmd-input')?.focus();
  };

  const cancel = () => run.cancel();

  skip.addEventListener('click', cancel);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') cancel();
  };
  // Register on the next task, not synchronously: `reboot` kicks this off from
  // inside the Enter keydown handler, and the very same event would still be
  // bubbling when the listener attaches — cancelling the boot it just started.
  const keyTimerId = window.setTimeout(
    () => document.addEventListener('keydown', onKey),
    0,
  );

  const wait = (ms: number) =>
    new Promise<void>((res) => window.setTimeout(res, ms));

  const reduced = prefersReducedMotion();

  for (const line of bootLines()) {
    if (cancelled) break;
    const div = document.createElement('div');
    div.className = 'boot-line' + (line.tag ? ' ' + line.tag : '');
    div.textContent = line.text;
    overlay.appendChild(div);
    await wait(reduced ? 5 : line.delay);
  }

  // Cancelled (or superseded). If another run has taken over the overlay we
  // must not tear down its classes; if the user skipped, close as normal.
  if (cancelled) {
    if (activeRun === run) finish();
    else document.removeEventListener('keydown', onKey);
    return;
  }

  await wait(reduced ? 50 : 350);
  finish();
}
