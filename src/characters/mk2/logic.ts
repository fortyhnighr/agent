/**
 * MK. 2 FRAME LOGIC.
 *
 * Form 1 selection, strict requirement gating, Divine Charge spending, the
 * Perfect Phase detector, execution sequences, the Proxy clock, the immortal
 * floor and the forced death.
 */

import { moveOf } from '../../sim/registry';
import { stacks, consumeStatus } from '../../sim/statuses';
import { airDashAvailable, sharedLocomotion, startDash } from '../../sim/physics';
import { canAct, emit, startMove } from '../../sim/actions';
import { holdFrames, held, motionDownForward, pressed } from '../../sim/input';
import { CHARGE, CK, F1, F2, SPLITTER } from './constants';
import { attunement, canAfford, charge, isForm2, loseCharge, spendCharge } from './state';
import { checkPerfectPhase, tickJudgementBolts } from './hooks';
import { tickSequence } from './sequence';
import { SMITE_NONE, startSmite, tickSmite } from './secondLife';
import { guardMult, incomingMult, outgoingMult } from './statuses';
import type { DamageContext, Fighter, GuardContext, MatchState } from '../../sim/types';

/* ------------------------------------------------------------------ */
/* Requirement gate                                                   */
/* ------------------------------------------------------------------ */

/**
 * `requires.targetStacks` is an OR list: at least one listed condition must
 * hold. (Thunderline: 2 Conductive OR a Mark. Might: a Mark OR 3 Divine Shock.)
 */
export function meetsRequirements(
  self: Fighter,
  opp: Fighter,
  moveId: string,
): boolean {
  const def = moveOf(moveId);
  const r = def.requires;
  if (!r) return true;
  if (r.form !== undefined && self.char[CK.form] !== r.form) return false;
  if (r.primary !== undefined && !canAfford(self, r.primary)) return false;
  if (r.tier !== undefined && attunement(self) < r.tier) return false;
  if (r.selfStacks) {
    for (const key in r.selfStacks) {
      if (stacks(self, key) < (r.selfStacks[key] ?? 0)) return false;
    }
  }
  if (r.charFlags) {
    for (const key in r.charFlags) {
      if ((self.char[key] ?? 0) < (r.charFlags[key] ?? 0)) return false;
    }
  }
  if (r.targetStacks) {
    let any = false;
    for (const key in r.targetStacks) {
      if (stacks(opp, key) >= (r.targetStacks[key] ?? 0)) any = true;
    }
    if (!any) return false;
  }
  return true;
}

export function canAffordCost(self: Fighter, opp: Fighter, moveId: string): boolean {
  const def = moveOf(moveId);
  const cost = def.cost;
  if (!cost) return true;
  if (cost.primary !== undefined && !canAfford(self, cost.primary)) return false;
  if (cost.consume) {
    for (const key in cost.consume) {
      if (stacks(opp, key) < (cost.consume[key] ?? 0)) return false;
    }
  }
  return true;
}

/** Strict gate: requirements AND affordability. No pity versions. */
export function canUse(self: Fighter, opp: Fighter, moveId: string): boolean {
  return meetsRequirements(self, opp, moveId) && canAffordCost(self, opp, moveId);
}

/** Starts a move if the player has actually earned it. */
export function tryStart(
  state: MatchState,
  self: Fighter,
  opp: Fighter,
  moveId: string,
  vars: Record<string, number> = {},
): boolean {
  if (!canAct(self)) return false;
  if (!canUse(self, opp, moveId)) return false;
  const def = moveOf(moveId);
  if (def.cost?.primary !== undefined) {
    if (!spendCharge(self, def.cost.primary)) return false;
  }
  if (def.cost?.consume) {
    for (const key in def.cost.consume) {
      const n = def.cost.consume[key] ?? 0;
      if (n > 0) consumeStatus(opp, key, n);
    }
  }
  if (def.cost?.primary !== undefined && def.cost.primary > 0) {
    emit(state, 'vfx', 'chargeSpend', self.x, self.y + 96, def.cost.primary);
    emit(state, 'sfx', 'chargeSpend', self.x, 0, 0);
  }
  startMove(self, moveId, vars);
  return true;
}

/* ------------------------------------------------------------------ */
/* Form 1 / Form 2 selection                                          */
/* ------------------------------------------------------------------ */

