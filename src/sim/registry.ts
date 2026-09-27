/**
 * Registry of characters, moves and shots.
 *
 * Definitions are shared and immutable. The simulation state only ever stores
 * string ids, which is what keeps snapshots/rollback/hashing exact.
 */

import type { CharacterDef, HookFn, MoveDef, MoveHookFn, ShotDef } from './types';

export const MOVES: Record<string, MoveDef> = Object.create(null);
export const SHOTS: Record<string, ShotDef> = Object.create(null);
export const CHARACTERS: Record<string, CharacterDef> = Object.create(null);
/** onHit / onBlock hooks. */
export const HIT_HOOKS: Record<string, HookFn> = Object.create(null);
/** onActivate / onWhiff / onExpire hooks. */
export const MOVE_HOOKS: Record<string, MoveHookFn> = Object.create(null);

export function registerHook(id: string, fn: HookFn): void {
  HIT_HOOKS[id] = fn;
}

/** Alias with the explicit name used by the character modules. */
export const registerHitHook = registerHook;

export function registerMoveHook(id: string, fn: MoveHookFn): void {
  MOVE_HOOKS[id] = fn;
}

export function runHitHook(id: string | undefined, ctx: import('./types').DamageContext): void {
  if (!id) return;
  const fn = HIT_HOOKS[id];
  if (fn) fn(ctx);
}

export function runMoveHook(id: string | undefined, ctx: import('./types').MoveContext): void {
  if (!id) return;
  const fn = MOVE_HOOKS[id];
  if (fn) fn(ctx);
}

export function registerCharacter(def: CharacterDef): CharacterDef {
  CHARACTERS[def.id] = def;
  for (const m of def.moves) MOVES[m.id] = m;
  for (const s of def.shots) {
    SHOTS[s.kind] = s;
    // Projectiles resolve through the same damage pipeline as melee, so each
    // shot gets a synthetic move definition.
    const moveId = `${s.kind}#shot`;
    if (!MOVES[moveId]) {
      MOVES[moveId] = {
        id: moveId,
        name: s.kind,
        input: '-',
        type: 'special',
        startup: 1,
        active: 1,
        recovery: 1,
        damage: s.damage,
        chip: s.chip,
        hitstun: s.hitstun,
        blockstun: s.blockstun,
        hitstop: s.hitstop,
        guardCrush: s.guardCrush,
        maxHits: 1,
        boxes: [s.box],
        tags: s.tags ?? ['shot'],
        fx: s.fx,
      };
    }
  }
  return def;
}

export function moveOf(id: string): MoveDef {
  const m = MOVES[id];
  if (!m) throw new Error(`Unknown move: ${id}`);
  return m;
}

export function shotOf(kind: string): ShotDef {
  const s = SHOTS[kind];
  if (!s) throw new Error(`Unknown shot: ${kind}`);
  return s;
}

export function charOf(id: string): CharacterDef {
  const c = CHARACTERS[id];
  if (!c) throw new Error(`Unknown character: ${id}`);
  return c;
}
