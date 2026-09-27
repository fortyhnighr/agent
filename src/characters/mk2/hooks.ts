/**
 * MK. 2 HOOKS.
 *
 * Form 1 hooks feed Divine Charge, layer statuses, reward Perfect Phases and
 * enforce strict requirements. Form 2 hooks do the same for Divine Shock and
 * for the borrowed authority.
 *
 * Nothing here is random; everything is a frame-indexed reaction to a hit.
 */

import { activeBoxes, emit, grantCancel, overlaps, shake, spawnShot, startMove } from '../../sim/actions';
import { hurtboxWithMove } from '../../sim/combat';
import { registerHitHook, registerMoveHook } from '../../sim/registry';
import { clampToStage } from '../../sim/state';
import { consumeAtLeast, stacks } from '../../sim/statuses';
import { CHARGE, CK, F1, F2, JUDGEMENT, PHASE, S1 } from './constants';
import { addCharge, attunement, isForm2, syncAttunement } from './state';
import {
  applyConductive,
  applyDivineShock,
  applyDivineScar,
  applyMark,
  applyPierced,
  applyStaticLock,
  drainConductive,
  drainDivineShock,
} from './statuses';
import { seqIdToCode } from './sequenceCodes';
import type { DamageContext, Fighter, MatchState, MoveContext } from '../../sim/types';

/* ------------------------------------------------------------------ */
/* Shared reward plumbing                                              */
/* ------------------------------------------------------------------ */

function rewardHit(ctx: DamageContext, base: number = CHARGE.onCleanHit): void {
  const atk = ctx.atk;
  const opp = ctx.def;
  let gain = base;
  if (ctx.counter) gain += CHARGE.onCounterHit;
  if (stacks(opp, 'heavensMark') > 0) gain += CHARGE.onHitMarked;
  addCharge(atk, gain);
  emit(ctx.state, 'vfx', 'chargeGain', atk.x, atk.y + 96, gain);
}

/** Reward for correctly consuming a status. Whiffs and chip pay nothing. */
function rewardConsume(state: MatchState, self: Fighter, n: number): void {
  if (n <= 0) return;
  addCharge(self, CHARGE.onStatusConsume);
  emit(state, 'vfx', 'chargeGain', self.x, self.y + 96, 1);
}

function f2Reward(ctx: DamageContext): void {
  const atk = ctx.atk;
  const opp = ctx.def;
  let gain = 2;
  if (ctx.counter) gain += 1;
  if (stacks(opp, 'heavensMark') > 0) gain += 2;
  addCharge(atk, gain);
  emit(ctx.state, 'vfx', 'chargeGain', atk.x, atk.y + 96, gain);
}

const SPECIALS = [
  F1.flashThrust,
  F1.streakLunge,
  F1.railspear,
  F1.railspearL1,
  F1.railspearL2,
  F1.thunderline,
  F1.thunderlineEnhanced,
  F1.heavenfallRise,
  F1.heavenfallRiseEnhanced,
  F1.heavensArray,
  F1.judgementBolt,
  F1.splitter1,
  F1.splitter2,
  F1.splitter3,
  F1.splitterEx,
];

const F2_SPECIALS = [
  F2.smite,
  F2.smiteMedium,
  F2.smiteFall,
  F2.smiteFallCharged,
  F2.decapitate,
  F2.andShowYou,
  F2.unrelentingMight,
  F2.judgementCreator,
  F2.creatorRefineMe,
  F2.mightOfCreator,
];

/* ------------------------------------------------------------------ */
/* Form 1 - normal attacks                                            */
/* ------------------------------------------------------------------ */

registerHitHook('mk2:flashThrustHit', (ctx) => {
  applyConductive(ctx.def, 1);
  rewardHit(ctx);
  emit(ctx.state, 'vfx', 'conductive', ctx.def.x, ctx.def.y + 52, 1);
});

registerMoveHook('mk2:streakLungeStart', (ctx) => {
  const { self, opp, state } = ctx;
  emit(state, 'vfx', 'streakLunge', self.x, self.y + 50, 1);
  // 2+ Conductive: consume one and phase through the approach.
  if (stacks(opp, 'conductive') >= 2) {
    const took = drainConductive(opp, 1);
    if (took > 0) {
      self.invuln = Math.max(self.invuln, 16);
      if (self.move) self.move.vars.travel = 1;
      rewardConsume(state, self, took);
      emit(state, 'vfx', 'phaseBurst', self.x, self.y + 50, 1);
      emit(state, 'sfx', 'travelInvuln', self.x, 0, 0);
    }
  }
});

