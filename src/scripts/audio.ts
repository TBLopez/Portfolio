/**
 * Firefly sound engine.
 *
 * Everything is synthesized with the Web Audio API — no sample files, no
 * network requests. Six voices:
 *
 *   key    mechanical switch under a finger (real keystrokes)
 *   type   the typewriter printing output — a quiet falling-code tick
 *   enter  carriage return thunk + typewriter margin bell
 *   done   data-stream shimmer when a block of output finishes
 *   error  gated digital glitch for a bad command
 *   boot   sub thump + noise swell when the machine starts
 *   whisper  slow warm swell — the machine answering a question
 *
 * Plus a continuous "digital rain" bed that runs while the matrix effect is
 * on, built from a filtered noise loop with random crackle ticks panned
 * across the stereo field.
 *
 * All of it is gated behind a master gain (the SFX toggle), bussed through a
 * short synthesized room so the clacks have somewhere to live.
 */

export type SfxVoice =
  | 'key'
  | 'type'
  | 'enter'
  | 'done'
  | 'error'
  | 'boot'
  | 'surge'
  | 'whisper';

export type SfxState = {
  muted: boolean;
  /** 0…1 */
  volume: number;
  ambient: boolean;
  ready: boolean;
};

const MUTE_KEY = 'sfx';
const VOLUME_KEY = 'sfx.volume';
const DEFAULT_VOLUME = 0.7;

const rnd = (min: number, max: number) => min + Math.random() * (max - min);

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
}

