# CYBORG MK. 2 — HEAVEN SPLITTER

A deterministic 60Hz fighting game. Mk. 2 is the stickman Creator's engineered
assassination machine: black, gunmetal and dark titanium with bright metallic
divine-gold seams, built around **Divine Charge** and **Attunement**, armed with
the **Heaven Splitter** — a black-shafted spear whose head is a literal
branching lightning bolt suspended in a small storm cloud.

The simulation is completely separate from presentation. The fight is plain
JSON-able data advanced at a fixed 60Hz; the canvas reads it and never writes
to it. That is what makes rollback, state hashing and replay-exact AI possible.

```bash
npm install
npm run dev        # playable at http://localhost:5173
npm test           # 182 tests
npm run typecheck
npm run build
```

---

## The machine

**Divine Charge (0–20)** is earned *only* from clean play: normal hits, counter
hits, a Perfect Phase, striking a marked target, and consuming a status layer.
Whiffing, blocking, chip damage, idling and simply pressing a special earn
nothing. Being hit costs 2. Every 10 Charge *spent* raises **Attunement**
(0–3), which changes mechanics and lights the chassis further each level.

**Statuses** interlock. They are the actual combo system:

| Status | Cap | What it does |
| --- | --- | --- |
| Conductive | 6 | +4% raw lightning per stack; refreshed and consumed by Thunderline and Heavenfall |
| Pierced | 3 | +5% spear damage, extra guard crush on thrusts; gates Railspear L2 and execution scaling |
| Heaven's Mark | 3 | unlocks the execution skills (Judgement Bolt, Divine Execution EX) |
| Static Lock | — | 45–60 frames of lost control; the payoff for a full Conductive stack |
| Divine Scar | — | post-cashout debuff on the victim |
| Divine Shock | 6 | Form 2 only: +8% damage per stack, drained by the heavy smites |

**Combat Diagnosis** is the Form 1 passive: +6% damage per *distinct* Mk. 2
status layer on the target, capped at +24%. Layering different statuses beats
stacking one.

### Form 1 moves

| Input | Move | Requirement |
| --- | --- | --- |
| J | Flash Thrust | — (the Charge engine: +1 clean hit) |
| K | Streak Lunge | — |
| L | Railspear | tap; 4 Charge. Whiffing a charged level is a committed resource loss |
| L hold | Railspear L1 / L2 | 8 / 12 Charge |
| I | Flash Phase | limited; a Perfect Phase gives gold phase-through, +3 Charge, +1 Mark, a reposition and a cancel window |
| U | Heavenfall | anti-air; scales with Charge and Conductive, 3+ Conductive becomes Static Lock |
| O | Thunderline | line lightning for setup |
| O | Thunderline (enhanced) | 4 Charge + 2 Conductive **or** a Mark; at Attunement 2+ into a Mark it fires one reversed second pass |
| ↓+O | Heaven's Array | 6 Charge, five spear lines. 3 connected = Static Lock. All 5 = Heaven's Mark |
| P | Judgement Bolt | **strictly** 1 Mark + 5 Charge. No pity activation, ever |
| R | Heaven Splitter: Divine Execution | 10–14 / 15–19 / 20 Charge tiers. 20 with a Mark and Attunement 3 is the EX: eleven repositioning strikes and a massive final thrust |

### The second life

Dying is normal. You only get a second life if you *earned* it: Attunement 3, a
minimum cumulative Charge spend, and a combat requirement. Then the machine
accidentally prays — **"CREATOR! REFINE ME!"** — and the wrong Creator answers.

The stickman engineer who built the machine is not the same being as the
Creator. That is the whole joke and the whole horror.

### Form 2 — PROXY OF THE CREATOR

Same chassis, same silhouette, black armour, but the gold runs to white-gold and
the seams are venting arcs. The arena becomes a real thunderstorm as a side
effect. The machine gets **true immortality** (HP never falls below 1 from any
source — not armour, not regen, not one-hit protection), a **corrupted Divine
Charge readout**, the **Divine Shock** status, and every move replaced:

| Input | Form 1 | Form 2 |
| --- | --- | --- |
| J | Flash Thrust | Smite |
| K | Streak Lunge | Smite: Medium Attunement |
| L | Railspear | Smite: So You Shall Fall |
| I | Flash Phase | Ah… Creator! |
| U | Heavenfall | I Will Decapitate You Myself. |
| O | Thunderline | And Show You… |
| ↓+O | Heaven's Array | My Unrelenting Might! |
| P | Judgement Bolt | Judgement: Creator |
| R | Divine Execution | Creator! Refine Me! |
| R at Attunement 3 | — | THE UNRELENTING MIGHT OF THE CREATOR |

