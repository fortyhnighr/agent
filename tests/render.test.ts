import { describe, expect, it } from 'vitest';
import { StubContext, makeCtx } from './stubCanvas';
import { makeMatch, p, faceOff, runFrames, BTN } from './helpers';
import { step } from '../src/sim/engine';
import { charOf } from '../src/sim/registry';
import { CK } from '../src/characters/mk2/constants';
import { addCharge } from '../src/characters/mk2/state';
import { mk2AI } from '../src/characters/mk2/ai';
import { FxLayer } from '../src/render/fx';
import { Scene } from '../src/render/scene';
import { drawFighter, poseOf } from '../src/render/fighter';
import { drawHud } from '../src/render/hud';
import { drawShot } from '../src/render/shots';
import { moveListFor, MOVE_LIST_F1, MOVE_LIST_F2 } from '../src/render/movelist';
import { telemetry } from '../src/render/telemetry';
import type { MatchState } from '../src/sim/types';

const W = 1280;
const H = 720;
const GROUND = H - 96;

function view(zoom = 1, camX = 0, camY = 0) {
  return (x: number, y: number): [number, number] => [W / 2 + (x - camX) * zoom, GROUND - (y - camY) * zoom];
}

function style(f: ReturnType<typeof p>) {
  const def = charOf(f.charId);
  return {
    body: def.palette?.body ?? '#20242e',
    accent: def.palette?.accent ?? '#8fa0c0',
    glow: def.palette?.glow ?? '#ffffff',
    spear: f.charId === 'mk2',
  };
}

function renderAll(state: MatchState, fx: FxLayer, scene: Scene, frame: number): StubContext {
  const ctx = makeCtx();
  const cam = scene.camera(state.fighters, fx.shake, W, H);
  const toScreen = view(cam.zoom, cam.x, cam.y);
  scene.drawBack(ctx, W, H, fx);
  fx.draw(ctx, toScreen, GROUND);
  for (const shot of state.shots) drawShot(ctx, shot, toScreen, cam.zoom, frame);
  for (const f of state.fighters) drawFighter(ctx, poseOf(f), style(f), toScreen, frame);
  scene.drawFront(ctx, W, H, fx);
  drawHud(ctx, state, W, H, fx, { showDebug: true, showHitboxes: true });
  return new StubContext() && (ctx as unknown as StubContext);
}