function loadVolume(): number {
  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    if (raw !== null) {
      const v = Number(raw);
      if (Number.isFinite(v)) return Math.min(1, Math.max(0, v));
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_VOLUME;
}

function defaultMuted(): boolean {
  try {
    const stored = localStorage.getItem(MUTE_KEY);
    if (stored === 'on') return false;
    if (stored === 'off') return true;
  } catch {
    /* ignore */
  }
  return prefersReducedMotion();
}

type AudioCtor = typeof AudioContext;

declare global {
  interface Window {
    webkitAudioContext?: AudioCtor;
  }
}

class AudioEngine {
  private ctx: AudioContext | null = null;
  /** Dry path for every voice. */
  private bus: GainNode | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private ambient: { src: AudioBufferSourceNode; gain: GainNode; lfo: OscillatorNode } | null =
    null;
  private ambientTimer: number | null = null;
  private ambientWanted = false;

  private lastTickAt = 0;
  private muted = defaultMuted();
  private volume = loadVolume();
  private listeners = new Set<(state: SfxState) => void>();

  // ── public API ─────────────────────────────────────────────────────────

  getState(): SfxState {
    return {
      muted: this.muted,
      volume: this.volume,
      ambient: !!this.ambient,
      ready: !!this.ctx,
    };
  }

  isMuted(): boolean {
    return this.muted;
  }

  getVolume(): number {
    return this.volume;
  }

  onChange(fn: (state: SfxState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Must be called from a user gesture before anything will be audible. */
  init(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;

    const ctx = new Ctor();
    this.ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : this.volume;
    master.connect(ctx.destination);
    this.master = master;

    // Voices land here, then split dry/wet into a small synthesized room.
    const bus = ctx.createGain();
    bus.connect(master);
    this.bus = bus;

    const room = ctx.createConvolver();
    room.buffer = this.makeImpulse(0.42, 3.2);
    const send = ctx.createGain();
    send.gain.value = 0.13;
    bus.connect(send);
    send.connect(room);
    room.connect(master);

    this.noiseBuffer = this.makeNoise(2);
    this.syncAmbient();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    try {
      localStorage.setItem(MUTE_KEY, muted ? 'off' : 'on');
    } catch {
      /* ignore */
    }
    if (!muted) this.init();
    this.applyGain();
    this.notify();
  }

  toggle(): void {
    this.setMuted(!this.muted);
  }

  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume));
    try {
      localStorage.setItem(VOLUME_KEY, String(this.volume));
    } catch {
      /* ignore */
    }
    this.applyGain();
    this.notify();
  }

  /** Turn the rain bed on/off (it only sounds when unmuted). */
  setAmbient(wanted: boolean): void {
    this.ambientWanted = wanted;
    this.syncAmbient();
    this.notify();
  }

  isAmbient(): boolean {
    return !!this.ambient;
  }

  play(voice: SfxVoice): void {
    if (this.muted || !this.ctx || !this.bus) return;
    if (this.ctx.state === 'suspended') void this.ctx.resume();

    const t = this.ctx.currentTime + 0.001;

    // Keystrokes can arrive faster than the speaker can resolve them (held
    // keys, fast typewrite) — drop anything inside 22ms. Rate-limit on the
    // wall clock, not ctx.currentTime: a suspended context (autoplay policy,
    // no output device) freezes currentTime at 0, which would swallow every
    // keystroke forever instead of just the doubled ones.
    if (voice === 'key' || voice === 'type') {
      const now = performance.now();
      if (now - this.lastTickAt < 22) return;
      this.lastTickAt = now;
    }

    switch (voice) {
      case 'key':
        this.key(t);
        break;
      case 'type':
        this.codeTick(t);
        break;
      case 'enter':
        this.enter(t);
        break;
      case 'done':
        this.done(t);
        break;
      case 'error':
        this.error(t);
        break;
      case 'boot':
        this.boot(t);
        break;
      case 'surge':
        this.surge(t);
        break;
      case 'whisper':
        this.whisper(t);
        break;
    }
  }

  // ── voices ─────────────────────────────────────────────────────────────

  /** Mechanical switch: top click, housing body, low thump, occasional rattle. */
  private key(t: number): void {
    this.noise({ t, dur: 0.012, filter: 'highpass', freq: rnd(3600, 5200), gain: 0.05 });
    this.noise({
      t: t + 0.002,
      dur: rnd(0.04, 0.055),
      filter: 'bandpass',
      freq: rnd(1050, 1750),
      q: 1.1,
      gain: rnd(0.12, 0.17),
    });
    this.tone({ t, freq: rnd(96, 148), dur: 0.055, gain: 0.12, to: 62 });
    if (Math.random() < 0.22) {
      this.noise({
        t: t + 0.006,
        dur: 0.018,
        filter: 'bandpass',
        freq: rnd(2400, 3200),
        q: 2,
        gain: 0.03,
      });
    }
  }

  /** Falling-code tick: high, narrow, quiet — the typewriter printing. */
  private codeTick(t: number): void {
    this.noise({ t, dur: 0.011, filter: 'highpass', freq: rnd(5200, 7200), gain: 0.035 });
    this.tone({ t, freq: rnd(1500, 2700), dur: 0.02, gain: 0.016 });
  }

  /** Carriage return + margin bell. */
  private enter(t: number): void {
    this.tone({ t, freq: 88, to: 58, dur: 0.16, gain: 0.2 });
    this.noise({
      t,
      dur: 0.09,
      filter: 'lowpass',
      freq: 620,
      gain: 0.13,
    });
    // Bell: two inharmonic partials, long-ish decay.
    const bell = rnd(30, 45);
    this.tone({ t: t + 0.012, freq: 1046.5, dur: 0.3, gain: 0.032 });
    this.tone({ t: t + 0.012 + bell / 1000, freq: 1569.8, dur: 0.26, gain: 0.022 });
  }

  /** Data shimmer closing an output block. */
  private done(t: number): void {
    this.noise({
      t,
      dur: 0.17,
      filter: 'bandpass',
      freq: 2600,
      freqTo: 620,
      q: 3.2,
      gain: 0.05,
    });
    this.tone({ t, freq: 740, to: 520, dur: 0.09, gain: 0.02 });
  }

  /**
   * The one voice in here that doesn't click. A slow swell of partials in C
   * (C2/C3/G3/G4) that reads as something answering rather than something
   * printing — used when the terminal speaks for itself.
   */
  private whisper(t: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const partials = [
      { freq: 65.41, gain: 0.05, dur: 1.5, attack: 0.3 },
      { freq: 130.81, gain: 0.05, dur: 1.9, attack: 0.4 },
      { freq: 196.0, gain: 0.03, dur: 1.7, attack: 0.55 },
      { freq: 392.0, gain: 0.011, dur: 1.15, attack: 0.7 },
    ];
    for (const p of partials) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(p.freq, t);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.linearRampToValueAtTime(p.gain, t + p.attack);
      env.gain.exponentialRampToValueAtTime(0.0001, t + p.dur);
      osc.connect(env);
      env.connect(this.bus!);
      osc.start(t);
      osc.stop(t + p.dur + 0.05);
    }
  }

  /** Gated square glitch. */
  private error(t: number): void {
    const osc = this.ctx!.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(78, t + 0.22);
    const env = this.ctx!.createGain();
    const steps = 7;
    for (let i = 0; i < steps; i++) {
      const at = t + i * (0.22 / steps);
      env.gain.setValueAtTime(i % 2 === 0 ? 0.055 : 0.008, at);
    }
    env.gain.setValueAtTime(0.0001, t + 0.23);
    osc.connect(env);
    env.connect(this.bus!);
    osc.start(t);
    osc.stop(t + 0.24);
    this.noise({ t, dur: 0.05, filter: 'highpass', freq: 2200, gain: 0.05 });
  }

  /** Startup sub thump with a noise swell. */
  private boot(t: number): void {
    this.tone({ t, freq: 42, to: 68, dur: 0.34, gain: 0.2 });
    this.noise({ t, dur: 0.4, filter: 'lowpass', freq: rnd(700, 1000), gain: 0.07 });
  }

  /** Rain surge while typing. */
  private surge(t: number): void {
    this.noise({
      t,
      dur: 0.14,
      filter: 'bandpass',
      freq: rnd(380, 620),
      freqTo: rnd(2200, 3000),
      q: 1.4,
      gain: 0.035,
    });
  }

  // ── primitives ─────────────────────────────────────────────────────────

  private noise(opts: {
    t: number;
    dur: number;
    filter: BiquadFilterType;
    freq: number;
    freqTo?: number;
    q?: number;
    gain: number;
  }): void {
    const ctx = this.ctx;
    if (!ctx || !this.noiseBuffer) return;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    src.playbackRate.value = rnd(0.85, 1.15);

    const filter = ctx.createBiquadFilter();
    filter.type = opts.filter;
    filter.frequency.setValueAtTime(opts.freq, opts.t);
    if (opts.freqTo) {
      filter.frequency.exponentialRampToValueAtTime(opts.freqTo, opts.t + opts.dur);
    }
    if (opts.q) filter.Q.value = opts.q;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, opts.t);
    env.gain.exponentialRampToValueAtTime(Math.max(opts.gain, 0.0002), opts.t + 0.0015);
    env.gain.exponentialRampToValueAtTime(0.0001, opts.t + opts.dur);

    src.connect(filter);
    filter.connect(env);
    env.connect(this.bus!);
    src.start(opts.t, rnd(0, 1.5));
    src.stop(opts.t + opts.dur + 0.02);
  }

  private tone(opts: {
    t: number;
    freq: number;
    to?: number;
    dur: number;
    gain: number;
    type?: OscillatorType;
  }): void {
    const ctx = this.ctx;
    if (!ctx) return;

    const osc = ctx.createOscillator();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(opts.freq, opts.t);
    if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, opts.t + opts.dur);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, opts.t);
    env.gain.exponentialRampToValueAtTime(Math.max(opts.gain, 0.0002), opts.t + 0.002);
    env.gain.exponentialRampToValueAtTime(0.0001, opts.t + opts.dur);

    osc.connect(env);
    env.connect(this.bus!);
    osc.start(opts.t);
    osc.stop(opts.t + opts.dur + 0.02);
  }

  // ── ambience ───────────────────────────────────────────────────────────

  private syncAmbient(): void {
    const shouldRun =
      this.ambientWanted && !this.muted && this.volume > 0.02 && !!this.ctx;
    if (shouldRun && !this.ambient) this.startAmbient();
    else if (!shouldRun && this.ambient) this.stopAmbient();
  }

  private startAmbient(): void {
    const ctx = this.ctx;
    if (!ctx || !this.noiseBuffer || !this.bus) return;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    src.playbackRate.value = 0.6;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 880;
    filter.Q.value = 0.7;

    // Slow filter drift so the bed breathes instead of hissing.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 420;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    gain.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 0.8);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.bus);
    src.start();
    lfo.start();
    this.ambient = { src, gain, lfo };

    const tick = () => {
      if (!this.ambient || !this.ctx) return;
      if (!this.muted) {
        const panner =
          typeof this.ctx.createStereoPanner === 'function'
            ? this.ctx.createStereoPanner()
            : null;
        if (panner) {
          panner.pan.value = rnd(-0.85, 0.85);
          panner.connect(this.bus!);
        }
        const target = panner ?? this.bus!;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0001, this.ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(rnd(0.006, 0.03), this.ctx.currentTime + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + rnd(0.02, 0.07));
        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = rnd(1800, 5200);
        bp.Q.value = 4;
        const s = this.ctx.createBufferSource();
        s.buffer = this.noiseBuffer;
        s.loop = true;
        s.playbackRate.value = rnd(0.9, 1.4);
        s.connect(bp);
        bp.connect(g);
        g.connect(target);
        s.start(this.ctx.currentTime, rnd(0, 1.5));
        s.stop(this.ctx.currentTime + 0.09);
      }
      this.ambientTimer = window.setTimeout(tick, rnd(140, 520));
    };
    this.ambientTimer = window.setTimeout(tick, rnd(120, 400));
  }

  private stopAmbient(): void {
    if (this.ambientTimer !== null) {
      window.clearTimeout(this.ambientTimer);
      this.ambientTimer = null;
    }
    const ctx = this.ctx;
    const nodes = this.ambient;
    this.ambient = null;
    if (!ctx || !nodes) return;
    try {
      nodes.gain.gain.cancelScheduledValues(ctx.currentTime);
      nodes.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.15);
      nodes.src.stop(ctx.currentTime + 0.6);
      nodes.lfo.stop(ctx.currentTime + 0.6);
    } catch {
      /* already stopped */
    }
  }

  // ── buffers ────────────────────────────────────────────────────────────

  /** Short exponential-decay noise impulse: a small, dry room. */
  private makeImpulse(duration: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const rate = ctx.sampleRate;
    const length = Math.max(1, Math.floor(rate * duration));
    const buffer = ctx.createBuffer(2, length, rate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    return buffer;
  }

  private makeNoise(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const rate = ctx.sampleRate;
    const length = Math.max(1, Math.floor(rate * seconds));
    const buffer = ctx.createBuffer(2, length, rate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  private applyGain(): void {
    if (!this.ctx || !this.master) return;
    const target = this.muted ? 0 : this.volume;
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.02);
    this.syncAmbient();
  }

  private notify(): void {
    const state = this.getState();
    this.listeners.forEach((fn) => fn(state));
  }
}

export const audio = new AudioEngine();
