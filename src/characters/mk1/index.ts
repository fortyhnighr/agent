/**
 * CYBORG MK. 1
 *
 * Creator's first assassination machine: simpler, more immediately consistent
 * and easier to pick up. It exists as the baseline Mk. 2 has to beat through
 * mastery - Mk. 2 is never made weaker to get there.
 *
 * No resource spending decisions, no status layers, no strict requirements.
 * One meter, filled by fighting, spent on one super.
 */

import { registerCharacter, registerHitHook, registerMoveHook } from '../../sim/registry';
import { emit, grantCancel, startMove } from '../../sim/actions';
import { held, holdFrames, pressed } from '../../sim/input';
import { airDashAvailable, sharedLocomotion, startDash } from '../../sim/physics';
import { canAct, gainMeter } from '../../sim/actions';
import type { CharacterDef, DamageContext, Fighter, GuardContext, MatchState, MoveDef } from '../../sim/types';

const K = {
  slash: 'mk1:slash',
  stepSlash: 'mk1:step-slash',
  cleave: 'mk1:cleave',
  blink: 'mk1:blink-step',
  rising: 'mk1:rising-edge',
  thrust: 'mk1:thrust-line',
  overdrive: 'mk1:overdrive',
  odStrike: 'mk1:od-strike',
  odFinal: 'mk1:od-final',
};

const MK1_MOVES: MoveDef[] = [
  {
    id: K.slash,
    name: 'SLASH',
    input: 'J',
    type: 'normal',
    startup: 5,
    active: 3,
    recovery: 8,
    damage: 34,
    chip: 4,
    hitstun: 16,
    blockstun: 12,
    hitstop: 6,
    guardCrush: 6,
    maxHits: 1,
    boxes: [{ x: 16, y: 34, w: 74, h: 22 }],
    chain: [K.slash, K.stepSlash],
    cancelOnHit: [K.stepSlash, K.cleave, K.thrust, K.rising, K.overdrive],
    onHit: 'mk1:gain',
    tags: ['blade'],
    fx: 'slash',
    note: 'Consistent poke. Chains into itself.',
  },
  {
    id: K.stepSlash,
    name: 'STEP SLASH',
    input: 'K',
    type: 'normal',
    startup: 9,
    active: 4,
    recovery: 13,
    damage: 50,
    chip: 6,
    hitstun: 18,
    blockstun: 14,
    hitstop: 7,
    guardCrush: 9,
    maxHits: 1,
    boxes: [{ x: 18, y: 32, w: 88, h: 24 }],
    vel: [{ from: 9, to: 14, vx: 6.4, vy: 0 }],
    chain: [K.slash, K.cleave],
    cancelOnHit: [K.cleave, K.thrust, K.rising, K.overdrive],
    onHit: 'mk1:gain',
    tags: ['blade'],
    fx: 'stepSlash',
    note: 'Advancing slash.',
  },
  {
    id: K.cleave,
    name: 'CLEAVE',
    input: 'L',
    type: 'special',
    startup: 14,
    active: 4,
    recovery: 19,
    damage: 94,
    chip: 12,
    hitstun: 22,
    blockstun: 16,
    hitstop: 10,
    guardCrush: 22,
    maxHits: 1,
    knockdown: true,
    boxes: [{ x: 20, y: 28, w: 100, h: 30 }],
    vel: [{ from: 14, to: 19, vx: 4.6, vy: 0 }],
    cancelOnHit: [K.thrust, K.overdrive],
    onHit: 'mk1:gain',
    tags: ['blade'],
    fx: 'cleave',
    note: 'Committed heavy. Knockdown on hit.',
  },
  {
    id: K.blink,
    name: 'BLINK STEP',
    input: 'I',
    type: 'movement',
    startup: 3,
    active: 10,
    recovery: 7,
    damage: 0,
    chip: 0,
    hitstun: 0,
    blockstun: 0,
    hitstop: 0,
    guardCrush: 0,
    maxHits: 0,
    boxes: [],
    invuln: [3, 11],
    onActivate: 'mk1:blinkStart',
    tags: ['phase'],
    fx: 'blink',
    note: 'Short invulnerable dash. No perfect timing required, no reward for timing.',
  },
  {
    id: K.rising,
    name: 'RISING EDGE',
    input: 'U',
    type: 'special',
    startup: 12,
    active: 6,
    recovery: 20,
    damage: 70,
    chip: 8,
    hitstun: 24,
    blockstun: 15,
    hitstop: 9,
    guardCrush: 14,
    maxHits: 1,
    knockdown: true,
    boxes: [{ x: 6, y: 40, w: 70, h: 110 }],
    vel: [{ from: 12, to: 17, vx: 2.2, vy: 13 }],
    onHit: 'mk1:gain',
    tags: ['blade'],
    fx: 'rising',
    note: 'Anti-air launcher.',
  },
  {
    id: K.thrust,
    name: 'THRUST LINE',
    input: 'O',
    type: 'special',
    startup: 13,
    active: 4,
    recovery: 18,
    damage: 64,
    chip: 8,
    hitstun: 20,
    blockstun: 15,
    hitstop: 8,
    guardCrush: 14,
    maxHits: 1,
    boxes: [{ x: 22, y: 30, w: 140, h: 22 }],
    vel: [{ from: 13, to: 18, vx: 8.4, vy: 0 }],
    onHit: 'mk1:gain',
    tags: ['blade', 'thrust'],
    fx: 'thrust',
    note: 'Long poke. Reliable range.',
  },
  {
    id: K.overdrive,
    name: 'OVERDRIVE',
    input: 'R · 100 Overdrive',
    type: 'super',
    startup: 7,
    active: 2,
    recovery: 96,
    damage: 0,
    chip: 0,
    hitstun: 0,
    blockstun: 0,
    hitstop: 0,
    guardCrush: 0,
    maxHits: 0,
    boxes: [],
    invuln: [1, 8],
    armor: [9, 60],
    onActivate: 'mk1:overdriveStart',
    tags: ['blade'],
    fx: 'overdrive',
    note: 'Meter super. Six strikes and a finisher.',
  },
  {
    id: K.odStrike,
    name: 'OVERDRIVE STRIKE',
    input: '-',
    type: 'finisher',
    startup: 1,
    active: 2,
    recovery: 2,
    damage: 44,
    chip: 6,
    hitstun: 14,
    blockstun: 12,
    hitstop: 5,
    guardCrush: 8,
    maxHits: 1,
    boxes: [],
    onHit: 'mk1:gain',
    tags: ['blade'],
    fx: 'odStrike',
  },
  {
    id: K.odFinal,
    name: 'OVERDRIVE FINISHER',
    input: '-',
    type: 'finisher',
    startup: 1,
    active: 3,
    recovery: 4,
    damage: 120,
    chip: 16,
    hitstun: 28,
    blockstun: 20,
    hitstop: 14,
    guardCrush: 40,
    maxHits: 1,
    knockdown: true,
    boxes: [],
    onHit: 'mk1:gain',
    tags: ['blade'],
    fx: 'odFinal',
  },
];

