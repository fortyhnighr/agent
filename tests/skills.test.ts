import { describe, expect, it } from 'vitest';
import { ACTION_BITS, faceOff, grantProxy, hit, makeMatch, p, runFrames, start, tap } from './helpers';
import { step } from '../src/sim/engine';
import { applyStatus, stacks } from '../src/sim/statuses';
import { canUse, meetsRequirements } from '../src/characters/mk2/logic';
import { CK, F1, F2, JUDGEMENT, SPLITTER } from '../src/characters/mk2/constants';
import { addCharge } from '../src/characters/mk2/state';
import { moveOf } from '../src/sim/registry';

function startId(f: ReturnType<typeof p>): string | null {
  return f.move ? f.move.id : null;
}

describe('FLASH PHASE / PERFECT PHASE', () => {
  it('is a plain displacement with no free invulnerability', () => {
    const s = makeMatch();
    faceOff(s, 120);
    const me = p(s, 0);
    tap(s, 'I');
    runFrames(s, 3);
    expect(startId(me)).toBe(F1.flashPhase);
    expect(moveOf(F1.flashPhase).invuln).toBeUndefined();
    step(s, [0, 0]);
    expect(me.invuln).toBe(0);
  });

  it('mistimes: you simply get hit', () => {
    const s = makeMatch();
    faceOff(s, 90);
    const me = p(s, 0);
    const hp = me.hp;
    start(s, me, F1.flashPhase);
    runFrames(s, 3);
    hit(s, p(s, 1), me, F1.railspear, { unblockable: true });
    expect(me.hp).toBeLessThan(hp);
    expect(me.char[CK.perfectPhases]).toBe(0);
  });

  it('a perfect phase grants invulnerability, +3 Charge, a Mark and a cancel window', () => {
    const s = makeMatch();
    faceOff(s, 90);
    const me = p(s, 0);
    const opp = p(s, 1);
    addCharge(me, 1);
    start(s, me, F1.flashPhase);
    step(s, [0, 0]);
    me.char[CK.phaseArmed] = 1;
    me.char[CK.phaseUsed] = 0;
    opp.move = { id: F1.railspear, frame: 14, hits: 0, hitIds: [], vars: {} };
    opp.state = 'attack';
    step(s, [0, 0]);
    expect(me.char[CK.perfectPhases]).toBe(1);
    expect(me.invuln).toBeGreaterThan(10);
    expect(me.char[CK.charge]).toBe(1 + 3);
    expect(stacks(opp, 'heavensMark')).toBe(1);
    expect(me.cancelTimer).toBeGreaterThan(0);
    // It ends up behind the opponent.
    expect(Math.sign(me.x - opp.x)).toBe(-Math.sign(opp.facing));
  });

  it('only pays out once per move', () => {
    const s = makeMatch();
    faceOff(s, 90);
    const me = p(s, 0);
    const opp = p(s, 1);
    start(s, me, F1.flashPhase);
    step(s, [0, 0]);
    me.char[CK.phaseArmed] = 1;
    me.char[CK.phaseUsed] = 1;
    opp.move = { id: F1.railspear, frame: 14, hits: 0, hitIds: [], vars: {} };
    opp.state = 'attack';
    step(s, [0, 0]);
    expect(me.char[CK.perfectPhases]).toBe(0);
  });
});

