/**
 * Fighter rendering.
 *
 * A stickman silhouette with a machine inside it: a readable humanoid outline
 * built from dark titanium limb segments and angular armour plates, with
 * bright metallic divine-gold seams that run along the chassis. Attunement
 * lights those seams further and further until Form 2 turns them white-gold.
 *
 * Mk. 2 always holds HEAVEN SPLITTER: a black shaft spear with gold fittings
 * and a literal lightning-bolt spearhead suspended inside a small storm
 * cloud. Attacks read as thrusts, lunges and impalements - the shaft always
 * points where the damage goes.
 */

import {
  CHASSIS,
  CHASSIS_LIT,
  GUNMETAL,
  TITANIUM,
  TITANIUM_HI,
  GOLD,
  GOLD_HI,
  WHITE_GOLD,
  INK,
  rgba,
  mix,
} from './palette';
import { CK } from '../characters/mk2/constants';
import { moveOf } from '../sim/registry';
import type { Fighter } from '../sim/types';

export interface Pose {
  /** World-space origin of the fighter. */
  x: number;
  y: number;
  facing: 1 | -1;
  /** 0 = stand, 1 = crouch, 2 = knocked down. */
  crouch: number;
  /** -1..1 forward lean, driven by the move's velocity. */
  lean: number;
  /** 0..1 how far the spear arm is extended. */
  thrust: number;
  /** Thrust direction: +1 forward, -1 pulled back, 0 neutral. */
  thrustDir: number;
  /** Vertical weapon offset, used by Heavenfall. */
  weaponLift: number;
  /** Airborne. */
  air: boolean;
  /** Dash smear. */
  dash: number;
  /** Frames of impact flash on the chassis. */
  flash: number;
  /** 0..1, how much of the body is a white silhouette (phase). */
  phase: number;
  /** 0..1 guardian aura for Form 2 immortality. */
  proxy: number;
  /** 0..3 */
  attunement: number;
  /** Form 2 heat: white-gold instead of gold. */
  heat: number;
}

export function poseOf(f: Fighter): Pose {
  const form = f.char[CK.form] ?? 1;
  const heat = form === 2 ? 1 : 0;
  const attunement = f.char[CK.attunement] ?? 0;
  const m = f.move;
  let thrust = 0;
  let thrustDir = 0;
  let weaponLift = 0;
  let lean = 0;
  if (m) {
    const def = moveOf(m.id);
    const total = Math.max(1, def.startup + def.active + def.recovery);
    const t = m.frame / total;
    // Startup winds back, the active frames shoot forward, recovery follows.
    if (m.frame <= def.startup) {
      const w = m.frame / Math.max(1, def.startup);
      thrust = -0.45 * w;
      thrustDir = -1;
      lean = -0.35 * w;
    } else if (m.frame <= def.startup + def.active) {
      const a = (m.frame - def.startup) / Math.max(1, def.active);
      thrust = 1 - Math.abs(a - 0.25) * 0.5;
      thrustDir = 1;
      lean = 0.85;
    } else {
      const r = (m.frame - def.startup - def.active) / Math.max(1, def.recovery);
      thrust = 0.55 * (1 - r);
      thrustDir = 0;
      lean = 0.55 * (1 - r);
    }
    if (def.id.includes('heavenfall')) {
      weaponLift = m.frame <= def.startup ? -0.4 : 0.5 + Math.sin(t * Math.PI) * 0.4;
      thrust = m.frame <= def.startup + def.active ? 1 : thrust * 0.4;
      thrustDir = m.frame <= def.startup + def.active ? 1 : 0;
    }
  }
  if (f.state === 'hitstun' || f.state === 'blockstun') {
    thrust *= 0.3;
    lean = -0.6;
  }
  if (f.state === 'knockdown') lean = -1.2;
  return {
    x: f.x,
    y: f.y,
    facing: f.facing,
    crouch: f.crouching ? 1 : f.state === 'knockdown' ? 2 : 0,
    lean: Math.max(-1.4, Math.min(1.4, lean)),
    thrust: Math.max(-1, Math.min(1, thrust)),
    thrustDir,
    weaponLift,
    air: !f.onGround,
    dash: f.state === 'dash' || f.state === 'airDash' ? 1 : 0,
    flash: f.hitEvent === 1 ? 1 : f.hitstop > 0 ? 0.4 : 0,
    phase: f.state === 'phase' || (f.invuln > 0 && f.onGround && f.state !== 'attack') ? 0.75 : 0,
    proxy: f.char[CK.proxyTimer] && form === 2 ? 1 : 0,
    attunement,
    heat,
  };
}

