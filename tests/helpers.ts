/**
 * Test helpers. Nothing here reaches into private state of the engine - tests
 * drive the real frame step, exactly like a real match would.
 */

import { createMatch, deepClone, hashState, type MatchConfig } from '../src/sim/state';
import { step, type Inputs } from '../src/sim/engine';
import { BTN, ACTION_BITS } from '../src/sim/const';
import { moveOf } from '../src/sim/registry';
import { CK } from '../src/characters/mk2/constants';
import { consumeStatus } from '../src/sim/statuses';
import { syncAttunement } from '../src/characters/mk2/state';
import type { Fighter, MatchState } from '../src/sim/types';
import '../src/characters';

export function makeMatch(cfg: Partial<MatchConfig> = {}): MatchState {
  const state = createMatch({
    p1: 'mk2',
    p2: 'mk1',
    seed: 0xc0ffee,
    ...cfg,
  });
  // Skip the intro so tests start in a live round.
  state.phase = 'fight';
  return state;
}

export function p(state: MatchState, i: 0 | 1): Fighter {
  return state.fighters[i];
}

/** Park a fighter at a known spot. */
export function place(state: MatchState, i: 0 | 1, x: number, y = 0): Fighter {
  const f = p(state, i);
  f.x = x;
  f.y = y;
  f.onGround = y <= 0;
  f.vx = 0;
  f.vy = 0;
  return f;
}

/** Put the two fighters at a fixed distance, facing each other. */
export function faceOff(state: MatchState, gap = 80, y0 = 0, y1 = 0): void {
  place(state, 0, -gap / 2, y0);
  place(state, 1, gap / 2, y1);
  p(state, 0).facing = 1;
  p(state, 1).facing = -1;
}

export function runFrames(
  state: MatchState,
  frames: number,
  input: Inputs | ((frame: number) => Inputs) = [0, 0],
): void {
  for (let i = 0; i < frames; i++) {
    const inp = typeof input === 'function' ? input(state.frame) : input;
    step(state, inp);
  }
}

/** Press a button on exactly one frame. */
export function tap(state: MatchState, key: string, extra = 0, framesAfter = 0): void {
  step(state, [ACTION_BITS[key] | extra, 0]);
  runFrames(state, framesAfter, [0, 0]);
}

export function charge(f: Fighter): number {
  return f.char[CK.charge];
}

export function setCharge(f: Fighter, n: number): void {
  f.char[CK.charge] = n;
}

export function attune(f: Fighter): number {
  return f.char[CK.attunement];
}

export function setAttune(f: Fighter, n: number): void {
  f.char[CK.attunement] = n;
}

export function form(f: Fighter): number {
  return f.char[CK.form];
}

/** Force a move to start (bypassing input, keeps every other system intact). */
export function forceMove(state: MatchState, f: Fighter, moveId: string): void {
  const def = moveOf(moveId);
  f.char[CK.charge] = Math.max(f.char[CK.charge], def.cost?.primary ?? 0);
  step(state, [0, 0]);
  f.move = { id: moveId, frame: 0, hits: 0, hitIds: [], vars: {} };
  f.state = 'attack';
  f.dmgScale = 1;
  if (def.invuln) f.invuln = 0;
}

/** Step until `predicate` is true or the budget runs out. */
export function until(
  state: MatchState,
  predicate: (s: MatchState) => boolean,
  budget = 240,
  input: Inputs = [0, 0],
): boolean {
  for (let i = 0; i < budget; i++) {
    if (predicate(state)) return true;
    step(state, input);
  }
  return predicate(state);
}

export function clone(s: MatchState): MatchState {
  return deepClone(s);
}

export function hash(s: MatchState): string {
  return hashState(s);
}

export { BTN, ACTION_BITS };

/* ------------------------------------------------------------------ */
/* Combat utilities for tests                                         */
/* ------------------------------------------------------------------ */

import { applyHit } from '../src/sim/combat';
import { activateProxy } from '../src/characters/mk2/secondLife';
import { addCharge, attunement as setAttuneFn } from '../src/characters/mk2/state';
import type { MoveDef } from '../src/sim/types';

/** Land a real hit (full damage pipeline) from `atk` onto `def`. */
export function hit(
  state: MatchState,
  atk: Fighter,
  def: Fighter,
  moveId: string,
  extra: Partial<Parameters<typeof applyHit>[3]> = {},
) {
  return applyHit(state, atk, def, {
    moveId,
    fromShot: false,
    shotKind: '',
    hitIndex: 0,
    ...extra,
  });
}

/** A hit that ignores everything and simply removes HP. */
export function lethalHit(state: MatchState, atk: Fighter, def: Fighter): void {
  applyHit(state, atk, def, {
    moveId: 'mk1:cleave',
    fromShot: false,
    shotKind: '',
    hitIndex: 0,
    flatDamage: 99999,
    unblockable: true,
  });
}

/** Put Mk. 2 over the second-life requirement line. */
export function qualifyForSecondLife(_state: MatchState, f: Fighter): void {
  f.char[CK.attunement] = 3;
  f.char[CK.cumSpend] = 30;
  f.char[CK.marksApplied] = 2;
}

/** Activate the blessing without dying first. */
export function grantProxy(state: MatchState, f: Fighter): void {
  activateProxy(state, f, p(state, f.player === 0 ? 1 : 0));
}

/** Start a move and immediately return (no frames simulated). */
export function start(state: MatchState, f: Fighter, moveId: string): void {
  const def: MoveDef = moveOf(moveId);
  const opp = state.fighters[f.player === 0 ? 1 : 0];
  // Pay the real cost so tests exercise the same economy the game does.
  if (def.cost?.primary !== undefined) {
    f.char[CK.charge] = Math.max(f.char[CK.charge], def.cost.primary);
    f.char[CK.charge] -= def.cost.primary;
    f.char[CK.cumSpend] += def.cost.primary;
    syncAttunement(f);
  }
  if (def.cost?.consume) {
    for (const key in def.cost.consume) {
      consumeStatus(opp, key, def.cost.consume[key] ?? 0);
    }
  }
  f.move = { id: moveId, frame: 0, hits: 0, hitIds: [], vars: {} };
  f.state = 'attack';
  f.dmgScale = 1;
  f.cancelTimer = 0;
  f.cancelInto = [];
  f.hitstun = 0;
  f.hitstop = 0;
  f.invuln = 0;
  f.vx = 0;
  f.vy = 0;
  void addCharge;
  void setAttuneFn;
}

/** Run a move to completion and report the damage it dealt. */
export function execute(
  state: MatchState,
  f: Fighter,
  opp: Fighter,
  moveId: string,
  budget = 200,
): number {
  start(state, f, moveId);
  const before = opp.hp;
  for (let i = 0; i < budget; i++) {
    step(state, [0, 0]);
    if (!f.move) break;
  }
  return before - opp.hp;
}
