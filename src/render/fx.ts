/**
 * Effect layer: sparks, arcs, clouds, scars and impact rings.
 *
 * This is presentation only. It never writes to MatchState and never feeds
 * back into the simulation, so it is free to run on its own clock. To keep
 * replays looking identical it drives itself from a small hash of the frame
 * number instead of Math.random.
 */

import { GOLD, GOLD_HI, WHITE_GOLD, rgba } from './palette';
import type { SimEvent } from '../sim/types';

export type FxKind =
  | 'spark'
  | 'arc'
  | 'cloud'
  | 'ring'
  | 'shard'
  | 'scorch'
  | 'streak'
  | 'pillar'
  | 'cloudFrag'
  | 'ember';

export interface Particle {
  kind: FxKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  rot: number;
  spin: number;
  heat: number;
  seed: number;
}

export interface Scar {
  x: number;
  y: number;
  life: number;
  maxLife: number;
  size: number;
  seed: number;
}

export interface Beam {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  life: number;
  maxLife: number;
  width: number;
  heat: number;
  seed: number;
}

export interface Banner {
  id: string;
  text: string;
  sub: string;
  player: number;
  life: number;
  maxLife: number;
}

/** Small deterministic hash so every replay draws the same sparks. */
function hash(n: number): number {
  let x = n >>> 0;
  x ^= x << 13;
  x >>>= 0;
  x ^= x >> 17;
  x ^= x << 5;
  x >>>= 0;
  return x;
}

function rand(seed: number, i: number): number {
  return (hash(seed + i * 0x9e3779b9) >>> 0) / 4294967296;
}

export class FxLayer {
  readonly particles: Particle[] = [];
  readonly scars: Scar[] = [];
  readonly beams: Beam[] = [];
  readonly banners: Banner[] = [];
  /** Camera shake left to decay, in world units. */
  shake = 0;
  /** Full screen flash 0..1. */
  flash = 0;
  /** White-gold pillar frames remaining (The Creator's answer). */
  pillar = 0;
  /** How bright the arena's background lightning is, 0..1. */
  skyFlash = 0;
  private seed = 0x51ed270b;
  /** Set while the arena is silent (the "Fool." beat). */
  silenced = false;

  reset(seed: number): void {
    this.seed = seed >>> 0;
    this.particles.length = 0;
    this.scars.length = 0;
    this.beams.length = 0;
    this.banners.length = 0;
    this.shake = 0;
    this.flash = 0;
    this.pillar = 0;
    this.skyFlash = 0;
  }

  private next(): number {
    this.seed = hash(this.seed + 0x9e3779b9);
    return this.seed >>> 0;
  }

  spawn(kind: FxKind, x: number, y: number, opts: Partial<Particle> = {}): Particle {
    const p: Particle = {
      kind,
      x,
      y,
      vx: opts.vx ?? 0,
      vy: opts.vy ?? 0,
      life: opts.life ?? 20,
      maxLife: opts.life ?? 20,
      size: opts.size ?? 3,
      rot: opts.rot ?? 0,
      spin: opts.spin ?? 0,
      heat: opts.heat ?? 0,
      seed: this.next(),
    };
    this.particles.push(p);
    return p;
  }

  /** A cone of impact sparks. */
  burst(x: number, y: number, count: number, heat: number, power = 1): void {
    for (let i = 0; i < count; i++) {
      const a = rand(this.seed, i * 3 + 1) * Math.PI * 2;
      const s = (2 + rand(this.seed, i * 3 + 2) * 9) * power;
      this.spawn('spark', x, y, {
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s + 2,
        life: 10 + rand(this.seed, i * 3 + 3) * 16,
        size: 1.2 + rand(this.seed, i + 91) * 2.4 * power,
        heat,
      });
    }
  }

  /** Rising gold embers: the charge economy made visible. */
  embers(x: number, y: number, count: number, heat = 0): void {
    for (let i = 0; i < count; i++) {
      this.spawn('ember', x + (rand(this.seed, i) - 0.5) * 40, y, {
        vx: (rand(this.seed, i + 7) - 0.5) * 1.4,
        vy: 1.4 + rand(this.seed, i + 13) * 2.6,
        life: 26 + rand(this.seed, i + 19) * 24,
        size: 1.2 + rand(this.seed, i + 23) * 1.8,
        heat,
      });
    }
  }

  /** A jagged lightning segment between two points. */
  arc(x0: number, y0: number, x1: number, y1: number, life: number, width: number, heat = 0): void {
    this.beams.push({ x0, y0, x1, y1, life, maxLife: life, width, heat, seed: this.next() });
  }

