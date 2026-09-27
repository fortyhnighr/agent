import { describe, expect, it } from 'vitest';
import { faceOff, grantProxy, lethalHit, makeMatch, p, qualifyForSecondLife, runFrames, start } from './helpers';
import { step } from '../src/sim/engine';
import { stacks } from '../src/sim/statuses';
import { CK, F1, F2, SECOND_LIFE } from '../src/characters/mk2/constants';
import { addCharge, attunement } from '../src/characters/mk2/state';
import { onDeath, qualifiesForSecondLife, startSmite, tickSmite } from '../src/characters/mk2/secondLife';
import { SMITE_DEATH, SMITE_NONE, SMITE_WORD } from '../src/characters/mk2/secondLife';
import { canUse } from '../src/characters/mk2/logic';
import { ROUND } from '../src/sim/const';

function bless(s: ReturnType<typeof makeMatch>): void {
  const me = p(s, 0);
  qualifyForSecondLife(s, me);
  lethalHit(s, p(s, 1), me);
  step(s, [0, 0]);
}

describe('SECOND LIFE qualification', () => {
  it('is denied when Attunement is below 3', () => {
    const s = makeMatch();
    const me = p(s, 0);
    me.char[CK.attunement] = 2;
    me.char[CK.cumSpend] = 60;
    me.char[CK.marksApplied] = 5;
    expect(qualifiesForSecondLife(me)).toBe(false);
    lethalHit(s, p(s, 1), me);
    step(s, [0, 0]);
    expect(me.char[CK.form]).toBe(1);
    expect(s.phase).toBe('ko');
  });

  it('is denied when cumulative spend is too low', () => {
    const s = makeMatch();
    const me = p(s, 0);
    me.char[CK.attunement] = 3;
    me.char[CK.cumSpend] = 29;
    me.char[CK.marksApplied] = 5;
    expect(qualifiesForSecondLife(me)).toBe(false);
  });

  it('is denied when not enough Heaven\u2019s Marks were applied', () => {
    const s = makeMatch();
    const me = p(s, 0);
    me.char[CK.attunement] = 3;
    me.char[CK.cumSpend] = 60;
    me.char[CK.marksApplied] = 1;
    expect(qualifiesForSecondLife(me)).toBe(false);
  });

  it('is granted only when all three are satisfied', () => {
    const s = makeMatch();
    const me = p(s, 0);
    qualifyForSecondLife(s, me);
    expect(qualifiesForSecondLife(me)).toBe(true);
    expect(SECOND_LIFE.attunement).toBe(3);
    expect(SECOND_LIFE.cumSpend).toBe(30);
  });
});

describe('DEATH without qualification', () => {
  it('is a normal death: no second form, no storm, no blessing', () => {
    const s = makeMatch();
    const me = p(s, 0);
    lethalHit(s, p(s, 1), me);
    step(s, [0, 0]);
    expect(me.hp).toBe(0);
    expect(me.char[CK.form]).toBe(1);
    expect(me.char[CK.proxyTimer]).toBe(0);
    expect(s.storm).toBe(0);
    expect(s.phase).toBe('ko');
    expect(s.winner).toBe(1);
  });
});

describe('PROXY OF THE CREATOR', () => {
  it('activates on a qualifying death and revives him at 1 HP', () => {
    const s = makeMatch();
    bless(s);
    const me = p(s, 0);
    expect(me.char[CK.form]).toBe(2);
    expect(me.hp).toBe(1);
    expect(me.char[CK.proxyTimer]).toBe(SECOND_LIFE.proxyFrames);
    expect(s.storm).toBe(1);
    expect(s.phase).toBe('fight');
  });

  it('makes him literally immortal: nothing can kill him while it lasts', () => {
    const s = makeMatch();
    bless(s);
    const me = p(s, 0);
    const opp = p(s, 1);
    opp.hp = 100000;
    for (let i = 0; i < 40; i++) {
      lethalHit(s, opp, me);
      step(s, [0, 0]);
    }
    expect(me.hp).toBe(1);
    expect(s.phase).toBe('fight');
    expect(me.char[CK.form]).toBe(2);
  });

  it('immortality ignores invulnerability flags, armour and blocking', () => {
    const s = makeMatch();
    bless(s);
    const me = p(s, 0);
    const opp = p(s, 1);
    opp.hp = 100000;
    me.invuln = 999;
    me.armor = 999;
    me.guarding = true;
    lethalHit(s, opp, me);
    step(s, [0, 0]);
    expect(me.hp).toBe(1);
    expect(s.phase).toBe('fight');
  });

  it('cannot be granted twice', () => {
    const s = makeMatch();
    bless(s);
    const me = p(s, 0);
    me.hp = 0;
    expect(onDeath(s, me, p(s, 1))).toBe(false);
  });

  it('ends the storm abruptly when the opponent dies during the blessing', () => {
    const s = makeMatch();
    bless(s);
    const me = p(s, 0);
    const opp = p(s, 1);
    expect(s.storm).toBe(1);
    lethalHit(s, me, opp);
    step(s, [0, 0]);
    expect(s.phase).toBe('ko');
    expect(s.winner).toBe(0);
    expect(me.char[CK.proxyKills]).toBe(1);
    expect(s.storm).toBe(0);
  });
});

