import { describe, expect, it } from 'vitest';
import { BTN, faceOff, makeMatch, p, runFrames } from './helpers';
import { RollbackSession } from '../src/sim/rollback';
import { step } from '../src/sim/engine';
import { canonicalString, deepClone, hashState } from '../src/sim/state';
import { mk2AI } from '../src/characters/mk2/ai';
import { CK } from '../src/characters/mk2/constants';
import { stacks } from '../src/sim/statuses';
import { addCharge } from '../src/characters/mk2/state';
import type { Inputs } from '../src/sim/engine';
import type { MatchState } from '../src/sim/types';

/**
 * A fixed input script. Determinism tests must not depend on any host state,
 * clock or RNG, so every input here is written out by frame.
 */
function script(seed: number, frames: number): Inputs[] {
  const out: Inputs[] = [];
  let a = seed >>> 0;
  let b = (seed * 2654435761) >>> 0;
  const next = (v: number): number => {
    // xorshift32, written out so the script is reproducible anywhere.
    let x = v >>> 0;
    x ^= x << 13;
    x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5;
    x >>>= 0;
    return x;
  };
  for (let i = 0; i < frames; i++) {
    a = next(a);
    b = next(b);
    // Bias towards buttons so the script actually exercises the move list.
    const pick = (r: number): number => {
      const roll = r % 100;
      if (roll < 6) return BTN.RIGHT;
      if (roll < 12) return BTN.LEFT;
      if (roll < 16) return BTN.DOWN | BTN.RIGHT;
      if (roll < 40) return BTN.J;
      if (roll < 50) return BTN.K;
      if (roll < 60) return BTN.L;
      if (roll < 66) return BTN.I;
      if (roll < 74) return BTN.U;
      if (roll < 84) return BTN.O;
      if (roll < 88) return BTN.P;
      if (roll < 92) return BTN.R;
      if (roll < 96) return BTN.GUARD;
      return 0;
    };
    out.push([pick(a), pick(b)] as Inputs);
  }
  return out;
}

function play(frames: Inputs[], upTo = frames.length): MatchState {
  const s = makeMatch({ p1: 'mk2', p2: 'mk2' });
  faceOff(s, 120);
  // Long enough that a random script cannot end the round early: determinism
  // has to be provable over the whole buffer, not just the first KO.
  for (const f of s.fighters) {
    f.hp = 100000;
    f.maxHp = 100000;
  }
  for (let i = 0; i < upTo; i++) step(s, frames[i]);
  return s;
}

describe('DETERMINISM: identical inputs produce identical states', () => {
  it('replays 1800 scripted frames to the same canonical state', () => {
    const frames = script(0xc0ffee, 1800);
    const a = play(frames);
    const b = play(frames);
    expect(hashState(b)).toBe(hashState(a));
    expect(canonicalString(b)).toBe(canonicalString(a));
  });

  it('is stable across many different seeds', () => {
    for (const seed of [1, 7, 99, 0xdeadbeef, 0x1234]) {
      const frames = script(seed, 600);
      expect(hashState(play(frames))).toBe(hashState(play(frames)));
    }
  });

  it('different inputs produce different states', () => {
    // A single changed frame has to be visible. Checked close to the change:
    // a fighting sim can re-converge hundreds of frames later.
    const frames = script(5, 460);
    const other = frames.map((f, i) => (i === 400 ? ([f[0] ^ BTN.R, f[1]] as Inputs) : f));
    expect(hashState(play(other, 412))).not.toBe(hashState(play(frames, 412)));
  });

  it('the AI is deterministic and does not read the future', () => {
    const run = (): string => {
      const s = makeMatch({ p1: 'mk2', p2: 'mk1' });
      faceOff(s, 140);
      const me = p(s, 0);
      const opp = p(s, 1);
      for (let i = 0; i < 1200; i++) step(s, [mk2AI(s, me, opp), 0]);
      return hashState(s);
    };
    expect(run()).toBe(run());
  });
});

describe('DETERMINISM: deep clone round trips exactly', () => {
  it('a cloned mid-match state simulates to the same future', () => {
    const frames = script(31, 400);
    const s = makeMatch({ p1: 'mk2', p2: 'mk2' });
    faceOff(s, 120);
    for (const inputs of frames) step(s, inputs);
    const copy = deepClone(s);
    expect(hashState(copy)).toBe(hashState(s));
    const rest = script(31, 400).concat(script(77, 500));
    for (const inputs of rest.slice(400)) step(s, inputs);
    for (const inputs of rest.slice(400)) step(copy, inputs);
    expect(hashState(copy)).toBe(hashState(s));
  });

  it('the canonical string ignores key order but not values', () => {
    expect(canonicalString({ a: 1, b: [2, 3] })).toBe(canonicalString({ b: [2, 3], a: 1 }));
    expect(canonicalString({ a: 1 })).not.toBe(canonicalString({ a: 2 }));
  });
});

