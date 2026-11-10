// THE ESCHER ROOM: a course whose stairs run on the floor, the walls and the ceiling of one big room, each with its own
// "down", joined by portals.
//
// Physics never leaves the flat world: the course is an ordinary loop of road, cut into CELLS (convex prisms in x/z, one
// per stair). Each cell is drawn turned into its place in the room by its own rigid transform T (physics -> room), so
// the stair under you is always flat and every other stair hangs off a wall or the ceiling around you, cars and all.
// Where the road crosses from one cell into the next there's a PORTAL: through it you see the next stair carrying on
// as the road does (the physics is continuous there), and once your camera passes through, the whole room turns round
// you. Lens-only roads cross through lens-only portals, shut in the other lens.
//
// Drawing (render): the scene is drawn once per cell, through a camera moved by T_j^-1 T_c (c: the camera's cell) and
// clipped to cell j's prism, so each stair (and everything on it: cars, sparks, trails) lands on its wall. Each
// portal in view is drawn first: the cell behind it, untransformed, clipped to the portal's opening; then a depth-only
// pane in the opening keeps the room behind it from drawing over the view.
//
//   def.room = { size, cells: [{ poly: [[x, z], ...], up: [x, y, z], right: [x, y, z], radial: [x, z], at: [x, y, z],
//                name }] }
//   up: the room direction physics up turns to (the wall's inward normal); radial: a physics direction, turned to
//   `right`; at: where in the room the cell's centre (on the floor plane) goes. A cell without `up` floats where `at`
//   puts it (the middle of the room), turned by `tilt` ([x, y, z] Euler angles).

import * as THREE from '../../vendor/three.js';
import { M, COLORS, solidIn, colorForMask } from './shift.js';

const PLANES = 12; // every pass uses this many clipping planes (unused ones never clip), so shaders compile once
const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _sphere = new THREE.Sphere();
const _frustum = new THREE.Frustum();
const _pm = new THREE.Matrix4();

const plane = (nx, ny, nz, px, py, pz) => {
  const n = new THREE.Vector3(nx, ny, nz).normalize();
  return new THREE.Plane(n, -(n.x * px + n.y * py + n.z * pz));
};
const never = () => new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e8);

