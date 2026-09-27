/**
 * CYBORG MK. 2 - tuning table.
 *
 * Form 1 is the machine the stickman Creator engineered: black and gold, built
 * around Divine Charge and Attunement. Form 2 is what the WRONG Creator did to
 * it when Mk. 2 begged for refinement.
 *
 * Every number here is simulation data. Nothing below is random.
 */

export const MK2 = {
  maxHp: 1000,
  walkF: 2.95,
  walkB: 2.35,
  jumpVy: 12.4,
  jumpVx: 5.6,
  airControl: 0.9,
} as const;

/* ---------------- Divine Charge ---------------- */

export const CHARGE = {
  max: 20,
  /** Charge lost when Mk. 2 is hit. */
  lossOnHit: 2,
  /** Clean hit on Flash Thrust. */
  onCleanHit: 1,
  /** Extra on a counter hit. */
  onCounterHit: 1,
  /** Perfect Phase. */
  onPerfectPhase: 3,
  /** Striking a marked target. */
  onHitMarked: 2,
  /** Correctly consuming Conductive / Divine Shock. */
  onStatusConsume: 1,
  /** Per distinct status layer consumed in a single move. */
  consumeBonusCap: 1,
} as const;

export const ATTUNE = {
  max: 3,
  /** Cumulative Divine Charge spent per Attunement level. */
  perLevel: 10,
} as const;

/* ---------------- Statuses ---------------- */

export const STATUS = {
  conductiveMax: 6,
  /** +4% lightning damage per Conductive stack. */
  conductiveDamage: 0.04,
  piercedMax: 3,
  /** +5% spear damage per Pierced stack. */
  piercedDamage: 0.05,
  /** Extra guard crush from Pierced on thrusting moves. */
  piercedGuard: 0.08,
  markMax: 3,
  staticLockFrames: 54,
  divineScarFrames: 420,
  divineScarDamageTaken: 0.12,
  divineScarGuardTaken: 0.25,
  divineScarSpeed: 0.88,
  divineShockMax: 6,
  /** +8% Form 2 gold lightning damage per Divine Shock stack. */
  divineShockDamage: 0.08,
  /** +12% guard pressure per Divine Shock stack on Form 2 attacks. */
  divineShockGuard: 0.12,
} as const;

/** Combat Diagnosis (Form 1 passive). */
export const DIAGNOSIS = {
  perLayer: 0.06,
  maxLayers: 4,
} as const;

/* ---------------- Perfect Phase ---------------- */

export const PHASE = {
  /** Frames after Flash Phase starts during which an incoming hit can be phased. */
  window: 8,
  /** Invulnerability granted by a successful phase. */
  invuln: 22,
  /** Cancel window granted after a phase. */
  cancelWindow: 16,
  /** How far behind the opponent Mk. 2 ends up. */
  behindOffset: 64,
} as const;

/* ---------------- Second life ---------------- */

export const SECOND_LIFE = {
  /** All three must be satisfied at the moment of death. */
  attunement: 3,
  cumSpend: 30,
  marksApplied: 2,
  /** PROXY OF THE CREATOR duration. */
  proxyFrames: 300,
  /** The "Fool." beat: silence, then judgement. */
  foolFreeze: 60,
  smiteAt: 66,
  pillarFrames: 34,
  /** Charge the machine keeps on revival. */
  startCharge: 4,
  startShock: 0,
} as const;

/* ---------------- Move ids ---------------- */

export const F1 = {
  flashThrust: 'mk2:flash-thrust',
  streakLunge: 'mk2:streak-lunge',
  railspear: 'mk2:railspear',
  railspearL1: 'mk2:railspear-l1',
  railspearL2: 'mk2:railspear-l2',
  flashPhase: 'mk2:flash-phase',
  heavenfallRise: 'mk2:heavenfall-rise',
  heavenfallRiseEnhanced: 'mk2:heavenfall-rise-enhanced',
  heavenfallFall: 'mk2:heavenfall-fall',
  thunderline: 'mk2:thunderline',
  thunderlineEnhanced: 'mk2:thunderline-enhanced',
  heavensArray: 'mk2:heavens-array',
  judgementBolt: 'mk2:judgement-bolt',
  splitter1: 'mk2:heaven-splitter-1',
  splitter2: 'mk2:heaven-splitter-2',
  splitter3: 'mk2:heaven-splitter-3',
  splitterEx: 'mk2:heaven-splitter-ex',
  execStrike: 'mk2:exec-strike',
  execStrikeHeavy: 'mk2:exec-strike-heavy',
  execFinal: 'mk2:exec-final',
} as const;

