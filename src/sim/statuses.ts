/**
 * Shared status infrastructure.
 *
 * Every status in the game is declared here so that state creation, cloning,
 * hashing and the HUD all agree on one key set. Character specific effects are
 * implemented by the character logic, not by this file.
 */

import type { Fighter, StatusDef, StatusTable } from './types';

export const STATUS_DEFS: Record<string, StatusDef> = {
  /* --- Cyborg Mk. 2, Form 1 ---------------------------------------- */
  conductive: {
    key: 'conductive',
    name: 'CONDUCTIVE',
    maxStacks: 6,
    duration: 480,
    color: '#ffd75e',
    glyph: '⚡',
    desc: '+4% lightning damage per stack. Amplifies and is consumed by Mk. 2 skills.',
  },
  pierced: {
    key: 'pierced',
    name: 'PIERCED',
    maxStacks: 3,
    duration: 480,
    color: '#ffb347',
    glyph: '⟟',
    desc: '+5% spear damage per stack, extra guard damage on thrusts, feeds finishers.',
  },
  heavensMark: {
    key: 'heavensMark',
    name: "HEAVEN'S MARK",
    maxStacks: 3,
    duration: 900,
    color: '#fff2a8',
    glyph: '✦',
    desc: 'Divine sigil. Required by Judgement Bolt and by the full Heaven Splitter execution.',
  },
  staticLock: {
    key: 'staticLock',
    name: 'STATIC LOCK',
    maxStacks: 1,
    duration: 54,
    color: '#9fe4ff',
    glyph: '⌁',
    desc: 'Dash acceleration gutted, air dash disabled, escape routes closed for ~0.9s.',
  },
  divineScar: {
    key: 'divineScar',
    name: 'DIVINE SCAR',
    maxStacks: 1,
    duration: 420,
    color: '#ff8a5c',
    glyph: '✖',
    desc: 'Post-cashout wound: takes more damage, crushes guard faster, moves slower.',
  },

  /* --- Cyborg Mk. 2, Form 2 ---------------------------------------- */
  divineShock: {
    key: 'divineShock',
    name: 'DIVINE SHOCK',
    maxStacks: 6,
    duration: 600,
    color: '#fff7c8',
    glyph: '✸',
    desc: 'Holy overvoltage. Only Form 2 gold lightning can consume it, and it pays for itself.',
  },

  /* --- Shared ------------------------------------------------------- */
  stun: {
    key: 'stun',
    name: 'STUN',
    maxStacks: 1,
    duration: 40,
    color: '#c9d4ff',
    glyph: '★',
    desc: 'Shared hard stun.',
  },
};

export const STATUS_KEYS = Object.keys(STATUS_DEFS);

export function makeStatusTable(): StatusTable {
  const t: StatusTable = {};
  for (const key of STATUS_KEYS) t[key] = { stacks: 0, timer: 0 };
  return t;
}

export function def(key: string): StatusDef {
  const d = STATUS_DEFS[key];
  if (!d) throw new Error(`Unknown status: ${key}`);
  return d;
}

export function stacks(f: Fighter, key: string): number {
  const e = f.statuses[key];
  return e ? e.stacks : 0;
}

export function hasStatus(f: Fighter, key: string): boolean {
  return stacks(f, key) > 0;
}

export function applyStatus(
  f: Fighter,
  key: string,
  amount: number,
  duration?: number,
): number {
  const d = def(key);
  const e = f.statuses[key];
  if (!e) return 0;
  const before = e.stacks;
  // Re-applying refreshes the duration.
  e.timer = duration ?? d.duration;
  e.stacks = Math.min(d.maxStacks, e.stacks + Math.max(0, amount));
  return e.stacks - before;
}

/** Set stacks to an absolute value (clamped) and refresh duration. */
export function setStatus(f: Fighter, key: string, value: number, duration?: number): void {
  const d = def(key);
  const e = f.statuses[key];
  if (!e) return;
  e.stacks = Math.min(d.maxStacks, Math.max(0, value));
  e.timer = e.stacks > 0 ? (duration ?? d.duration) : 0;
}

/** Consume N stacks. Returns true when the full amount was available. */
export function consumeStatus(f: Fighter, key: string, amount: number): boolean {
  const e = f.statuses[key];
  if (!e) return false;
  if (e.stacks < amount) return false;
  e.stacks -= amount;
  if (e.stacks <= 0) {
    e.stacks = 0;
    e.timer = 0;
  }
  return true;
}

export function consumeAtLeast(f: Fighter, key: string, amount: number): number {
  const e = f.statuses[key];
  if (!e) return 0;
  const take = Math.min(e.stacks, amount);
  e.stacks -= take;
  if (e.stacks <= 0) {
    e.stacks = 0;
    e.timer = 0;
  }
  return take;
}

export function clearStatus(f: Fighter, key: string): void {
  const e = f.statuses[key];
  if (!e) return;
  e.stacks = 0;
  e.timer = 0;
}

export function clearAll(f: Fighter): void {
  for (const key of STATUS_KEYS) clearStatus(f, key);
}

/** Ages every status. Returns the keys that expired this frame. */
export function tickStatuses(f: Fighter): string[] {
  const expired: string[] = [];
  for (const key of STATUS_KEYS) {
    const e = f.statuses[key];
    if (e.stacks > 0) {
      e.timer -= 1;
      if (e.timer <= 0) {
        e.stacks = 0;
        e.timer = 0;
        expired.push(key);
      }
    } else if (e.timer > 0) {
      e.timer = 0;
    }
  }
  return expired;
}

/** Distinct active Mk. 2 status keys, used by Combat Diagnosis. */
export const MK2_LAYER_KEYS = [
  'conductive',
  'pierced',
  'heavensMark',
  'staticLock',
  'divineShock',
] as const;

export function distinctMk2Layers(f: Fighter): string[] {
  const out: string[] = [];
  for (const key of MK2_LAYER_KEYS) if (stacks(f, key) > 0) out.push(key);
  return out;
}
