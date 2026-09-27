/**
 * Mk. 2 status interactions.
 *
 *   CONDUCTIVE    raw lightning charge      -> +4% lightning damage per stack
 *   PIERCED       Heaven Splitter penetration -> +5% spear damage, guard pressure
 *   HEAVEN'S MARK divine sigil              -> gates Judgement Bolt & full execution
 *   STATIC LOCK   control                   -> closes escape routes for ~0.9s
 *   DIVINE SCAR   post cashout wound        -> takes more, crushes faster, slower
 *   DIVINE SHOCK  Form 2 holy overvoltage   -> only Form 2 gold lightning pays it off
 *
 * PASSIVE - COMBAT DIAGNOSIS: every DIFFERENT Mk. 2 status on the target is
 * +6% damage, capped at 4 layers (+24%). Layering beats mindlessly stacking.
 */

import { MOVES, moveOf } from '../../sim/registry';
import { applyStatus, consumeAtLeast, consumeStatus, distinctMk2Layers, stacks } from '../../sim/statuses';
import { DIAGNOSIS, STATUS } from './constants';
import type { DamageContext, Fighter, GuardContext } from '../../sim/types';

export function moveHasTag(moveId: string, tag: string): boolean {
  // Projectile hits resolve through `<kind>#shot`; melee through the move id.
  const direct = MOVES[moveId];
  const d = direct ?? moveOf(moveId.split('#')[0]);
  return !!d.tags && d.tags.includes(tag);
}

export function isSpear(moveId: string): boolean {
  return moveHasTag(moveId, 'spear');
}

export function isLightning(moveId: string): boolean {
  return moveHasTag(moveId, 'lightning') || moveHasTag(moveId, 'divine');
}

export function isDivine(moveId: string): boolean {
  return moveHasTag(moveId, 'divine');
}

/* ------------------------------------------------------------------ */
/* Passive: Combat Diagnosis                                           */
/* ------------------------------------------------------------------ */

export function diagnosisLayers(opp: Fighter): number {
  return Math.min(DIAGNOSIS.maxLayers, distinctMk2Layers(opp).length);
}

export function diagnosisMult(opp: Fighter): number {
  return 1 + DIAGNOSIS.perLayer * diagnosisLayers(opp);
}

/* ------------------------------------------------------------------ */
/* Outgoing multipliers                                                */
/* ------------------------------------------------------------------ */

export function outgoingMult(ctx: DamageContext): number {
  const opp = ctx.def;
  let m = diagnosisMult(opp);

  if (isLightning(ctx.moveId)) {
    m *= 1 + STATUS.conductiveDamage * stacks(opp, 'conductive');
  }
  if (isDivine(ctx.moveId)) {
    m *= 1 + STATUS.divineShockDamage * stacks(opp, 'divineShock');
  }
  if (isSpear(ctx.moveId) || moveHasTag(ctx.moveId, 'pierce')) {
    m *= 1 + STATUS.piercedDamage * stacks(opp, 'pierced');
  }
  if (stacks(opp, 'heavensMark') > 0 && isLightning(ctx.moveId)) {
    // Marked targets are primed ground: +4% per mark on lightning payoffs.
    m *= 1 + 0.04 * stacks(opp, 'heavensMark');
  }
  return m;
}

export function guardMult(ctx: GuardContext): number {
  const opp = ctx.def;
  let m = 1;
  if (ctx.moveId.includes('thrust') || isSpear(ctx.moveId)) {
    m *= 1 + STATUS.piercedGuard * stacks(opp, 'pierced');
  }
  if (isDivine(ctx.moveId)) {
    m *= 1 + STATUS.divineShockGuard * stacks(opp, 'divineShock');
  }
  if (isLightning(ctx.moveId)) {
    m *= 1 + 0.06 * stacks(opp, 'conductive');
  }
  if (stacks(opp, 'divineScar') > 0) m *= 1 + STATUS.divineScarGuardTaken;
  return m;
}

export function incomingMult(ctx: DamageContext): number {
  const self = ctx.def;
  let m = 1;
  if (stacks(self, 'divineScar') > 0) m *= 1 + STATUS.divineScarDamageTaken;
  return m;
}

/* ------------------------------------------------------------------ */
/* Applications / consumption                                          */
/* ------------------------------------------------------------------ */

export function applyConductive(f: Fighter, n: number, duration?: number): number {
  return applyStatus(f, 'conductive', n, duration);
}

export function applyPierced(f: Fighter, n: number, duration?: number): number {
  return applyStatus(f, 'pierced', n, duration);
}

/** Applies Heaven's Mark and records the lifetime count (2nd life requirement). */
export function applyMark(attacker: Fighter, target: Fighter, n = 1): number {
  const got = applyStatus(target, 'heavensMark', n);
  if (got > 0 && attacker.char) {
    attacker.char.marksApplied = (attacker.char.marksApplied ?? 0) + got;
  }
  return got;
}

export function applyStaticLock(f: Fighter): number {
  return applyStatus(f, 'staticLock', 1, STATUS.staticLockFrames);
}

export function applyDivineScar(f: Fighter): number {
  return applyStatus(f, 'divineScar', 1, STATUS.divineScarFrames);
}

export function applyDivineShock(f: Fighter, n: number, duration?: number): number {
  return applyStatus(f, 'divineShock', n, duration);
}

/** Consumes up to `max` Conductive. Returns how many were actually taken. */
export function drainConductive(f: Fighter, max: number): number {
  return consumeAtLeast(f, 'conductive', max);
}

export function drainDivineShock(f: Fighter, max: number): number {
  return consumeAtLeast(f, 'divineShock', max);
}

export function canConsume(f: Fighter, key: string, n: number): boolean {
  return stacks(f, key) >= n;
}

export function consumeExact(f: Fighter, key: string, n: number): boolean {
  return consumeStatus(f, key, n);
}

/** Human readable layer list for the HUD / tests. */
export function layerReport(opp: Fighter): { key: string; stacks: number }[] {
  return distinctMk2Layers(opp).map((k) => ({ key: k, stacks: stacks(opp, k) }));
}
