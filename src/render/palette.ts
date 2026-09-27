/**
 * Presentation palette.
 *
 * Nothing here is gameplay state - these are drawing constants only. The rule
 * the art direction lives by: Mk. 2 is black, gunmetal and dark titanium with
 * bright metallic divine-gold seams. There is no white chassis and no blue.
 * Form 2 keeps the black armour and turns the gold up to white-gold violence.
 */

export const INK = '#05060a';
export const CHASSIS = '#0d0f14';
export const CHASSIS_LIT = '#1a1e28';
export const GUNMETAL = '#2b303c';
export const TITANIUM = '#3c4353';
export const TITANIUM_HI = '#59637a';
export const GOLD = '#f0c24a';
export const GOLD_HI = '#ffe9a8';
export const GOLD_HOT = '#fff6d2';
export const WHITE_GOLD = '#fff8e0';
export const SHADOW = 'rgba(0, 0, 0, 0.55)';

/** Arena surfaces. */
export const FLOOR_NEAR = '#0a0c12';
export const FLOOR_FAR = '#12151d';
export const FLOOR_LINE = 'rgba(240, 194, 74, 0.10)';

/** Status colours, keyed by the simulation status key. */
export const STATUS_COLOR: Record<string, string> = {
  conductive: '#7fd7ff',
  pierced: '#ffb45c',
  heavensMark: '#ffe27a',
  staticLock: '#c08bff',
  divineScar: '#fff0b0',
  divineShock: '#ffffff',
  burn: '#ff7a4a',
  poison: '#9ad24a',
  stun: '#ffd34a',
  armor: '#9fb6ff',
  counter: '#ff5c5c',
};

/**
 * Form 2 turns every gold surface up: the palette is not swapped, the
 * temperature is. `heat` is 0 for Form 1 and 1 for Form 2.
 */
export function goldFor(heat: number, base: string = GOLD): string {
  if (heat <= 0) return base;
  return mix(GOLD_HOT, WHITE_GOLD, heat);
}

export function mix(a: string, b: string, t: number): string {
  const ca = hex(a);
  const cb = hex(b);
  const r = Math.round(ca[0] + (cb[0] - ca[0]) * t);
  const g = Math.round(ca[1] + (cb[1] - ca[1]) * t);
  const bl = Math.round(ca[2] + (cb[2] - ca[2]) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

export function rgba(color: string, alpha: number): string {
  const c = hex(color);
  return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha})`;
}

function hex(color: string): [number, number, number] {
  if (color.startsWith('#')) {
    const h = color.slice(1);
    const full = h.length === 3 ? h.replace(/./g, (c) => c + c) : h;
    return [
      parseInt(full.slice(0, 2), 16),
      parseInt(full.slice(2, 4), 16),
      parseInt(full.slice(4, 6), 16),
    ];
  }
  const m = color.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  return [255, 255, 255];
}
