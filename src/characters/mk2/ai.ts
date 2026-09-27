/**
 * MK. 2 AI.
 *
 * It understands the whole engine: Divine Charge, Attunement, cumulative
 * spend, every status, Perfect Phase, strict requirements and the transformed
 * Form 2 kit. It never reads future input - it observes the current frame and
 * pays a real reaction delay before it is allowed to defend.
 *
 * Form 1: build -> layer -> spend -> cash out.
 * Form 2: one job. Kill them before God judges me.
 */

import { BTN } from '../../sim/const';
import { moveOf } from '../../sim/registry';
import { stacks } from '../../sim/statuses';
import { distanceBetween } from '../../sim/actions';
import { mix32 } from '../../sim/rng';
import { CK, F1, F2, SPLITTER } from './constants';
import { attunement, charge, cumSpend, isForm2, proxyActive } from './state';
import { canUse, tryStart } from './logic';
import type { Fighter, MatchState } from '../../sim/types';

const REACT_DELAY = 7;

const PLAN_APPROACH = 1;
const PLAN_PRESSURE = 2;
const PLAN_PUNISH = 3;
const PLAN_ANTIAIR = 4;
const PLAN_SETUP = 5;
const PLAN_CASHOUT = 6;
const PLAN_PHASE = 7;
const PLAN_KILL = 8;

const range = (a: Fighter, b: Fighter): number => distanceBetween(a, b);

function forwardBit(self: Fighter): number {
  return self.facing === 1 ? BTN.RIGHT : BTN.LEFT;
}

function backBit(self: Fighter): number {
  return self.facing === 1 ? BTN.LEFT : BTN.RIGHT;
}

/** Deterministic "coin" - no Math.random anywhere in the AI. */
function roll(self: Fighter, state: MatchState, n: number): number {
  return mix32((self.ai.think | 0) + 1, (state.frame | 0) + 7) % n;
}

function markCount(opp: Fighter): number {
  return stacks(opp, 'heavensMark');
}

function conductive(opp: Fighter): number {
  return stacks(opp, 'conductive');
}

function shock(opp: Fighter): number {
  return stacks(opp, 'divineShock');
}

function opponentAttacking(opp: Fighter): boolean {
  return !!opp.move;
}

function opponentVulnerable(opp: Fighter): boolean {
  return opp.hitstun > 0 || opp.blockstun > 0 || opp.state === 'guardBreak';
}

/**
 * Charge discipline: a good Mk. 2 banks Divine Charge toward the execution
 * instead of spending every scrap on specials. Punishing is free spending.
 */
const RESERVE = 6;
function reserveOk(self: Fighter, opp: Fighter, cost: number): boolean {
  if (opponentVulnerable(opp)) return true;
  if (opp.hp / opp.maxHp < 0.3) return true;
  return charge(self) - cost >= RESERVE;
}

/** Reaction bookkeeping: the AI can only defend after its reaction delay. */
function observe(self: Fighter, state: MatchState, opp: Fighter): void {
  if (opponentAttacking(opp)) {
    if (self.ai.oppStartup === 0) {
      self.ai.oppStartup = 1;
      self.ai.react = REACT_DELAY;
    }
  }
  if (self.ai.oppStartup === 1) {
    self.ai.react -= 1;
    if (self.ai.react <= 0) {
      self.ai.oppStartup = 0;
      self.ai.seen = 1;
      self.ai.oppStartup = 0;
    }
  }
  if (!opponentAttacking(opp)) {
    self.ai.seen = 0;
    self.ai.oppStartup = 0;
    self.ai.react = 0;
  }
  self.ai.think = state.frame;
  self.ai.lastOppState = opp.state === 'hitstun' ? 1 : opp.state === 'blockstun' ? 2 : 0;
}

