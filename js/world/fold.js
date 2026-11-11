// THE FOLD: a course whose city bends. The ground past a crease curls up into the sky and comes back over your head,
// stands on end as a wall, or rolls like a wave, and each lens holds it in a different shape.
//
// Like the pipe and the corkscrew (warp.js), none of this is physics. To the engine the course lies flat: racers, the
// AI, ghosts, the minimap and every collision work in flat space. Only the picture is bent, and it's bent in one place:
// every material's vertex shader carries the world position through foldWarp() before the camera sees it, so the road,
// the scenery, the cars, their trails and the scrap of a wreck all bend together, and the camera is carried through
// the same bend (Fold.aim). A fold is a sheet bent without stretching, so driving it feels like driving the flat road.
//
// The bend is a profile along z (north, the way the start straight runs): a list of creases, each a stretch of the
// sheet with a constant curl. Flat stretches lie between them.
//
//   def.fold: { z: [lap 1, lap 2, ...], r }   where the crease starts on each lap, and the radius it curls with
//   (see shape() for what each lens does with it)

import * as THREE from '../../vendor/three.js';
import { RED, BLUE } from './shift.js';
import { damp, smoothstep, clamp } from '../core/util.js';

const SEGS = 9; // flat lead-in + up to four creases with the flats after them
const SLOTS = 4;

export const FOLD = {
  uFoldOn: { value: 0 },
  // per stretch of the profile: (z it starts at, its curl in rad/m, the sheet's angle where it starts, unused)
  uFoldS: { value: Array.from({ length: SEGS }, () => new THREE.Vector4(1e9, 0, 0, 0)) },
  // and where on the bent sheet it starts: (z, y)
  uFoldP: { value: Array.from({ length: SEGS }, () => new THREE.Vector2()) },
};
const OFF = { uFoldOn: { value: 0 }, uFoldS: FOLD.uFoldS, uFoldP: FOLD.uFoldP };

const PARS = `
uniform float uFoldOn;
uniform vec4 uFoldS[${SEGS}];
uniform vec2 uFoldP[${SEGS}];
vec3 foldWarp(vec3 p) {
  if (p.z <= uFoldS[0].x) return p;
  vec4 s = uFoldS[0];
  vec2 o = uFoldP[0];
  for (int i = 1; i < ${SEGS}; i++) {
    if (p.z >= uFoldS[i].x) { s = uFoldS[i]; o = uFoldP[i]; }
  }
  float d = p.z - s.x;
  float a = s.z + s.y * d;
  vec2 c = abs(s.y) < 1e-6 ? o + d * vec2(cos(s.z), sin(s.z)) : o + vec2(sin(a) - sin(s.z), cos(s.z) - cos(a)) / s.y;
  return vec3(p.x, c.y + p.y * cos(a), c.x - p.y * sin(a));
}
`;
// after three's own projection: the same again, through the fold
const PROJECT = `
if (uFoldOn > 0.5) {
  vec4 foldP = vec4(transformed, 1.0);
  #ifdef USE_BATCHING
    foldP = batchingMatrix * foldP;
  #endif
  #ifdef USE_INSTANCING
    foldP = instanceMatrix * foldP;
  #endif
  foldP = modelMatrix * foldP;
  foldP.xyz = foldWarp(foldP.xyz);
  mvPosition = viewMatrix * foldP;
  gl_Position = projectionMatrix * mvPosition;
}
`;
// (the cars' hull shader, bodies.js, projects by hand)
const HULL_LINE = 'vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);';
const HULL = `${HULL_LINE}
if (uFoldOn > 0.5) {
  vec4 foldP = modelMatrix * vec4(position, 1.0);
  foldP.xyz = foldWarp(foldP.xyz);
  mvPosition = viewMatrix * foldP;
}
`;

// Every material bends, on every course (off a fold course uFoldOn is 0 and the shader takes three's own projection).
// A material that mustn't bend, because it's drawn round the camera itself (the sky, the speed streaks), says so with
// userData.noFold before it's first drawn.
export function foldShader(shader) {
  const vs = shader.vertexShader;
  if (!vs || vs.includes('foldWarp')) return;
  const std = vs.includes('#include <project_vertex>');
  if (!std && !vs.includes(HULL_LINE)) return;
  Object.assign(shader.uniforms, this?.userData?.noFold ? OFF : FOLD);
  const withPars = vs.includes('#include <common>') ? vs.replace('#include <common>', `#include <common>\n${PARS}`) : vs.replace('void main', `${PARS}\nvoid main`);
  shader.vertexShader = std ? withPars.replace('#include <project_vertex>', `#include <project_vertex>\n${PROJECT}`) : withPars.replace(HULL_LINE, HULL);
}
THREE.Material.prototype.onBeforeCompile = foldShader;

