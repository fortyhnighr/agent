/**
 * SECOND LIFE.
 *
 * Mk. 2 dies and begs his engineer - the stickman Creator - to refine him.
 * The phrase accidentally becomes a prayer. The WRONG Creator answers.
 *
 * He is not guaranteed this. He has to earn it:
 *   - Attunement 3            (30 cumulative Divine Charge spent)
 *   - 30+ cumulative spend
 *   - 2+ Heaven's Marks applied
 * Die without qualifying and he simply dies.
 *
 * PROXY OF THE CREATOR then makes him immortal for a few seconds. It is not a
 * defensive second life, it is a divine execution window. Waste it and The
 * Creator withdraws the blessing and erases him.
 */

import { declareKo, emit, setState, setTextCue, shake } from '../../sim/actions';
import { stacks } from '../../sim/statuses';
import { CK, SECOND_LIFE } from './constants';
import { attunement, cumSpend } from './state';
import { applyDivineShock } from './statuses';
import type { Fighter, MatchState } from '../../sim/types';

export const SMITE_NONE = 0;
export const SMITE_WORD = 1;
export const SMITE_PILLAR = 2;
export const SMITE_DEATH = 3;

export function qualifiesForSecondLife(self: Fighter): boolean {
  if (self.char[CK.form] === 2) return false;
  return (
    attunement(self) >= SECOND_LIFE.attunement &&
    cumSpend(self) >= SECOND_LIFE.cumSpend &&
    (self.char[CK.marksApplied] ?? 0) >= SECOND_LIFE.marksApplied
  );
}

export function qualificationReport(self: Fighter): {
  attunement: boolean;
  spend: boolean;
  marks: boolean;
} {
  return {
    attunement: attunement(self) >= SECOND_LIFE.attunement,
    spend: cumSpend(self) >= SECOND_LIFE.cumSpend,
    marks: (self.char[CK.marksApplied] ?? 0) >= SECOND_LIFE.marksApplied,
  };
}

/** onDeath hook: returns true when the blessing takes over. */
export function onDeath(state: MatchState, self: Fighter, opp: Fighter): boolean {
  if (!qualifiesForSecondLife(self)) {
    emit(state, 'banner', 'noSecondLife', self.player, 0, 0, 'He asked for nothing and received it.');
    return false;
  }
  activateProxy(state, self, opp);
  return true;
}

export function activateProxy(state: MatchState, self: Fighter, opp: Fighter): void {
  self.char[CK.form] = 2;
  self.char[CK.proxyTimer] = SECOND_LIFE.proxyFrames;
  self.char[CK.smitePhase] = SMITE_NONE;
  self.char[CK.smiteFrame] = 0;
  self.hp = 1;
  self.hitstun = 0;
  self.blockstun = 0;
  self.hitstop = 0;
  self.move = null;
  self.dmgScale = 1;
  self.invuln = 48;
  self.juggle = 0;
  self.comboHits = 0;
  setState(self, 'idle');
  self.char[CK.charge] = Math.max(self.char[CK.charge] ?? 0, SECOND_LIFE.startCharge);
  applyDivineShock(opp, SECOND_LIFE.startShock);

  // The arena does not decide to storm. The arena reacts.
  state.storm = 1;
  state.stormFlash = 1;
  state.stormFlashDecay = 0.02;
  shake(state, 26);
  setTextCue(state, 'CREATOR! REFINE ME!', '...the wrong one answered.', 70);
  emit(state, 'banner', 'proxyStart', self.player, 0, 0, 'PROXY OF THE CREATOR');
  emit(state, 'vfx', 'proxyStart', self.x, self.y + 60, 1);
  emit(state, 'sfx', 'proxyStart', self.x, 0, 0);
}

/** The opponent died while the blessing was live: the contract is fulfilled. */
export function onOpponentDeath(state: MatchState, self: Fighter, loser: Fighter): void {
  if (self.char[CK.form] !== 2) return;
  self.char[CK.proxyKills] = (self.char[CK.proxyKills] ?? 0) + 1;
  self.char[CK.proxyTimer] = 0;
  state.storm = 0;
  setTextCue(state, 'PROXY OF THE CREATOR', 'Fulfilled.', 90);
  emit(state, 'banner', 'proxySuccess', self.player, 0, 0, 'The contract was fulfilled.');
  emit(state, 'sfx', 'proxySuccess', self.x, 0, 0);
  void loser;
}

/** Blessing expired without a kill: the storm stops and God says one word. */
export function startSmite(state: MatchState, self: Fighter, opp: Fighter): void {
  if (self.char[CK.smitePhase] !== SMITE_NONE) return;
  if (opp.hp <= 0) return;
  self.char[CK.smitePhase] = SMITE_WORD;
  self.char[CK.smiteFrame] = 0;
  self.move = null;
  self.dmgScale = 1;
  self.invuln = 0;
  self.armor = 0;
  setState(self, 'idle');
  // The storm does not fade. It stops.
  state.storm = 0;
  state.stormFlash = 0;
  state.shake = 0;
  state.silence = 1;
  setTextCue(state, 'Fool.', 'The Creator speaks.', 120);
  emit(state, 'banner', 'fool', self.player, 0, 0, 'Fool.');
}

/** The smite timeline. Returns true while the sequence is running. */
export function tickSmite(state: MatchState, self: Fighter, opp: Fighter): boolean {
  const phase = self.char[CK.smitePhase] ?? 0;
  if (phase === SMITE_NONE) return false;
  // Killing the target at the buzzer still fulfils the contract.
  if (opp.hp <= 0) {
    self.char[CK.smitePhase] = SMITE_NONE;
    self.char[CK.smiteFrame] = 0;
    return false;
  }
  const frame = (self.char[CK.smiteFrame] ?? 0) + 1;
  self.char[CK.smiteFrame] = frame;

  if (phase === SMITE_WORD) {
    if (frame === SECOND_LIFE.smiteAt) {
      self.char[CK.smitePhase] = SMITE_PILLAR;
      self.char[CK.smiteFrame] = 0;
      state.smitePillar = SECOND_LIFE.pillarFrames;
      state.silence = 0;
      shake(state, 40);
      emit(state, 'vfx', 'creatorSmite', self.x, self.y, 1);
      emit(state, 'sfx', 'creatorSmite', self.x, 0, 0);
    }
    return true;
  }

  if (phase === SMITE_PILLAR) {
    if (frame >= SECOND_LIFE.pillarFrames) {
      self.char[CK.smitePhase] = SMITE_DEATH;
      self.char[CK.smiteFrame] = 0;
      // A forced divine death: not damage, not a hit. Erasure.
      self.hp = 0;
      setState(self, 'smiteDead');
      self.hitstun = 0;
      declareKo(state, self, 'smitten');
      emit(state, 'banner', 'smitten', self.player, 0, 0, 'The Creator withdrew His proxy.');
    }
    return true;
  }
  return true;
}

/** Human readable blessing timer for the HUD. */
export function proxySeconds(self: Fighter): number {
  return (self.char[CK.proxyTimer] ?? 0) / 60;
}

export function markStacksOn(target: Fighter): number {
  return stacks(target, 'heavensMark');
}