function choosePlan(self: Fighter, state: MatchState, opp: Fighter): number {
  const d = range(self, opp);
  const c = charge(self);
  const a = attunement(self);
  const marked = markCount(opp);
  const cond = conductive(opp);
  const locked = stacks(opp, 'staticLock') > 0;
  const hpEdge = opp.hp / opp.maxHp;

  if (isForm2(self)) {
    // Form 2: no patience, no retreat, no spacing games.
    if (opp.hitstun > 0 || opp.blockstun > 0) return PLAN_PUNISH;
    if (d > 150) return PLAN_APPROACH;
    return PLAN_KILL;
  }

  // Defence: only with permission from the reaction timer.
  if (opponentAttacking(opp) && self.ai.seen === 1) {
    if (d < 200 && roll(self, state, 100) < 46) return PLAN_PHASE;
  }

  if (opp.y > 60 && d < 190) return PLAN_ANTIAIR;

  if (opponentVulnerable(opp)) {
    if (c >= JUDGEMENT_COST && marked >= 1) return PLAN_CASHOUT;
    if (c >= SPLITTER.t1.min && (hpEdge < 0.45 || opp.state === 'guardBreak')) return PLAN_CASHOUT;
    return PLAN_PUNISH;
  }

  // Cash out from neutral when the setup is right.
  // Cash out: the mark is there, or the machine is fully attuned.
  if (c >= SPLITTER.t3.min && (marked >= 1 || a >= 3) && d < 300) return PLAN_CASHOUT;
  if (c >= SPLITTER.t1.min && hpEdge < 0.3 && d < 300) return PLAN_CASHOUT;

  if (d > 190) {
    // Rebuild the engine from range: walk in, dash occasionally.
    return c < SPLITTER.t2.min ? PLAN_APPROACH : PLAN_SETUP;
  }

  if (c < 4 || (c < SPLITTER.min && a < ATTUNE_MAX)) {
    // Early game: build charge on clean hits, do not waste it.
    return PLAN_PRESSURE;
  }

  if (locked) {
    // The target cannot escape: convert the setup into damage.
    return cond >= 2 || marked >= 1 ? PLAN_PRESSURE : PLAN_SETUP;
  }

  // No mark yet and enough banked: buy one with Heaven's Array.
  if (marked < 1 && c >= 12) return PLAN_SETUP;

  return PLAN_PRESSURE;
}

const JUDGEMENT_COST = 5;
const ATTUNE_MAX = 3;

/** Fallback pressure when a setup plan cannot find its target. */
function PLAN_PRESSURE_FALLBACK(
  state: MatchState,
  self: Fighter,
  opp: Fighter,
  out: number,
): number {
  if (range(self, opp) < 120 && roll(self, state, 100) < 62) {
    if (tryStart(state, self, opp, F1.flashThrust)) return 0;
  }
  out |= forwardBit(self);
  return out;
}

function planLength(self: Fighter, state: MatchState, plan: number): number {
  switch (plan) {
    case PLAN_PRESSURE:
      return 14 + roll(self, state, 12);
    case PLAN_APPROACH:
      return 18 + roll(self, state, 16);
    case PLAN_PUNISH:
      return 12;
    case PLAN_CASHOUT:
      return 4;
    case PLAN_SETUP:
      return 26;
    case PLAN_PHASE:
      return 10;
    case PLAN_ANTIAIR:
      return 8;
    case PLAN_KILL:
      return 10 + roll(self, state, 8);
    default:
      return 10;
  }
}

/* ------------------------------------------------------------------ */
/* Form 1 behaviour                                                   */
/* ------------------------------------------------------------------ */

