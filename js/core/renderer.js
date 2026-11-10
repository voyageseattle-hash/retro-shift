import { ACCESS } from './access.js';
import * as THREE from '../../vendor/three.js';

// Ported from Absurd Combat Racing (bloom + grade composer), retuned for neon wireframe.
// Final colour grade, per stage: saturation, contrast, a highlight tint and a shadow lift colour,
// plus vignette and film grain. Hits add chromatic aberration; lightning adds a flash.
export const GRADES = {
  neon: { sat: 1.22, contrast: 1.08, tint: [1, 1, 1], lift: [0.12, 0.02, 0.18], vignette: 0.38, wet: 0.55 },
  default: { sat: 1.08, contrast: 1.05, tint: [1, 1, 1], lift: [0.2, 0.1, 0.3], vignette: 0.32 },
  mesa: { sat: 1.1, contrast: 1.06, tint: [1.04, 0.99, 0.94], lift: [0.45, 0.12, 0.5], vignette: 0.34 },
  city: { sat: 1.12, contrast: 1.08, tint: [0.97, 0.98, 1.06], lift: [0.1, 0.15, 0.55], vignette: 0.4 },
  magma: { sat: 1.06, contrast: 1.1, tint: [1.06, 0.97, 0.9], lift: [0.5, 0.1, 0.05], vignette: 0.42 },
  scrapyard: { sat: 1.05, contrast: 1.07, tint: [1.03, 1, 0.97], lift: [0.05, 0.25, 0.35], vignette: 0.36 },
  crucible: { sat: 1.04, contrast: 1.12, tint: [1.07, 0.95, 0.88], lift: [0.55, 0.05, 0.02], vignette: 0.46 },
  island: { sat: 1.1, contrast: 1.04, tint: [0.98, 0.98, 1.05], lift: [0.25, 0.1, 0.55], vignette: 0.36 },
  lagoon: { sat: 1.12, contrast: 1.04, tint: [1.03, 1, 0.97], lift: [0.05, 0.3, 0.4], vignette: 0.28 },
  sky: { sat: 1.08, contrast: 1.03, tint: [1.04, 0.98, 0.98], lift: [0.35, 0.15, 0.5], vignette: 0.3 },
};

const GRADE_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uSat: { value: 1 },
    uContrast: { value: 1 },
    uTint: { value: new THREE.Vector3(1, 1, 1) },
    uLift: { value: new THREE.Vector3() },
    uVignette: { value: 0.3 },
    uAberr: { value: 0 },
    uFlash: { value: 0 },
    uTime: { value: 0 },
    uGrain: { value: 0.025 },
    uWet: { value: 0.0 },
    uStep: { value: 0.012 },
  },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uSat, uContrast, uVignette, uAberr, uFlash, uTime, uGrain, uWet, uStep;
    uniform vec3 uTint, uLift;
    varying vec2 vUv;
    void main() {
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);
      vec3 c;
      if (uAberr > 0.002) {
        vec2 off = d * uAberr * 0.025;
        c = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      } else c = texture2D(tDiffuse, vUv).rgb;
      // Wet road: dark pixels in the lower part of the frame pick up light smeared down from whatever bright thing
      // is above them, so every neon line drips a reflection onto the black asphalt.
      if (uWet > 0.0 && vUv.y < 0.62) {
        float base = dot(c, vec3(0.299, 0.587, 0.114));
        vec3 acc = vec3(0.0);
        for (int i = 1; i <= 9; i++) {
          vec2 o = vec2(sin(float(i) * 7.1 + uTime * 3.0) * 0.0015, float(i) * uStep);
          vec3 s = texture2D(tDiffuse, vUv + o).rgb;
          float b = max(0.0, max(s.r, max(s.g, s.b)) - 0.35);
          acc += s * b * exp(-float(i) * 0.28);
        }
        c += acc * uWet * (1.0 - smoothstep(0.05, 0.3, base)) * smoothstep(0.62, 0.4, vUv.y);
      }
      c = (c - 0.5) * uContrast + 0.5;
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, uSat);
      c += uLift * (1.0 - smoothstep(0.0, 0.45, l)) * 0.07;
      c *= mix(vec3(1.0), uTint, smoothstep(0.25, 1.0, l));
      c *= 1.0 - uVignette * smoothstep(0.12, 0.62, r2 * 1.5);
      c += uFlash * vec3(0.75, 0.85, 1.0);
      float n = fract(sin(dot(vUv * 1000.0 + uTime, vec2(12.9898, 78.233))) * 43758.5453);
      c += (n - 0.5) * uGrain;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

