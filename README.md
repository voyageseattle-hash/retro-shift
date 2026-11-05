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
| Drive | W A S D / arrows | RT, LT, left stick |
| Drift (hold, release for a turbo) | Space | X / □ |
| Shift to RED | Left Shift, Q or 1 | LB / L1 |
| Shift to BLUE | Right Shift, E or 3 | RB / R1 |
| Back to BOTH (or press your lens again) | Both Shifts together, F or 2 | Y / △ |
| Look back / Reset | C / R | RS / View |
| Pause | Esc / P | Start |

On Windows, tapping Shift five times fast opens the Sticky Keys prompt. A browser game can't block it, but you can switch it off in Settings > Accessibility > Keyboard.

Touch controls appear on phones and tablets.

## Modes

- **Grand Prix**: the SIGNAL CUP and the STATIC CUP, five courses each, six racers, points for every place (10, 7, 5, 3, 2, 1). Trophies unlock cars and colours.
- **Single Race**: any course against five rivals.
- **Time Trial**: alone against your best ghost and the staff ghost, for bronze, silver and gold medals.
- **Mono Run**: never both worlds. You start in RED, the BOTH button swaps lenses, every swap costs SHIFT, and only shards and phasing refill it. Road that exists only in the overlap is opened to both lenses.

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
