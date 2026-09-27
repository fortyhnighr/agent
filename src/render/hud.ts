/**
 * HUD.
 *
 * Form 1: the machine tells you exactly where it stands. Divine Charge 0-20,
 * Attunement 0-3, every Mk. 2 status with its real stack count, and the strict
 * requirements of the moves that are currently legal.
 *
 * Form 2: PROXY OF THE CREATOR and its remaining time are the loudest things
 * on screen. The Divine Charge readout is corrupted - deterministically, from
 * the simulation frame - but the true value is always printed next to it, and
 * health, timer and statuses are never obscured.
 */

import { ATTUNE, CHARGE, CK } from '../characters/mk2/constants';
import { moveListFor } from './movelist';
import { STATUS_COLOR, GOLD, GOLD_HI, WHITE_GOLD, INK, CHASSIS, rgba, mix } from './palette';
import { blessingLabel, telemetry } from './telemetry';
import type { Fighter, MatchState } from '../sim/types';
import type { FxLayer } from './fx';

const FONT = '"Rajdhani", "Eurostile", "Bahnschrift", "DIN Alternate", system-ui, sans-serif';
const MONO = '"JetBrains Mono", "SFMono-Regular", "Consolas", monospace';

const MK2_STATUSES: { key: string; label: string }[] = [
  { key: 'conductive', label: 'CONDUCTIVE' },
  { key: 'pierced', label: 'PIERCED' },
  { key: 'heavensMark', label: "HEAVEN'S MARK" },
  { key: 'staticLock', label: 'STATIC LOCK' },
  { key: 'divineScar', label: 'DIVINE SCAR' },
  { key: 'divineShock', label: 'DIVINE SHOCK' },
];

function font(size: number, weight = 600): string {
  return `${weight} ${size}px ${FONT}`;
}

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, f: string, color: string, align: CanvasTextAlign = 'left'): void {
  ctx.font = f;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(s, x, y);
}

function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, alpha = 0.62): void {
  ctx.fillStyle = rgba(INK, alpha);
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = rgba(GOLD, 0.32);
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  // Corner ticks
  ctx.strokeStyle = rgba(GOLD_HI, 0.7);
  ctx.lineWidth = 1.5;
  const c = 9;
  for (const [cx, cy, dx, dy] of [
    [x, y, 1, 1],
    [x + w, y, -1, 1],
    [x, y + h, 1, -1],
    [x + w, y + h, -1, -1],
  ] as [number, number, number, number][]) {
    ctx.beginPath();
    ctx.moveTo(cx + dx * c, cy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy + dy * c);
    ctx.stroke();
  }
}

export interface HudOptions {
  showDebug: boolean;
  showHitboxes: boolean;
}

export function drawHud(
  ctx: CanvasRenderingContext2D,
  state: MatchState,
  w: number,
  h: number,
  fx: FxLayer,
  opts: HudOptions,
): void {
  const [f0, f1] = state.fighters;
  drawHealth(ctx, f1, 40, 34, w - 80, -1, 'P2');
  drawHealth(ctx, f0, 40, 34, w - 80, 1, 'P1');
  drawTimer(ctx, state, w / 2, 44);

  // Charge / Attunement readouts sit under each health bar.
  if (f0.charId === 'mk2') drawChargeBlock(ctx, state, f0, 40, 74, false);
  if (f1.charId === 'mk2') drawChargeBlock(ctx, state, f1, w - 40, 74, true);

  drawStatusStrip(ctx, state.fighters);
  drawMoveHint(ctx, state);
  drawBanners(ctx, state, fx, w, h);
  if (state.silence > 0) drawSilence(ctx, state.silence, w, h);
  if (state.text.life > 0) drawTextCue(ctx, state);
  if (opts.showDebug) drawDebug(ctx, state, w, h);
}

