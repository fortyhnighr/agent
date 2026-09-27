/**
 * Browser bootstrap.
 *
 * The simulation runs at a fixed 60Hz no matter what the display does. Rendering
 * and audio read the simulation; they never write to it. That separation is
 * what keeps the match deterministic and rollback-able.
 */

import '../src/characters';
import { createMatch } from './sim/state';
import { step, type Inputs } from './sim/engine';
import { charOf } from './sim/registry';
import { STAGE } from './sim/const';
import { hurtbox } from './sim/state';
import { moveOf } from './sim/registry';
import { CK } from './characters/mk2/constants';
import { FxLayer } from './render/fx';
import { Scene } from './render/scene';
import { drawFighter, poseOf, type FighterStyle } from './render/fighter';
import { drawHud } from './render/hud';
import { drawShot } from './render/shots';
import { AudioEngine, panFor } from './audio/engine';
import { ROSTER } from './characters';
import type { Fighter, MatchState } from './sim/types';

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const maybeCtx = canvas.getContext('2d', { alpha: false });
if (!maybeCtx) throw new Error('2D canvas is required');
const ctx: CanvasRenderingContext2D = maybeCtx;

const W = canvas.width;
const H = canvas.height;
const GROUND_SCREEN_Y = H - 96;

/* ------------------------------------------------------------------ */
/* Match                                                              */
/* ------------------------------------------------------------------ */

let p1Id = 'mk2';
let p2Id = 'mk1';
let aiP2 = true;
let showHitboxes = false;
let showDebug = false;

let state: MatchState = createMatch({ p1: p1Id, p2: p2Id, seed: 0xc0ffee, aiP2 });
state.phase = 'fight';

const fx = new FxLayer();
const scene = new Scene();
const audio = new AudioEngine();
fx.reset(state.seed);

/* ------------------------------------------------------------------ */
/* Input                                                              */
/* ------------------------------------------------------------------ */

const KEY_BITS: Record<string, number> = {
  ArrowLeft: 1 << 0,
  KeyA: 1 << 0,
  ArrowRight: 1 << 1,
  KeyD: 1 << 1,
  ArrowUp: 1 << 2,
  KeyW: 1 << 2,
  ArrowDown: 1 << 3,
  KeyS: 1 << 3,
  KeyJ: 1 << 4,
  KeyK: 1 << 5,
  KeyL: 1 << 6,
  KeyI: 1 << 7,
  KeyU: 1 << 8,
  KeyO: 1 << 9,
  KeyP: 1 << 10,
  KeyR: 1 << 11,
  ShiftLeft: 1 << 12,
  ShiftRight: 1 << 12,
  KeyG: 1 << 12,
  Space: 1 << 12,
};

/** Held keys, plus the on-screen buttons. */
const held = new Set<string>();
let padBits = 0;

function recomputePad(): void {
  let bits = 0;
  for (const key of held) {
    const b = KEY_BITS[key];
    if (b) bits |= b;
  }
  padBits = bits;
}

window.addEventListener('keydown', (e) => {
  if (!KEY_BITS[e.code]) return;
  e.preventDefault();
  if (!e.repeat) {
    held.add(e.code);
    audio.resume();
  }
  recomputePad();
});
window.addEventListener('keyup', (e) => {
  held.delete(e.code);
  recomputePad();
});
window.addEventListener('blur', () => {
  held.clear();
  recomputePad();
});

// On-screen pad: same bits, so the game plays identically on a phone.
const PAD_BUTTONS: Record<string, number> = {
  J: 1 << 4,
  K: 1 << 5,
  L: 1 << 6,
  I: 1 << 7,
  U: 1 << 8,
  O: 1 << 9,
  P: 1 << 10,
  R: 1 << 11,
  G: 1 << 12,
};
for (const el of document.querySelectorAll<HTMLButtonElement>('[data-btn]')) {
  const key = el.dataset.btn ?? '';
  const bit = PAD_BUTTONS[key];
  if (!bit) continue;
  const down = (e: Event): void => {
    e.preventDefault();
    audio.resume();
    padBits |= bit;
    el.classList.add('down');
  };
  const up = (e: Event): void => {
    e.preventDefault();
    padBits &= ~bit;
    el.classList.remove('down');
  };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointerleave', up);
  el.addEventListener('pointercancel', up);
}

/* ------------------------------------------------------------------ */
/* Options                                                            */
/* ------------------------------------------------------------------ */

function bindCheckbox(id: string, initial: boolean, onChange: (v: boolean) => void): void {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (!el) return;
  el.checked = initial;
  onChange(initial);
  el.addEventListener('change', () => onChange(el.checked));
}

