/**
 * Rollback session: input delay, snapshot ring, re-simulation and desync
 * detection via state hashes.
 *
 * Snapshots are taken *before* each frame is simulated, so restoring a frame N
 * and re-running it with corrected inputs reproduces the exact future.
 */

import { createMatch, deepClone, hashState, type MatchConfig } from './state';
import { step, type Inputs } from './engine';
import type { MatchState } from './types';

export interface SessionOptions {
  /** How many frames of delay to apply to the local player. */
  inputDelay?: number;
  /** Snapshot ring size (frames of rollback history). */
  bufferSize?: number;
  /** Hash the state every N frames (0 disables). */
  hashEvery?: number;
}

export class RollbackSession {
  state: MatchState;
  readonly inputDelay: number;
  readonly bufferSize: number;
  readonly hashEvery: number;

  /** frame -> inputs used for that frame. */
  private readonly inputs = new Map<number, Inputs>();
  /** frame -> state snapshot taken before that frame was simulated. */
  private readonly snaps = new Map<number, MatchState>();
  /** frame -> state hash after simulating that frame. */
  private readonly hashes = new Map<number, string>();
  /** Per-frame pending inputs from each local source. */
  private readonly pending: [Map<number, number>, Map<number, number>] = [new Map(), new Map()];

  desync = false;
  desyncFrame = -1;
  simulated = 0;

  constructor(cfg: MatchConfig, opts: SessionOptions = {}) {
    this.state = createMatch(cfg);
    this.inputDelay = opts.inputDelay ?? 0;
    this.bufferSize = opts.bufferSize ?? 32;
    this.hashEvery = opts.hashEvery ?? 1;
    this.snaps.set(0, deepClone(this.state));
  }

  /** Queue an input for a given frame (usually frame + inputDelay). */
  queueInput(frame: number, player: 0 | 1, input: number): void {
    this.pending[player].set(frame, input & 0x1fff);
  }

  /** Queue an input for the frame that is about to be simulated. */
  queueLocal(frame: number, player: 0 | 1, input: number): void {
    this.queueInput(frame + this.inputDelay, player, input);
  }

  hasInputsFor(frame: number): boolean {
    const f = this.rollFrame(frame);
    return this.pending[0].has(f) && this.pending[1].has(f);
  }

  private rollFrame(frame: number): number {
    return this.simulated + Math.max(0, frame - this.simulated);
  }

  /** Simulate one frame if every slot has an input for it. */
  advance(): boolean {
    const frame = this.simulated;
    const a = this.pending[0].get(frame);
    const b = this.pending[1].get(frame);
    if (a === undefined || b === undefined) return false;
    this.simulateOne(frame, [a, b]);
    return true;
  }

  /** Simulate as many consecutive frames as inputs allow. */
  advanceAll(maxFrames = 8): number {
    let n = 0;
    while (n < maxFrames && this.advance()) n++;
    return n;
  }

  private simulateOne(frame: number, inputs: Inputs): void {
    // Remember the exact pre-step state so this frame can be replayed.
    this.snaps.set(frame, deepClone(this.state));
    this.inputs.set(frame, [inputs[0], inputs[1]]);
    step(this.state, inputs);
    this.simulated = frame + 1;
    if (this.hashEvery > 0 && frame % this.hashEvery === 0) {
      this.hashes.set(frame, hashState(this.state));
    }
  }

  /**
   * Correct an input for an already simulated frame: restores the snapshot and
   * re-simulates everything up to the current frame with the corrected inputs.
   */
  correctInput(frame: number, player: 0 | 1, input: number): void {
    const value = input & 0x1fff;
    this.pending[player].set(frame, value);
    if (frame >= this.simulated) return;
    this.resimulateFrom(frame);
  }

  private resimulateFrom(frame: number): void {
    const target = this.simulated;
    const snap = this.snaps.get(frame);
    if (!snap) return;
    this.state = deepClone(snap);
    for (let f = frame; f < target; f++) {
      const inputs = this.inputs.get(f);
      if (!inputs) break;
      // Replay the *current* inputs for this frame, not the stale ones: a
      // corrected frame is the whole point of rolling back.
      const a = this.pending[0].get(f);
      const b = this.pending[1].get(f);
      const replay: Inputs = [a ?? inputs[0], b ?? inputs[1]];
      this.inputs.set(f, replay);
      this.snaps.set(f, deepClone(this.state));
      step(this.state, replay);
      this.simulated = f + 1;
      if (this.hashEvery > 0 && f % this.hashEvery === 0) {
        const actual = hashState(this.state);
        // Only frames *before* the correction still have a meaningful
        // reference hash. Everything after it is expected to differ: that is
        // what a correction is for.
        if (f < frame) {
          const expected = this.hashes.get(f);
          if (expected && expected !== actual) {
            this.desync = true;
            this.desyncFrame = f;
          }
        }
        this.hashes.set(f, actual);
      }
    }
  }

  hashAt(frame: number): string | undefined {
    return this.hashes.get(frame);
  }

  /** Drop history that can no longer be rolled back. */
  trim(): void {
    const cutoff = this.simulated - this.bufferSize;
    for (const key of [...this.snaps.keys()]) if (key < cutoff) this.snaps.delete(key);
    for (const key of [...this.hashes.keys()]) if (key < cutoff) this.hashes.delete(key);
    for (const key of [...this.inputs.keys()]) if (key < cutoff) this.inputs.delete(key);
    for (const map of this.pending) {
      for (const key of [...map.keys()]) if (key < cutoff) map.delete(key);
    }
  }
}