describe('STREAK LUNGE', () => {
  it('is a plain advancing thrust with no setup', () => {
    const s = makeMatch();
    faceOff(s, 300);
    const me = p(s, 0);
    const opp = p(s, 1);
    start(s, me, F1.streakLunge);
    step(s, [0, 0]);
    expect(me.invuln).toBe(0);
    expect(stacks(opp, 'conductive')).toBe(0);
  });

  it('earns travel invulnerability only by consuming 2+ Conductive', () => {
    const s = makeMatch();
    faceOff(s, 300);
    const me = p(s, 0);
    const opp = p(s, 1);
    applyStatus(opp, 'conductive', 2);
    start(s, me, F1.streakLunge);
    step(s, [0, 0]);
    expect(stacks(opp, 'conductive')).toBe(1);
    expect(me.invuln).toBeGreaterThan(10);
  });

  it('applies Pierced only on a counter hit', () => {
    const s = makeMatch();
    faceOff(s, 80);
    const me = p(s, 0);
    const opp = p(s, 1);
    hit(s, me, opp, F1.streakLunge);
    expect(stacks(opp, 'pierced')).toBe(0);
    opp.move = { id: F1.railspear, frame: 2, hits: 0, hitIds: [], vars: {} };
    opp.state = 'attack';
    hit(s, me, opp, F1.streakLunge);
    expect(stacks(opp, 'pierced')).toBe(1);
  });
});

describe('RAILSPEAR levels', () => {
  it('L1 needs exactly 4 Charge and spends it', () => {
    const s = makeMatch();
    faceOff(s, 400);
    const me = p(s, 0);
    addCharge(me, 3);
    expect(canUse(me, p(s, 1), F1.railspearL1)).toBe(false);
    addCharge(me, 1);
    expect(canUse(me, p(s, 1), F1.railspearL1)).toBe(true);
  });

  it('L2 needs 8 Charge', () => {
    const s = makeMatch();
    faceOff(s, 400);
    const me = p(s, 0);
    addCharge(me, 7);
    expect(canUse(me, p(s, 1), F1.railspearL2)).toBe(false);
    addCharge(me, 1);
    expect(canUse(me, p(s, 1), F1.railspearL2)).toBe(true);
  });

  it('whiffing still spends the Charge: mistakes should matter', () => {
    const s = makeMatch();
    faceOff(s, 700);
    const me = p(s, 0);
    addCharge(me, 8);
    step(s, [0, 0]);
    // Drive the real input path: hold L long enough for the L2 branch.
    runFrames(s, 40, [ACTION_BITS.L, 0]);
    runFrames(s, 4, [0, 0]);
    expect(me.char[CK.cumSpend]).toBeGreaterThanOrEqual(8);
    expect(p(s, 1).statuses.pierced.stacks).toBe(0);
  });

  it('L1 applies Pierced and Conductive on hit', () => {
    const s = makeMatch();
    faceOff(s, 80);
    const me = p(s, 0);
    const opp = p(s, 1);
    addCharge(me, 8);
    start(s, me, F1.railspearL1);
    runFrames(s, 3);
    hit(s, me, opp, F1.railspearL1);
    expect(stacks(opp, 'pierced')).toBe(1);
    expect(stacks(opp, 'conductive')).toBe(2);
  });

  it('L2 consumes Pierced for extra damage', () => {
    const s = makeMatch();
    faceOff(s, 90);
    const me = p(s, 0);
    const opp = p(s, 1);
    opp.hp = 100000;
    opp.hitstun = 0;
    const plain = hit(s, me, opp, F1.railspearL2).damage;
    runFrames(s, 16, [0, 0]);
    applyStatus(opp, 'pierced', 3);
    start(s, me, F1.railspearL2);
    runFrames(s, 3);
    expect(stacks(opp, 'pierced')).toBe(0);
    opp.hp = 100000;
    opp.hitstun = 0;
    opp.move = null;
    const consumed = hit(s, me, opp, F1.railspearL2).damage;
    expect(consumed).toBeGreaterThan(plain);
  });
});