function form1Action(
  state: MatchState,
  self: Fighter,
  opp: Fighter,
  out: number,
): number {
  // A running move owns the decision: no re-rolling mid-swing.
  if (self.move) return out;
  const d = range(self, opp);
  const c = charge(self);
  const marked = markCount(opp);
  const cond = conductive(opp);
  const a = attunement(self);
  const plan = self.ai.plan;

  if (plan === PLAN_PHASE) {
    if (canUse(self, opp, F1.flashPhase) && d < 240) {
      if (tryStart(state, self, opp, F1.flashPhase)) return 0;
    }
    out |= BTN.GUARD;
    return out;
  }

  if (plan === PLAN_ANTIAIR) {
    if (canUse(self, opp, F1.heavenfallRiseEnhanced) && c >= 6) {
      if (tryStart(state, self, opp, F1.heavenfallRiseEnhanced, { scale: 1.15 })) return 0;
    }
    if (canUse(self, opp, F1.heavenfallRise)) {
      if (tryStart(state, self, opp, F1.heavenfallRise, { scale: 1 })) return 0;
    }
    if (canUse(self, opp, F1.thunderline) && d > 120) {
      if (tryStart(state, self, opp, F1.thunderline)) return 0;
    }
    out |= backBit(self);
    return out;
  }

  if (plan === PLAN_CASHOUT) {
    if (c >= JUDGEMENT_COST && marked >= 1 && d < 320 && roll(self, state, 100) < 55) {
      if (tryStart(state, self, opp, F1.judgementBolt)) return 0;
    }
    if (c >= SPLITTER.min) {
      if (marked >= 1 && a >= 3 && c >= SPLITTER.ex.min) {
        if (tryStart(state, self, opp, F1.splitterEx)) return 0;
      }
      if (c >= SPLITTER.t3.min && tryStart(state, self, opp, F1.splitter3)) return 0;
      if (c >= SPLITTER.t2.min && tryStart(state, self, opp, F1.splitter2)) return 0;
      if (c >= SPLITTER.t1.min && tryStart(state, self, opp, F1.splitter1)) return 0;
    }
  }

  if (plan === PLAN_SETUP) {
    // Heaven's Array is how a mark gets bought: 5 lines, all 5 = Mark.
    // It is fired from range so every line crosses the body.
    if (c >= 12 && marked < 1 && roll(self, state, 100) < 60) {
      if (tryStart(state, self, opp, F1.heavensArray)) return 0;
    }
    if (c >= SPLITTER.t2.min && marked >= 1) {
      if (c >= SPLITTER.t3.min && tryStart(state, self, opp, F1.splitter3)) return 0;
      if (tryStart(state, self, opp, F1.splitter2)) return 0;
    }
    if (d > 170) {
      out |= forwardBit(self);
      return out;
    }
    return PLAN_PRESSURE_FALLBACK(state, self, opp, out);
  }

  if (plan === PLAN_APPROACH) {
    if (d > 220) {
      out |= forwardBit(self);
      if (roll(self, state, 100) < 18) out |= BTN.GUARD;
      return out;
    }
    if (d > 120) {
      if (markCount(opp) >= 1 && c >= 6 && canUse(self, opp, F1.thunderlineEnhanced)) {
        if (tryStart(state, self, opp, F1.thunderlineEnhanced)) return 0;
      }
      if (canUse(self, opp, F1.thunderline) && d > 130) {
        if (tryStart(state, self, opp, F1.thunderline)) return 0;
      }
      if (canUse(self, opp, F1.streakLunge)) {
        if (tryStart(state, self, opp, F1.streakLunge)) return 0;
      }
    }
    out |= forwardBit(self);
    return out;
  }

  // Pressure / punish: the actual damage loop.
  // Conductive at 3+ converts into Static Lock through Heavenfall.
  if (cond >= 3 && d < 200 && plan !== PLAN_PUNISH && roll(self, state, 100) < 30) {
    if (canUse(self, opp, F1.heavenfallRiseEnhanced) && c >= 6 && reserveOk(self, opp, 6)) {
      if (tryStart(state, self, opp, F1.heavenfallRiseEnhanced, { scale: 1.15 })) return 0;
    }
    if (canUse(self, opp, F1.heavenfallRise) && c < 6) {
      if (tryStart(state, self, opp, F1.heavenfallRise, { scale: 1 })) return 0;
    }
  }

  if (d < 130) {
    if (plan === PLAN_PUNISH && c >= 8 && c < SPLITTER.min && marked >= 1) {
      if (tryStart(state, self, opp, F1.railspearL1)) return 0;
    }
    if (
      c >= 8 &&
      marked >= 1 &&
      stacks(opp, 'pierced') >= 1 &&
      roll(self, state, 100) < 35 &&
      reserveOk(self, opp, 8)
    ) {
      if (tryStart(state, self, opp, F1.railspearL2)) return 0;
    }
    // The aligned Thunderline is a payoff, not a poke: without a Mark it just
    // burns Charge the machine needs for the execution.
    if (marked >= 1 && roll(self, state, 100) < 45 && reserveOk(self, opp, 4)) {
      if (tryStart(state, self, opp, F1.thunderlineEnhanced)) return 0;
    }
    if (
      plan === PLAN_PUNISH &&
      c >= 4 &&
      marked >= 1 &&
      roll(self, state, 100) < 40 &&
      reserveOk(self, opp, 4)
    ) {
      if (tryStart(state, self, opp, F1.railspearL1)) return 0;
    }
    if (roll(self, state, 100) < 62) {
      if (tryStart(state, self, opp, F1.flashThrust)) return 0;
    }
    if (d < 96 && roll(self, state, 100) < 45) {
      if (tryStart(state, self, opp, F1.streakLunge)) return 0;
    }
  }
  if (d > 130) out |= forwardBit(self);
  return out;
}

/* ------------------------------------------------------------------ */
/* Form 2 behaviour                                                   */
/* ------------------------------------------------------------------ */

