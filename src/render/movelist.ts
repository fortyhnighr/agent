/**
 * HUD move list.
 *
 * The player is never guessing. Every move Mk. 2 has right now is listed with
 * the exact input and its name, and a move only lights up when the machine has
 * actually earned it: the Charge is there, the statuses are there, the
 * Attunement is there. Form 2 lists the transformed arts instead.
 */

import { canUse } from '../characters/mk2/logic';
import { moveOf } from '../sim/registry';
import { CK, F1, F2 } from '../characters/mk2/constants';
import type { Fighter, MatchState } from '../sim/types';

export interface MoveRow {
  /** Pad notation. */
  input: string;
  name: string;
  /** The strict requirement, shown next to the name. */
  requirement: string;
  legal: (state: MatchState, self: Fighter, opp: Fighter) => boolean;
}

function row(input: string, moveId: string, requirement: string): MoveRow {
  const def = moveOf(moveId);
  return {
    input,
    name: def.name,
    requirement,
    legal: (_s, self, opp) => canUse(self, opp, moveId),
  };
}

const always = (): boolean => true;

export const MOVE_LIST_F1: MoveRow[] = [
  { input: 'J', name: 'FLASH THRUST', requirement: '+1 Charge on a clean hit', legal: always },
  { input: 'K', name: 'STREAK LUNGE', requirement: 'longer reach', legal: always },
  {
    input: 'L (tap)',
    name: 'RAILSPEAR',
    requirement: 'committed · whiff costs 4',
    legal: always,
  },
  {
    input: 'L (hold 8f)',
    name: 'RAILSPEAR L1',
    requirement: '8 Charge',
    legal: (_s, self, opp) => canUse(self, opp, F1.railspearL1),
  },
  {
    input: 'L (hold 24f)',
    name: 'RAILSPEAR L2',
    requirement: '12 Charge',
    legal: (_s, self, opp) => canUse(self, opp, F1.railspearL2),
  },
  {
    input: 'I',
    name: 'FLASH PHASE',
    requirement: 'limited · Perfect Phase rewards +3 Charge +1 Mark',
    legal: always,
  },
  row('U', F1.heavenfallRise, '3+ Conductive converts to Static Lock'),
  row('O', F1.thunderline, 'line lightning · sets up Conductive'),
  row('O · 4 Charge', F1.thunderlineEnhanced, '2+ Conductive OR 1 Mark'),
  row('↓+O · 6 Charge', F1.heavensArray, '3 lines = Static Lock · 5 lines = Mark'),
  row('P · 5 Charge', F1.judgementBolt, 'strictly 1 Mark + 5 Charge'),
  row('R · 10 Charge', F1.splitter1, 'Divine Execution · tier 1'),
  row('R · 15 Charge', F1.splitter2, 'Divine Execution · tier 2'),
  row('R · 20 Charge', F1.splitter3, 'Divine Execution · tier 3'),
  {
    input: 'R · 20 · Att 3',
    name: 'DIVINE EXECUTION · EX',
    requirement: "20 Charge · 1 Mark · Attunement 3",
    legal: (_s, self, opp) => canUse(self, opp, F1.splitterEx),
  },
];

export const MOVE_LIST_F2: MoveRow[] = [
  row('J', F2.smite, 'the storm is open'),
  row('K', F2.smiteMedium, 'Medium Attunement'),
  row('L', F2.smiteFall, 'falls from above'),
  row('I', F2.ahCreator, 'the prayer'),
  row('U', F2.decapitate, 'I will decapitate you myself.'),
  row('O', F2.andShowYou, 'and show you…'),
  row('↓+O', F2.unrelentingMight, 'My Unrelenting Might!'),
  row('P', F2.judgementCreator, 'Judgement: Creator'),
  row('R', F2.creatorRefineMe, 'Creator! Refine Me!'),
  {
    input: 'R · Att 3',
    name: 'UNRELENTING MIGHT OF THE CREATOR',
    requirement: 'a Mark OR 3 Divine Shock · fully transformed',
    legal: (_s, self, opp) => canUse(self, opp, F2.mightOfCreator),
  },
];

/** Which form's list applies, given a fighter. */
export function moveListFor(self: Fighter): MoveRow[] {
  return (self.char[CK.form] ?? 1) === 2 ? MOVE_LIST_F2 : MOVE_LIST_F1;
}
