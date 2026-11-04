# RETRO SHIFT

A neon wireframe racer through two overlapping worlds, made for **GitHub Game Off 2026**.

Race in **BOTH** worlds (red + blue), **RED only**, or **BLUE only**. Every piece of the course belongs to a world: shift and the track, its shortcuts and its obstacles change under you.

- **BOTH**: the worlds overlap. Every road is there, and so is every wall. Your SHIFT bar refills.
- **RED**: blue roads, blue walls and blue shortcuts vanish. Drive straight through blue walls. Drains SHIFT.
- **BLUE**: red things vanish instead. Drains SHIFT.

If the strip under you belongs to the world you shifted away from, it's gone. Grab white shards for SHIFT, and phase through walls for a little more.

It runs in any modern browser with WebGL. There is no build step and nothing to download: every line, every sound and all the music is generated live.

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
| Drift (hold, release for a turbo) | Space / Shift | X / □ |
| Shift to RED | Q or 1 | LB / L1 |
| Shift to BLUE | E or 3 | RB / R1 |
| Back to BOTH (or press your lens again) | F or 2 | Y / △ |
| Look back / Reset | C / R | RS / View |
| Pause | Esc / P | Start |

Touch controls appear on phones and tablets.

## Modes

- **Grand Prix**: the SIGNAL CUP and the STATIC CUP, five courses each, six racers, points for every place (10, 7, 5, 3, 2, 1). Trophies unlock cars and colours.
- **Single Race**: any course against five rivals.
- **Time Trial**: alone against your best ghost and the staff ghost, for bronze, silver and gold medals.
- **Mono Run**: never both worlds. You start in RED, the BOTH button swaps lenses, every swap costs SHIFT, and only shards and phasing refill it. Road that exists only in the overlap is opened to both lenses.

## Wedges and the garage

Eight wireframe bodies: VECTOR, SCANLINE and POLYGON from the start; CHROMA, RASTER and GLITCH unlocked by trophies and medals; and two secret drivers from the studio's other games: **DASH** from LAST LINE, surfing a pencil, and **GREAT WEDGE** from ABSURD COMBAT RACING, Captain Finn Razorback's shark truck. The garage sets each car's paint, trail and underglow. `?unlockall` unlocks everything for testing.

Staff ghosts live in `data/staff/` and are recorded by `node tools/make-staff.mjs` (the race AI driving each course alone).

## The ten courses

01 Core Circuit · 02 Layered Grid · 03 Shift Tunnels · 04 Orbital Loops · 05 Grid City · 06 Void Field · 07 Helix Ascent · 08 Fractal Route · 09 Shift Lattice · 10 Echo Ruins

## How it's built

- `js/world/shift.js`: the three lenses and world masks. The rule comes from LAST LINE's red/blue 3-D matinee: a thing drawn for one eye only is there only while that eye is looking.
- `js/world/track.js`: a closed main loop plus branch paths, each sample, wall, pad and shard tagged with the worlds it's solid in. The ground query is per racer and per lens.
- `js/vehicles/racer.js`: the driving model is Absurd Combat Racing's truck physics (throttle curve, drift and mini-turbos, grip, slope gravity, suspension).
- `js/vehicles/ai.js`: rivals read the road ahead in all three worlds and pick a lens, a lane and a fork.
- `js/core/audio.js`: synthesized synthwave split into a red band and a blue band; shifting drops the other band behind a filter.
- `js/core/input.js`, `js/core/renderer.js`, `js/game/camera.js`: carried over from Absurd Combat Racing.
- `vendor/three.js`: three.js r186 (MIT).

A Forbidden Fruit Productions game from Guy Stephens Productions.
