import { describe, expect, it } from 'vitest';
import { ACTION_BITS, BTN, faceOff, makeMatch, p, runFrames } from './helpers';
import { step } from '../src/sim/engine';
import { stacks } from '../src/sim/statuses';
import { CK } from '../src/characters/mk2/constants';
import { addCharge } from '../src/characters/mk2/state';
import { charOf } from '../src/sim/registry';
import { mk2AI } from '../src/characters/mk2/ai';
import type { Fighter, MatchState } from '../src/sim/types';

/**
 * A scripted "good player" for each character. These are the routes the design
 * intends: Mk. 1 is immediate and consistent, Mk. 2 has to be *played*.
 */
/** Forward is relative to the fighter: the pad bit that walks toward the opponent. */
function toward(self: Fighter): number {
  return self.facing === 1 ? BTN.RIGHT : BTN.LEFT;
}

function mk2Optimal(_state: MatchState, self: Fighter, opp: Fighter): number {
  if (self.move) return 0;
  const d = Math.abs(self.x - opp.x);
  const c = self.char[CK.charge];
  const mark = stacks(opp, 'heavensMark');
  const cond = stacks(opp, 'conductive');
  const fwd = self.facing === 1 ? BTN.RIGHT : BTN.LEFT;

  // 1. Cash out: the execution first, it is the biggest payoff in the game.
  if (c >= 20 && mark >= 1 && self.char[CK.attunement] >= 3 && d < 260) return BTN.R;
  if (c >= 10 && d < 220) return BTN.R;
  // 2. Punish: a Marked target is a Judgement Bolt.
  if (mark >= 1 && c >= 5 && d < 300) return BTN.P;
  // 3. Control: 3 Conductive becomes Static Lock through Heavenfall.
  if (cond >= 3 && d < 200 && c < 14) return BTN.U;
  // 4. Buy a Mark.
  if (mark < 1 && c >= 6 && d < 200) return BTN.DOWN | fwd | BTN.O;
  // 5. Layer and build.
  if (d > 120) return fwd;
  if (c >= 4 && cond >= 2 && d < 260) return BTN.O;
  return BTN.J;
}

function mk1Optimal(_state: MatchState, self: Fighter, opp: Fighter): number {
  if (self.move) return 0;
  const d = Math.abs(self.x - opp.x);
  const fwd = toward(self);
  // Mk. 1 has exactly one decision: Overdrive when the meter is full,
  // otherwise press the fast normal.
  if (self.meter >= 100 && d < 200) return BTN.R;
  if (d > 90) return fwd;
  return BTN.J;
}

/** A player with no plan: walk in, press the light attack on a fixed cadence. */
function mashing(s: MatchState, a: Fighter, b: Fighter): number {
  if (Math.abs(a.x - b.x) > 80) return toward(a);
  return s.frame % 18 === 0 ? BTN.J : 0;
}

function benchmark(
  who: 'mk1' | 'mk2',
  policy: (s: MatchState, a: Fighter, b: Fighter) => number,
  frames: number,
): { damage: number; dps: number } {
  const s = makeMatch({ p1: who, p2: who === 'mk1' ? 'mk2' : 'mk1' });
  faceOff(s, 110);
  const me = p(s, 0);
  const opp = p(s, 1);
  opp.hp = 100000;
  opp.maxHp = 100000;
  const start = opp.hp;
  for (let i = 0; i < frames; i++) step(s, [policy(s, me, opp), 0]);
  const damage = start - opp.hp;
  return { damage, dps: damage / (frames / 60) };
}

function aiBenchmark(who: 'mk1' | 'mk2', frames: number): number {
  const s = makeMatch({ p1: who, p2: who === 'mk1' ? 'mk2' : 'mk1' });
  faceOff(s, 150);
  const me = p(s, 0);
  const opp = p(s, 1);
  opp.hp = 100000;
  opp.maxHp = 100000;
  const brain = who === 'mk2' ? mk2AI : charOf('mk1').ai!;
  for (let i = 0; i < frames; i++) step(s, [brain(s, me, opp), 0]);
  return 100000 - opp.hp;
}

describe('BALANCE: Mk. 1 stays the easier, more consistent machine', () => {
  it('Mk. 1 deals damage with no setup at all', () => {
    const s = makeMatch({ p1: 'mk1' });
    faceOff(s, 80);
    const opp = p(s, 1);
    opp.hp = 100000;
    const before = opp.hp;
    step(s, [BTN.J, 0]);
    runFrames(s, 20, [0, 0]);
    expect(before - opp.hp).toBeGreaterThan(0);
  });

  it('Mk. 1 has no resource economy to learn', () => {
    const s = makeMatch({ p1: 'mk1' });
    const me = p(s, 0);
    expect(Object.keys(me.char).sort()).toEqual(['meterAcc', 'seq', 'seqCursor', 'seqFrame']);
    expect(me.maxHp).toBe(1000);
  });

  it('both characters are usable with zero homework', () => {
    // Walk in, mash the light attack, never read the resource system.
    const mk1 = benchmark('mk1', mashing, 900);
    const mk2 = benchmark('mk2', mashing, 900);
    expect(mk1.damage).toBeGreaterThan(0);
    expect(mk2.damage).toBeGreaterThan(0);
  });

  it('mastery is the difference: a good Mk. 2 player dwarfs a mashing one', () => {
    const good = benchmark('mk2', mk2Optimal, 1800);
    const bad = benchmark('mk2', mashing, 1800);
    expect(good.dps).toBeGreaterThan(bad.dps * 1.5);
  });
});

