# RETRO SHIFT: Dual World Racing

A neon wireframe racer through two overlapping worlds, made for **GitHub Game Off 2026**.

Race in **BOTH** worlds (red + blue), **RED only**, or **BLUE only**. Every piece of the course belongs to a world: shift and the track, its shortcuts and its obstacles change under you.

- **BOTH**: the safe lens. The worlds overlap, the shared road, every wall and every bridge are there, and your SHIFT bar refills, but the car is a step slower (95% top speed). The lens-only shortcuts and boost pads are hidden.
- **RED**: raw speed, with a 110% top speed and 115% acceleration but less grip. The blue world is gone completely and everything left glows red. Red shortcuts and hidden red boost pads appear. Drains SHIFT.
- **BLUE**: grip. The car holds 135% grip and drifts charge their turbo 60% faster. The red world is gone and blue-only routes appear. Drains SHIFT.

Shift into a wall in the last moment before it and you get a CLOSE PHASE: a boost and some SHIFT back.

## Two machines in one

Every craft is two vehicles locked together: the **BLADE**, a narrow red monowheel bike, docked in the channel of the **SKIMMER**, a wide blue hover deck. BOTH drives the pair. Shift to RED and the deck halves unlatch and fall away, leaving the Blade; shift to BLUE and the bike folds flat into the deck and a cover slides over it, leaving the Skimmer. Each form reads the road its own way:

- **The pair** (BOTH) takes a sloped drop as a small jump, and is too wide for a slit.
- **The Blade** (RED) is narrow and its wheel clings: it holds a drop or a crest and accelerates down it, fits through a **SLIT** (a wall with a gap only the bike fits), and rides a **WALL RUN** (a strip banked up into a wall that throws everyone else off). Water bogs it down.
- **The Skimmer** (BLUE) is wide and light: it skims water at full speed, and once it has really left the road at speed its pads carry it on a glide, over the far side of a drop or across a **GLIDE GAP** (a missing stretch of road everyone else drops into).

Overhead boards call each of these before you reach it (`DROP AHEAD · RED CLINGS · BLUE GLIDES`, `WALL RUN · RED CLINGS · OTHERS FALL`, ...). Core Circuit has a drop, a glide gap and a wall run; Grid City has a crest, water and the slit. A route only your form can take holds your lens for you, so a wall run doesn't drain SHIFT.

If the strip under you belongs to the world you shifted away from, it's gone. Grab white shards for SHIFT, and phase through walls for a little more.

It runs in any modern browser with WebGL. There is no build step: every line on screen, every engine and effect and all the music is generated live in code. The only recorded assets are the announcer's voice (`audio/voice/`, rendered offline with the open Kokoro TTS model) and the studio logo on the splash card (`assets/splash/`).

## Play

Open `index.html` through any static server, for example:

```sh
python3 -m http.server 4173
```

Then go to `http://localhost:4173`. `?track=core` (or any course id) jumps straight into a race.

## Controls

| Action | Keyboard | Gamepad |
| --- | --- | --- |
| Drive | W A S D / arrows | RT / R2 (or A / ✕), LT / L2, left stick |
| Drift (hold, release for a turbo) | Space | X / □ |
| Shift to RED | Left Shift, Q or 1 | LB / L1 |
| Shift to BLUE | Right Shift, E or 3 | RB / R1 |
| Back to BOTH (or press your lens again) | Both Shifts together, F or 2 | LB+RB / L1+R1, D-pad ▲ |
| Form move (LIFT, LANCE, BRACE) | Z or Left Ctrl | Y / △ |
| Fire your SEAM CHARGE | X | B / ○ |
| Horn (honk at a rival to taunt them) | H or V | LS / L3 |
| Look back / Reset | C / R | RS / R3, View / Share |
| Pause | Esc / P | Start / Options |

On Windows, tapping Shift five times fast opens the Sticky Keys prompt. A browser game can't block it, but you can switch it off in Settings > Accessibility > Keyboard.

Touch controls appear on phones and tablets.

## Hull, charges and moves

