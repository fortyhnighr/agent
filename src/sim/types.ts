/**
 * All simulation types.
 *
 * Rules for this file's dependents:
 *  - The whole sim state is plain JSON-able data (numbers, strings, booleans,
 *    arrays, plain objects). No class instances, no closures, no DOM handles.
 *    That is what makes clone/snapshot/rollback/state-hashing trivial and exact.
 *  - Move and shot *definitions* live in the registry (shared, immutable,
 *    may contain hook ids) and are referenced by string id from the state.
 */

/* ------------------------------------------------------------------ */
/* Boxes                                                               */
/* ------------------------------------------------------------------ */

export interface Box {
  /** Offset forward from the fighter origin (positive = in front). */
  x: number;
  /** Offset up from the fighter origin. */
  y: number;
  w: number;
  h: number;
}

export interface Aabb {
  x: number;
  y: number;
  w: number;
  h: number;
}

/* ------------------------------------------------------------------ */
/* Resources / requirements (generic; characters interpret the keys)   */
/* ------------------------------------------------------------------ */

export interface ResourceCost {
  /** Spend this many units of the character's primary resource. */
  primary?: number;
  /** Consume N stacks of a status. */
  consume?: Record<string, number>;
}

export interface Requirements {
  /** Minimum stacks of a status on the TARGET. */
  targetStacks?: Record<string, number>;
  /** Minimum stacks of a status on SELF. */
  selfStacks?: Record<string, number>;
  /** Minimum amount of the primary resource. */
  primary?: number;
  /** Minimum progress tier of the character's secondary resource. */
  tier?: number;
  /** Minimum value of an arbitrary char-state counter. */
  charFlags?: Record<string, number>;
  /** Minimum stock of a shot-independent "only in form X" requirement. */
  form?: number;
}

/* ------------------------------------------------------------------ */
/* Hooks                                                               */
/* ------------------------------------------------------------------ */

export interface DamageContext {
  state: MatchState;
  atk: Fighter;
  def: Fighter;
  moveId: string;
  baseDamage: number;
  counter: boolean;
  fromShot: boolean;
  shotKind: string;
  hitX: number;
  hitY: number;
  hitIndex: number;
  /** The projectile that connected, when the hit came from one. */
  shot: import('./types').Shot | null;
}

export interface GuardContext {
  state: MatchState;
  atk: Fighter;
  def: Fighter;
  moveId: string;
  baseCrush: number;
  counter: boolean;
  fromShot: boolean;
  shotKind: string;
}

export interface StatusContext {
  state: MatchState;
  atk: Fighter;
  def: Fighter;
  moveId: string;
  hitIndex: number;
}

export type HookFn = (ctx: DamageContext) => void;

export interface MoveContext {
  state: MatchState;
  self: Fighter;
  opp: Fighter;
  moveId: string;
  /** Frames since activation (-1 for whiff/expire where the move already ended). */
  frame: number;
}

export type MoveHookFn = (ctx: MoveContext) => void;

/* ------------------------------------------------------------------ */
/* Moves                                                               */
/* ------------------------------------------------------------------ */

export type MoveButton = 'J' | 'K' | 'L' | 'I' | 'U' | 'O' | 'P' | 'R';

export interface MovePhaseVel {
  /** First frame (inclusive) this velocity applies. */
  from: number;
  /** Last frame (inclusive). */
  to: number;
  vx: number;
  vy: number;
}

export interface MoveDef {
  id: string;
  name: string;
  /** Human readable input requirement, shown in the move list. */
  input: string;
  type: 'normal' | 'command' | 'special' | 'super' | 'movement' | 'finisher';
  startup: number;
  active: number;
  recovery: number;
  damage: number;
  /** Chip damage when blocked, before GUARD.chipScale. */
  chip: number;
  hitstun: number;
  blockstun: number;
  hitstop: number;
  /** Guard crush pressure dealt on block. */
  guardCrush: number;
  /** How many times this move may connect (1 = single hit). */
  maxHits: number;
  boxes: Box[];
  /** Extended hurtbox applied while the move is active (0 = no extra). */
  hurtbox?: Box;
  invuln?: [number, number];
  /** Frames where hits are absorbed (no hitstun) but damage still lands. */
  armor?: [number, number];
  vel?: MovePhaseVel[];
  /** Per-move hitstop bonus when countering. */
  counterHitstop?: number;
  cancelOnHit?: string[];
  cancelOnBlock?: string[];
  /** Chain cancels valid for the whole move (buffered combo routes). */
  chain?: string[];
  /** Ignores displacement invulnerability. */
  breaksInvuln?: boolean;
  /** Punches through armour. */
  breaksArmor?: boolean;
  /** Cannot be blocked (divine judgement). */
  unblockable?: boolean;
  /** Guard level: any (default), low (crouch block), high (stand block), none. */
  guard?: 'any' | 'low' | 'high' | 'none';
  cost?: ResourceCost;
  requires?: Requirements;
  /** Fired once when the move activates. */
  onActivate?: string;
  /** Fired on each successful hit. */
  onHit?: string;
  /** Fired on block. */
  onBlock?: string;
  /** Fired when the move's active window ends with zero hits. */
  onWhiff?: string;
  /** Fired when the move fully ends (hit, block or whiff). */
  onExpire?: string;
  /** Spawns a shot entity at `shotFrame` (default 2). */
  shot?: string;
  shotFrame?: number;
  /** Air only / ground only. */
  airOnly?: boolean;
  groundOnly?: boolean;
  /** Requires holding a direction (charge input) for the enhanced path. */
  chargeMove?: boolean;
  /** Damage/element tags consumed by character status logic. */
  tags?: string[];
  /** Metadata for the renderer (presentation only). */
  fx?: string;
  /** Short blurb for the move list. */
  note?: string;
  /** Forces a hard knockdown when the move connects. */
  knockdown?: boolean;
}