describe('DIVINE SHOCK in Form 2', () => {
  it('is produced by second-form attacks', () => {
    const s = makeMatch();
    faceOff(s, 90);
    const me = p(s, 0);
    const opp = p(s, 1);
    grantProxy(s, me);
    opp.hp = 100000;
    start(s, me, F2.smite);
    runFrames(s, 12);
    expect(stacks(opp, 'divineShock')).toBeGreaterThanOrEqual(1);
  });

  it('is consumed by the heavy declarations, and that consumption pays', () => {
    const s = makeMatch();
    faceOff(s, 90);
    const me = p(s, 0);
    const opp = p(s, 1);
    grantProxy(s, me);
    opp.hp = 100000;
    opp.statuses.divineShock.stacks = 3;
    opp.statuses.divineShock.timer = 600;
    start(s, me, F2.smiteFall);
    runFrames(s, 1);
    expect(stacks(opp, 'divineShock')).toBe(0);
    expect(me.dmgScale).toBeGreaterThan(1);
  });

  it('Form 1 lightning does not produce Divine Shock', () => {
    const s = makeMatch();
    faceOff(s, 90);
    const me = p(s, 0);
    const opp = p(s, 1);
    opp.hp = 100000;
    start(s, me, F1.flashThrust);
    runFrames(s, 12);
    expect(stacks(opp, 'conductive')).toBeGreaterThanOrEqual(1);
    expect(stacks(opp, 'divineShock')).toBe(0);
  });
});

describe('FAILURE: "Fool." and the smite', () => {
  it('starts with the storm stopping dead, not fading', () => {
    const s = makeMatch();
    bless(s);
    const me = p(s, 0);
    me.char[CK.proxyTimer] = 1;
    step(s, [0, 0]);
    expect(me.char[CK.smitePhase]).toBe(SMITE_WORD);
    expect(s.storm).toBe(0);
    expect(s.stormFlash).toBe(0);
    expect(s.silence).toBeGreaterThan(0.9);
    expect(s.text.text).toBe('Fool.');
  });

  it('says exactly one word', () => {
    const s = makeMatch();
    bless(s);
    const me = p(s, 0);
    me.char[CK.proxyTimer] = 1;
    step(s, [0, 0]);
    expect(s.text.text.trim().split(/\s+/).length).toBe(1);
  });

  it('erases him: a forced divine death, not damage', () => {
    const s = makeMatch();
    bless(s);
    const me = p(s, 0);
    const opp = p(s, 1);
    me.char[CK.proxyTimer] = 1;
    step(s, [0, 0]);
    const hpBefore = opp.hp;
    for (let i = 0; i < SECOND_LIFE.smiteAt + SECOND_LIFE.pillarFrames + 6; i++) {
      step(s, [0, 0]);
    }
    expect(me.hp).toBe(0);
    expect(me.state).toBe('smiteDead');
    expect(s.phase).toBe('ko');
    expect(s.resultReason).toBe('smitten');
    expect(s.winner).toBe(1);
    // The opponent is untouched by the judgement.
    expect(opp.hp).toBe(hpBefore);
    expect(opp.state).not.toBe('smiteDead');
  });

  it('runs the pillar beat after the silence', () => {
    const s = makeMatch();
    bless(s);
    const me = p(s, 0);
    me.char[CK.proxyTimer] = 1;
    step(s, [0, 0]);
    let sawPillar = false;
    for (let i = 0; i < 120; i++) {
      step(s, [0, 0]);
      if (s.smitePillar > 0) sawPillar = true;
      if (me.char[CK.smitePhase] === SMITE_DEATH) break;
    }
    expect(sawPillar).toBe(true);
  });

  it('cannot be dodged, blocked, armoured or survived', () => {
    const s = makeMatch();
    bless(s);
    const me = p(s, 0);
    me.char[CK.proxyTimer] = 1;
    step(s, [0, 0]);
    me.invuln = 9999;
    me.armor = 9999;
    me.guarding = true;
    me.hp = 999;
    for (let i = 0; i < 200; i++) step(s, [0, 0]);
    expect(me.hp).toBe(0);
    expect(me.state).toBe('smiteDead');
    expect(s.resultReason).toBe('smitten');
  });

  it('is skipped if the opponent dies in the same window', () => {
    const s = makeMatch();
    bless(s);
    const me = p(s, 0);
    const opp = p(s, 1);
    me.char[CK.proxyTimer] = 1;
    step(s, [0, 0]);
    lethalHit(s, me, opp);
    step(s, [0, 0]);
    expect(me.char[CK.smitePhase]).toBe(SMITE_NONE);
    expect(me.hp).toBe(1);
  });

  it('tickSmite is a pure function of state and frame', () => {
    const s = makeMatch();
    bless(s);
    const me = p(s, 0);
    startSmite(s, me, p(s, 1));
    expect(me.char[CK.smitePhase]).toBe(SMITE_WORD);
    const frames = [1, 2, 3, 4, 5];
    for (const f of frames) {
      me.char[CK.smiteFrame] = f - 1;
      tickSmite(s, me, p(s, 1));
      expect(me.char[CK.smiteFrame]).toBe(f);
    }
  });
});