// Frees the GPU side of a scene graph: every geometry, material and the textures the materials hold. A texture
// flagged userData.shared (the car glow sprite) is kept, since the next scene uses the same one.
export function disposeTree(root) {
  const mats = new Set();
  root.traverse((o) => {
    o.geometry?.dispose();
    const m = o.material;
    if (m) for (const x of Array.isArray(m) ? m : [m]) mats.add(x);
  });
  const tex = (t) => t?.isTexture && !t.userData.shared && t.dispose();
  for (const m of mats) {
    tex(m.map);
    tex(m.alphaMap);
    if (m.uniforms) for (const u of Object.values(m.uniforms)) tex(u.value);
    m.dispose();
  }
}

const PRESETS = {
  high: { pixelRatio: 1.75, shadows: 0, bloom: true, fx: 1 },
  medium: { pixelRatio: 1.1, shadows: 0, bloom: true, fx: 0.7 },
  low: { pixelRatio: 0.75, shadows: 0, bloom: true, fx: 0.45 },
};

export class Renderer {
  constructor(container) {
    const r = (this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
    }));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NoToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(r.domElement);
    // A scene can draw itself in several passes (the Escher room, world/rooms.js): every path below ends in a
    // renderer.render, so that's where it takes over.
    const raw = r.render.bind(r);
    let inMulti = false;
    r.render = (scene, camera) => {
      const multi = scene.userData?.multiRender;
      if (!multi || inMulti) return raw(scene, camera);
      inMulti = true;
      try {
        multi(raw, r, camera);
      } finally {
        inMulti = false;
      }
    };

    this.composer = new THREE.EffectComposer(r);
    this.renderPass = new THREE.RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    this.bloom = new THREE.UnrealBloomPass(new THREE.Vector2(256, 256), 0.8, 0.35, 0.3);
    this.output = new THREE.OutputPass();
    this.grade = new THREE.ShaderPass(GRADE_SHADER);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.output);
    this.composer.addPass(this.grade);
    this.gradeState = { id: 'default', aberr: 0, flash: 0 };

    // Mirror mode (the MIRRORBALL magic code): the scene pass renders through a left-right flipped
    // projection, so triangle winding flips with it. three.js only accounts for mirrored objects,
    // so front-face selection is inverted at the GL call while a mirrored view draws.
    this.mirror = false;
    this.flipWinding = false;
    const gl = r.getContext();
    const frontFace = gl.frontFace.bind(gl);
    gl.frontFace = (mode) => frontFace(this.flipWinding ? (mode === gl.CW ? gl.CCW : gl.CW) : mode);
    const scenePass = this.renderPass.render.bind(this.renderPass);
    this.renderPass.render = (...args) => this.mirrored(this.renderPass.camera, () => scenePass(...args));

    this.pmrem = new THREE.PMREMGenerator(r);
    this.quality = 'high';
    this.autoQuality = true;
    this.frameTimes = [];
    this.lowFpsTime = 0;
    this.width = 1;
    this.height = 1;
    this.onResize = [];
    window.addEventListener('resize', () => this.resize());
    this.setQuality(this.detectQuality());
  }

  detectQuality() {
    const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && window.innerWidth < 1100);
    return mobile ? 'medium' : 'high';
  }

  setQuality(q) {
    this.quality = q;
    const p = PRESETS[q];
    this.preset = p;
    this.renderer.shadowMap.enabled = p.shadows > 0;
    this.resize();
    for (const fn of this.onResize) fn();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.width = w;
    this.height = h;
    const pr = Math.min(window.devicePixelRatio || 1, this.preset.pixelRatio);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    for (const fn of this.onResize) fn();
  }

  environmentFrom(scene) {
    const rt = this.pmrem.fromScene(scene, 0, 0.1, 2000);
    return rt.texture;
  }

  // Grade for the next frame: a stage id from GRADES plus hit aberration and flash (0..1).
  setGrade(id, aberr = 0, flash = 0) {
    const g = this.gradeState;
    g.id = id;
    // (reduced flashing: hits and lightning only tint the screen)
    g.aberr = ACCESS.calm ? aberr * 0.25 : aberr;
    g.flash = ACCESS.calm ? flash * 0.15 : flash;
  }
  splitComposer(w, h) {
    const pr = this.renderer.getPixelRatio();
    if (!this.composer2) {
      const C = (this.composer2 = new THREE.EffectComposer(this.renderer));
      this.renderPass2 = new THREE.RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
      this.bloom2 = new THREE.UnrealBloomPass(new THREE.Vector2(256, 256), 0.8, 0.35, 0.3);
      this.grade2 = new THREE.ShaderPass(GRADE_SHADER);
      C.addPass(this.renderPass2);
      C.addPass(this.bloom2);
      C.addPass(new THREE.OutputPass());
      C.addPass(this.grade2);
    }
    const key = `${Math.round(w)}x${Math.round(h)}@${pr}`;
    if (this.composer2Key !== key) {
      this.composer2Key = key;
      this.composer2.setPixelRatio(pr);
      this.composer2.setSize(w, h);
    }
    return this.composer2;
  }

  applyGrade(pass = this.grade) {
    const g = this.gradeState;
    const G = GRADES[g.id] || GRADES.default;
    const u = pass.uniforms;
    u.uSat.value = G.sat;
    u.uContrast.value = G.contrast;
    u.uTint.value.set(...G.tint);
    u.uLift.value.set(...G.lift);
    u.uVignette.value = G.vignette;
    u.uAberr.value = g.aberr;
    u.uFlash.value = g.flash * 0.18;
    u.uTime.value = (performance.now() * 0.001) % 100;
    // Grain only where there are enough pixels for it to read as texture.
    u.uGrain.value = this.quality === 'high' ? 0.022 : 0.012;
    u.uWet.value = this.preset.fx * (G.wet ?? 0) * (this.mirror ? 0 : 1);
  }

  // Runs draw() with the camera flipped left-right when mirror mode is on.
  mirrored(camera, draw) {
    if (!this.mirror) return draw();
    const pm = camera.projectionMatrix;
    pm.elements[0] *= -1;
    camera.projectionMatrixInverse.copy(pm).invert();
    this.flipWinding = true;
    this.renderer.resetState();
    try {
      draw();
    } finally {
      pm.elements[0] *= -1;
      camera.projectionMatrixInverse.copy(pm).invert();
      this.flipWinding = false;
      this.renderer.resetState();
    }
  }

  // views: [{ camera, x, y, w, h }] in 0..1 screen fractions.
  render(scene, views, bloomStrength = 0.75) {
    const r = this.renderer;
    if (views.length === 1 && this.preset.bloom) {
      this.renderPass.scene = scene;
      this.renderPass.camera = views[0].camera;
      // Kept a little under each stage's nominal strength: neon reads better without the haze.
      this.bloom.strength = bloomStrength * 1.15;
      this.applyGrade();
      this.composer.render();
      return;
    }
    const W = this.width;
    const H = this.height;
    // split-screen keeps the bloom: a second composer sized to one view draws each half in turn
    if (views.length > 1 && this.preset.bloom) {
      const vw = views[0].w * W;
      const vh = views[0].h * H;
      const C = this.splitComposer(vw, vh);
      this.bloom2.strength = bloomStrength * 1.15;
      r.setScissorTest(true);
      for (const v of views) {
        v.before?.();
        const x = v.x * W, y = v.y * H, w = v.w * W, h = v.h * H;
        this.renderPass2.scene = scene;
        this.renderPass2.camera = v.camera;
        this.applyGrade(this.grade2);
        r.setViewport(x, y, w, h);
        r.setScissor(x, y, w, h);
        C.render();
      }
      r.setScissorTest(false);
      r.setViewport(0, 0, W, H);
      return;
    }
    r.setScissorTest(views.length > 1);
    for (const v of views) {
      v.before?.();
      const x = v.x * W;
      const y = v.y * H;
      const w = v.w * W;
      const h = v.h * H;
      r.setViewport(x, y, w, h);
      r.setScissor(x, y, w, h);
      this.mirrored(v.camera, () => r.render(scene, v.camera));
    }
    r.setScissorTest(false);
    r.setViewport(0, 0, W, H);
  }

  // Drops quality if the frame rate stays low, so slower machines stay playable.
  trackFrame(dt) {
    if (!this.autoQuality) return;
    if (dt > 0.05) this.lowFpsTime += dt;
    else this.lowFpsTime = Math.max(0, this.lowFpsTime - dt * 0.5);
    if (this.lowFpsTime > 3) {
      this.lowFpsTime = 0;
      if (this.quality === 'high') this.setQuality('medium');
      else if (this.quality === 'medium') this.setQuality('low');
    }
  }
}
