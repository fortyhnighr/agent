/**
 * Mutators shared by the engine and every character. Characters build their
 * kits out of these primitives so that frame data, cancels and event plumbing
 * behave identically across the roster.
 */

import { BODY, ROUND, STAGE } from './const';
import { moveOf, shotOf } from './registry';
import type { ActiveMove, EventKind, Fighter, MatchState, Shot } from './types';
import { hurtbox, opponentOf } from './state';

/* ---------------- events & presentation ---------------- */

export function emit(
  state: MatchState,
  k: EventKind,
  id: string,
  a = 0,
  b = 0,
  c = 0,
  t = '',
): void {
  state.events.push({ k, id, a, b, c, t });
}

export function shake(state: MatchState, power: number): void {
  if (power > state.shake) state.shake = power;
}

export function setTextCue(state: MatchState, text: string, sub: string, life: number): void {
  state.text.frame = 0;
  state.text.life = life;
  state.text.text = text;
  state.text.sub = sub;
}

export function advanceTextCue(state: MatchState): void {
  if (state.text.life > 0) {
    state.text.life -= 1;
    state.text.frame += 1;
    if (state.text.life <= 0) {
      state.text.life = 0;
      state.text.text = '';
      state.text.sub = '';
      state.text.frame = -1;
    }
  }
}

/* ---------------- fighter state ---------------- */

export function setState(f: Fighter, name: Fighter['state']): void {
  f.state = name;
  f.stateFrame = 0;
}

export function totalFrames(m: { startup: number; active: number; recovery: number }): number {
  return m.startup + m.active + m.recovery;
}

export function startMove(
  f: Fighter,
  id: string,
  vars: Record<string, number> = {},
): ActiveMove {
  const move: ActiveMove = { id, frame: 0, hits: 0, hitIds: [], vars: { ...vars } };
  f.move = move;
  setState(f, 'attack');
  f.guarding = false;
  f.crouching = false;
  f.cancelInto = [];
  f.cancelTimer = 0;
  return move;
}

export function endMove(f: Fighter): void {
  f.move = null;
  f.dmgScale = 1;
  f.cancelInto = [];
  f.cancelTimer = 0;
  f.attackActive = 0;
}

export function moveDefOf(f: Fighter) {
  return f.move ? moveOf(f.move.id) : null;
}

export function moveFrame(f: Fighter): number {
  return f.move ? f.move.frame : 0;
}

export function isStartup(f: Fighter): boolean {
  if (!f.move) return false;
  const d = moveOf(f.move.id);
  return f.move.frame < d.startup;
}

export function isActiveFrames(f: Fighter): boolean {
  if (!f.move) return false;
  const d = moveOf(f.move.id);
  return f.move.frame >= d.startup && f.move.frame < d.startup + d.active;
}

export function isRecovering(f: Fighter): boolean {
  if (!f.move) return false;
  const d = moveOf(f.move.id);
  return f.move.frame >= d.startup + d.active;
}

/** True when the fighter is free to start a new action. */
export function canAct(f: Fighter): boolean {
  if (f.hitstun > 0 || f.blockstun > 0 || f.hitstop > 0) return false;
  if (f.state === 'knockdown' || f.state === 'wakeup' || f.state === 'guardBreak') return false;
  if (f.state === 'smiteDead' || f.state === 'dead') return false;
  if (f.state === 'dash' || f.state === 'airDash') return false;
  if (f.move) {
    if (isRecovering(f)) return false;
    if (isActiveFrames(f) || isStartup(f)) {
      // Only allowed when the current move grants a cancel window.
      return f.cancelTimer > 0;
    }
  }
  return true;
}

/** Cancel the current move into another (validates the cancel list). */
export function tryCancel(f: Fighter, into: string): boolean {
  if (!f.move) return false;
  if (!f.cancelInto.includes(into)) return false;
  if (f.cancelTimer <= 0) return false;
  endMove(f);
  return true;
}

export function grantCancel(f: Fighter, ids: string[], window: number): void {
  f.cancelInto = ids;
  f.cancelTimer = window;
}

