/**
 * Physics, timers and the shared stickman body state machine.
 *
 * This is the part every character inherits: walking, crouching, jumping,
 * dashing, guard stance, hitstun, blockstun, knockdown, wakeup and pushbox
 * separation. Character specific logic hooks in through CharacterDef.onInput.
 */

import { BODY, DASH, PHYSICS, STAGE } from './const';
import { charOf, moveOf, runMoveHook } from './registry';
import { clampToStage, opponentOf } from './state';
import { canAct, endMove, grantCancel, setState, spawnShot } from './actions';
import type { Fighter, MatchState } from './types';

export function tickTimers(f: Fighter): void {
  if (f.invuln > 0) f.invuln -= 1;
  if (f.armor > 0) f.armor -= 1;
  if (f.cancelTimer > 0) f.cancelTimer -= 1;
  if (f.dashCd > 0) f.dashCd -= 1;
  if (f.flashFrames > 0) f.flashFrames -= 1;
  if (f.hitEvent > 0) f.hitEvent -= 1;
  if (f.wakeupInvuln > 0) f.wakeupInvuln -= 1;
  if (f.attackActive > 0) f.attackActive -= 1;
}

export function integrate(state: MatchState, f: Fighter): void {
  if (!f.onGround) {
    f.vy -= PHYSICS.gravity;
    if (f.vy < -PHYSICS.maxFall) f.vy = -PHYSICS.maxFall;
  } else if (Math.abs(f.vx) > 0.01) {
    f.vx *= PHYSICS.frictionGround;
    if (Math.abs(f.vx) < 0.06) f.vx = 0;
  } else {
    f.vx = 0;
  }

  f.x += f.vx;
  f.y += f.vy;

  if (f.y <= STAGE.ground) {
    const wasAir = !f.onGround;
    f.y = STAGE.ground;
    if (wasAir) {
      f.onGround = true;
      f.vy = 0;
      f.airDashes = DASH.airDashes;
      onLand(state, f);
    }
    f.vy = 0;
  } else {
    f.onGround = false;
  }

  clampToStage(f);
}

function onLand(state: MatchState, f: Fighter): void {
  const opp = opponentOf(state, f);
  if (f.state === 'knockdown') {
    setState(f, 'wakeup');
    f.wakeupInvuln = 20;
    f.juggle = 0;
  } else if (f.state === 'hitstun' || f.state === 'air') {
    if (f.hitstun <= 0) setState(f, 'idle');
  }
  void opp;
}

/** Move lifecycle: startup -> active -> recovery, velocity curves, whiff/expire. */
export function updateMove(state: MatchState, f: Fighter): void {
  if (!f.move) return;
  const opp = opponentOf(state, f);
  const m = f.move;
  const d = moveOf(m.id);
  m.frame += 1;

  if (m.frame === 1) {
    runMoveHook(d.onActivate, { state, self: f, opp, moveId: d.id, frame: 1 });
  }

  // Chain cancels open on the first active frame: the startup of a move can
  // never be cancelled (not even into itself).
  if (d.chain && d.chain.length && m.frame === d.startup) {
    grantCancel(f, d.chain, d.active + d.recovery);
  }

  if (d.shot && m.frame === (d.shotFrame ?? 2)) {
    spawnShot(state, f, d.shot, { vars: { index: 0 } });
  }

  if (d.invuln && m.frame >= d.invuln[0] && m.frame <= d.invuln[1]) f.invuln = Math.max(f.invuln, 2);
  if (d.armor && m.frame >= d.armor[0] && m.frame <= d.armor[1]) f.armor = Math.max(f.armor, 2);

  if (d.vel) {
    for (const v of d.vel) {
      if (m.frame >= v.from && m.frame <= v.to) {
        f.vx = v.vx * f.facing;
        f.vy = v.vy;
      }
    }
  }

  const activeEnd = d.startup + d.active;
  if (m.frame === activeEnd && m.hits === 0) {
    runMoveHook(d.onWhiff, { state, self: f, opp, moveId: d.id, frame: m.frame });
  }
  if (m.frame > activeEnd && m.frame === activeEnd + d.recovery + 1) {
    runMoveHook(d.onExpire, { state, self: f, opp, moveId: d.id, frame: m.frame });
    // The expire hook may have started a follow-up move (Heavenfall, AI
    // sequences). Only tear down the move that actually finished.
    if (f.move === m) {
      endMove(f);
      if (f.state === 'attack') setState(f, f.onGround ? 'idle' : 'air');
    }
  }
}

/** Stun/knockdown/wakeup bookkeeping. */
export function updateStun(f: Fighter): void {
  if (f.hitstun > 0) {
    f.hitstun -= 1;
    if (f.hitstun <= 0) {
      f.hitstun = 0;
      if (f.state === 'hitstun') {
        if (!f.onGround) {
          setState(f, 'knockdown');
        } else {
          setState(f, 'idle');
          f.juggle = 0;
        }
      }
    }
  }
  if (f.blockstun > 0) {
    f.blockstun -= 1;
    if (f.blockstun <= 0 && f.state === 'blockstun') {
      setState(f, f.onGround ? 'idle' : 'air');
      f.guarding = false;
    }
  }
  if (f.state === 'guardBreak') {
    if (f.hitstun > 0) return;
    if (f.stateFrame > 46) setState(f, f.onGround ? 'idle' : 'air');
  }
  if (f.state === 'wakeup' && f.stateFrame > 18) setState(f, 'idle');
  if (f.state === 'knockdown' && f.onGround && f.stateFrame > 20) {
    setState(f, 'wakeup');
    f.wakeupInvuln = 20;
    f.juggle = 0;
  }
  if (f.state === 'dash' && f.dashFrame <= 0) setState(f, f.onGround ? 'idle' : 'air');
  if (f.state === 'airDash' && f.dashFrame <= 0) setState(f, 'air');
  if (f.state === 'landing' && f.stateFrame > 4) setState(f, 'idle');
}

