// Shader patches for the world's materials:
// - the SHIFT WAVE: a lens change isn't a fade, it's a ring that sweeps out from the car. Inside the ring the
//   world is already the new lens; outside it's still the old one; the ring itself burns bright as it redraws.
// - WET ROADS: the road's dark glass shows a rippling reflection of the neon above it (game/reflect.js renders it).

import * as THREE from '../../vendor/three.js';

export const WAVE = {
  uWaveC: { value: new THREE.Vector3() },
  uWaveR: { value: 1e7 },
  uWaveEdge: { value: new THREE.Color(0, 0, 0) },
};

export const REFL = {
  uRefl: { value: null },
  uReflM: { value: new THREE.Matrix4() },
  uReflK: { value: 0 },
  uTime: { value: 0 },
};

// per: { uFrom, uTo } levels (0..1) either side of the ring, for this material's mask
// edge: whether this material burns along the ring (the lines do; glass and fills only switch)
export function patchWave(mat, per, edge = true) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    Object.assign(sh.uniforms, WAVE, per);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWaveP;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWaveP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWaveP;\nuniform vec3 uWaveC;\nuniform float uWaveR;\nuniform vec3 uWaveEdge;\nuniform float uFrom;\nuniform float uTo;')
      .replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
        {
          float wd = distance(vWaveP, uWaveC);
          float inside = 1.0 - smoothstep(uWaveR - 3.0, uWaveR, wd);
          float lv = mix(uFrom, uTo, inside);
          float edge = ${edge ? 'exp(-pow((wd - uWaveR) / 2.2, 2.0)) * max(uFrom, uTo)' : '0.0'};
          gl_FragColor.rgb += uWaveEdge * edge;
          gl_FragColor.a *= clamp(lv + edge * 0.6, 0.0, 1.0);
          if (gl_FragColor.a < 0.002) discard;
        }`,
      );
  };
  // (keyed with any earlier patch, so a wet+wave road never shares a program with a plain wave fill)
  const prevKey = mat.customProgramCacheKey.call(mat);
  mat.customProgramCacheKey = () => `${prevKey}|${edge ? 'wave' : 'wave0'}`;
  return mat;
}

export function patchWet(mat) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    Object.assign(sh.uniforms, REFL);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat4 uReflM;\nvarying vec4 vReflUv;\nvarying vec3 vWetP;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvec4 wp = modelMatrix * vec4(transformed, 1.0);\nvWetP = wp.xyz;\nvReflUv = uReflM * wp;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uRefl;\nuniform float uReflK;\nuniform float uTime;\nvarying vec4 vReflUv;\nvarying vec3 vWetP;')
      .replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
        if (uReflK > 0.0) {
          vec2 uv = vReflUv.xy / vReflUv.w;
          // a slow ripple, and streaks along the road like water on tarmac
          uv.x += sin(vWetP.z * 0.35 + uTime * 1.7) * 0.004 + sin(vWetP.x * 0.9 + uTime * 0.6) * 0.002;
          uv.y += sin(vWetP.x * 0.3 + uTime * 1.3) * 0.006;
          // strongest close to the car, gone by the middle distance, so busy streets don't double up
          float near = uReflK * (1.0 - smoothstep(25.0, 130.0, distance(vWetP, cameraPosition)));
          vec3 rc = texture2D(uRefl, uv).rgb;
          gl_FragColor.rgb += rc * near;
          gl_FragColor.a = max(gl_FragColor.a, min(1.0, dot(rc, vec3(0.33)) * near * 2.0));
        }`,
      );
  };
  mat.customProgramCacheKey = () => 'wet';
  return mat;
}