registerHitHook('mk1:gain', (ctx: DamageContext) => {
  gainMeter(ctx.atk, Math.round(ctx.baseDamage * 0.07));
  emit(ctx.state, 'vfx', 'meterGain', ctx.atk.x, ctx.atk.y + 96, 1);
});

registerMoveHook('mk1:blinkStart', (ctx) => {
  const back = ctx.self.padBack === 1;
  ctx.self.vx = (back ? -6.4 : 7.2) * ctx.self.facing;
  emit(ctx.state, 'vfx', 'blink', ctx.self.x, ctx.self.y + 50, 1);
});

registerMoveHook('mk1:overdriveStart', (ctx) => {
  ctx.self.char.meter = 0;
  ctx.self.char.seq = 1;
  ctx.self.char.seqFrame = 0;
  emit(ctx.state, 'banner', 'super', ctx.self.player, 0, 0, K.overdrive);
  emit(ctx.state, 'vfx', 'overdriveStart', ctx.self.x, ctx.self.y + 60, 1);
});

/** Mk. 1's Overdrive timeline (kept simple on purpose). */
const OD_BEATS: { f: number; side: number; move: string; scale: number }[] = [
  { f: 12, side: 1, move: K.odStrike, scale: 1 },
  { f: 26, side: -1, move: K.odStrike, scale: 1 },
  { f: 40, side: 1, move: K.odStrike, scale: 1.2 },
  { f: 54, side: -1, move: K.odStrike, scale: 1.2 },
  { f: 68, side: 1, move: K.odStrike, scale: 1.2 },
  { f: 84, side: 1, move: K.odFinal, scale: 1 },
];
const OD_TOTAL = 106;

function tickOverdrive(state: MatchState, self: Fighter, opp: Fighter): void {
  if (self.char.seq !== 1) return;
  const frame = self.char.seqFrame + 1;
  self.char.seqFrame = frame;
  const idx = self.char.seqCursor ?? 0;
  const next = OD_BEATS[idx];
  if (next && next.f <= frame) {
    self.x = opp.x + 72 * next.side;
    self.facing = next.side >= 0 ? 1 : -1;
    emit(state, 'vfx', 'odStrike', (self.x + opp.x) / 2, self.y + 52, next.scale);
    applyStrike(state, self, opp, next.move, next.scale);
    self.char.seqCursor = idx + 1;
  }
  if (frame >= OD_TOTAL) {
    self.char.seq = 0;
    self.char.seqFrame = 0;
    self.char.seqCursor = 0;
  }
}

import { applyHit } from '../../sim/combat';