- **Hull**: a hit takes a share of your hull (the ten cells under SHIFT) instead of wrecking you; only a car with nothing left comes apart. A hull above 60% always survives one hit. It patches itself up after a few quiet seconds, faster in BOTH. The rails are bumpers that turn you along the road; falling off only happens at the planned holes.
- **SEAM CHARGES**: drive through a gate of red-and-blue prisms to roll one. LENS CELL (six seconds of free lens), EMP (stalls every car near you), FLIP (throws everyone else into the other world and holds them there), LIGHTSPEED (you become a beam of light that burns anyone crossing your trail), SEAM WALL (a block behind you, solid in your lens's world) and PATCH (half your hull back). The back of the field rolls the big ones. Not in Time Trial, Mono Run or online.
- **Form moves**: the Skimmer LIFTs and floats over what's in front of it, the Blade LANCEs through whoever's ahead, the pair BRACEs behind a shield that sends a ram back.
- **Launchers**: before a hole in one lens's road, the other lens has a ramp, there only for it, that throws you over.

## Modes

- **Grand Prix**: the SIGNAL CUP and the STATIC CUP, five courses each, six racers, points for every place (10, 7, 5, 3, 2, 1). Trophies unlock cars and colours.
- **SHIFT TOUR**: thirty events across the ten courses in five legs, and a finale, each with a twist: a lens switched off, a form route you have to take, a storm, the police, a rival to beat head to head, a speed you can't drop under, a quota of takedowns, drift turbos, chains, phases or PERFECT SHIFTs. Each pays up to three stars, and stars open the next leg, new paint and a second way to two of the cars.
- **Single Race**: any course against five rivals.
- **Time Trial**: alone against your best ghost and the staff ghost, for bronze, silver and gold medals.
- **Mono Run**: never both worlds. You start in RED, the BOTH button swaps lenses, every swap costs SHIFT, and only shards and phasing refill it. Road that exists only in the overlap is opened to both lenses.
- **LENS TAG**: a battle in the PRISM BOWL, alone against five CPUs or two players split-screen against four. No laps: one craft is IT and scores a point for every second it keeps the tag. IT is in plain sight only through its own lens (or to everyone while it sits in BOTH); through the other lens it isn't there at all, not even on the map. A hunter in BOTH sees IT's shimmer, a flickering beacon in IT's colour, from anywhere, but can't tag it and IT phases straight through them. So you look in BOTH and strike in a lens: touch IT in its lens to take the tag (a LANCE reaches further). IT drains SHIFT like anyone, runs a touch slower, and has a moment of safety after each tag. The last 20 seconds of the 2:30 round score double. Each lens has a hideout road only it can drive.
- **SHIFT SCHOOL**: seven short drills, one for each thing a course asks of you (the three forms, lens walls, a lens route, the slit, the glide gap, charges and the hull), each with bronze, silver and gold.

## 2 Player

Two players, one keyboard, split top and bottom. Each of you has your own lens: the walls and roads that are solid for you depend on your lens, not on your partner's, and each half of the screen draws the world through its own player's lens. The music follows the lens when you're both in the same one, and plays the full mix otherwise.

| | Steer / throttle | Red | Both | Blue | Drift | Reset |
|---|---|---|---|---|---|---|
| P1 (top) | WASD | Q | F | E | Space / Left Shift | R |
| P2 (bottom) | Arrows | , | . | / | Right Shift | Backspace |

## Online

Up to six racers. One player picks ONLINE → HOST A ROOM and shares the four-letter code; the others pick JOIN A ROOM. Empty grid places go to AI rivals, and anyone who drops out mid-race is handed to the AI. Built on Absurd Combat Racing's transport: WebRTC data channels brokered by [PeerJS](https://peerjs.com) (MIT, vendored in `vendor/peerjs.min.js`), STUN only by default; set `window.RETROSHIFT_ICE` to add a TURN relay. Each browser simulates its own craft and streams its state; the host runs the AI, relays everyone at 30 Hz, and owns the start and the shards. `?net=local` swaps WebRTC for a BroadcastChannel so several tabs of one browser can race each other (add `&netlag=80` to fake latency).

## Craft and the garage

Eight neon craft, faceted hulls that catch the red world on one flank and the blue on the other: VECTOR, SCANLINE and POLYGON from the start; CHROMA, RASTER and GLITCH unlocked by trophies and medals; and two secret drivers from the studio's other games: **DASH** from LAST LINE, surfing a pencil, and **GREAT WEDGE** from ABSURD COMBAT RACING, Captain Finn Razorback's shark truck. The garage sets each car's paint, trail and underglow. `?unlockall` unlocks everything for testing.

Staff ghosts live in `data/staff/` and are recorded by `node tools/make-staff.mjs` (the race AI driving each course alone).

## Storms

From Layered Grid on, every course has a storm over one of its hidden routes, and the bigger courses have two. A METEOR STORM rains down in the red world over a red-only route, and a LIGHTNING STORM strikes in the blue world over a blue-only one. A ring on the road marks each strike a second before it lands. A direct hit wrecks you, and a near miss spins you out. Shift to the other lens and the storm isn't there, but neither is the shortcut. Ride it out in the storm's lens and the shortcut is yours. Sit in BOTH and you get the storm and no shortcut. A sign before each storm says which world it's in.

## Road works and the quake

Two courses change as the race runs. On **Fractal Route** a road works crew sets up on a different stretch every lap (ROAD WORKS AHEAD moves with it): blue barriers shut the left lane, red cones and a red digger shut the right, and a blue tower crane swings its load across the slit left down the middle. Each piece belongs to one world, so RED opens the left lane and BLUE the right; in BOTH you thread the slit under the load. Barriers and the digger smash on a hard hit, cones knock over at a touch.

**Echo Ruins** comes apart in three acts, one per lap, on its fault zones. Lap 1 is the QUAKE: tremors rumble the camera, ripples run down the road, cracks spread across it and loose rock tumbles onto the track (blocks you can smash; red or blue, so the lens clears them). On lap 2 the volcanoes off the course go up: the cracks glow and lava breaks through in pools on the fault zones. Through RED or BOTH it drags you down and burns you out in a second; through BLUE it has cooled to crust, but so have the red routes. Lava bombs arc in from the craters onto anyone not in blue, with rings on the road where they'll land. When the leader starts lap 3 the PLATES SPLIT and the road itself changes, lines and all: the RIFT zone tilts up into a lip and tears open with the far plate dropped (hold speed and jump it; BLUE glides furthest), the PLATE DROP zone falls onto a lower road (RED clings down the step, everyone else flies), and the TILTED SLAB hinges up into a ramp with a cliff off its end (RED rides down the back, BLUE and BOTH fly). Both courses keep their hazards out of online races and the tutorial.

## Heavy traffic and the police chase

Grid City runs heavy traffic: wireframe cars, vans and trucks in two lanes at half race pace, each one in a single world. In BOTH the road is full; through a single lens the other world's traffic is a faint ghost you drive straight through, so you weave or you shift and lose that lens's shortcuts. Rear-end one flat out and both cars shatter; a glancing hit throws sparks and a horn. Rivals read the traffic like obstacles, pick lanes round it and brake behind it, and still get caught now and then. Traffic keeps off the grid, the walls, the gaps and the storm.

Void Field has a police chase: as you cross the line each lap, sirens come up behind you, a getaway coupe tears past with three cruisers on it, and the chase settles into the field ahead. Cruisers swerve to ram whoever's beside them and fire bursts of laser shots, each impact marked by closing rings a beat before it lands (a direct hit wrecks you, a near miss spins you out). The getaway driver shoots back, and a cruiser that takes too many hits comes apart and tumbles off the road. The whole chase is an overlap thing: it exists in BOTH only, so holding a single lens takes you straight through it, while that lens's missing bridges wait for you. It leaves the course off the open edge and is back next lap. A sign stands before each hazard, and neither runs online or in the first run.

## Wrecks and takedowns

Hit a wall or a block flat out and your car comes apart into its own neon lines. They tumble, bounce down the road and flicker out, the race drops into slow motion for a beat, and you're back on the road a second later. Ram a rival hard enough and it's a TAKEDOWN: their car breaks apart instead. Rivals wreck each other too. Blocks smash into pieces and come back twenty seconds later, and every scrape and bump throws sparks and tears a few lines off the car.

## Secret routes

Some roads only exist in one world. Grid City's BLUE ROOFTOPS rise out of the road when you look through the blue lens and are a row of buildings through the red. Deep in Shift Tunnels a blue iris hatch seals the SECRET BORE: shift to RED as you pass and it isn't there. Every coloured shortcut exists only through its lens, and the other world hides it: a billboard across its mouth and a row of buildings over the ground it runs across. Shift to the route's lens and the cover is gone. While you're on a road that only your lens can see, SHIFT doesn't drain, so finding a route is a reward, not a bar to ration.

## The ten courses

01 Core Circuit · 02 Layered Grid · 03 Shift Tunnels · 04 Orbital Loops · 05 Grid City · 06 Void Field · 07 Helix Ascent · 08 Fractal Route · 09 Shift Lattice · 10 Echo Ruins

## How it's built

- `js/world/shift.js`: the three lenses and world masks. The rule comes from LAST LINE's red/blue 3-D matinee: a thing drawn for one eye only is there only while that eye is looking.
- `js/world/track.js`: a closed main loop plus branch paths, each sample, wall, pad and shard tagged with the worlds it's solid in. The ground query is per racer and per lens.
- `js/vehicles/racer.js`: the driving model is Absurd Combat Racing's truck physics (throttle curve, drift and mini-turbos, grip, slope gravity, suspension), plus each form's width, cling, glide and water drag.
- `js/vehicles/forms.js`: the Blade and the Skimmer, how they dock and split, and the FORMS table. `js/world/formroutes.js`: the glide gaps, wall runs and slits.
- `js/vehicles/ai.js`: rivals read the road ahead in all three worlds and pick a lens, a lane and a fork.
- `js/core/audio.js`: synthesized synthwave split into a red band and a blue band; shifting drops the other band behind a filter.
- `js/core/input.js`, `js/core/renderer.js`, `js/game/camera.js`: carried over from Absurd Combat Racing.
- `vendor/three.js`: three.js r186 (MIT).
- `tools/`: offline helpers: the announcer and splash audio previews and the trailer's title cards and sound, all rendered from the game's own engine.

## Credits

- Announcer voice: Kokoro-82M (Apache-2.0), voice `am_fenrir`, pitched and processed for the vintage echo.
- three.js (MIT), PeerJS (MIT).

A Forbidden Fruit Productions game from Guy Stephens Productions.
