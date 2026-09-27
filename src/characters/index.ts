/**
 * Roster entry point. Importing this module registers every character, move,
 * shot and hook with the simulation registry.
 */

import { mk1 } from './mk1';
import { mk2 } from './mk2';

export { mk1, mk2 };
export const ROSTER = [mk1, mk2];
export const DEFAULT_P1 = 'mk2';
export const DEFAULT_P2 = 'mk1';
