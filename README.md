# UEC — Ultimate Entrepreneur Challenge 🥊

![UEC — Ultimate Entrepreneur Challenge](og-image.jpg)

**Founders fight. Valuations fall.** A launch-ready browser arcade fighter where entrepreneurs battle 1-v-1 with Pitch Deck Strikes, Hostile Takeovers and full-meter **UNICORN MODE** — inspired by the pacing of 1990s arcade fighters, built with a fully original cast, art, and sound.

No install and no build step. You do need an account: sign in with Google, Microsoft or an email link, build your founder, and fight. **Vanilla JavaScript + Canvas + Web Audio, with no npm packages.** Fighters and arenas are drawn in code and every sound is synthesized live. Beyond the page itself, the game loads the Supabase client from a CDN (sign-in, live matches and the global leaderboard) and fetches the face-detection cascade `assets/facefinder.bin` when you upload a photo.

---

## Quick start

Any static file server works. From this folder:

```bash
# option A (nothing to install)
python3 -m http.server 4173

# option B (dev server with no-cache headers — best while editing)
python3 dev-server.py 4173

# option C (Node)
npx serve -l 4173 .
```

Open **http://localhost:4173**, sign in, and build your founder: the game asks for both before it lets you fight. Then hit **⚡ QUICK FIGHT**.

> ES modules require http(s) — opening `index.html` via `file://` won't work.

## Deploy (any static host)

The whole game is static files. Drop the folder on any of:

- **Vercel** — `npx vercel deploy` (or import the folder in the dashboard; no build command, output dir = `.`)
- **Netlify** — drag-and-drop the folder into the dashboard
- **GitHub Pages** — push and enable Pages
- **Cloudflare Pages** — direct upload

No environment variables and no server of your own. Sign-in, live matches and the global leaderboard run on the game's hosted Supabase project (its URL and publishable key are in `src/net/online.js`), so a new domain has to be added to its redirect URLs before sign-in works there (see *Enabling sign-in* below).

---

## How to play

Win **2 of 3 rounds** (60 s each): empty your rival's health bar or lead when the bell rings. Landing and taking hits charges your **energy meter** — spend 50 on your Special, or bank a full 100 for **UNICORN MODE** (6 s: +35 % damage, +25 % speed, no chip damage, extremely fabulous).

**Block** has its own button (Q or `/`; down is crouch). Holding it cuts a hit to 15 % chip, and chip can never KO; press it just as a hit arrives and you **parry** instead: no damage, and the attacker staggers. **Grabs such as Hostile Takeover can't be blocked, so jump them.**

| Action | Keyboard | Touch |
|---|---|---|
| Move | ← → or A D | ◀ ▶ |
| Jump | ↑ or W | ▲ |
| Crouch | ↓ or S | ▼ |
| Block / parry | Q or `/` | 📄 NDA |
| Slap | H or X | 🖐 |
| Punch | J or C | 👊 |
| Kick | K or V | 👟 |
| Launch (anti-air) | N or Z | 🚀 |
| Special | L or B | ⚡ |
| Cease & Desist | I or F | ⚖️ |
| Acqui-Hire (steal) | M or T | 💸 RAID |
| Dash | O or R | 💨 DASH |
| Unicorn Mode | U or G | 🦄 |
| Pause | Esc or P | ⏸ |

Touch pads appear automatically on phones/tablets (or force them with `?touch=1`).

**Combos — one rule.** When an attack **lands**, cancel it into **any other basic**. No ladder, no order to memorise: 🖐 slap, 👊 punch, 👟 kick and 🚀 launch all chain into each other, up to 5 basics per string, then a finisher (⚡ special / ⚖️ Cease & Desist / 💸 Acqui-Hire / 🦄 Unicorn). Later hits deal scaled damage, and 3 / 5 / 7 / 10 hits pop **COMBO! / SYNERGY! / DISRUPTED! / ACQUIRED!**

**Command normals — hold ➡ toward your rival as you press a basic** and you get that character's own version of the move. Carl Icahnt turns 👟 into an unblockable **ASSET SEIZURE**; Kim Koindashian turns 👊 into **PUMP** (launches, so she can juggle) and 👟 into **RUG PULL** (a trap on the floor). Every character's moves are listed on the select screen and on the pause menu.

**Parry:** tap block at the instant a hit lands (0.12 s window) — the attacker staggers and you gain energy. Grabs beat parries; parries beat everything else.

## What's new in v3.9.4: the computer picks its moment

- 🦈 **Grabs wait for an opening.** Carl's AI threw ASSET SEIZURE at anything roughly in front of him, and four times in five it caught nobody: the rival saw it and jumped, or it never reached. Now the computer only grabs what it can reach, and a Champion waits for a rival who can't jump: one holding a guard, one still finishing a swing, one standing in a counter stance. A Rookie still grabs and hopes.
- 🔥 **Slow hits wait too.** Elo Ma's PLATFORM BURN and Jeff Bozo's UNDERCUT are slow enough to see coming, and a Champion rival parried them over and over, each one a free combo the other way. Now a Champion saves them for the end of a string or a rival's mistake, along with the slow specials (HOSTILE TAKEOVER, BURN RATE BLAST, BURN IT ALL).
- 🛡️ **The computer drops its guard to hit back.** It kept blocking after a swing had already missed, and kept holding the guard it had just parried with, so the opening a whiff gives away and the stagger a parry earns both went to waste. Now it lets go and punishes, but not while something you threw is still in the air, and not after blocking a jab or kick you could still follow up.
- 🪙 **Cathie Woodz's rain is read properly.** Of her three falling coins, the computer only ever noticed the first, and blocked the others mostly by accident, while guarding against her finished swing. Now it sees all three.

Measured in AI-versus-AI matches across the whole roster at Champion (60 per pair, two seeds): Carl went from 24% to 51% and Elo from 17% to 29%, and the gap between the best and worst Champion closed from 54 points to 36. Kim Koindashian drops from about 60% to 40%, because her rivals used to guard against her missed swings instead of punishing them, and Lizbeth Holmez from 71% to 64%. At Contender, Carl rises from 50% to 58% and Jeff Bozo falls from 45% to 34%; at Rookie nobody moves more than about four points. Only the computer's play changed, so a live match between two players is exactly as it was.

## What's new in v3.9.3: the computer watches the floor