registerHitHook('mk2:streakLungeHit', (ctx) => {
  if (ctx.counter) {
    applyPierced(ctx.def, 1);
    emit(ctx.state, 'vfx', 'pierced', ctx.def.x, ctx.def.y + 50, 1);
  }
  rewardHit(ctx);
});

registerHitHook('mk2:railspearHit', (ctx) => {
  applyConductive(ctx.def, 1);
  rewardHit(ctx);
});

registerMoveHook('mk2:railspearL1Start', (ctx) => {
  emit(ctx.state, 'vfx', 'spearCompress', ctx.self.x, ctx.self.y + 60, 1);
  emit(ctx.state, 'sfx', 'chargeArm', ctx.self.x, 0, 0);
});

registerHitHook('mk2:railspearL1Hit', (ctx) => {
  applyPierced(ctx.def, 1);
  applyConductive(ctx.def, 2);
  rewardHit(ctx);
  emit(ctx.state, 'vfx', 'pierced', ctx.def.x, ctx.def.y + 50, 1);
});

registerMoveHook('mk2:railspearL2Start', (ctx) => {
  const { self, opp, state } = ctx;
  const pierced = consumeAtLeast(opp, 'pierced', 3);
  if (pierced > 0) {
    self.dmgScale = 1 + 0.18 * pierced;
    rewardConsume(state, self, pierced);
  }
  emit(state, 'vfx', 'spearRail', self.x, self.y + 60, 2);
  emit(state, 'sfx', 'railCharge', self.x, 0, 0);
  shake(state, 6);
});

registerHitHook('mk2:railspearL2Hit', (ctx) => {
  applyPierced(ctx.def, 1);
  applyConductive(ctx.def, 2);
  rewardHit(ctx);
  emit(ctx.state, 'vfx', 'pierced', ctx.def.x, ctx.def.y + 50, 2);
});

/* ------------------------------------------------------------------ */
/* Flash Phase / Perfect Phase                                        */
/* ------------------------------------------------------------------ */

registerMoveHook('mk2:flashPhaseStart', (ctx) => {
  const { self, state } = ctx;
  self.char[CK.phaseArmed] = 1;
  self.char[CK.phaseUsed] = 0;
  const back = self.padBack === 1;
  self.vx = (back ? -6.4 : 7.6) * self.facing;
  self.vy = 0;
  emit(state, 'vfx', 'phase', self.x, self.y + 50, 1);
  emit(state, 'sfx', 'phase', self.x, 0, 0);
});

registerMoveHook('mk2:flashPhaseEnd', (ctx) => {
  ctx.self.char[CK.phaseArmed] = 0;
});

/** An incoming hit landing inside the window converts into a Perfect Phase. */
export function checkPerfectPhase(state: MatchState, self: Fighter, opp: Fighter): void {
  if (self.char[CK.phaseArmed] !== 1) return;
  if (self.char[CK.phaseUsed]) return;
  if (self.invuln > 0) return;
  if (!opp.move) return;
  const boxes = activeBoxes(opp);
  if (boxes.length === 0) return;
  const hb = hurtboxWithMove(self);
  for (const b of boxes) {
    if (!overlaps(b, hb)) continue;
    triggerPerfectPhase(state, self, opp);
    return;
  }
}

export function triggerPerfectPhase(state: MatchState, self: Fighter, opp: Fighter): void {
  self.char[CK.phaseArmed] = 0;
  self.char[CK.phaseUsed] = 1;
  self.char[CK.perfectPhases] = (self.char[CK.perfectPhases] ?? 0) + 1;
  self.invuln = Math.max(self.invuln, PHASE.invuln);
  self.hitstun = 0;
  self.hitstop = 0;
  self.flashFrames = 6;
  // Behind the opponent = past them, opposite to the way they are facing.
  self.x = opp.x - PHASE.behindOffset * opp.facing;
  self.facing = opp.facing === 1 ? -1 : 1;
  clampToStage(self);
  addCharge(self, CHARGE.onPerfectPhase);
  applyMark(self, opp, 1);
  grantCancel(self, isForm2(self) ? F2_SPECIALS : SPECIALS, PHASE.cancelWindow);
  self.comboHits = 0;
  self.comboDamage = 0;
  emit(state, 'vfx', 'perfectPhase', self.x, self.y + 56, 1);
  emit(state, 'sfx', 'perfectPhase', self.x, 0, 0);
  shake(state, 10);
  state.stormFlash = Math.max(state.stormFlash, 0.5);
  state.stormFlashDecay = 0.08;
  syncAttunement(self);
}