function drawHealth(ctx: CanvasRenderingContext2D, f: Fighter, x: number, y: number, w: number, dir: 1 | -1, tag: string): void {
  const bw = w - 120;
  const bx = dir === 1 ? x : x + 120;
  const ratio = Math.max(0, Math.min(1, f.hp / f.maxHp));
  const proxy = (f.char[CK.proxyTimer] ?? 0) > 0 && f.char[CK.form] === 2;

  ctx.fillStyle = rgba(INK, 0.75);
  ctx.fillRect(bx - 2, y - 2, bw + 4, 26);
  const grd = ctx.createLinearGradient(bx, 0, bx + bw, 0);
  if (proxy) {
    grd.addColorStop(0, '#fff6d2');
    grd.addColorStop(1, '#ffd76a');
  } else {
    grd.addColorStop(0, ratio > 0.3 ? '#f0c24a' : '#ff6a4a');
    grd.addColorStop(1, ratio > 0.3 ? '#8a6a18' : '#8a2418');
  }
  ctx.fillStyle = grd;
  if (dir === 1) ctx.fillRect(bx, y, bw * ratio, 22);
  else ctx.fillRect(bx + bw * (1 - ratio), y, bw * ratio, 22);
  ctx.strokeStyle = rgba(GOLD, 0.55);
  ctx.lineWidth = 1;
  ctx.strokeRect(bx + 0.5, y + 0.5, bw - 1, 21);
  // Ghost bar for recent damage.
  if (f.lastHitTaken > 0) {
    ctx.globalAlpha = Math.min(0.5, f.lastHitTaken / 400);
    ctx.fillStyle = '#ff5a3c';
    ctx.fillRect(bx, y, bw, 22);
    ctx.globalAlpha = 1;
  }
  text(ctx, tag, dir === 1 ? bx - 12 : bx + bw + 12, y + 18, font(15, 700), rgba(GOLD, 0.9), dir === 1 ? 'right' : 'left');
  text(ctx, String(Math.max(0, Math.ceil(f.hp))), dir === 1 ? bx + 6 : bx + bw - 6, y + 16, font(13, 700), '#fff', dir === 1 ? 'left' : 'right');
}

/**
 * Divine Charge 0-20 plus Attunement 0-3. In Form 2 the big number is a
 * deterministic corrupted readout and the true value is always shown beside it.
 */
