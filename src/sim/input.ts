/**
 * Input decoding: press/release edges, hold frames, buffered chains,
 * motion detection (down+forward) and double-tap dashes.
 *
 * Everything is derived from the 12 frame input ring kept on the fighter, so
 * it is fully deterministic and rollback safe.
 */

import { ACTION_BITS, BTN, MOTION_WINDOW } from './const';
import type { Fighter } from './types';

const DASH_TAP_WINDOW = 11;

export function currentInput(f: Fighter): number {
  return f.inputHist[f.inputHist.length - 1];
}

export function inputAt(f: Fighter, back: number): number {
  const i = f.inputHist.length - 1 - back;
  return i >= 0 ? f.inputHist[i] : 0;
}

export function held(f: Fighter, key: string): boolean {
  return (currentInput(f) & (ACTION_BITS[key] ?? 0)) !== 0;
}

export function heldBit(f: Fighter, bit: number): boolean {
  return (currentInput(f) & bit) !== 0;
}

export function pressed(f: Fighter, key: string): boolean {
  return f.pressed[key] === 1;
}

/** Records the input for this frame and derives edges. */
export function pushInput(f: Fighter, input: number, frame: number): void {
  const prev = currentInput(f);
  f.inputHist.push(input & 0x3fff);
  if (f.inputHist.length > 12) f.inputHist.shift();
  for (const key of Object.keys(ACTION_BITS)) {
    const bit = ACTION_BITS[key];
    const down = (input & bit) !== 0;
    const was = (prev & bit) !== 0;
    if (down && !was) {
      f.lastPress[key] = frame;
      f.pressed[key] = 1;
    } else {
      // Edge flags live exactly one frame.
      f.pressed[key] = 0;
      if (!down && was) f.lastRelease[key] = frame;
    }
    f.holdCount[key] = down ? (was ? f.holdCount[key] + 1 : 1) : 0;
  }
  f.inputFrame = frame;
}

/** Frames the button has been held down for (0 when not held). */
export function holdFrames(f: Fighter, key: string): number {
  return f.holdCount[key] ?? 0;
}

/**
 * down+forward motion: DOWN and a forward direction both appear inside the
 * buffer window while the action button is pressed. Forward is relative to
 * facing, and simply holding the direction is enough (this game favours
 * responsiveness over strict numpad motion).
 */
export function motionDownForward(f: Fighter): boolean {
  const needDir = f.facing === 1 ? BTN.RIGHT : BTN.LEFT;
  let downSeen = false;
  let dirSeen = false;
  for (let i = f.inputHist.length - 1; i >= 0 && i >= f.inputHist.length - MOTION_WINDOW; i--) {
    const v = f.inputHist[i];
    if (v & BTN.DOWN) downSeen = true;
    if (v & needDir) dirSeen = true;
  }
  return downSeen && dirSeen;
}

/** Double tap of a direction (dash). Requires a fresh press on this frame. */
export function doubleTapped(f: Fighter, bit: number): boolean {
  const n = f.inputHist.length;
  const cur = f.inputHist[n - 1] & bit;
  const prev = f.inputHist[n - 2] & bit;
  if (!cur || prev) return false;
  let edges = 1;
  // Skip i = n-1: that is the press we already counted above.
  for (let i = n - 2; i >= n - 1 - DASH_TAP_WINDOW && i > 0; i--) {
    if ((f.inputHist[i] & bit) !== 0 && (f.inputHist[i - 1] & bit) === 0) edges++;
    if (edges >= 2) return true;
  }
  return false;
}

export function forwardBit(f: Fighter): number {
  return f.facing === 1 ? BTN.RIGHT : BTN.LEFT;
}

export function backBit(f: Fighter): number {
  return f.facing === 1 ? BTN.LEFT : BTN.RIGHT;
}

export function pressingForward(f: Fighter): boolean {
  return heldBit(f, forwardBit(f));
}

export function pressingBack(f: Fighter): boolean {
  return heldBit(f, backBit(f));
}
