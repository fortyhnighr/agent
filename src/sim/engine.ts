/**
 * The deterministic 60Hz frame step.
 *
 * Every gameplay decision in the game happens here or in code called from here.
 * No Math.random / Date.now / performance.now is allowed anywhere below this
 * file's import graph; presentation derives from counters stored in the state.
 */

import { BTN, FPS, ROUND } from './const';
import { charOf } from './registry';
import { tickStatuses } from './statuses';
import { applyGuardCrush, resolveCombat, resolveShots, tickGuardMeter } from './combat';
import { advanceTextCue, canAct, declareKo, emit } from './actions';
import { integrate, separate, tickDash, tickTimers, updateMove, updateStun } from './physics';
import {
  currentInput,
  doubleTapped,
  forwardBit,
  heldBit,
  inputAt,
  pushInput,
} from './input';
import type { Fighter, MatchState } from './types';

export type Inputs = [number, number];

const MASK = 0x1fff;

export function declareTimeout(state: MatchState): void {
  if (state.phase === 'ko' || state.phase === 'over') return;
  const [a, b] = state.fighters;
  state.phase = 'ko';
  state.koTimer = ROUND.koFreeze;
  state.winner = a.hp === b.hp ? 2 : a.hp > b.hp ? 0 : 1;
  state.resultReason = 'time';
  emit(state, 'banner', 'time', 0, 0, 0);
}

function decodePad(f: Fighter): void {
  const input = currentInput(f);
  const fwdBit = forwardBit(f);
  f.padFwd = heldBit(f, fwdBit) ? 1 : 0;
  f.padBack = heldBit(f, fwdBit === BTN.RIGHT ? BTN.LEFT : BTN.RIGHT) ? 1 : 0;
  f.padDown = heldBit(f, BTN.DOWN) ? 1 : 0;
  f.padGuard = heldBit(f, BTN.GUARD) ? 1 : 0;
  const prev = inputAt(f, 1);
  f.padJump = (input & BTN.UP) !== 0 && (prev & BTN.UP) === 0 ? 1 : 0;
  f.padDashF = doubleTapped(f, fwdBit) ? 1 : 0;
  f.padDashB = doubleTapped(f, fwdBit === BTN.RIGHT ? BTN.LEFT : BTN.RIGHT) ? 1 : 0;
}

/** One simulation frame. `inputs` is the human pad state for non-AI slots. */
export function step(state: MatchState, inputs: Inputs): void {
  state.events.length = 0;
  state.frame += 1;
  state.fxFrame += 1;

  const [f0, f1] = state.fighters;
  const opp0 = f1;
  const opp1 = f0;

  // ---- AI overrides human input for AI controlled slots ----
  const in0 = state.aiControlled[0] ? charOf(f0.charId).ai(state, f0, opp0) : inputs[0] & MASK;
  const in1 = state.aiControlled[1] ? charOf(f1.charId).ai(state, f1, opp1) : inputs[1] & MASK;

  // ---- hitstop: both fighters freeze, input is still recorded ----
  const frozen = f0.hitstop > 0 || f1.hitstop > 0;
  if (f0.hitstop > 0) f0.hitstop -= 1;
  if (f1.hitstop > 0) f1.hitstop -= 1;

  pushInput(f0, in0, state.frame);
  pushInput(f1, in1, state.frame);
  decodePad(f0);
  decodePad(f1);

  if (state.phase === 'intro') {
    state.timer = ROUND.frames;
    if (state.frame >= ROUND.introFrames) state.phase = 'fight';
  } else if (state.phase === 'fight') {
    if (state.timer > 0) state.timer -= 1;
    if (state.timer === 0) declareTimeout(state);
  } else if (state.phase === 'ko') {
    state.koTimer -= 1;
    if (state.koTimer <= 0) state.phase = 'over';
  }

  if (state.phase !== 'over') {
    updateFighter(state, f0, opp0, frozen);
    updateFighter(state, f1, opp1, frozen);
    if (!frozen) {
      resolveCombat(state);
      resolveShots(state);
      separate(f0, f1);
    }
    updateShots(state, frozen);
    for (let i = 0; i < 2; i++) {
      const f = state.fighters[i];
      charOf(f.charId).afterCombat?.(state, f, state.fighters[1 - i]);
    }
  }

  resolveKo(state);
  tickPresentation(state);
}

function updateFighter(
  state: MatchState,
  f: Fighter,
  opp: Fighter,
  frozen: boolean,
): void {
  const def = charOf(f.charId);
  f.stateFrame += 1;
  tickTimers(f);
  tickGuardMeter(f);
  if (!frozen) {
    updateStun(f);
    tickDash(f);
    tickStatuses(f);
  }

  // Character logic runs even during hitstop for timers that must not stall
  // (e.g. the Proxy of the Creator clock, immortal floor), but never starts moves.
  def.onFrame(state, f, opp);

  if (frozen) return;
  if (f.state === 'dead' || f.state === 'smiteDead') return;

  if (canAct(f)) {
    decodeLocalFacing(f, opp);
    def.onInput(state, f, opp);
  }
  updateMove(state, f);
  integrate(state, f);
}

function decodeLocalFacing(f: Fighter, opp: Fighter): void {
  if (f.move || f.state === 'dash' || f.state === 'airDash') return;
  const dx = opp.x - f.x;
  if (Math.abs(dx) > 4) f.facing = dx > 0 ? 1 : -1;
}

function updateShots(state: MatchState, frozen: boolean): void {
  for (let i = state.shots.length - 1; i >= 0; i--) {
    const s = state.shots[i];
    s.frame += 1;
    if (!frozen) {
      s.x += s.vx;
      s.y += s.vy;
      const sd = { gravity: 0 };
      void sd;
    }
    s.life -= 1;
    const outOfBounds = Math.abs(s.x) > 780 || s.y < -60 || s.y > 600;
    if (s.life <= 0 || outOfBounds) state.shots.splice(i, 1);
  }
}

function resolveKo(state: MatchState): void {
  if (state.koQueue.length === 0) return;
  const queued = state.koQueue.slice();
  state.koQueue.length = 0;
  for (const p of queued) {
    const loser = state.fighters[p];
    const winner = state.fighters[1 - p];
    if (loser.hp > 0) continue;
    const def = charOf(loser.charId);
    const survived = def.onDeath(state, loser, winner);
    if (survived) continue;
    const winDef = charOf(winner.charId);
    winDef.onOpponentDeath?.(state, winner, loser);
    declareKo(state, loser, 'ko');
  }
}

function tickPresentation(state: MatchState): void {
  advanceTextCue(state);
  if (state.shake > 0) state.shake = Math.max(0, state.shake - 1.6);
  if (state.stormFlash > 0) {
    state.stormFlash = Math.max(0, state.stormFlash - state.stormFlashDecay);
  }
  if (state.silence > 0) state.silence = Math.max(0, state.silence - 1 / FPS);
}

/** Convenience for tests/tools: run N frames of a scripted input function. */
export function runFrames(
  state: MatchState,
  frames: number,
  inputFn: (frame: number, p: 0 | 1) => number,
): void {
  for (let i = 0; i < frames; i++) {
    step(state, [inputFn(state.frame, 0), inputFn(state.frame, 1)]);
  }
}

export { applyGuardCrush };
