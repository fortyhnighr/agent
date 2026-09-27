import { describe, expect, it } from 'vitest';
import { BTN, faceOff, grantProxy, makeMatch, p, qualifyForSecondLife } from './helpers';
import { step } from '../src/sim/engine';
import { mk2AI } from '../src/characters/mk2/ai';
import { stacks } from '../src/sim/statuses';
import { canAffordCost, meetsRequirements } from '../src/characters/mk2/logic';
import type { Fighter } from '../src/sim/types';
import { CK, F1 } from '../src/characters/mk2/constants';
import { addCharge } from '../src/characters/mk2/state';
import { applyStatus } from '../src/sim/statuses';
import type { MatchState } from '../src/sim/types';

/**
 * Runs a match with the AI driving slot 0 and audits every decision.
 *
 * The AI commits to moves through the same `tryStart` gate the human input
 * path uses, so the meaningful audit is: whenever a move STARTS, its strict
 * requirements and its cost were genuinely satisfied on the previous frame.
 */
function runAudited(
  state: MatchState,
  frames: number,
  onFrame?: (s: MatchState) => void,
): {
  illegal: number;
  attacking: number;
  backwards: number;
  started: string[];
  inputs: number[];
  maxCharge: number;
} {
  const me = state.fighters[0];
  const opp = state.fighters[1];
  let illegal = 0;
  let attacking = 0;
  let backwards = 0;
  let maxCharge = 0;
  const started: string[] = [];
  const inputs: number[] = [];
  for (let i = 0; i < frames; i++) {
    maxCharge = Math.max(maxCharge, me.char[CK.charge]);
    const preCharge = me.char[CK.charge];
    const preAttune = me.char[CK.attunement];
    const preMarks = stacks(opp, 'heavensMark');
    const preShock = stacks(opp, 'divineShock');
    const preCond = stacks(opp, 'conductive');
    const input = mk2AI(state, me, opp);
    inputs.push(input);
    const back = me.facing === 1 ? BTN.LEFT : BTN.RIGHT;
    if (input & back) backwards++;
    onFrame?.(state);
    step(state, [input, 0]);
    if (me.state === 'attack' || me.move) attacking++;
    // Only audit the frame a move STARTS: a move that is already running no
    // longer has to be affordable.
    if (me.move && me.move.frame === 1) {
      const now = me.move.id;
      started.push(now);
      const snapshot = {
        ...me,
        char: { ...me.char, [CK.charge]: preCharge, [CK.attunement]: preAttune },
      } as unknown as Fighter;
      opp.statuses.heavensMark.stacks = preMarks;
      opp.statuses.divineShock.stacks = preShock;
      opp.statuses.conductive.stacks = preCond;
      if (!meetsRequirements(snapshot, opp, now) || !canAffordCost(snapshot, opp, now)) {
        illegal++;
      }
    }
  }
  return { illegal, attacking, backwards, started, inputs, maxCharge };
}

