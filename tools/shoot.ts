/**
 * Development screenshot tool.
 *
 * Runs the real simulation and the real renderer against the software
 * rasteriser and writes PNGs, so the presentation layer can be looked at
 * without a browser. Not part of the game build.
 *
 *   npx vite-node tools/shoot.ts [outDir]
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createMatch, type MatchState } from '../src/sim/state';
import { step } from '../src/sim/engine';
import { charOf } from '../src/sim/registry';
import { CK } from '../src/characters/mk2/constants';
import { addCharge } from '../src/characters/mk2/state';
import { mk2AI } from '../src/characters/mk2/ai';
import { FxLayer } from '../src/render/fx';
import { Scene } from '../src/render/scene';
import { drawFighter, poseOf, type FighterStyle } from '../src/render/fighter';
import { drawHud } from '../src/render/hud';
import { drawShot } from '../src/render/shots';
import { RasterContext, Surface } from './rasterize';

const W = 1280;
const H = 720;
const GROUND = H - 96;

const outDir = process.argv[2] ?? join(process.cwd(), 'shots');
mkdirSync(outDir, { recursive: true });

function styleFor(f: ReturnType<typeof createMatch>['fighters'][0]): FighterStyle {
  const def = charOf(f.charId);
  return {
    body: def.palette?.body ?? '#20242e',
    accent: def.palette?.accent ?? '#8fa0c0',
    glow: def.palette?.glow ?? '#ffffff',
    spear: f.charId === 'mk2',
  };
}

function render(state: MatchState, fx: FxLayer, scene: Scene, name: string): void {
  const surf = new Surface(W, H);
  const ctx = new RasterContext(surf);
  const cam = scene.updateCamera(state.fighters, fx.shake, W, H);
  const toScreen = (x: number, y: number): [number, number] => [
    W / 2 + (x - cam.x) * cam.zoom,
    GROUND - (y - cam.y) * cam.zoom,
  ];
  scene.drawBack(ctx as unknown as CanvasRenderingContext2D, W, H, fx);
  fx.draw(ctx as unknown as CanvasRenderingContext2D, toScreen, GROUND);
  for (const shot of state.shots) drawShot(ctx as unknown as CanvasRenderingContext2D, shot, toScreen, cam.zoom, state.fxFrame);
  for (const f of state.fighters) {
    if (f.state === 'smiteDead') continue;
    drawFighter(ctx as unknown as CanvasRenderingContext2D, poseOf(f), styleFor(f), toScreen, state.fxFrame);
  }
  scene.drawFront(ctx as unknown as CanvasRenderingContext2D, W, H, fx);
  drawHud(ctx as unknown as CanvasRenderingContext2D, state, W, H, fx, { showDebug: false, showHitboxes: false });
  writeFileSync(join(outDir, `${name}.png`), surf.png());
  console.log(`${name}.png  (${ctx.texts.length} text runs, ${fx.particles.length} particles)`);
}

function fresh(gap = 150): { state: MatchState; fx: FxLayer; scene: Scene } {
  const state = createMatch({ p1: 'mk2', p2: 'mk1', seed: 0xc0ffee });
  state.phase = 'fight';
  const [a, b] = state.fighters;
  a.x = -gap / 2;
  b.x = gap / 2;
  a.facing = 1;
  b.facing = -1;
  const fx = new FxLayer();
  const scene = new Scene();
  return { state, fx, scene };
}

function tick(state: MatchState, fx: FxLayer, scene: Scene, n: number, brain?: (s: MatchState) => number): void {
  for (let i = 0; i < n; i++) {
    if (brain) step(state, [brain(state), 0]);
    else step(state, [0, 0]);
    for (const ev of state.events) fx.consume(ev);
    const me = state.fighters[0];
    if (me.hitEvent === 1) {
      fx.burst(me.x + 24 * me.facing, me.y + 60, 14, me.char[CK.form] === 2 ? 1 : 0, 1.1);
      fx.shakeBy(5);
    }
    scene.update(state.storm);
    scene.updateCamera(state.fighters, fx.shake, W, H);
    fx.update();
  }
}

// 1. Neutral: both machines at rest, HUD showing the empty Charge meter.
{
  const { state, fx, scene } = fresh(200);
  render(state, fx, scene, '01-neutral');
}

// 2. Mid-fight: the AI playing, statuses up, effects live.
{
  const { state, fx, scene } = fresh(150);
  const me = state.fighters[0];
  const opp = state.fighters[1];
  for (let i = 0; i < 900; i++) {
    if (i === 430) render(state, fx, scene, '02a-fight-early');
    if (i === 620) render(state, fx, scene, '02b-fight-mid');
    tick(state, fx, scene, 1, (s) => mk2AI(s, me, opp));
  }
  render(state, fx, scene, '02c-fight-late');
}

// 3. Full Charge, Attunement 3, a Mark on the target: the cash-out screen.
{
  const { state, fx, scene } = fresh(110);
  const me = state.fighters[0];
  const opp = state.fighters[1];
  opp.hp = 100000;
  addCharge(me, 20);
  me.char[CK.cumSpend] = 40;
  me.char[CK.attunement] = 3;
  opp.statuses.heavensMark.stacks = 2;
  opp.statuses.heavensMark.timer = 900;
  opp.statuses.conductive.stacks = 3;
  opp.statuses.conductive.timer = 900;
  opp.statuses.pierced.stacks = 2;
  opp.statuses.pierced.timer = 900;
  tick(state, fx, scene, 8, () => 1 << 11);
  render(state, fx, scene, '03-execution');
}

// 4. Form 2: the storm, the Proxy, the corrupt Charge readout.
{
  const { state, fx, scene } = fresh(120);
  const me = state.fighters[0];
  me.char[CK.form] = 2;
  me.char[CK.proxyTimer] = 300;
  me.char[CK.attunement] = 3;
  me.char[CK.cumSpend] = 40;
  addCharge(me, 14);
  state.storm = 1;
  fx.vfx('proxyStart', me.x, me.y + 60, 1);
  tick(state, fx, scene, 40);
  render(state, fx, scene, '04-form2');
}

// 5. The smite: the pillar and the silence.
{
  const { state, fx, scene } = fresh(120);
  const me = state.fighters[0];
  me.char[CK.form] = 2;
  me.char[CK.proxyTimer] = 2;
  me.char[CK.attunement] = 3;
  state.storm = 1;
  scene.update(1);
  tick(state, fx, scene, 30);
  fx.vfx('creatorSmite', me.x, 0, 1);
  fx.update();
  render(state, fx, scene, '05a-smite-impact');
  for (let i = 0; i < 10; i++) fx.update();
  render(state, fx, scene, '05b-smite-pillar');
  for (let i = 0; i < 30; i++) fx.update();
  render(state, fx, scene, '05c-smite-after');
}
console.log(`\nWrote shots to ${outDir}`);