function drawChargeBlock(ctx: CanvasRenderingContext2D, state: MatchState, f: Fighter, x: number, y: number, right: boolean): void {
  const form = f.char[CK.form] ?? 1;
  const charge = f.char[CK.charge] ?? 0;
  const att = f.char[CK.attunement] ?? 0;
  const cum = f.char[CK.cumSpend] ?? 0;
  const w = 300;
  const bx = right ? x - w : x;
  panel(ctx, bx, y, w, form === 2 ? 104 : 86, form === 2 ? 0.8 : 0.6);
  const align: CanvasTextAlign = right ? 'right' : 'left';
  const tx = right ? bx + w - 12 : bx + 12;

  if (form === 2) {
    const proxyFrames = f.char[CK.proxyTimer] ?? 0;
    text(ctx, 'PROXY OF THE CREATOR', tx, y + 22, font(19, 800), WHITE_GOLD, align);
    const p = Math.max(0, Math.min(1, proxyFrames / 420));
    const barW = w - 24;
    const gx = right ? bx + 12 : bx + 12;
    ctx.fillStyle = rgba(INK, 0.8);
    ctx.fillRect(gx, y + 30, barW, 9);
    const g = ctx.createLinearGradient(gx, 0, gx + barW, 0);
    g.addColorStop(0, WHITE_GOLD);
    g.addColorStop(1, '#ffc94a');
    ctx.fillStyle = g;
    ctx.fillRect(gx, y + 30, barW * p, 9);
    ctx.strokeStyle = rgba(WHITE_GOLD, 0.6);
    ctx.strokeRect(gx + 0.5, y + 30.5, barW - 1, 8);
    text(ctx, `${blessingLabel(proxyFrames)}s REMAINING`, tx, y + 56, font(15, 700), mix(WHITE_GOLD, GOLD, 0.4), align);
  }

  const labelY = form === 2 ? y + 78 : y + 20;
  text(ctx, 'DIVINE CHARGE', tx, labelY, font(13, 700), rgba(GOLD, 0.85), align);

  // The meter itself is never corrupted: only the digits are.
  const mw = w - 24;
  const mx = bx + 12;
  const my = labelY + 8;
  ctx.fillStyle = rgba(INK, 0.85);
  ctx.fillRect(mx, my, mw, 10);
  const cg = ctx.createLinearGradient(mx, 0, mx + mw, 0);
  cg.addColorStop(0, mix(GOLD, '#4a3a10', 0.35));
  cg.addColorStop(1, form === 2 ? WHITE_GOLD : GOLD_HI);
  ctx.fillStyle = cg;
  ctx.fillRect(mx, my, (mw * charge) / CHARGE.max, 10);
  // Tier ticks at 10 and 15: those are the execution thresholds.
  ctx.strokeStyle = rgba(INK, 0.9);
  for (const mark of [10, 15]) {
    ctx.beginPath();
    ctx.moveTo(mx + (mw * mark) / CHARGE.max, my);
    ctx.lineTo(mx + (mw * mark) / CHARGE.max, my + 10);
    ctx.stroke();
  }
  ctx.strokeStyle = rgba(GOLD, 0.5);
  ctx.strokeRect(mx + 0.5, my + 0.5, mw - 1, 9);

  if (form === 2) {
    const t = telemetry(state.fxFrame, charge, state.seed, att);
    text(ctx, t.display, tx, labelY + 42, font(30, 800), t.glitching ? WHITE_GOLD : GOLD_HI, align);
    text(ctx, `TRUE ${t.truth}`, right ? tx - 96 : tx + 96, labelY + 40, `600 14px ${MONO}`, rgba('#ffffff', 0.85), align);
  } else {
    text(ctx, String(charge), tx, labelY + 42, font(30, 800), charge >= 15 ? GOLD_HI : GOLD, align);
    text(ctx, `/ ${CHARGE.max}`, right ? tx - 44 : tx + 44, labelY + 40, font(14, 600), rgba(GOLD, 0.6), align);
  }

  // Attunement pips.
  const ay = (form === 2 ? y + 92 : y + 64);
  for (let i = 0; i < ATTUNE.max; i++) {
    const px = right ? bx + w - 12 - (ATTUNE.max - 1 - i) * 16 : bx + 12 + i * 16;
    const on = i < att;
    ctx.fillStyle = on ? (form === 2 ? WHITE_GOLD : GOLD_HI) : rgba(CHASSIS, 0.9);
    ctx.beginPath();
    ctx.moveTo(px, ay - 9);
    ctx.lineTo(px + 6, ay);
    ctx.lineTo(px, ay + 9);
    ctx.lineTo(px - 6, ay);
    ctx.closePath();
    ctx.fill();
    if (on) {
      ctx.strokeStyle = rgba(WHITE_GOLD, 0.8);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  text(ctx, `ATTUNEMENT ${att}`, right ? bx + w - 12 - ATTUNE.max * 16 - 8 : bx + 12 + ATTUNE.max * 16 + 8, ay + 5, font(12, 700), rgba(GOLD, 0.8), right ? 'right' : 'left');
  void cum;
}

/** Statuses, both sides, with real stack counts. */
function drawStatusStrip(ctx: CanvasRenderingContext2D, fighters: [Fighter, Fighter]): void {
  const w = 236;
  const h = 24;
  const y = 112;
  for (let side = 0; side < 2; side++) {
    const f = fighters[side as 0 | 1];
    const x = side === 0 ? 40 : 1280 - 40 - w;
    ctx.fillStyle = rgba(INK, 0.5);
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = rgba(GOLD, 0.2);
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    let cx = side === 0 ? x + 8 : x + w - 8;
    for (const { key, label } of MK2_STATUSES) {
      const st = f.statuses[key];
      const n = st?.stacks ?? 0;
      if (n <= 0) continue;
      const color = STATUS_COLOR[key] ?? GOLD;
      const chipW = 14 + label.length * 6.2;
      const bx = side === 0 ? cx : cx - chipW;
      ctx.fillStyle = rgba(color, 0.2);
      ctx.fillRect(bx, y + 4, chipW, h - 8);
      ctx.strokeStyle = rgba(color, 0.85);
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + 0.5, y + 4.5, chipW - 1, h - 9);
      text(ctx, `${label} ${n}`, bx + chipW / 2, y + 16, font(11, 700), color, 'center');
      cx += side === 0 ? chipW + 5 : -(chipW + 5);
      if (cx < x || cx > x + w) break;
    }
  }
}

function drawTimer(ctx: CanvasRenderingContext2D, state: MatchState, cx: number, y: number): void {
  const secs = Math.max(0, Math.ceil(state.timer / 60));
  ctx.fillStyle = rgba(INK, 0.7);
  ctx.fillRect(cx - 46, y - 26, 92, 46);
  ctx.strokeStyle = rgba(GOLD, 0.45);
  ctx.strokeRect(cx - 45.5, y - 25.5, 91, 45);
  text(ctx, String(secs).padStart(2, '0'), cx, y + 6, font(34, 800), state.timer < 600 ? '#ff7a4a' : GOLD_HI, 'center');
  text(ctx, `ROUND ${state.round}`, cx, y + 34, font(11, 700), rgba(GOLD, 0.7), 'center');
}

function drawMoveHint(ctx: CanvasRenderingContext2D, state: MatchState): void {
  // Strict requirements for the P1 machine, straight from the move list.
  const f = state.fighters[0];
  if (f.charId !== 'mk2') return;
  const form = f.char[CK.form] ?? 1;
  const opp = state.fighters[1];
  const list = moveListFor(f);
  const x = 40;
  const y = 150;
  const w = 340;
  const rows = list.filter((m) => m.legal(state, f, opp)).slice(0, 6);
  const h = 22 + rows.length * 17;
  panel(ctx, x, y, w, h, 0.55);
  text(
    ctx,
    form === 2 ? 'PROXY ARTS — READY' : 'READY — STRICT REQUIREMENTS MET',
    x + 10,
    y + 16,
    font(11, 700),
    rgba(GOLD, 0.85),
  );
  rows.forEach((m, i) => {
    const ry = y + 33 + i * 17;
    text(ctx, m.input, x + 10, ry, font(11, 700), form === 2 ? WHITE_GOLD : GOLD_HI);
    text(ctx, m.name, x + 176, ry, font(11, 600), rgba('#ffffff', 0.9));
    text(ctx, m.requirement, x + w - 10, ry, font(10, 500), rgba(GOLD, 0.62), 'right');
  });
}

function drawBanners(ctx: CanvasRenderingContext2D, state: MatchState, fx: FxLayer, w: number, h: number): void {
  let y = h * 0.34;
  for (const b of fx.banners) {
    const t = b.life / b.maxLife;
    const inT = Math.min(1, (b.maxLife - b.life) / 8);
    const alpha = Math.min(inT, t * 4);
    ctx.globalAlpha = alpha;
    const size = b.id === 'fool' ? 76 : 40;
    text(ctx, b.text || b.id.toUpperCase(), w / 2, y, font(size, 800), b.id === 'fool' ? WHITE_GOLD : GOLD_HI, 'center');
    if (b.sub) text(ctx, b.sub, w / 2, y + 30, font(18, 600), rgba(GOLD, 0.9), 'center');
    ctx.globalAlpha = 1;
    y += 54;
  }
  if (state.phase === 'intro') {
    const n = Math.ceil((60 - state.timer % 60) / 60);
    void n;
  }
}

/** The silence before "Fool." - the screen itself holds its breath. */
function drawSilence(ctx: CanvasRenderingContext2D, silence: number, w: number, h: number): void {
  const t = Math.min(1, silence / 30);
  ctx.fillStyle = `rgba(0,0,0,${0.9 * t})`;
  ctx.fillRect(0, 0, w, h);
}

function drawTextCue(ctx: CanvasRenderingContext2D, state: MatchState): void {
  const t = state.text.life / 90;
  ctx.globalAlpha = Math.min(1, t * 2);
  text(ctx, state.text.text, 640, 560, font(28, 700), GOLD_HI, 'center');
  if (state.text.sub) text(ctx, state.text.sub, 640, 588, font(16, 600), rgba(GOLD, 0.8), 'center');
  ctx.globalAlpha = 1;
}

function drawDebug(ctx: CanvasRenderingContext2D, state: MatchState, w: number, h: number): void {
  const [a, b] = state.fighters;
  const lines = [
    `frame ${state.frame}  phase ${state.phase}  storm ${state.storm.toFixed(2)}`,
    `p1 ${a.charId} hp ${a.hp.toFixed(0)} x ${a.x.toFixed(1)} y ${a.y.toFixed(1)} ${a.state} ${a.move?.id ?? ''}`,
    `    charge ${a.char[CK.charge] ?? 0} att ${a.char[CK.attunement] ?? 0} cum ${a.char[CK.cumSpend] ?? 0} form ${a.char[CK.form] ?? 1}`,
    `p2 ${b.charId} hp ${b.hp.toFixed(0)} x ${b.x.toFixed(1)} y ${b.y.toFixed(1)} ${b.state} ${b.move?.id ?? ''}`,
    `    charge ${b.char[CK.charge] ?? 0} att ${b.char[CK.attunement] ?? 0} cum ${b.char[CK.cumSpend] ?? 0} form ${b.char[CK.form] ?? 1}`,
    `shots ${state.shots.length}  shake ${state.shake.toFixed(1)}  silence ${state.silence}`,
  ];
  ctx.fillStyle = rgba(INK, 0.8);
  ctx.fillRect(w - 470, h - 130, 440, 116);
  ctx.strokeStyle = rgba(GOLD, 0.3);
  ctx.strokeRect(w - 469.5, h - 129.5, 439, 115);
  lines.forEach((l, i) => text(ctx, l, w - 458, h - 108 + i * 18, `500 12px ${MONO}`, rgba('#d8dce8', 0.9)));
}