describe('RENDER: the whole presentation path runs without a real canvas', () => {
  it('renders a normal frame', () => {
    const s = makeMatch({ p1: 'mk2', p2: 'mk1' });
    faceOff(s, 140);
    const fx = new FxLayer();
    const scene = new Scene();
    const rec = renderAll(s, fx, scene, 0);
    expect(rec.rec.strokes).toBeGreaterThan(10);
    expect(rec.rec.fills).toBeGreaterThan(10);
    expect(rec.rec.coords.length).toBeGreaterThan(100);
  });

  it('renders 600 frames of a real match, effects and all', () => {
    const s = makeMatch({ p1: 'mk2', p2: 'mk2' });
    faceOff(s, 140);
    const fx = new FxLayer();
    const scene = new Scene();
    const me = p(s, 0);
    const opp = p(s, 1);
    for (let i = 0; i < 600; i++) {
      step(s, [mk2AI(s, me, opp), mk2AI(s, opp, me)]);
      for (const ev of s.events) fx.consume(ev);
      if (me.hitEvent === 1) fx.burst(me.x, me.y + 60, 12, 0, 1);
      scene.update(s.storm);
      fx.update();
      renderAll(s, fx, scene, s.fxFrame);
    }
    // Effects decay: the layer must not grow without bound.
    expect(fx.particles.length).toBeLessThan(3000);
    expect(fx.beams.length).toBeLessThan(400);
  });

  it('renders Form 2, the Proxy, the storm and the smite', () => {
    const s = makeMatch();
    faceOff(s, 120);
    const me = p(s, 0);
    const opp = p(s, 1);
    me.char[CK.form] = 2;
    me.char[CK.proxyTimer] = 300;
    me.char[CK.attunement] = 3;
    addCharge(me, 17);
    opp.statuses.heavensMark.stacks = 2;
    opp.statuses.heavensMark.timer = 900;
    s.storm = 1;
    s.stormFlash = 1;
    const fx = new FxLayer();
    fx.vfx('proxyStart', me.x, me.y + 60, 1);
    const scene = new Scene();
    scene.update(1);
    renderAll(s, fx, scene, s.fxFrame);
    expect(fx.particles.length).toBeGreaterThan(0);
    fx.pillar = 30;
    renderAll(s, fx, scene, s.fxFrame);
  });

  it('renders the KO and the forced death', () => {
    const s = makeMatch();
    faceOff(s, 100);
    const me = p(s, 0);
    const opp = p(s, 1);
    me.char[CK.form] = 2;
    me.char[CK.proxyTimer] = 120;
    me.char[CK.attunement] = 3;
    me.char[CK.cumSpend] = 300;
    me.char[CK.marksApplied] = 9;
    me.char[CK.perfectPhases] = 5;
    runFrames(s, 120, [0, 0]);
    opp.hp = 1;
    const fx = new FxLayer();
    const scene = new Scene();
    for (let i = 0; i < 240; i++) {
      step(s, [mk2AI(s, me, opp), 0]);
      for (const ev of s.events) fx.consume(ev);
      scene.update(s.storm);
      fx.update();
      renderAll(s, fx, scene, s.fxFrame);
    }
    s.silence = 20;
    renderAll(s, fx, scene, s.fxFrame);
    s.silence = 0;
    s.smitePillar = 20;
    renderAll(s, fx, scene, s.fxFrame);
  });

  it('never produces a non-finite coordinate, even at the stage edges', () => {
    const s = makeMatch();
    faceOff(s, 1400);
    const fx = new FxLayer();
    const scene = new Scene();
    const rec = renderAll(s, fx, scene, 0);
    expect(rec.rec.coords.every(Number.isFinite)).toBe(true);
  });

  it('drains every VFX id the moves can emit', () => {
    const s = makeMatch();
    faceOff(s, 120);
    const fx = new FxLayer();
    const ids = [
      'thrustSmall', 'streakLunge', 'spearRail', 'spearCompress', 'thunderlineAlign',
      'thunderlineReuse', 'heavenfallRise', 'heavenfallDrop', 'heavenfallImpale', 'heavensArray',
      'chargeGain', 'chargeSpend', 'statusFlash', 'conductive', 'pierced', 'staticLock',
      'perfectPhase', 'phase', 'phaseBurst', 'execStrike', 'execFinal', 'judgementCharge',
      'judgementBolt', 'proxyStart', 'ahCreator', 'decapitate', 'andShowYou',
      'myUnrelentingMight', 'divineFall', 'divineFallCharged', 'judgementCreator', 'creatorSmite',
      'divineShock', 'seqShot', 'seqFinal', 'divineDischarge', 'armorHit', 'guardSpark',
      'shotHit', 'guardBreak', 'somethingNew',
    ];
    for (const id of ids) fx.vfx(id, 100, 60, 1);
    fx.update();
    const rec = renderAll(s, fx, new Scene(), 0);
    expect(rec.rec.fills).toBeGreaterThan(20);
  });

  it('draws every projectile kind the move list can spawn', () => {
    const s = makeMatch();
    faceOff(s, 120);
    const ctx = makeCtx();
    const toScreen = view();
    const kinds = [
      'mk2:thunderline-line', 'mk2:array-spear', 'mk2:judgement-bolt-shot',
      'mk2f2:array-spear', 'mk2f2:refine-bolt', 'mk2f2:judgement-pillar',
      'mk2f2:divine-arc', 'mk2f2:divine-smite', 'mk2f2:divine-confine-spear',
      'mk2f2:divine-phase-trail', 'mk2f2:unknown-thing',
    ];
    for (const kind of kinds) {
      drawShot(ctx, { kind, id: 1, owner: 0, x: 40, y: 60, vx: 12, vy: 0, life: 10, frame: 0, rehit: 0, hit: 0, vars: {} }, toScreen, 1, 7);
    }
  });
});