  /** Small black cloud fragments: Form 2's chassis shedding itself. */
  cloudFragment(x: number, y: number, vx: number, vy: number, heat = 1): void {
    this.spawn('cloudFrag', x, y, {
      vx,
      vy,
      life: 30 + rand(this.seed, this.particles.length) * 30,
      size: 5 + rand(this.seed, this.particles.length + 5) * 12,
      rot: rand(this.seed, this.particles.length + 9) * Math.PI,
      spin: (rand(this.seed, this.particles.length + 11) - 0.5) * 0.08,
      heat,
    });
  }

  /** A lasting electrical scar on the floor. */
  scar(x: number, y: number, life = 320): void {
    this.scars.push({ x, y, life, maxLife: life, size: 30 + rand(this.seed, this.scars.length) * 60, seed: this.next() });
    if (this.scars.length > 24) this.scars.shift();
  }

  ring(x: number, y: number, size: number, life: number, heat = 0): void {
    this.spawn('ring', x, y, { size, life, heat });
  }

  banner(id: string, text: string, sub: string, player: number, life: number): void {
    const existing = this.banners.find((b) => b.id === id);
    if (existing) {
      existing.life = life;
      existing.maxLife = life;
      return;
    }
    this.banners.push({ id, text, sub, player, life, maxLife: life });
  }

  shakeBy(amount: number): void {
    this.shake = Math.min(48, this.shake + amount);
  }

  flashBy(amount: number): void {
    this.flash = Math.min(1, this.flash + amount);
  }

  /** Translates one simulation event into effect work. */
  consume(ev: SimEvent): void {
    const { id, a, b, c } = ev;
    const heat = id.startsWith('mk2f2') || id.includes('proxy') ? 1 : 0;
    switch (ev.k) {
      case 'shake':
        this.shakeBy(a);
        break;
      case 'banner':
        this.banner(id, id === 'fool' ? 'Fool.' : a === 0 ? '' : '', b ? '' : '', 0, 120);
        break;
      case 'vfx':
        this.vfx(id, a, b, c);
        break;
      case 'sfx':
        break;
      case 'text':
        this.banner('text', a ? '' : '', '', 0, 90);
        break;
      default:
        break;
    }
    void heat;
  }

