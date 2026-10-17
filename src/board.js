import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
import { buildTracks, squareXZ, PLIES } from './opera.js';

const COLORS = {
  bg: 0x161c1a,
  slab: 0x111614,
  light: 0x35413d,
  dark: 0x1d2523,
  bone: 0xe3e2da,
  ebony: 0x0e1413,
  accent: 0x9fc7b8,
};

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 4);
const lerp = (a, b, t) => a + (b - a) * t;

// ---------- piece geometry: lathe silhouettes, one extruded knight head ----------
const V = (x, y) => new THREE.Vector2(x, y);
function arc(cx, cy, r, a0, a1, n = 10) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push(V(Math.max(0, cx + r * Math.cos(a)), cy + r * Math.sin(a)));
  }
  return pts;
}
const BASE = [V(0, 0), V(0.34, 0), V(0.34, 0.06), V(0.3, 0.09), V(0.3, 0.13), V(0.24, 0.16)];
const lathe = (pts) => new THREE.LatheGeometry([...BASE, ...pts], 48).toNonIndexed();

function knightGeometry() {
  // Staunton profile facing +x: chest, throat, jaw, muzzle, forehead, ear, then the mane down the back
  const s = new THREE.Shape();
  s.moveTo(-0.19, 0);
  s.lineTo(0.17, 0);
  s.quadraticCurveTo(0.2, 0.1, 0.11, 0.2);
  s.quadraticCurveTo(0.06, 0.25, 0.14, 0.29);
  s.quadraticCurveTo(0.27, 0.3, 0.33, 0.34);
  s.quadraticCurveTo(0.38, 0.38, 0.35, 0.43);
  s.quadraticCurveTo(0.31, 0.48, 0.22, 0.52);
  s.quadraticCurveTo(0.15, 0.56, 0.13, 0.63);
  s.lineTo(0.12, 0.74);
  s.quadraticCurveTo(0.06, 0.7, 0.03, 0.64);
  s.quadraticCurveTo(-0.1, 0.63, -0.17, 0.52);
  s.quadraticCurveTo(-0.25, 0.4, -0.24, 0.24);
  s.quadraticCurveTo(-0.23, 0.1, -0.19, 0);
  const g = new THREE.ExtrudeGeometry(s, {
    depth: 0.13, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 8, curveSegments: 14,
  });
  g.translate(0, 0.25, -0.065);
  g.computeVertexNormals();
  const base = lathe([V(0.2, 0.2), V(0.19, 0.27), V(0, 0.28)]);
  return mergeGeometries([base, g.index ? g.toNonIndexed() : g]);
}

function kingGeometry() {
  const body = lathe([V(0.19, 0.22), V(0.14, 0.42), V(0.12, 0.7), V(0.23, 0.74), V(0.23, 0.78), V(0.14, 0.81),
    V(0.17, 0.9), V(0.21, 1.0), V(0, 1.03)]);
  const v = new THREE.BoxGeometry(0.065, 0.22, 0.065).translate(0, 1.13, 0).toNonIndexed();
  const h = new THREE.BoxGeometry(0.17, 0.06, 0.065).translate(0, 1.15, 0).toNonIndexed();
  return mergeGeometries([body, v, h]);
}

function pieceGeometries() {
  return {
    p: lathe([V(0.16, 0.22), V(0.12, 0.36), V(0.11, 0.42), V(0.19, 0.45), V(0.19, 0.48), V(0.1, 0.5),
      ...arc(0, 0.62, 0.15, -0.9, Math.PI / 2)]),
    r: lathe([V(0.22, 0.2), V(0.18, 0.3), V(0.17, 0.58), V(0.25, 0.62), V(0.25, 0.82), V(0.19, 0.82),
      V(0.19, 0.76), V(0, 0.76)]),
    b: lathe([V(0.17, 0.22), V(0.12, 0.38), V(0.1, 0.52), V(0.2, 0.55), V(0.2, 0.58), V(0.11, 0.6), V(0.15, 0.66),
      V(0.16, 0.72), V(0.14, 0.8), V(0.09, 0.88), V(0.04, 0.92), ...arc(0, 0.96, 0.05, -1.3, Math.PI / 2, 6)]),
    q: lathe([V(0.18, 0.22), V(0.13, 0.4), V(0.11, 0.66), V(0.22, 0.7), V(0.22, 0.74), V(0.13, 0.77), V(0.15, 0.84),
      V(0.23, 0.96), V(0.2, 0.98), V(0.12, 0.95), V(0.06, 0.97), ...arc(0, 1.03, 0.065, -1.2, Math.PI / 2, 6)]),
    k: kingGeometry(),
    n: knightGeometry(),
  };
}