function bindSlot(slot: 'p1' | 'p2', onPick: (id: string) => void): void {
  for (const id of ['mk1', 'mk2']) {
    const el = document.getElementById(`${slot}-${id}`);
    el?.addEventListener('click', () => {
      audio.resume();
      onPick(id);
    });
  }
}

function paintSelection(): void {
  for (const slot of ['p1', 'p2'] as const) {
    const current = slot === 'p1' ? p1Id : p2Id;
    for (const id of ['mk1', 'mk2']) {
      document.getElementById(`${slot}-${id}`)?.classList.toggle('active', id === current);
    }
  }
  document.getElementById('btn-mirror')?.classList.toggle('active', p1Id === p2Id);
}

function restartMatch(): void {
  state = createMatch({ p1: p1Id, p2: p2Id, seed: 0xc0ffee, aiP2 });
  state.phase = 'fight';
  state.aiControlled[0] = 0;
  fx.reset(state.seed);
  paintSelection();
}

bindSlot('p1', (id) => {
  p1Id = id;
  restartMatch();
});
bindSlot('p2', (id) => {
  p2Id = id;
  restartMatch();
});
document.getElementById('btn-mirror')?.addEventListener('click', () => {
  audio.resume();
  p2Id = p1Id;
  restartMatch();
});
bindCheckbox('opt-ai', true, (v) => {
  aiP2 = v;
  // Take effect on the current match, no restart needed.
  state.aiControlled[1] = v ? 1 : 0;
});
bindCheckbox('opt-hits', false, (v) => {
  showHitboxes = v;
});
bindCheckbox('opt-sfx', true, (v) => {
  audio.setMuted(!v);
  if (v) audio.resume();
});
bindCheckbox('opt-debug', false, (v) => {
  showDebug = v;
});
document.getElementById('btn-restart')?.addEventListener('click', () => {
  audio.resume();
  restartMatch();
});
restartMatch();

/* ------------------------------------------------------------------ */
/* Simulation loop                                                    */
/* ------------------------------------------------------------------ */

const STEP_MS = 1000 / 60;
let accumulator = 0;
let last = 0;
const pendingInputs: Inputs = [0, 0];

function simulateOneFrame(): void {
  pendingInputs[0] = padBits;
  pendingInputs[1] = 0;
  step(state, pendingInputs);
  drainEvents();
}

function drainEvents(): void {
  for (const ev of state.events) {
    switch (ev.k) {
      case 'vfx':
        fx.vfx(ev.id, ev.a, ev.b, ev.c);
        break;
      case 'sfx':
        audio.play(ev.id, state.fighters[ev.a > 900 ? 1 : 0].char[CK.form] === 2 ? 1 : 0, panFor(ev.a));
        break;
      case 'shake':
        fx.shakeBy(ev.a);
        break;
      case 'banner':
        onBanner(ev.id, ev.t);
        break;
      default:
        fx.consume(ev);
        break;
    }
  }
  for (const f of state.fighters) {
    if (f.hitEvent === 1) {
      const heat = f.char[CK.form] === 2 ? 1 : 0;
      audio.hit(f.comboHits > 2, heat, panFor(f.x));
      fx.burst(f.x + 20 * f.facing, f.y + 60, 10 + f.comboHits * 3, heat, 0.9 + f.comboHits * 0.12);
      fx.shakeBy(3 + f.comboHits);
    }
    if (f.state === 'blockstun' && f.stateFrame === 0) {
      audio.block(panFor(f.x));
    }
  }
}

function onBanner(id: string, detail: string): void {
  switch (id) {
    case 'super':
      fx.flashBy(0.6);
      fx.shakeBy(14);
      break;
    case 'proxyStart':
      fx.banner('proxy', 'PROXY OF THE CREATOR', 'The Creator answers.', 0, 150);
      break;
    case 'proxySuccess':
      fx.banner('proxyOk', 'THE CONTRACT WAS FULFILLED', '', 0, 180);
      break;
    case 'fool':
      fx.banner('fool', 'Fool.', 'The Creator withdraws His proxy.', 0, 150);
      audio.setSilenced(true);
      break;
    case 'smitten':
      audio.setSilenced(false);
      fx.flashBy(1);
      break;
    case 'noSecondLife':
      fx.banner('noSecond', detail || 'He asked for nothing and received it.', '', 0, 150);
      break;
    default:
      break;
  }
}

/* ------------------------------------------------------------------ */
/* Drawing                                                            */
/* ------------------------------------------------------------------ */

