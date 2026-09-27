/**
 * FORM 2 DIVINE CHARGE TELEMETRY.
 *
 * While PROXY OF THE CREATOR is active the machine can no longer measure the
 * energy passing through it, so the HUD starts reporting impossible values.
 *
 * This is PRESENTATION ONLY. The underlying simulation resource is untouched
 * and fully deterministic; the fake numbers are derived from the simulation
 * frame and a fixed seed with pure integer arithmetic. Math.random() is never
 * used - not here and not anywhere in the sim.
 */

import { mix32 } from '../sim/rng';

const GLITCH = [
  '17',
  '99',
  'ERR',
  '03',
  '∞',
  '21',
  '-4',
  '409',
  '20',
  '?????',
  '--',
  '4096',
  '-0',
  '88',
  'ERR',
  'Æ—',
  '7F',
  '1024',
] as const;

export interface Telemetry {
  /** The large, corrupted readout drawn on the meter. */
  display: string;
  /** The true value, always shown small so the player is never blind. */
  truth: string;
  /** True when the big number is currently lying. */
  glitching: boolean;
  /** 0..1 flicker intensity for the HUD shake. */
  flicker: number;
}

/**
 * Deterministic corrupted readout. `frame` must come from the simulation
 * (MatchState.fxFrame) and `seed` from the match.
 */
export function telemetry(
  frame: number,
  charge: number,
  seed: number,
  attunement: number,
): Telemetry {
  // The readout changes a few times per second and jitters between sub-frames.
  const slot = Math.floor(frame / 2);
  const jitter = Math.floor(frame / 7);
  const h = mix32(mix32(slot, seed), jitter);
  const truth = String(charge);
  // Higher Attunement = a machine that is losing the ability to speak.
  const glitchChance = 52 + attunement * 14;
  const glitching = h % 100 < glitchChance;
  if (!glitching) {
    return { display: truth, truth, glitching: false, flicker: 0 };
  }
  const value = GLITCH[h % GLITCH.length];
  return {
    display: value,
    truth,
    glitching: true,
    flicker: ((h >>> 8) % 100) / 100,
  };
}

/** Short banner text for the blessing clock. */
export function blessingLabel(framesLeft: number): string {
  const seconds = framesLeft / 60;
  return seconds.toFixed(1);
}

/** A stable per-entity pseudo random for presentation only. */
export function visual(seed: number, index: number): number {
  return mix32(seed, index) / 4294967296;
}

/** Presentation-only visual noise in [-1, 1]. */
export function visualSigned(seed: number, index: number): number {
  return visual(seed, index) * 2 - 1;
}