// Leave these out of the fold (the sky and anything else laid out round the real camera).
export function exemptFold(root) {
  root.traverse((o) => {
    for (const m of [].concat(o.material || [])) m.userData.noFold = true;
  });
}

const _p = new THREE.Vector3();
const _l = new THREE.Vector3();
const _u = new THREE.Vector3();

const hinge = (z, len, ang) => ({ z, len, ang });

export function layFold(world, preview = false) {
  world.fold = world.def.fold ? new Fold(world, world.def.fold, preview) : null;
  // (the course map reaches it from the road: ui/minimap.js draws a folding course folded)
  world.main.fold = world.fold;
}

export class Fold {
  constructor(world, cfg, preview = false) {
    this.world = world;
    this.creases = [].concat(cfg.z);
    this.r = cfg.r ?? 80;
    // the city's ground, south end to north end (dreamcity.js lays it; BLUE rolls exactly this much into a ring)
    const zs = world.paths.flatMap((p) => [Math.min(...p.pz), Math.max(...p.pz)]);
    this.z0 = Math.floor((Math.min(...zs) - 130) / 80) * 80;
    this.z1 = Math.ceil((Math.max(...zs) + 110) / 80) * 80;
    this.t = 0;
    this.lap = 0; // the viewer's lap (the city is re-folded each lap)
    this.open = 1; // 0: the city lies flat (the fly-by before the start), 1: folded
    this.views = [];
    this.view = 0;
    this.cur = this.fresh();
    // (a course card's map shows the course as it races: folded)
    if (preview) this.cur = { h: this.shape(1, 0, 0), open: 1 };
    this.segS = Array.from({ length: SEGS }, () => [1e9, 0, 0]);
    this.segP = Array.from({ length: SEGS }, () => [0, 0]);
    this.set(this.cur);
  }

  fresh() {
    return { h: this.shape(1, 0, 0).map((h) => ({ ...h, ang: 0 })), open: 0 };
  }

  // The creases for a lens on a lap. Slot 0 is the main crease; the others are spare (flat).
  //   BOTH   THE FOLD: the city curls right over and comes back above the start, upside down
  //   RED    THE WALL: red stands the city on end
  //   BLUE   THE WHEEL: blue rolls the whole city into a ring, with the far end coming round to meet the near one
  // Each lap moves the crease, so what was floor on one lap is the curl or the ceiling on the next.
  shape(mode, lap) {
    const r = this.r;
    const z = this.creases[Math.min(lap, this.creases.length - 1)];
    const spare = Array.from({ length: SLOTS - 1 }, () => hinge(this.z1, 10, 0));
    if (mode === RED) return [hinge(z, (Math.PI / 2) * r, Math.PI / 2), ...spare];
    if (mode === BLUE) return [hinge(this.z0, this.z1 - this.z0, Math.PI * 2), ...spare];
    return [hinge(z, Math.PI * r, Math.PI), ...spare];
  }

  // Split-screen: each view keeps its own fold, eased toward its own player's lens.
  useView(k) {
    this.views[this.view] = this.cur;
    this.cur = this.views[k] ||= this.fresh();
    this.view = k;
    this.lap = this.laps?.[k] ?? this.lap;
    this.set(this.cur);
  }

  // Once a frame from the race: the city lies flat for the fly-by and folds as the lights count down; each player's
  // lap re-folds it for them.
  follow(race, dt) {
    this.open = race.state === 'intro' ? 0 : 1;
    this.laps = race.players.map((p) => clamp(p.lap, 0, race.laps - 1));
    this.lap = this.laps[this.view] ?? 0;
    this.cullT = (this.cullT ?? 0) - dt;
    if (this.cullT <= 0) {
      this.cullT = 1;
      this.uncull(race.scene);
    }
  }