/** Pushbox separation so bodies never occupy the same space. */
export function separate(a: Fighter, b: Fighter): void {
  const minDist = BODY.width * 0.92;
  const dx = b.x - a.x;
  const dist = Math.abs(dx);
  if (dist >= minDist) return;
  const push = (minDist - dist) * PHYSICS.pushStrength;
  const dir = dx >= 0 ? 1 : -1;
  a.x -= push * dir;
  b.x += push * dir;
  clampToStage(a);
  clampToStage(b);
  // Cross-ups: when a body passes through, swap facing responsibility.
  a.facing = dir >= 0 ? 1 : -1;
  b.facing = dir >= 0 ? -1 : 1;
}

/** Shared movement handling available to every character. */
export function sharedLocomotion(
  state: MatchState,
  f: Fighter,
  opts: {
    canWalk: boolean;
    canCrouch: boolean;
    canJump: boolean;
    canDash: boolean;
    canGuard: boolean;
    dashSpeedScale?: number;
  },
): void {
  const def = charOf(f.charId);
  const down = f.padDown === 1;
  const fwd = f.padFwd === 1;
  const back = f.padBack === 1;
  const locked = !!f.statuses.staticLock.stacks;

  f.crouching = opts.canCrouch && down && f.onGround;
  if (opts.canGuard) {
    f.guarding = f.padGuard === 1 && canAct(f) && !f.crouching;
    f.guardLow = f.guarding && down;
  } else {
    f.guarding = false;
    f.guardLow = false;
  }

  if (opts.canWalk && !f.crouching) {
    // "Forward" is relative to the fighter, not the world: walking toward the
    // opponent has to work when they are on the left.
    if (fwd) {
      f.vx = def.walkF * f.facing * (locked ? 0.85 : 1);
      setState(f, 'walkF');
    } else if (back) {
      f.vx = -def.walkB * f.facing * (locked ? 0.85 : 1);
      setState(f, 'walkB');
    } else if (f.onGround) {
      setState(f, 'idle');
    }
  }
  if (f.onGround && !f.crouching && !fwd && !back && f.state === 'walkF') setState(f, 'idle');
  if (f.onGround && !f.crouching && !fwd && !back && f.state === 'walkB') setState(f, 'idle');

  // Jump / air state
  if (f.onGround && !f.crouching && (f.state === 'idle' || f.state === 'walkF' || f.state === 'walkB')) {
    if (opts.canJump && f.padJump === 1) {
      f.vy = def.jumpVy;
      f.vx = (fwd ? def.jumpVx * f.facing : back ? -def.jumpVx * 0.8 * f.facing : f.vx * 0.5);
      f.onGround = false;
      f.airDashes = DASH.airDashes;
      setState(f, 'air');
      state.events.push({ k: 'sfx', id: 'jump', a: f.x, b: 0, c: 0, t: '' });
    }
  }
  if (!f.onGround && f.state !== 'hitstun' && f.state !== 'knockdown' && f.state !== 'airDash') {
    setState(f, 'air');
  }

  // Dash
  if (opts.canDash && f.dashCd <= 0 && !f.move && f.state !== 'dash') {
    if (f.padDashF === 1 && f.onGround) {
      startDash(f, 1, 'ground', (opts.dashSpeedScale ?? 1) * DASH.speed);
    } else if (f.padDashB === 1 && f.onGround) {
      startDash(f, -1, 'back', (opts.dashSpeedScale ?? 1) * DASH.speed * 0.92);
    }
  }
}

export function startDash(
  f: Fighter,
  dir: -1 | 1,
  kind: 'ground' | 'back' | 'air',
  speed: number,
): void {
  const locked = f.statuses.staticLock.stacks > 0;
  setState(f, kind === 'air' ? 'airDash' : 'dash');
  f.dashDir = dir;
  f.dashKind = kind;
  f.dashFrame = kind === 'air' ? DASH.airDashFrames : DASH.active;
  f.dashCd = DASH.cooldown;
  f.vx = speed * dir;
  f.vy = kind === 'air' ? 0 : 0;
  f.airDashes = Math.max(0, f.airDashes - 1);
  if (locked) f.dashFrame += 6;
}

export function tickDash(f: Fighter): void {
  if (f.state === 'dash') {
    f.dashFrame -= 1;
    f.vx = DASH.speed * f.dashDir * (f.dashFrame > DASH.active - 5 ? 0.55 : 1);
    f.dashCd = Math.max(f.dashCd, 0);
  } else if (f.state === 'airDash') {
    f.dashFrame -= 1;
    f.vx = DASH.airDashSpeed * f.dashDir;
    f.vy = 0;
  }
}

export function airDashAvailable(f: Fighter): boolean {
  return f.airDashes > 0 && f.statuses.staticLock.stacks === 0;
}