export interface ActiveMove {
  id: string;
  /** Frames since activation. */
  frame: number;
  hits: number;
  /** Hit ids already consumed so multi-hit moves do not re-trigger. */
  hitIds: string[];
  /** Per-move scratch numbers (hold frames, level, reuse count, ...). */
  vars: Record<string, number>;
}

/* ------------------------------------------------------------------ */
/* Projectiles / line shots                                            */
/* ------------------------------------------------------------------ */

export interface ShotDef {
  kind: string;
  speed: number;
  life: number;
  damage: number;
  chip: number;
  hitstun: number;
  blockstun: number;
  hitstop: number;
  guardCrush: number;
  box: Box;
  gravity?: number;
  /** Angle in degrees, relative to facing. */
  angle?: number;
  /** Number of parallel lines created at once. */
  count?: number;
  /** Vertical offset between parallel lines. */
  spread?: number;
  /** Can hit the same target again after `rehit` frames. */
  rehit?: number;
  onHit?: string;
  onExpire?: string;
  fx?: string;
  /** Damage tags, mirrored onto the synthetic move the pipeline uses. */
  tags?: string[];
}

export interface Shot {
  kind: string;
  id: number;
  owner: 0 | 1;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  frame: number;
  /** 0/1 cooldown before the shot can hit the same target again. */
  rehit: number;
  hit: number;
  vars: Record<string, number>;
}

/* ------------------------------------------------------------------ */
/* Statuses                                                            */
/* ------------------------------------------------------------------ */

export interface StatusDef {
  key: string;
  name: string;
  maxStacks: number;
  /** Default lifetime in frames when applied. */
  duration: number;
  color: string;
  glyph: string;
  desc: string;
}

export interface StatusEntry {
  stacks: number;
  timer: number;
}

export type StatusTable = Record<string, StatusEntry>;

/* ------------------------------------------------------------------ */
/* Fighters                                                            */
/* ------------------------------------------------------------------ */

export type FighterStateName =
  | 'idle'
  | 'walkF'
  | 'walkB'
  | 'crouch'
  | 'air'
  | 'landing'
  | 'dash'
  | 'airDash'
  | 'attack'
  | 'hitstun'
  | 'blockstun'
  | 'guardBreak'
  | 'knockdown'
  | 'wakeup'
  | 'phase'
  | 'dead'
  | 'smiteDead';

export interface Fighter {
  player: 0 | 1;
  charId: string;

  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  onGround: boolean;

  hp: number;
  maxHp: number;
  /** Mk.1 style super meter. Mk.2 does not use this. */
  meter: number;

  state: FighterStateName;
  /** Frames spent in the current state. */
  stateFrame: number;
  hitstun: number;
  blockstun: number;
  hitstop: number;
  /** Full invulnerability frames remaining (displacement dodges). */
  invuln: number;
  /** Frames where the fighter absorbs hits (armor). */
  armor: number;

  crouching: boolean;
  guarding: boolean;
  /** Decoded pad state for this frame (shared locomotion reads these). */
  padDown: number;
  padFwd: number;
  padBack: number;
  padGuard: number;
  padJump: number;
  padDashF: number;
  padDashB: number;
  guardCrush: number;
  guardLow: boolean;

  move: ActiveMove | null;
  /** Per-move damage scale, set by onActivate hooks and cleared when the move ends. */
  dmgScale: number;
  /** Move the fighter is currently able to cancel into (validity window). */
  cancelInto: string[];
  cancelTimer: number;

  dashCd: number;
  dashDir: -1 | 0 | 1;
  dashFrame: number;
  dashKind: 'ground' | 'air' | 'back';
  airDashes: number;

  comboHits: number;
  comboDamage: number;
  juggle: number;
  /** Rising window after getting up where juggles do not loop. */
  wakeupInvuln: number;