/** Declare a knockout. Shared by the engine and by character specific deaths. */
export function declareKo(state: MatchState, loser: Fighter, reason: string): void {
  if (state.phase === 'ko' || state.phase === 'over') return;
  state.phase = 'ko';
  state.koTimer = ROUND.koFreeze;
  state.winner = (1 - loser.player) as 0 | 1;
  state.resultReason = reason;
  endMove(loser);
  if (loser.state !== 'smiteDead') setState(loser, 'dead');
  loser.hitstun = 0;
  loser.guarding = false;
  emit(state, 'banner', 'ko', loser.player, 0, 0, reason);
  emit(state, 'sfx', 'ko', loser.x, 0, 0);
  shake(state, 22);
  state.stormFlash = 1;
  state.stormFlashDecay = 0.04;
}

/* ---------------- geometry ---------------- */

export function activeBoxes(f: Fighter): { x: number; y: number; w: number; h: number }[] {
  if (!f.move || !isActiveFrames(f)) return [];
  const d = moveOf(f.move.id);
  const out: { x: number; y: number; w: number; h: number }[] = [];
  for (const b of d.boxes) {
    // Box x offsets are authored facing-right. Facing mirrors the origin AND
    // the span, so a left-facing thrust still extends forwards.
    const x = f.x + b.x * f.facing;
    out.push(
      f.facing === 1
        ? { x, y: f.y + b.y, w: b.w, h: b.h }
        : { x: x - b.w, y: f.y + b.y, w: b.w, h: b.h },
    );
  }
  return out;
}

export function overlaps(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function boxCenter(
  a: { x: number; y: number; w: number; h: number },
): { x: number; y: number } {
  return { x: a.x + a.w / 2, y: a.y + a.h / 2 };
}

export function hurtboxOf(f: Fighter): { x: number; y: number; w: number; h: number } {
  if (f.move) {
    const d = moveOf(f.move.id);
    if (d.hurtbox && (isStartup(f) || isActiveFrames(f) || isRecovering(f))) {
      const b = d.hurtbox;
      return { x: f.x - b.w / 2 + b.x * f.facing, y: f.y + b.y, w: b.w, h: b.h };
    }
  }
  return hurtbox(f);
}

export function faceOpponent(state: MatchState, f: Fighter): void {
  const opp = opponentOf(state, f);
  const dx = opp.x - f.x;
  if (Math.abs(dx) < 4) return;
  f.facing = dx > 0 ? 1 : -1;
}

export function distanceBetween(a: Fighter, b: Fighter): number {
  return Math.hypot(a.x - b.x, (a.y - b.y) * 0.6);
}

export function inFront(a: Fighter, b: Fighter): boolean {
  return (b.x - a.x) * a.facing >= -BODY.width * 0.5;
}

/* ---------------- shots ---------------- */

export interface SpawnOpts {
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  life?: number;
  angle?: number;
  vars?: Record<string, number>;
}

export function spawnShot(state: MatchState, f: Fighter, kind: string, opts: SpawnOpts = {}): Shot {
  const def = shotOf(kind);
  const angle = ((opts.angle ?? def.angle ?? 0) * Math.PI) / 180;
  const speed = opts.vx !== undefined ? opts.vx : def.speed;
  const shot: Shot = {
    kind,
    id: state.nextShotId++,
    owner: f.player,
    x: opts.x ?? f.x + 30 * f.facing,
    y: opts.y ?? f.y + 46,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    life: opts.life ?? def.life,
    frame: 0,
    rehit: 0,
    hit: 0,
    vars: opts.vars ? { ...opts.vars } : {},
  };
  state.shots.push(shot);
  return shot;
}

/* ---------------- resources ---------------- */

export function gainMeter(f: Fighter, amount: number, max = 100): void {
  f.meter = Math.min(max, f.meter + amount);
}

export function clampStageX(f: Fighter): void {
  const lim = STAGE.halfWidth - STAGE.wallPad;
  if (f.x < -lim) {
    f.x = -lim;
    if (f.vx < 0) f.vx = 0;
  } else if (f.x > lim) {
    f.x = lim;
    if (f.vx > 0) f.vx = 0;
  }
  if (f.y > STAGE.ceiling) {
    f.y = STAGE.ceiling;
    if (f.vy > 0) f.vy = 0;
  }
}

export function heal(f: Fighter, amount: number): void {
  f.hp = Math.min(f.maxHp, f.hp + amount);
}
