/**
 * The arena.
 *
 * Form 1 is a dark, dry platform with a slow-moving haze. Form 2 does not
 * change the room, it changes the weather: a real thunderstorm rolls in, the
 * sky cracks with gold lightning, the surface throws sparks and every impact
 * leaves an electrical scar on the floor.
 */

import { FLOOR_FAR, FLOOR_NEAR, FLOOR_LINE, GOLD, WHITE_GOLD, rgba, mix } from './palette';
import { STAGE } from '../sim/const';
import type { FxLayer } from './fx';

export interface Camera {
  x: number;
  y: number;
  zoom: number;
  shakeX: number;
  shakeY: number;
}

function hash(n: number): number {
  let x = n >>> 0;
  x ^= x << 13;
  x >>>= 0;
  x ^= x >> 17;
  x ^= x << 5;
  x >>>= 0;
  return x;
}

function rnd(seed: number, i: number): number {
  return (hash(seed + i * 0x85ebca6b) >>> 0) / 4294967296;
}

export class Scene {
  /** 0 = dry arena, 1 = full thunderstorm. */
  storm = 0;
  /** Smoothed camera, so a jump does not snap the whole screen. */
  private cam: Camera = { x: 0, y: 0, zoom: 1, shakeX: 0, shakeY: 0 };
  private firstCamera = true;
  private frame = 0;
  private seed = 0x1f2e3d4c;

  update(storm: number): void {
    this.storm += (storm - this.storm) * 0.05;
    this.frame += 1;
  }

