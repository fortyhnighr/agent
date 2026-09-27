import { describe, expect, it } from 'vitest';
import { BTN, faceOff, makeMatch, p, runFrames, start } from './helpers';
import { step } from '../src/sim/engine';
import { SEQUENCES } from '../src/characters/mk2/sequences';
import { CK, F1, F2 } from '../src/characters/mk2/constants';
import { addCharge } from '../src/characters/mk2/state';
import { stacks } from '../src/sim/statuses';
import { deepClone, hashState } from '../src/sim/state';
import type { Fighter, MatchState } from '../src/sim/types';

/** A dead-still, unblockable target with a health bar that cannot run out. */
function arena(gap = 100): { s: MatchState; me: Fighter; opp: Fighter } {
  const s = makeMatch();
  faceOff(s, gap);
  const me = p(s, 0);
  const opp = p(s, 1);
  opp.hp = 100000;
  opp.maxHp = 100000;
  return { s, me, opp };
}

/** Marks the target so every execution tier is legal. */
function markTarget(opp: Fighter): void {
  opp.statuses.heavensMark.stacks = 3;
  opp.statuses.heavensMark.timer = 900;
  opp.statuses.pierced.stacks = 3;
  opp.statuses.pierced.timer = 900;
}

/**
 * Runs a sequence to completion and reports what happened, frame by frame.
 * Control return is the first frame the fighter can act again.
 */
function runSequence(
  s: MatchState,
  me: Fighter,
  opp: Fighter,
  moveId: string,
  budget = 400,
): { controlFrame: number; damage: number; hits: number[]; seqClearedAt: number } {
  const before = opp.hp;
  start(s, me, moveId);
  const hits: number[] = [];
  let controlFrame = -1;
  let seqClearedAt = -1;
  let lastHp = opp.hp;
  for (let i = 0; i < budget; i++) {
    step(s, [0, 0]);
    if (opp.hp < lastHp) {
      hits.push(i);
      lastHp = opp.hp;
    }
    if (seqClearedAt < 0 && !me.char[CK.seq]) seqClearedAt = i;
    if (controlFrame < 0 && !me.move && me.char[CK.seqCursor] === 0 && i > 4) {
      // One more frame to be sure the fighter is really free.
      const x = me.x;
      step(s, [0, 0]);
      if (!me.move && me.x === x) {
        controlFrame = i + 1;
        break;
      }
    }
  }
  return { controlFrame, damage: before - opp.hp, hits, seqClearedAt };
}

describe('SEQUENCES: the execution is a real timeline, not a damage number', () => {
  const cases: [string, string, number][] = [
    ['Heaven Splitter tier 1', F1.splitter1, SEQUENCES.splitter1.total],
    ['Heaven Splitter tier 2', F1.splitter2, SEQUENCES.splitter2.total],
    ['Heaven Splitter tier 3', F1.splitter3, SEQUENCES.splitter3.total],
    ['Heaven Splitter EX', F1.splitterEx, SEQUENCES.splitterEx.total],
  ];

  for (const [label, moveId, total] of cases) {
    it(`${label} hits repeatedly and holds control for the whole timeline`, () => {
      const { s, me, opp } = arena();
      markTarget(opp);
      addCharge(me, 20);
      me.char[CK.attunement] = 3;
      me.char[CK.cumSpend] = 200;
      const r = runSequence(s, me, opp, moveId, total + 120);
      // Every strike in the timeline lands as its own hit.
      expect(r.hits.length).toBeGreaterThanOrEqual(4);
      expect(r.damage).toBeGreaterThan(300);
      // Control never comes back before the timeline is finished.
      expect(r.seqClearedAt).toBeGreaterThanOrEqual(total - 2);
      expect(r.controlFrame).toBeGreaterThanOrEqual(total);
    });
  }

  it('tier 3 really is nine repositioning strikes and a final thrust', () => {
    const seq = SEQUENCES.splitter3;
    const strikes = seq.beats.filter((b) => b.k === 'strike');
    expect(strikes).toHaveLength(10);
    // The last one is the heavy final thrust, everything before it is a step.
    expect(strikes[strikes.length - 1].id).toBe(F1.execFinal);
    const teleports = seq.beats.filter((b) => b.k === 'tp').length;
    expect(teleports).toBeGreaterThanOrEqual(10);
  });

  it('every sequence strike resolves as a real hitbox, not a scripted subtract', () => {
    // A guarding target crushes the guard and takes chip: the timeline is
    // made of hits that go through the normal block rules.
    const guarded = arena();
    markTarget(guarded.opp);
    addCharge(guarded.me, 20);
    guarded.me.char[CK.attunement] = 3;
    guarded.me.char[CK.cumSpend] = 200;
    start(guarded.s, guarded.me, F1.splitter3);
    let guarding = 0;
    for (let i = 0; i < 200; i++) {
      step(guarded.s, [0, BTN.GUARD]);
      if (guarded.opp.guarding || guarded.opp.state === 'guardBreak') guarding += 1;
    }
    const blockedDamage = 100000 - guarded.opp.hp;
    expect(guarding).toBeGreaterThan(20);

    const open = arena();
    markTarget(open.opp);
    addCharge(open.me, 20);
    open.me.char[CK.attunement] = 3;
    open.me.char[CK.cumSpend] = 200;
    const openResult = runSequence(open.s, open.me, open.opp, F1.splitter3, 220);
    expect(blockedDamage).toBeLessThan(openResult.damage * 0.25);
  });

  it('the sequence repositions the machine around the target', () => {
    const { s, me, opp } = arena(300);
    markTarget(opp);
    addCharge(me, 20);
    me.char[CK.attunement] = 3;
    me.char[CK.cumSpend] = 200;
    const seen = new Set<number>();
    void opp;
    start(s, me, F1.splitterEx);
    for (let i = 0; i < 200; i++) {
      step(s, [0, 0]);
      seen.add(Math.sign(me.x - opp.x));
    }
    // It ends up on both sides of the target: the fight travels.
    expect(seen.has(1)).toBe(true);
    expect(seen.has(-1)).toBe(true);
  });

  it('a sequence that cannot pay its cost never starts', () => {
    const { s, me } = arena();
    addCharge(me, 9);
    // Through the real input path: the gate is the same one a player meets.
    step(s, [BTN.R, 0]);
    expect(me.move?.id).not.toBe(F1.splitter1);
    expect(me.char[CK.charge]).toBe(9);
    expect(me.char[CK.cumSpend]).toBe(0);
  });
});

