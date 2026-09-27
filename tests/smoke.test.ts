import { describe, expect, it } from 'vitest';
import { makeMatch, faceOff, runFrames, p, tap, forceMove, until, hash, clone } from './helpers';
import { F1 } from '../src/characters/mk2/constants';
import { moveOf } from '../src/sim/registry';
import { step } from '../src/sim/engine';

describe('simulation smoke test', () => {
  it('creates a match with both fighters on the registry', () => {
    const s = makeMatch();
    expect(p(s, 0).charId).toBe('mk2');
    expect(p(s, 1).charId).toBe('mk1');
    expect(p(s, 0).hp).toBe(1000);
    expect(s.phase).toBe('fight');
  });

  it('runs frames without throwing', () => {
    const s = makeMatch();
    runFrames(s, 120);
    expect(s.frame).toBe(120);
    expect(p(s, 0).y).toBe(0);
  });

  it('walks forward when the direction is held', () => {
    const s = makeMatch();
    faceOff(s, 200);
    const x0 = p(s, 0).x;
    runFrames(s, 30, [{ valueOf: 0 } as never, 0]);
    // BTN.RIGHT = 2
    runFrames(s, 30, [2, 0]);
    expect(p(s, 0).x).toBeGreaterThan(x0);
  });

  it('Flash Thrust connects, generates Charge and applies Conductive', () => {
    const s = makeMatch();
    faceOff(s, 70);
    const before = p(s, 1).hp;
    tap(s, 'J');
    const connected = until(s, (st) => p(st, 0).char.charge > 0, 30);
    expect(connected).toBe(true);
    expect(p(s, 0).char.charge).toBeGreaterThanOrEqual(1);
    expect(p(s, 1).statuses.conductive.stacks).toBeGreaterThanOrEqual(1);
    expect(p(s, 1).hp).toBeLessThan(before);
  });

  it('an execution sequence resolves real hits', () => {
    const s = makeMatch();
    faceOff(s, 90);
    p(s, 0).char.charge = 20;
    const before = p(s, 1).hp;
    forceMove(s, p(s, 0), F1.splitter3);
    runFrames(s, 170);
    expect(p(s, 1).hp).toBeLessThan(before - 100);
  });

  it('state hashing is stable for identical states', () => {
    const s = makeMatch();
    runFrames(s, 60);
    const copy = clone(s);
    expect(hash(copy)).toBe(hash(s));
    step(s, [0, 0]);
    expect(hash(s)).not.toBe(hash(copy));
  });

  it('every registered move has sane frame data', () => {
    const s = makeMatch();
    const moves = [F1.flashThrust, F1.streakLunge, F1.railspear, F1.railspearL1, F1.railspearL2, F1.flashPhase];
    for (const id of moves) {
      const d = moveOf(id);
      expect(d.startup).toBeGreaterThan(0);
      expect(d.active).toBeGreaterThan(0);
      expect(d.recovery).toBeGreaterThan(0);
    }
    expect(p(s, 0).charId).toBe('mk2');
  });
});