describe('HEAVENFALL', () => {
  it('descends into an impalement', () => {
    const s = makeMatch();
    faceOff(s, 70);
    const me = p(s, 0);
    const opp = p(s, 1);
    start(s, me, F1.heavenfallRise);
    runFrames(s, 32);
    expect(startId(me)).toBe(F1.heavenfallFall);
    void opp;
  });

  it('consumes Conductive to amplify, and 3 consumed applies Static Lock', () => {
    const s = makeMatch();
    faceOff(s, 70);
    const me = p(s, 0);
    const opp = p(s, 1);
    applyStatus(opp, 'conductive', 3);
    start(s, me, F1.heavenfallFall);
    step(s, [0, 0]);
    expect(stacks(opp, 'conductive')).toBe(0);
    expect(me.dmgScale).toBeGreaterThan(1);
    hit(s, me, opp, F1.heavenfallFall);
    expect(stacks(opp, 'staticLock')).toBe(1);
  });

  it('the Divine ascent costs 6 Charge', () => {
    const s = makeMatch();
    faceOff(s, 300);
    const me = p(s, 0);
    addCharge(me, 5);
    expect(canUse(me, p(s, 1), F1.heavenfallRiseEnhanced)).toBe(false);
    addCharge(me, 1);
    expect(canUse(me, p(s, 1), F1.heavenfallRiseEnhanced)).toBe(true);
  });
});

describe('THUNDERLINE', () => {
  it('the enhanced version is gated on setup AND Charge', () => {
    const s = makeMatch();
    faceOff(s, 200);
    const me = p(s, 0);
    const opp = p(s, 1);
    addCharge(me, 10);
    expect(canUse(me, opp, F1.thunderlineEnhanced)).toBe(false);
    applyStatus(opp, 'conductive', 2);
    expect(canUse(me, opp, F1.thunderlineEnhanced)).toBe(true);
  });

  it("a Mark also unlocks it (2+ Conductive OR a Mark)", () => {
    const s = makeMatch();
    faceOff(s, 200);
    const me = p(s, 0);
    const opp = p(s, 1);
    addCharge(me, 10);
    applyStatus(opp, 'heavensMark', 1);
    expect(canUse(me, opp, F1.thunderlineEnhanced)).toBe(true);
  });

  it('aligns, fires the line, consumes Conductive and applies Pierced', () => {
    const s = makeMatch();
    faceOff(s, 200);
    const me = p(s, 0);
    const opp = p(s, 1);
    addCharge(me, 10);
    applyStatus(opp, 'conductive', 2);
    start(s, me, F1.thunderlineEnhanced);
    runFrames(s, 2);
    expect(stacks(opp, 'conductive')).toBe(1);
    expect(s.shots.length).toBe(1);
    runFrames(s, 14);
    expect(stacks(opp, 'pierced')).toBeGreaterThanOrEqual(1);
  });

  it('reuses the line once at Attunement 2+ against a Marked target', () => {
    const s = makeMatch();
    faceOff(s, 200);
    const me = p(s, 0);
    const opp = p(s, 1);
    addCharge(me, 10);
    me.char[CK.attunement] = 2;
    applyStatus(opp, 'conductive', 2);
    applyStatus(opp, 'heavensMark', 1);
    start(s, me, F1.thunderlineEnhanced);
    runFrames(s, 40);
    expect(me.char[CK.lastThunderlineReuse]).toBe(1);
  });

  it('does not reuse without Attunement 2', () => {
    const s = makeMatch();
    faceOff(s, 200);
    const me = p(s, 0);
    const opp = p(s, 1);
    addCharge(me, 10);
    applyStatus(opp, 'conductive', 2);
    applyStatus(opp, 'heavensMark', 1);
    start(s, me, F1.thunderlineEnhanced);
    runFrames(s, 40);
    expect(me.char[CK.lastThunderlineReuse]).toBe(0);
  });
});