interface Pt {
  x: number;
  y: number;
}

/** Builds the stickman skeleton in local space (facing right, y up). */
function skeleton(p: Pose): { hip: Pt; chest: Pt; neck: Pt; head: Pt; shoulderF: Pt; elbowF: Pt; handF: Pt; hipF: Pt; kneeF: Pt; footF: Pt; hipB: Pt; kneeB: Pt; footB: Pt; elbowB: Pt; handB: Pt } {
  const crouch = p.crouch;
  const baseY = p.y;
  const legScale = 1 - crouch * 0.42;
  const hipY = baseY + 56 * legScale;
  const chestY = baseY + (92 - crouch * 16) * legScale;
  const lean = p.lean * 10;
  const hip: Pt = { x: 0, y: hipY };
  const chest: Pt = { x: lean * 0.5, y: chestY };
  const neck: Pt = { x: lean * 0.8, y: chestY + 12 };
  const head: Pt = { x: lean * 0.9 + 2, y: chestY + 28 };
  const shoulderF: Pt = { x: chest.x + 2, y: chest.y - 2 };
  const hipF: Pt = { x: hip.x + 4, y: hip.y };
  const hipB: Pt = { x: hip.x - 5, y: hip.y };

  const ext = p.thrustDir === 1 ? p.thrust : p.thrustDir === -1 ? p.thrust * 0.8 : p.thrust * 0.35;
  const armLen = 34;
  const elbowF: Pt = {
    x: shoulderF.x + armLen * 0.55 * (1 - Math.max(0, ext) * 0.75) - Math.max(0, ext) * 6,
    y: shoulderF.y - 4 - Math.max(0, ext) * 2,
  };
  const handF: Pt = {
    x: shoulderF.x + armLen * (0.95 + ext * 0.85),
    y: shoulderF.y - 2 + p.weaponLift * 26,
  };
  const elbowB: Pt = { x: shoulderF.x - 12, y: shoulderF.y - 16 };
  const handB: Pt = { x: shoulderF.x - 6 + ext * 10, y: shoulderF.y - 26 - ext * 6 };

  const strideF = p.air ? 14 : Math.max(-10, Math.min(12, p.lean * 10));
  const footF: Pt = { x: hipF.x + strideF + (p.dash ? 22 : 0), y: p.air ? hipY + 12 : 0 };
  const footB: Pt = { x: hipB.x - strideF * 0.8 - (p.dash ? 26 : 0), y: p.air ? hipY + 4 : 0 };
  return {
    hip,
    chest,
    neck,
    head,
    shoulderF,
    elbowF,
    handF,
    hipF,
    kneeF: { x: (hipF.x + footF.x) / 2 + 6, y: (hipF.y + footF.y) / 2 },
    footF,
    hipB,
    kneeB: { x: (hipB.x + footB.x) / 2 - 6, y: (hipB.y + footB.y) / 2 },
    footB,
    elbowB,
    handB,
  };
}

function limb(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, width: number, color: string, edge: string): void {
  ctx.lineCap = 'round';
  ctx.strokeStyle = color;
  ctx.lineWidth = width + 2.5;
  ctx.beginPath();
  ctx.moveTo(a.x, -a.y);
  ctx.lineTo(b.x, -b.y);
  ctx.stroke();
  ctx.strokeStyle = edge;
  ctx.lineWidth = Math.max(1, width - 2.5);
  ctx.beginPath();
  ctx.moveTo(a.x, -a.y);
  ctx.lineTo(b.x, -b.y);
  ctx.stroke();
}

