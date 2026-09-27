/**
 * Hit resolution: hitbox vs hurtbox, counter hits, blocking, guard crush,
 * chip damage, knockdowns and the damage pipeline.
 *
 * Damage pipeline order (all multipliers, no randomness):
 *   base
 *   -> attacker outgoing mods   (Combat Diagnosis, Pierced, Conductive, ...)
 *   -> move specific multipliers (e.g. Pierced consumed for a bonus)
 *   -> defender incoming mods   (Divine Scar, ...)
 *   -> combo scaling
 *   -> rounded
 */

import { GUARD } from './const';
import { charOf, moveOf, runHitHook, shotOf } from './registry';
import { applyStatus, stacks } from './statuses';
import {
  activeBoxes,
  boxCenter,
  emit,
  endMove,
  grantCancel,
  isRecovering,
  isStartup,
  overlaps,
  setState,
  shake,
} from './actions';
import type { Aabb, DamageContext, Fighter, GuardContext, MatchState } from './types';

/** Combo scaling: gentle, because Mk. 2 is meant to be oppressive in the corner. */
export const COMBO_SCALE_STEP = 0.05;
export const COMBO_SCALE_FLOOR = 0.6;

export function comboScale(hits: number): number {
  return Math.max(COMBO_SCALE_FLOOR, 1 - COMBO_SCALE_STEP * Math.max(0, hits));
}

export type HitKind = 'hit' | 'block' | 'armor' | 'whiff' | 'invuln';

export interface HitResult {
  kind: HitKind;
  damage: number;
  counter: boolean;
  chip: number;
}

const BLOCK_AIR_CEILING = 6;

export function hurtboxPlain(def: Fighter): Aabb {
  return { x: def.x - 18, y: def.y + 8, w: 36, h: 94 };
}

export function hurtboxWithMove(def: Fighter): Aabb {
  if (def.move) {
    const d = moveOf(def.move.id);
    if (d.hurtbox) {
      const b = d.hurtbox;
      return { x: def.x - b.w / 2 + b.x * def.facing, y: def.y + b.y, w: b.w, h: b.h };
    }
  }
  return hurtboxPlain(def);
}

/** Can the defender block at all this frame? */
export function canBlock(def: Fighter): boolean {
  if (def.hitstun > 0) return false;
  if (def.state === 'knockdown' || def.state === 'wakeup' || def.state === 'guardBreak') return false;
  if (def.state === 'smiteDead' || def.state === 'dead') return false;
  if (def.move && !(isRecovering(def) || def.cancelTimer > 0)) return false;
  return true;
}

export function isBlocking(def: Fighter, level: 'any' | 'low' | 'high' | 'none'): boolean {
  if (level === 'none') return false;
  if (!def.guarding || !canBlock(def)) return false;
  if (def.y > BLOCK_AIR_CEILING) return false;
  if (level === 'low' && !def.guardLow) return false;
  if (level === 'high' && def.guardLow) return false;
  return true;
}

/** Guard crush pressure. Returns true when the guard broke. */
export function applyGuardCrush(
  state: MatchState,
  def: Fighter,
  atk: Fighter,
  amount: number,
  ctx: GuardContext,
): boolean {
  const atkChar = charOf(atk.charId);
  def.guardCrush += amount * atkChar.guardMods(ctx);
  if (def.guardCrush >= GUARD.crushMax) {
    def.guardCrush = 0;
    setState(def, 'guardBreak');
    def.blockstun = GUARD.breakStun;
    def.guarding = false;
    if (def.move) endMove(def);
    def.comboHits = 0;
    def.comboDamage = 0;
    emit(state, 'vfx', 'guardBreak', def.x, def.y + 50, 1);
    emit(state, 'sfx', 'guardBreak', def.x, 0, 0);
    shake(state, 9);
    return true;
  }
  return false;
}

export function tickGuardMeter(f: Fighter): void {
  if (f.guarding) return;
  if (f.guardCrush > 0) f.guardCrush = Math.max(0, f.guardCrush - GUARD.decay);
}

export interface HitOptions {
  moveId: string;
  fromShot: boolean;
  shotKind: string;
  hitIndex: number;
  /** Multiplier from the move itself (Pierced consumption etc). */
  extra?: number;
  /** Scales the move's base damage before every other modifier. */
  baseScale?: number;
  /** Forces a specific damage value (fixed-damage divine smites). */
  flatDamage?: number;
  /** Cannot be blocked, chipped or armoured (divine judgement). */
  unblockable?: boolean;
  hitstop?: number;
  /** Skips the maxHits bookkeeping (follow-up bolts). */
  freeHit?: boolean;
  push?: number;
  hitX?: number;
  hitY?: number;
  /** Skips combo scaling entirely. */
  noScale?: boolean;
  /** The projectile responsible for this hit. */
  shot?: import('./types').Shot | null;
}