  /** Draws everything behind the fighters. */
  drawBack(ctx: CanvasRenderingContext2D, w: number, h: number, fx: FxLayer): void {
    const t = this.storm;
    // Sky: from a flat dark gradient to a rolling storm.
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, mix('#05060a', '#0a0812', t));
    sky.addColorStop(0.55, mix('#0a0c12', '#141021', t));
    sky.addColorStop(1, mix('#12151d', '#1b1526', t));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    this.clouds(ctx, w, h, t);
    if (t > 0.02) this.skyLightning(ctx, w, h, t, fx);
    this.horizon(ctx, w, h, t);
  }

  /** Slow, heavy cloud banks. Deterministic, driven by the frame counter. */
  private clouds(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
    const bands = 4;
    for (let b = 0; b < bands; b++) {
      const depth = b / bands;
      const y = h * (0.10 + depth * 0.28);
      const drift = (this.frame * (0.12 + depth * 0.22)) % (w * 2);
      ctx.globalAlpha = 0.32 + depth * 0.22 + t * 0.25;
      ctx.fillStyle = mix('#0a0c14', '#0d0a16', t);
      for (let i = -1; i < 9; i++) {
        const cx = ((i * w * 0.28 - drift + w * 2) % (w * 1.6)) - w * 0.2;
        const r = w * (0.10 + rnd(this.seed + b, i) * 0.13);
        ctx.beginPath();
        ctx.ellipse(cx, y + rnd(this.seed + b + 40, i) * h * 0.05, r, r * (0.34 + t * 0.12), 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Background gold lightning. In Form 2 this fires on a schedule driven by
   * the storm level; the flash lights the whole arena.
   */
  private skyLightning(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, fx: FxLayer): void {
    const period = Math.max(14, Math.round(150 - t * 120));
    const phase = this.frame % period;
    if (phase > 4) return;
    const strike = hash(this.frame - phase) >>> 0;
    const alpha = (1 - phase / 5) * t;
    ctx.globalAlpha = alpha * 0.5;
    ctx.strokeStyle = mix(GOLD, WHITE_GOLD, t);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    let x = (strike % 1000) / 1000 * w;
    let y = 0;
    ctx.moveTo(x, y);
    for (let i = 0; i < 7; i++) {
      x += (((strike >> (i * 3)) & 15) - 7) * w * 0.035;
      y = h * (0.42 - i * 0.055);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.globalAlpha = alpha * 0.16;
    ctx.lineWidth = 16;
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (phase === 0) fx.skyFlash = Math.max(fx.skyFlash, 0.5 * t);
  }

  private horizon(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
    const groundY = h - 96;
    // Far wall / pit
    const g = ctx.createLinearGradient(0, groundY - 150, 0, h);
    g.addColorStop(0, mix(FLOOR_FAR, '#1a1426', t));
    g.addColorStop(0.4, mix(FLOOR_NEAR, '#120e1c', t));
    g.addColorStop(1, '#04050a');
    ctx.fillStyle = g;
    ctx.fillRect(0, groundY - 160, w, h - groundY + 160);

    // Arena platform edge
    ctx.fillStyle = mix('#181c26', '#241c33', t);
    ctx.fillRect(0, groundY - 6, w, 12);
    ctx.strokeStyle = rgba(GOLD, 0.22 + t * 0.4);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, groundY - 6);
    ctx.lineTo(w, groundY - 6);
    ctx.stroke();

    // Perspective floor lines: this is a platform, not a void.
    ctx.globalAlpha = 0.5;
    for (let i = 0; i <= 18; i++) {
      const x = (i / 18) * w;
      ctx.strokeStyle = FLOOR_LINE;
      ctx.beginPath();
      ctx.moveTo(x, groundY);
      ctx.lineTo(w / 2 + (x - w / 2) * 2.4, h);
      ctx.stroke();
    }
    for (let i = 1; i <= 6; i++) {
      const y = groundY + Math.pow(i / 6, 2.1) * (h - groundY);
      ctx.strokeStyle = rgba(GOLD, 0.06 + t * 0.08);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Surface sparks crawling along the floor in a storm.
    if (t > 0.05) {
      for (let i = 0; i < 26; i++) {
        const seed = hash(this.frame * 31 + i);
        const x = (seed % 10000) / 10000 * w;
        const y = groundY + 6 + (((seed >> 8) % 1000) / 1000) * (h - groundY - 10);
        const a = (((seed >> 18) % 100) / 100) * 0.55 * t;
        ctx.globalAlpha = a;
        ctx.fillStyle = mix(GOLD, WHITE_GOLD, t);
        const s = 1 + ((seed >> 4) % 3);
        ctx.fillRect(x, y, s * 2.4, s);
      }
      ctx.globalAlpha = 1;
    }
  }

  /** Foreground: vignette, storm haze, the smite pillar and screen flash. */
  drawFront(ctx: CanvasRenderingContext2D, w: number, h: number, fx: FxLayer): void {
    if (this.storm > 0.02) {
      const haze = ctx.createLinearGradient(0, 0, 0, h);
      haze.addColorStop(0, rgba('#2a2140', 0.16 * this.storm));
      haze.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = haze;
      ctx.fillRect(0, 0, w, h);
    }

    // Judgement columns: a hot core with a wide falloff, narrow at the base
    // and flaring at the top, so it reads as light falling out of the sky.
    for (const p of fx.particles) {
      if (p.kind !== 'pillar') continue;
      const t = p.life / p.maxLife;
      const rise = Math.sin(Math.min(1, (1 - t) * 2.2) * Math.PI * 0.5);
      const top = h * (0.5 - rise * 0.5);
      const width = p.size * (0.55 + rise * 0.75);
      const g = ctx.createLinearGradient(p.x - width, 0, p.x + width, 0);
      g.addColorStop(0, 'rgba(255,248,224,0)');
      g.addColorStop(0.28, rgba(WHITE_GOLD, 0.32 * t * rise));
      g.addColorStop(0.5, `rgba(255,255,255,${0.8 * t * rise})`);
      g.addColorStop(0.72, rgba(WHITE_GOLD, 0.32 * t * rise));
      g.addColorStop(1, 'rgba(255,248,224,0)');
      ctx.fillStyle = g;
      ctx.fillRect(p.x - width, top, width * 2, h - top);
      ctx.fillStyle = rgba(WHITE_GOLD, 0.18 * t * rise);
      ctx.beginPath();
      ctx.ellipse(p.x, h - 30, width * 1.5, width * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    if (fx.skyFlash > 0.02) {
      ctx.fillStyle = rgba(mix(GOLD, WHITE_GOLD, this.storm), fx.skyFlash * 0.10);
      ctx.fillRect(0, 0, w, h);
    }
    if (fx.flash > 0.01) {
      ctx.fillStyle = `rgba(255,250,235,${Math.min(0.9, fx.flash)})`;
      ctx.fillRect(0, 0, w, h);
    }
    if (fx.pillar > 0) {
      // The blowout frame: blinding for a handful of frames, then gone. The
      // HUD is drawn after this and stays readable throughout.
      const t = Math.pow(fx.pillar / 54, 2.2);
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, `rgba(255,255,255,${0.95 * t})`);
      g.addColorStop(0.5, rgba(WHITE_GOLD, 0.75 * t));
      g.addColorStop(1, 'rgba(255,248,224,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    const v = ctx.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, h * 0.95);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
  }

  /**
   * Camera keeps both fighters framed, smoothed over a few frames so vertical
   * movement reads as a camera move rather than a jump cut, and shakes on
   * impact. Call once per rendered frame.
   */
  updateCamera(fxs: { x: number; y: number }[], shake: number, w: number, viewH: number): Camera {
    const target = this.target(fxs, shake, w, viewH);
    if (this.firstCamera) {
      this.cam = target;
      this.firstCamera = false;
    } else {
      const k = 0.2;
      this.cam.x += (target.x - this.cam.x) * k;
      this.cam.y += (target.y - this.cam.y) * k;
      this.cam.zoom += (target.zoom - this.cam.zoom) * k;
    }
    this.cam.shakeX = target.shakeX;
    this.cam.shakeY = target.shakeY;
    return this.cam;
  }

  private target(fxs: { x: number; y: number }[], shake: number, w: number, viewH: number): Camera {
    let min = Infinity;
    let max = -Infinity;
    let maxY = 0;
    for (const f of fxs) {
      min = Math.min(min, f.x);
      max = Math.max(max, f.x);
      maxY = Math.max(maxY, f.y);
    }
    if (!isFinite(min)) {
      min = -200;
      max = 200;
    }
    const centre = (min + max) / 2;
    // Frame horizontally: both fighters, with room to walk.
    const zoomX = (w * 0.60) / Math.max(300, max - min + 210);
    // Frame vertically: the ground and the highest airborne body, with the
    // fighters sitting a little below centre so there is headroom to jump.
    const ground = viewH - 96;
    const zoomY = (ground - 96) / (maxY + 210);
    const zoom = Math.min(2.1, Math.max(0.62, Math.min(zoomX, zoomY)));
    const camY = Math.max(0, maxY * 0.45 - 24);
    const sh = shake;
    return {
      x: centre - (rnd(this.seed, this.frame) - 0.5) * sh,
      y: camY + (rnd(this.seed, this.frame + 1) - 0.5) * sh * 0.7,
      zoom,
      shakeX: (rnd(this.seed, this.frame + 2) - 0.5) * sh,
      shakeY: (rnd(this.seed, this.frame + 3) - 0.5) * sh * 0.6,
    };
  }
}

export const STAGE_HALF = STAGE.halfWidth;
