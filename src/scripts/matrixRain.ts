/* Lightweight canvas-based matrix rain.
   Pulls its colors from CSS variables so it follows the active theme. */

const CHARS =
  'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEF<>/\\:;|*+-=#@';

type Engine = {
  start: () => void;
  stop: () => void;
  toggle: () => boolean;
  isActive: () => boolean;
  /** Fast burst: typing feeds the rain. */
  surge: () => void;
};

let singleton: Engine | null = null;

export function getMatrixRain(): Engine {
  if (singleton) return singleton;

  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let drops: number[] = [];
  let rafId: number | null = null;
  let lastFrame = 0;
  let active = false;
  let boostUntil = 0;
  let surgeTimer: number | undefined;
  const cellSize = 16;

  const ensureCanvas = () => {
    if (canvas) return;
    canvas = document.getElementById('matrix-rain') as HTMLCanvasElement | null;
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
  };

  const resize = () => {
    if (!canvas) return;
    const maxDpr = window.innerWidth < 768 ? 1 : 2;
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    ctx?.scale(dpr, dpr);
    const cols = Math.ceil(window.innerWidth / cellSize);
    drops = new Array(cols)
      .fill(0)
      .map(() => Math.floor(Math.random() * (window.innerHeight / cellSize)));
  };

  const themeRgb = (cssVar: string): string => {
    const root = getComputedStyle(document.documentElement);
    const v = root.getPropertyValue(cssVar).trim();
    return v || '0 255 65';
  };

  const tick = (now: number) => {
    if (!active || !ctx || !canvas) return;
    const surging = now < boostUntil;
    if (now - lastFrame < (surging ? 32 : 55)) {
      rafId = requestAnimationFrame(tick);
      return;
    }
    lastFrame = now;

    // Trail fade
    ctx.fillStyle = 'rgba(0, 0, 0, 0.07)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const headColor = themeRgb('--c-primary-container');
    const bodyColor = themeRgb('--c-secondary');
    ctx.font = `bold ${cellSize}px "JetBrains Mono", monospace`;

    for (let i = 0; i < drops.length; i++) {
      const ch = CHARS.charAt(Math.floor(Math.random() * CHARS.length));
      const x = i * cellSize;
      const y = drops[i] * cellSize;
      // bright leading char
      ctx.fillStyle = `rgb(${headColor} / 0.95)`;
      ctx.fillText(ch, x, y);
      // dimmer tail char two steps back
      ctx.fillStyle = `rgb(${bodyColor} / 0.55)`;
      ctx.fillText(
        CHARS.charAt(Math.floor(Math.random() * CHARS.length)),
        x,
        y - cellSize * 2,
      );

      if (y > window.innerHeight && Math.random() > 0.965) {
        drops[i] = 0;
      }
      drops[i] += surging ? 2 : 1;
    }
    rafId = requestAnimationFrame(tick);
  };

  singleton = {
    start: () => {
      ensureCanvas();
      if (!canvas) return;
      if (active) return;
      active = true;
      canvas.classList.add('active');
      lastFrame = 0;
      rafId = requestAnimationFrame(tick);
    },
    stop: () => {
      active = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
      canvas?.classList.remove('active');
      if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
    },
    toggle: () => {
      if (active) singleton!.stop();
      else singleton!.start();
      return active;
    },
    isActive: () => active,
    surge: () => {
      if (!active || !canvas) return;
      boostUntil = performance.now() + 280;
      // Seed a few fresh streams from the top so the burst is visible even if
      // every existing column is already mid-screen.
      const seeds = Math.max(2, Math.floor(drops.length * 0.05));
      for (let i = 0; i < seeds; i++) {
        drops[Math.floor(Math.random() * drops.length)] = 0;
      }
      canvas.classList.add('surge');
      if (surgeTimer) window.clearTimeout(surgeTimer);
      surgeTimer = window.setTimeout(() => canvas?.classList.remove('surge'), 280);
    },
  };
  return singleton;
}
