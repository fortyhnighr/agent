/**
 * CYBORG MK. 2
 *
 * Creator's second assassination machine. Black titanium chassis, gold energy
 * channels, and a spear whose head is a literal lightning bolt compressed into
 * a storm cloud: HEAVEN SPLITTER.
 *
 * Form 1 is engineering. Form 2 is what the wrong Creator did to it.
 */

import { registerCharacter } from '../../sim/registry';
import { FORM1_MOVES, FORM1_SHOTS } from './moves';
import { FORM2_MOVES, FORM2_SHOTS } from './moves2';
import { MK2 } from './constants';
import { makeMk2CharState } from './state';
import {
  afterCombat,
  guardMods,
  incomingMods,
  onDamaged,
  onFrame,
  onInput,
  outgoingMods,
} from './logic';
import { onDeath, onOpponentDeath } from './secondLife';
import { mk2AI } from './ai';
import './hooks';
import './sequence';
import type { CharacterDef } from '../../sim/types';

const moveList: { input: string; name: string; note: string }[] = [
  { input: 'J', name: 'FLASH THRUST', note: 'Clean hit: +1 Divine Charge, +1 Conductive. Counter: +1 more each.' },
  { input: 'K', name: 'STREAK LUNGE', note: 'Advancing thrust. 2+ Conductive -> consume 1 for travel invulnerability. Counter applies Pierced.' },
  { input: 'L', name: 'RAILSPEAR', note: 'Committed heavy thrust. Hold for 4 (compressed) or 8 (full rail) Divine Charge. Whiffing still costs it.' },
  { input: 'I', name: 'FLASH PHASE', note: 'Displacement with little defensive value. Phase an incoming hit to earn +3 Charge, a Mark and a cancel window.' },
  { input: 'U', name: 'HEAVENFALL', note: 'Anti-air into a descending impalement. 6 Charge for a divine ascent. Conductive amplifies the landing; 3 consumed applies Static Lock.' },
  { input: 'O', name: 'THUNDERLINE', note: 'Line-based lightning thrust. With 2+ Conductive or a Mark and 4 Charge: aligned variant, applies Pierced.' },
  { input: 'DOWN+O', name: "HEAVEN'S ARRAY", note: '6 Charge. Five cloud-held lightning spears. 3 hits -> Static Lock. All 5 -> Heaven\'s Mark.' },
  { input: 'P', name: 'JUDGEMENT BOLT', note: 'Requires a Mark and 5 Charge, or it does not activate. 1/2/3 Marks -> 1/2/3 bolts.' },
  { input: 'R', name: 'HEAVEN SPLITTER: DIVINE EXECUTION', note: '10-14 / 15-19 / 20 Charge tiers. 20 + Attunement 3 + Mark is the full execution.' },
  { input: 'J', name: 'SMITE', note: 'FORM 2. Applies Divine Shock.' },
  { input: 'K', name: 'SMITE: MEDIUM ATTUNEMENT', note: 'FORM 2. Moves farther, strikes harder, discharges again.' },
  { input: 'L', name: 'SMITE: SO YOU SHALL FALL', note: 'FORM 2. Consumes Divine Shock for a violent discharge.' },
  { input: 'I', name: 'AH… CREATOR!', note: 'FORM 2. Lightning displacement with a Divine Shock trail. Can still Perfect Phase.' },
  { input: 'U', name: 'I WILL DECAPITATE YOU MYSELF.', note: 'FORM 2. Closes the distance itself, then finishes at point blank.' },
  { input: 'O', name: 'AND SHOW YOU…', note: 'FORM 2. First half of a sentence. Confines the target inside a spear formation.' },
  { input: 'DOWN+O', name: 'MY UNRELENTING MIGHT!', note: 'FORM 2. Eight divine spear replicas, storm response, movement restriction.' },
  { input: 'P', name: 'JUDGEMENT: CREATOR', note: 'FORM 2. Massive vertical gold lightning. Consumes Divine Shock.' },
  { input: 'R', name: 'CREATOR! REFINE ME!', note: 'FORM 2 ultimate. At Attunement 3 with a Marked or 3+ Divine Shock target: THE UNRELENTING MIGHT OF THE CREATOR.' },
];

export const mk2: CharacterDef = registerCharacter({
  id: 'mk2',
  name: 'CYBORG MK. 2',
  maxHp: MK2.maxHp,
  walkF: MK2.walkF,
  walkB: MK2.walkB,
  jumpVy: MK2.jumpVy,
  jumpVx: MK2.jumpVx,
  airControl: MK2.airControl,
  moves: [...FORM1_MOVES, ...FORM2_MOVES],
  shots: [...FORM1_SHOTS, ...FORM2_SHOTS],
  makeCharState: makeMk2CharState,
  onFrame,
  onInput,
  afterCombat,
  onDamaged,
  outgoingMods,
  incomingMods,
  guardMods,
  onDeath,
  onOpponentDeath,
  ai: mk2AI,
  moveList,
  palette: { body: '#0d0f14', accent: '#f0c24a', glow: '#fff3c4' },
});

export default mk2;
