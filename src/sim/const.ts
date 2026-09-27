/**
 * Shared simulation constants. Everything is expressed in world units and 60Hz frames.
 * World space: x is horizontal, y is UP, ground is y = 0, ceiling is y = CEILING.
 */

export const FPS = 60;

/** Input bits. Directions are independent of the action buttons. */
export const BTN = {
  LEFT: 1 << 0,
  RIGHT: 1 << 1,
  UP: 1 << 2,
  DOWN: 1 << 3,
  J: 1 << 4,
  K: 1 << 5,
  L: 1 << 6,
  I: 1 << 7,
  U: 1 << 8,
  O: 1 << 9,
  P: 1 << 10,
  R: 1 << 11,
  GUARD: 1 << 12,
} as const;

export const ACTION_BITS: Record<string, number> = {
  J: BTN.J,
  K: BTN.K,
  L: BTN.L,
  I: BTN.I,
  U: BTN.U,
  O: BTN.O,
  P: BTN.P,
  R: BTN.R,
  GUARD: BTN.GUARD,
};

export const DIR_LEFT = BTN.LEFT;
export const DIR_RIGHT = BTN.RIGHT;
export const DIR_UP = BTN.UP;
export const DIR_DOWN = BTN.DOWN;

/** Buffered-input lookback used for chains, cancels and motion detection. */
export const INPUT_BUFFER_FRAMES = 10;
/** Extra frames allowed for motion detection (down+forward within this many frames). */
export const MOTION_WINDOW = 7;

export const STAGE = {
  /** Half width; fighters are clamped to +/- this. */
  halfWidth: 700,
  ground: 0,
  ceiling: 520,
  wallPad: 26,
} as const;

export const PHYSICS = {
  gravity: 0.58,
  /** Maximum fall speed (terminal velocity). */
  maxFall: 22,
  /** Pushbox separation applied when bodies overlap. */
  pushStrength: 0.55,
  frictionGround: 0.78,
  frictionAir: 0.94,
} as const;

export const BODY = {
  width: 36,
  height: 110,
  /** Hurtbox inset from the pushbox so trades/overlaps read correctly. */
  hurtInsetX: 5,
  hurtInsetY: 8,
} as const;

export const DASH = {
  startup: 5,
  active: 13,
  recovery: 6,
  speed: 10.4,
  /** Frames of backdash that can be used defensively. */
  backDashInvuln: 0,
  cooldown: 24,
  airDashes: 1,
  airDashSpeed: 9.2,
  airDashFrames: 11,
} as const;

export const GUARD = {
  /** Guard crush accumulated on block before a guard break. */
  crushMax: 100,
  /** Guard crush that decays per frame when not blocking. */
  decay: 0.55,
  /** Frames of full stun after a guard break. */
  breakStun: 46,
  /** Health multiplier applied to chip damage. */
  chipScale: 0.14,
} as const;

export const COMBAT = {
  /** Frame advantage / hitstop helpers. */
  perfectWindowBonus: 0,
  /** Global "punish" state name used by the AI. */
  hitstunDecay: 1,
} as const;

export const ROUND = {
  /** 99 second timer at 60Hz. */
  frames: 99 * FPS,
  /** Freeze frames after a KO before the match result is finalised. */
  koFreeze: 150,
  introFrames: 60,
} as const;

export const BUFFER = {
  /** How long a cancelled move stays active after the cancel. */
  cancelWindow: 6,
} as const;

export const DEBUG = {
  showHitboxes: false,
} as const;

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
