/** Sequence name <-> char-state code (kept in its own module to avoid cycles). */

export const SEQ_CODES: Record<string, number> = {
  splitter1: 1,
  splitter2: 2,
  splitter3: 3,
  splitterEx: 4,
  refine: 5,
  might: 6,
};

export function seqIdToCode(id: string): number {
  return SEQ_CODES[id] ?? 0;
}

export function seqCodeToId(code: number): string {
  for (const k in SEQ_CODES) if (SEQ_CODES[k] === code) return k;
  return '';
}
