# UEC — the math

Every number here is the real one, read out of the source. Tuning lives in
[`src/config.js`](../src/config.js); the roster lives in
[`src/data/fighters.js`](../src/data/fighters.js). Change those, not the docs,
and then update this file.

Live matches step the simulation at a **fixed 60 Hz**; solo play steps by frame
time, capped at 0.05 s. Durations below are in seconds; the frame column is
`seconds × 60`.

---

## 1. The three stats

| Stat | What it actually does |
|---|---|
| **SPEED** | Multiplies walk speed. Base walk is `250 px/s`, so speed `1.10` = `275 px/s`. Also scales air drift (`0.78 ×` walk). |
| **POWER** | Multiplies every point of damage you deal — basics, specials, projectiles and chip alike. |
| **HP** | Your health pool. Rounds are won by emptying the other bar or leading when the 60 s clock expires. |

### Are they the same for everyone? — **Not any more (v2.3).**

Since v2.3 you choose **who you play as** — your own founder or any roster
character — and each character has a **fighting style** that is the *single*
source of variation:

```js
// src/engine/fighter.js — every fighter, no exceptions
const st = STYLES[def.style] || STYLES.balanced;
this.stats = {
  speed: PLAYER_STATS.speed * st.speed,
  power: PLAYER_STATS.power,        // damage variation lives in style.dmg
  hp:    Math.round(PLAYER_STATS.hp * st.hp),
};
```

The roster's old per-character `stats` block is **no longer read**. It used to
stack on top of the style, which made Carl hit 58 % harder *and* carry 10 % more
HP than a player's own founder — a straight power tier rather than a playstyle.

**Your own founder is `BALANCED`** and sits mid-table: 5th of 10 on damage,
median HP, median speed. Playing as yourself is never a handicap.

| Character | Style | Punch | HP | Speed | Reach | Pays for it with |
|---|---|---|---|---|---|---|
| Elo Ma | GLASS CANNON | 9.10 | 86 | 1.02 | 84 | lowest HP, slowest recovery |
| Carl Icahnt | GRAPPLER | 8.54 | 108 | 0.92 | 72 | shortest reach |
| Adam Weumann | BRAWLER | 8.26 | 110 | 0.88 | 87 | slowest startup + movement |
| Steve Nojobs | SHOWMAN | 7.42 | 99 | 1.00 | 82 | near-baseline all round |
| **Your founder** | **BALANCED** | **7.00** | **100** | **1.00** | **84** | — |
| Cathie Woodz | ZONER | 6.72 | 102 | 0.94 | 102 | low damage, slow startup |
| Jeff Bozo | TECHNICAL | 6.58 | 100 | 0.98 | 89 | lowest damage of the tanks |
| Scam Alt | TRICKSTER | 6.44 | 96 | 1.06 | 86 | low damage |
| Kim Koindashian | RUSHDOWN | 6.16 | 93 | 1.12 | 79 | weak hits, short reach |
| Lizbeth Holmez | PHANTOM | 6.02 | 92 | 1.10 | 91 | lowest damage in the game |

No two characters share a style, so no two play the same. Exact balance still
wants real playtesting — the numbers are compensating by construction, not by
measured win rates.

### Do stats grow as you rank up? — **No. Deliberately.**

There is no stat growth, no unlock, no gear. A `DECACORN` and a first-day
`GARAGE DREAMER` bring **identical tools** to the ring. Progression is
**reputation, not power** — otherwise the ladder would compound: the people
winning most would hit hardest, and new players could never catch up.

What *does* change during a fight is temporary. Unicorn Mode and mystery-crate
buffs are open to everyone; Scam Alt's stances (§2) and Adam Weumann's runway
(§4) belong to one character each. All four reset when the round ends. The AI
difficulty you pick changes how the AI plays, not its numbers.

---

## 2. Damage

Every hit that lands goes through one formula, multiplied out and then rounded
once (`strike()` and `doGrab()` in `src/engine/game.js`):

```
dealt = max(1, round( base × STYLE.dmg × dmgMult × comboScaling × takenMult ))
```

| Term | Value |
|---|---|
| `base` | the move's damage from the tables below |
| `STYLE.dmg` | the attacker's style multiplier, `0.86` (Phantom) … `1.30` (Glass Cannon). **Only for moves that hit with their own hitbox:** the four basics, and command normals of the `strike`, `aoe` and `teleport` archetypes. Specials, projectiles, rain, rush hits, grabs, traps, counter paybacks and Cease & Desist use their raw damage. |
| `dmgMult` | the attacker's multipliers, multiplied together: `POWER` (**always 1.00**), Unicorn Mode `1.35`, 💪 damage crate `1.40`, stance `0.85` (SAFETY) or `1.20` (CAPABILITIES), winded `0.80` |
| `comboScaling` | see §3; depends on how deep the *victim* already is in the chain. **Grabs and counter paybacks skip it.** |
| `takenMult` | the defender's multipliers: stance `0.85` (SAFETY) or `1.15` (CAPABILITIES), winded `1.20` |