export class Room {
  constructor(world) {
    this.world = world;
    const def = world.def.room;
    this.size = def.size ?? 640;
    this.cells = def.cells.map((c, k) => this.makeCell(c, k));
    this.findPortals();
    // every batched piece goes in with the cell it's in (or, near a cell's edge, with all of them)
    world.layers.auto = (p) => {
      const c = this.cellAt(p.x, p.z);
      return this.inside(c, p.x, p.z) < 30 ? -1 : c.k;
    };
    this.pool = Array.from({ length: PLANES }, never);
    this.cams = [new THREE.PerspectiveCamera(), new THREE.PerspectiveCamera()];
    for (const c of this.cams) c.matrixAutoUpdate = c.matrixWorldAutoUpdate = false;
    this.occScene = new THREE.Scene();
    this.occMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true, side: THREE.DoubleSide });
  }

  // ------------------------------------------------------------------ cells
  makeCell(c, k) {
    const poly = c.poly;
    let cx = 0;
    let cz = 0;
    for (const [x, z] of poly) {
      cx += x / poly.length;
      cz += z / poly.length;
    }
    // inward-facing vertical planes, one per edge
    const planes = [];
    for (let i = 0; i < poly.length; i++) {
      const [ax, az] = poly[i];
      const [bx, bz] = poly[(i + 1) % poly.length];
      let nx = -(bz - az);
      let nz = bx - ax;
      if (nx * (cx - ax) + nz * (cz - az) < 0) {
        nx = -nx;
        nz = -nz;
      }
      planes.push(plane(nx, 0, nz, ax, 0, az));
    }
    const floorY = this.world.floorY ?? 0;
    // (origin: [x, z, y], the point that goes to `at`, where it isn't the cell's centre on the floor)
    const O = c.origin ? new THREE.Vector3(c.origin[0], c.origin[2], c.origin[1]) : new THREE.Vector3(cx, c.centreY ?? floorY, cz);
    // physics basis at the cell: up, and the radial direction (horizontal)
    const rad = new THREE.Vector3(c.radial?.[0] ?? cx, 0, c.radial?.[1] ?? cz).normalize();
    const pUp = new THREE.Vector3(0, 1, 0);
    const pSide = new THREE.Vector3().crossVectors(rad, pUp);
    const R = new THREE.Matrix4();
    if (c.up) {
      const up = new THREE.Vector3(...c.up).normalize();
      const right = new THREE.Vector3(...c.right).normalize();
      const side = new THREE.Vector3().crossVectors(right, up);
      const B = new THREE.Matrix4().makeBasis(right, up, side);
      const A = new THREE.Matrix4().makeBasis(rad, pUp, pSide);
      R.multiplyMatrices(B, A.transpose());
    } else R.makeRotationFromEuler(new THREE.Euler(...(c.tilt || [0, 0, 0])));
    const at = new THREE.Vector3(...(c.at || [0, 0, 0]));
    // T = translate(at) * R * translate(-O)
    const T = new THREE.Matrix4().makeTranslation(at.x, at.y, at.z).multiply(R).multiply(new THREE.Matrix4().makeTranslation(-O.x, -O.y, -O.z));
    const Ti = T.clone().invert();
    const rot = new THREE.Quaternion().setFromRotationMatrix(R);
    return { k, poly, planes, centre: new THREE.Vector2(cx, cz), T, Ti, rot, name: c.name || `CELL ${k}`, def: c };
  }

  // How far inside cell `c` (x, z) is: negative outside.
  inside(c, x, z) {
    let d = Infinity;
    for (const p of c.planes) d = Math.min(d, p.normal.x * x + p.normal.z * z + p.constant);
    return d;
  }
  // The cell (x, z) is in, or the one it's nearest to.
  cellAt(x, z) {
    let best = this.cells[0];
    let bd = -Infinity;
    for (const c of this.cells) {
      const d = this.inside(c, x, z);
      if (d > bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  }
  // The cell a stretch of road starting at sample i is batched under, or -1 near a cell's edge (the piece is drawn
  // with every cell there, and each one's clipping keeps its own side).
  regionOf(path, i) {
    const j = path.wrap(i + 1);
    const a = this.cellAt(path.px[i], path.pz[i]);
    const b = this.cellAt(path.px[j], path.pz[j]);
    if (a !== b || this.inside(a, path.px[i], path.pz[i]) < path.halfW + 6 || this.inside(a, path.px[j], path.pz[j]) < path.halfW + 6) return -1;
    return a.k;
  }

  // ------------------------------------------------------------------ portals
  // Wherever a road crosses from one cell into another: a hexagonal door in the plane between them.
  findPortals() {
    this.portals = [];
    for (const path of this.world.paths) {
      const last = path.closed ? path.N : path.N - 1;
      for (let i = 0; i < last; i++) {
        const j = path.wrap(i + 1);
        const a = this.cellAt(path.px[i], path.pz[i]);
        const b = this.cellAt(path.px[j], path.pz[j]);
        if (a === b) continue;
        // the plane of a that j is outside of
        let pl = a.planes[0];
        let worst = Infinity;
        for (const p of a.planes) {
          const d = p.normal.x * path.px[j] + p.normal.z * path.pz[j] + p.constant;
          if (d < worst) {
            worst = d;
            pl = p;
          }
        }
        const da = pl.normal.x * path.px[i] + pl.normal.z * path.pz[i] + pl.constant;
        const t = da / (da - worst);
        const C = new THREE.Vector3(path.px[i] + (path.px[j] - path.px[i]) * t, path.py[i] + (path.py[j] - path.py[i]) * t, path.pz[i] + (path.pz[j] - path.pz[i]) * t);
        const n = pl.normal.clone().negate(); // from a into b
        const r = path.halfW * 1.6 + 1;
        const lift = r * 0.32;
        C.y += lift;
        // in the plane: across (horizontal) and up
        const u = new THREE.Vector3(-n.z, 0, n.x).normalize();
        const verts = [];
        for (let q = 0; q < 6; q++) {
          const ang = (q / 6) * Math.PI * 2;
          verts.push(C.clone().addScaledVector(u, Math.cos(ang) * r).add(_v.set(0, Math.sin(ang) * r, 0)));
        }
        const mask = path.mask[i] || path.mask[j] || M.ALL;
        this.portals.push({ a: a.k, b: b.k, path, i, C, n, u, r, verts, mask, plane: new THREE.Plane().setFromNormalAndCoplanarPoint(n, C) });
      }
    }
  }

  // Each portal's frame, a sign before each one on the main road, and its depth pane.
  build(addSign) {
    const L = this.world.layers;
    const prev = L.region;
    L.region = -1;
    for (const p of this.portals) {
      const col = p.mask === M.ALL ? COLORS.pink : colorForMask(p.mask);
      const ring = (r, k) => p.verts.map((v) => p.C.clone().add(v.clone().sub(p.C).multiplyScalar(r / p.r)).addScaledVector(p.n, k));
      // a thick hexagonal frame, two deep, with struts between, and a ribbon across its face
      for (const k of [-0.8, 0.8]) {
        const A = ring(p.r, k);
        const B = ring(p.r + 1.6, k);
        for (let q = 0; q < 6; q++) {
          const q1 = (q + 1) % 6;
          L.line(p.mask, A[q], A[q1], col);
          L.line(p.mask, B[q], B[q1], col);
          L.quad(p.mask, A[q], A[q1], B[q1], B[q], col, 0.55);
          L.line(p.mask, A[q], B[q], col);
        }
      }
      const F = ring(p.r + 1.6, -0.8);
      const K = ring(p.r + 1.6, 0.8);
      for (let q = 0; q < 6; q++) L.line(p.mask, F[q], K[q], col);
      // an inner shimmer ring
      const I = ring(p.r - 0.6, 0);
      for (let q = 0; q < 6; q++) L.line(p.mask, I[q], I[(q + 1) % 6], 0xffffff);
      // the depth pane
      const g = new THREE.BufferGeometry();
      const pos = [];
      for (let q = 0; q < 6; q++) pos.push(...p.C.toArray(), ...p.verts[q].toArray(), ...p.verts[(q + 1) % 6].toArray());
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      p.pane = new THREE.Mesh(g, this.occMat);
      p.pane.visible = false;
      this.occScene.add(p.pane);
      if (addSign && p.path === this.world.main) {
        const to = this.cells[p.b];
        addSign(this.world, p.path, p.i - Math.round(70 / p.path.ds), 0, 'PORTAL', `GRAVITY TURNS · ${to.name}`, M.ALL);
      }
    }
    L.region = prev;
  }

  // ------------------------------------------------------------------ drawing
  // The scene's other pieces the room needs: the sky (env, turned with the room) and the room's own frame.
  attach(scene, env, frame) {
    this.scene = scene;
    this.env = env;
    this.frame = frame;
    // the course's own pieces outside the batches (shards, blocks, boards): each is drawn only with its cell
    this.pieces = this.world.group.children.filter((o) => o !== this.world.layers.group).map((o) => [o, this.tagAt(o.position)]);
    scene.userData.multiRender = (raw, renderer, camera) => this.render(raw, renderer, camera);
  }

  planes(list) {
    const out = this.pool;
    this.nevers ||= Array.from({ length: PLANES }, never);
    for (let k = 0; k < PLANES; k++) out[k] = list[k] ?? this.nevers[k];
    return out;
  }

  setCam(dst, camera, M) {
    dst.matrixWorld.multiplyMatrices(M, camera.matrixWorld);
    dst.matrixWorldInverse.copy(dst.matrixWorld).invert();
    dst.projectionMatrix.copy(camera.projectionMatrix);
    dst.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    dst.near = camera.near;
    dst.far = camera.far;
    return dst;
  }

  // The cell a thing at p belongs to, or -1 where it's near enough a cell's edge to show on both sides (or at the
  // origin: a buffer of world-space lines, like the trails and sparks).
  tagAt(p) {
    if (p.x === 0 && p.y === 0 && p.z === 0) return -1;
    const c = this.cellAt(p.x, p.z);
    return this.inside(c, p.x, p.z) < 25 ? -1 : c.k;
  }

  // Which pieces of the course draw in a pass for cell k (-1: the frame and sky only).
  show(k, what) {
    const S = this.scene;
    const W = this.world.group;
    const ok = (t) => t < 0 || t === k;
    for (let q = 0; q < S.children.length; q++) {
      const o = S.children[q];
      if (o === this.env.group) o.visible = what === 'sky';
      else if (o === this.frame) o.visible = what === 'frame';
      else o.visible = what === 'world' && this.vis[q] && (o === W || ok(this.tagAt(o.position)));
    }
    if (what !== 'world') return;
    for (const o of this.world.layers.group.children) o.visible = o.userData.region == null || ok(o.userData.region);
    for (const [o, t] of this.pieces) o.visible = this.pvis.get(o) && ok(t);
  }

  render(raw, renderer, camera) {
    const S = this.scene;
    const vis = (this.vis = S.children.map((o) => o.visible));
    const lvis = this.world.layers.group.children.map((o) => o.visible);
    this.pvis ||= new Map();
    for (const [o] of this.pieces) this.pvis.set(o, o.visible);
    const bg = S.background;
    const autoClear = renderer.autoClear;
    const clip = renderer.clippingPlanes;
    if (autoClear) renderer.clear();
    renderer.autoClear = false;
    const E = camera.position;
    const cc = this.cellAt(E.x, E.z);
    const mode = this.world.layers.mode ?? 7;
    const C1 = this.cams[0];
    try {
      // the sky, turned with the room
      _m.makeTranslation(E.x, E.y, E.z).multiply(_m2.makeRotationFromQuaternion(cc.rot)).multiply(new THREE.Matrix4().makeTranslation(-E.x, -E.y, -E.z));
      this.show(-1, 'sky');
      renderer.clippingPlanes = this.planes([]);
      raw(S, this.setCam(C1, camera, _m));
      S.background = null;
      S.matrixWorldAutoUpdate = false;
      // the portals in view
      _pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      _frustum.setFromProjectionMatrix(_pm);
      for (const p of this.portals) {
        if (p.a !== cc.k && p.b !== cc.k) continue;
        const other = this.cells[p.a === cc.k ? p.b : p.a];
        // which way the camera faces it: it has to be on this cell's side
        const into = p.a === cc.k ? 1 : -1;
        if (into * p.plane.distanceToPoint(E) > -0.05) continue;
        if (p.C.distanceToSquared(E) > 900 * 900) continue;
        if (!solidIn(p.mask, mode)) continue;
        if (!_frustum.intersectsSphere(_sphere.set(p.C, p.r + 2))) continue;
        // the opening, as planes through the eye and each edge of the hexagon
        const open = [];
        for (let q = 0; q < 6; q++) {
          const a = p.verts[q];
          const b = p.verts[(q + 1) % 6];
          const pl = new THREE.Plane().setFromCoplanarPoints(E, a, b);
          if (pl.distanceToPoint(p.C) < 0) pl.negate();
          open.push(pl);
        }
        // the sky as it is from the other cell
        _m.makeTranslation(E.x, E.y, E.z).multiply(_m2.makeRotationFromQuaternion(other.rot)).multiply(new THREE.Matrix4().makeTranslation(-E.x, -E.y, -E.z));
        this.show(-1, 'sky');
        renderer.clippingPlanes = this.planes(open.map((pl) => pl.clone().applyMatrix4(_m)));
        raw(S, this.setCam(C1, camera, _m));
        // the next stair, carrying straight on, in the opening only
        this.show(other.k, 'world');
        renderer.clippingPlanes = this.planes([...other.planes, ...open]);
        raw(S, camera);
        // and the pane that keeps everything behind the door out of it
        p.pane.visible = true;
        renderer.clippingPlanes = this.planes([]);
        raw(this.occScene, camera);
        p.pane.visible = false;
      }
      // the room's frame
      if (this.frame) {
        this.show(-1, 'frame');
        renderer.clippingPlanes = this.planes([]);
        raw(S, this.setCam(C1, camera, cc.T));
      }
      // every cell, turned into its place
      for (const c of this.cells) {
        this.show(c.k, 'world');
        renderer.clippingPlanes = this.planes(c.planes);
        if (c === cc) raw(S, camera);
        else raw(S, this.setCam(C1, camera, _m.multiplyMatrices(c.Ti, cc.T)));
      }
    } finally {
      S.children.forEach((o, k) => (o.visible = vis[k]));
      this.world.layers.group.children.forEach((o, k) => (o.visible = lvis[k]));
      for (const [o] of this.pieces) o.visible = this.pvis.get(o);
      S.background = bg;
      S.matrixWorldAutoUpdate = true;
      renderer.autoClear = autoClear;
      renderer.clippingPlanes = clip;
    }
  }
}

void _q;
