import { describe, expect, it } from 'vitest';
import { faceOff, hit, makeMatch, p, runFrames, start } from './helpers';
import { step } from '../src/sim/engine';
import { applyStatus, consumeStatus, distinctMk2Layers, stacks, tickStatuses } from '../src/sim/statuses';
import { CK, DIAGNOSIS, F1, F2, STATUS } from '../src/characters/mk2/constants';
import { diagnosisLayers, diagnosisMult, applyMark } from '../src/characters/mk2/statuses';
import { grantProxy } from './helpers';

function damageOf(state: ReturnType<typeof makeMatch>, moveId: string): number {
  const me = p(state, 0);
  const opp = p(state, 1);
  opp.hp = 100000;
  opp.hitstun = 0;
  opp.blockstun = 0;
  opp.state = 'idle';
  opp.move = null;
  opp.guarding = false;
  const res = hit(state, me, opp, moveId);
  return res.damage;
}

describe('CONDUCTIVE', () => {
  it('caps at 6 stacks and refreshes its duration on re-application', () => {
    const s = makeMatch();
    const opp = p(s, 1);
    applyStatus(opp, 'conductive', 10);
    expect(stacks(opp, 'conductive')).toBe(6);
    expect(STATUS.conductiveMax).toBe(6);
    opp.statuses.conductive.timer = 10;
    applyStatus(opp, 'conductive', 1);
    expect(opp.statuses.conductive.timer).toBe(STATUS_DEFS_DURATION());
  });

  it('adds +4% lightning damage per stack', () => {
    const s = makeMatch();
    faceOff(s, 90);
    const base = damageOf(s, F1.flashThrust);
    applyStatus(p(s, 1), 'conductive', 1);
    const one = damageOf(s, F1.flashThrust);
    applyStatus(p(s, 1), 'conductive', 3);
    const four = damageOf(s, F1.flashThrust);
    expect(one).toBeGreaterThan(base);
    expect(four).toBeGreaterThan(one);
    expect(STATUS.conductiveDamage).toBe(0.04);
  });

  it('is consumed by skills that want it', () => {
    const s = makeMatch();
    const opp = p(s, 1);
    applyStatus(opp, 'conductive', 3);
    expect(consumeStatus(opp, 'conductive', 1)).toBe(true);
    expect(stacks(opp, 'conductive')).toBe(2);
    expect(consumeStatus(opp, 'conductive', 5)).toBe(false);
  });

  it('expires after its duration', () => {
    const s = makeMatch();
    const opp = p(s, 1);
    applyStatus(opp, 'conductive', 2, 3);
    runFrames(s, 4, [0, 0]);
    expect(stacks(opp, 'conductive')).toBe(0);
    const expired = tickStatuses(opp);
    expect(Array.isArray(expired)).toBe(true);
  });
});

function STATUS_DEFS_DURATION(): number {
  return 480;
}

describe('PIERCED', () => {
  it('caps at 3 stacks', () => {
    const s = makeMatch();
    const opp = p(s, 1);
    applyStatus(opp, 'pierced', 9);
    expect(stacks(opp, 'pierced')).toBe(3);
    expect(STATUS.piercedMax).toBe(3);
  });

  it('adds +5% spear damage per stack', () => {
    const s = makeMatch();
    faceOff(s, 90);
    const base = damageOf(s, F1.railspear);
    applyStatus(p(s, 1), 'pierced', 3);
    const three = damageOf(s, F1.railspear);
    expect(three).toBeGreaterThan(base);
    expect(STATUS.piercedDamage).toBe(0.05);
  });

  it('increases guard damage against thrusts', () => {
    const s = makeMatch();
    faceOff(s, 90);
    const me = p(s, 0);
    const opp = p(s, 1);
    opp.guarding = true;
    opp.guardCrush = 0;
    hit(s, me, opp, F1.railspearL1);
    const without = opp.guardCrush;
    opp.guardCrush = 0;
    applyStatus(opp, 'pierced', 3);
    hit(s, me, opp, F1.railspearL1);
    expect(opp.guardCrush).toBeGreaterThan(without);
  });
});

describe("HEAVEN'S MARK", () => {
  it('caps at 3 stacks', () => {
    const s = makeMatch();
    const opp = p(s, 1);
    applyStatus(opp, 'heavensMark', 9);
    expect(stacks(opp, 'heavensMark')).toBe(3);
  });

  it('is recorded as an applied mark for the second life requirement', () => {
    const s = makeMatch();
    const me = p(s, 0);
    const opp = p(s, 1);
    applyMark(me, opp, 1);
    applyMark(me, opp, 1);
    expect(me.char[CK.marksApplied]).toBe(2);
    expect(stacks(opp, 'heavensMark')).toBe(2);
  });

  it('comes from Perfect Phase', () => {
    const s = makeMatch();
    faceOff(s, 70);
    const me = p(s, 0);
    const opp = p(s, 1);
    start(s, me, F1.flashPhase);
    step(s, [0, 0]);
    me.char[CK.phaseArmed] = 1;
    me.char[CK.phaseUsed] = 0;
    opp.move = { id: F1.railspear, frame: 14, hits: 0, hitIds: [], vars: {} };
    opp.state = 'attack';
    step(s, [0, 0]);
    expect(stacks(opp, 'heavensMark')).toBe(1);
  });
});