/* ------------------------------------------------------------------ */
/* Heavenfall                                                         */
/* ------------------------------------------------------------------ */

registerMoveHook('mk2:heavenfallStart', (ctx) => {
  const { self, state, moveId } = ctx;
  const enhanced = moveId === F1.heavenfallRiseEnhanced;
  self.vy = enhanced ? 20.5 : 17.5;
  if (enhanced) self.dmgScale = 1.15;
  emit(state, 'vfx', 'heavenfallRise', self.x, self.y + 80, enhanced ? 2 : 1);
  emit(state, 'sfx', 'heavenfall', self.x, 0, 0);
});

registerMoveHook('mk2:heavenfallDrop', (ctx) => {
  const { self, opp, state } = ctx;
  if (Math.abs(opp.x - self.x) < 140) self.x = opp.x + 26 * self.facing;
  const carried = self.move ? (self.move.vars.scale ?? 1) : 1;
  startMove(self, F1.heavenfallFall, { consumed: 0, scale: carried });
  self.dmgScale = carried;
  emit(state, 'vfx', 'heavenfallDrop', self.x, self.y + 60, 1);
});

registerMoveHook('mk2:heavenfallFallStart', (ctx) => {
  const { self, opp, state } = ctx;
  const took = drainConductive(opp, 3);
  if (self.move) self.move.vars.consumed = took;
  if (took > 0) {
    const base = self.move ? (self.move.vars.scale ?? 1) : 1;
    self.dmgScale = base * (1 + 0.15 * took);
    rewardConsume(state, self, took);
  }
  self.vy = -19;
  emit(state, 'vfx', 'heavenfallImpale', self.x, self.y + 50, took);
});

registerHitHook('mk2:heavenfallFallHit', (ctx) => {
  const consumed = ctx.atk.move?.vars.consumed ?? 0;
  if (consumed >= 3) {
    applyStaticLock(ctx.def);
    emit(ctx.state, 'vfx', 'staticLock', ctx.def.x, ctx.def.y + 50, 1);
  }
  applyPierced(ctx.def, 1);
  applyConductive(ctx.def, 1);
  rewardHit(ctx);
});

/* ------------------------------------------------------------------ */
/* Thunderline                                                         */
/* ------------------------------------------------------------------ */

registerHitHook('mk2:thunderlineHit', (ctx) => {
  applyConductive(ctx.def, 1);
  rewardHit(ctx);
});

registerMoveHook('mk2:thunderlineEnhancedStart', (ctx) => {
  const { self, opp, state } = ctx;
  const dir = opp.x >= self.x ? 1 : -1;
  self.facing = dir;
  self.x = opp.x - 116 * dir;
  self.y = opp.y;
  clampToStage(self);
  const took = drainConductive(opp, 1);
  if (took > 0) rewardConsume(state, self, took);
  emit(state, 'vfx', 'thunderlineAlign', self.x, self.y + 50, 1);
  emit(state, 'sfx', 'thunderlineFire', self.x, 0, 0);
});