**Fail:** if the enemy is still alive when the blessing expires, the storm
stops dead, the audio goes completely silent, The Creator says exactly one word
— **"Fool."** — and a forced, unblockable, non-damage white-gold pillar erases
Mk. 2 and ends the match. No 999999 damage, no armour, no revive. The death is
a scripted state, not an ordinary hit.

---

## Layout

```
src/
  sim/            the deterministic 60Hz simulation
    const.ts      tuning: world, physics, body, dash, guard, round, buffers
    rng.ts        hash / mix / seeded RNG (no Math.random anywhere)
    types.ts      every piece of state, all JSON-able
    state.ts      factories, input ring, clone, canonical string, state hash
    input.ts      press / hold / chain / motion, unlimited hold counters
    registry.ts   character, move, shot and hook registration
    statuses.ts   the shared status table
    actions.ts    move / cancel / shot / resource mutators
    combat.ts     hit, block, armour, counter, guard crush, shot and KO resolution
    physics.ts    locomotion, move lifecycle, chain cancels, dashes, separation
    engine.ts     frame order, AI, hitstop, KO, presentation decay
    rollback.ts   snapshots, input correction, re-simulation, desync detection
  characters/
    mk1/          the easier, meter-driven baseline
    mk2/          constants, state, statuses, moves, moves2, hooks, logic,
                  sequences, secondLife, ai, registration
  render/         presentation only — never writes to the simulation
    palette.ts    the black/gold scheme and the Form 2 white-gold heat
    fighter.ts    the stickman chassis and the Heaven Splitter
    scene.ts      the arena and the thunderstorm
    fx.ts         sparks, arcs, clouds, scars, beams, banners
    shots.ts      one distinct look per projectile
    hud.ts        health, Charge, Attunement, statuses, strict requirements
    movelist.ts   the HUD's legal-move list, gated by the real requirements
    telemetry.ts  deterministic Form 2 Charge corruption
  audio/engine.ts synthesised audio: no asset files
  main.ts         fixed-step loop, input, and the render/audio pump
tools/
  rasterize.ts    a software Canvas2D + PNG writer, for verification only
  shoot.ts        renders real frames to PNG without a browser
```

## Determinism

* 60Hz fixed step. The renderer runs at display rate and never feeds back.
* No `Math.random`, `Date.now` or `performance.now` anywhere in the gameplay
  modules — there is a test that scans the source and fails if one appears.
* All Mk. 2 state (Charge, Attunement, cumulative spend, every status,
  qualification, the Proxy, Divine Shock, the blessing clock, the form, the
  active sequence and its cursor) lives in char state, so it participates in
  snapshots, rollback and the canonical state hash.
* The corrupted Form 2 Charge readout is derived from the simulation frame and
  a fixed seed. It never touches the value it displays.
* The AI reads only the current frame. It has a reaction delay and cannot see
  future input.

## Tests

```bash
npm test
```

| Suite | Covers |
| --- | --- |
| `smoke` | core engine integration |
| `charge` | generation, loss, spending, cumulative spend, Attunement |
| `statuses` | every status, its caps, timers, consumption and Combat Diagnosis |
| `skills` | every Form 1 move, Perfect Phase, skill transformation, Form 2 replacements |
| `sequence` | execution timeline control-return, the exact Thunderline reuse window |
| `secondLife` | qualification, normal death, the Proxy, immortality, the kill, `Fool.`, the forced smite |
| `ai` | move legality, reaction delay, Charge discipline, Form 2 aggression, determinism |
| `balance` | a good Mk. 2 player clearly beats a good Mk. 1 player, mashing does not, the full execution out-damages anything Mk. 1 can do |
| `determinism` | replay equality, rollback correction, the state hash covers every Mk. 2 field, the forbidden ambient-time scan |
| `render` | the whole presentation path, headless |

## Balance intent

Mk. 1 is deliberately the easier machine: one resource, one decision
(Overdrive when the meter is full), consistent damage. It is never nerfed.

Mk. 2 is harder and stronger with mastery. A player who never reads the Charge
economy performs *below* Mk. 1. A player who layers Conductive, converts it to
Static Lock, buys a Mark with Heaven's Array and cashes out performs clearly
above. A player who does all of that at Attunement 3 with a Mark into the EX
looks unfair on purpose.