describe('BALANCE: a good Mk. 2 player clearly outperforms Mk. 1', () => {
  it('optimal Mk. 2 play beats optimal Mk. 1 play', () => {
    const frames = 1800;
    const mk1 = benchmark('mk1', mk1Optimal, frames);
    const mk2 = benchmark('mk2', mk2Optimal, frames);
    expect(mk1.damage).toBeGreaterThan(0);
    expect(mk2.dps).toBeGreaterThan(mk1.dps * 1.15);
  });

  it('a bad Mk. 2 player can be worse than Mk. 1 - the kit has homework', () => {
    const frames = 1800;
    const goodMk2 = benchmark('mk2', mk2Optimal, frames);
    const badMk2 = benchmark('mk2', mashing, frames);
    const goodMk1 = benchmark('mk1', mk1Optimal, frames);
    // The intended spread: mashing is under a good Mk. 1, a good Mk. 2 is over.
    expect(badMk2.dps).toBeLessThan(goodMk1.dps);
    expect(goodMk2.dps).toBeGreaterThan(goodMk1.dps);
  });

  it('the full execution beats anything Mk. 1 can do in the same window', () => {
    const s = makeMatch();
    faceOff(s, 90);
    const me = p(s, 0);
    const opp = p(s, 1);
    opp.hp = 100000;
    addCharge(me, 20);
    step(s, [BTN.R, 0]);
    runFrames(s, 190, [0, 0]);
    const execution = 100000 - opp.hp;

    const s2 = makeMatch({ p1: 'mk1' });
    faceOff(s2, 90);
    const mk1 = p(s2, 0);
    const target = p(s2, 1);
    target.hp = 100000;
    mk1.meter = 100;
    step(s2, [BTN.R, 0]);
    runFrames(s2, 130, [0, 0]);
    const overdrive = 100000 - target.hp;

    expect(execution).toBeGreaterThan(overdrive * 1.8);
  });
});

describe('BALANCE: the AI reflects the design', () => {
  it('the Mk. 2 AI is at least as dangerous as the Mk. 1 AI over a long window', () => {
    const frames = 3000;
    const mk1 = aiBenchmark('mk1', frames);
    const mk2 = aiBenchmark('mk2', frames);
    expect(mk1).toBeGreaterThan(0);
    expect(mk2).toBeGreaterThanOrEqual(mk1 * 0.9);
  });

  it('the Mk. 2 AI reaches the whole kit over a long match', () => {
    const s = makeMatch();
    faceOff(s, 140);
    const me = p(s, 0);
    const opp = p(s, 1);
    opp.hp = 100000;
    opp.maxHp = 100000;
    const used = new Set<string>();
    for (let i = 0; i < 3000; i++) {
      step(s, [mk2AI(s, me, opp), 0]);
      if (me.move && me.move.frame === 1) used.add(me.move.id);
    }
    // It must build, set up and cash out - not mash one button.
    expect(used.size).toBeGreaterThanOrEqual(4);
    expect([...used].some((id) => id.includes('array') || id.includes('judgement') || id.includes('splitter'))).toBe(true);
  });
});

describe('BALANCE: form 2 is a kill window, not a defensive revive', () => {
  it('a 5 second blessing out-damages a full Form 1 round of pressure', () => {
    const s = makeMatch();
    faceOff(s, 90);
    const me = p(s, 0);
    const opp = p(s, 1);
    opp.hp = 100000;
    opp.maxHp = 100000;
    me.char[CK.form] = 2;
    me.char[CK.proxyTimer] = 300;
    me.char[CK.attunement] = 3;
    me.char[CK.charge] = 20;
    opp.statuses.heavensMark.stacks = 2;
    opp.statuses.heavensMark.timer = 900;
    me.char[CK.marksApplied] = 2;
    const before = opp.hp;
    for (let i = 0; i < 300; i++) step(s, [mk2AI(s, me, opp), 0]);
    const blessingDamage = before - opp.hp;
    // A 300 frame window of pure pressure in Form 1 for comparison.
    const s2 = makeMatch();
    faceOff(s2, 90);
    const me2 = p(s2, 0);
    const opp2 = p(s2, 1);
    opp2.hp = 100000;
    opp2.maxHp = 100000;
    const before2 = opp2.hp;
    for (let i = 0; i < 300; i++) step(s2, [mk2AI(s2, me2, opp2), 0]);
    expect(blessingDamage).toBeGreaterThan(before2 - opp2.hp);
  });
});

describe('BALANCE: the machine is fragile if you waste the resource', () => {
  it('whiffing a full rail costs 8 Charge and deals nothing', () => {
    const s = makeMatch();
    faceOff(s, 800);
    const me = p(s, 0);
    const opp = p(s, 1);
    addCharge(me, 8);
    const before = opp.hp;
    runFrames(s, 30, [ACTION_BITS.L, 0]);
    runFrames(s, 40, [0, 0]);
    expect(me.char[CK.cumSpend]).toBe(8);
    expect(opp.hp).toBe(before);
    expect(me.char[CK.charge]).toBe(0);
  });
});