// ---------- camera framing ----------
// Spherical framing around a look target, plus a screen-space shift so the board can sit
// beside the text instead of under it.
const FRAMES = {
  hero: { az: -0.62, el: 0.56, r: 16.5, look: [0, 0, 0.2] },
  game: { az: -0.18, el: 0.92, r: 14.4, look: [0, 0, 0.3] },
  mate: { az: 0.36, el: 0.6, r: 8.6, look: [0.5, 0.2, -2.7] },
};
const SHIFT = {
  wide: { hero: [0.28, 0.24], game: [0.25, 0.02] },
  tall: { hero: [0, 0.3], game: [0, 0.1] },
};

export function createBoard(canvas, { reducedMotion = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.bg);
  scene.fog = new THREE.Fog(COLORS.bg, 16, 34);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.42;

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 80);

  const key = new THREE.DirectionalLight(0xfff4e6, 2.4);
  key.position.set(-6, 12, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 30 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 4;
  scene.add(key);
  const rim = new THREE.DirectionalLight(COLORS.accent, 1.6);
  rim.position.set(7, 5, -9);
  scene.add(rim);
  scene.add(new THREE.HemisphereLight(0xdfe8e4, 0x0a0e0d, 0.35));

  const board = new THREE.Group();
  scene.add(board);

  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(8.7, 0.42, 8.7),
    new THREE.MeshStandardMaterial({ color: COLORS.slab, roughness: 0.55 }),
  );
  slab.position.y = -0.21;
  slab.receiveShadow = true;
  board.add(slab);

  const tiles = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.985, 0.06, 0.985),
    new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0.05 }),
    64,
  );
  tiles.receiveShadow = true;
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  for (let f = 0; f < 8; f++) {
    for (let r = 0; r < 8; r++) {
      const i = f * 8 + r;
      m.makeTranslation(f - 3.5, -0.02, 3.5 - r);
      tiles.setMatrixAt(i, m);
      tiles.setColorAt(i, c.set((f + r) % 2 ? COLORS.light : COLORS.dark));
    }
  }
  board.add(tiles);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: 0.45 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.43;
  ground.receiveShadow = true;
  scene.add(ground);

  // last-move squares
  const markMat = new THREE.MeshBasicMaterial({ color: COLORS.accent, transparent: true, opacity: 0, depthWrite: false });
  const marks = [0, 1].map(() => {
    const mk = new THREE.Mesh(new THREE.PlaneGeometry(0.985, 0.985), markMat);
    mk.rotation.x = -Math.PI / 2;
    mk.position.y = 0.012;
    board.add(mk);
    return mk;
  });

  // the last move, Rd8#, is signed on the board: a jade stroke runs up the d-file behind the rook
  const [lx, lz0] = squareXZ('d1');
  const [, lz1] = squareXZ('d8');
  const mateLine = new THREE.Mesh(
    new THREE.PlaneGeometry(0.07, 1).translate(0, 0.5, 0),
    new THREE.MeshBasicMaterial({ color: COLORS.accent, transparent: true, opacity: 0.8, depthWrite: false }),
  );
  mateLine.rotation.x = -Math.PI / 2;
  mateLine.position.set(lx, 0.02, lz0);
  mateLine.scale.y = 0.0001;
  board.add(mateLine);

  // checkmate: a cone of light falls on the king's square, grounded by a soft pool on the board
  const [kx, kz] = squareXZ('e8');
  const coneMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uI: { value: 0 }, uColor: { value: new THREE.Color(0xdff0e8) } },
    vertexShader: `
      varying float vH; varying vec3 vN; varying vec3 vV;
      void main() {
        vH = uv.y;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uI; uniform vec3 uColor;
      varying float vH; varying vec3 vN; varying vec3 vV;
      void main() {
        float face = pow(abs(dot(vN, vV)), 2.0);          // soft edges, bright core
        float fall = smoothstep(1.0, 0.15, vH) * smoothstep(0.0, 0.08, vH);
        gl_FragColor = vec4(uColor, face * fall * 0.22 * uI);
      }`,
  });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(1.15, 7, 48, 1, true), coneMat);
  cone.geometry.rotateX(Math.PI);           // tip up, mouth on the board
  cone.position.set(kx, 3.5, kz);
  cone.visible = false;
  board.add(cone);
  const poolTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(223,240,232,0.9)'); r.addColorStop(0.5, 'rgba(223,240,232,0.25)'); r.addColorStop(1, 'rgba(223,240,232,0)');
    g.fillStyle = r; g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  const pool = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 2.6),
    new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(kx, 0.015, kz);
  board.add(pool);

  const geos = pieceGeometries();
  const mats = {
    white: new THREE.MeshPhysicalMaterial({ color: COLORS.bone, roughness: 0.34, clearcoat: 0.5, clearcoatRoughness: 0.3 }),
    black: new THREE.MeshPhysicalMaterial({ color: COLORS.ebony, roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.22 }),
  };
  const meshes = [];
  const pieces = buildTracks().map((p) => {
    const mesh = new THREE.Mesh(geos[p.type], p.white ? mats.white : mats.black);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (p.type === 'n') mesh.rotation.y = p.white ? Math.PI / 2 : -Math.PI / 2;
    board.add(mesh);
    const piece = { ...p, mesh, rank: Number(p.start[1]), lift: 0, liftV: 0 };
    mesh.userData.piece = piece;
    meshes.push(mesh);
    return piece;
  });
  const blackKing = pieces.find((p) => p.type === 'k' && !p.white);
  const small = window.matchMedia('(max-width: 760px), (pointer: coarse)').matches;
  const pr = () => renderer.getPixelRatio();

  // ---------- coordinates: a-h and 1-8 set in mono on the rim of the board ----------
  const coordMat = [];
  function coordLabel(text, x, z) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.26), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.003, z);
    board.add(mesh);
    const draw = () => {
      const g = c.getContext('2d');
      g.clearRect(0, 0, 64, 64);
      g.fillStyle = '#e3e2da';
      g.font = '500 40px "Geist Mono", ui-monospace, monospace';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, 32, 34);
      tex.needsUpdate = true;
    };
    draw();
    coordMat.push(draw);
  }
  'abcdefgh'.split('').forEach((f, i) => coordLabel(f, i - 3.5, 4.17));
  for (let r = 0; r < 8; r++) coordLabel(String(r + 1), -4.17, 3.5 - r);
  document.fonts?.load('500 40px "Geist Mono"').then(() => coordMat.forEach((d) => d()));

  // ---------- particles ----------
  const pointVert = `
    attribute vec4 aRand;
    uniform float uK, uSize, uPr, uTime, uDust;
    varying float vAlpha;
    void main() {
      vec3 p = position;
      float k = 0.0;
      if (uDust > 0.5) {
        // dust: drifts up through the key light and wraps around
        p.y = mod(position.y + uTime * (0.04 + aRand.w * 0.05), 4.2) + 0.2;
        p.x += sin(uTime * 0.13 + aRand.x * 6.28) * 0.35;
        p.z += cos(uTime * 0.11 + aRand.y * 6.28) * 0.35;
        vAlpha = 0.5 * smoothstep(0.2, 0.9, p.y) * (1.0 - smoothstep(3.2, 4.4, p.y)) * (0.5 + 0.5 * aRand.z);
      } else {
        // a captured piece comes apart: each grain leaves on its own delay, lifts and curls away
        k = clamp((uK - aRand.w * 0.35) / 0.65, 0.0, 1.0);
        float ease = 1.0 - pow(1.0 - k, 3.0);
        p += normalize(aRand.xyz - 0.5) * ease * 1.25;
        p.y += ease * ease * 2.2;
        float a = ease * 4.0 + aRand.w * 6.28;
        p.xz += vec2(cos(a), sin(a)) * ease * 0.22;
        vAlpha = (1.0 - k * k) * 0.85 * step(0.001, uK);
      }
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = uSize * uPr * (1.0 - 0.4 * k) * (10.0 / -mv.z);
    }`;
  const pointFrag = `
    uniform vec3 uColor;
    varying float vAlpha;
    void main() {
      float d = length(gl_PointCoord - 0.5);
      float a = smoothstep(0.5, 0.0, d) * vAlpha;
      if (a < 0.01) discard;
      gl_FragColor = vec4(uColor, a);
    }`;
  const pointsMaterial = (color, size, dust = 0, additive = false) => new THREE.ShaderMaterial({
    vertexShader: pointVert, fragmentShader: pointFrag, transparent: true, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: { uK: { value: 0 }, uSize: { value: size }, uPr: { value: pr() }, uTime: { value: 0 }, uDust: { value: dust }, uColor: { value: new THREE.Color(color) } },
  });

  // dust in the light
  const dustN = small ? 140 : 420;
  const dustGeo = new THREE.BufferGeometry();
  const dp = new Float32Array(dustN * 3), dr = new Float32Array(dustN * 4);
  for (let i = 0; i < dustN; i++) {
    dp.set([(Math.random() - 0.5) * 12, Math.random() * 4.2, (Math.random() - 0.5) * 12], i * 3);
    dr.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  dustGeo.setAttribute('aRand', new THREE.BufferAttribute(dr, 4));
  const dustMat = pointsMaterial(0xdfe8e4, 2.4, 1, true);
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.frustumCulled = false;
  scene.add(dust);

  // every piece that will be taken gets a cloud sampled from its own surface
  const grains = small ? 700 : 1600;
  for (const p of pieces) {
    if (p.capturedAt === null) continue;
    const sampler = new MeshSurfaceSampler(new THREE.Mesh(geos[p.type])).build();
    const pos = new Float32Array(grains * 3), rnd = new Float32Array(grains * 4);
    const v = new THREE.Vector3();
    for (let i = 0; i < grains; i++) {
      sampler.sample(v);
      pos.set([v.x, v.y, v.z], i * 3);
      rnd.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aRand', new THREE.BufferAttribute(rnd, 4));
    const mat = pointsMaterial(p.white ? 0xe3e2da : 0x9fc7b8, 5.2, 0, true);
    const cloud = new THREE.Points(g, mat);
    cloud.visible = false;
    cloud.frustumCulled = false;
    board.add(cloud);
    p.cloud = cloud;
  }

  // ---------- state ----------
  // scroll writes targets (heroT, gameT, plyT); each frame eases the drawn values toward them,
  // so fast scrubbing and direction changes stay fluid instead of stepping with every wheel tick
  const state = {
    intro: reducedMotion ? 1 : 0, hero: 0, game: 0, ply: 0, heroT: 0, gameT: 0, plyT: 0,
    px: 0, py: 0, tx: 0, ty: 0, wide: true, hover: null, hoverPiece: null,
  };
  const ray = new THREE.Raycaster();
  const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  const ndc = new THREE.Vector2();

  function placePieces(ply, dt = 1 / 60) {
    const wl = (2 * Math.PI) / 0.38, zl = 0.62;
    for (const p of pieces) {
      let [x, z] = squareXZ(p.start);
      let y = 0;
      let tilt = 0;
      for (const step of p.track) {
        if (ply >= step.ply + 1) {
          [x, z] = squareXZ(step.to);
        } else if (ply > step.ply) {
          const t = easeInOut(ply - step.ply);
          const [x0, z0] = squareXZ(step.from);
          const [x1, z1] = squareXZ(step.to);
          x = lerp(x0, x1, t);
          z = lerp(z0, z1, t);
          y = Math.sin(Math.PI * t) * (p.type === 'n' ? 0.9 : 0.28);
        }
      }
      let s = 1;
      if (p.cloud) {
        const k = clamp01((ply - p.capturedAt - 0.5) / 0.9);
        p.cloud.visible = k > 0 && k < 1;
        if (p.cloud.visible) {
          p.cloud.position.set(x, 0, z);
          p.cloud.rotation.y = p.mesh.rotation.y;
          p.cloud.material.uniforms.uK.value = k;
          p.cloud.material.uniforms.uPr.value = pr();
        }
        // the solid piece gives way to its grains over the first third of the dissolve
        s = 1 - easeOut(clamp01(k / 0.32));
        if (s < 0.02) y = -5;
      }
      if (p === blackKing) tilt = easeOut(clamp01((ply - 32.5) / 0.5)) * 1.38;
      // intro: pieces rise out of the board, back ranks first
      const delay = (p.white ? p.rank - 1 : 8 - p.rank) * 0.06 + ('abcdefgh'.indexOf(p.start[0]) * 0.012);
      const rise = easeOut(clamp01((state.intro * 1.5 - delay) / 0.7));
      y -= (1 - rise) * 1.45;
      // the piece under the pointer rises, as if the hand is about to pick it up; its neighbours stir
      let lift = 0;
      if (p === state.hoverPiece) lift = 0.34;
      else if (state.hover && !(p.capturedAt !== null && ply > p.capturedAt)) {
        const d = Math.hypot(x - state.hover.x, z - state.hover.z);
        if (d < 1.2) lift = 0.12 * (1 - d / 1.2) ** 2;
      }
      p.liftV += (wl * wl * (lift - p.lift) - 2 * zl * wl * p.liftV) * Math.min(dt, 1 / 30);
      p.lift += p.liftV * Math.min(dt, 1 / 30);
      y += p.lift;
      p.mesh.position.set(x + Math.sin(tilt) * 0.35, y, z);
      p.mesh.rotation.z = tilt;
      p.mesh.scale.setScalar(s);
      p.mesh.visible = y > -1.4;
    }
    // highlight the squares of the latest move
    const idx = Math.min(PLIES.length - 1, Math.max(0, Math.ceil(ply) - 1));
    const mv = PLIES[idx].moves[0];
    const [fx, fz] = squareXZ(mv[0]);
    const [tx, tz] = squareXZ(mv[1]);
    marks[0].position.set(fx, 0.012, fz);
    marks[1].position.set(tx, 0.012, tz);
    markMat.opacity = ply > 0.02 ? 0.32 : 0;
    const draw = easeInOut(clamp01(ply - (PLIES.length - 1)));
    mateLine.scale.y = Math.max(0.0001, draw * (lz0 - lz1));
    mateLine.visible = draw > 0.001;
    // checkmate: the jade rim light swells as the king falls
    const mateLight = easeOut(clamp01((ply - 32.3) / 0.7));
    rim.intensity = 1.6 + 2.4 * mateLight;
    coneMat.uniforms.uI.value = mateLight;
    cone.visible = mateLight > 0.002;
    pool.material.opacity = 0.35 * mateLight;
  }

  function frame() {
    const g = state.game;
    const h = easeInOut(state.hero);
    const mate = easeInOut(clamp01((g - 0.86) / 0.14));
    const A = FRAMES.hero, B = FRAMES.game, C = FRAMES.mate;
    const az0 = lerp(A.az, B.az, h), el0 = lerp(A.el, B.el, h), r0 = lerp(A.r, B.r, h);
    // slow orbit while the game plays
    const orbit = lerp(0, 0.34, clamp01(g / 0.86));
    let az = lerp(az0 + orbit, C.az, mate) + state.px * 0.07;
    let el = lerp(el0, C.el, mate) - state.py * 0.035;
    // narrow screens: back the camera off until the board fits the width (the hero may bleed a little,
    // the game view shows the whole board, the mate close-up crops in)
    const tanH = Math.tan((camera.fov * Math.PI) / 360) * camera.aspect;
    const fitR = 4.7 / tanH;
    const r = Math.max(lerp(r0, C.r, mate), fitR * lerp(lerp(0.8, 0.88, h), 0.7, mate));
    const look = [0, 1, 2].map((i) => lerp(lerp(A.look[i], B.look[i], h), C.look[i], mate));
    camera.position.set(
      look[0] + r * Math.cos(el) * Math.sin(az),
      look[1] + r * Math.sin(el),
      look[2] + r * Math.cos(el) * Math.cos(az),
    );
    camera.lookAt(...look);

    const sh = state.wide ? SHIFT.wide : SHIFT.tall;
    // mid-size screens: push the board further right so it clears the intro text
    const heroX = state.wide ? sh.hero[0] + clamp01((1300 - state.w) / 500) * 0.1 : sh.hero[0];
    const sx = lerp(heroX, sh.game[0], h);
    const sy = lerp(sh.hero[1], sh.game[1], h);
    const w = state.w, hh = state.h;
    camera.setViewOffset(w, hh, -sx * w, -sy * hh, w, hh);
  }

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    state.w = w;
    state.h = h;
    state.wide = w / h > 0.95;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = state.wide ? 32 : 44;
    camera.updateProjectionMatrix();
  }

  // critically damped springs (Apple's "damping 1, response" model): a reversal re-targets the spring
  // and keeps its velocity, so scrubbing back and forth never hits a brick wall
  const springs = { hero: 0, game: 0, ply: 0 };
  function spring(key, target, response, dt) {
    const w = (2 * Math.PI) / response;
    let x = state[key], v = springs[key];
    // fixed small steps keep it stable when a frame runs long
    for (let left = dt; left > 0; left -= 1 / 240) {
      const h = Math.min(left, 1 / 240);
      v += (w * w * (target - x) - 2 * w * v) * h;
      x += v * h;
    }
    if (Math.abs(target - x) < 1e-4 && Math.abs(v) < 1e-3) { x = target; v = 0; }
    state[key] = x;
    springs[key] = v;
  }
  const follow = (v, t, rate, dt) => v + (t - v) * (1 - Math.exp(-dt * rate));

  // if the GPU cannot keep up, trade resolution for frames (never the other way, so it cannot oscillate)
  let dpr = Math.min(window.devicePixelRatio || 1, 1.75);
  let slow = 0;
  function adapt(dt) {
    slow = dt > 1 / 40 ? slow + dt : Math.max(0, slow - dt * 0.5);
    if (slow > 0.8 && dpr > 1) {
      dpr = Math.max(1, dpr - 0.25);
      renderer.setPixelRatio(dpr);
      resize();
      slow = 0;
    }
  }

  let time = 0;
  function render(dt = 1 / 60) {
    time += dt;
    if (time > 2) adapt(dt);
    spring('hero', state.heroT, 0.7, dt);
    spring('game', state.gameT, 0.7, dt);
    spring('ply', state.plyT, 0.6, dt);
    state.px = follow(state.px, state.tx, 3.5, dt);
    state.py = follow(state.py, state.ty, 3.5, dt);
    if (!reducedMotion) board.rotation.y = Math.sin(time * 0.18) * 0.035 * (1 - state.hero);
    state.hoverPiece = null;
    if (state.pointerOn) {
      ndc.set(state.tx, -state.ty);
      camera.updateMatrixWorld();
      ray.setFromCamera(ndc, camera);
      // hit the pieces themselves first: tall pieces cover squares far behind them
      const hits = ray.intersectObjects(meshes, false);
      const piece = hits.find((h) => h.object.visible)?.object.userData.piece;
      if (piece) {
        state.hoverPiece = piece;
        state.hover = { x: piece.mesh.position.x, z: piece.mesh.position.z };
      } else if (ray.ray.intersectPlane(floor, hit)) {
        board.worldToLocal(hit);
        state.hover = Math.abs(hit.x) < 4.4 && Math.abs(hit.z) < 4.4 ? { x: hit.x, z: hit.z } : null;
      }
    }
    // name of the square under the pointer, for the cursor label
    state.square = null;
    if (state.hover) {
      const f = Math.round(state.hover.x + 3.5), r = Math.round(3.5 - state.hover.z);
      if (f >= 0 && f < 8 && r >= 0 && r < 8) {
        const p = state.hoverPiece;
        state.square = (p && p.type !== 'p' ? p.type.toUpperCase() : '') + 'abcdefgh'[f] + (r + 1);
      }
    }
    dustMat.uniforms.uTime.value = time;
    dustMat.uniforms.uPr.value = pr();
    placePieces(state.ply, dt);
    frame();
    renderer.render(scene, camera);
    return state.ply;
  }

  resize();
  placePieces(0);

  return {
    resize,
    render,
    set intro(v) { state.intro = v; },
    get intro() { return state.intro; },
    get ply() { return state.ply; },
    get hovering() { return !!state.hoverPiece; },
    get square() { return state.square; },
    setHero(v) { state.heroT = clamp01(v); if (reducedMotion) state.hero = state.heroT; },
    setGame(v) {
      state.gameT = clamp01(v);
      // plies run between 4% and 88% of the section; the rest is camera
      state.plyT = clamp01((state.gameT - 0.04) / 0.84) * PLIES.length;
      if (reducedMotion) { state.game = state.gameT; state.ply = state.plyT; }
      return state.plyT;
    },
    // jump straight to the targets, for the first frame and after the board was off screen
    settle() {
      state.hero = state.heroT; state.game = state.gameT; state.ply = state.plyT;
      springs.hero = springs.game = springs.ply = 0;
    },
    pointer(x, y) {
      if (reducedMotion) return;
      state.tx = x;
      state.ty = y;
      state.pointerOn = true;
    },
    pointerOff() { state.pointerOn = false; state.hover = null; },
    dispose() { renderer.dispose(); },
  };
}

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2'));
  } catch {
    return false;
  }
}
