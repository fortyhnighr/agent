/**
 * Execution timelines.
 *
 * The ultimates are not "a super with more damage": they are scripted
 * frame-by-frame sequences of repositioning, thrusts and discharges. Every
 * strike is a real hitbox resolution, so the opponent can block, trade and get
 * punished for the recovery tail.
 *
 * Beats are keyed by frame and executed once each (bitmask in char state).
 */

import { F1, F2, S1 } from './constants';
import type { SeqBeat, Sequence } from './sequenceTypes';

const S = F1.execStrike;
const H = F1.execStrikeHeavy;
const FIN = F1.execFinal;
const DS = F2.seqStrike;
const DFIN = F2.seqFinal;

function execution(
  total: number,
  strikes: { f: number; side: number; scale: number; heavy?: boolean }[],
  final: { f: number; scale: number; move: string; side: number },
  tail: SeqBeat[] = [],
): Sequence {
  const beats: Sequence['beats'] = [];
  for (const s of strikes) {
    beats.push({ f: s.f - 2, k: 'tp', a: 72 * s.side, b: 0 });
    beats.push({ f: s.f, k: 'strike', id: s.heavy ? H : S, a: s.scale, side: s.side });
  }
  beats.push({ f: final.f - 4, k: 'vfx', id: 'execCharge', a: 1 });
  beats.push({ f: final.f - 2, k: 'tp', a: 88 * final.side, b: 0 });
  beats.push({ f: final.f, k: 'strike', id: final.move, a: final.scale, side: final.side });
  for (const t of tail) beats.push(t);
  beats.push({ f: 3, k: 'sfx', id: 'superFlash' });
  beats.push({ f: 3, k: 'shake', a: 16 });
  return { id: '', total, beats };
}

/* ---------------- Form 1 executions ---------------- */

export const SEQ_SPLITTER_1: Sequence = execution(
  100,
  [
    { f: 12, side: 1, scale: 0.7 },
    { f: 24, side: -1, scale: 0.7 },
    { f: 36, side: 1, scale: 0.7 },
    { f: 48, side: -1, scale: 0.7 },
  ],
  { f: 70, scale: 1.0, move: FIN, side: 1 },
  [
    { f: 74, k: 'status', a: 1, id: 'conductive' },
    { f: 90, k: 'vfx', a: 1, id: 'splitterEnd' },
  ],
);

export const SEQ_SPLITTER_2: Sequence = execution(
  122,
  [
    { f: 12, side: 1, scale: 0.6 },
    { f: 22, side: -1, scale: 0.6 },
    { f: 32, side: 1, scale: 0.6, heavy: true },
    { f: 42, side: -1, scale: 0.6 },
    { f: 52, side: 1, scale: 0.6 },
    { f: 62, side: -1, scale: 0.6 },
  ],
  { f: 86, scale: 1.2, move: FIN, side: 1 },
  [
    { f: 90, k: 'status', a: 2, id: 'conductive' },
    { f: 92, k: 'status', a: 1, id: 'pierced' },
    { f: 110, k: 'vfx', a: 1, id: 'splitterEnd' },
  ],
);

export const SEQ_SPLITTER_3: Sequence = execution(
  156,
  [
    { f: 12, side: 1, scale: 0.55 },
    { f: 20, side: -1, scale: 0.55 },
    { f: 28, side: 1, scale: 0.55 },
    { f: 36, side: -1, scale: 0.55 },
    { f: 44, side: 1, scale: 0.55, heavy: true },
    { f: 52, side: -1, scale: 0.55 },
    { f: 60, side: 1, scale: 0.55 },
    { f: 68, side: -1, scale: 0.55 },
    { f: 76, side: 1, scale: 0.55 },
  ],
  { f: 104, scale: 1.6, move: FIN, side: 1 },
  [
    { f: 108, k: 'status', a: 1, id: 'divineScar' },
    { f: 110, k: 'status', a: 1, id: 'pierced' },
    { f: 140, k: 'vfx', a: 1, id: 'splitterEnd' },
  ],
);

