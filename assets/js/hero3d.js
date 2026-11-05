import * as THREE from '../vendor/three/three.module.min.js';

(() => {
  'use strict';

  const container = document.getElementById('hero-3d-container');
  const canvas = document.getElementById('arc-3d-canvas');
  if (!container || !canvas) return;

  /* ---------- Settings you can tweak ---------- */
  const FLIP_WINDING = false; // set to true if the ribbons look hollow or inside-out
  const BASE_Y = 0.25;        // height of the loop in the scene
  const GROUND_Y = -1.65;     // height of the floor (used for the reflection)
  const FIT_W = 8.0;          // scene width that must fit inside the canvas
  const FIT_H = 5.2;          // scene height that must fit inside the canvas
  const CAM_Y = -0.2;         // camera height
  const STILL_TIME = 6;       // pose used when reduced motion is on
  const RING_RX = 3.85;       // orbit ring half-width
  const RING_RY = 1.5;        // orbit ring half-height

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const lowPower = window.matchMedia('(max-width: 760px)').matches;

  /* ---------- Small helpers ---------- */
  // Seeded random numbers: the scene looks the same on every page load.
  function makeRandom(seed) {
    return function () {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const random = makeRandom(20261028);

  function hash3(x, y, z) {
    const v = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
    return v - Math.floor(v);
  }

  // Lets the browser draw and respond between heavy steps, so the page does not freeze.
  function pauseForBrowser() {
    if (window.scheduler && typeof window.scheduler.yield === 'function') {
      return window.scheduler.yield();
    }
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  /* ---------- State ---------- */
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 5 / 3, 0.1, 60);
  let renderer = null;
  let envTarget = null;
  let resizeObserver = null;
  let visibilityObserver = null;
  let rafId = 0;
  let running = false;
  let visible = true;
  let destroyed = false;
  let time = 0;
  let lastNow = 0;

  // Things that move
  const artwork = new THREE.Group();
  const reflection = new THREE.Group();
  const ringA = new THREE.Group();
  const ringB = new THREE.Group();
  const bodies = [];
  const floatRocks = [];
  let particles = null;
  let particleData = [];
  let keyLight, fillLight, rimLight;

  /* ---------- Textures drawn in code (no image files needed) ---------- */
  function makeEnvironmentCanvas() {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 512;
    const g = c.getContext('2d');

    // Dark base. Metal needs dark areas next to bright ones to look like metal.
    const base = g.createLinearGradient(0, 0, 0, 512);
    base.addColorStop(0, '#0b1030');
    base.addColorStop(0.5, '#05081c');
    base.addColorStop(1, '#020410');
    g.fillStyle = base;
    g.fillRect(0, 0, 1024, 512);

    // Soft light panels: x, y, width, height, colour.
    // The area around x = 770 is what a surface facing the camera reflects.
    const panels = [
      [640, 40, 260, 120, 'rgba(255,255,255,0.95)'],
      [520, 130, 46, 280, 'rgba(120,200,255,0.95)'],
      [915, 250, 90, 150, 'rgba(255,140,210,0.9)'],
      [330, 150, 90, 190, 'rgba(150,120,255,0.6)'],
      [758, 0, 14, 512, 'rgba(255,255,255,0.85)'],
      [600, 330, 150, 40, 'rgba(170,150,255,0.7)'],
      [150, 90, 110, 60, 'rgba(200,225,255,0.8)']
    ];
    panels.forEach(([x, y, w, h, color]) => {
      g.shadowColor = color;
      g.shadowBlur = 45;
      g.fillStyle = color;
      g.fillRect(x, y, w, h);
    });
    g.shadowBlur = 0;
    return c;
  }

  function makeSpriteTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.6)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function makeGlowTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, 'rgba(170,140,255,0.75)');
    grad.addColorStop(0.45, 'rgba(240,164,224,0.25)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /* ---------- Infinity curve and twisted ribbons ---------- */
  class InfinityCurve extends THREE.Curve {
    constructor() {
      super();
      this.arcLengthDivisions = 800;
    }
    getPoint(t, target = new THREE.Vector3()) {
      const a = t * Math.PI * 2;
      // x and y draw the figure 8. z gives it depth so the two crossings never touch.
      return target.set(3.0 * Math.sin(a), 1.3 * Math.sin(2 * a), 0.55 * Math.cos(a));
    }
  }

  // Builds one thin curved plate that follows the curve and spirals around its axis.
  function buildStrand(curve, frames, o) {
    const { S, R, offset, turns, phase, rx, ry, spin } = o;
    const positions = new Float32Array(S * R * 3);
    const P = new THREE.Vector3();
    const C = new THREE.Vector3();
    const e1 = new THREE.Vector3();
    const e2 = new THREE.Vector3();

    for (let i = 0; i < S; i++) {
      const u = i / S;
      curve.getPointAt(u, P);
      const N = frames.normals[i];
      const B = frames.binormals[i];
      const phi = phase + Math.PI * 2 * turns * u;

      C.copy(P)
        .addScaledVector(N, Math.cos(phi) * offset)
        .addScaledVector(B, Math.sin(phi) * offset);

      const ca = Math.cos(phi + spin);
      const sa = Math.sin(phi + spin);
      e1.copy(N).multiplyScalar(ca).addScaledVector(B, sa);
      e2.copy(N).multiplyScalar(-sa).addScaledVector(B, ca);

      for (let j = 0; j < R; j++) {
        const a = (j / R) * Math.PI * 2;
        const cx = Math.cos(a) * rx;
        const sy = Math.sin(a) * ry;
        const k = (i * R + j) * 3;
        positions[k] = C.x + e1.x * cx + e2.x * sy;
        positions[k + 1] = C.y + e1.y * cx + e2.y * sy;
        positions[k + 2] = C.z + e1.z * cx + e2.z * sy;
      }
    }

    // Indices wrap around, so there are no seams.
    const index = [];
    for (let i = 0; i < S; i++) {
      for (let j = 0; j < R; j++) {
        const i2 = (i + 1) % S;
        const j2 = (j + 1) % R;
        const a = i * R + j;
        const b = i2 * R + j;
        const c = i2 * R + j2;
        const d = i * R + j2;
        if (FLIP_WINDING) index.push(a, b, d, b, c, d);
        else index.push(a, d, b, b, d, c);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(index);
    geometry.computeVertexNormals();
    return geometry;
  }

  function makeMaterials() {
    const chrome = new THREE.MeshPhysicalMaterial({
      color: 0xe9eeff,
      metalness: 1,
      roughness: 0.1,
      envMapIntensity: 1.9,
      clearcoat: 0.8,
      clearcoatRoughness: 0.05,
      iridescence: 0.3,
      iridescenceIOR: 1.35,
      iridescenceThicknessRange: [180, 520]
    });

    const violet = chrome.clone();
    violet.color.set(0xaeb8ff); 
    violet.envMapIntensity = 1.6;

    // Real glass on desktop. Phones get a lighter see-through version.
    const glass = lowPower
      ? new THREE.MeshPhysicalMaterial({
          color: 0xcfe0ff,
          metalness: 0.2,
          roughness: 0.08,
          transparent: true,
          opacity: 0.55,
          envMapIntensity: 1.55,
          clearcoat: 1
        })
      : new THREE.MeshPhysicalMaterial({
          color: 0xdfe9ff,
          metalness: 0,
          roughness: 0.06,
          transmission: 1,
          thickness: 0.6,
          ior: 1.5,
          envMapIntensity: 1.8,
          clearcoat: 1,
          iridescence: 0.8,
          iridescenceIOR: 1.4,
          iridescenceThicknessRange: [200, 700],
          attenuationColor: new THREE.Color(0xa99aff),
          attenuationDistance: 1.2
        });

    const mirror = chrome.clone();
    mirror.transparent = true;
    mirror.opacity = 0.2;
    mirror.depthWrite = false;

    return { chrome, violet, glass, mirror };
  }

  /* ---------- Rocks ---------- */
  function makeRockGeometry() {
    const g = new THREE.IcosahedronGeometry(1, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      // The same corner always gets the same push, so faces do not tear apart.
      const s = 0.72 + hash3(x, y, z) * 0.5;
      p.setXYZ(i, x * s, y * s * 0.85, z * s);
    }
    g.computeVertexNormals();
    return g;
  }

  /* ---------- Scene ---------- */
  async function buildScene() {
    // Reflections for the metal
    const envTexture = new THREE.CanvasTexture(makeEnvironmentCanvas());
    envTexture.mapping = THREE.EquirectangularReflectionMapping;
    envTexture.colorSpace = THREE.SRGBColorSpace;
    const pmrem = new THREE.PMREMGenerator(renderer);
    envTarget = pmrem.fromEquirectangular(envTexture);
    scene.environment = envTarget.texture;
    envTexture.dispose();
    pmrem.dispose();
    await pauseForBrowser();
    if (destroyed) return;

    // Lights (the reflections do most of the work)
    keyLight = new THREE.DirectionalLight(0x9fd8ff, 1.6);
    keyLight.position.set(-4, 3, 5);
    fillLight = new THREE.DirectionalLight(0xf0a4e0, 1.2);
    fillLight.position.set(4, -2, 3);
    rimLight = new THREE.DirectionalLight(0xa99aff, 1.8);
    rimLight.position.set(2, 3, -4);
    scene.add(keyLight, fillLight, rimLight);

    const mats = makeMaterials();
    const sprite = makeSpriteTexture();

    // Three twisted plates make the glass-and-chrome infinity loop
    const curve = new InfinityCurve();
    const S = lowPower ? 220 : 380;
    const R = lowPower ? 18 : 28;
    const frames = curve.computeFrenetFrames(S, true);
    const strandSettings = [
      { material: mats.chrome, phase: 0 },
      { material: mats.glass, phase: (Math.PI * 2) / 3 },
      { material: mats.violet, phase: (Math.PI * 4) / 3 }
    ];

    for (const s of strandSettings) {
      const geometry = buildStrand(curve, frames, {
        S, R, offset: 0.22, turns: 2, phase: s.phase,
        rx: 0.3, ry: 0.08, spin: Math.PI / 2
      });
      artwork.add(new THREE.Mesh(geometry, s.material));
      // Glass is skipped in the reflection, which saves a lot of GPU work
      if (s.material !== mats.glass) {
        reflection.add(new THREE.Mesh(geometry, mats.mirror));
      }
      await pauseForBrowser();
      if (destroyed) return;
    }
    reflection.scale.y = -1;
    scene.add(reflection);

    // Orbit rings (thin tubes)
    function makeRing(group, rx, ry, opacity, rotation) {
      const pts = [];
      for (let i = 0; i < 160; i++) {
        const a = (i / 160) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * rx, Math.sin(a) * ry, 0));
      }
      const path = new THREE.CatmullRomCurve3(pts, true);
      const mesh = new THREE.Mesh(
        new THREE.TubeGeometry(path, 200, 0.011, 6, true),
        new THREE.MeshBasicMaterial({
          color: 0xa9b8ff, transparent: true, opacity, toneMapped: false
        })
      );
      group.add(mesh);
      group.rotation.set(...rotation);
      artwork.add(group);
    }
    makeRing(ringA, RING_RX, RING_RY, 0.55, [0.5, -0.2, -0.2]);
    makeRing(ringB, 3.2, 1.05, 0.28, [1.2, 0.3, 0.5]);
    ringA.position.set(0.1, 0.1, 0);

    // Reflective spheres that travel slowly along the main ring
    const sphereGeo = new THREE.SphereGeometry(1, 32, 24);
      const sphereMat = new THREE.MeshPhysicalMaterial({
      color: 0x8c96d6, metalness: 1, roughness: 0.14, envMapIntensity: 1.8
    });
    [
      { r: 0.16, theta: 1.25, speed: 0.045, phase: 0.4 },
      { r: 0.22, theta: -0.35, speed: 0.032, phase: 1.9 },
      { r: 0.13, theta: 2.55, speed: -0.04, phase: 3.1 }
    ].forEach((b) => {
      const mesh = new THREE.Mesh(sphereGeo, sphereMat);
      mesh.scale.setScalar(b.r);
      ringA.add(mesh);
      bodies.push({ mesh, ...b });
    });

    // Rocks
    const rockGeo = makeRockGeometry();
    const rockDark = new THREE.MeshStandardMaterial({
      color: 0x2c2a4a, roughness: 0.6, metalness: 0.3, flatShading: true, envMapIntensity: 0.9
    });
    const rockPurple = new THREE.MeshStandardMaterial({
      color: 0x5b4c8c, roughness: 0.5, metalness: 0.35, flatShading: true, envMapIntensity: 1.1
    });

    // Rocks resting near the floor stay fixed in the scene
    [
      [-3.3, -1.3, 0.8, 0.55, 0.6, rockDark],
      [-2.3, -1.5, 1.2, 0.22, 2.1, rockDark],
      [3.4, -1.5, 0.5, 0.2, 1.3, rockDark]
    ].forEach(([x, y, z, s, ry, mat]) => {
      const rock = new THREE.Mesh(rockGeo, mat);
      rock.position.set(x, y, z);
      rock.scale.setScalar(s);
      rock.rotation.set(0.3, ry, 0.1);
      scene.add(rock);
    });

    // Floating rocks move with the loop
    const floating = [
      { x: 0.4, y: 1.9, z: -0.3, s: 0.26, mat: rockPurple }
    ];
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 + random() * 0.6;
      floating.push({
        x: Math.cos(angle) * (3.3 + random() * 0.5),
        y: Math.sin(angle) * (1.2 + random() * 0.4),
        z: (random() - 0.5) * 1.4,
        s: 0.04 + random() * 0.05,
        mat: rockDark
      });
    }
    floating.forEach((f) => {
      const mesh = new THREE.Mesh(rockGeo, f.mat);
      mesh.scale.setScalar(f.s);
      artwork.add(mesh);
      floatRocks.push({
        mesh, x: f.x, y: f.y, z: f.z,
        speed: 0.25 + random() * 0.25,
        phase: random() * 6.28,
        spin: 0.05 + random() * 0.08,
        spin0: random() * 6.28
      });
    });

    scene.add(artwork);
    await pauseForBrowser();
    if (destroyed) return;

    // Soft pool of light on the floor
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 3.4),
      new THREE.MeshBasicMaterial({
        map: makeGlowTexture(), transparent: true, opacity: 0.6,
        blending: THREE.AdditiveBlending, depthWrite: false
      })
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(0.2, GROUND_Y, 0.3);
    scene.add(glow);

    // Particles drifting along curved paths
    const count = lowPower ? 14 : 36;
    const palette = [0x91d7ff, 0xa99aff, 0xf0a4e0, 0xffffff].map((c) => new THREE.Color(c));
    const pPos = new Float32Array(count * 3);
    const pCol = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const color = palette[i % palette.length];
      pCol[i * 3] = color.r;
      pCol[i * 3 + 1] = color.g;
      pCol[i * 3 + 2] = color.b;
      particleData.push({
        r: 2.3 + random() * 1.9,
        phase: random() * 6.28,
        speed: (0.04 + random() * 0.05) * (random() > 0.5 ? 1 : -1),
        squash: 0.4 + random() * 0.3
      });
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
    particles = new THREE.Points(pGeo, new THREE.PointsMaterial({
      size: 0.09, map: sprite, vertexColors: true, transparent: true,
      opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    particles.frustumCulled = false;
    scene.add(particles);

    // Background stars (fixed)
    const starCount = lowPower ? 160 : 320;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      starPos[i * 3] = (random() - 0.5) * 26;
      starPos[i * 3 + 1] = (random() - 0.5) * 14;
      starPos[i * 3 + 2] = -6 - random() * 8;
    }
    const sGeo = new THREE.BufferGeometry();
    sGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    scene.add(new THREE.Points(sGeo, new THREE.PointsMaterial({
      size: 0.07, map: sprite, color: 0xc8d8ff, transparent: true,
      opacity: 0.8, depthWrite: false
    })));
  }

  /* ---------- Motion ---------- */
  // Every position is calculated from the time value, so nothing slowly drifts away.
  function update(t) {
    artwork.position.set(Math.sin(t * 0.31) * 0.05, BASE_Y + Math.sin(t * 0.5) * 0.09, 0);
    artwork.rotation.set(
      0.05 + Math.sin(t * 0.09) * 0.03,
      Math.sin(t * 0.12) * 0.22,
      Math.sin(t * 0.07) * 0.02
    );

    reflection.position.set(artwork.position.x, 2 * GROUND_Y - artwork.position.y, 0);
    reflection.rotation.set(-artwork.rotation.x, artwork.rotation.y, -artwork.rotation.z);

    ringA.rotation.z = -0.2 + Math.sin(t * 0.05) * 0.03;
    ringB.rotation.z = 0.5 + Math.sin(t * 0.037) * 0.05;

    bodies.forEach((b) => {
      const th = b.theta + b.speed * t;
      b.mesh.position.set(
        RING_RX * Math.cos(th),
        RING_RY * Math.sin(th) + Math.sin(t * 0.4 + b.phase) * 0.05,
        0
      );
    });

    floatRocks.forEach((r) => {
      r.mesh.position.set(r.x, r.y + Math.sin(t * r.speed + r.phase) * 0.08, r.z);
      r.mesh.rotation.set(r.spin0 + t * r.spin, r.spin0 * 0.7 + t * r.spin * 1.3, 0);
    });

    const attr = particles.geometry.attributes.position;
    particleData.forEach((p, i) => {
      const a = p.phase + p.speed * t;
      attr.setXYZ(
        i,
        Math.cos(a) * p.r,
        Math.sin(a) * p.r * p.squash + Math.sin(a * 2 + p.phase) * 0.2 + BASE_Y,
        Math.sin(a * 0.7 + p.phase) * 1.2
      );
    });
    attr.needsUpdate = true;

    keyLight.position.x = -4 + Math.sin(t * 0.2) * 1.5;
    fillLight.position.x = 4 + Math.cos(t * 0.17) * 1.2;
    rimLight.position.y = 3 + Math.sin(t * 0.13) * 1;
  }

  /* ---------- Size ---------- */
  function resize() {
    if (destroyed || !renderer) return;
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (!width || !height) return;

    renderer.setSize(width, height, false);
    camera.aspect = width / height;

    // Pick the camera distance that fits the whole scene in the canvas
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const distW = FIT_W / (2 * t * camera.aspect);
    const distH = FIT_H / (2 * t);
    camera.position.set(0, CAM_Y, Math.max(distW, distH));
    camera.lookAt(0, CAM_Y, 0);
    camera.updateProjectionMatrix();

    if (reducedMotion.matches || !running) drawStill();
  }

  function drawStill() {
    if (destroyed || !renderer) return;
    update(reducedMotion.matches ? STILL_TIME : time);
    renderer.render(scene, camera);
  }

  /* ---------- Play / pause ---------- */
  function frame(now) {
    rafId = 0;
    if (!running || destroyed) return;
    time += Math.min((now - lastNow) / 1000, 0.05);
    lastNow = now;
    update(time);
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(frame);
  }

  function play() {
    if (running || destroyed || reducedMotion.matches || !visible || document.hidden) return;
    running = true;
    lastNow = performance.now();
    rafId = requestAnimationFrame(frame);
  }

  function pause() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function onVisibilityChange() {
    if (document.hidden) pause();
    else play();
  }

  function onMotionChange() {
    if (reducedMotion.matches) {
      pause();
      drawStill();
    } else {
      play();
    }
  }

  /* ---------- Cleanup ---------- */
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    pause();
    if (resizeObserver) resizeObserver.disconnect();
    if (visibilityObserver) visibilityObserver.disconnect();
    document.removeEventListener('visibilitychange', onVisibilityChange);
    if (reducedMotion.removeEventListener) {
      reducedMotion.removeEventListener('change', onMotionChange);
    }
    scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const list = Array.isArray(obj.material) ? obj.material : [obj.material];
        list.forEach((m) => {
          if (m.map) m.map.dispose();
          m.dispose();
        });
      }
    });
    if (envTarget) envTarget.dispose();
    if (renderer) renderer.dispose();
  }

  function showFallback() {
    destroy();
    container.classList.add('hero-3d-unavailable');
  }

  /* ---------- Start ---------- */
  async function start() {
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: !lowPower,
        powerPreference: 'high-performance'
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1.25 : 2));
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;

      canvas.addEventListener('webglcontextlost', (event) => {
        event.preventDefault();
        showFallback();
      });

      await buildScene();
      if (destroyed) return;

      // Compile the shaders without freezing the page (only if this Three.js version has it).
      if (typeof renderer.compileAsync === 'function') {
        try {
          await renderer.compileAsync(scene, camera);
        } catch (compileError) {
          // The first render will compile them instead.
        }
        if (destroyed) return;
      }

      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(container);

      visibilityObserver = new IntersectionObserver((entries) => {
        visible = entries[0].isIntersecting;
        if (visible) play();
        else pause();
      });
      visibilityObserver.observe(container);

      document.addEventListener('visibilitychange', onVisibilityChange);
      if (reducedMotion.addEventListener) {
        reducedMotion.addEventListener('change', onMotionChange);
      }
      window.addEventListener('pagehide', destroy, { once: true });

      resize();
      drawStill();
      play();
    } catch (error) {
      console.error('ARC 3D scene could not start:', error);
      showFallback();
    }
  }

  start();
})();