export function applyHit(
  state: MatchState,
  atk: Fighter,
  def: Fighter,
  opts: HitOptions,
): HitResult {
  const move = moveOf(opts.moveId);

  if (def.invuln > 0 && !move.breaksInvuln) {
    return { kind: 'invuln', damage: 0, counter: false, chip: 0 };
  }

  const counter = !!def.move && isStartup(def);
  const atkChar = charOf(atk.charId);
  const defChar = charOf(def.charId);
  const hx = opts.hitX ?? atk.x + 30 * atk.facing;
  const hy = opts.hitY ?? atk.y + 50;

  const dctx: DamageContext = {
    state,
    atk,
    def,
    moveId: opts.moveId,
    baseDamage: move.damage,
    counter,
    fromShot: opts.fromShot,
    shotKind: opts.shotKind,
    hitX: hx,
    hitY: hy,
    hitIndex: opts.hitIndex,
    shot: opts.shot ?? null,
  };
  const gctx: GuardContext = {
    state,
    atk,
    def,
    moveId: opts.moveId,
    baseCrush: move.guardCrush,
    counter,
    fromShot: opts.fromShot,
    shotKind: opts.shotKind,
  };

  const guardLevel = move.guard ?? 'any';
  const blocked = !opts.unblockable && isBlocking(def, guardLevel);

  let dmg: number;
  if (opts.flatDamage !== undefined) {
    dmg = opts.flatDamage;
  } else {
    dmg = move.damage * (opts.baseScale ?? 1) * (atk.dmgScale || 1) * atkChar.outgoingMods(dctx);
    dmg *= opts.extra ?? 1;
    dmg *= defChar.incomingMods(dctx);
    if (!opts.noScale) dmg *= comboScale(def.comboHits);
    dmg = Math.round(dmg);
  }

  const hitstop = opts.hitstop ?? move.hitstop + (counter ? (move.counterHitstop ?? 2) : 0);

  if (blocked) {
    const chip = Math.round(move.chip * GUARD.chipScale);
    def.hp = Math.max(0, def.hp - chip);
    if (chip > 0) defChar.onDamaged?.(state, def, atk, chip, true);
    def.blockstun = Math.max(def.blockstun, move.blockstun + (counter ? 1 : 0));
    def.hitstop = Math.max(def.hitstop, hitstop);
    atk.hitstop = Math.max(atk.hitstop, hitstop);
    def.guarding = true;
    def.vx = 0;
    def.vy = 0;
    def.comboHits = 0;
    def.comboDamage = 0;
    if (def.move) endMove(def);
    applyGuardCrush(state, def, atk, move.guardCrush, gctx);
    if (move.cancelOnBlock && move.cancelOnBlock.length) grantCancel(atk, move.cancelOnBlock, 10);
    runHitHook(move.onBlock, dctx);
    emit(state, 'vfx', 'guardSpark', hx, hy, counter ? 1.3 : 1);
    emit(state, 'sfx', counter ? 'guardCounter' : 'guard', hx, 0, 0);
    shake(state, move.type === 'super' ? 14 : 3);
    if (def.hp <= 0) queueKo(state, def);
    return { kind: 'block', damage: chip, counter, chip };
  }

  const armored = def.armor > 0 && !move.breaksArmor;
  if (armored) {
    def.hp = Math.max(0, def.hp - dmg);
    def.hitstop = Math.max(def.hitstop, hitstop);
    atk.hitstop = Math.max(atk.hitstop, hitstop);
    def.comboHits = 0;
    if (def.hp <= 0) queueKo(state, def);
    runHitHook(move.onHit, dctx);
    emit(state, 'vfx', 'armorHit', hx, hy, 1);
    emit(state, 'sfx', 'armor', hx, 0, 0);
    shake(state, 6);
    return { kind: 'armor', damage: dmg, counter, chip: 0 };
  }

  // ---- clean hit ----
  def.hp = Math.max(0, def.hp - dmg);
  defChar.onDamaged?.(state, def, atk, dmg, false);
  def.lastHitTaken = dmg;
  def.hitEvent = 1;
  def.flashFrames = 4;
  def.hitstop = Math.max(def.hitstop, hitstop);
  atk.hitstop = Math.max(atk.hitstop, hitstop);
  def.guarding = false;
  def.guardLow = false;
  if (def.move) endMove(def);

  def.hitstun = Math.max(def.hitstun, move.hitstun + (counter ? 2 : 0));
  setState(def, 'hitstun');
  def.vx = 0;
  def.vy = 0;

  const heavy = move.knockdown === true || move.type === 'super' || move.type === 'finisher';
  if (heavy || def.y > 4) {
    def.vy = Math.max(def.vy, move.type === 'super' ? 7.4 : 5.6);
    def.vx = 5.2 * atk.facing * (opts.push ?? 1);
  } else if (move.damage >= 90) {
    def.vx = 3.4 * atk.facing * (opts.push ?? 1);
    def.hitstun = Math.round(def.hitstun * 1.08);
  } else if (def.onGround) {
    def.vx = 1.5 * atk.facing * (opts.push ?? 1);
  }

  def.comboHits = 0;
  def.comboDamage = 0;
  atk.comboHits += 1;
  atk.comboDamage += dmg;
  def.juggle += 1;

  if (move.cancelOnHit && move.cancelOnHit.length) grantCancel(atk, move.cancelOnHit, 10);

  runHitHook(move.onHit, dctx);
  emit(state, 'vfx', counter ? 'counterHit' : 'hit', hx, hy, Math.min(3, dmg / 60));
  emit(
    state,
    'sfx',
    counter ? 'hitCounter' : move.type === 'super' ? 'hitSuper' : 'hit',
    hx,
    0,
    0,
  );
  shake(state, move.type === 'super' ? 16 : move.damage >= 90 ? 7 : 4);

  if (def.hp <= 0) queueKo(state, def);
  return { kind: 'hit', damage: dmg, counter, chip: 0 };
}