registerHitHook('mk2:thunderlineShotHit', (ctx) => {
  const atk = ctx.atk;
  applyPierced(ctx.def, 1);
  rewardHit(ctx);
  // Attunement 2+ into a marked target: the line fires once more, reversed.
  if (
    attunement(atk) >= 2 &&
    ctx.def.statuses.heavensMark.stacks > 0 &&
    !(ctx.shot?.vars.reused ?? 0) &&
    (atk.char[CK.lastThunderlineReuse] ?? 0) < 1
  ) {
    atk.char[CK.lastThunderlineReuse] = (atk.char[CK.lastThunderlineReuse] ?? 0) + 1;
    const reverse = spawnShot(ctx.state, atk, S1.thunderline, {
      x: ctx.def.x - 150 * atk.facing,
      y: ctx.def.y + 30,
      life: 30,
    });
    reverse.vars.pierce = 1;
    reverse.vars.reused = 1;
    reverse.vx = Math.abs(reverse.vx) * atk.facing;
    emit(ctx.state, 'vfx', 'thunderlineReuse', ctx.def.x, ctx.def.y + 40, 1);
    emit(ctx.state, 'sfx', 'thunderlineReuse', ctx.def.x, 0, 0);
  }
});

/* ------------------------------------------------------------------ */
/* Heaven's Array                                                     */
/* ------------------------------------------------------------------ */

registerMoveHook('mk2:heavensArrayStart', (ctx) => {
  const { self, state } = ctx;
  self.char[CK.arrayLive] = 1;
  self.char[CK.arrayHits] = 0;
  for (let i = 0; i < 5; i++) {
    spawnShot(state, self, S1.arraySpear, {
      x: self.x + 44 * self.facing,
      // Spread so that all five lines cross a standing body: the whole point
      // of the move is that connecting all five buys a Mark.
      y: 20 + i * 22,
      vars: { index: i },
    });
  }
  emit(state, 'vfx', 'heavensArray', self.x, self.y + 60, 1);
  emit(state, 'sfx', 'arrayFire', self.x, 0, 0);
  shake(state, 5);
});

registerMoveHook('mk2:heavensArrayEnd', (ctx) => {
  ctx.self.char[CK.arrayLive] = 0;
});

registerHitHook('mk2:arraySpearHit', (ctx) => {
  const atk = ctx.atk;
  const opp = ctx.def;
  applyConductive(opp, 1);
  if (atk.char[CK.arrayLive]) {
    const hits = (atk.char[CK.arrayHits] ?? 0) + 1;
    atk.char[CK.arrayHits] = hits;
    if (hits >= 3 && opp.statuses.staticLock.stacks === 0) {
      applyStaticLock(opp);
      emit(ctx.state, 'vfx', 'staticLock', opp.x, opp.y + 50, 1);
    }
    if (hits >= 5) applyMark(atk, opp, 1);
  }
  addCharge(atk, CHARGE.onCleanHit);
  emit(ctx.state, 'vfx', 'conductive', opp.x, opp.y + 52, 1);
});

/* ------------------------------------------------------------------ */
/* Judgement Bolt                                                      */
/* ------------------------------------------------------------------ */

registerMoveHook('mk2:judgementBoltStart', (ctx) => {
  const { self, opp, state } = ctx;
  const marks = stacks(opp, 'heavensMark');
  const bolts = Math.max(1, Math.min(3, marks + 1));
  self.char[CK.boltTotal] = bolts;
  self.char[CK.boltLeft] = bolts;
  self.char[CK.boltIndex] = 0;
  self.char[CK.boltTimer] = 0;
  self.x = opp.x - 156 * self.facing;
  self.y = Math.max(self.y, opp.y);
  clampToStage(self);
  emit(state, 'vfx', 'judgementCharge', self.x, self.y + 60, bolts);
  emit(state, 'sfx', 'judgementCharge', self.x, 0, 0);
  state.stormFlash = Math.max(state.stormFlash, 0.6);
});

registerMoveHook('mk2:judgementBoltEnd', (ctx) => {
  ctx.self.char[CK.boltLeft] = 0;
  ctx.self.char[CK.boltIndex] = 0;
  ctx.self.char[CK.boltTotal] = 0;
});

/** Fires the next bolt on a fixed cadence. Called from the frame logic. */
export function tickJudgementBolts(state: MatchState, self: Fighter, opp: Fighter): void {
  if ((self.char[CK.boltLeft] ?? 0) <= 0) return;
  if (self.char[CK.boltTimer] > 0) {
    self.char[CK.boltTimer] -= 1;
    return;
  }
  const index = self.char[CK.boltIndex];
  const shot = spawnShot(state, self, S1.judgement, {
    x: opp.x - 196 * self.facing,
    y: 28 + (index % 2) * 52,
  });
  shot.vars.index = index;
  self.char[CK.boltIndex] = index + 1;
  self.char[CK.boltLeft] -= 1;
  self.char[CK.boltTimer] = JUDGEMENT.interval;
  emit(state, 'vfx', 'judgementBolt', shot.x, shot.y, 1);
  emit(state, 'sfx', 'judgementBolt', shot.x, 0, 0);
  shake(state, 8);
}