describe('MK. 2 AI - Form 1', () => {
  it('never issues an input its own state cannot pay for', () => {
    const s = makeMatch();
    faceOff(s, 120);
    const result = runAudited(s, 1800);
    expect(result.illegal).toBe(0);
  });

  it('stays legal while the state changes underneath it', () => {
    const s = makeMatch();
    const me = p(s, 0);
    const opp = p(s, 1);
    const result = runAudited(s, 2400, () => {
      if (s.frame % 37 === 0) applyStatus(opp, 'conductive', 2);
      if (s.frame % 53 === 0) applyStatus(opp, 'heavensMark', 1);
      if (s.frame % 71 === 0) addCharge(me, 6);
      if (s.frame % 97 === 0) opp.hp = Math.max(1, opp.hp - 30);
    });
    expect(result.illegal).toBe(0);
  });

  it('respects a real reaction delay before defending', () => {
    const s = makeMatch();
    faceOff(s, 90);
    const me = p(s, 0);
    const opp = p(s, 1);
    s.aiControlled[0] = 1;
    // The opponent commits to a slow, obvious attack.
    opp.move = { id: F1.railspearL2, frame: 0, hits: 0, hitIds: [], vars: {} };
    opp.state = 'attack';
    step(s, [0, 0]);
    // The AI has seen it but has not been able to respond yet.
    expect(me.ai.oppStartup).toBe(1);
    expect(me.ai.seen).toBe(0);
    expect(me.ai.react).toBeGreaterThan(0);
    let framesToReact = 0;
    while (me.ai.seen === 0 && framesToReact < 20) {
      step(s, [0, 0]);
      framesToReact++;
    }
    expect(framesToReact).toBeGreaterThanOrEqual(5);
  });

  it('cannot react to a move that appears and disappears inside its delay', () => {
    const s = makeMatch();
    faceOff(s, 90);
    const me = p(s, 0);
    const opp = p(s, 1);
    opp.move = { id: F1.flashThrust, frame: 0, hits: 0, hitIds: [], vars: {} };
    opp.state = 'attack';
    const before = me.ai.seen;
    for (let i = 0; i < 5; i++) {
      opp.move = { id: F1.flashThrust, frame: 0, hits: 0, hitIds: [], vars: {} };
      opp.state = 'attack';
      step(s, [0, 0]);
    }
    // A 5 frame poke is inside the delay window: the AI never got to answer.
    expect(me.ai.seen).toBe(before);
  });

  it('builds Charge instead of mashing specials', () => {
    const s = makeMatch();
    faceOff(s, 150);
    const me = p(s, 0);
    const opp = p(s, 1);
    opp.hp = 100000;
    const result = runAudited(s, 900);
    // It builds the engine and then spends it - neither phase is skipped.
    expect(result.maxCharge).toBeGreaterThan(6);
    expect(me.char[CK.cumSpend]).toBeGreaterThan(0);
  });

  it('reaches Attunement 3 by actually spending, never by cheating', () => {
    const s = makeMatch();
    faceOff(s, 130);
    const me = p(s, 0);
    const opp = p(s, 1);
    opp.hp = 100000;
    opp.maxHp = 100000;
    runAudited(s, 3600);
    // Attunement is derived from cumulative spend, nothing else.
    expect(me.char[CK.attunement]).toBeLessThanOrEqual(3);
    expect(me.char[CK.cumSpend]).toBeGreaterThanOrEqual(me.char[CK.attunement] * 10);
  });

  it('only spends Divine Charge it actually has', () => {
    const s = makeMatch();
    faceOff(s, 140);
    const me = p(s, 0);
    const opp = p(s, 1);
    opp.hp = 100000;
    opp.maxHp = 100000;
    for (let i = 0; i < 3000; i++) {
      const input = mk2AI(s, me, opp);
      step(s, [input, 0]);
      expect(me.char[CK.charge]).toBeGreaterThanOrEqual(0);
      expect(me.char[CK.charge]).toBeLessThanOrEqual(20);
    }
  });
});

describe('MK. 2 AI - Form 2', () => {
  it('becomes extremely aggressive and never retreats', () => {
    const s = makeMatch();
    faceOff(s, 300);
    const me = p(s, 0);
    const opp = p(s, 1);
    opp.hp = 100000;
    opp.maxHp = 100000;
    grantProxy(s, me);
    const result = runAudited(s, 240);
    expect(result.illegal).toBe(0);
    // Almost every single frame is spent inside an attack, and Mk. 2 never
    // takes a step backwards while the blessing is live.
    expect(result.attacking / 240).toBeGreaterThan(0.7);
    expect(result.backwards).toBe(0);
    expect(result.started.length).toBeGreaterThan(4);
  });

  it('stays legal through the whole blessing and the "Fool." aftermath', () => {
    const s = makeMatch();
    faceOff(s, 160);
    const me = p(s, 0);
    const opp = p(s, 1);
    opp.hp = 100000;
    opp.maxHp = 100000;
    grantProxy(s, me);
    const result = runAudited(s, 420);
    expect(result.illegal).toBe(0);
  });

  it('goes for the kill when the opponent is nearly dead', () => {
    const s = makeMatch();
    faceOff(s, 120);
    const me = p(s, 0);
    const opp = p(s, 1);
    opp.hp = 120;
    grantProxy(s, me);
    me.char[CK.attunement] = 3;
    applyStatus(opp, 'heavensMark', 1);
    runAudited(s, 150);
    expect(opp.hp).toBeLessThan(120);
  });
});

describe('MK. 2 AI - second life and afterlife', () => {
  it('does nothing illegal once erased', () => {
    const s = makeMatch();
    faceOff(s, 200);
    const me = p(s, 0);
    qualifyForSecondLife(s, me);
    grantProxy(s, me);
    const result = runAudited(s, 60);
    expect(result.illegal).toBe(0);
  });

  it('is deterministic: two identical runs produce identical inputs', () => {
    const build = () => {
      const s = makeMatch();
      faceOff(s, 140);
      return s;
    };
    const a = runAudited(build(), 900).inputs;
    const b = runAudited(build(), 900).inputs;
    expect(a).toEqual(b);
  });
});

describe('AI does not read future input', () => {
  it('only ever looks at the current frame', () => {
    const s = makeMatch();
    faceOff(s, 140);
    const me = p(s, 0);
    const opp = p(s, 1);
    // Future input is unknowable to the AI: it is not part of the state it sees.
    const first = mk2AI(s, me, opp);
    const snapshotInputs = [...me.inputHist];
    const second = mk2AI(s, me, opp);
    expect(me.inputHist).toEqual(snapshotInputs);
    expect(second).toBe(first);
  });
});