  /** VFX identities. Each move has to be recognisable at a glance. */
  vfx(id: string, x: number, y: number, scale: number): void {
    const s = scale || 1;
    switch (id) {
      /* ---------- light, mechanical, Form 1 ---------- */
      case 'thrustSmall':
      case 'streakLunge':
        this.burst(x, y, 8, 0, 0.6 * s);
        this.ring(x, y, 26 * s, 12, 0);
        break;
      case 'spearRail':
      case 'spearCompress':
      case 'railThrust':
        this.burst(x, y, 16, 0, 1.1 * s);
        this.arc(x - 90 * s, y, x + 60 * s, y, 10, 3);
        this.shakeBy(4 * s);
        break;
      case 'thunderlineAlign':
      case 'thunderlineReuse':
        this.arc(x - 420, y, x + 60, y, 12, 3, 0);
        this.burst(x, y, 10, 0, 0.8);
        break;
      case 'heavenfallRise':
        this.embers(x, y, 10, 0);
        this.ring(x, y, 40 * s, 16, 0);
        break;
      case 'heavenfallDrop':
      case 'heavenfallImpale':
        this.burst(x, y, 22, 0, 1.4 * s);
        this.arc(x, y + 160, x, y, 10, 4, 0);
        this.scar(x, 0, 240);
        this.shakeBy(8 * s);
        this.flashBy(0.14);
        break;
      case 'heavensArray':
        for (let i = 0; i < 5; i++) {
          this.arc(x - 520, 20 + i * 22, x + 40, 20 + i * 22, 16, 3, 0);
        }
        this.shakeBy(10);
        this.flashBy(0.2);
        break;
      case 'chargeGain':
        this.embers(x, y, 5, 0);
        break;
      case 'chargeSpend':
        this.embers(x, y, 8, 0);
        this.ring(x, y + 30, 34, 14, 0);
        break;
      case 'statusFlash':
        this.ring(x, y, 30 * s, 18, 0);
        this.burst(x, y, 8, 0, 0.7);
        break;
      case 'conductive':
      case 'pierced':
      case 'staticLock':
      case 'perfectPhase':
      case 'phase':
        this.ring(x, y, 36 * s, 20, 0);
        break;
      case 'phaseBurst':
        this.burst(x, y, 18, 0, 1.2);
        this.ring(x, y, 70, 24, 0);
        break;
      case 'execStrike':
        this.burst(x, y, 12, 0, 1.1);
        this.arc(x - 60, y - 20, x + 60, y + 20, 8, 2, 0);
        break;
      case 'execFinal':
        this.burst(x, y, 30, 0, 1.8);
        this.ring(x, y, 96, 26, 0);
        this.shakeBy(16);
        this.flashBy(0.26);
        break;
      case 'judgementCharge':
        this.embers(x, y, 16, 0);
        break;
      case 'judgementBolt':
        this.arc(x - 600, y, x, y, 14, 5, 0);
        this.arc(x, y, x, 0, 18, 4, 0);
        this.flashBy(0.3);
        this.shakeBy(12);
        break;
      /* ---------- Form 2: white-gold, overwhelming ---------- */
      case 'proxyStart':
        this.flashBy(0.9);
        this.shakeBy(30);
        for (let i = 0; i < 40; i++) this.cloudFragment(x + (rand(this.seed, i) - 0.5) * 160, y + 120, (rand(this.seed, i + 2) - 0.5) * 8, 2 + rand(this.seed, i + 3) * 4, 1);
        this.arc(x, y + 200, x, 0, 40, 9, 1);
        break;
      case 'ahCreator':
        this.flashBy(0.4);
        this.ring(x, y, 140, 40, 1);
        for (let i = 0; i < 16; i++) this.cloudFragment(x + (rand(this.seed, i + 40) - 0.5) * 200, y + 40 + rand(this.seed, i + 50) * 120, (rand(this.seed, i + 60) - 0.5) * 5, 1 + rand(this.seed, i + 70) * 3, 1);
        break;
      case 'decapitate':
        this.burst(x, y, 40, 1, 2.2);
        this.arc(x - 200, y, x + 200, y, 16, 7, 1);
        this.shakeBy(24);
        this.flashBy(0.5);
        this.scar(x, 0, 420);
        break;
      case 'andShowYou':
        this.arc(x - 300, y, x + 200, y, 14, 5, 1);
        this.burst(x, y, 24, 1, 1.6);
        this.shakeBy(14);
        break;
      case 'myUnrelentingMight':
        this.spawn('pillar', x, 0, { size: 150, life: 46, heat: 1 });
        for (let i = 0; i < 30; i++) this.cloudFragment(x + (rand(this.seed, i + 80) - 0.5) * 220, 10 + rand(this.seed, i + 90) * 60, (rand(this.seed, i + 95) - 0.5) * 7, 1 + rand(this.seed, i + 97) * 4, 1);
        this.scar(x, 0, 520);
        this.shakeBy(30);
        this.flashBy(0.7);
        this.skyFlash = 1;
        break;
      case 'divineFall':
      case 'divineFallCharged':
        this.spawn('pillar', x, 0, { size: 120 + 60 * s, life: 30, heat: 1 });
        this.scar(x, 0, 400);
        this.shakeBy(20 * s);
        this.flashBy(0.45);
        this.skyFlash = 1;
        break;
      case 'judgementCreator':
        this.spawn('pillar', x, 0, { size: 180, life: 40, heat: 1 });
        this.arc(x, 400, x, 0, 26, 10, 1);
        this.flashBy(0.8);
        this.shakeBy(28);
        this.skyFlash = 1;
        break;
      case 'creatorSmite':
        // A blowout frame, then a real column of judgement standing in the
        // arena while the machine is erased out of it.
        this.flashBy(1);
        this.pillar = 54;
        this.spawn('pillar', x, 0, { size: 120 * s, life: 60, heat: 1 });
        this.arc(x, 520, x, 0, 30, 12, 1);
        for (let i = 0; i < 26; i++) this.burst(x + (rand(this.seed, i + 120) - 0.5) * 200, 40 + rand(this.seed, i + 130) * 120, 1, 1, 1.4);
        this.shakeBy(40);
        this.skyFlash = 1;
        break;
      case 'divineShock':
        this.burst(x, y, 26, 1, 1.8);
        break;
      case 'seqShot':
      case 'seqFinal':
        this.burst(x, y, 14, 1, 1.3);
        this.arc(x - 120, y, x + 120, y, 10, 4, 1);
        break;
      case 'divineDischarge':
        this.arc(x - 300, y, x + 300, y, 12, 6, 1);
        this.shakeBy(10);
        break;
      case 'armorHit':
        this.burst(x, y, 10, 0, 0.9);
        break;
      case 'guardSpark':
        this.burst(x, y, 7, 0, 0.8);
        break;
      case 'shotHit':
        this.burst(x, y, 6, 0, 0.7);
        break;
      case 'guardBreak':
        this.burst(x, y, 18, 0, 1.2);
        this.ring(x, y, 54, 20, 0);
        this.shakeBy(8);
        break;
      default:
        this.burst(x, y, 6, id.startsWith('mk2f2') ? 1 : 0, 0.8);
        break;
    }
  }