Each multiplier is `1.00` while its condition is off.

### Shield, counter, parry, block

Before any damage, a hit is checked in this order, and the first match ends it:

1. **🛡 Legal Shield** (a crate) absorbs the whole hit, grabs included, and is used up.
2. **Counter**: if the defender's `counter` command normal (THE DEMO, LAWYERED) is
   inside its window, the strike is turned back. The attacker takes the counter's
   own damage, `max(1, round(counterDmg × dmgMult × takenMult))` with the
   countering fighter's `dmgMult` and the attacker's `takenMult`, and the countering
   fighter gains 10 energy. Only hitbox strikes can be countered, so grabs,
   Acqui-Hire, projectiles, coins, Cease & Desist and traps go straight past it.
3. **Parry**: the defender is blocking on the ground and started the block no more
   than `PARRY.WINDOW` (**0.12 s**) before the hit. No damage; see §4.
4. **Block**: the defender has been blocking for longer than that and takes
   **chip** instead:

```
chip = max(1, round( base × STYLE.dmg × dmgMult × 0.15 × takenMult ))   // 0 while the blocker is in Unicorn Mode
```

Chip skips combo scaling and **can never KO**: it always leaves at least 1 HP.
Grabs skip steps 2 to 4 (they can't be countered, parried or blocked) and whiff
against an airborne target.

> **Known issue (not yet fixed).** Holding block calls `setState('block')` on
> every frame in `src/engine/fighter.js`, which resets `stateT` to 0 (and nothing
> in that branch advances it). So `def.stateT <= PARRY.WINDOW` in
> `src/engine/game.js` is always true: in practice a held block turns every
> non-grab hit into a PARRY, and chip damage never happens. The rules above are
> the intended ones; the fix is waiting on a design decision.

### Basic attacks

| Move | Key | Startup | Active | Recovery | Dmg | Reach | Knockback | Hitstun |
|---|---|---|---|---|---|---|---|---|
| 🖐 **Slap** | H / X | 0.04 s (2.4 f) | 0.06 s | 0.12 s | **4** | 78 px | 70 | 0.20 s |
| 👊 **Punch** | J / C | 0.05 s (3 f) | 0.06 s | 0.11 s | **7** | 84 px | 110 | 0.24 s |
| 👟 **Kick** | K / V | 0.10 s (6 f) | 0.08 s | 0.17 s | **12** | 106 px | 320 | 0.32 s |
| 🚀 **Launch** | N / Z | 0.06 s (3.6 f) | 0.10 s | 0.28 s | **10** | 74 px | 150 | 0.36 s |

The trade is deliberate: slap is **2.5× faster to start** than kick but does
**a third** the damage. Fast moves open, slow moves close. Launch is the grounded
anti-air: it pops the target upward (`kbUp` −420) so you can juggle, and its long
recovery punishes a whiff.

These are the base `ATTACKS` numbers. A character's style scales startup,
recovery, damage and reach, and a stance scales startup and recovery on top.

### Specials (50 energy)

| Special | Type | Damage | Notes |
|---|---|---|---|
| 📊 Pitch Deck Strike | projectile | `8 × 3` = **24** | 3 slides, 0.14 s apart, 560 px/s |
| 🔥 Burn Rate Blast | AoE | **22** | 150 px reach, slow 0.30 s startup |
| 🔄 Pivot Punch | teleport | **16** | reappears behind you |
| 📈 Growth Hack | rush | `5 × 4` = **20** | locks on and chases |
| 💰 Funding Round | rain | `7 × 3` = **21** | refunds **8 energy** on hit |
| 🦈 Hostile Takeover | grab | **20** | **unblockable** — jump it. Beats parry. |
| ⚖️ Alignment Shift | stance | none | switches stance (below); 0.8 s cooldown, and the 50 is only spent if the switch happens. Scam Alt only. |
| 🔥 Burn It All | burn | `8 + 0.18 × runway`, up to **26** | runway is read at contact, and a clean hit empties it (§4). 130 px reach, 0.18 s startup. Adam Weumann only. |

Specials use their raw damage (no `STYLE.dmg`), and multi-hit totals are before
combo scaling. Alignment Shift and Burn It All are roster-only: player builds and
challenge-link ghosts resolve their special through `playerSpecialId()` in
`src/data/fighters.js`, which never hands out either one.

### Alignment Shift stances

A toggle, not a timer. Pressed by a player, the first switch goes to SAFETY and
every switch after that flips between SAFETY and CAPABILITIES; neutral only comes
back at the next round. Both sets multiply with everything else, Unicorn Mode
included.

| Stance | Startup | Recovery | Speed | Damage dealt | Damage taken |
|---|---|---|---|---|---|
| SAFETY | `×1.15` | `×0.90` | `×0.95` | `×0.85` | `×0.85` |
| CAPABILITIES | `×0.90` | `×1.15` | `×1.05` | `×1.20` | `×1.15` |

Startup and recovery apply to basics and command normals, not to specials.

### Universal moves

| Move | Cost | Effect |
|---|---|---|
| ⚖️ Cease & Desist | 25 energy | **10** damage, 92 px blast radius, arcing throw |
| 💸 Acqui-Hire | free, 3.5 s cooldown | **no damage** — siphons **15 energy** from them to you |
| 💨 Dash | free, 1.6 s cooldown | 1450 px/s for 0.16 s; punch, kick or special can cancel it after 0.06 s |
| 🦄 Unicorn Mode | 100 energy | 6 s of `×1.35` damage, `×1.25` speed, **immune to chip** |

---

## 3. Combos — the magic series

One rule: **when an attack lands, press any other attack and it chains.** There
is no order to memorise and no wrong answer — the rank ladder (slap < punch <
kick with per-move caps) was removed in v2.1 because a wrong guess silently did
nothing.

```js
BASICS:    ['slap', 'punch', 'kick', 'launch']   // any → any
MAX_CHAIN: 5                                     // basics per string, then finish
```

So all of these are legal, among many others:

```
👊👊👟 → ⚡        🖐👟👊 → ⚖️        👟🚀👊🖐👊 → 🦄
```

Whiffs cancel nothing — miss and you eat the full recovery, which is what keeps
mashing punishable.

### Damage scaling

Each hit the victim takes in one chain makes the *next* one weaker:

```js
SCALING = [1, 0.85, 0.7, 0.6, 0.5, 0.45, 0.4]   // indexed by victim's chain depth, capped at 6
```

**Worked example: a 5-basic string into a finisher** (a BALANCED founder, with no
buffs, stance or runway effects on either side; each hit is rounded on its own):

| # | Move | Base | × scaling | Dealt |
|---|---|---|---|---|
| 1 | 🖐 Slap | 4 | × 1.00 | **4** |
| 2 | 🖐 Slap | 4 | × 0.85 | **3** (3.4) |
| 3 | 👊 Punch | 7 | × 0.70 | **5** (4.9) |
| 4 | 👊 Punch | 7 | × 0.60 | **4** (4.2) |
| 5 | 👟 Kick | 12 | × 0.50 | **6** |
| 6 | 🔄 Pivot Punch | 16 | × 0.45 | **7** (7.2) |
| | | | **total** | **29** |

That's **29 % of a 100 HP bar from one opening**; the raw unscaled sum would have
been **50**. Scaling takes about 40 % off a full string, and is the reason one
combo can't take a round.

Chained punches also shove less (`× 0.55` knockback once the victim is already in
a chain) so the string stays in range instead of launching them out of it.

Milestones pop on-screen at **3 → COMBO!**, **5 → SYNERGY!**, **7 → DISRUPTED!**,
**10 → ACQUIRED!** (10+ needs crates or a reset).

---

## 4. Energy

| | |
|---|---|
| Max | **100** |
| Hit dealt | **+12** |
| Hit taken | **+8** |
| Chip dealt | **+3** |
| Parry | **+10** |
| Counter (turning a strike back) | **+10** |
| Funding Round refund | **+8** per unblocked coin |

Taking damage builds meter too, and **meter carries between rounds** (the registry
in `src/engine/fighterState.js` keeps `energy` through the round reset on
purpose), so losing a round still arms your comeback.

**Parry:** start blocking no more than **0.12 s** before a hit lands and you take
**zero** damage and bank 10 energy. If the hit was a strike rather than a
projectile, coin, Cease & Desist or trap, the attacker also staggers for
**0.5 s**. Grabs beat parries; parries beat every other attack. (See the known
issue in §2: today a held block parries too.)

### Runway (Adam Weumann only)

The second resource, and the opposite of meter: it drains, and only landing hits
buys it back. It only moves for a fighter with `usesRunway` (Adam Weumann on the
shipped roster); everyone else's stays full and does nothing.

| | |
|---|---|
| Max | **100**, full again at the start of every round |
| Drain | **4 per second** while the round is live (not during the intro, a pause, hitstop or the KO slow-motion) |
| Refill | **+15** per landed hit, throws included. Chip, parries, shields, counters, steals and Burn It All's own hit don't refill it |
| Winded (at 0) | speed `×0.85`, damage dealt `×0.80`, damage taken `×1.20`; it clears the moment the tank is above 0 |

An untouched tank empties in 25 s of a 60 s round. **Burn It All** spends it:
damage is `8 + 0.18 × runway` read at contact (26 from a full tank, 8 from an
empty one before winded's `×0.80` and the rest of §2), and a clean hit sets the
runway to 0, so Adam is winded the instant it lands.

---

## 5. Points and progression

There are **two separate ladders**, and this trips people up:

| | **Local** ladder | **Global** ladder |
|---|---|---|
| Earned from | fights vs AI and challenge links, plus live matches | **verified live PvP only** |
| Stored in | your browser (`localStorage`) | the `profiles` table |
| Who can see it | just you | everyone |
| Can it be faked | it's your own device, so yes | **no** — see below |

Beating the AI will never move the global board. That's intentional: a public
ladder that counts offline wins is a ladder that counts nothing.

Two details blur the split. A live match is also scored locally, as a ×2
challenge, so this device's total moves at once. And while you are signed in, the
account's server-owned stats replace this device's whenever the game syncs your
profile down (`syncProfileDown()` in `src/net/cloud.js`, on sign-in and on every
reload), so on a signed-in device the global numbers are the ones that stick.

### Local points (vs AI)

```
win  = round(20 × mult) + 5 × koRounds + min(15, streak × 3)
loss = 3
```

`streak` is your **new** streak, counting the win you just took — so your first
win pays a 3-point streak bonus, and it caps out at 15 on your fifth in a row.
Worked: a **Champion** win with **both** rounds by KO on your first win is
`round(20 × 2.5) + 2 × 5 + min(15, 1 × 3)` = **63**.

`mult` comes from the difficulty you picked — this is why **Champion is worth
2.5× a Rookie win**:

| AI level | Internal key | `mult` | Base win |
|---|---|---|---|
| **ROOKIE** | `intern` | 1.0 | 20 |
| **CONTENDER** | `founder` | 1.5 | 30 |
| **CHAMPION** | `mogul` | 2.5 | **50** |
| *accepted challenge link* | — | 2.0 | 40 |

### Global points (live PvP)

Awarded server-side by the `report_match()` function:

```
winner = 40 + 5 × koRounds + min(15, (streak + 1) × 3)
loser  = 3
```

**Both players must independently report mirror-image results for the same
room** before anything is written. A single-sided report returns `pending` and
changes nothing. Stat columns aren't writable by clients at all — only that
function can touch them, under an advisory lock so a match can't double-apply.
Losing is still worth 3, so playing is never worse than not playing.

### The rank ladder

| Points | Rank |
|---|---|
| 0 | GARAGE DREAMER |
| 60 | BOOTSTRAPPER |
| 150 | SEED STAGE |
| 300 | SERIES A |
| 550 | SERIES B |
| 900 | GROWTH STAGE |
| 1400 | PRE-IPO |
| 2000 | UNICORN |
| 3200 | DECACORN |

**Bottom to top, concretely.** A live win with one KO round, taken as your
**third straight win** (streak was 2 going in), pays `40 + 5 + 9 = 54`. At
roughly that rate:

| Rank | Points | ≈ live wins |
|---|---|---|
| BOOTSTRAPPER | 60 | 2 |
| SEED STAGE | 150 | 3 |
| SERIES A | 300 | 6 |
| SERIES B | 550 | 11 |
| GROWTH STAGE | 900 | 17 |
| PRE-IPO | 1400 | 26 |
| UNICORN | 2000 | 38 |
| DECACORN | 3200 | 60 |

The streak bonus caps at **15** (a 5-win streak), so streaks are worth chasing
but can't run away with the ladder. Rank is **cosmetic** — it changes the badge
on your card, never your stats.

---

## 6. Round and match structure

| | |
|---|---|
| Rounds | **first to 2** round wins (`ROUND.WINS_NEEDED`), normally best of three; a draw counts for nobody, so draws add rounds |
| Round clock | 60 s |
| Timeout | higher HP percentage wins the round; equal percentages are a draw |
| Between rounds | health, runway, stance, Unicorn Mode, crate buffs and cooldowns reset; **energy carries over** |
| Stage | 960 × 540 logical, floor at y = 480, walls at x = 70 / 890 |
| Gravity | 2100 px/s² · jump velocity −760 |

### Mystery crates

Briefcases drop on a **seeded** schedule (both players in a live match see
identical drops): the first appears **5 to 8 s** into each round (`FIRST_AT` 5 plus
up to `FIRST_JITTER` 3), the next is due **7–12 s** after the previous one
appeared but never while one is still on the stage, and each sits for **7 s**
before vanishing. Pick-up range 46 px. Buffs run **5 s**
(`×1.4` damage or `×1.4` speed); shields run 8 s.