describe("HEAVEN'S ARRAY", () => {
  it('costs 6 Charge and fires five spear lines', () => {
    const s = makeMatch();
    faceOff(s, 200);
    const me = p(s, 0);
    addCharge(me, 5);
    expect(canUse(me, p(s, 1), F1.heavensArray)).toBe(false);
    addCharge(me, 1);
    expect(canUse(me, p(s, 1), F1.heavensArray)).toBe(true);
    start(s, me, F1.heavensArray);
    step(s, [0, 0]);
    expect(s.shots.length).toBe(5);
  });

  it('3 connected lines apply Static Lock, all 5 apply Heaven\u2019s Mark', () => {
    // Partial connect: two of the five lines never reach the target. Three
    // connect, which is enough for Static Lock and not enough for a Mark.
    const partial = makeMatch();
    faceOff(partial, 400);
    const me = p(partial, 0);
    const opp = p(partial, 1);
    opp.hp = 100000;
    addCharge(me, 10);
    start(partial, me, F1.heavensArray);
    runFrames(partial, 4);
    expect(partial.shots.length).toBe(5);
    partial.shots.length = 3;
    runFrames(partial, 40);
    expect(stacks(opp, 'conductive')).toBe(3);
    expect(stacks(opp, 'staticLock')).toBe(1);
    expect(stacks(opp, 'heavensMark')).toBe(0);

    // Full connect: all five lines, the Mark is bought.
    const full = makeMatch();
    faceOff(full, 100);
    const me2 = p(full, 0);
    const opp2 = p(full, 1);
    opp2.hp = 100000;
    addCharge(me2, 10);
    start(full, me2, F1.heavensArray);
    runFrames(full, 12);
    expect(stacks(opp2, 'conductive')).toBe(5);
    // Static Lock only lasts ~0.9s, so check it inside its own window.
    expect(stacks(opp2, 'staticLock')).toBe(1);
    expect(stacks(opp2, 'heavensMark')).toBe(1);
  });
});

describe('JUDGEMENT BOLT', () => {
  it('does NOT activate without a Mark and 5 Charge - no pity version', () => {
    const s = makeMatch();
    faceOff(s, 200);
    const me = p(s, 0);
    addCharge(me, 20);
    tap(s, 'P');
    runFrames(s, 4);
    expect(startId(me)).not.toBe(F1.judgementBolt);
    applyStatus(p(s, 1), 'heavensMark', 1);
    tap(s, 'P');
    runFrames(s, 4);
    expect(startId(me)).toBe(F1.judgementBolt);
  });

  it('does NOT activate with a Mark but insufficient Charge', () => {
    const s = makeMatch();
    faceOff(s, 200);
    const me = p(s, 0);
    applyStatus(p(s, 1), 'heavensMark', 1);
    addCharge(me, 4);
    expect(meetsRequirements(me, p(s, 1), F1.judgementBolt)).toBe(false);
    tap(s, 'P');
    runFrames(s, 4);
    expect(startId(me)).not.toBe(F1.judgementBolt);
  });

  it('one Mark -> one bolt, three Marks -> three bolts, consuming a Mark and 5 Charge', () => {
    const s = makeMatch();
    faceOff(s, 220);
    const me = p(s, 0);
    const opp = p(s, 1);
    applyStatus(opp, 'heavensMark', 1);
    addCharge(me, 10);
    start(s, me, F1.judgementBolt);
    step(s, [0, 0]);
    expect(me.char[CK.boltTotal]).toBe(1);
    expect(stacks(opp, 'heavensMark')).toBe(0);
    expect(me.char[CK.charge]).toBe(5);

    const s2 = makeMatch();
    faceOff(s2, 220);
    const me2 = p(s2, 0);
    const opp2 = p(s2, 1);
    applyStatus(opp2, 'heavensMark', 3);
    addCharge(me2, 10);
    start(s2, me2, F1.judgementBolt);
    runFrames(s2, 2);
    expect(me2.char[CK.boltTotal]).toBe(3);
    expect(JUDGEMENT.cost).toBe(5);
  });

  it('the final bolt applies Static Lock and Pierced', () => {
    const s = makeMatch();
    faceOff(s, 200);
    const me = p(s, 0);
    const opp = p(s, 1);
    opp.hp = 100000;
    applyStatus(opp, 'heavensMark', 1);
    addCharge(me, 10);
    start(s, me, F1.judgementBolt);
    runFrames(s, 30);
    expect(stacks(opp, 'staticLock')).toBe(1);
    expect(stacks(opp, 'pierced')).toBeGreaterThanOrEqual(1);
  });
});

