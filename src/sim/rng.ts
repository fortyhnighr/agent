/**
 * Deterministic integer hashing / PRNG helpers.
 *
 * NOTHING in the gameplay simulation may call Math.random(), Date.now() or
 * performance.now(). All "randomness" comes from these pure functions or from
 * the seeded stream kept inside the simulation state.
 */

/** FNV-1a style 32-bit hash of a number. Deterministic across platforms. */
export function hash32(value: number, seed = 0x811c9dc5): number {
  let h = seed | 0;
  h ^= value & 0xff;
  h = Math.imul(h, 0x01000193);
  h ^= (value >>> 8) & 0xff;
  h = Math.imul(h, 0x01000193);
  h ^= (value >>> 16) & 0xff;
  h = Math.imul(h, 0x01000193);
  h ^= (value >>> 24) & 0xff;
  h = Math.imul(h, 0x01000193);
  return h >>> 0;
}

/** Mix two integers into a well distributed 32-bit value. */
export function mix32(a: number, b: number): number {
  let h = (a ^ Math.imul(b + 0x9e3779b9, 0x85ebca6b)) | 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x2545f491);
  h ^= h >>> 13;
  h = Math.imul(h, 0x3ad4e5c9);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Deterministic float in [0,1) derived from a seed and an index. */
export function seededFloat(seed: number, index: number): number {
  return mix32(seed, index) / 4294967296;
}

/** xorshift32 stream kept inside sim state so rollback restores it exactly. */
export interface RngState {
  s: number;
}

export function makeRng(seed: number): RngState {
  return { s: (seed >>> 0) || 0x1a2b3c4d };
}

export function nextU32(rng: RngState): number {
  let x = rng.s | 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  rng.s = x >>> 0;
  return rng.s;
}

export function nextFloat(rng: RngState): number {
  return nextU32(rng) / 4294967296;
}

export function nextRange(rng: RngState, lo: number, hi: number): number {
  return lo + nextFloat(rng) * (hi - lo);
}

export function nextInt(rng: RngState, lo: number, hi: number): number {
  return lo + Math.floor(nextFloat(rng) * (hi - lo + 1));
}

export function cloneRng(rng: RngState): RngState {
  return { s: rng.s };
}