registerHitHook('mk2:judgementShotHit', (ctx) => {
  const atk = ctx.atk;
  const opp = ctx.def;
  const index = ctx.shot ? (ctx.shot.vars.index ?? 0) : 0;
  const total = atk.char[CK.boltTotal] ?? 1;
  const shock = drainConductive(opp, 3);
  if (shock > 0) {
    atk.dmgScale = 1 + 0.16 * shock;
    rewardConsume(ctx.state, atk, shock);
  }
  if (index >= total - 1) {
    applyStaticLock(opp);
    applyPierced(opp, 1);
    emit(ctx.state, 'vfx', 'staticLock', opp.x, opp.y + 50, 1);
  }
  addCharge(atk, CHARGE.onCleanHit + (ctx.counter ? 1 : 0));
});

registerHitHook('mk2:execStrikeHit', (ctx) => {
  applyConductive(ctx.def, 1);
  addCharge(ctx.atk, 1);
  emit(ctx.state, 'vfx', 'conductive', ctx.def.x, ctx.def.y + 52, 1);
});

registerHitHook('mk2:execFinalHit', (ctx) => {
  applyPierced(ctx.def, 1);
  applyConductive(ctx.def, 2);
  rewardHit(ctx, 2);
  emit(ctx.state, 'vfx', 'execFinal', ctx.def.x, ctx.def.y + 54, 1);
});

registerHitHook('mk2f2:seqStrikeHit', (ctx) => {
  applyDivineShock(ctx.def, 1);
  addCharge(ctx.atk, 1);
});

registerHitHook('mk2f2:seqFinalHit', (ctx) => {
  applyDivineShock(ctx.def, 2);
  applyDivineScar(ctx.def);
  addCharge(ctx.atk, 2);
  emit(ctx.state, 'vfx', 'seqFinal', ctx.def.x, ctx.def.y + 54, 1);
});

/* ------------------------------------------------------------------ */
/* Form 1 executions                                                  */
/* ------------------------------------------------------------------ */

function startExecution(ctx: MoveContext, seqId: string, fxId: string): void {
  const { self, state } = ctx;
  self.char[CK.seq] = seqIdToCode(seqId);
  self.char[CK.seqFrame] = 0;
  self.char[CK.seqFlags] = 0;
  self.vx = 0;
  self.vy = 0;
  emit(state, 'vfx', fxId, self.x, self.y + 60, 1);
  emit(state, 'banner', 'super', self.player, 0, 0, ctx.moveId);
}

registerMoveHook('mk2:splitter1Start', (ctx) => startExecution(ctx, 'splitter1', 'splitter1'));
registerMoveHook('mk2:splitter2Start', (ctx) => startExecution(ctx, 'splitter2', 'splitter2'));
registerMoveHook('mk2:splitter3Start', (ctx) => startExecution(ctx, 'splitter3', 'splitter3'));
registerMoveHook('mk2:splitterExStart', (ctx) => startExecution(ctx, 'splitterEx', 'splitterEx'));

/* ------------------------------------------------------------------ */
/* Form 2                                                             */
/* ------------------------------------------------------------------ */

registerHitHook('mk2f2:smiteHit', (ctx) => {
  applyDivineShock(ctx.def, ctx.counter ? 2 : 1);
  f2Reward(ctx);
  emit(ctx.state, 'vfx', 'divineShock', ctx.def.x, ctx.def.y + 52, 1);
});

registerMoveHook('mk2f2:smiteMediumStart', (ctx) => {
  spawnShot(ctx.state, ctx.self, F2.divineArc, {
    x: ctx.self.x + 44 * ctx.self.facing,
    y: ctx.self.y + 30,
    angle: ctx.self.facing === 1 ? -8 : 188,
  });
  emit(ctx.state, 'vfx', 'divineDischarge', ctx.self.x, ctx.self.y + 50, 1);
});