describe('Form 2 offence during the blessing', () => {
  it('is immediately oppressive: no setup from zero', () => {
    const s = makeMatch();
    faceOff(s, 90);
    const me = p(s, 0);
    const opp = p(s, 1);
    grantProxy(s, me);
    opp.hp = 100000;
    const before = opp.hp;
    start(s, me, F2.smiteFall);
    runFrames(s, 30);
    const afterHeavy = before - opp.hp;
    expect(afterHeavy).toBeGreaterThan(140);
  });

  it('the max-Attunement ultimate is the strongest thing in the game', () => {
    const s = makeMatch();
    faceOff(s, 90);
    const me = p(s, 0);
    const opp = p(s, 1);
    grantProxy(s, me);
    me.char[CK.attunement] = 3;
    opp.hp = 100000;
    stacks(opp, 'heavensMark');
    expect(canUse(me, opp, F2.mightOfCreator)).toBe(false);
    applyMarkFromTest(me, opp);
    expect(canUse(me, opp, F2.mightOfCreator)).toBe(true);
    start(s, me, F2.mightOfCreator);
    runFrames(s, 230);
    const mightDamage = 100000 - opp.hp;
    expect(mightDamage).toBeGreaterThan(300);

    const s2 = makeMatch();
    faceOff(s2, 90);
    const me2 = p(s2, 0);
    const opp2 = p(s2, 1);
    grantProxy(s2, me2);
    opp2.hp = 100000;
    start(s2, me2, F2.creatorRefineMe);
    runFrames(s2, 170);
    const refineDamage = 100000 - opp2.hp;
    expect(mightDamage).toBeGreaterThan(refineDamage);
  });

  it('a 20 Charge Form 1 execution is worth less than the Might', () => {
    const s = makeMatch();
    faceOff(s, 90);
    const me = p(s, 0);
    const opp = p(s, 1);
    opp.hp = 100000;
    addCharge(me, 20);
    start(s, me, F1.splitter3);
    runFrames(s, 180);
    const execution = 100000 - opp.hp;
    expect(execution).toBeGreaterThan(150);

    const s2 = makeMatch();
    faceOff(s2, 90);
    const me2 = p(s2, 0);
    const opp2 = p(s2, 1);
    grantProxy(s2, me2);
    me2.char[CK.attunement] = 3;
    opp2.hp = 100000;
    applyMarkFromTest(me2, opp2);
    start(s2, me2, F2.mightOfCreator);
    runFrames(s2, 230);
    const might = 100000 - opp2.hp;
    expect(might).toBeGreaterThan(execution * 1.6);
  });
});

function applyMarkFromTest(attacker: ReturnType<typeof p>, target: ReturnType<typeof p>): void {
  target.statuses.heavensMark.stacks = 1;
  target.statuses.heavensMark.timer = 900;
  attacker.char[CK.marksApplied] = (attacker.char[CK.marksApplied] ?? 0) + 1;
}

describe('Form state is fully deterministic state', () => {
  it('every proxy field lives in the serialised state', () => {
    const s = makeMatch();
    bless(s);
    const me = p(s, 0);
    for (const key of [
      CK.form,
      CK.proxyTimer,
      CK.smitePhase,
      CK.smiteFrame,
      CK.proxyKills,
      CK.marksApplied,
      CK.perfectPhases,
    ]) {
      expect(me.char).toHaveProperty(key);
    }
    expect(attunement(me)).toBe(3);
    expect(s.frame).toBeGreaterThan(0);
    expect(ROUND.koFreeze).toBeGreaterThan(0);
  });
});
