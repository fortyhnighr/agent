/**
 * Sequence runner: turns a scripted timeline into real hit resolutions,
 * teleports, shots, status applications and VFX.
 *
 * The cursor (which beat to run next) lives in char state so rollback and
 * re-simulation stay exact.
 */

import { applyHit } from '../../sim/combat';
import { emit, shake, spawnShot } from '../../sim/actions';
import { clampToStage } from '../../sim/state';
import { applyStatus } from '../../sim/statuses';
import { CK } from './constants';
import { addCharge } from './state';
import { seqCodeToId } from './sequenceCodes';
import { SEQUENCES } from './sequences';
import type { SeqBeat } from './sequenceTypes';
import type { Fighter, MatchState } from '../../sim/types';

function runBeat(state: MatchState, self: Fighter, opp: Fighter, beat: SeqBeat): void {
  switch (beat.k) {
    case 'tp': {
      self.x = opp.x + (beat.a ?? 0);
      self.y = beat.b ?? 0;
      self.facing = (beat.a ?? 0) >= 0 ? 1 : -1;
      self.vx = 0;
      self.vy = 0;
      clampToStage(self);
      break;
    }
    case 'strike': {
      const side = beat.side ?? 1;
      self.x = opp.x + 74 * side;
      self.y = 0;
      self.facing = side >= 0 ? 1 : -1;
      clampToStage(self);
      const id = beat.id ?? 'mk2:exec-strike';
      const hx = (opp.x + self.x) / 2;
      const hy = self.y + 52;
      emit(state, 'vfx', 'execStrike', hx, hy, beat.a ?? 1);
      applyHit(state, self, opp, {
        moveId: id,
        fromShot: false,
        shotKind: '',
        hitIndex: 0,
        baseScale: beat.a ?? 1,
        hitX: hx,
        hitY: hy,
      });
      break;
    }
    case 'shot': {
      const kind = beat.id ?? 'mk2f2:divine-arc';
      const side = beat.side ?? 1;
      const x = self.x + 40 * side;
      const y = self.y + (beat.b ?? 40);
      const ang = side >= 0 ? 0 : 180;
      spawnShot(state, self, kind, { x, y, angle: ang, vars: { seq: 1 } });
      emit(state, 'vfx', 'seqShot', x, y, 1);
      break;
    }
    case 'status': {
      applyStatus(opp, beat.id ?? 'conductive', beat.a ?? 1);
      emit(state, 'vfx', 'statusFlash', opp.x, opp.y + 52, 1);
      break;
    }
    case 'vfx':
      emit(state, 'vfx', beat.id ?? 'seq', self.x, self.y + 56, beat.a ?? 1);
      break;
    case 'sfx':
      emit(state, 'sfx', beat.id ?? 'seq', self.x, 0, 0);
      break;
    case 'shake':
      shake(state, beat.a ?? 8);
      break;
    case 'invuln':
      self.invuln = Math.max(self.invuln, beat.a ?? 10);
      break;
    case 'armor':
      self.armor = Math.max(self.armor, beat.a ?? 10);
      break;
    case 'charge':
      addCharge(self, beat.a ?? 1);
      break;
    case 'storm':
      state.stormFlash = Math.max(state.stormFlash, beat.a ?? 1);
      state.stormFlashDecay = 0.02;
      break;
    case 'hitstop':
      self.hitstop = Math.max(self.hitstop, beat.a ?? 8);
      break;
  }
}

export function tickSequence(state: MatchState, self: Fighter, opp: Fighter): void {
  const code = self.char[CK.seq] ?? 0;
  if (!code) return;
  const id = seqCodeToId(code);
  const seq = SEQUENCES[id];
  if (!seq) {
    self.char[CK.seq] = 0;
    self.char[CK.seqFrame] = 0;
    self.char[CK.seqCursor] = 0;
    return;
  }
  const frame = (self.char[CK.seqFrame] ?? 0) + 1;
  self.char[CK.seqFrame] = frame;
  let cursor = self.char[CK.seqCursor] ?? 0;
  while (cursor < seq.beats.length && seq.beats[cursor].f <= frame) {
    runBeat(state, self, opp, seq.beats[cursor]);
    cursor += 1;
  }
  self.char[CK.seqCursor] = cursor;
  if (frame >= seq.total) {
    self.char[CK.seq] = 0;
    self.char[CK.seqFrame] = 0;
    self.char[CK.seqCursor] = 0;
  }
}