function applyStrike(
  state: MatchState,
  self: Fighter,
  opp: Fighter,
  moveId: string,
  scale: number,
): void {
  applyHit(state, self, opp, {
    moveId,
    fromShot: false,
    shotKind: '',
    hitIndex: 0,
    baseScale: scale,
    hitX: (self.x + opp.x) / 2,
    hitY: self.y + 52,
  });
}

export function onMk1Frame(state: MatchState, self: Fighter, opp: Fighter): void {
  tickOverdrive(state, self, opp);
}

export function onMk1Damaged(self: Fighter, amount: number): void {
  gainMeter(self, Math.round(amount * 0.05));
}

function f_move_active(self: Fighter): boolean {
  return self.move === null;
}

export function onMk1Input(state: MatchState, self: Fighter, _opp: Fighter): void {
  if (self.state === 'dead') return;
  if (pressed(self, 'R') && self.meter >= 100 && canAct(self)) {
    self.meter = 0;
    const move = startMove(self, K.overdrive);
    grantCancel(self, [], 0);
    void move;
    return;
  }
  if (pressed(self, 'P') && canAct(self)) {
    // Mk. 1 has no P. Consume it silently rather than pretending.
    return;
  }
  if (pressed(self, 'L') || (held(self, 'L') && holdFrames(self, 'L') > 10)) {
    if (pressed(self, 'L') && canAct(self)) {
      startMove(self, K.cleave);
      return;
    }
  }
  if (pressed(self, 'O') && canAct(self)) {
    startMove(self, K.thrust);
    return;
  }
  if (pressed(self, 'I') && canAct(self)) {
    startMove(self, K.blink);
    return;
  }
  if (pressed(self, 'U') && self.padDown === 0 && canAct(self)) {
    startMove(self, K.rising);
    return;
  }
  if (pressed(self, 'K') && canAct(self)) {
    startMove(self, K.stepSlash);
    return;
  }
  if (pressed(self, 'J') && canAct(self)) {
    startMove(self, K.slash);
    return;
  }
  if (!self.onGround && (self.padDashF || self.padDashB) && airDashAvailable(self)) {
    startDash(self, self.padDashF ? 1 : -1, 'air', 10.2);
    return;
  }
  // Locomotion never overrides an active move: the state machine belongs to the
  // move until it ends or is cancelled.
  if (f_move_active(self)) sharedLocomotion(state, self, {
    canWalk: true,
    canCrouch: true,
    canJump: true,
    canDash: true,
    canGuard: true,
  });
}

const moveList = MK1_MOVES.map((m) => ({ input: m.input, name: m.name, note: m.note ?? '' }));

export const mk1: CharacterDef = registerCharacter({
  id: 'mk1',
  name: 'CYBORG MK. 1',
  maxHp: 1000,
  walkF: 2.7,
  walkB: 2.2,
  jumpVy: 12,
  jumpVx: 5.2,
  airControl: 0.9,
  moves: MK1_MOVES,
  shots: [],
  makeCharState: () => ({ meterAcc: 0, seq: 0, seqFrame: 0, seqCursor: 0 }),
  onFrame: onMk1Frame,
  onInput: onMk1Input,
  outgoingMods: () => 1,
  incomingMods: () => 1,
  guardMods: (_ctx: GuardContext) => 1,
  onDamaged: (_state: MatchState, self: Fighter, _opp: Fighter, amount: number, blocked: boolean) => {
    onMk1Damaged(self, blocked ? amount * 0.4 : amount);
  },
  onDeath: () => false,
  ai: (state, self, _opp) => mk1Brain(state, self, _opp),
  moveList,
  palette: { body: '#c9ccd4', accent: '#5b6ea8', glow: '#9fb6ff' },
});

/** Mk. 1 AI: straightforward. Approach, hit, block, punish, super when full. */
function mk1Brain(state: MatchState, self: Fighter, opp: Fighter): number {
  // A running move owns the decision, exactly like a player's commitment.
  if (self.move) return 0;
  if (self.state === 'dead') return 0;
  const d = Math.hypot(self.x - opp.x, self.y - opp.y);
  const fwd = self.facing === 1 ? (1 << 1) : (1 << 0);
  const bwd = self.facing === 1 ? (1 << 0) : (1 << 1);
  if (opp.y > 60 && d < 200) {
    startMove(self, K.rising);
    return 0;
  }
  if (opp.hitstun > 0 || opp.blockstun > 0) {
    if (self.meter >= 100) {
      startMove(self, K.overdrive);
      return 0;
    }
    if (d < 110) {
      startMove(self, K.stepSlash);
      return 0;
    }
  }
  if (self.meter >= 100 && d < 190) {
    startMove(self, K.overdrive);
    return 0;
  }
  if (d < 110) {
    if ((state.frame + self.player) % 3 === 0) {
      startMove(self, K.cleave);
      return 0;
    }
    startMove(self, K.slash);
    return 0;
  }
  if (d < 220) {
    startMove(self, K.thrust);
    return 0;
  }
  return fwd | (self.meter < 100 ? 0 : bwd);
}

export default mk1;