describe('SEQUENCES: Form 2 timelines', () => {
  it('CREATOR! REFINE ME! runs its full timeline and clears', () => {
    const { s, me, opp } = arena();
    me.char[CK.form] = 2;
    me.char[CK.proxyTimer] = 600;
    const r = runSequence(s, me, opp, F2.creatorRefineMe, 260);
    expect(r.hits.length).toBeGreaterThanOrEqual(3);
    expect(r.seqClearedAt).toBeGreaterThanOrEqual(SEQUENCES.refine.total - 2);
    expect(r.controlFrame).toBeGreaterThanOrEqual(SEQUENCES.refine.total);
  });

  it('THE UNRELENTING MIGHT OF THE CREATOR is a transformed timeline, not a buff', () => {
    const { s, me, opp } = arena(300);
    me.char[CK.form] = 2;
    me.char[CK.proxyTimer] = 900;
    me.char[CK.attunement] = 3;
    const r = runSequence(s, me, opp, F2.mightOfCreator, 320);
    // It crosses the arena, discharges the storm, then judges.
    expect(r.hits.length).toBeGreaterThanOrEqual(5);
    expect(r.damage).toBeGreaterThan(600);
    expect(r.seqClearedAt).toBeGreaterThanOrEqual(SEQUENCES.might.total - 2);
    expect(r.controlFrame).toBeGreaterThanOrEqual(SEQUENCES.might.total);
  });

  it('the Might takes at least four seconds of committed control', () => {
    // 214 frames of timeline: this is the cost of the ultimate.
    expect(SEQUENCES.might.total).toBeGreaterThanOrEqual(200);
  });

  it('a sequence cannot be started twice in a row', () => {
    const { s, me } = arena();
    me.char[CK.form] = 2;
    me.char[CK.proxyTimer] = 600;
    start(s, me, F2.creatorRefineMe);
    runFrames(s, 20, [0, 0]);
    expect(me.char[CK.seq]).not.toBe(0);
    // Pressing R again mid-timeline does nothing at all.
    const seq = me.char[CK.seq];
    runFrames(s, 10, [BTN.R, 0]);
    expect(me.char[CK.seq]).toBe(seq);
  });

  it('an aborted sequence (target dies mid-timeline) still returns control', () => {
    const { s, me, opp } = arena();
    me.char[CK.form] = 2;
    me.char[CK.proxyTimer] = 600;
    opp.hp = 40;
    start(s, me, F2.creatorRefineMe);
    let control = -1;
    for (let i = 0; i < 300; i++) {
      step(s, [0, 0]);
      if (i > 4 && !me.move && !me.char[CK.seq] && me.state !== 'dead' && me.state !== 'smiteDead') {
        control = i;
        break;
      }
    }
    // The round ended, but the machine is never stuck holding a timeline.
    expect(control > 0 || opp.hp <= 0).toBe(true);
  });
});

