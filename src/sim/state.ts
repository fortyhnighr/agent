/**
 * State construction, cloning (snapshots) and hashing.
 *
 * The state is a pure JSON-able tree, so clone/restore is a structural copy and
 * the hash is a canonical walk with sorted keys. Both are exact, which is what
 * rollback and desync detection need.
 */

import { BODY, ROUND, STAGE } from './const';
import { makeRng } from './rng';
import { charOf } from './registry';
import { makeStatusTable } from './statuses';
import type { Fighter, MatchState, TextCue } from './types';

export const BUTTON_KEYS = ['J', 'K', 'L', 'I', 'U', 'O', 'P', 'R', 'GUARD'] as const;

export const INPUT_HIST_LEN = 12;

export function emptyTextCue(): TextCue {
  return { frame: -1, life: 0, text: '', sub: '' };
}

export function createFighter(player: 0 | 1, charId: string, x: number, facing: 1 | -1): Fighter {
  const def = charOf(charId);
  const lastPress: Record<string, number> = {};
  const lastRelease: Record<string, number> = {};
  const pressed: Record<string, number> = {};
  const holdCount: Record<string, number> = {};
  for (const k of BUTTON_KEYS) {
    lastPress[k] = -1;
    lastRelease[k] = -1;
    pressed[k] = 0;
    holdCount[k] = 0;
  }
  return {
    player,
    charId,
    x,
    y: 0,
    vx: 0,
    vy: 0,
    facing,
    onGround: true,
    hp: def.maxHp,
    maxHp: def.maxHp,
    meter: 0,
    state: 'idle',
    stateFrame: 0,
    hitstun: 0,
    blockstun: 0,
    hitstop: 0,
    invuln: 0,
    armor: 0,
    crouching: false,
    guarding: false,
    padDown: 0,
    padFwd: 0,
    padBack: 0,
    padGuard: 0,
    padJump: 0,
    padDashF: 0,
    padDashB: 0,
    guardCrush: 0,
    guardLow: false,
    move: null,
    dmgScale: 1,
    cancelInto: [],
    cancelTimer: 0,
    dashCd: 0,
    dashDir: 0,
    dashFrame: 0,
    dashKind: 'ground',
    airDashes: 1,
    comboHits: 0,
    comboDamage: 0,
    juggle: 0,
    wakeupInvuln: 0,
    attackActive: 0,
    statuses: makeStatusTable(),
    char: def.makeCharState(),
    ai: {
      think: 0,
      react: 0,
      plan: 0,
      planFrame: 0,
      planLen: 0,
      guard: 0,
      aggression: 0,
      spacing: 0,
      whiff: 0,
      burst: 0,
      lastOppState: 0,
      lastOppAttack: 0,
      oppStartup: 0,
      seen: 0,
      feint: 0,
      stick: 0,
    },
    inputHist: new Array<number>(INPUT_HIST_LEN).fill(0),
    inputFrame: -1,
    lastPress,
    lastRelease,
    pressed,
    holdCount,
    flashFrames: 0,
    vfxSeed: (0x9e3779b9 ^ (player * 0x85ebca6b)) >>> 0,
    lastHitTaken: 0,
    hitEvent: 0,
  };
}

export interface MatchConfig {
  p1: string;
  p2: string;
  seed?: number;
  aiP1?: boolean;
  aiP2?: boolean;
  round?: number;
}

export function createMatch(cfg: MatchConfig): MatchState {
  const seed = (cfg.seed ?? 0xc0ffee) >>> 0;
  const p1 = createFighter(0, cfg.p1, -170, 1);
  const p2 = createFighter(1, cfg.p2, 170, -1);
  return {
    frame: 0,
    phase: 'intro',
    timer: ROUND.frames,
    koTimer: 0,
    winner: -1,
    resultReason: '',
    seed,
    rng: makeRng(seed),
    storm: 0,
    stormFlash: 0,
    stormFlashDecay: 0,
    silence: 0,
    shake: 0,
    smitePillar: 0,
    text: emptyTextCue(),
    fighters: [p1, p2],
    aiControlled: [cfg.aiP1 ? 1 : 0, cfg.aiP2 ? 1 : 0],
    shots: [],
    nextShotId: 1,
    koQueue: [],
    events: [],
    fxFrame: 0,
    round: cfg.round ?? 1,
  };
}

/* ------------------------------------------------------------------ */
/* Generic structural copy (JSON-able data only)                       */
/* ------------------------------------------------------------------ */

export function deepClone<T>(v: T): T {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) {
    const out = new Array(v.length);
    for (let i = 0; i < v.length; i++) out[i] = deepClone(v[i]);
    return out as unknown as T;
  }
  const src = v as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k in src) if (Object.prototype.hasOwnProperty.call(src, k)) out[k] = deepClone(src[k]);
  return out as unknown as T;
}

/* ------------------------------------------------------------------ */
/* Canonical hashing                                                   */
/* ------------------------------------------------------------------ */

function writeCanonical(value: unknown, out: string[]): void {
  if (value === null || value === undefined) {
    out.push('n');
    return;
  }
  const t = typeof value;
  if (t === 'number') {
    const n = value as number;
    if (Number.isNaN(n)) {
      out.push('NaN');
      return;
    }
    if (!Number.isFinite(n)) {
      out.push(n > 0 ? 'Inf' : '-Inf');
      return;
    }
    // Integers hash losslessly; floats use their shortest round-trip form.
    out.push(Number.isInteger(n) ? `i${n}` : `f${n.toPrecision(15)}`);
    return;
  }
  if (t === 'boolean') {
    out.push(value ? 'b1' : 'b0');
    return;
  }
  if (t === 'string') {
    out.push(`s${(value as string).length}:${value as string}`);
    return;
  }
  if (Array.isArray(value)) {
    out.push('[');
    for (const item of value) writeCanonical(item, out);
    out.push(']');
    return;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  out.push('{');
  for (const k of keys) {
    out.push(k, '=');
    writeCanonical(obj[k], out);
  }
  out.push('}');
}

export function canonicalString(value: unknown): string {
  const out: string[] = [];
  writeCanonical(value, out);
  return out.join('');
}

export function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i) & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= (str.charCodeAt(i) >>> 8) & 0xff;
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** 32-bit state hash. Equal states always produce equal hashes. */
export function hashState(state: MatchState): string {
  return fnv1a(canonicalString(state));
}

/* ------------------------------------------------------------------ */
/* Geometry helpers shared by sim + renderer                           */
/* ------------------------------------------------------------------ */

export function hurtbox(f: Fighter): { x: number; y: number; w: number; h: number } {
  return {
    x: f.x - BODY.width / 2,
    y: f.y + BODY.hurtInsetY,
    w: BODY.width,
    h: BODY.height - BODY.hurtInsetY * 2,
  };
}

export function pushbox(f: Fighter): { x: number; y: number; w: number; h: number } {
  return { x: f.x - BODY.width / 2, y: f.y, w: BODY.width, h: BODY.height };
}

export function clampToStage(f: Fighter): void {
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

export function opponentOf(state: MatchState, f: Fighter): Fighter {
  return state.fighters[f.player === 0 ? 1 : 0];
}