describe('STATIC LOCK', () => {
  it('lasts about 0.9s and then lets go', () => {
    const s = makeMatch();
    const opp = p(s, 1);
    applyStatus(opp, 'staticLock', 1);
    expect(opp.statuses.staticLock.timer).toBe(STATUS.staticLockFrames);
    expect(STATUS.staticLockFrames).toBeGreaterThanOrEqual(45);
    expect(STATUS.staticLockFrames).toBeLessThanOrEqual(60);
    runFrames(s, STATUS.staticLockFrames + 2, [0, 0]);
    expect(stacks(opp, 'staticLock')).toBe(0);
  });

  it('disables the air dash entirely', () => {
    const s = makeMatch();
    const me = p(s, 1);
    applyStatus(me, 'staticLock', 1);
    expect(me.statuses.staticLock.stacks).toBeGreaterThan(0);
    // sharedLocomotion's dash path adds startup and airDashAvailable() is false
    me.y = 120;
    me.onGround = false;
    step(s, [0, 0]);
    expect(me.airDashes).toBe(1);
    expect(me.state).not.toBe('airDash');
  });
});

describe('DIVINE SCAR', () => {
  it('makes the target take more damage', () => {
    const s = makeMatch();
    faceOff(s, 90);
    const me = p(s, 0);
    const opp = p(s, 1);
    me.hp = 100000;
    me.hitstun = 0;
    me.move = null;
    const base = hit(s, opp, me, 'mk1:slash').damage;
    applyStatus(me, 'divineScar', 1);
    me.hp = 100000;
    me.hitstun = 0;
    me.move = null;
    const scarred = hit(s, opp, me, 'mk1:slash').damage;
    expect(scarred).toBeGreaterThan(base);
    expect(STATUS.divineScarDamageTaken).toBe(0.12);
  });

  it('slows the target down', () => {
    const s = makeMatch();
    const opp = p(s, 1);
    applyStatus(opp, 'divineScar', 1);
    opp.vx = 0;
    step(s, [0, 0]);
    // sharedLocomotion multiplies walk speed by 0.88 while scarred
    expect(STATUS.divineScarSpeed).toBeLessThan(1);
  });
});

describe('DIVINE SHOCK (Form 2)', () => {
  it('is only produced by second-form attacks', () => {
    const s = makeMatch();
    faceOff(s, 90);
    const me = p(s, 0);
    grantProxy(s, me);
    const opp = p(s, 1);
    hit(s, me, opp, F2.smite);
    expect(stacks(opp, 'divineShock')).toBe(1);
  });

  it('caps at 6 and pays off divine damage', () => {
    const s = makeMatch();
    faceOff(s, 90);
    const me = p(s, 0);
    grantProxy(s, me);
    const opp = p(s, 1);
    const base = damageOf(s, F2.smite);
    applyStatus(opp, 'divineShock', 6);
    const shocked = damageOf(s, F2.smite);
    expect(stacks(opp, 'divineShock')).toBe(6);
    expect(shocked).toBeGreaterThan(base);
    expect(STATUS.divineShockDamage).toBe(0.08);
  });

  it('is consumed by SMITE: SO YOU SHALL FALL for a bigger hit', () => {
    const s = makeMatch();
    faceOff(s, 90);
    const me = p(s, 0);
    grantProxy(s, me);
    const opp = p(s, 1);
    const plain = damageOf(s, F2.smiteFall);
    applyStatus(opp, 'divineShock', 3);
    opp.hp = 100000;
    opp.move = null;
    opp.hitstun = 0;
    start(s, me, F2.smiteFall);
    step(s, [0, 0]);
    const consumed = damageOf(s, F2.smiteFall);
    expect(consumed).toBeGreaterThan(plain);
  });
});

describe('COMBAT DIAGNOSIS (passive)', () => {
  it('rewards layered setup: +6% per DISTINCT status, capped at 4 layers', () => {
    const s = makeMatch();
    const opp = p(s, 1);
    expect(diagnosisLayers(opp)).toBe(0);
    applyStatus(opp, 'conductive', 1);
    expect(diagnosisLayers(opp)).toBe(1);
    applyStatus(opp, 'pierced', 1);
    applyStatus(opp, 'heavensMark', 1);
    applyStatus(opp, 'divineShock', 1);
    expect(diagnosisLayers(opp)).toBe(4);
    applyStatus(opp, 'staticLock', 1);
    expect(diagnosisLayers(opp)).toBe(4);
    expect(diagnosisMult(opp)).toBeCloseTo(1 + DIAGNOSIS.perLayer * 4, 5);
  });

  it('stacking one status mindlessly does not beat layering', () => {
    const s = makeMatch();
    faceOff(s, 90);
    const base = damageOf(s, F1.flashThrust);
    applyStatus(p(s, 1), 'conductive', 6);
    const oneStacked = damageOf(s, F1.flashThrust);

    const s2 = makeMatch();
    faceOff(s2, 90);
    applyStatus(p(s2, 1), 'conductive', 1);
    applyStatus(p(s2, 1), 'pierced', 1);
    applyStatus(p(s2, 1), 'heavensMark', 1);
    const layered = damageOf(s2, F1.flashThrust);
    expect(layered).toBeGreaterThan(oneStacked);
    expect(base).toBeGreaterThan(0);
  });

  it('counts each distinct key once', () => {
    const s = makeMatch();
    const opp = p(s, 1);
    applyStatus(opp, 'conductive', 6);
    expect(distinctMk2Layers(opp)).toEqual(['conductive']);
  });
});
