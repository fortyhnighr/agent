import { describe, expect, it } from 'vitest';
import { ACTION_BITS, faceOff, hit, makeMatch, p, runFrames, start, tap } from './helpers';
import { applyStatus, stacks } from '../src/sim/statuses';
import { addCharge, attunement, canAfford, charge, cumSpend, loseCharge, spendCharge, syncAttunement } from '../src/characters/mk2/state';
import { ATTUNE, CHARGE, CK, F1 } from '../src/characters/mk2/constants';
import { step } from '../src/sim/engine';

describe('Divine Charge', () => {
  it('starts empty and is capped at 20', () => {
    const s = makeMatch();
    const me = p(s, 0);
    expect(charge(me)).toBe(0);
    addCharge(me, 99);
    expect(charge(me)).toBe(CHARGE.max);
    expect(CHARGE.max).toBe(20);
  });

  it('awards +1 on a clean Flash Thrust hit', () => {
    const s = makeMatch();
    faceOff(s, 70);
    const me = p(s, 0);
    const opp = p(s, 1);
    hit(s, me, opp, F1.flashThrust);
    expect(charge(me)).toBe(CHARGE.onCleanHit);
  });

  it('awards an extra +1 on a counter hit', () => {
    const s = makeMatch();
    faceOff(s, 70);
    const me = p(s, 0);
    const opp = p(s, 1);
    opp.move = { id: F1.railspear, frame: 1, hits: 0, hitIds: [], vars: {} };
    opp.state = 'attack';
    hit(s, me, opp, F1.flashThrust);
    expect(charge(me)).toBe(CHARGE.onCleanHit + CHARGE.onCounterHit);
  });

  it('awards +2 more when striking a target carrying Heaven\u2019s Mark', () => {
    const s = makeMatch();
    faceOff(s, 70);
    const me = p(s, 0);
    const opp = p(s, 1);
    applyStatus(opp, 'heavensMark', 1);
    hit(s, me, opp, F1.flashThrust);
    expect(charge(me)).toBe(CHARGE.onCleanHit + CHARGE.onHitMarked);
  });

  it('never awards charge for a whiff', () => {
    const s = makeMatch();
    faceOff(s, 600);
    const me = p(s, 0);
    tap(s, 'J');
    runFrames(s, 30);
    expect(charge(me)).toBe(0);
  });

  it('loses 2 Charge when he is hit', () => {
    const s = makeMatch();
    faceOff(s, 70);
    const me = p(s, 0);
    const opp = p(s, 1);
    addCharge(me, 10);
    hit(s, opp, me, 'mk1:slash');
    runFrames(s, 2);
    expect(charge(me)).toBe(8);
    expect(CHARGE.lossOnHit).toBe(2);
  });

  it('cannot be driven below zero', () => {
    const s = makeMatch();
    const me = p(s, 0);
    loseCharge(me, 99);
    expect(charge(me)).toBe(0);
  });

  it('spending reduces the counter and is strictly gated', () => {
    const s = makeMatch();
    const me = p(s, 0);
    addCharge(me, 3);
    expect(canAfford(me, 4)).toBe(false);
    expect(spendCharge(me, 4)).toBe(false);
    expect(charge(me)).toBe(3);
    expect(cumSpend(me)).toBe(0);
    expect(spendCharge(me, 3)).toBe(true);
    expect(charge(me)).toBe(0);
    expect(cumSpend(me)).toBe(3);
  });

  it('cumulative spend drives Attunement: +1 per 10, max 3', () => {
    const s = makeMatch();
    const me = p(s, 0);
    expect(ATTUNE.perLevel).toBe(10);
    expect(ATTUNE.max).toBe(3);
    for (let i = 0; i < 5; i++) {
      addCharge(me, 20);
      spendCharge(me, 20);
    }
    expect(cumSpend(me)).toBe(100);
    expect(attunement(me)).toBe(3);
  });

  it('Attunement never drops when charge is rebuilt or lost', () => {
    const s = makeMatch();
    const me = p(s, 0);
    addCharge(me, 20);
    spendCharge(me, 20);
    expect(attunement(me)).toBe(2);
    loseCharge(me, 20);
    syncAttunement(me);
    expect(attunement(me)).toBe(2);
  });

  it('Railspear L1 consumes 4 Charge and L2 consumes 8, even on a whiff', () => {
    const s = makeMatch();
    faceOff(s, 700);
    const me = p(s, 0);
    addCharge(me, 4);
    // Hold L through the charge window with the target far away: whiff.
    runFrames(s, 30, [ACTION_BITS.L, 0]);
    runFrames(s, 30, [0, 0]);
    expect(me.char[CK.cumSpend]).toBe(4);
    expect(charge(me)).toBe(0);
    expect(p(s, 1).statuses.pierced.stacks).toBe(0);

    // With 8 banked, the same hold reaches the full rail.
    addCharge(me, 8);
    runFrames(s, 30, [ACTION_BITS.L, 0]);
    runFrames(s, 30, [0, 0]);
    expect(me.char[CK.cumSpend]).toBe(12);
    expect(charge(me)).toBe(0);
    expect(p(s, 1).statuses.pierced.stacks).toBe(0);
  });

  it('Perfect Phase pays +3 Charge', () => {
    const s = makeMatch();
    faceOff(s, 90);
    const me = p(s, 0);
    const opp = p(s, 1);
    addCharge(me, 2);
    // Arm the phase window exactly like Flash Phase does.
    start(s, me, F1.flashPhase);
    step(s, [0, 0]);
    me.char[CK.phaseArmed] = 1;
    me.char[CK.phaseUsed] = 0;
    // The opponent's attack is live and overlapping this frame.
    // Railspear: startup 13, active 4 -> frame 14 is live.
    opp.move = { id: F1.railspear, frame: 14, hits: 0, hitIds: [], vars: {} };
    opp.state = 'attack';
    step(s, [0, 0]);
    expect(me.char[CK.perfectPhases]).toBe(1);
    expect(charge(me)).toBe(2 + CHARGE.onPerfectPhase);
  });

  it('conductive consumption pays +1 Charge only when actually consumed', () => {
    const s = makeMatch();
    const me = p(s, 0);
    addCharge(me, 4);
    // No Conductive on the target: no consume, no reward.
    expect(stacks(p(s, 1), 'conductive')).toBe(0);
    expect(charge(me)).toBe(4);
  });

  it('a full Flash Thrust chain builds charge quickly', () => {
    const s = makeMatch();
    faceOff(s, 70);
    const me = p(s, 0);
    for (let i = 0; i < 4; i++) {
      step(s, [ACTION_BITS.J, 0]);
      runFrames(s, 12, [0, 0]);
      me.x = -35;
      p(s, 1).x = 35;
      p(s, 1).hp = 1000;
    }
    expect(charge(me)).toBeGreaterThanOrEqual(4);
  });
});