  update(dt, t, mode) {
    this.t = t;
    const want = this.shape(mode, this.lap);
    const c = this.cur;
    c.open = damp(c.open, this.open, 0.9, dt);
    const k = smoothstep(0, 1, clamp(c.open * 1.05, 0, 1));
    for (let i = 0; i < SLOTS; i++) {
      const h = c.h[i];
      const w = want[i];
      // a crease that's flat can be anywhere: it takes its new place at once, then bends
      if (Math.abs(h.ang) < 1e-3) {
        h.z = w.z;
        h.len = w.len;
      } else {
        h.z = damp(h.z, w.z, 3.2, dt);
        h.len = damp(h.len, w.len, 3.2, dt);
      }
      h.ang = damp(h.ang, w.ang * k, 3.2, dt);
    }
    this.set(c);
  }

  // The profile from the creases: where each stretch starts on the bent sheet, and at what angle.
  set(c) {
    FOLD.uFoldOn.value = 1;
    // breakpoints: every crease's two ends, in order (creases may overlap while one eases out and another in:
    // their curls add)
    const cuts = [];
    for (const h of c.h) {
      if (Math.abs(h.ang) < 1e-5) continue;
      cuts.push([h.z, h.ang / h.len], [h.z + h.len, -h.ang / h.len]);
    }
    cuts.sort((a, b) => a[0] - b[0]);
    const S = this.segS;
    const P = this.segP;
    let z = (cuts[0]?.[0] ?? 1e8) - 1;
    let k = 0;
    let a = 0;
    let pz = z;
    let py = 0;
    let n = 0;
    S[n] = [z, 0, 0];
    P[n++] = [pz, py];
    for (const [cz, dk] of cuts) {
      // along the stretch that ends here
      const d = cz - z;
      if (Math.abs(k) < 1e-6) {
        pz += d * Math.cos(a);
        py += d * Math.sin(a);
      } else {
        const a1 = a + k * d;
        pz += (Math.sin(a1) - Math.sin(a)) / k;
        py += (Math.cos(a) - Math.cos(a1)) / k;
        a = a1;
      }
      z = cz;
      k += dk;
      if (Math.abs(k) < 1e-7) k = 0;
      S[n] = [z, k, a];
      P[n++] = [pz, py];
    }
    for (; n < SEGS; n++) S[n] = [1e9, 0, 0];
    this.n = cuts.length + 1;
    for (let i = 0; i < SEGS; i++) {
      FOLD.uFoldS.value[i].set(S[i][0], S[i][1], S[i][2], 0);
      FOLD.uFoldP.value[i].set(P[i][0], P[i][1]);
    }
  }

  // A flat-space point, bent (the same sum the shader does).
  warp(v, out = v) {
    const S = this.segS;
    if (v.z <= S[0][0]) return out.copy(v);
    let i = 0;
    for (let q = 1; q < SEGS; q++) if (v.z >= S[q][0]) i = q;
    const [z0, k, a0] = S[i];
    const [oz, oy] = this.segP[i];
    const d = v.z - z0;
    const a = a0 + k * d;
    const cz = Math.abs(k) < 1e-6 ? oz + d * Math.cos(a0) : oz + (Math.sin(a) - Math.sin(a0)) / k;
    const cy = Math.abs(k) < 1e-6 ? oy + d * Math.sin(a0) : oy + (Math.cos(a0) - Math.cos(a)) / k;
    const y = v.y;
    return out.set(v.x, cy + y * Math.cos(a), cz - y * Math.sin(a));
  }

  // Aim a camera that was placed in flat space (position and up set, looking at `look`): carried through the fold, so
  // the road it follows stays under it and the rest of the city swings round.
  aim(camera, look) {
    (camera.userData.flat ||= new THREE.Vector3()).copy(camera.position);
    _u.copy(camera.position).addScaledVector(camera.up, 1);
    this.warp(camera.position, _p);
    this.warp(_u, _u).sub(_p).normalize();
    this.warp(look, _l);
    camera.position.copy(_p);
    camera.up.copy(_u);
    camera.lookAt(_l);
  }

  // Nothing on a fold course can be culled by where it is in flat space: the camera isn't there.
  uncull(root) {
    root.traverse((o) => {
      o.frustumCulled = false;
    });
  }
}

// Called by every course's update: the fold's own state while its course is drawn, off for every other course.
export function runFold(world, dt, t, mode) {
  if (world.fold) world.fold.update(dt, t, mode);
  else FOLD.uFoldOn.value = 0;
}