function joint(ctx: CanvasRenderingContext2D, at: Pt, r: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(at.x, -at.y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** The gold seam that runs the length of a limb. */
function seam(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, width: number, color: string, alpha = 1): void {
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(a.x + 1.5, -a.y);
  ctx.lineTo(b.x + 1.5, -b.y);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

export interface FighterStyle {
  body: string;
  accent: string;
  glow: string;
  /** Mk. 1 does not carry the Heaven Splitter. */
  spear: boolean;
}

export function drawFighter(
  ctx: CanvasRenderingContext2D,
  p: Pose,
  style: FighterStyle,
  toScreen: (x: number, y: number) => [number, number],
  frame: number,
): void {
  const s = skeleton(p);
  const [sx, sy] = toScreen(p.x, p.y);
  const scale = toScreen(1, 0)[0] - toScreen(0, 0)[0];
  const gold = p.heat > 0 ? WHITE_GOLD : mix(GOLD, GOLD_HI, p.attunement / 3);
  const lit = p.flash > 0 ? mix(style.body, '#ffffff', p.flash) : style.body;

  ctx.save();
  ctx.translate(sx, sy);
  ctx.scale(p.facing * scale, -scale);

  // Ground shadow keeps the silhouette readable against a dark floor.
  ctx.globalAlpha = 0.4;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(0, 2, 34, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  if (p.proxy > 0) {
    // PROXY OF THE CREATOR: a cage of escaping arcs around the chassis.
    const pulse = 0.6 + 0.4 * Math.sin(frame * 0.12);
    ctx.globalAlpha = 0.32 * pulse;
    const grd = ctx.createRadialGradient(0, -70, 10, 0, -70, 120);
    grd.addColorStop(0, rgba(WHITE_GOLD, 0.5));
    grd.addColorStop(1, 'rgba(255,248,224,0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(0, -70, 120, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    for (let i = 0; i < 5; i++) {
      const a = frame * 0.09 + (i * Math.PI * 2) / 5;
      const r = 46 + Math.sin(frame * 0.2 + i) * 12;
      ctx.strokeStyle = rgba(WHITE_GOLD, 0.5 + 0.3 * Math.sin(frame * 0.3 + i));
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(0, -70, r, a, a + 1.1);
      ctx.stroke();
    }
  }

  if (p.phase > 0) {
    ctx.globalAlpha = 1 - p.phase * 0.6;
  }

  // ---- legs (back first for depth) ----
  limb(ctx, s.hipB, s.kneeB, 13, CHASSIS, TITANIUM);
  limb(ctx, s.kneeB, s.footB, 11, CHASSIS, TITANIUM);
  joint(ctx, s.kneeB, 7, GUNMETAL);
  // Foot plate
  ctx.fillStyle = TITANIUM_HI;
  ctx.beginPath();
  ctx.moveTo(s.footB.x - 8, -s.footB.y);
  ctx.lineTo(s.footB.x + 13, -s.footB.y);
  ctx.lineTo(s.footB.x + 9, -s.footB.y - 5);
  ctx.lineTo(s.footB.x - 9, -s.footB.y - 5);
  ctx.closePath();
  ctx.fill();
  seam(ctx, s.hipB, s.kneeB, 2, gold, 0.8);
  seam(ctx, s.kneeB, s.footB, 2, gold, 0.8);

  limb(ctx, s.hipF, s.kneeF, 15, lit, TITANIUM_HI);
  limb(ctx, s.kneeF, s.footF, 13, lit, TITANIUM_HI);
  joint(ctx, s.kneeF, 8, GUNMETAL);
  ctx.fillStyle = TITANIUM_HI;
  ctx.beginPath();
  ctx.moveTo(s.footF.x - 9, -s.footF.y);
  ctx.lineTo(s.footF.x + 15, -s.footF.y);
  ctx.lineTo(s.footF.x + 11, -s.footF.y - 6);
  ctx.lineTo(s.footF.x - 10, -s.footF.y - 6);
  ctx.closePath();
  ctx.fill();
  seam(ctx, s.hipF, s.kneeF, 2.4, gold);
  seam(ctx, s.kneeF, s.footF, 2.4, gold);

  // ---- back arm ----
  limb(ctx, { x: s.shoulderF.x - 3, y: s.shoulderF.y }, s.elbowB, 10, CHASSIS, TITANIUM);
  limb(ctx, s.elbowB, s.handB, 9, CHASSIS, TITANIUM);
  joint(ctx, s.elbowB, 5.5, GUNMETAL);
  seam(ctx, s.elbowB, s.handB, 1.6, gold, 0.7);

  // ---- torso: angular armour over a dark core ----
  ctx.fillStyle = lit;
  ctx.beginPath();
  ctx.moveTo(s.chest.x + 11, -s.chest.y);
  ctx.lineTo(s.chest.x - 12, -s.chest.y + 2);
  ctx.lineTo(s.hip.x - 9, -s.hip.y);
  ctx.lineTo(s.hip.x + 10, -s.hip.y);
  ctx.closePath();
  ctx.fill();
  // Chest plate highlight
  ctx.fillStyle = rgba(CHASSIS_LIT, 0.9);
  ctx.beginPath();
  ctx.moveTo(s.chest.x + 9, -s.chest.y + 3);
  ctx.lineTo(s.chest.x - 9, -s.chest.y + 5);
  ctx.lineTo(s.hip.x - 6, -s.hip.y - 4);
  ctx.lineTo(s.hip.x + 7, -s.hip.y - 4);
  ctx.closePath();
  ctx.fill();
  // Core: the divine charge reservoir, visible through the plating.
  const coreGlow = 0.45 + 0.25 * Math.sin(frame * 0.1) + p.attunement * 0.12;
  ctx.globalAlpha = Math.min(1, coreGlow);
  ctx.fillStyle = gold;
  ctx.beginPath();
  ctx.moveTo(s.chest.x, -s.chest.y + 8);
  ctx.lineTo(s.chest.x + 4, -s.chest.y + 22);
  ctx.lineTo(s.chest.x, -s.chest.y + 36);
  ctx.lineTo(s.chest.x - 4, -s.chest.y + 22);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  // Angular shoulder pauldrons
  ctx.fillStyle = TITANIUM;
  for (const [sh, dir] of [[s.shoulderF, 1], [{ x: s.chest.x - 10, y: s.chest.y + 1 }, -1]] as [Pt, number][]) {
    ctx.beginPath();
    ctx.moveTo(sh.x + dir * 4, -sh.y - 6);
    ctx.lineTo(sh.x + dir * 17, -sh.y - 1);
    ctx.lineTo(sh.x + dir * 14, -sh.y + 10);
    ctx.lineTo(sh.x + dir * 2, -sh.y + 9);
    ctx.closePath();
    ctx.fill();
    seam(ctx, sh, { x: sh.x + dir * 14, y: sh.y + 4 }, 1.8, gold, 0.9);
  }

  // ---- faceted head ----
  ctx.fillStyle = lit;
  ctx.beginPath();
  ctx.moveTo(s.head.x + 10, -s.head.y + 2);
  ctx.lineTo(s.head.x + 6, -s.head.y + 11);
  ctx.lineTo(s.head.x - 6, -s.head.y + 11);
  ctx.lineTo(s.head.x - 9, -s.head.y + 1);
  ctx.lineTo(s.head.x - 4, -s.head.y - 7);
  ctx.lineTo(s.head.x + 5, -s.head.y - 6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = GUNMETAL;
  ctx.beginPath();
  ctx.moveTo(s.head.x + 10, -s.head.y + 2);
  ctx.lineTo(s.head.x + 14, -s.head.y - 1);
  ctx.lineTo(s.head.x + 9, -s.head.y - 7);
  ctx.closePath();
  ctx.fill();
  // Visor slit: the only warm light on the face.
  ctx.fillStyle = gold;
  ctx.globalAlpha = 0.85 + 0.15 * Math.sin(frame * 0.16);
  ctx.fillRect(s.head.x - 5, -s.head.y - 1, 13, 2.6);
  ctx.globalAlpha = 1;

  // ---- weapon arm + HEAVEN SPLITTER ----
  limb(ctx, s.shoulderF, s.elbowF, 12, lit, TITANIUM_HI);
  limb(ctx, s.elbowF, s.handF, 11, lit, TITANIUM_HI);
  joint(ctx, s.elbowF, 6.5, GUNMETAL);
  seam(ctx, s.shoulderF, s.elbowF, 2, gold, 0.85);
  if (style.spear) {
    drawHeavenSplitter(ctx, s.handF, s.handB, gold, p, frame);
  } else {
    ctx.fillStyle = TITANIUM_HI;
    ctx.fillRect(s.handF.x - 3, -s.handF.y - 3, 16, 6);
  }

  if (p.flash > 0) {
    ctx.globalAlpha = p.flash * 0.7;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(0, -70, 48, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

/**
 * HEAVEN SPLITTER: black shaft, gold fittings, and a literal branching
 * lightning-bolt spearhead suspended inside a small storm cloud. It is a
 * spear, not a trident and not a blade: one point, one line, forward.
 */
function drawHeavenSplitter(
  ctx: CanvasRenderingContext2D,
  hand: Pt,
  backHand: Pt,
  gold: string,
  p: Pose,
  frame: number,
): void {
  // The shaft points along the thrust direction, always forward.
  const dir = p.thrustDir === 0 ? 1 : p.thrustDir;
  const tipX = hand.x + dir * (108 + p.thrust * 46);
  const tipY = -(hand.y + p.weaponLift * 30);
  const gripX = hand.x - dir * 40;
  const gripY = -hand.y + 4;

  // Small storm cloud around the head.
  const cx = tipX - dir * 16;
  const cy = tipY + 6;
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = p.heat > 0 ? '#0a0a0e' : '#0b0d13';
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + frame * 0.01;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * 13, cy + Math.sin(a) * 6, 9 - (i % 2) * 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // Black shaft with gold fittings.
  ctx.strokeStyle = INK;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(gripX, -gripY);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();
  ctx.strokeStyle = p.heat > 0 ? WHITE_GOLD : GOLD;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(gripX, -gripY);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();
  for (const t of [0.28, 0.62]) {
    const x = gripX + (tipX - gripX) * t;
    const y = -gripY + (tipY + gripY) * t;
    ctx.strokeStyle = gold;
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(x, y - 3);
    ctx.lineTo(x, y + 3);
    ctx.stroke();
  }

  // Branching lightning-bolt spearhead: the literal point of the weapon.
  const bolt = (offset: number, alpha: number, width: number): void => {
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = p.heat > 0 ? '#ffffff' : GOLD_HI;
    ctx.lineWidth = width;
    ctx.lineJoin = 'miter';
    ctx.beginPath();
    ctx.moveTo(tipX - dir * 20, tipY + 6 + offset);
    ctx.lineTo(tipX - dir * 6, tipY - 4 + offset);
    ctx.lineTo(tipX - dir * 12, tipY - 4 + offset);
    ctx.lineTo(tipX, tipY - 13 + offset);
    ctx.stroke();
    ctx.globalAlpha = 1;
  };
  bolt(0, 1, 3);
  bolt(0, 0.45, 7);
  // Branches off the bolt.
  ctx.strokeStyle = p.heat > 0 ? WHITE_GOLD : GOLD;
  ctx.lineWidth = 1.6;
  for (const [t, len] of [[0.35, 9], [0.62, 7]] as [number, number][]) {
    const bx = tipX - dir * (20 - t * 20);
    const by = tipY + 6 - t * 12;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + dir * len * 0.6, by + len);
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + dir * len * 0.3, by + len * 0.6);
    ctx.stroke();
  }
  // Back hand holds the butt of the shaft.
  ctx.strokeStyle = TITANIUM_HI;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(backHand.x, -backHand.y);
  ctx.lineTo(hand.x - dir * 6, -hand.y + 2);
  ctx.stroke();
}