registerHitHook('mk2f2:smiteMediumHit', (ctx) => {
  applyDivineShock(ctx.def, 2);
  f2Reward(ctx);
});

registerMoveHook('mk2f2:smiteFallStart', (ctx) => {
  const { self, opp, state } = ctx;
  const took = drainDivineShock(opp, 3);
  if (took > 0) {
    self.dmgScale = 1 + 0.18 * took;
    rewardConsume(state, self, took);
  }
  for (let i = 0; i < 3; i++) {
    spawnShot(state, self, F2.discharge, {
      x: self.x + 34 * self.facing,
      y: 32 + i * 22,
      angle: (self.facing === 1 ? 0 : 180) + (i - 1) * 9,
    });
  }
  emit(state, 'vfx', 'divineFall', self.x, self.y + 60, 1);
  emit(state, 'sfx', 'divineFall', self.x, 0, 0);
});

registerMoveHook('mk2f2:smiteFallChargedStart', (ctx) => {
  const { self, opp, state } = ctx;
  const took = drainDivineShock(opp, 3);
  if (took > 0) {
    self.dmgScale = (1 + 0.18 * took) * 1.1;
    rewardConsume(state, self, took);
  }
  for (let i = 0; i < 4; i++) {
    spawnShot(state, self, F2.discharge, {
      x: self.x + 34 * self.facing,
      y: 28 + i * 20,
      angle: (self.facing === 1 ? 0 : 180) + (i - 1.5) * 8,
    });
  }
  emit(state, 'vfx', 'divineFallCharged', self.x, self.y + 60, 2);
  shake(state, 10);
});

registerHitHook('mk2f2:smiteFallHit', (ctx) => {
  applyDivineShock(ctx.def, 3);
  f2Reward(ctx);
  emit(ctx.state, 'vfx', 'divineShock', ctx.def.x, ctx.def.y + 52, 2);
});

registerMoveHook('mk2f2:ahCreatorStart', (ctx) => {
  const { self, opp, state } = ctx;
  self.char[CK.phaseArmed] = 1;
  self.char[CK.phaseUsed] = 0;
  self.x = opp.x - 150 * self.facing;
  self.facing = opp.x >= self.x ? 1 : -1;
  self.vx = 13 * self.facing;
  self.invuln = Math.max(self.invuln, 18);
  clampToStage(self);
  for (let i = 0; i < 4; i++) {
    spawnShot(state, self, F2.phaseTrail, {
      x: self.x - i * 36 * self.facing,
      y: self.y + 18 + i * 12,
      life: 16 + i * 3,
    });
  }
  emit(state, 'vfx', 'ahCreator', self.x, self.y + 56, 1);
  emit(state, 'sfx', 'ahCreator', self.x, 0, 0);
  shake(state, 7);
});

registerMoveHook('mk2f2:ahCreatorEnd', (ctx) => {
  ctx.self.char[CK.phaseArmed] = 0;
});

registerMoveHook('mk2f2:decapitateStart', (ctx) => {
  const { self, opp, state } = ctx;
  self.x = opp.x - 78 * self.facing;
  self.facing = opp.x >= self.x ? 1 : -1;
  self.invuln = Math.max(self.invuln, 10);
  clampToStage(self);
  const shock = drainDivineShock(opp, 3);
  if (shock > 0) {
    self.dmgScale = 1 + 0.15 * shock;
    rewardConsume(state, self, shock);
  }
  if (stacks(opp, 'heavensMark') > 0) self.dmgScale *= 1.4;
  emit(state, 'vfx', 'decapitate', self.x, self.y + 60, 1);
  emit(state, 'sfx', 'decapitate', self.x, 0, 0);
  shake(state, 12);
});

registerHitHook('mk2f2:decapitateHit', (ctx) => {
  applyDivineShock(ctx.def, 3);
  f2Reward(ctx);
  emit(ctx.state, 'vfx', 'decapitateHit', ctx.def.x, ctx.def.y + 50, 1);
});