function form2Action(state: MatchState, self: Fighter, opp: Fighter, out: number): number {
  // Already committed to something: the form has no patience for re-deciding.
  if (self.move) return out;
  const d = range(self, opp);
  const timer = self.char[CK.proxyTimer] ?? 0;
  const a = attunement(self);
  const marked = markCount(opp);
  const sh = shock(opp);
  const hpEdge = opp.hp / opp.maxHp;
  const plan = self.ai.plan;

  // Last chance: the blessing is about to be withdrawn and has to be cashed.
  const panic = timer <= 110;
  const finisherReady = self.ai.finisherUsed === 0;
  const lethalWindow = hpEdge < 0.55 || panic;

  if (lethalWindow && finisherReady) {
    if (canUse(self, opp, F2.mightOfCreator) && a >= 3 && d < 420) {
      if (tryStart(state, self, opp, F2.mightOfCreator)) {
        self.ai.finisherUsed = 1;
        return 0;
      }
    }
    if (hpEdge < 0.4 || panic) {
      if (tryStart(state, self, opp, F2.creatorRefineMe)) {
        self.ai.finisherUsed = 1;
        return 0;
      }
    }
  }

  if (plan === PLAN_CASHOUT && tryStart(state, self, opp, F2.judgementCreator)) return 0;

  if (d > 170) {
    // Close the gap personally. No walking backwards, ever.
    if (roll(self, state, 100) < 70 && canUse(self, opp, F2.ahCreator)) {
      if (tryStart(state, self, opp, F2.ahCreator)) return 0;
    }
    if (d < 340 && canUse(self, opp, F2.decapitate)) {
      if (tryStart(state, self, opp, F2.decapitate)) return 0;
    }
    if (roll(self, state, 100) < 85) {
      if (tryStart(state, self, opp, F2.smiteMedium)) return 0;
    }
    out |= forwardBit(self);
    return out;
  }

  // Point blank: hit them with everything.
  if (sh >= 2 && roll(self, state, 100) < 30 && d > 90) {
    if (tryStart(state, self, opp, F2.unrelentingMight)) return 0;
  }
  if (sh >= 1 && roll(self, state, 100) < 26) {
    if (tryStart(state, self, opp, F2.judgementCreator)) return 0;
  }
  if (charge(self) >= 4 && roll(self, state, 100) < 28) {
    if (tryStart(state, self, opp, F2.smiteFallCharged)) return 0;
  }
  if (marked === 0 && roll(self, state, 100) < 22) {
    if (tryStart(state, self, opp, F2.andShowYou)) return 0;
  }
  if (roll(self, state, 100) < 40) {
    if (tryStart(state, self, opp, F2.smiteFall)) return 0;
  }
  if (roll(self, state, 100) < 55) {
    if (tryStart(state, self, opp, F2.decapitate)) return 0;
  }
  if (roll(self, state, 100) < 78) {
    if (tryStart(state, self, opp, F2.smite)) return 0;
  }
  out |= forwardBit(self);
  return out;
}

/* ------------------------------------------------------------------ */

export function mk2AI(state: MatchState, self: Fighter, opp: Fighter): number {
  if (self.state === 'smiteDead' || self.state === 'dead') return 0;
  observe(self, state, opp);

  self.ai.planFrame -= 1;
  const plan = self.ai.plan;
  const expired = self.ai.planFrame <= 0;
  if (expired) {
    const next = choosePlan(self, state, opp);
    self.ai.plan = next;
    self.ai.planFrame = planLength(self, state, next);
    void plan;
  }

  let out = 0;
  // Guard discipline: hold guard while the opponent is pressuring and the AI
  // has no better answer, but never block forever (no charge from blocking).
  if (opponentAttacking(opp) && self.ai.seen === 1 && roll(self, state, 100) < 30) {
    out |= BTN.GUARD;
  }

  if (proxyActive(self)) {
    out = form2Action(state, self, opp, out);
  } else {
    out = form1Action(state, self, opp, out);
  }

  // Never mash: if a move is already running, hold the current plan.
  if (self.move && self.move.frame < moveOf(self.move.id).startup) return out & (BTN.GUARD | BTN.LEFT | BTN.RIGHT);
  return out & 0x1fff;
}

/** Exposed for tests: is this AI input legal for the current state? */
export function aiInputIsLegal(self: Fighter, opp: Fighter, input: number): boolean {
  const buttons: [string, number][] = [
    ['J', BTN.J],
    ['K', BTN.K],
    ['L', BTN.L],
    ['I', BTN.I],
    ['U', BTN.U],
    ['O', BTN.O],
    ['P', BTN.P],
    ['R', BTN.R],
  ];
  for (const [key, bit] of buttons) {
    if ((input & bit) === 0) continue;
    if (!legalMoveFor(self, opp, key)) return false;
  }
  return true;
}

function legalMoveFor(self: Fighter, opp: Fighter, key: string): boolean {
  const f2 = isForm2(self);
  switch (key) {
    case 'J':
      return canUse(self, opp, f2 ? F2.smite : F1.flashThrust);
    case 'K':
      return canUse(self, opp, f2 ? F2.smiteMedium : F1.streakLunge);
    case 'L':
      return canUse(self, opp, f2 ? F2.smiteFall : F1.railspear);
    case 'I':
      return canUse(self, opp, f2 ? F2.ahCreator : F1.flashPhase);
    case 'U':
      return canUse(self, opp, f2 ? F2.decapitate : F1.heavenfallRise);
    case 'O':
      return canUse(self, opp, f2 ? F2.andShowYou : F1.thunderline);
    case 'P':
      return canUse(self, opp, f2 ? F2.judgementCreator : F1.judgementBolt);
    case 'R': {
      if (f2) return canUse(self, opp, F2.creatorRefineMe);
      return charge(self) >= SPLITTER.min;
    }
    default:
      return true;
  }
}

export { cumSpend };