export function queueKo(state: MatchState, loser: Fighter): void {
  if (!state.koQueue.includes(loser.player)) state.koQueue.push(loser.player);
}

/** Main sweep: every active hitbox against the opposing hurtbox. */
export function resolveCombat(state: MatchState): void {
  for (let i = 0; i < 2; i++) {
    const atk = state.fighters[i];
    const def = state.fighters[1 - i];
    if (atk.hitstop > 0 || def.hitstop > 0) continue;
    if (atk.state === 'smiteDead' || def.state === 'smiteDead') continue;
    if (!atk.move) continue;

    const move = moveOf(atk.move.id);
    if (move.startup + move.active <= atk.move.frame) continue;
    if (atk.move.frame < move.startup) continue;
    const boxes = activeBoxes(atk);
    if (boxes.length === 0) continue;

    for (let b = 0; b < boxes.length; b++) {
      if (!opts_allow(atk, move.maxHits)) break;
      const hitId = `${move.id}#${b}`;
      if (atk.move.hitIds.includes(hitId)) continue;
      const box = boxes[b];
      if (!overlaps(box, hurtboxWithMove(def))) continue;
      const c = boxCenter(box);
      const res = applyHit(state, atk, def, {
        moveId: move.id,
        fromShot: false,
        shotKind: '',
        hitIndex: b,
        hitX: c.x,
        hitY: c.y,
      });
      if (res.kind === 'hit' || res.kind === 'armor' || res.kind === 'block') {
        atk.move.hitIds.push(hitId);
        atk.move.hits += 1;
      }
      if (atk.move.hits >= move.maxHits) break;
    }
  }
}

function opts_allow(f: Fighter, maxHits: number): boolean {
  return f.move ? f.move.hits < maxHits : false;
}

/** Shots vs fighters. */
export function resolveShots(state: MatchState): void {
  for (let s = state.shots.length - 1; s >= 0; s--) {
    const shot = state.shots[s];
    if (shot.rehit > 0) shot.rehit -= 1;
    const atk = state.fighters[shot.owner];
    const def = state.fighters[shot.owner === 0 ? 1 : 0];
    const sd = shotOf(shot.kind);
    if (atk.state === 'smiteDead' || def.state === 'smiteDead') continue;
    if (shot.rehit > 0) continue;

    const box: Aabb = {
      x: shot.x - sd.box.w / 2,
      y: shot.y - sd.box.h / 2,
      w: sd.box.w,
      h: sd.box.h,
    };
    if (!overlaps(box, hurtboxWithMove(def))) continue;

    const res = applyHit(state, atk, def, {
      moveId: `${shot.kind}#shot`,
      fromShot: true,
      shotKind: shot.kind,
      hitIndex: 0,
      hitX: shot.x,
      hitY: shot.y,
    });
    if (res.kind === 'whiff' || res.kind === 'invuln') continue;

    runHitHook(sd.onHit, {
      state,
      atk,
      def,
      moveId: `${shot.kind}#shot`,
      baseDamage: sd.damage,
      counter: res.counter,
      fromShot: true,
      shotKind: shot.kind,
      hitX: shot.x,
      hitY: shot.y,
      hitIndex: 0,
      shot,
    });
    emit(state, 'vfx', 'shotHit', shot.x, shot.y, 1);
    if (shot.vars.pierce) {
      shot.rehit = Math.max(shot.rehit, 10);
    } else {
      state.shots.splice(s, 1);
    }
  }
}

/** Applies a shock-family status. Shared helper for lightning sources. */
export function addShock(f: Fighter, key: string, n: number, duration?: number): number {
  return applyStatus(f, key, n, duration);
}

export function targetStacksOf(def: Fighter, key: string): number {
  return stacks(def, key);
}
