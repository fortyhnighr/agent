/**
 * Divine Charge / Attunement engine and the char-state layout.
 *
 * Divine Charge (0-20) is the spendable resource. Attunement (0-3) rises with
 * CUMULATIVE charge spent, so spending is progression rather than self-harm:
 *
 *   build -> spend -> attune -> unlock the stronger version of the kit -> rebuild
 */

import { ATTUNE, CHARGE, CK, MK2 } from './constants';

/** Every numeric Mk. 2 char-state slot, initialised to a stable value. */
export const MK2_CHAR_DEFAULTS: Record<string, number> = {
  [CK.charge]: 0,
  [CK.attunement]: 0,
  [CK.cumSpend]: 0,
  [CK.form]: 1,
  [CK.proxyTimer]: 0,
  [CK.proxyKills]: 0,
  [CK.smitePhase]: 0,
  [CK.smiteFrame]: 0,
  [CK.marksApplied]: 0,
  [CK.perfectPhases]: 0,
  [CK.phaseArmed]: 0,
  [CK.phaseUsed]: 0,
  [CK.arrayHits]: 0,
  [CK.arrayLive]: 0,
  [CK.boltTimer]: 0,
  [CK.boltLeft]: 0,
  [CK.boltIndex]: 0,
  [CK.boltTotal]: 0,
  [CK.confineHits]: 0,
  [CK.confineLive]: 0,
  [CK.seq]: 0,
  [CK.seqFrame]: 0,
  [CK.seqFlags]: 0,
  [CK.seqCursor]: 0,
  [CK.lastThunderlineReuse]: 0,
  [CK.proxyDamage]: 0,
  [CK.proxyStunned]: 0,
  [CK.finisherUsed]: 0,
  [CK.shockSpent]: 0,
  [CK.chargeSpentThisRound]: 0,
  [CK.thunderUsed]: 0,
  [CK.perfectArmedAt]: -1,
  /** Guards the one-shot Perfect Phase detection per move instance. */
  __phaseLock: 0,
  /** Cached hit-flash used by the renderer. */
  __vfx: 0,
  __pad: 0,
  __pad2: 0,
};

export function makeMk2CharState(): Record<string, number> {
  return { ...MK2_CHAR_DEFAULTS };
}

/* ------------------------------------------------------------------ */
/* Charge                                                              */
/* ------------------------------------------------------------------ */

export function charge(f: { char: Record<string, number> }): number {
  return f.char[CK.charge];
}

export function attunement(f: { char: Record<string, number> }): number {
  return f.char[CK.attunement];
}

export function cumSpend(f: { char: Record<string, number> }): number {
  return f.char[CK.cumSpend];
}

export function form(f: { char: Record<string, number> }): number {
  return f.char[CK.form];
}

export function isForm2(f: { char: Record<string, number> }): boolean {
  return f.char[CK.form] === 2;
}

export function proxyActive(f: { char: Record<string, number> }): boolean {
  return f.char[CK.form] === 2 && f.char[CK.proxyTimer] > 0 && f.char[CK.smitePhase] === 0;
}

export function addCharge(f: { char: Record<string, number> }, n: number): void {
  f.char[CK.charge] = Math.max(0, Math.min(CHARGE.max, f.char[CK.charge] + n));
}

export function loseCharge(f: { char: Record<string, number> }, n: number): void {
  f.char[CK.charge] = Math.max(0, f.char[CK.charge] - n);
}

/**
 * Spends Divine Charge. Returns false (and spends nothing) when the fighter
 * cannot afford it - strict requirements, no pity versions.
 */
export function spendCharge(
  f: { char: Record<string, number> },
  n: number,
): boolean {
  if (n <= 0) return true;
  if (f.char[CK.charge] < n) return false;
  f.char[CK.charge] -= n;
  f.char[CK.cumSpend] += n;
  f.char[CK.chargeSpentThisRound] += n;
  syncAttunement(f);
  return true;
}

/** Recomputes Attunement from cumulative spend. Attunement never drops. */
export function syncAttunement(f: { char: Record<string, number> }): void {
  const want = Math.min(ATTUNE.max, Math.floor(f.char[CK.cumSpend] / ATTUNE.perLevel));
  if (want > f.char[CK.attunement]) f.char[CK.attunement] = want;
}

export function canAfford(f: { char: Record<string, number> }, n: number): boolean {
  return f.char[CK.charge] >= n;
}

/** The 0..1 pipeline the renderer uses to drive the Attunement visuals. */
export function attunementFraction(f: { char: Record<string, number> }): number {
  const a = f.char[CK.attunement];
  const into = f.char[CK.cumSpend] % ATTUNE.perLevel;
  return Math.min(1, (a + (a >= ATTUNE.max ? 0 : into / ATTUNE.perLevel)) / ATTUNE.max);
}

export const MK2_STATS = MK2;