  /** Advances every effect by one frame. */
  update(): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= 1;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.spin;
      switch (p.kind) {
        case 'spark':
          p.vy -= 0.42;
          p.vx *= 0.94;
          break;
        case 'ember':
          p.vy *= 0.985;
          p.vx += Math.sin((p.seed % 97) + p.life * 0.2) * 0.06;
          break;
        case 'cloudFrag':
          p.vy += 0.06;
          p.vx *= 0.985;
          break;
        case 'ring':
          break;
        case 'streak':
          p.x += p.vx * 2.2;
          break;
        default:
          break;
      }
      if (p.kind === 'spark' && p.y < 0) {
        p.y = 0;
        p.vy = Math.abs(p.vy) * 0.32;
        p.vx *= 0.7;
      }
    }
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.life -= 1;
      if (b.life <= 0) this.beams.splice(i, 1);
    }
    for (let i = this.scars.length - 1; i >= 0; i--) {
      this.scars[i].life -= 1;
      if (this.scars[i].life <= 0) this.scars.splice(i, 1);
    }
    for (let i = this.banners.length - 1; i >= 0; i--) {
      this.banners[i].life -= 1;
      if (this.banners[i].life <= 0) this.banners.splice(i, 1);
    }
    this.shake *= 0.88;
    if (this.shake < 0.2) this.shake = 0;
    this.flash *= 0.86;
    if (this.flash < 0.01) this.flash = 0;
    this.skyFlash *= 0.9;
    if (this.pillar > 0) this.pillar -= 1;
  }

  /** Draws everything except the fighters and the HUD. */
  draw(ctx: CanvasRenderingContext2D, toScreen: (x: number, y: number) => [number, number], groundY: number): void {
    ctx.save();
    for (const scar of this.scars) {
      const t = scar.life / scar.maxLife;
      const [sx, sy] = toScreen(scar.x, 0);
      ctx.globalAlpha = 0.55 * t;
      ctx.strokeStyle = rgba(WHITE_GOLD, 0.9);
      ctx.lineWidth = 2;
      ctx.beginPath();
      let px = sx;
      for (let i = 0; i <= 8; i++) {
        const t2 = i / 8;
        const jx = sx + (scar.size * (t2 - 0.5)) * 1.2 + (rand(scar.seed, i) - 0.5) * 14;
        const jy = sy - Math.sin(t2 * Math.PI) * (6 + rand(scar.seed, i + 3) * 10) * t;
        if (i === 0) ctx.moveTo(px, jy);
        else ctx.lineTo(jx, jy);
        px = jx;
      }
      ctx.stroke();
      ctx.globalAlpha = 0.22 * t;
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 8;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    for (const b of this.beams) {
      const t = b.life / b.maxLife;
      const [x0, y0] = toScreen(b.x0, b.y0);
      const [x1, y1] = toScreen(b.x1, b.y1);
      const flicker = 0.55 + 0.45 * ((b.seed >>> (b.life % 8)) & 1);
      for (const [widthMul, alpha, color] of [
        [4.2, 0.22, b.heat ? WHITE_GOLD : GOLD],
        [2.0, 0.5, b.heat ? WHITE_GOLD : GOLD],
        [1.0, 0.95, b.heat ? '#ffffff' : GOLD_HI],
      ] as [number, number, string][]) {
        ctx.globalAlpha = alpha * t * flicker;
        ctx.strokeStyle = color;
        ctx.lineWidth = b.width * widthMul;
        ctx.lineCap = 'round';
        ctx.beginPath();
        const segs = 9;
        for (let i = 0; i <= segs; i++) {
          const tt = i / segs;
          const jx = (rand(b.seed, i) - 0.5) * 18 * (1 - Math.abs(tt - 0.5) * 2) * 0.9;
          const jy = (rand(b.seed, i + 40) - 0.5) * 18 * (1 - Math.abs(tt - 0.5) * 2) * 0.9;
          const px = x0 + (x1 - x0) * tt + jx;
          const py = y0 + (y1 - y0) * tt + jy;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    void groundY;
  }
}