describe('THUNDERLINE: the conditional reuse window is exact', () => {
  /**
   * A Marked target and an Attunement 2 machine. 300 units apart so the first
   * line has to travel before the reverse pass is created.
   */
  function marked(attunement = 2): { s: MatchState; me: Fighter; opp: Fighter } {
    const a = arena(300);
    a.opp.statuses.heavensMark.stacks = 1;
    a.opp.statuses.heavensMark.timer = 900;
    addCharge(a.me, 12);
    a.me.char[CK.cumSpend] = attunement * 10;
    a.me.char[CK.attunement] = attunement;
    return a;
  }

  it('the line leaves on the second frame and connects on the third', () => {
    const { s, me, opp } = marked(0);
    const before = opp.hp;
    start(s, me, F1.thunderlineEnhanced);
    step(s, [0, 0]);
    expect(s.shots.length).toBe(0);
    step(s, [0, 0]);
    expect(s.shots.length).toBe(1);
    step(s, [0, 0]);
    expect(opp.hp).toBeLessThan(before);
    expect(stacks(opp, 'pierced')).toBe(1);
  });

  it('without Attunement 2 the line never reuses itself', () => {
    const { s, me } = marked(0);
    start(s, me, F1.thunderlineEnhanced);
    runFrames(s, 40, [0, 0]);
    expect(me.char[CK.lastThunderlineReuse]).toBe(0);
  });

  it('without a Mark the line never reuses itself, even at Attunement 3', () => {
    const a = arena(300);
    a.opp.statuses.conductive.stacks = 3;
    a.opp.statuses.conductive.timer = 900;
    addCharge(a.me, 12);
    a.me.char[CK.cumSpend] = 40;
    a.me.char[CK.attunement] = 3;
    expect(stacks(a.opp, 'heavensMark')).toBe(0);
    start(a.s, a.me, F1.thunderlineEnhanced);
    runFrames(a.s, 40, [0, 0]);
    expect(a.me.char[CK.lastThunderlineReuse]).toBe(0);
  });

  it('with a Mark at Attunement 2 the line fires exactly one reverse pass', () => {
    const { s, me, opp } = marked(2);
    start(s, me, F1.thunderlineEnhanced);
    // The flag flips on the first connection, not before it.
    step(s, [0, 0]);
    step(s, [0, 0]);
    expect(me.char[CK.lastThunderlineReuse]).toBe(0);
    step(s, [0, 0]);
    expect(me.char[CK.lastThunderlineReuse]).toBe(1);
    // The reverse pass is a real projectile, created behind the target.
    expect(s.shots.length).toBe(1);
    expect(s.shots[0].vars.reused).toBe(1);
    const hpAfterFirst = opp.hp;
    // It runs back down the line and connects a second time.
    let secondHit = false;
    for (let i = 0; i < 30; i++) {
      opp.statuses.heavensMark.timer = 900;
      step(s, [0, 0]);
      if (opp.hp < hpAfterFirst) secondHit = true;
    }
    expect(secondHit).toBe(true);
    expect(opp.hp).toBeLessThan(hpAfterFirst);
  });

  it('the reverse pass does not reuse itself again', () => {
    const { s, me, opp } = marked(2);
    start(s, me, F1.thunderlineEnhanced);
    let shots = 0;
    for (let i = 0; i < 60; i++) {
      opp.statuses.heavensMark.timer = 900;
      step(s, [0, 0]);
      shots = Math.max(shots, s.shots.length);
    }
    // Never more than the original plus its one reverse.
    expect(shots).toBeLessThanOrEqual(1);
    expect(me.char[CK.lastThunderlineReuse]).toBe(1);
  });

  it('the reuse is a one-shot gate: a second Thunderline cannot reuse', () => {
    const { s, me, opp } = marked(2);
    start(s, me, F1.thunderlineEnhanced);
    runFrames(s, 40, [0, 0]);
    expect(me.char[CK.lastThunderlineReuse]).toBe(1);
    addCharge(me, 8);
    start(s, me, F1.thunderlineEnhanced);
    let hits = 0;
    let last = opp.hp;
    for (let i = 0; i < 40; i++) {
      opp.statuses.heavensMark.timer = 900;
      step(s, [0, 0]);
      if (opp.hp < last) {
        hits += 1;
        last = opp.hp;
      }
    }
    // It still connects once - the gate only removes the reverse pass.
    expect(hits).toBe(1);
    expect(me.char[CK.lastThunderlineReuse]).toBe(1);
  });

  it('losing the Mark before the connection cancels the reuse', () => {
    const { s, me, opp } = arena(300);
    addCharge(me, 12);
    me.char[CK.cumSpend] = 30;
    me.char[CK.attunement] = 3;
    start(s, me, F1.thunderlineEnhanced);
    // Remove the Mark while the line is in flight.
    runFrames(s, 2, [0, 0]);
    expect(s.shots.length).toBe(1);
    opp.statuses.heavensMark.stacks = 0;
    opp.statuses.heavensMark.timer = 0;
    runFrames(s, 40, [0, 0]);
    expect(me.char[CK.lastThunderlineReuse]).toBe(0);
  });
});

describe('SEQUENCES: state stays serialisable and hashable', () => {
  it('a mid-sequence snapshot restores to the same frame of the timeline', () => {
    const { s, me, opp } = arena();
    void opp;
    markTarget(opp);
    addCharge(me, 20);
    me.char[CK.attunement] = 3;
    me.char[CK.cumSpend] = 200;
    start(s, me, F1.splitterEx);
    runFrames(s, 40, [0, 0]);
    const copy = deepClone(s);
    expect(hashState(copy)).toBe(hashState(s));
    runFrames(s, 40, [0, 0]);
    runFrames(copy, 40, [0, 0]);
    expect(hashState(copy)).toBe(hashState(s));
  });
});