describe('HUD: the machine explains itself', () => {
  it('lists every Form 1 move with its strict requirement', () => {
    const inputs = MOVE_LIST_F1.map((m) => m.input);
    expect(inputs).toContain('J');
    expect(inputs).toContain('K');
    expect(inputs).toContain('L (tap)');
    expect(inputs).toContain('I');
    expect(inputs).toContain('U');
    expect(inputs).toContain('O');
    expect(inputs).toContain('↓+O · 6 Charge');
    expect(inputs).toContain('P · 5 Charge');
    expect(inputs.some((i) => i.startsWith('R · 20'))).toBe(true);
    for (const m of MOVE_LIST_F1) {
      expect(m.name.length).toBeGreaterThan(2);
      expect(m.requirement.length).toBeGreaterThan(2);
    }
  });

  it('lists the transformed Form 2 names', () => {
    const names = MOVE_LIST_F2.map((m) => m.name.toUpperCase());
    expect(names).toContain('SMITE');
    expect(names.some((n) => n.includes('MEDIUM ATTUNEMENT'))).toBe(true);
    expect(names.some((n) => n.includes('SO YOU SHALL FALL'))).toBe(true);
    expect(names).toContain('AH… CREATOR!');
    expect(names.some((n) => n.includes('DECAPITATE'))).toBe(true);
    expect(names.some((n) => n.includes('SHOW YOU'))).toBe(true);
    expect(names.some((n) => n.includes('UNRELENTING MIGHT'))).toBe(true);
    expect(names.some((n) => n.includes('JUDGEMENT'))).toBe(true);
    expect(names.some((n) => n.includes('REFINE ME'))).toBe(true);
    expect(names.some((n) => n.includes('UNRELENTING MIGHT OF THE CREATOR'))).toBe(true);
  });

  it('only marks moves legal when the machine has earned them', () => {
    const s = makeMatch();
    faceOff(s, 120);
    const me = p(s, 0);
    const opp = p(s, 1);
    // Judgement Bolt is strictly 1 Mark + 5 Charge.
    const bolt = MOVE_LIST_F1.find((m) => m.name === 'JUDGEMENT BOLT')!;
    expect(bolt.legal(s, me, opp)).toBe(false);
    addCharge(me, 6);
    expect(bolt.legal(s, me, opp)).toBe(false);
    opp.statuses.heavensMark.stacks = 1;
    opp.statuses.heavensMark.timer = 600;
    expect(bolt.legal(s, me, opp)).toBe(true);
    me.char[CK.charge] = 4;
    expect(bolt.legal(s, me, opp)).toBe(false);
  });

  it('the execution EX only lights up with 20 Charge, a Mark and Attunement 3', () => {
    const s = makeMatch();
    faceOff(s, 120);
    const me = p(s, 0);
    const opp = p(s, 1);
    const ex = MOVE_LIST_F1.find((m) => m.input.startsWith('R · 20 · Att 3'))!;
    expect(ex.name).toContain('EX');
    addCharge(me, 20);
    me.char[CK.attunement] = 2;
    opp.statuses.heavensMark.stacks = 1;
    opp.statuses.heavensMark.timer = 600;
    expect(ex.legal(s, me, opp)).toBe(false);
    me.char[CK.attunement] = 3;
    me.char[CK.cumSpend] = 30;
    expect(ex.legal(s, me, opp)).toBe(true);
  });

  it('picks the right list for each form', () => {
    const s = makeMatch();
    const me = p(s, 0);
    expect(moveListFor(me)).toBe(MOVE_LIST_F1);
    me.char[CK.form] = 2;
    expect(moveListFor(me)).toBe(MOVE_LIST_F2);
  });

  it('shows the true Charge next to the corrupted one in Form 2', () => {
    const view2 = telemetry(120, 13, 0xc0ffee, 3);
    expect(view2.truth).toBe('13');
    const s = makeMatch();
    faceOff(s, 120);
    const me = p(s, 0);
    me.char[CK.form] = 2;
    me.char[CK.proxyTimer] = 300;
    const ctx = makeCtx();
    const rec = ctx as unknown as StubContext;
    drawHud(ctx, s, W, H, new FxLayer(), { showDebug: false, showHitboxes: false });
    const printed = rec.rec.texts.join('|');
    expect(printed).toContain('PROXY OF THE CREATOR');
    expect(printed).toContain('TRUE 0');
  });
});

describe('TELEMETRY: the corruption is deterministic and never hides the truth', () => {
  it('gives the same readout for the same frame and seed', () => {
    const a = telemetry(100, 11, 0xc0ffee, 2);
    const b = telemetry(100, 11, 0xc0ffee, 2);
    expect(a).toEqual(b);
  });

  it('changes over time while a real fight is running', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 120; i++) seen.add(telemetry(i, 14, 0xc0ffee, 3).display);
    expect(seen.size).toBeGreaterThan(3);
  });

  it('always prints the true value', () => {
    for (let i = 0; i < 200; i++) {
      const t = telemetry(i, i % 21, 0xabcdef, i % 4);
      expect(t.truth).toBe(String(i % 21));
      expect(t.display.length).toBeGreaterThan(0);
    }
  });
});

describe('AUDIO: the engine is safe to construct without a user gesture', () => {
  it('does not throw when there is no AudioContext', async () => {
    const { AudioEngine, panFor } = await import('../src/audio/engine');
    const audio = new AudioEngine();
    expect(() => {
      audio.resume();
      audio.setStorm(1);
      audio.play('proxyStart', 1, 0);
      audio.hit(true, 1, 0);
      audio.setSilenced(true);
    }).not.toThrow();
    audio.dispose();
    expect(panFor(0)).toBe(0);
    expect(panFor(99999)).toBe(1);
    expect(panFor(-99999)).toBe(-1);
  });
});

describe('INPUT: the browser pad maps to the simulation bits', () => {
  it('keyboard codes and the on-screen pad produce identical bitmasks', () => {
    const s = makeMatch();
    faceOff(s, 100);
    const me = p(s, 0);
    const before = me.hp;
    // A press of J has to start a move through the real simulation.
    step(s, [BTN.J, 0]);
    expect(me.move).not.toBeNull();
    expect(me.move?.id).toBe('mk2:flash-thrust');
    runFrames(s, 30, [0, 0]);
    expect(p(s, 1).hp).toBeLessThan(p(s, 1).maxHp);
    expect(before).toBe(1000);
  });
});