registerMoveHook('mk2f2:andShowYouStart', (ctx) => {
  const { self, opp, state } = ctx;
  const side: 1 | -1 = opp.x > self.x ? -1 : 1;
  self.x = opp.x + 122 * side;
  self.facing = side === 1 ? -1 : 1;
  self.y = Math.max(0, opp.y - 26);
  clampToStage(self);
  self.char[CK.confineLive] = 1;
  self.char[CK.confineHits] = 0;
  for (let i = 0; i < 3; i++) {
    spawnShot(state, self, F2.confine, {
      x: self.x,
      y: 28 + i * 32,
      angle: self.facing === 1 ? 0 : 180,
      vars: { index: i },
    });
  }
  emit(state, 'vfx', 'andShowYou', self.x, self.y + 56, 1);
  emit(state, 'sfx', 'andShowYou', self.x, 0, 0);
});

registerHitHook('mk2f2:andShowYouHit', (ctx) => {
  applyDivineShock(ctx.def, 2);
  applyMark(ctx.atk, ctx.def, 1);
  f2Reward(ctx);
});

registerHitHook('mk2f2:confineHit', (ctx) => {
  const atk = ctx.atk;
  const opp = ctx.def;
  applyDivineShock(opp, 1);
  if (atk.char[CK.confineLive]) {
    const hits = (atk.char[CK.confineHits] ?? 0) + 1;
    atk.char[CK.confineHits] = hits;
    if (hits >= 2) applyStaticLock(opp);
    if (hits >= 3) applyMark(atk, opp, 1);
  }
  addCharge(atk, 1);
});

registerMoveHook('mk2f2:unrelentingMightStart', (ctx) => {
  const { self, state } = ctx;
  for (let i = 0; i < 8; i++) {
    const row = i % 4;
    spawnShot(state, self, F2.arraySpear, {
      x: self.x + 34 * self.facing,
      y: 18 + row * 30,
      vars: { index: i },
    });
  }
  state.stormFlash = 1;
  state.stormFlashDecay = 0.03;
  emit(state, 'vfx', 'myUnrelentingMight', self.x, self.y + 60, 1);
  emit(state, 'sfx', 'mightOfMine', self.x, 0, 0);
  shake(state, 18);
});

registerHitHook('mk2f2:arraySpearHit', (ctx) => {
  applyDivineShock(ctx.def, 2);
  if (ctx.def.statuses.staticLock.stacks === 0) applyStaticLock(ctx.def);
  f2Reward(ctx);
});

registerMoveHook('mk2f2:judgementCreatorStart', (ctx) => {
  const { self, opp, state } = ctx;
  const shock = drainDivineShock(opp, 3);
  if (shock > 0) {
    self.dmgScale = 1 + 0.2 * shock;
    rewardConsume(state, self, shock);
  }
  self.x = opp.x - 100 * self.facing;
  self.y = 0;
  clampToStage(self);
  state.stormFlash = 1;
  state.stormFlashDecay = 0.02;
  emit(state, 'vfx', 'judgementCreator', self.x, self.y + 70, 1);
  emit(state, 'sfx', 'judgementCreator', self.x, 0, 0);
  shake(state, 20);
});

registerHitHook('mk2f2:judgementCreatorHit', (ctx) => {
  applyDivineShock(ctx.def, 2);
  if (ctx.def.statuses.heavensMark.stacks > 0) {
    ctx.atk.dmgScale = Math.max(ctx.atk.dmgScale, 1.15);
  }
  f2Reward(ctx);
});

registerHitHook('mk2f2:dischargeHit', (ctx) => {
  applyDivineShock(ctx.def, 1);
  addCharge(ctx.atk, 1);
});

registerHitHook('mk2f2:trailHit', (ctx) => {
  applyDivineShock(ctx.def, 1);
});

registerHitHook('mk2f2:pillarHit', (ctx) => {
  applyDivineShock(ctx.def, 1);
  addCharge(ctx.atk, 1);
});

registerHitHook('mk2f2:refineHit', (ctx) => {
  applyDivineShock(ctx.def, 1);
  addCharge(ctx.atk, 1);
});

registerMoveHook('mk2f2:refineStart', (ctx) => {
  startExecution(ctx, 'refine', 'creatorRefineMe');
  ctx.state.storm = 1;
});

registerMoveHook('mk2f2:mightStart', (ctx) => {
  startExecution(ctx, 'might', 'mightOfCreator');
  ctx.state.storm = 1;
});

export { SPECIALS as MK2_FORM1_CHAINS, F2_SPECIALS as MK2_FORM2_CHAINS };