describe('HEAVEN SPLITTER: DIVINE EXECUTION tiers', () => {
  it('needs at least 10 Charge', () => {
    const s = makeMatch();
    faceOff(s, 400);
    const me = p(s, 0);
    addCharge(me, 9);
    expect(canUse(me, p(s, 1), F1.splitter1)).toBe(false);
    addCharge(me, 1);
    expect(canUse(me, p(s, 1), F1.splitter1)).toBe(true);
  });

  it('10-14 -> tier I, 15-19 -> tier II, 20 -> tier III', () => {
    const tiers: [number, string][] = [
      [10, F1.splitter1],
      [14, F1.splitter1],
      [15, F1.splitter2],
      [19, F1.splitter2],
      [20, F1.splitter3],
    ];
    for (const [amount, expected] of tiers) {
      const s = makeMatch();
      faceOff(s, 400);
      const me = p(s, 0);
      addCharge(me, amount);
      tap(s, 'R');
      runFrames(s, 3);
      expect(startId(me)).toBe(expected);
    }
  });

  it('tier damage scales with the charge committed', () => {
    const results: number[] = [];
    for (const moveId of [F1.splitter1, F1.splitter2, F1.splitter3]) {
      const s = makeMatch();
      faceOff(s, 90);
      const me = p(s, 0);
      const opp = p(s, 1);
      opp.hp = 100000;
      addCharge(me, 20);
      start(s, me, moveId);
      runFrames(s, 200);
      results.push(100000 - opp.hp);
    }
    expect(results[1]).toBeGreaterThan(results[0]);
    expect(results[2]).toBeGreaterThan(results[1]);
    expect(SPLITTER.t3.strikes).toBe(9);
  });

  it('the full execution needs Attunement 3 AND a Marked target', () => {
    const s = makeMatch();
    faceOff(s, 400);
    const me = p(s, 0);
    const opp = p(s, 1);
    addCharge(me, 20);
    expect(canUse(me, opp, F1.splitterEx)).toBe(false);
    me.char[CK.attunement] = 3;
    expect(canUse(me, opp, F1.splitterEx)).toBe(false);
    applyStatus(opp, 'heavensMark', 1);
    expect(canUse(me, opp, F1.splitterEx)).toBe(true);
    tap(s, 'R');
    runFrames(s, 3);
    expect(startId(me)).toBe(F1.splitterEx);
  });

  it('the execution applies Divine Scar on the full tier', () => {
    const s = makeMatch();
    faceOff(s, 90);
    const me = p(s, 0);
    const opp = p(s, 1);
    opp.hp = 100000;
    addCharge(me, 20);
    start(s, me, F1.splitter3);
    runFrames(s, 180);
    expect(stacks(opp, 'divineScar')).toBe(1);
  });
});

