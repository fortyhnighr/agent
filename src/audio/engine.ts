/**
 * Audio.
 *
 * Form 1 is a machine: servo whines, coil crackle, the snap of a clean hit.
 * Form 2 is a weather system: continuous thunder, deep cracks, a sub-bass bed
 * that you feel, and impacts that are meant to be the loudest thing in the
 * game. Then, the moment the blessing expires, absolute silence - and one
 * single enormous impact when The Creator answers.
 *
 * Everything is synthesised: no asset files, no network, no timers that could
 * drift. It only ever reads simulation state and events.
 */

import { STAGE } from '../sim/const';

type Wave = OscillatorType;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  /** Storm bed: rain noise + a low rumble that only exists in Form 2. */
  private stormGain: GainNode | null = null;
  private stormFilter: BiquadFilterNode | null = null;
  private stormSource: AudioBufferSourceNode | null = null;
  private subOsc: OscillatorNode | null = null;
  private subGain: GainNode | null = null;
  private started = false;
  private muted = false;
  /** While true the storm bed stops and only one hit is allowed through. */
  silenced = false;

  /** Must be called from a user gesture. Safe to call repeatedly. */
  resume(): void {
    if (!this.ctx) {
      this.build();
    }
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.9, this.ctx.currentTime, 0.05);
    }
  }

  private build(): void {
    const Ctor: typeof AudioContext | undefined =
      typeof window === 'undefined'
        ? undefined
        : window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    let ctx: AudioContext;
    try {
      ctx = new Ctor();
    } catch {
      return;
    }
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(ctx.destination);
    this.bus = ctx.createGain();
    this.bus.gain.value = 1;
    this.bus.connect(this.master);

    // 2 seconds of white noise, reused for every impact and the storm bed.
    const len = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let seed = 0x1a2b3c4d;
    for (let i = 0; i < len; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      data[i] = (seed / 2147483648 - 1) * 0.6;
    }
    this.noise = buf;

    // Storm bed, silent until Form 2 asks for it.
    this.stormGain = ctx.createGain();
    this.stormGain.gain.value = 0;
    this.stormFilter = ctx.createBiquadFilter();
    this.stormFilter.type = 'lowpass';
    this.stormFilter.frequency.value = 420;
    this.stormSource = ctx.createBufferSource();
    this.stormSource.buffer = buf;
    this.stormSource.loop = true;
    this.stormSource.connect(this.stormFilter);
    this.stormFilter.connect(this.stormGain);
    this.stormGain.connect(this.master);
    this.stormSource.start();

    // Sub-bass: the pressure of a divine machine standing still.
    this.subOsc = ctx.createOscillator();
    this.subOsc.type = 'sine';
    this.subOsc.frequency.value = 32;
    this.subGain = ctx.createGain();
    this.subGain.gain.value = 0;
    this.subOsc.connect(this.subGain);
    this.subGain.connect(this.master);
    this.subOsc.start();
    this.started = true;
  }

  /** Called every rendered frame with the current storm level. */
  setStorm(level: number): void {
    if (!this.ctx || !this.stormGain || !this.stormFilter || !this.subGain) return;
    const t = this.ctx.currentTime;
    const target = this.silenced ? 0 : Math.max(0, Math.min(1, level));
    this.stormGain.gain.setTargetAtTime(target * 0.11, t, 0.4);
    this.stormFilter.frequency.setTargetAtTime(320 + target * 900, t, 0.5);
    this.subGain.gain.setTargetAtTime(target * 0.16, t, 0.6);
  }

  /** Routes a node to the bus, panned by the world position it came from. */
  private route(node: AudioNode, pan: number): void {
    if (!this.ctx || !this.bus || !this.master) return;
    if (pan === 0 || !this.ctx.createStereoPanner) {
      node.connect(this.bus);
      return;
    }
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    node.connect(panner);
    panner.connect(this.bus);
  }

  private tone(freq: number, dur: number, type: Wave, gain: number, sweepTo?: number, delay = 0, pan = 0): void {
    if (!this.ctx || !this.bus || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (sweepTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    this.route(g, pan);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noiseBurst(dur: number, gain: number, freq: number, q = 1, delay = 0, sweepTo?: number, pan = 0): void {
    if (!this.ctx || !this.bus || !this.noise || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + (freq % 100) / 400;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    this.route(g, pan);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  /** Deep thunder: the sound of the arena reacting, not the attacker. */
  private thunder(gain = 0.5, dur = 1.6, delay = 0, pan = 0): void {
    this.noiseBurst(dur, gain, 90, 0.7, delay, 34, pan);
    this.tone(46, dur * 0.8, 'sine', gain * 0.7, 28, delay, pan);
  }

  /**
   * Event router. `id` matches the simulation's sfx ids, `heat` is 1 while the
   * machine is in Form 2.
   */
  play(id: string, heat = 0, pan = 0): void {
    if (!this.ctx || !this.started) return;
    if (this.silenced) {
      // During the silence only the Creator's answer is allowed to sound.
      if (id !== 'creatorSmite') return;
    }
    switch (id) {
      /* --- Form 1: mechanical and electrical --- */
      case 'jump':
        this.noiseBurst(0.12, 0.14, 900, 2);
        break;
      case 'travelInvuln':
        this.tone(1200, 0.16, 'triangle', 0.08, 2200);
        break;
      case 'railCharge':
        this.tone(180, 0.5, 'sawtooth', 0.06, 900, 0, pan);
        this.noiseBurst(0.5, 0.05, 1600, 3, 0, undefined, pan);
        break;
      case 'heavenfall':
        this.tone(320, 0.5, 'sine', 0.1, 90, 0, pan);
        this.noiseBurst(0.45, 0.1, 700, 1.2, 0, undefined, pan);
        break;
      case 'thunderlineFire':
        this.noiseBurst(0.4, 0.24, 2600, 1.4, 0, 500, pan);
        this.tone(1400, 0.28, 'sawtooth', 0.1, 260, 0, pan);
        break;
      case 'thunderlineReuse':
        this.noiseBurst(0.3, 0.2, 1800, 1.6, 0.04, 400, pan);
        break;
      case 'arrayFire':
        this.noiseBurst(0.7, 0.26, 2200, 1.1, 0, 380, pan);
        for (let i = 0; i < 5; i++) this.tone(900 - i * 90, 0.4, 'triangle', 0.05, 260, i * 0.035, pan);
        break;
      case 'judgementCharge':
        this.tone(220, 0.6, 'square', 0.06, 1400);
        break;
      case 'judgementBolt':
        this.noiseBurst(0.6, 0.3, 3200, 1.2, 0, 320);
        this.thunder(0.4, 1.2, 0.05);
        break;
      case 'perfectPhase':
        this.tone(1600, 0.5, 'sine', 0.12, 400);
        this.tone(2400, 0.4, 'triangle', 0.06, 800, 0.03);
        this.noiseBurst(0.5, 0.1, 3000, 2, 0, 900);
        break;
      case 'chargeGain':
        this.tone(880, 0.09, 'triangle', 0.05, 1320);
        break;
      case 'chargeSpend':
        this.tone(520, 0.18, 'sawtooth', 0.07, 180);
        break;
      case 'guardBreak':
        this.noiseBurst(0.4, 0.3, 1800, 0.9, 0, 200);
        this.tone(200, 0.4, 'square', 0.14, 70);
        break;
      case 'armor':
        this.noiseBurst(0.2, 0.22, 900, 1.6);
        this.tone(140, 0.2, 'square', 0.1, 90);
        break;
      case 'ko':
        this.tone(180, 1.2, 'sawtooth', 0.2, 40);
        this.thunder(0.5, 1.8);
        break;
      /* --- Form 2: divine --- */
      case 'proxyStart':
        this.tone(60, 2.4, 'sine', 0.3, 220);
        this.thunder(0.8, 2.6);
        this.noiseBurst(1.8, 0.3, 700, 0.6, 0.1, 120);
        break;
      case 'proxySuccess':
        this.tone(110, 2.0, 'sine', 0.24, 440);
        this.thunder(0.6, 2.2);
        break;
      case 'ahCreator':
        this.tone(140, 1.4, 'sine', 0.2, 520);
        this.noiseBurst(1.2, 0.18, 1200, 0.8, 0.05, 200);
        break;
      case 'decapitate':
        this.noiseBurst(0.5, 0.4, 2400, 1.1, 0, 300);
        this.tone(70, 0.9, 'sine', 0.28, 30);
        break;
      case 'andShowYou':
        this.noiseBurst(0.7, 0.34, 2000, 1, 0, 260);
        this.thunder(0.5, 1.6, 0.04);
        break;
      case 'myUnrelentingMight':
        this.thunder(0.9, 2.8);
        this.tone(40, 2.0, 'sine', 0.3, 24);
        break;
      case 'judgementCreator':
        this.thunder(1.0, 3.0);
        this.noiseBurst(1.4, 0.36, 1200, 0.7, 0.02, 90);
        break;
      case 'mightOfMine':
        this.thunder(1.0, 3.4);
        this.tone(36, 2.6, 'sine', 0.32, 20);
        this.noiseBurst(1.6, 0.34, 900, 0.6, 0.05, 80);
        break;
      case 'divineFall':
        this.thunder(0.7, 2.0);
        break;
      case 'creatorSmite':
        // The loudest impact in the game, and the only sound after the silence.
        this.noiseBurst(2.4, 1.0, 2400, 0.4, 0, 40);
        this.tone(30, 3.0, 'sine', 0.5, 18);
        this.tone(90, 1.6, 'sawtooth', 0.3, 26);
        this.thunder(1.0, 3.2);
        break;
      default:
        if (heat > 0) {
          this.noiseBurst(0.18, 0.2, 1400 + (id.length * 90), 1.5, 0, undefined, pan);
          this.tone(220 + id.length * 40, 0.16, 'sawtooth', 0.07, 80, 0, pan);
        } else {
          this.noiseBurst(0.1, 0.14, 1100 + (id.length * 70), 1.8, 0, undefined, pan);
          this.tone(240 + id.length * 30, 0.1, 'square', 0.05, 110, 0, pan);
        }
        break;
    }
  }

  /** A clean connect: the small, satisfying snap. */
  hit(heavy = false, heat = 0, pan = 0): void {
    this.noiseBurst(heavy ? 0.22 : 0.1, heavy ? 0.3 : 0.17, heavy ? 900 : 1800, 1.3, 0, heavy ? 160 : 400, pan);
    this.tone(heavy ? 90 : 200, heavy ? 0.24 : 0.1, 'square', heavy ? 0.16 : 0.07, heavy ? 40 : 90, 0, pan);
    if (heat) this.tone(1200, 0.3, 'sawtooth', 0.1, 200, 0, pan);
  }

  block(pan = 0): void {
    this.noiseBurst(0.08, 0.12, 2600, 2.4, 0, 1400, pan);
  }

  /** Called when the arena must go completely quiet. */
  setSilenced(on: boolean): void {
    this.silenced = on;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.bus) this.bus.gain.setTargetAtTime(on ? 0 : 1, t, 0.08);
    if (this.stormGain) this.stormGain.gain.setTargetAtTime(on ? 0 : 0.11, t, 0.15);
    if (this.subGain) this.subGain.gain.setTargetAtTime(on ? 0 : 0.16, t, 0.2);
  }

  dispose(): void {
    try {
      this.stormSource?.stop();
      this.subOsc?.stop();
      void this.ctx?.close();
    } catch {
      /* already closed */
    }
    this.ctx = null;
    this.started = false;
  }
}

/** Pan for a world position, -1 left to 1 right. */
export function panFor(x: number): number {
  return Math.max(-1, Math.min(1, x / STAGE.halfWidth));
}