export const SEQ_SPLITTER_EX: Sequence = execution(
  178,
  [
    { f: 12, side: 1, scale: 0.55 },
    { f: 19, side: -1, scale: 0.55 },
    { f: 26, side: 1, scale: 0.55 },
    { f: 33, side: -1, scale: 0.55 },
    { f: 40, side: 1, scale: 0.55, heavy: true },
    { f: 47, side: -1, scale: 0.55 },
    { f: 54, side: 1, scale: 0.55 },
    { f: 61, side: -1, scale: 0.55 },
    { f: 68, side: 1, scale: 0.55 },
    { f: 75, side: -1, scale: 0.55 },
    { f: 82, side: 1, scale: 0.55, heavy: true },
  ],
  { f: 116, scale: 1.85, move: FIN, side: 1 },
  [
    { f: 120, k: 'status', a: 1, id: 'divineScar' },
    { f: 122, k: 'status', a: 1, id: 'pierced' },
    { f: 124, k: 'status', a: 1, id: 'heavensMark' },
    { f: 126, k: 'status', a: 2, id: 'conductive' },
    { f: 150, k: 'vfx', a: 1, id: 'splitterEnd' },
  ],
);

/* ---------------- Form 2: CREATOR! REFINE ME! ---------------- */

export const SEQ_REFINE: Sequence = {
  id: 'refine',
  total: 152,
  beats: [
    { f: 2, k: 'sfx', id: 'superFlash' },
    { f: 2, k: 'shake', a: 18 },
    { f: 2, k: 'storm', a: 1 },
    { f: 3, k: 'vfx', id: 'refineOpen', a: 1 },
    { f: 6, k: 'vfx', id: 'refineOpen', a: 2 },
    { f: 12, k: 'vfx', id: 'refineBody', a: 1 },
    { f: 20, k: 'vfx', id: 'refineBody', a: 2 },
    { f: 28, k: 'vfx', id: 'refineBody', a: 3 },
    { f: 36, k: 'vfx', id: 'refineBody', a: 4 },
    { f: 44, k: 'vfx', id: 'refineCore', a: 1 },
    { f: 46, k: 'shake', a: 22 },
    { f: 50, k: 'tp', a: 84, b: 0 },
    { f: 52, k: 'shot', id: F2.refineBolt, a: 0, b: 22, side: 1 },
    { f: 60, k: 'shot', id: F2.refineBolt, a: 0, b: -18, side: 1 },
    { f: 68, k: 'tp', a: -76, b: 0 },
    { f: 70, k: 'shot', id: F2.refineBolt, a: 0, b: 26, side: -1 },
    { f: 80, k: 'shot', id: F2.refineBolt, a: 0, b: 0, side: -1 },
    { f: 92, k: 'tp', a: 72, b: 0 },
    { f: 94, k: 'strike', id: DS, a: 0.6, side: 1 },
    { f: 104, k: 'tp', a: -70, b: 0 },
    { f: 106, k: 'strike', id: DS, a: 0.6, side: -1 },
    { f: 116, k: 'tp', a: 80, b: 0 },
    { f: 118, k: 'vfx', id: 'refineCore', a: 2 },
    { f: 120, k: 'strike', id: DFIN, a: 0.8, side: 1 },
    { f: 124, k: 'status', a: 1, id: 'divineScar' },
    { f: 126, k: 'status', a: 1, id: 'divineShock' },
    { f: 128, k: 'shake', a: 26 },
    { f: 150, k: 'vfx', id: 'refineEnd', a: 1 },
  ],
};

/* ---------------- Form 2: THE UNRELENTING MIGHT OF THE CREATOR ---------------- */

