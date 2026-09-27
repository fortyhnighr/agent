/** Shared shape for the scripted execution timelines. */

export interface SeqBeat {
  /** Frame within the sequence. */
  f: number;
  /** Beat kind. */
  k: 'strike' | 'final' | 'tp' | 'vfx' | 'sfx' | 'shake' | 'invuln' | 'armor' | 'status' | 'shot' | 'storm' | 'charge' | 'hitstop';
  /** Primary argument (scale / distance / power / amount). */
  a?: number;
  /** Secondary argument (y position). */
  b?: number;
  /** Move id, shot kind, status key or vfx id. */
  id?: string;
  /** Which side of the opponent to occupy. */
  side?: number;
}

export interface Sequence {
  id: string;
  total: number;
  beats: SeqBeat[];
}