export function selectSplitter(self: Fighter, opp: Fighter): string | null {
  if (!canAfford(self, SPLITTER.min)) return null;
  if (attunement(self) >= SPLITTER.ex.attunement && stacks(opp, 'heavensMark') >= 1) {
    if (canUse(self, opp, F1.splitterEx)) return F1.splitterEx;
  }
  if (charge(self) >= SPLITTER.t3.min && canUse(self, opp, F1.splitter3)) return F1.splitter3;
  if (charge(self) >= SPLITTER.t2.min && canUse(self, opp, F1.splitter2)) return F1.splitter2;
  if (charge(self) >= SPLITTER.t1.min && canUse(self, opp, F1.splitter1)) return F1.splitter1;
  return null;
}

export function selectForm2Ultimate(self: Fighter, opp: Fighter): string | null {
  if (canUse(self, opp, F2.mightOfCreator)) return F2.mightOfCreator;
  return F2.creatorRefineMe;
}

function startForm1(state: MatchState, self: Fighter, opp: Fighter): boolean {
  // Ultimate
  if (pressed(self, 'R')) {
    const pick = selectSplitter(self, opp);
    if (pick) return tryStart(state, self, opp, pick);
  }
  // Punish move - strict, no pity version
  if (pressed(self, 'P') && canUse(self, opp, F1.judgementBolt)) {
    return tryStart(state, self, opp, F1.judgementBolt);
  }
  // Heaven's Array
  if (pressed(self, 'O') && motionDownForward(self) && canUse(self, opp, F1.heavensArray)) {
    return tryStart(state, self, opp, F1.heavensArray);
  }
  // Heavenfall
  if (pressed(self, 'U')) {
    if (canUse(self, opp, F1.heavenfallRiseEnhanced)) {
      return tryStart(state, self, opp, F1.heavenfallRiseEnhanced, { scale: 1.15 });
    }
    if (canUse(self, opp, F1.heavenfallRise)) {
      return tryStart(state, self, opp, F1.heavenfallRise, { scale: 1 });
    }
  }
  // Railspear: tap = committed thrust, hold 24f = charge into a Charge level.
  if (held(self, 'L')) {
    if (holdFrames(self, 'L') >= RAILSPEAR_HOLD) {
      if (canUse(self, opp, F1.railspearL2)) return tryStart(state, self, opp, F1.railspearL2);
      if (canUse(self, opp, F1.railspearL1)) return tryStart(state, self, opp, F1.railspearL1);
      if (canUse(self, opp, F1.railspear)) return tryStart(state, self, opp, F1.railspear);
    }
    // Committed to the charge: do not drift into another action.
    return false;
  }
  if (justTapped(self, 'L', RAILSPEAR_HOLD) && canUse(self, opp, F1.railspear)) {
    return tryStart(state, self, opp, F1.railspear);
  }
  // Thunderline
  if (pressed(self, 'O')) {
    if (canUse(self, opp, F1.thunderlineEnhanced)) {
      return tryStart(state, self, opp, F1.thunderlineEnhanced);
    }
    if (canUse(self, opp, F1.thunderline)) {
      return tryStart(state, self, opp, F1.thunderline);
    }
  }
  // Flash Phase
  if (pressed(self, 'I') && canUse(self, opp, F1.flashPhase)) {
    return tryStart(state, self, opp, F1.flashPhase);
  }
  // Normals
  if (pressed(self, 'K') && canUse(self, opp, F1.streakLunge)) {
    return tryStart(state, self, opp, F1.streakLunge);
  }
  if (pressed(self, 'J') && canUse(self, opp, F1.flashThrust)) {
    return tryStart(state, self, opp, F1.flashThrust);
  }
  return false;
}