describe('FORM 2 SKILL REPLACEMENT', () => {
  it('every Form 1 name is replaced while the blessing is active', () => {
    const s = makeMatch();
    faceOff(s, 200);
    const me = p(s, 0);
    grantProxy(s, me);
    addCharge(me, 20);
    const cases: [string, string][] = [
      ['J', F2.smite],
      ['K', F2.smiteMedium],
      ['L', F2.smiteFall],
      ['I', F2.ahCreator],
      ['U', F2.decapitate],
      ['O', F2.andShowYou],
      ['P', F2.judgementCreator],
    ];
    for (const [key, expected] of cases) {
      // Wait for the previous move to finish before testing the next name.
      for (let i = 0; i < 260 && me.move; i++) runFrames(s, 1, [0, 0]);
      runFrames(s, 1, [ACTION_BITS[key as 'J'], 0]);
      runFrames(s, 1, [0, 0]);
      expect(startId(me)).toBe(expected);
    }
  });

  it('the Form 2 names are the declarations, not the techniques', () => {
    const names = [F2.smite, F2.smiteMedium, F2.smiteFall, F2.ahCreator, F2.decapitate, F2.andShowYou, F2.unrelentingMight, F2.judgementCreator, F2.creatorRefineMe, F2.mightOfCreator].map(
      (id) => moveOf(id).name,
    );
    expect(names).toContain('SMITE');
    expect(names).toContain('SMITE: MEDIUM ATTUNEMENT');
    expect(names).toContain('SMITE: SO YOU SHALL FALL');
    expect(names).toContain('AH… CREATOR!');
    expect(names).toContain('I WILL DECAPITATE YOU MYSELF.');
    expect(names).toContain('AND SHOW YOU…');
    expect(names).toContain('MY UNRELENTING MIGHT!');
    expect(names).toContain('JUDGEMENT: CREATOR');
    expect(names).toContain('CREATOR! REFINE ME!');
    expect(names).toContain('THE UNRELENTING MIGHT OF THE CREATOR');
  });

  it('AH… CREATOR! can still Perfect Phase', () => {
    const s = makeMatch();
    faceOff(s, 90);
    const me = p(s, 0);
    const opp = p(s, 1);
    grantProxy(s, me);
    start(s, me, F2.ahCreator);
    step(s, [0, 0]);
    me.char[CK.phaseArmed] = 1;
    me.char[CK.phaseUsed] = 0;
    me.invuln = 0;
    opp.move = { id: F1.railspear, frame: 14, hits: 0, hitIds: [], vars: {} };
    opp.state = 'attack';
    step(s, [0, 0]);
    expect(me.char[CK.perfectPhases]).toBe(1);
  });

  it('I WILL DECAPITATE YOU MYSELF. closes the distance itself', () => {
    const s = makeMatch();
    faceOff(s, 500);
    const me = p(s, 0);
    const opp = p(s, 1);
    grantProxy(s, me);
    start(s, me, F2.decapitate);
    runFrames(s, 2);
    expect(Math.abs(me.x - opp.x)).toBeLessThan(120);
  });

  it('R at maximum Attunement with the right state becomes THE UNRELENTING MIGHT OF THE CREATOR', () => {
    const s = makeMatch();
    faceOff(s, 200);
    const me = p(s, 0);
    const opp = p(s, 1);
    grantProxy(s, me);
    addCharge(me, 20);
    tap(s, 'R');
    runFrames(s, 3);
    expect(startId(me)).toBe(F2.creatorRefineMe);
    expect(canUse(me, opp, F2.mightOfCreator)).toBe(false);
    me.char[CK.attunement] = 3;
    expect(canUse(me, opp, F2.mightOfCreator)).toBe(false);
    applyStatus(opp, 'heavensMark', 1);
    expect(canUse(me, opp, F2.mightOfCreator)).toBe(true);
    runFrames(s, 200);
    tap(s, 'R');
    runFrames(s, 3);
    expect(startId(me)).toBe(F2.mightOfCreator);
  });

  it('3 Divine Shock also unlocks the Might, no Mark required', () => {
    const s = makeMatch();
    faceOff(s, 200);
    const me = p(s, 0);
    const opp = p(s, 1);
    grantProxy(s, me);
    me.char[CK.attunement] = 3;
    applyStatus(opp, 'divineShock', 3);
    expect(canUse(me, opp, F2.mightOfCreator)).toBe(true);
  });

  it('Form 1 names come back when the blessing is gone', () => {
    const s = makeMatch();
    faceOff(s, 200);
    const me = p(s, 0);
    grantProxy(s, me);
    me.char[CK.form] = 1;
    me.char[CK.proxyTimer] = 0;
    runFrames(s, 1, [ACTION_BITS.J, 0]);
    runFrames(s, 1, [0, 0]);
    expect(startId(me)).toBe(F1.flashThrust);
  });
});