describe('ROLLBACK: correcting an input rewrites the future', () => {
  /** Puts a session state in the same starting condition as `makeMatch`. */
  function liveSession(): RollbackSession {
    const session = new RollbackSession({ p1: 'mk2', p2: 'mk2', seed: 0xc0ffee });
    session.state.phase = 'fight';
    faceOff(session.state, 120);
    for (const f of session.state.fighters) {
      f.hp = 100000;
      f.maxHp = 100000;
    }
    session.state.frame = 0;
    return session;
  }

  it('re-simulating from a correction lands on the same state as never simulating it', () => {
    const frames = script(2024, 700);
    // Ground truth: simulate the corrected input from the start.
    const corrected = frames.map((f, i) => (i === 660 ? ([f[0] ^ BTN.R, f[1]] as Inputs) : f));
    const truth2 = makeMatch({ p1: 'mk2', p2: 'mk2' });
    faceOff(truth2, 120);
    for (const f of truth2.fighters) {
      f.hp = 100000;
      f.maxHp = 100000;
    }
    for (let i = 0; i < 700; i++) step(truth2, corrected[i]);

    // Now the same thing through a rollback session, correcting frame 660 late.
    const session = liveSession();
    for (let i = 0; i < 700; i++) {
      session.queueInput(i, 0, frames[i][0]);
      session.queueInput(i, 1, frames[i][1]);
      session.advance();
    }
    const beforeCorrection = hashState(session.state);
    session.correctInput(660, 0, corrected[660][0]);
    expect(session.desync).toBe(false);
    expect(hashState(session.state)).toBe(hashState(truth2));
    expect(hashState(session.state)).not.toBe(beforeCorrection);
  });

  it('a rollback session runs the same simulation as a plain loop', () => {
    const frames = script(808, 500);
    const session = new RollbackSession({ p1: 'mk2', p2: 'mk2', seed: 0xc0ffee }, { bufferSize: 32 });
    session.state.phase = 'fight';
    faceOff(session.state, 120);
    for (const f of session.state.fighters) {
      f.hp = 100000;
      f.maxHp = 100000;
    }
    session.state.frame = 0;
    const plain = makeMatch({ p1: 'mk2', p2: 'mk2' });
    faceOff(plain, 120);
    for (const f of plain.fighters) {
      f.hp = 100000;
      f.maxHp = 100000;
    }
    for (let i = 0; i < 500; i++) {
      session.queueInput(i, 0, frames[i][0]);
      session.queueInput(i, 1, frames[i][1]);
      session.advance();
      step(plain, frames[i]);
    }
    expect(hashState(session.state)).toBe(hashState(plain));
  });

  it('trims history without breaking a later correction inside the window', () => {
    const frames = script(4, 300);
    const session = liveSession();
    for (let i = 0; i < 300; i++) {
      session.queueInput(i, 0, frames[i][0]);
      session.queueInput(i, 1, frames[i][1]);
      session.advance();
      if (i % 10 === 0) session.trim();
    }
    const corrected = frames.map((f, i) => (i === 290 ? ([f[0] ^ BTN.J, f[1]] as Inputs) : f));
    const truth = makeMatch({ p1: 'mk2', p2: 'mk2' });
    faceOff(truth, 120);
    for (const f of truth.fighters) {
      f.hp = 100000;
      f.maxHp = 100000;
    }
    for (let i = 0; i < 300; i++) step(truth, corrected[i]);
    session.correctInput(290, 0, corrected[290][0]);
    expect(session.desync).toBe(false);
    expect(hashState(session.state)).toBe(hashState(truth));
  });
});

describe('DETERMINISM: all Mk. 2 state participates in the hash', () => {
  const MUTATIONS: [string, (s: MatchState) => void][] = [
    ['charge', (s) => { p(s, 0).char[CK.charge] += 1; }],
    ['attunement', (s) => { p(s, 0).char[CK.attunement] += 1; }],
    ['cumulative spend', (s) => { p(s, 0).char[CK.cumSpend] += 1; }],
    ['form', (s) => { p(s, 0).char[CK.form] = 2; }],
    ['proxy timer', (s) => { p(s, 0).char[CK.proxyTimer] += 1; }],
    ['proxy kills', (s) => { p(s, 0).char[CK.proxyKills] += 1; }],
    ['smite phase', (s) => { p(s, 0).char[CK.smitePhase] = 1; }],
    ['marks applied', (s) => { p(s, 0).char[CK.marksApplied] += 1; }],
    ['perfect phases', (s) => { p(s, 0).char[CK.perfectPhases] += 1; }],
    ['array live', (s) => { p(s, 0).char[CK.arrayLive] = 1; }],
    ['bolt timer', (s) => { p(s, 0).char[CK.boltTimer] = 1; }],
    ['sequence cursor', (s) => { p(s, 0).char[CK.seqCursor] += 1; }],
    ['conductive stacks', (s) => { p(s, 1).statuses.conductive.stacks = 2; }],
    ['pierced stacks', (s) => { p(s, 1).statuses.pierced.stacks = 1; }],
    ["heaven's mark", (s) => { p(s, 1).statuses.heavensMark.stacks = 1; }],
    ['static lock', (s) => { p(s, 1).statuses.staticLock.stacks = 1; }],
    ['divine scar', (s) => { p(s, 1).statuses.divineScar.stacks = 1; }],
    ['divine shock', (s) => { p(s, 1).statuses.divineShock.stacks = 1; }],
    ['sequence flags', (s) => { p(s, 0).char[CK.seqFlags] = (p(s, 0).char[CK.seqFlags] ?? 0) | 1; }],
  ];

  it('changing any tracked field changes the state hash', () => {
    const base = makeMatch({ p1: 'mk2', p2: 'mk2' });
    faceOff(base, 120);
    addCharge(p(base, 0), 5);
    const original = hashState(base);
    for (const [label, mutate] of MUTATIONS) {
      const copy = deepClone(base);
      mutate(copy);
      expect(hashState(copy), `${label} is not part of the state hash`).not.toBe(original);
    }
  });

  it('the two fighters hash independently', () => {
    const s = makeMatch({ p1: 'mk2', p2: 'mk2' });
    faceOff(s, 120);
    const a = hashState(s);
    addCharge(p(s, 1), 3);
    expect(hashState(s)).not.toBe(a);
  });
});