- 🪤 **The computer sees traps now.** Kim Koindashian's RUG PULL (and a built founder's POISON PILL) caught every AI at every difficulty, because the computer never looked at traps at all. Now it stops at the edge and fights from there, jumps a trap when its jump is long enough to land clear, waits out one it can't, and steps out of one laid at its feet before it arms. It also stops taking combo steps, dashes, rushes, teleports and mid-air swings that would put it on one. A Champion almost never walks onto a trap now; a Rookie still does about a third of the time.

Measured in AI-versus-AI matches across the whole roster, with the throw fix in, reading traps cost Kim about twelve points at Champion (75% to 63%): she goes from the Champion to beat to one of the top group, level with Lizbeth, Cathie and Scam. Nobody else moved more than about two. Only the computer's play changed, so a live match between two players is exactly as it was.

## What's new in v3.9.2: a throw goes behind you

- 🦈 **A throw lands behind you from either side.** HOSTILE TAKEOVER (Carl's, and any founder who picks it, including the Closer and the Chief), Carl's ASSET SEIZURE and a built founder's DUE DILIGENCE always threw to the right. From one side that was the promised swap; from the other, the victim landed right back in front of you and you were shoved backward, sometimes onto a trap. Now the victim lands behind you whichever side they stood on, and you step forward into the space they left.
- 🧱 **A throw gets you out of the corner.** With your back flat against the wall, whether the throw swapped sides used to depend on which player you were. Now it always does: they go into the corner and you walk out. Live play needs both players on v3.9.2.

## What's new in v3.9.1: a new address

The game lives at **https://aurmada.github.io/uec-ultimate-entrepreneur-challenge/** now; the old address stopped working when the project moved. Links you share show their preview picture again, because the page was still pointing its preview at the old address. Nothing about the fight changed.

## What's new in v3.9: Jeff Bozo delivers

Every move in the game used to happen the moment you pressed it. This one happens later.

- 📦 **SAME-DAY DELIVERY.** Jeff Bozo stops borrowing Carl's Hostile Takeover and gets a move that is his business model: he ships a parcel to the spot you're standing on. A ring appears under you and tightens, and a second and a half later the box lands right there, from the sky, so jumping doesn't save you. Walk off the mark, block it, or parry it. Sign for it cleanly and you're popped into the air while Jeff walks over to collect. He can only have one order out at a time, and pressing for a second one costs nothing.
- 🎭 **Nobody shares a signature any more.** Carl keeps the grab. That was the last of the three pairs.
- 🤖 **The computer plays around it.** Every AI reads a parcel on its way and steps off the mark (or blocks, if it's too late to walk), and won't walk back into one that's about to land. Jeff's AI ships from mid range, where you have to choose between walking at him and backing into the corner.
- 🧠 **A rookie AI no longer freezes up close.** One of its options in melee range was meant to step back and make space; it set the direction and then threw it away, so a third of the time it simply stood there.
- 🔒 **Traps are in the live-match fingerprint.** A trap one player has and the other doesn't used to surface as a damage mismatch seconds later; now it's caught at the next sync. Live play needs both players on v3.9.

Behind the scenes, this is the third new kind of move built on the same foundation as Alignment Shift and Runway: a timer that has to survive a KO, the round bell and the next round without landing on anyone afterwards. It doesn't: an order still out when the round ends is cancelled. Measured in AI-versus-AI matches across the whole roster, Jeff's win rate at Champion went from about 27% to 35%, and nobody else's moved outside the noise.

## What's new in v3.8: a block is a block again

No new moves. One old bug that changed how every fight played is gone, along with several that were quietly wrong.

- 🛡️ **Blocking takes timing again.** Since v1.4, simply holding block parried every hit: no damage, the attacker staggered, and you banked energy, so defence cost nothing and chip damage never happened. Now a held block takes 15 % chip (it still can't KO you), and a parry means pressing block just as the hit arrives. The AI plays by the same rule.
- 👤 **Your profile opens again.** If you picked ALIGNMENT SHIFT before v3.6 made it Scam Alt's alone, the profile screen stopped opening, so you couldn't change it. It opens now and swaps you to Pitch Deck Strike until you choose another.
- 🔒 **Roster moves stay on the roster.** A stale save, a hand-edited challenge link, or a tampered live pick could still hand a player build Scam Alt's or Adam Weumann's signature, and even Adam's runway. All three doors are shut, and a live match now refuses a rival on an older version rather than letting the two of you drift apart mid-fight.
- 🤖 **Scam Alt's AI stops paying for nothing.** It sometimes spent 50 meter switching to the stance it was already in. That was more than a third of its switches.
- 💸 **The runway bar** no longer flashes "refilled" at the start of every round.
- 🎮 **Controls card and help** now list Launch, and say what's true: you can play as any roster fighter.

Behind the scenes: tests that could never fail now can, dead code and settings nothing read are gone, and every document was checked line by line against the code.

## What's new in v3.7 — Adam Weumann is running out of money

Every fighter's meter goes up. Adam's runway goes down.

- 💸 **RUNWAY.** A second bar, gold, his alone. It drains from the moment the round starts and the only thing that refills it is landing a hit. Hit zero and he's **winded** — slower, weaker, easier to put down — until he connects with something. Waiting is what kills him, which is the opposite of how everyone else fights.
- 🔥 **BURN IT ALL.** Torches every remaining dollar for damage scaled to whatever was left. Full tank, and it's the hardest single hit in the game. It also empties him, so he's winded the instant it lands. Throw it early and you're gambling; throw it late and it barely stings.
- 🎭 **Elo keeps Burn Rate Blast.** He and Adam had been sharing it. One pair still shares a signature; that's the last of three.

The joke is the mechanic: he is the founder who torched $47 billion, and he is the only person on the roster with a number going down.

His AI plays it properly, too — it scrambles for any hit at all when the tank is dry, and cashes out with BURN IT ALL when it's full. That got tested by making the computer actually fight and counting the punches, because the last time a new move went in, the AI stood perfectly still for a whole match and every test still passed.

## What's new in v3.6 — a move that was never meant to be yours

A quick correction to v3.5. ALIGNMENT SHIFT is Scam Alt's move, and it was accidentally showing up in the founder creator's special list for everyone. It shouldn't have — every move a player can pick is balanced against a budget that has to come out to zero, and his doesn't, because it was written for him.

It's now roster-only, and so is anything else marked that way in future. Two places had to be closed, not one: the menu you pick from, and the challenge-link decoder, which will happily read whatever a hand-edited link asks for. Menus are a suggestion; the decoder is the door.

## What's new in v3.5 — Scam Alt picks a side, and the game remembers

Every move in this game has been a thing that happens *now*, at a place: a punch, a throw, a projectile. Nothing persisted, nothing changed the rules. This adds the first move that does.

- ⚖️ **SCAM ALT gets ALIGNMENT SHIFT.** A toggle, not a strike. Flip to **SAFETY** and you hit 15% softer but take 15% less, move slower and recover faster. Flip to **CAPABILITIES** and you hit 20% harder, start up quicker — and take 15% more. Neither is the better one. That's the point, and it's the joke.
- 🎭 **He also stops borrowing.** Scam had been throwing Lizbeth's Pivot Punch; it's hers alone now. Two pairs still share a signature, and they're next.

Under it, the part you can't see: the game now has one declared list of everything the simulation remembers about a fighter, instead of three places that each had to be updated by hand and had already fallen out of step. That sounds like housekeeping and mostly is — but one of the things that had quietly fallen out of step turned out to be a real rule nobody had written down anywhere: **your meter carries between rounds.** It always has. Now it says so.

The AI plays the new move too — it goes defensive below a third health and aggressive above it. That took two attempts. The first one left Scam standing perfectly still for the entire match, which is the sort of thing you find by making the computer actually fight rather than by reading the code and nodding.

## What's new in v3.4 — you can tell them apart with the lights off

The cast had a sameness that survived three rounds of art work, and this time we measured it instead of arguing about it. Strip the colour out and flatten all nine to flat white shapes, and they collapse into **two**: five near-identical narrow columns (Lizbeth, Kim, Cathie, Elo, Scam) and three wide blocky ones (Adam, Carl, Jeff). Only Steve was instantly nameable, and not because of his body — because one arm sticks out.

That is the difference between the two fighting games everyone compares us to. One differentiates by costume; the original ninjas were a single sprite in several colours. The other differentiates by *shape*, so you know who it is from the outline. We were accidentally the first one.

- 🧰 **Everyone carries something now.** Lizbeth wears a sample vial, Adam a rolled mat, Steve holds the device up mid-presentation, Kim has a ring light haloing her head, Cathie carries a tablet, Carl never puts the briefcase down, Elo straps a booster to his back, Jeff has a parcel under one arm, and Scam trails a single enormous paperclip. He knows what he did.
- 🧥 **Cathie has a coat**, and it swings — the first garment that trails the body instead of riding it rigidly.
- 👁️ **Nine outlines, nine places they break.** Hip, shoulder, forward hand, head, chest, waist, back, and one big slab off the side. No two are the same, and the two-family read is gone.

None of it touches the fight. Props are drawn where the shading and outline passes can see them, so they belong to the silhouette rather than sitting on top of it — but nothing carries a hitbox, nothing is priced by the power budget, and a prop can never make a punch land further than it looks. If a thing should hit you, that's a move, and moves cost.

A note on how this was built, because it kept mattering: a prop can be perfectly present and still invisible, and it happened four separate ways — a colour that matched the suit underneath, a shape drawn behind a body wider than it was, a paperclip traced as a wire when the renderer fills outlines, and a state filter nothing was checking. The build now measures every prop's ink and refuses the ones that draw nothing. It caught one the eye had already passed twice.

## What's new in v3.3 — the free five-second parry is closed

The power budget prices everything a character can do, so that a custom founder can be strong in one direction only by being weak in another. It had one blind spot, and it was a big one.

- ⚖️ **Counters and traps put their power in numbers the budget wasn't reading.** A counter that stayed open for 0.05 seconds and one that stayed open for a full minute cost exactly the same. So did a trap the size of a doormat and one covering a quarter of the arena, lasting a minute, with twenty of them out at once. Every other number in the creator is bounds-checked; these never were, so the only thing stopping a free five-second parry was that nobody had tried it.
- 🧮 **Now every axis is priced** — how long a counter stays open, how much ground a trap denies, for how long, how fast it arms, and how many can be out at once. Stacking is the most expensive, because it's the one that actually breaks a match: three simultaneous traps is now a straight rejection rather than a bargain.

Nothing you can already build got more expensive. Two existing moves got *cheaper*, because their numbers sit below the new reference and they'd been quietly overpaying. Fight behaviour is untouched — this is what the creator will let you export, not how anything hits.

## What's new in v3.2 — they stand and swing like different people too

v3.1 made the roster look like nine people. This one makes them *move* like nine people. Same underlying cause both times: a system keyed to something coarser than the character.

- 🧍 **Nine stances instead of five.** Posture was keyed to fighting *style*, and nine fighters shared five of them — Lizbeth, Elo and Scam stood identically, as did Adam and Carl, and Cathie and Jeff. Now Lizbeth is unnaturally still with her hands clasped, Adam sprawls, Steve is permanently mid-presentation, Kim is compact and side-on, Cathie is the only symmetrical one, Carl hunches with both hands already reaching, Elo folds his arms, Jeff puts his hands on his hips, and Scam keeps his in his pockets. Stripped of faces and flattened to black shapes, the cast now spans 67–125px wide and 187–263px tall.
- 👊 **Nine ways to throw a punch.** Every fighter shared one set of attack animations; the style multipliers changed how *fast* a move came out but never how it looked, so Carl's grab and Kim's jab were the same motion at two speeds. Each fighter now shapes the shared keyframes — how deep they coil, how much weight drops into the hip on contact, how long the follow-through outlives the hit. Carl drops hardest and takes the longest to come back up; Kim's hand is back before you noticed it left; Adam's swing is still travelling when everyone else has reset.

Neither changes the simulation. Reach is measured and unchanged at the moment of contact for all nine — a punch still lands exactly where it always did, no matter how theatrically it gets there.

## What's new in v3.1 — nine people, not one person in nine jackets

The roster had a sameness no amount of body work was fixing, and it turned out only some of it was design. Two of the three causes were bugs.

- 🙂 **Every fighter had the same face.** The expression system — angled brows, a heavy lid, a set mouth — was working perfectly and applying identical values to all nine. Each one now has their own: Carl's eyes are slits under the lowest brow in the game, Lizbeth is the only fighter whose lids are *raised* (she does not blink), Kim has the heaviest lids because contempt is cheaper than anger, and Cathie is the one face here that isn't glaring.
- 🎨 **Nobody in this game had dark hair.** Six of the nine carry near-black hair, and every one of them rendered as the same warm grey — the key light was a flat wash, and a flat wash pulls every colour toward itself. Measured across the cast, hair went from a 214-wide range down to 112. The light wasn't lighting the palette, it was erasing it. It's now an `overlay` pass, so black hair stays black.
- 🌈 **And then the palette itself got spread.** With dark finally rendering dark, six characters sharing six shades of near-black became the new problem. Kim is jet black, Adam shaggy brown, Elo auburn, Scam sandy, Steve greying, Carl steel silver, Lizbeth platinum, Cathie white.

Contrast against the stage was rechecked across all six arenas and holds at the level it shipped at — the darker cast is paid for by a stronger key line and a deeper backdrop scrim, not by bleaching the characters again.

## What's new in v3.0 — the moves that never worked

Three moves in this game played their animation, printed their popup, and did nothing at all. Nobody noticed because the tests checked that a character's numbers were *well-formed* and *correctly priced* — never that pressing the button did anything.

- 📄 **PAPER TRAIL and SAFETY MEMO now actually throw something.** Both are projectile moves, and projectile moves fired zero projectiles for zero damage at every range, always. The engine seeded the firing counters on one code path and not the other, so the check that decides whether to spawn was comparing against `undefined` and quietly answering "no" on every frame. PAPER TRAIL is a move players pick in the founder creator — anyone who chose it had been paying budget for a move that could not fire.
- ⚖️ **LAWYERED counters things.** The only counter a player could pick was beaten by slap, punch *and* launch — it caught kick and nothing else, which is a strange life for a move whose entire job is turning attacks back on people. A counter's startup turns out to be a cliff rather than a slope: four frames faster and it beats three of the four basics. It now does, paying for the speed out of its own damage. Slap still goes through, because reading a jab with a counter shouldn't be free.
- 🖼 **Your rival has a face again.** The pause and controls buttons sat directly on top of the second player's portrait — 40px of it on desktop, all of it on a phone, where the rival was a gold frame with nothing inside.
- 🧪 **Every move of every fighter is now fired in a live match by the test suite** — 9 fighters, 91 move-slots, plus all nine move archetypes. That is the check that was missing, and it is the reason the three above stayed hidden this long.

> **Live matches:** v3.0 will not fight a v2.9 client. That's deliberate — the moves above behave differently now, so an old and a new client would silently disagree mid-fight. Both sides need to reload.

## What's new in v2.9 — the founders stop growing mid-punch

- 📐 **Fighters no longer get 27% bigger when they attack.** They did, for the whole length of every swing. The stance lived in two places in the code and only one of them was updated when v2.7 retuned the proportions — so a founder stood at the old skeleton and snapped to the new one to throw a punch. One rig now, and v2.7's proportions finally reach the character you actually look at, which means the whole cast is visibly taller at rest.
- 📏 **Height means something.** Cathie is the tallest because she *is* the range — you should see it before she uses it. Adam isn't the tallest, he's the biggest. Lizbeth is deliberately, forgettably ordinary. Kim is the smallest and the hardest thing on stage to hit. It costs nobody any power budget: stature is spent through leg length, which the budget doesn't price.
- 🌐 **Live matches refuse a mismatched opponent up front** instead of voiding thirty seconds in. The handshake checked what a character *is* but not what it *does*, so two players on different versions could start a fight that was already doomed and have it report itself as a network fault.

## What's new in v2.8 — everyone fights differently now

v2.4 built a system for giving each founder their own moves. Two of them ever used it. Now all nine do.

- 🥋 **Every founder has a signature move.** Hold ➡ toward your rival and press a button to get their version of it. Lizbeth answers your swing with **THE DEMO** — a stance, not a strike, and it turns out the machine was never plugged in. Adam **BLITZSCALEs** straight through you. Steve leaves the stage mid-sentence and is behind you. Cathie rains conviction on your head. Elo detonates the launchpad, Bozo undercuts you at the ankles, and Scam throws safety memos at speed.
- 🛡 **Counters actually happen now.** The counter stance shipped priced, buildable, and offered to you in the founder builder — and no opponent could ever throw one. They can now, and they read the swing rather than a timer.
- ⚖️ **LAWYERED hits for what you paid for it.** If you built a founder with the counter stance, it was sold to you at 13 damage and quietly hitting for 10. It hits for 13.

Nothing changed about the cast's look, and no build you have saved is affected. 171 tests.

## What's new in v2.7 — the founders learned to fight

Every previous art pass improved how the cast was **lit**. This one changes how they're **drawn**.

- 😠 **Nobody smiles any more.** Every founder used to stand in their idle wearing a gentle closed-mouth smile — six disgraced executives beaming at the person about to hit them. Brows angle down toward the nose now, a heavy lid narrows the eye, and the jaw is set. Winning still smiles; that one is earned.
- 🥊 **A real stance.** They used to stand up straight with their hands out. Feet are 51px apart instead of 29 on a ~200px figure, hips and shoulders drop, the torso leans in, and the rear hand comes up to guard the chin.
- 📏 **Fighting-game proportions.** 4.35 heads tall to 5.5 — smaller skull, longer limbs, a skeleton lengthened to keep the silhouette the stages were built around.
- 💪 **Limbs with anatomy.** A limb was two even tubes. Now it's heavy at the shoulder and hip, pinched at the elbow and knee, swelling through the forearm and calf before tapering to the wrist and ankle, with deltoids at the shoulders.

Nothing about the fight changed: hurtboxes come from the frame data, never the pose, and the rig is shared rather than per-character — so the power budget, the ladder and every saved founder are untouched. 169 tests, and the whole render still costs about 1 ms a frame.

## What's new in v2.6 — you can see who you're fighting

A readability pass. Nothing about the fight changed; it just got easier to read.

- ✏️ **Fighters have an edge now.** A pale key line rides the outside of every silhouette, so a dark suit against a dark stage stops dissolving into it. It's there to make the shape legible, not to be noticed.
- 🌒 **Every stage sits back a little further.** The arena is scenery, the fighters are the subject, and four stages were competing with their own cast for attention. The Summit, the Garage and the Boardroom now push their backdrops down by different amounts, each tuned to the point just before the room stops looking like itself.
- 📐 **Built on a measurement, not an opinion.** `lab/contrast.js` finds the fighter by rendering the scene twice — once with the cast, once without — and scores every body pixel against the exact backdrop pixel it covers. Across six arenas the share of a fighter sitting near-invisible against its own stage went from 31.5% to 29.4%, and the gap between the best and worst stage narrowed from 7.0 points to 5.4.

Still 166 tests, and the whole render costs under 1 ms a frame.

## What's new in v2.5 — build your own founder

v2.4 gave the cast their own moves. v2.5 gives you yours.

- 🧬 **Build your founder.** In your profile: shape your silhouette, then pick signature moves off a menu — a launcher, an unblockable command grab, a floor trap, a counter stance, a low sweep that outranges your punch. They come out on **hold ➡ toward your rival + the button**, same as the roster's.
- ⚖️ **You cannot buy an advantage.** Everyone in UEC hits equally hard, and that hasn't changed. What you can do is **trade**. A stronger move has to be paid for — with a weaker one, or with a bigger body that's easier to hit. Your build has to balance to zero, and the game won't let you save it until it does. Silhouette is free: shoulders, leg length and head size cost nothing at all, so you can look like nobody else without owing anything.
- ✨ **Suggest a build** seeds one from your name, so no two founders start the same.
- 🔗 **Your founder travels.** Challenge links carry your shape and your moves, so the AI ghost your friends fight is the fighter you actually built.
- 🫁 **Every fighter now breathes differently.** Carl shifts his weight slowly and doesn't fidget. Kim bounces twice per breath and is never quite still. Cathie is almost motionless — the stillness is the threat. Steve's presenting hand drifts up like he's about to say "one more thing".
- 🛠 **The Incubator** — an internal authoring tool with a live power-budget meter, a spar mode running the real AI, and a keyframe timeline editor. Not part of the game; it's how the roster gets made.

166 tests, up from 31 two releases ago.

## What's new in v2.4 — the character update

Every fighter now **moves** differently, **hits** differently, and is **recognisable by shape alone**.

- 🥊 **Command normals.** Hold forward as you press a basic and you get that character's own move. Everyone still shares identical controls — same movement, same block, same four basics, same universal moves — so uniqueness lives in 2–3 moves per character rather than in a wall of special cases. Two new fight patterns join the vocabulary: **counter** (a stance that turns an incoming strike back on its owner — grabs still beat it) and **trap** (a floor hazard that arms on its own clock and denies ground).
- 🎞 **Authored keyframe animation.** Attacks are hand-keyed in *phase space* — wind-up, hitbox out, recovery — so one track reads correctly on a 4-frame slap and a 12-frame kick alike. Nearly all the travel happens on the impact frame, and the pose is then **held** through the active window. Smooth easing from wind-up to strike is what made the old poses read as shoves.
- 🦾 **Arcade proportions.** Limbs have elbows and knees, taper from a thin upper arm into a heavy forearm into a glove, and boots point where the leg points. Two long-standing bugs surfaced once limbs were thick enough to see them: limbs were socketed to the *upright* torso while the torso itself leans, and a horizontal kicking leg ended in a flat plate seen edge-on.
- 🕴 **A roster you can tell apart in silhouette.** Every fighter has their own proportions and their own head outline. Cathie is the tallest and longest in the arm; Carl is a fireplug with the shortest legs and widest shoulders; Kim is small with an oversized head. Hair now changes the *shape* of a head rather than just its colour.
- ⚖️ **Nobody is over budget.** The power budget flagged PHANTOM as over-tuned back in v2.3.1 and it stayed that way. It is fixed — and no stat changed to fix it. *Slight and untouchable* is the compounding pattern the budget exists to catch, so giving Lizbeth an ordinary frame to hit is what pays for her speed.
- 🔒 **Challenge links and live matches now validate what they receive.** A hand-edited link with inflated frame data decodes to nothing, and a live match refuses to start rather than desyncing four seconds in and blaming the wifi.
- 🎉 **Victory beat** — confetti, a callout, and a pose that lands.

Under the hood: a character schema with a real validator, 139 tests, and a golden-image harness that pins every fighter in every state.

## What's new in v2.0 — the art pass

A full visual overhaul taking style cues from classic arcade fighters, in the game's own identity. **100% original**: no Street Fighter characters, logos, named moves, sounds or artwork — genre conventions only, the same originality rule the roster follows for Mortal Kombat.

- 🎨 **Cel-shaded fighters** — each fighter renders into an offscreen buffer, then a shading pass composites a form shadow, a warm-key/cool-fill directional split and a rim light across the whole silhouette at once. Because it's a *post-pass* rather than per-shape, it's **pose-independent**: every current and future animation frame is lit for free, with no per-frame art. Ink outlines thicken to match.
- 💡 **Cinematic stage lighting** — every arena gets a backdrop haze that pushes it back, a top key glow, a vignette that frames the action, and blurred layered contact shadows so fighters feel planted instead of pasted on.
- 🏛 **Arena depth** — a foreground layer drawn *in front* of the fighters, driven by each arena's own `mood`: crowd silhouettes with phone lights for Demo Day and the Unicorn Club, framing pillars for the Stock Exchange and VC Summit, a grounding floor shelf elsewhere.
- 🥊 **Punchier animation** — squash & stretch anchored at the feet, a deeper anticipation coil before every strike, stretch on release, jump rise/fall deformation, and a hard recoil snap on impact. Hitbox timing is untouched — it all comes from `ATTACKS` config, so the feel changed and the balance didn't.
- 🖼 **UI cohesion** — glossy gold-edged health bars, framed HUD portraits, dimensional buttons and panels, and a lighting pass on every portrait bust (kept deliberately light: a heavy grade turned the dark-suited fighters to mud at portrait size).
- 🎲 **The run continues** — after every fight: **NEXT FIGHT** (a fresh random rival, skipping the one you just fought), **FIGHT LIVE** (opens a live room to fight a real player) or **REMATCH**. No trip back to the menu between fights.

Perf cost of the whole pass: **~0.3 ms/frame**, roughly 98% headroom at 60 fps.

## What's new in v1.8

- 💇 **Your photo no longer erases your fighter.** Uploading a face used to replace the *entire* head, so `drawHair` and accessories were skipped and everyone came out bald and generic. A photo now replaces only the **face**: hair renders behind it (slightly oversized, so it frames the crop) and headwear renders on top.
- 🎨 **A real look customiser** — five independent layers in Founder Profile: **hair** (12 styles), **headwear** (cap, beanie, bandana, headband), **eyewear** (glasses, shades, AR visor), **facial hair** (stubble, moustache, goatee, beard) and **outfit** (9). With hair/suit/accent colours that's **10,800 combinations** before colours, and a 🎲 **SURPRISE ME** button. Every option is verified to render distinctly.
- 🧢 **Headwear never covers your eyes.** Everything is anchored above the brow line — hats riding down over the face was the worst thing about the old avatars.
- 👔 **Outfits are finally visible in portraits.** All nine used to collapse into "has a collar" or "doesn't" on the profile preview, leaderboard rows and challenge cards; each now has its own neckline (tie, pinstripes, hood + drawstrings, ribbed bomber collar, henley placket, crew neck, vest…).
- ☁️ **Your look follows your account** — synced to a whitelisted `look` column, so leaderboard avatars, challenge cards and live opponents all see the fighter you actually built. Live matches now also carry your photo-derived skin/hair, which they previously dropped.

## What's new in v1.7

- ⚖️ **You always fight as yourself.** "Choose your fighter" is gone — the select screen now picks your **rival**. Your own founder is the only fighter you ever control, so ranked points can only ever be earned as you.
- 📊 **Every player has identical stats** — `1.00 speed / 1.00 power / 100 HP`. Base characters are pure cosmetics. Previously a player inherited their look's stats, which spread `0.90–1.20` power: a wardrobe choice was worth up to a 33 % damage swing on a ranked ladder. Varied stats remain, but only on AI rivals.
- 🔐 **A founder profile is now required**, not suggested. New signups are routed straight into the builder and can't reach the arena until they've made themselves.
- 📐 **[The math is fully documented](docs/GAME-MATH.md)** — damage formula, combo scaling, meter economy, both points ladders, and the rank table, all with worked examples.
- 🔢 **Version is shown on the title screen** and lives in one place (`VERSION` in `src/config.js`).

## What's new in v1.6

- 🖐 **Slap** — a new fastest-and-weakest basic (4 dmg, 4-frame startup) that sits below punch on the combo ladder, with its own sharp-crack sound and open-hand pose. Purely for disrespect, mechanically for starting longer strings.
- 🔗 **Magic-series combos** — chains are now rank-based (slap → punch → kick): cancel into the same move up to its cap or anything stronger, never weaker. Routes run to 8+ hits.
- 📜 **The story** — an **About** screen laying out the lore: venture capital ran dry, so founders settle it in the ring and the winner takes whatever is left.
- 🧍 **16 base characters** — generic build-your-founder silhouettes for custom profiles (the parody roster stays as opponents), with no name labels on the picker.
- 🖼 **VS challenge cards** — an incoming challenge now shows both founders' real photos facing off with a **VS** in the middle.
- 🎚 **Difficulty renamed** to **Rookie / Contender / Champion**, and Steve Jobz became **Steve Nojobs**.
- 📧 **Private email capture** — signed-up emails land in a `user_emails` table that only the owner can read, deliberately kept out of the world-readable `profiles` table.

## What's new in v1.4

- 🕶 **Famous-founder roster** — the whole cast is now parody legends: **Lizbeth Holmez** (Theramos), **Adam Weumann** (WeWerk), **Steve Nojobs** (Pear), **Kim Koindashian** (SkimzCoin), **Cathie Woodz** (ARKK Capital), **Carl Icahnt** (Icahnt Holdings) + the cameo tier (Elo Ma, Jeff Bozo, Scam Alt). 100% satire, 0% affiliation.
- 🥊 **Combat feel pass** — punches/kicks are meaningfully faster (5-frame punch startup), with anticipation wind-ups, harder overshoot, motion-smear arcs and heavier hitstop. Mashing feels *good* now.
- ⚖️ **Cease & Desist** replaces the bomb: hurl legal paperwork in an arc (25 energy). You've been served.
- 💸 **Acqui-Hire** — new universal steal: raid their team at close range and siphon 15 energy into your meter (free, 3.5 s cooldown, blockable/parryable). Chains out of punches for maximum disrespect.
- 🛡 **PARRY** — tap block at the last instant to turn an attack away: attacker staggers, you gain energy. Grabs beat parries; parries beat everything else. Real skill ceiling unlocked.
- 💨 Dash got its proper emoji and moved next to the movement pad on touch.
- 🔐 **Sign-in system** (Google / Microsoft / email magic link via Supabase Auth) — built, wired, and gated behind `AUTH.REQUIRED` in [src/auth.js](src/auth.js) until providers are enabled (see below).

## Enabling sign-in (owner checklist)

**Step-by-step credential guide (Google & Microsoft consoles): [docs/AUTH-SETUP.md](docs/AUTH-SETUP.md).** Summary:

The game runs on its **own dedicated Supabase project** (`uec-game`, ref `oqzxkzkyiiahxmppgrkn`), isolated from other Aurmada projects. Sign-in needs the OAuth providers switched on. In the [Supabase dashboard](https://supabase.com/dashboard/project/oqzxkzkyiiahxmppgrkn):

1. **Authentication → URL Configuration** — set Site URL to `https://aurmada.github.io/uec-ultimate-entrepreneur-challenge/` and add it (plus `http://localhost:4173/**`) to Redirect URLs. (The game moved there from `firdous-aurmada.github.io` when the repository moved to the Aurmada organisation; the old address no longer serves it.) **When you get a custom domain, add it here too** — the app code already uses whatever origin it's served from, so no code change is needed, only this allow-list entry.
2. **Authentication → Providers → Email** — enable (magic links work with no extra setup).
3. **Authentication → Providers → Google** — paste a Client ID/Secret from Google Cloud Console (authorized redirect URI: `https://oqzxkzkyiiahxmppgrkn.supabase.co/auth/v1/callback`).
4. **Authentication → Providers → Azure** — same with a Microsoft Entra app registration (same callback URI).
5. Nothing to flip: `AUTH.REQUIRED` is already `true` in `src/auth.js`, so nobody reaches the arena without signing in and then building a founder profile. Set it to `false` only to re-open guest play.

> Billing: `uec-game` is a paid project (~$10/mo compute) so it stays always-on for live sign-in — no idle auto-pause.

## What's new in v1.3

- 🔗 **Real combos** — attacks now **cancel on hit**: chain Punch ×3 → Kick → Special / 💣 / 🦄. Whiffs still recover in full, chained hits scale down in damage (100/85/70/60/50%), chained jabs shove less so strings stay in range, and milestone callouts fire at 3/5/7 hits (COMBO! → SYNERGY! → DISRUPTED!). Founder and Mogul AIs chain back.

## What's new in v1.2

- 🎁 **Mystery drops** — briefcases parachute into every round carrying **hidden powers** (Secret Funding, 10x Engineer, Legal Shield, To The Moon… and the occasional Toxic Asset). Seeded RNG, so both players in a live match see identical drops.
- 💣 **PR Bomb** (25 energy, arcing blast) and ⚙️ **Hustle Dash** (free gap-closer that cancels into attacks) — two new universal moves on every fighter, keyboard + touch.
- 🕶 **Cameo tier** — three 100%-parody guest fighters: **ELO MA** (SPACEY-X), **JEFF BOZO** (PRIMEZON) and **SCAM ALT** (CLOSEDAI). No affiliation, all satire, very punchable.
- 📣 **Built-in bragging** — one-tap LinkedIn / X / WhatsApp share buttons and a copy-paste brag generator on the results screen. Your share link is your **challenge link**, so anyone who clicks your flex gets called out. Rank-ups get celebrated accordingly.

## The roster (all fictional)

| Fighter | Company | Signature special |
|---|---|---|
| **Lizbeth Holmez** · The Fraudster | Theramos | 🔄 **Pivot Punch**: vanishes mid-claim, reappears fist-first |
| **Adam Weumann** · The Burner | WeWerk | 🔥 **Burn It All**: torches whatever runway is left; the fuller the tank, the harder it lands |
| **Steve Nojobs** · The Vaporware Prophet | Pear | 📊 **Pitch Deck Strike**: three razor-sharp slides across the arena |
| **Kim Koindashian** · The Rug-Puller | SkimzCoin | 📈 **Growth Hack**: viral rush that locks in a 4-hit flurry |
| **Cathie Woodz** · The True Believer | ARKK Capital | 💰 **Funding Round**: rains gold and pockets energy on every hit |
| **Carl Icahnt** · The Asset Stripper | Icahnt Holdings | 🦈 **Hostile Takeover**: unblockable command grab |
| **Elo Ma** · The Technoking | Spacey-X | 🔥 **Burn Rate Blast**: slow, point-blank inferno |
| **Jeff Bozo** · The Everything Guy | Primezon | 📦 **Same-Day Delivery**: ships a parcel to wherever you're standing; it lands a second and a half later |
| **Scam Alt** · The Alignment Guy | ClosedAI | ⚖️ **Alignment Shift**: toggles between the SAFETY and CAPABILITIES stances |

| Unicorn Mode in The Unicorn Club | Pitch Deck Strike on The Stock Exchange |
|---|---|
| ![Unicorn Mode brawl](shots/unicorn-brawl.jpg) | ![Pitch Deck Strike volley](shots/pitch-deck.jpg) |

Everyone shares 🦄 **Unicorn Mode** at full meter. On the select screen you can fight as your own founder or as any roster fighter, and a roster pick plays with that fighter's style, special and command normals (Adam brings his runway). As rivals they also have AI personalities (aggression, jumpiness, preferred range) across three difficulties: **Rookie / Contender / Champion**. Your own founder always fights with the BALANCED style; every style's numbers are in **[docs/GAME-MATH.md](docs/GAME-MATH.md)**.

**Arenas (6, all animated):** The Boardroom · Demo Day · The Startup Garage · The Stock Exchange · The Unicorn Club · The VC Summit — with live tickers, sweeping spotlights, bouncing crowds, disco floors, and data-driven billboard slots (see *Sponsorships* below).

## Feature checklist

- 🔐 **Sign-in first** (Google, Microsoft or an email link); your first fight against the AI opens with a 5-card tutorial, plus in-match hints
- 👤 **Founder profiles** (required): name, company, **photo upload with automatic face capture** (face detection runs on-device in every browser via a vendored MIT detector, picojs, with drag/pinch fine-tuning; the cropped photo syncs to your account and is shown to rivals), base character, custom suit/accent colours, a signature special from the player menu (roster-only moves such as ALIGNMENT SHIFT and BURN IT ALL are not on it), and a build of silhouette plus up to three signature moves that must balance against a zero power budget
- 🔴 **LIVE multiplayer** — create a room, send the link, and fight a friend in real time. The inviter is notified the second their rival joins; both pick fighters, the host picks the arena, and the match runs deterministic 60 Hz lockstep over Supabase Realtime with input-delay netcode, packet-loss healing, desync detection, both-consent rematches, and graceful disconnect handling. Backgrounded tabs keep simulating via a Web Worker so you never freeze your opponent.
- 🤖 **Vs AI** (3 difficulties) · 🌐 **FIGHT A REAL PLAYER** (auto-pairs you from a live lobby) · 🔗 **async call-out links** (the link carries your fighter; friends battle your AI ghost any time)
- ⚔️ **Challenges screen**: live rooms, call-out links, and 13 seeded rival founders (the nine roster fighters plus four NPCs) at their skill tier
- 🏆 **Leaderboard**: a 🌍 GLOBAL tab (the default, stored in Supabase) that counts only confirmed live matches between signed-in players, and a 🏠 LOCAL tab with the seeded season plus you; W-L, KOs, streaks and rank titles (Garage Dreamer → Decacorn)
- 📈 **Ranked points** — win = 20 × difficulty (×1/×1.5/×2.5, challenges ×2) + 5/KO round + streak bonus; a loss still pays +3
- 📸 **Shareable result cards** — 1200×630 PNG (download or native share)
- 🔊 **Sound controls** — master volume, music & SFX toggles, one-tap mute; all audio synthesized live
- 📱 **Mobile-ready** — responsive layouts + multi-touch pads; auto-pause when the tab hides
- 🔁 **Rematch / change fighter / restart** flows everywhere you'd expect

## Project layout

```
index.html            all screens & modals (DOM shell)
styles.css            visual system (arcade gold/pink/cyan on deep navy)
dev-server.py         no-cache static server for development
assets/               facefinder.bin (face-detection cascade) + dormant sprite atlases (only with ?sprites)
src/
  config.js           every gameplay number: physics, frame data, styles, meter, stance, runway, points, ranks, budget
  state.js            localStorage save: profile, stats, settings + challenge-link codec
  auth.js             Supabase Auth sign-in (Google, Microsoft, email link) and the AUTH.REQUIRED gate
  main.js             boot, screen router, sign-in and profile gates, match lifecycle, live-match driver, render loop, debug hooks
  data/fighters.js    roster definitions + specials metadata + custom/ghost builders
  data/schema.js      character format, validator, archetypes and power budget
  data/playerMoves.js curated signature moves a player can give their founder
  data/seed.js        seeded local leaderboard (nine roster founders, four NPCs)
  data/authored.js    Incubator export file; validated by the tests, not loaded by the game
  data/tracks.js      stock keyframe animation tracks (render-only)
  data/arenas.js      six procedural animated arenas + sponsor billboard slots
  engine/game.js      match controller: rounds, timer, hit resolution, KO cinematics
  engine/fighter.js   fighter entity: state machine, physics, attacks, specials
  engine/fighterState.js  registry of per-fighter simulation state (defaults, round reset, hashing)
  engine/moves.js     move archetypes: per-move shaping and per-frame ticks
  engine/ai.js        AI controller (difficulty × per-fighter personality)
  engine/input.js     keyboard + multi-touch → virtual gamepads; Controller contract
  engine/anim.js      keyframe sampling and the rest pose (render-only)
  engine/proportions.js  body clamping and the proportions pose pass
  engine/parts.js     render-only props and garments
  engine/drawFighter.js  procedural character rig, outfits, faces, photo heads, portraits
  engine/sprites.js   sprite-atlas renderer, dormant behind ?sprites
  engine/render.js    frame compositor (arena → shadows → fighters → projectiles → FX)
  engine/fx.js        particles, comic word popups, shake, hitstop, rings, flashes
  engine/audio.js     Web Audio SFX recipes + generative per-arena music loop
  ui/hud.js           health/energy/runway bars, timer, pips, announcements, combos, hints
  ui/screens.js       select / profile / challenges / leaderboard / help / modals
  ui/resultCard.js    social result-card renderer
  ui/tutorial.js      first-fight onboarding cards
  ui/faceDetect.js    on-device face detection for photo uploads
  net/online.js       live multiplayer: Supabase client loader, lobby, rooms, lockstep netcode (see below)
  net/cloud.js        profile sync, global leaderboard, report_match result reporting
  vendor/pico.js      vendored picojs face detector (MIT)
incubator/            character authoring tool (unlisted admin page)
lab/                  measurement and art harnesses (contrast, silhouettes, marketing shots)
test/                 node --test suites (npm test) + browser golden-image checks in test/golden/
docs/                 architecture, onboarding, auth setup, game math, design specs and plans
```

**Seed data** lives in [src/data/seed.js](src/data/seed.js) (leaderboard) and [src/data/fighters.js](src/data/fighters.js) (roster). Adding a fighter = one object in `FIGHTERS` (identity, palette `c`, `style`, `body`, `special` id and AI personality `ai`, plus optional `commandNormals` and render-only face, stance, motion and parts). The simulation reads `style`, not the legacy `stats` block, and `npm test` fails any roster entry that does not validate or is over the power budget. Adding an arena = one draw function + one entry in [src/data/arenas.js](src/data/arenas.js).

**Debug harness:** open with `?debug=1` to expose `window.UEC` (deterministic `step(seconds, dt)`, `setHP`, `setEnergy`, `setTimer`, `skipSplash`, `signInAs` to fake a signed-in user, `netPump` for live matches, and `input` for pad access), for driving the game from the console or a scripted browser. The committed tests run headless instead (see *Testing*). `?touch=1` forces touch pads on desktop.

## Online architecture (v1.1 — live and shipped)

Live matches run on **Supabase Realtime broadcast channels**: one ephemeral channel per room, plus a shared presence lobby for auto-pairing, and the room itself stores nothing. Presence powers the "your rival just joined" notification. Before the fight each client validates the other's character and refuses a peer on a different `SIM_VERSION`. Both clients then run the same deterministic 60 Hz simulation and exchange only input bitmasks (delay-based lockstep, `INPUT_DELAY` = 6 frames, about 100 ms). Packets go out about every 33 ms, under the realtime rate limits, carry a sliding window with peer-acknowledged re-anchoring so packet loss self-heals, and a state hash every 120 frames aborts cleanly on any desync. When both players are signed in, each client reports the result through the `report_match` RPC ([src/net/cloud.js](src/net/cloud.js)), and the global board only moves once both reports agree. The engine's `Controller` contract is what makes this small: human, AI, and network players are interchangeable (see [src/net/online.js](src/net/online.js)).

## Roadmap

- 🔮 **Prompt-generated fighters & arenas** — describe a character or a battleground in words and generate your own. (Teased in-app; the procedural rig + arena system are built to accept new definitions.)
- 🌍 Global leaderboard is live (signed-in players, confirmed live matches). Custom SMTP for email sign-ups at scale + Google app verification are the remaining launch-polish items.

## Built for scaling — prepared but not enabled yet

- **Tournaments & seasons.** Match results flow through one `recordMatch()` chokepoint — brackets and season resets hook there.
- **Sponsorships.** Arena billboards rotate through a data array (`SPONSORS` in arenas.js) — real partners are a one-line swap.
- **Cosmetics.** Fighters are palette-driven (`c` object) with parameterized outfits/hair/accessories — skins are data, not art files.
- **More fighters/abilities.** Moves are typed archetypes, 11 of them (`ARCHETYPES` in `src/data/schema.js`: strike, projectile, aoe, rush, grab, teleport, rain, counter, trap, stance, burn), each shaped in `src/engine/moves.js`, so new abilities reuse or extend that list.

## Testing

`npm test` runs the headless suite on Node's built-in test runner, with no framework and no DOM. It needs Node 21 or newer, because the script passes a quoted glob to `node --test`. The simulation runs without a browser, so the tests drive real matches: every move of every roster fighter is fired in a live `Game`, hostile animation data is checked for leaking into the simulation, and the challenge-link codec, power budget, player builds, AI, fighter-state registry and runway each have their own file. Pixel-level golden checks live in `test/golden/index.html`, served by `python3 dev-server.py 4173`; [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) covers both.

## Legal / originality

All characters, names, companies, art, and audio are original and generated procedurally in code. No Mortal Kombat or other franchise characters, artwork, names, sounds, or assets are used. Inspiration is limited to the general conventions of the classic side-view arcade fighter.

---

Built with ❤️ and an unreasonable quantity of screen shake.