export const SEQ_MIGHT: Sequence = {
  id: 'might',
  total: 214,
  beats: [
    { f: 2, k: 'sfx', id: 'superFlash' },
    { f: 2, k: 'shake', a: 22 },
    { f: 2, k: 'storm', a: 1 },
    { f: 4, k: 'vfx', id: 'mightOpen', a: 1 },
    { f: 8, k: 'vfx', id: 'mightOpen', a: 2 },
    /* phase 1 - the machine crosses the arena */
    { f: 12, k: 'tp', a: 300, b: 0 },
    { f: 14, k: 'strike', id: DS, a: 0.8, side: 1 },
    { f: 22, k: 'tp', a: -90, b: 0 },
    { f: 24, k: 'strike', id: DS, a: 0.8, side: -1 },
    { f: 32, k: 'tp', a: 90, b: 0 },
    { f: 34, k: 'strike', id: DS, a: 0.8, side: 1 },
    { f: 44, k: 'tp', a: -90, b: 0 },
    { f: 46, k: 'strike', id: DS, a: 0.8, side: -1 },
    { f: 56, k: 'tp', a: 88, b: 0 },
    { f: 58, k: 'strike', id: DS, a: 0.8, side: 1 },
    { f: 66, k: 'shake', a: 20 },
    /* phase 2 - the storm is the weapon */
    { f: 72, k: 'vfx', id: 'mightArray', a: 1 },
    { f: 74, k: 'shot', id: F2.arraySpear, a: 0, b: 96, side: 1 },
    { f: 78, k: 'shot', id: F2.arraySpear, a: 0, b: 48, side: 1 },
    { f: 82, k: 'shot', id: F2.arraySpear, a: 0, b: 0, side: 1 },
    { f: 86, k: 'shot', id: F2.arraySpear, a: 0, b: -48, side: 1 },
    { f: 90, k: 'shot', id: F2.arraySpear, a: 0, b: -96, side: 1 },
    { f: 94, k: 'shot', id: F2.pillar, a: 0, b: 40, side: 1 },
    { f: 104, k: 'tp', a: -86, b: 0 },
    { f: 106, k: 'shot', id: F2.arraySpear, a: 0, b: 70, side: -1 },
    { f: 110, k: 'shot', id: F2.arraySpear, a: 0, b: 20, side: -1 },
    { f: 114, k: 'shot', id: F2.arraySpear, a: 0, b: -30, side: -1 },
    { f: 120, k: 'shot', id: F2.pillar, a: 0, b: 50, side: -1 },
    /* phase 3 - judgement */
    { f: 134, k: 'vfx', id: 'mightCore', a: 1 },
    { f: 136, k: 'tp', a: 80, b: 0 },
    { f: 138, k: 'shot', id: F2.refineBolt, a: 0, b: 60, side: 1 },
    { f: 144, k: 'shot', id: F2.refineBolt, a: 0, b: 0, side: 1 },
    { f: 150, k: 'shot', id: F2.refineBolt, a: 0, b: -60, side: 1 },
    { f: 156, k: 'tp', a: -84, b: 0 },
    { f: 158, k: 'shot', id: F2.refineBolt, a: 0, b: 40, side: -1 },
    { f: 164, k: 'shot', id: F2.refineBolt, a: 0, b: -40, side: -1 },
    { f: 172, k: 'shake', a: 28 },
    { f: 176, k: 'vfx', id: 'mightFinal', a: 1 },
    { f: 178, k: 'tp', a: 86, b: 0 },
    { f: 182, k: 'strike', id: DFIN, a: 1.8, side: 1 },
    { f: 186, k: 'status', a: 1, id: 'divineScar' },
    { f: 188, k: 'status', a: 1, id: 'staticLock' },
    { f: 190, k: 'shake', a: 34 },
    { f: 200, k: 'vfx', id: 'mightEnd', a: 1 },
  ],
};

export const SEQUENCES: Record<string, Sequence> = {
  splitter1: SEQ_SPLITTER_1,
  splitter2: SEQ_SPLITTER_2,
  splitter3: SEQ_SPLITTER_3,
  splitterEx: SEQ_SPLITTER_EX,
  refine: SEQ_REFINE,
  might: SEQ_MIGHT,
};

export const SEQUENCE_OWNER: Record<string, string> = {
  [S]: 'strike',
  [H]: 'strike',
  [FIN]: 'final',
  [DS]: 'strike',
  [DFIN]: 'final',
  [S1.thunderline]: 'shot',
};