export const F2 = {
  smite: 'mk2f2:smite',
  smiteMedium: 'mk2f2:smite-medium',
  smiteFall: 'mk2f2:smite-fall',
  smiteFallCharged: 'mk2f2:smite-fall-charged',
  ahCreator: 'mk2f2:ah-creator',
  decapitate: 'mk2f2:decapitate',
  andShowYou: 'mk2f2:and-show-you',
  unrelentingMight: 'mk2f2:my-unrelenting-might',
  judgementCreator: 'mk2f2:judgement-creator',
  creatorRefineMe: 'mk2f2:creator-refine-me',
  mightOfCreator: 'mk2f2:unrelenting-might-of-the-creator',
  // shared strike entities
  discharge: 'mk2f2:discharge',
  divineArc: 'mk2f2:divine-arc',
  phaseTrail: 'mk2f2:phase-trail',
  confine: 'mk2f2:confine-spear',
  arraySpear: 'mk2f2:array-spear',
  pillar: 'mk2f2:judgement-pillar',
  refineBolt: 'mk2f2:refine-bolt',
  seqStrike: 'mk2f2:seq-strike',
  seqFinal: 'mk2f2:seq-final',
} as const;

/* ---------------- Shots (Form 1) ---------------- */

export const S1 = {
  thunderline: 'mk2:thunderline-line',
  arraySpear: 'mk2:array-spear',
  judgement: 'mk2:judgement-bolt-shot',
} as const;

/* ---------------- Char state keys ---------------- */

export const CK = {
  charge: 'charge',
  attunement: 'attunement',
  cumSpend: 'cumSpend',
  form: 'form',
  proxyTimer: 'proxyTimer',
  proxyKills: 'proxyKills',
  smitePhase: 'smitePhase',
  smiteFrame: 'smiteFrame',
  marksApplied: 'marksApplied',
  perfectPhases: 'perfectPhases',
  phaseArmed: 'phaseArmed',
  phaseUsed: 'phaseUsed',
  arrayHits: 'arrayHits',
  arrayLive: 'arrayLive',
  boltTimer: 'boltTimer',
  boltLeft: 'boltLeft',
  boltIndex: 'boltIndex',
  boltTotal: 'boltTotal',
  confineHits: 'confineHits',
  confineLive: 'confineLive',
  seq: 'seq',
  seqFrame: 'seqFrame',
  seqFlags: 'seqFlags',
  seqCursor: 'seqCursor',
  lastThunderlineReuse: 'lastThunderlineReuse',
  proxyDamage: 'proxyDamage',
  proxyStunned: 'proxyStunned',
  finisherUsed: 'finisherUsed',
  shockSpent: 'shockSpent',
  chargeSpentThisRound: 'chargeSpentThisRound',
  thunderUsed: 'thunderUsed',
  perfectArmedAt: 'perfectArmedAt',
} as const;

/** R cost/requirements for the three Form 1 execution tiers. */
export const SPLITTER = {
  min: 10,
  t1: { min: 10, max: 14, strikes: 4, final: 150, charge: 10 },
  t2: { min: 15, max: 19, strikes: 6, final: 190, charge: 15 },
  t3: { min: 20, max: 20, strikes: 9, final: 230, charge: 20 },
  ex: { min: 20, max: 20, strikes: 11, final: 300, charge: 20, attunement: 3, mark: 1 },
} as const;

export const ARRAY = {
  cost: 6,
  lines: 5,
  lockAt: 3,
  damage: 42,
} as const;

export const JUDGEMENT = {
  cost: 5,
  markCost: 1,
  damage: [210, 175, 150] as const,
  interval: 26,
} as const;
