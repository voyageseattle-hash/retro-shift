// DREAM FOLD's road finish: creased foil. The road's dark glass is a sheet of iridescent paper that has been folded
// flat and opened out again, so it's cut into triangles by its creases and every triangle catches the light at its
// own angle. The colour of each runs with the angle you see it at, like a film of oil: look along the road and bands
// of it gather toward the horizon, and where the city curls up the bands run up the curl.
//
// It keeps to the lens. With both worlds open the foil runs red, through pink, to blue. Through a single lens
// it is only that lens's colour, running from deep to hot.

import * as THREE from '../../vendor/three.js';

const PALETTE = {
  both: [0xff2a4a, 0xff4fd8, 0x1e8cff],
  red: [0xff2a4a, 0xff7a86, 0x7a0a1e],
  blue: [0x1e8cff, 0x6ac8ff, 0x0a2c9c],
};
const P = Object.fromEntries(Object.entries(PALETTE).map(([k, v]) => [k, v.map((h) => new THREE.Color(h))]));

const PARS_V = 'varying vec3 vFoilV;\nvarying vec3 vFoilW;';
const PARS_F = `
varying vec3 vFoilV;
varying vec3 vFoilW;
uniform vec3 uFoilA;
uniform vec3 uFoilB;
uniform vec3 uFoilC;
uniform float uFoilT;
`;
const FOIL = `
{
  // the sheet's own facing, from how it lies on screen (so it's right wherever the fold has carried it)
  vec3 fn = normalize(cross(dFdx(vFoilV), dFdy(vFoilV)));
  float dist = length(vFoilV);
  float facing = abs(dot(fn, vFoilV / dist));
  // the creases: squares cut corner to corner, the cut leaning the other way on the next square
  vec2 g = vFoilW.xz / 2.8;
  vec2 cell = floor(g);
  vec2 f = fract(g);
  float lean = mod(cell.x + cell.y, 2.0);
  float d = lean > 0.5 ? f.y - f.x : f.x + f.y - 1.0;
  float side = step(0.0, d);
  vec3 hq = fract(vec3(cell.xyx + side * 0.37) * 0.1031);
  hq += dot(hq, hq.yzx + 33.33);
  float tip = fract((hq.x + hq.y) * hq.z);
  // (far off the triangles are smaller than a pixel: there the foil is one smooth sheet)
  float near = 1.0 - smoothstep(45.0, 150.0, dist);
  tip = mix(0.5, tip, near);
  float ph = fract(facing * 2.2 + tip * 1.2 + vFoilW.z * 0.0035 + uFoilT * 0.025);
  vec3 foil = ph < 0.3333 ? mix(uFoilA, uFoilB, ph * 3.0) : ph < 0.6667 ? mix(uFoilB, uFoilC, ph * 3.0 - 1.0) : mix(uFoilC, uFoilA, ph * 3.0 - 2.0);
  // brightest seen edge-on, like any film; most triangles lie dark and one in a few catches the light
  float sheen = 0.04 + 0.15 * pow(1.0 - facing, 2.0);
  float lit = fract(tip * 7.31);
  sheen *= mix(0.3, 0.05 + 4.6 * lit * lit * lit * lit, near);
  // and a glint along each crease, close to
  float edge = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
  edge = min(edge, abs(d) * 0.7071);
  float crease = (1.0 - smoothstep(0.0, 0.035, edge)) * near * 0.06;
  gl_FragColor.rgb += foil * (sheen + crease);
}
`;

// Finish every road surface of this course in foil. `lens` is the sky's view state (dreamsky.js).
export function foilRoads(world, L, lens) {
  const U = {
    uFoilA: { value: new THREE.Color() },
    uFoilB: { value: new THREE.Color() },
    uFoilC: { value: new THREE.Color() },
    uFoilT: { value: 0 },
  };
  const patch = (m) => {
    const mat = m.road;
    if (mat.userData.foil) return m;
    mat.userData.foil = true;
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh, r) => {
      prev?.call(mat, sh, r);
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>\n${PARS_V}`)
        // (after the fold has had its say on where the vertex is: fold.js)
        .replace('#include <fog_vertex>', 'vFoilV = mvPosition.xyz;\nvFoilW = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#include <fog_vertex>');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${PARS_F}`).replace('#include <opaque_fragment>', `#include <opaque_fragment>\n${FOIL}`);
    };
    const key = mat.customProgramCacheKey;
    mat.customProgramCacheKey = () => `${key.call(mat)}|foil`;
    return m;
  };
  for (const m of L.mats.values()) patch(m);
  const make = L.materials.bind(L);
  L.materials = (mask) => patch(make(mask));

  const set = (u, i) => {
    const both = Math.max(0, 1 - lens.red - lens.blue);
    u.value.setRGB(0, 0, 0);
    for (const [k, w] of [['both', both], ['red', lens.red], ['blue', lens.blue]]) {
      u.value.r += P[k][i].r * w;
      u.value.g += P[k][i].g * w;
      u.value.b += P[k][i].b * w;
    }
  };
  const view = () => {
    set(U.uFoilA, 0);
    set(U.uFoilB, 1);
    set(U.uFoilC, 2);
  };
  view();
  lens.onView.push(view);
  world.animated.push((t) => {
    U.uFoilT.value = t;
  });
}