describe('DETERMINISM: presentation never touches the simulation', () => {
  it('corrupt Charge readouts do not change the state hash', async () => {
    const { telemetry } = await import('../src/render/telemetry');
    const s = makeMatch({ p1: 'mk2', p2: 'mk2' });
    faceOff(s, 120);
    const me = p(s, 0);
    me.char[CK.form] = 2;
    addCharge(me, 11);
    const before = hashState(s);
    for (let i = 0; i < 120; i++) {
      const view = telemetry(s.fxFrame, me.char[CK.charge], s.seed, me.char[CK.attunement]);
      expect(view.display.length).toBeGreaterThan(0);
      expect(view.truth).toBe(String(me.char[CK.charge]));
    }
    expect(hashState(s)).toBe(before);
  });

  it('the true Charge is always readable next to the corrupt one', async () => {
    const { telemetry } = await import('../src/render/telemetry');
    const s = makeMatch({ p1: 'mk2', p2: 'mk2' });
    faceOff(s, 120);
    const me = p(s, 0);
    me.char[CK.form] = 2;
    for (const trueCharge of [0, 1, 7, 13, 20]) {
      me.char[CK.charge] = trueCharge;
      const view = telemetry(s.fxFrame, trueCharge, s.seed, me.char[CK.attunement]);
      expect(view.truth).toBe(String(trueCharge));
    }
  });
});

describe('DETERMINISM: the simulation is free of ambient time and randomness', () => {
  it('no gameplay module calls Math.random, Date.now or performance.now', async () => {
    const { readFileSync, readdirSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    const roots = ['src/sim', 'src/characters'];
    const banned = /Math\.random|Date\.now|performance\.now|new Date\b/;
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (entry.endsWith('.ts')) {
          const text = readFileSync(full, 'utf8');
          // Comments are allowed to *name* the banned functions; calls are not.
          const code = text
            .replace(/\/\*[\s\S]*?\*\//g, ' ')
            .replace(/(^|[^:])\/\/.*$/gm, '$1');
          if (banned.test(code)) offenders.push(full);
        }
      }
    };
    for (const root of roots) walk(join(process.cwd(), root));
    expect(offenders).toEqual([]);
  });

  it('a full second life scenario replays identically', () => {
    const run = (): string => {
      const s = makeMatch({ p1: 'mk2', p2: 'mk1' });
      faceOff(s, 120);
      const me = p(s, 0);
      const opp = p(s, 1);
      // Force the qualification, then die.
      me.char[CK.attunement] = 3;
      me.char[CK.cumSpend] = 260;
      me.char[CK.marksApplied] = 6;
      me.char[CK.perfectPhases] = 4;
      addCharge(me, 8);
      runFrames(s, 40, [BTN.L, 0]);
      runFrames(s, 60, [BTN.GUARD, 0]);
      opp.hp = 100000;
      for (let i = 0; i < 600; i++) {
        step(s, [mk2AI(s, me, opp), 0]);
        if (me.char[CK.form] === 2) break;
      }
      for (let i = 0; i < 400; i++) step(s, [mk2AI(s, me, opp), 0]);
      return hashState(s);
    };
    const a = run();
    expect(run()).toBe(a);
  });

  it('statuses survive snapshot and restore exactly', () => {
    const s = makeMatch({ p1: 'mk2', p2: 'mk2' });
    faceOff(s, 120);
    const opp = p(s, 1);
    opp.statuses.conductive.stacks = 4;
    opp.statuses.conductive.timer = 77;
    opp.statuses.pierced.stacks = 2;
    opp.statuses.heavensMark.stacks = 3;
    const copy = deepClone(s);
    expect(stacks(copy.fighters[1], 'conductive')).toBe(4);
    expect(stacks(copy.fighters[1], 'pierced')).toBe(2);
    expect(stacks(copy.fighters[1], 'heavensMark')).toBe(3);
    expect(hashState(copy)).toBe(hashState(s));
  });
});