function styleFor(f: Fighter): FighterStyle {
  const def = charOf(f.charId);
  const mk2 = f.charId === 'mk2';
  return {
    body: def.palette?.body ?? '#20242e',
    accent: def.palette?.accent ?? '#8fa0c0',
    glow: def.palette?.glow ?? '#ffffff',
    spear: mk2,
  };
}

function drawHitboxes(f: Fighter): void {
  const hb = hurtbox(f);
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(90,200,255,0.85)';
  ctx.strokeRect(hb.x, GROUND_SCREEN_Y - hb.y - hb.h, hb.w, hb.h);
  ctx.strokeStyle = 'rgba(255,90,90,0.9)';
  if (f.move) {
    const def = moveOf(f.move.id);
    for (const b of def.boxes) {
      const x = f.facing === 1 ? f.x + b.x : f.x - b.x - b.w;
      ctx.strokeRect(x, GROUND_SCREEN_Y - b.y - b.h, b.w, b.h);
    }
  }
  ctx.restore();
}

let lastZoom = 1;

function render(): void {
  const cam = scene.updateCamera(state.fighters, fx.shake, W, H);
  lastZoom = cam.zoom;
  const zoom = cam.zoom;
  const originX = W / 2 - cam.x * zoom;
  const originY = GROUND_SCREEN_Y + cam.y * zoom;
  const toScreen = (x: number, y: number): [number, number] => [originX + x * zoom, originY - y * zoom];

  scene.drawBack(ctx, W, H, fx);
  fx.draw(ctx, toScreen, GROUND_SCREEN_Y);

  for (const shot of state.shots) {
    drawShot(ctx, shot, toScreen, zoom, state.fxFrame);
  }

  // Dead fighters are drawn first so the winner reads on top.
  const order = [...state.fighters].sort((a, b) => {
    const ad = a.state === 'dead' || a.state === 'smiteDead' ? 1 : 0;
    const bd = b.state === 'dead' || b.state === 'smiteDead' ? 1 : 0;
    return ad - bd;
  });
  for (const f of order) {
    if (f.state === 'smiteDead') continue;
    drawFighter(ctx, poseOf(f), styleFor(f), toScreen, state.fxFrame);
    if (showHitboxes) drawHitboxes(f);
  }

  scene.drawFront(ctx, W, H, fx);
  drawHud(ctx, state, W, H, fx, { showDebug, showHitboxes });
}

function frame(now: number): void {
  if (!last) last = now;
  let delta = now - last;
  last = now;
  if (delta > 200) delta = STEP_MS; // a long stall must not fast-forward the match
  accumulator += delta;
  let steps = 0;
  while (accumulator >= STEP_MS && steps < 5) {
    simulateOneFrame();
    accumulator -= STEP_MS;
    steps += 1;
  }
  scene.update(state.storm);
  fx.update();
  audio.setStorm(state.storm);
  audio.setSilenced(state.silence > 0);
  render();
  updateDebugPanel();
  requestAnimationFrame(frame);
}

const debugEl = document.getElementById('debug') as HTMLPreElement | null;
function updateDebugPanel(): void {
  if (!debugEl) return;
  if (!showDebug) {
    debugEl.hidden = true;
    return;
  }
  debugEl.hidden = false;
  const [a, b] = state.fighters;
  debugEl.textContent = [
    `frame ${state.frame}  ${state.phase}  storm ${state.storm.toFixed(2)}  zoom ${lastZoom.toFixed(2)}`,
    `P1 ${a.charId}  hp ${a.hp.toFixed(0)}  x ${a.x.toFixed(0)}  ${a.state}  ${a.move?.id ?? '-'}`,
    `    charge ${a.char[CK.charge] ?? 0}  att ${a.char[CK.attunement] ?? 0}  cum ${a.char[CK.cumSpend] ?? 0}  form ${a.char[CK.form] ?? 1}`,
    `P2 ${b.charId}  hp ${b.hp.toFixed(0)}  x ${b.x.toFixed(0)}  ${b.state}  ${b.move?.id ?? '-'}`,
    `    charge ${b.char[CK.charge] ?? 0}  att ${b.char[CK.attunement] ?? 0}  cum ${b.char[CK.cumSpend] ?? 0}  form ${b.char[CK.form] ?? 1}`,
  ].join('\n');
}

requestAnimationFrame(frame);

// Expose a tiny handle so the page can be inspected from the console.
Object.assign(window as unknown as Record<string, unknown>, {
  cyborg: {
    get state() {
      return state;
    },
    ROSTER: ROSTER.map((c) => c.id),
    STAGE,
  },
});