function startForm2(state: MatchState, self: Fighter, opp: Fighter): boolean {
  // THE UNRELENTING MIGHT OF THE CREATOR / CREATOR! REFINE ME!
  if (pressed(self, 'R')) {
    const pick = selectForm2Ultimate(self, opp);
    if (pick) return tryStart(state, self, opp, pick);
  }
  if (pressed(self, 'P') && canUse(self, opp, F2.judgementCreator)) {
    return tryStart(state, self, opp, F2.judgementCreator);
  }
  if (pressed(self, 'O') && motionDownForward(self) && canUse(self, opp, F2.unrelentingMight)) {
    return tryStart(state, self, opp, F2.unrelentingMight);
  }
  if (pressed(self, 'U') && canUse(self, opp, F2.decapitate)) {
    return tryStart(state, self, opp, F2.decapitate);
  }
  if (held(self, 'L')) {
    if (holdFrames(self, 'L') >= RAILSPEAR_HOLD) {
      if (canUse(self, opp, F2.smiteFallCharged)) return tryStart(state, self, opp, F2.smiteFallCharged);
      if (canUse(self, opp, F2.smiteFall)) return tryStart(state, self, opp, F2.smiteFall);
    }
    return false;
  }
  if (justTapped(self, 'L', RAILSPEAR_HOLD) && canUse(self, opp, F2.smiteFall)) {
    return tryStart(state, self, opp, F2.smiteFall);
  }
  if (pressed(self, 'O') && canUse(self, opp, F2.andShowYou)) {
    return tryStart(state, self, opp, F2.andShowYou);
  }
  if (pressed(self, 'I') && canUse(self, opp, F2.ahCreator)) {
    return tryStart(state, self, opp, F2.ahCreator);
  }
  if (pressed(self, 'K') && canUse(self, opp, F2.smiteMedium)) {
    return tryStart(state, self, opp, F2.smiteMedium);
  }
  if (pressed(self, 'J') && canUse(self, opp, F2.smite)) {
    return tryStart(state, self, opp, F2.smite);
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* CharacterDef entry points                                          */
/* ------------------------------------------------------------------ */

export function onFrame(state: MatchState, self: Fighter, opp: Fighter): void {
  // The judgement timeline owns the frame while it runs.
  if (self.char[CK.smitePhase] !== SMITE_NONE) {
    tickSmite(state, self, opp);
    return;
  }

  if (self.char[CK.form] === 2) {
    if (self.char[CK.proxyTimer] > 0) {
      self.char[CK.proxyTimer] -= 1;
      if (self.char[CK.proxyTimer] === 0 && opp.hp > 0) startSmite(state, self, opp);
    }
  } else if (state.storm > 0) {
    state.storm = Math.max(0, state.storm - 0.02);
  }

  // Perfect Phase: an incoming hit inside the window becomes gold lightning.
  checkPerfectPhase(state, self, opp);

  // Judgement Bolt cadence.
  tickJudgementBolts(state, self, opp);

  // Execution sequences.
  tickSequence(state, self, opp);
}

/** Runs after hit resolution: nothing may kill him while the blessing lives. */
export function afterCombat(_state: MatchState, self: Fighter, _opp: Fighter): void {
  if (self.char[CK.form] === 2 && self.char[CK.proxyTimer] > 0 && self.char[CK.smitePhase] === SMITE_NONE) {
    if (self.hp < 1) self.hp = 1;
  }
}

/** Frames the L button must be held to open the charge levels. */
const RAILSPEAR_HOLD = 24;

/** A tap: pressed and released inside `window` frames, released on this frame. */
function justTapped(self: Fighter, key: string, window: number): boolean {
  const rel = self.lastRelease[key] ?? -1;
  const press = self.lastPress[key] ?? -1;
  if (rel < 0 || press < 0) return false;
  if (self.inputFrame - rel > 1) return false;
  return rel - press < window;
}

/** A move owns the state machine while it is running. */
function f_move_active(self: Fighter): boolean {
  return self.move === null;
}

/** Getting hit costs Divine Charge. Blocking forever earns nothing and loses it. */
export function onDamaged(
  _state: MatchState,
  self: Fighter,
  _opp: Fighter,
  _amount: number,
  blocked: boolean,
): void {
  if (blocked) return;
  loseCharge(self, CHARGE.lossOnHit);
}

export function onInput(state: MatchState, self: Fighter, opp: Fighter): void {
  if (self.char[CK.smitePhase] !== SMITE_NONE) return;
  if (self.state === 'smiteDead' || self.state === 'dead') return;

  const started = isForm2(self) ? startForm2(state, self, opp) : startForm1(state, self, opp);
  if (started) return;

  // Air dash (Static Lock removes it entirely).
  if (!self.onGround && (self.padDashF || self.padDashB) && airDashAvailable(self)) {
    const dir = self.padDashF ? 1 : -1;
    startDash(self, dir, 'air', 10.6);
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

/* Character damage pipeline ---------------------------------------- */

export function outgoingMods(ctx: DamageContext): number {
  return outgoingMult(ctx);
}

export function incomingMods(ctx: DamageContext): number {
  return incomingMult(ctx);
}

export function guardMods(ctx: GuardContext): number {
  return guardMult(ctx);
}