  /** Frames of "hit me, I'm in startup" used for counter detection. */
  attackActive: number;

  statuses: StatusTable;
  /** Character specific numbers only (keeps hashing uniform). */
  char: Record<string, number>;
  /** AI scratch numbers, identical key set for every character. */
  ai: Record<string, number>;

  /** Ring of the last 12 input bitmasks (oldest first). */
  inputHist: number[];
  /** The frame the newest entry of inputHist was recorded on. */
  inputFrame: number;
  /** Frame index of the last pressed action button per button, -1 = never. */
  lastPress: Record<string, number>;
  /** Frame index of the last RELEASED action button, -1 = never. */
  lastRelease: Record<string, number>;
  /** True on the frame the button went down. */
  pressed: Record<string, number>;
  /** Consecutive frames each button has been held. */
  holdCount: Record<string, number>;

  /** Presentation counters kept in sim state so they are rollback safe. */
  flashFrames: number;
  vfxSeed: number;
  /** Last damage taken, for the HUD. */
  lastHitTaken: number;
  /** Set for one frame when a hit connects (renderer/audio). */
  hitEvent: number;
}

/* ------------------------------------------------------------------ */
/* Match state                                                         */
/* ------------------------------------------------------------------ */

export type Phase = 'intro' | 'fight' | 'ko' | 'over';

export type EventKind = 'sfx' | 'vfx' | 'shake' | 'text' | 'banner' | 'freeze';

export interface SimEvent {
  k: EventKind;
  id: string;
  a: number;
  b: number;
  c: number;
  t: string;
}

export interface TextCue {
  frame: number;
  life: number;
  text: string;
  sub: string;
}

export interface MatchState {
  frame: number;
  phase: Phase;
  /** Countdown timer in frames. */
  timer: number;
  koTimer: number;
  winner: -1 | 0 | 1 | 2;
  /** -1 none, 0 = P1, 1 = P2, 2 = draw. */
  resultReason: string;
  seed: number;
  rng: { s: number };
  /** Storm intensity 0..1 (arena weather). */
  storm: number;
  stormFlash: number;
  stormFlashDecay: number;
  /** Ambient silence for the "Fool." beat (renderer/audio reads this). */
  silence: number;
  shake: number;
  /** Full-screen white-gold pillar frames (The Creator's smite). */
  smitePillar: number;
  text: TextCue;
  fighters: [Fighter, Fighter];
  /** 1 when that slot is driven by the character AI instead of a human pad. */
  aiControlled: [number, number];
  shots: Shot[];
  nextShotId: number;
  /** Fighters that reached 0 HP this frame (processed after the sweep). */
  koQueue: number[];
  events: SimEvent[];
  /** Total frames elapsed, used for deterministic presentation. */
  fxFrame: number;
  /** Round number for the HUD. */
  round: number;
}

/* ------------------------------------------------------------------ */
/* Registry                                                            */
/* ------------------------------------------------------------------ */

export interface CharacterDef {
  id: string;
  name: string;
  maxHp: number;
  walkF: number;
  walkB: number;
  jumpVy: number;
  jumpVx: number;
  airControl: number;
  /** Wall/ceiling aware. */
  moves: MoveDef[];
  shots: ShotDef[];
  makeCharState: () => Record<string, number>;
  /** Per-frame character logic (statuses, forms, immortality floor...). */
  onFrame: (state: MatchState, self: Fighter, opp: Fighter) => void;
  /** Input handling; set state/move directly. */
  onInput: (state: MatchState, self: Fighter, opp: Fighter) => void;
  /** Runs after hit resolution (immortality floors, forced states). */
  afterCombat?: (state: MatchState, self: Fighter, opp: Fighter) => void;
  /** Outgoing damage multiplier. */
  outgoingMods: (ctx: DamageContext) => number;
  /** Incoming damage multiplier (applied to the defender). */
  incomingMods: (ctx: DamageContext) => number;
  /** Guard crush pressure multiplier for attacks. */
  guardMods: (ctx: GuardContext) => number;
  /** Invoked on the defender once damage is final (meter, stagger tracking). */
  onDamaged?: (
    state: MatchState,
    self: Fighter,
    opp: Fighter,
    amount: number,
    blocked: boolean,
  ) => void;
  /** Invoked when this fighter's HP reaches zero. Return true to survive. */
  onDeath: (state: MatchState, self: Fighter, opp: Fighter) => boolean;
  /** Invoked on the winner when the opponent reaches zero. */
  onOpponentDeath?: (state: MatchState, self: Fighter, loser: Fighter) => void;
  ai: (state: MatchState, self: Fighter, opp: Fighter) => number;
  /** Move list for the UI. */
  moveList: { input: string; name: string; note: string }[];
  /** Palette used by the renderer. */
  palette: { body: string; accent: string; glow: string };
}
