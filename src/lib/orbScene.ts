import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { BokehPass } from "three/addons/postprocessing/BokehPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

export interface OrbSceneApi {
  /** Rotate the camera around the orb by the given angles (radians). */
  rotateBy(deltaTheta: number, deltaPhi: number): void;
  /** Multiply the camera distance by `factor` (<1 zooms in, >1 zooms out). */
  zoomBy(factor: number): void;
  zoomIn(): void;
  zoomOut(): void;
  resetView(): void;
  setAudioEnergy(level: number): void;
  setTheme(theme: "amber" | "crimson_red" | "cyan"): void;
  dispose(): void;
}

const HOME_POSITION = new THREE.Vector3(0, 0.5, 5.5);
const MIN_DISTANCE = 0.6;
const MAX_DISTANCE = 40;

export function createOrbScene(container: HTMLElement): OrbSceneApi {
  const width = container.clientWidth;
  const height = container.clientHeight;

  // ——— SCENE ———
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 500);
  camera.position.copy(HOME_POSITION);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.8;
  container.appendChild(renderer.domElement);

  // ——— POST PROCESSING ———
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloom = new UnrealBloomPass(
    new THREE.Vector2(width, height),
    1.8, // strength
    0.4, // radius
    0.2, // threshold
  );
  composer.addPass(bloom);

  // Subtle cinematic Depth of Field (BokehPass)
  // Keeps the central black hole orb sharp while softly diffusing far cosmic dust & background satellites
  const bokehPass = new BokehPass(scene, camera, {
    focus: HOME_POSITION.length(),
    aperture: 0.00015,
    maxblur: 0.01,
  });
  composer.addPass(bokehPass);

  // Chromatic aberration + color grade shader (Interstellar Dark Cosmic Tone)
  const colorTintUniform = { value: new THREE.Vector3(0.75, 0.65, 1.25) };
  const chromaticShader = {
    uniforms: {
      tDiffuse: { value: null },
      uTime: { value: 0 },
      uIntensity: { value: 0.003 },
      uColorTint: colorTintUniform,
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform float uTime;
      uniform float uIntensity;
      uniform vec3 uColorTint;
      varying vec2 vUv;
      void main() {
        vec2 dir = vUv - vec2(0.5);
        float d = length(dir);
        float offset = uIntensity * d;
        // Subtle deep-space cosmic flicker
        float flicker = 1.0 + 0.015 * sin(uTime * 24.0) * sin(uTime * 6.5);
        vec4 cr = texture2D(tDiffuse, vUv + dir * offset);
        vec4 cg = texture2D(tDiffuse, vUv);
        vec4 cb = texture2D(tDiffuse, vUv - dir * offset * 0.6);
        gl_FragColor = vec4(cr.r * 0.85, cg.g * 0.9, cb.b * 1.35, 1.0) * flicker;
        // Deep interstellar cosmic tint
        gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * uColorTint, 0.45);
      }
    `,
  };
  const chromaticPass = new ShaderPass(chromaticShader);
  composer.addPass(chromaticPass);

  // Controls
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.04;
  controls.minDistance = MIN_DISTANCE;
  controls.maxDistance = MAX_DISTANCE;
  controls.zoomSpeed = 1.4;
  controls.enablePan = false;

  // ——— COLORS ——— (Interstellar Black Hole: 75% dark cosmic void, 25% glowing accretion light)
  const C_BLACK_HOLE = 0x000000;
  const C_VOID = 0x070714;
  const C_FAINT = 0x16132b;
  const C_DIM = 0x271f45;
  const C_MID = 0x4c3575;
  const C_BRIGHT = 0x7c3aed; // Deep Violet
  const C_HOT = 0x38bdf8;    // Electric Cyan Accretion Ring
  const C_PHOTON = 0xe0f2fe; // White-hot photon edge

  // ——— ORB ROOT ———
  // Every part of the orb (shells, core, orbiting debris, text, dust, rings)
  // lives under this group.
  const orbGroup = new THREE.Group();
  scene.add(orbGroup);

  // ——— MATERIAL HELPERS ———
  function lineMat(color: number, opacity = 1) {
    return new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  }

  // ——— UTILITY: Create ring at latitude ———
  function latRing(radius: number, lat: number, segs = 120) {
    const r = radius * Math.cos(lat);
    const y = radius * Math.sin(lat);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      pts.push(new THREE.Vector3(r * Math.cos(a), y, r * Math.sin(a)));
    }
    return new THREE.BufferGeometry().setFromPoints(pts);
  }

  // ——— UTILITY: Create meridian ———
  function meridian(radius: number, lon: number, segs = 120) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= segs; i++) {
      const lat = (i / segs) * Math.PI - Math.PI / 2;
      pts.push(
        new THREE.Vector3(
          radius * Math.cos(lat) * Math.cos(lon),
          radius * Math.sin(lat),
          radius * Math.cos(lat) * Math.sin(lon),
        ),
      );
    }
    return new THREE.BufferGeometry().setFromPoints(pts);
  }

  // ═══════════════════════════════════════════════
  // LAYER 1: OUTER SHELL — dense wireframe grid
  // ═══════════════════════════════════════════════
  const outerShell = new THREE.Group();
  const R1 = 2.0;

  // Dense latitude rings (30+)
  for (let i = -15; i <= 15; i++) {
    const lat = (i / 15) * (Math.PI / 2) * 0.95;
    const opacity = i % 3 === 0 ? 0.5 : 0.12;
    const color = i % 3 === 0 ? C_MID : C_FAINT;
    outerShell.add(new THREE.Line(latRing(R1, lat), lineMat(color, opacity)));
  }

  // Dense meridians (24)
  for (let i = 0; i < 24; i++) {
    const lon = (i / 24) * Math.PI * 2;
    const isMajor = i % 6 === 0;
    outerShell.add(
      new THREE.Line(
        meridian(R1, lon),
        lineMat(isMajor ? C_MID : C_FAINT, isMajor ? 0.6 : 0.1),
      ),
    );
  }

  // 4 bright cross meridians (the "plus" shape) — wide bands
  const CROSS_LINES = 18;
  const CROSS_SPREAD = 0.25; // radians total width
  for (let i = 0; i < 4; i++) {
    const lon = (i / 4) * Math.PI * 2;
    for (let j = 0; j < CROSS_LINES; j++) {
      const t = (j / (CROSS_LINES - 1)) * 2 - 1; // -1 to 1
      const offset = (t * CROSS_SPREAD) / 2;
      const falloff = 1 - Math.abs(t) * 0.7; // brighter at center, dimmer at edges
      const opacity = 0.85 * falloff;
      const color = Math.abs(t) < 0.3 ? C_BRIGHT : C_MID;
      outerShell.add(
        new THREE.Line(meridian(R1, lon + offset, 200), lineMat(color, opacity)),
      );
    }
  }

  // Bright equator band — wide
  const EQ_LINES = 20;
  const EQ_SPREAD = 0.35;
  for (let j = 0; j < EQ_LINES; j++) {
    const t = (j / (EQ_LINES - 1)) * 2 - 1;
    const offset = (t * EQ_SPREAD) / 2;
    const falloff = 1 - Math.abs(t) * 0.65;
    const opacity = 0.8 * falloff;
    const color = Math.abs(t) < 0.3 ? C_BRIGHT : C_MID;
    outerShell.add(
      new THREE.Line(latRing(R1, offset, 200), lineMat(color, opacity)),
    );
  }

  orbGroup.add(outerShell);

  // ═══════════════════════════════════════════════
  // LAYER 2: GRID PANELS on the sphere surface
  // ═══════════════════════════════════════════════
  const panelGroup = new THREE.Group();

  function createSpherePanel(
    latCenter: number,
    lonCenter: number,
    latSpan: number,
    lonSpan: number,
    radius: number,
    divisions = 4,
  ) {
    const group = new THREE.Group();
    const mat = lineMat(C_DIM, 0.25);

    // horizontal lines
    for (let i = 0; i <= divisions; i++) {
      const lat = latCenter - latSpan / 2 + (i / divisions) * latSpan;
      const pts: THREE.Vector3[] = [];
      for (let j = 0; j <= divisions * 4; j++) {
        const lon = lonCenter - lonSpan / 2 + (j / (divisions * 4)) * lonSpan;
        pts.push(
          new THREE.Vector3(
            radius * Math.cos(lat) * Math.cos(lon),
            radius * Math.sin(lat),
            radius * Math.cos(lat) * Math.sin(lon),
          ),
        );
      }
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
    }

    // vertical lines
    for (let j = 0; j <= divisions; j++) {
      const lon = lonCenter - lonSpan / 2 + (j / divisions) * lonSpan;
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= divisions * 4; i++) {
        const lat = latCenter - latSpan / 2 + (i / (divisions * 4)) * latSpan;
        pts.push(
          new THREE.Vector3(
            radius * Math.cos(lat) * Math.cos(lon),
            radius * Math.sin(lat),
            radius * Math.cos(lat) * Math.sin(lon),
          ),
        );
      }
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
    }

    return group;
  }

  // Scatter panels across the sphere
  for (let i = 0; i < 30; i++) {
    const lat = (Math.random() - 0.5) * Math.PI * 0.8;
    const lon = Math.random() * Math.PI * 2;
    const size = 0.15 + Math.random() * 0.25;
    const panel = createSpherePanel(
      lat,
      lon,
      size,
      size,
      R1 + 0.01,
      3 + Math.floor(Math.random() * 3),
    );
    panelGroup.add(panel);
  }
  orbGroup.add(panelGroup);

  // ═══════════════════════════════════════════════
  // LAYER 3: SECONDARY SHELL — offset, partial arcs
  // ═══════════════════════════════════════════════
  const shell2 = new THREE.Group();
  const R2 = 2.12;

  // Partial arcs at random latitudes
  for (let i = 0; i < 16; i++) {
    const lat = (Math.random() - 0.5) * Math.PI * 0.85;
    const startLon = Math.random() * Math.PI * 2;
    const arcLen = 0.3 + Math.random() * 1.2;
    const pts: THREE.Vector3[] = [];
    const segs = 60;
    const r = R2 * Math.cos(lat);
    const y = R2 * Math.sin(lat);
    for (let j = 0; j <= segs; j++) {
      const a = startLon + (j / segs) * arcLen;
      pts.push(new THREE.Vector3(r * Math.cos(a), y, r * Math.sin(a)));
    }
    shell2.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        lineMat(C_MID, 0.2 + Math.random() * 0.3),
      ),
    );
  }

  // Partial meridian arcs
  for (let i = 0; i < 12; i++) {
    const lon = Math.random() * Math.PI * 2;
    const startLat = (Math.random() - 0.5) * Math.PI * 0.8;
    const arcLen = 0.3 + Math.random() * 0.8;
    const pts: THREE.Vector3[] = [];
    const segs = 40;
    for (let j = 0; j <= segs; j++) {
      const lat = startLat + (j / segs) * arcLen;
      pts.push(
        new THREE.Vector3(
          R2 * Math.cos(lat) * Math.cos(lon),
          R2 * Math.sin(lat),
          R2 * Math.cos(lat) * Math.sin(lon),
        ),
      );
    }
    shell2.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        lineMat(C_DIM, 0.15 + Math.random() * 0.2),
      ),
    );
  }
  orbGroup.add(shell2);

  // ═══════════════════════════════════════════════
  // LAYER 4: INNER CORE — spiral geodesic
  // ═══════════════════════════════════════════════
  const innerCore = new THREE.Group();
  const R3 = 0.9;

  // Dense spirals
  for (let s = 0; s < 8; s++) {
    const pts: THREE.Vector3[] = [];
    const turns = 3 + Math.random() * 2;
    const segs = 300;
    const phase = (s / 8) * Math.PI * 2;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const lat = t * Math.PI - Math.PI / 2;
      const lon = t * turns * Math.PI * 2 + phase;
      pts.push(
        new THREE.Vector3(
          R3 * Math.cos(lat) * Math.cos(lon),
          R3 * Math.sin(lat),
          R3 * Math.cos(lat) * Math.sin(lon),
        ),
      );
    }
    innerCore.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        lineMat(C_BRIGHT, 0.3 + Math.random() * 0.2),
      ),
    );
  }

  // Inner latitude rings
  for (let i = -6; i <= 6; i++) {
    const lat = (i / 6) * (Math.PI / 2) * 0.9;
    innerCore.add(new THREE.Line(latRing(R3, lat, 80), lineMat(C_DIM, 0.2)));
  }

  // Inner meridians
  for (let i = 0; i < 12; i++) {
    const lon = (i / 12) * Math.PI * 2;
    innerCore.add(new THREE.Line(meridian(R3, lon, 80), lineMat(C_DIM, 0.15)));
  }

  orbGroup.add(innerCore);

  // ═══════════════════════════════════════════════
  // LAYER 5: INTERSTELLAR BLACK HOLE SINGULARITY
  // 75% Dark Event Horizon with Glowing Accretion Disk
  // ═══════════════════════════════════════════════
  const blackHoleGroup = new THREE.Group();
  orbGroup.add(blackHoleGroup);

  // 1. True Pitch-Black Event Horizon (absorbs all light)
  const eventHorizonGeo = new THREE.SphereGeometry(0.44, 32, 32);
  const eventHorizonMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    depthWrite: true,
  });
  const eventHorizon = new THREE.Mesh(eventHorizonGeo, eventHorizonMat);
  blackHoleGroup.add(eventHorizon);

  // 2. High-energy Photon Ring (razor-sharp glowing border of the black hole)
  const photonRingGeo = new THREE.RingGeometry(0.445, 0.47, 128);
  const photonRingMat = new THREE.MeshBasicMaterial({
    color: C_PHOTON,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const photonRing = new THREE.Mesh(photonRingGeo, photonRingMat);
  blackHoleGroup.add(photonRing);

  // 3. Interstellar Hollow Accretion Rings (Alternating Neon Blue & Purplish Blue)
  const C_NEON_BLUE = 0x00f0ff;     // Vivid electric neon blue
  const C_PURPLISH_BLUE = 0x705df2; // Deep cosmic purplish blue

  const accretionRingGroup = new THREE.Group();
  accretionRingGroup.rotation.x = Math.PI / 2.3;
  accretionRingGroup.rotation.y = Math.PI / 12;
  blackHoleGroup.add(accretionRingGroup);

  const accretionRings: THREE.Mesh[] = [];
  const accretionRingConfigs = [
    { inner: 0.54, outer: 0.57, color: C_NEON_BLUE, opacity: 0.85 },
    { inner: 0.70, outer: 0.73, color: C_PURPLISH_BLUE, opacity: 0.75 },
    { inner: 0.88, outer: 0.91, color: C_NEON_BLUE, opacity: 0.70 },
    { inner: 1.08, outer: 1.11, color: C_PURPLISH_BLUE, opacity: 0.65 },
    { inner: 1.28, outer: 1.31, color: C_NEON_BLUE, opacity: 0.50 },
    { inner: 1.48, outer: 1.50, color: C_PURPLISH_BLUE, opacity: 0.40 },
  ];

  accretionRingConfigs.forEach((cfg) => {
    const geo = new THREE.RingGeometry(cfg.inner, cfg.outer, 128);
    const mat = new THREE.MeshBasicMaterial({
      color: cfg.color,
      transparent: true,
      opacity: cfg.opacity,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ringMesh = new THREE.Mesh(geo, mat);
    accretionRings.push(ringMesh);
    accretionRingGroup.add(ringMesh);
  });

  // 4. Gravitational Lensing Hollow Rings (Tilted Warped Interstellar Arches)
  const lensingRingGroup = new THREE.Group();
  lensingRingGroup.rotation.x = Math.PI / 3.5;
  lensingRingGroup.rotation.y = Math.PI / 2.8;
  blackHoleGroup.add(lensingRingGroup);

  const lensingRings: THREE.Mesh[] = [];
  const lensingRingConfigs = [
    { inner: 0.62, outer: 0.65, color: C_PURPLISH_BLUE, opacity: 0.75 },
    { inner: 0.85, outer: 0.88, color: C_NEON_BLUE, opacity: 0.70 },
    { inner: 1.10, outer: 1.13, color: C_PURPLISH_BLUE, opacity: 0.60 },
    { inner: 1.34, outer: 1.37, color: C_NEON_BLUE, opacity: 0.45 },
  ];

  lensingRingConfigs.forEach((cfg) => {
    const geo = new THREE.RingGeometry(cfg.inner, cfg.outer, 128);
    const mat = new THREE.MeshBasicMaterial({
      color: cfg.color,
      transparent: true,
      opacity: cfg.opacity,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ringMesh = new THREE.Mesh(geo, mat);
    lensingRings.push(ringMesh);
    lensingRingGroup.add(ringMesh);
  });

  // 5. Icosahedron Quantum Core Wireframe
  const icoGeo = new THREE.IcosahedronGeometry(0.46, 1);
  const icoEdges = new THREE.EdgesGeometry(icoGeo);
  const icoWireMat = lineMat(C_HOT, 0.7);
  const icoWire = new THREE.LineSegments(icoEdges, icoWireMat);
  blackHoleGroup.add(icoWire);

  // Outer Dark Ergosphere Glow
  const glowSphereMat = new THREE.MeshBasicMaterial({
    color: C_BRIGHT,
    transparent: true,
    opacity: 0.08,
    blending: THREE.AdditiveBlending,
  });
  const glowSphere = new THREE.Mesh(new THREE.SphereGeometry(0.68, 24, 24), glowSphereMat);
  blackHoleGroup.add(glowSphere);

  // ═══════════════════════════════════════════════
  // INTERSTELLAR CODE & COSMIC DATA STRINGS
  // ═══════════════════════════════════════════════
  const codeSnippets = [
    "D.A.R.K.", "SINGULARITY", "EVENT_HORIZON", "0x000000", "GARGANTUA",
    "PHOTON_RING", "GRAVITY_WELL", "SCHWARZSCHILD", "VOID_CORE", "REDMI.LINK",
    "METRIC_TENSOR", "QUANTUM_FOAM", "ERGOSPHERE", "DARK_MATTER", "ENTROPY_0",
    "MASS: 4.2e6", "HAWKING_RAD", "GEODESIC", "C_VACUUM", "TIME_DILATE",
    "CHANDRA", "SPACETIME", "WARP_DRIVE", "HORIZON_LOCK", "ADB_DAEMON",
    "SYS_OVERRIDE", "NO_STRINGS", "BLACK_HOLE", "CORE_STABLE", "0xFF_VOID"
  ];

  interface SpriteDrift {
    phi: number;
    theta: number;
    r: number;
    speed: number;
  }

  function makeTextSprite(text: string, size = 0.08) {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 32;
    const ctx = c.getContext("2d")!;
    ctx.font = "bold 14px Courier New";
    const alpha = 0.35 + Math.random() * 0.55;
    ctx.fillStyle = `rgba(${(100 + Math.random() * 70) | 0}, ${(180 + Math.random() * 75) | 0}, 255, ${alpha})`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 128, 16);
    const tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearFilter;
    const s = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    s.scale.set(size * 5, size * 0.7, 1);
    return s;
  }

  function scatterText(count: number, sizeFn: () => number, rFn: () => number, speedScale: [number, number]) {
    const group = new THREE.Group();
    for (let i = 0; i < count; i++) {
      const sp = makeTextSprite(
        codeSnippets[Math.floor(Math.random() * codeSnippets.length)],
        sizeFn(),
      );
      const phi = Math.acos(2 * Math.random() - 1);
      const theta = Math.random() * Math.PI * 2;
      const r = rFn();
      sp.position.set(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta),
      );
      sp.userData = {
        phi,
        theta,
        r,
        speed:
          (speedScale[0] + Math.random() * speedScale[1]) *
          (Math.random() > 0.5 ? 1 : -1),
      } satisfies SpriteDrift;
      group.add(sp);
    }
    return group;
  }

  // On outer sphere — dense text coverage
  const textOuter = scatterText(
    1200,
    () => 0.04 + Math.random() * 0.04,
    () => R1 + 0.03 + Math.random() * 0.08,
    [0.0002, 0.0008],
  );
  orbGroup.add(textOuter);

  // On inner core — more text
  const textInner = scatterText(
    100,
    () => 0.03 + Math.random() * 0.03,
    () => R3 + 0.02,
    [0.0005, 0.001],
  );
  orbGroup.add(textInner);

  // Floating ambient text between shells
  const textAmbient = scatterText(
    400,
    () => 0.03,
    () => R3 + 0.2 + Math.random() * (R1 - R3 - 0.3),
    [0.0003, 0.0006],
  );
  orbGroup.add(textAmbient);

  // ═══════════════════════════════════════════════
  // ORBITING DEBRIS / ROCKS
  // ═══════════════════════════════════════════════
  // Shared geometries for performance — reuse across 250 satellites
  const debrisGeos = [
    new THREE.IcosahedronGeometry(0.012, 0),
    new THREE.IcosahedronGeometry(0.02, 0),
    new THREE.IcosahedronGeometry(0.03, 1),
    new THREE.IcosahedronGeometry(0.008, 0),
    new THREE.TetrahedronGeometry(0.015, 0),
    new THREE.OctahedronGeometry(0.018, 0),
  ];
  interface DebrisOrbit {
    orbitR: number;
    speed: number;
    tiltX: number;
    tiltZ: number;
    phase: number;
  }
  const debris: THREE.Mesh[] = [];
  for (let i = 0; i < 250; i++) {
    const geo = debrisGeos[Math.floor(Math.random() * debrisGeos.length)];
    const mat = new THREE.MeshBasicMaterial({
      color: Math.random() > 0.7 ? C_BRIGHT : C_MID,
      transparent: true,
      opacity: 0.3 + Math.random() * 0.6,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geo, mat);
    const orbitR = 1.2 + Math.random() * 4.0;
    const speed = (0.08 + Math.random() * 0.6) * (Math.random() > 0.5 ? 1 : -1);
    const tiltX = (Math.random() - 0.5) * Math.PI * 0.9;
    const tiltZ = (Math.random() - 0.5) * Math.PI * 0.5;
    const phase = Math.random() * Math.PI * 2;
    mesh.userData = { orbitR, speed, tiltX, tiltZ, phase } satisfies DebrisOrbit;
    debris.push(mesh);
    orbGroup.add(mesh);

    // ~15% get a faint trailing line
    if (Math.random() > 0.85) {
      const trailPts: THREE.Vector3[] = [];
      for (let j = 0; j <= 15; j++) {
        const a = -(j / 15) * 0.3;
        trailPts.push(
          new THREE.Vector3(
            orbitR * Math.cos(a + phase),
            orbitR * 0.08 * Math.sin(a * 3),
            orbitR * Math.sin(a + phase),
          ),
        );
      }
      const trail = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(trailPts),
        lineMat(C_FAINT, 0.08),
      );
      mesh.add(trail);
    }
  }

  // ═══════════════════════════════════════════════
  // DUST PARTICLES — lots of them
  // ═══════════════════════════════════════════════
  const dustCount = 2000;
  const dustPos = new Float32Array(dustCount * 3);

  for (let i = 0; i < dustCount; i++) {
    // Concentrate near the sphere, sparse further out
    const rr = 0.5 + Math.pow(Math.random(), 0.6) * 7;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    dustPos[i * 3] = rr * Math.sin(phi) * Math.cos(theta);
    dustPos[i * 3 + 1] = rr * Math.cos(phi);
    dustPos[i * 3 + 2] = rr * Math.sin(phi) * Math.sin(theta);
  }

  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute("position", new THREE.Float32BufferAttribute(dustPos, 3));

  // Soft dot texture
  const dotC = document.createElement("canvas");
  dotC.width = dotC.height = 64;
  const dCtx = dotC.getContext("2d")!;
  const g = dCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(56,189,248,1)");
  g.addColorStop(0.25, "rgba(168,85,247,0.65)");
  g.addColorStop(0.6, "rgba(20,15,45,0.2)");
  g.addColorStop(1, "rgba(5,5,15,0)");
  dCtx.fillStyle = g;
  dCtx.fillRect(0, 0, 64, 64);

  const dustMat = new THREE.PointsMaterial({
    map: new THREE.CanvasTexture(dotC),
    size: 0.04,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
    color: C_HOT,
  });
  const dustPoints = new THREE.Points(dustGeo, dustMat);
  orbGroup.add(dustPoints);

  // ═══════════════════════════════════════════════
  // SCANNING RINGS
  // ═══════════════════════════════════════════════
  function makeScanRing(radius: number, thickness = 0.015) {
    const geo = new THREE.RingGeometry(radius - thickness, radius + thickness, 120);
    const mat = new THREE.MeshBasicMaterial({
      color: C_BRIGHT,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = Math.PI / 2;
    return mesh;
  }

  const scanRing1 = makeScanRing(R1, 0.01);
  const scanRing2 = makeScanRing(R1 * 0.7, 0.008);
  orbGroup.add(scanRing1, scanRing2);

  // ═══════════════════════════════════════════════
  // HEXAGONAL NODES — small tech details
  // ═══════════════════════════════════════════════
  for (let i = 0; i < 15; i++) {
    const phi = Math.acos(2 * Math.random() - 1);
    const theta = Math.random() * Math.PI * 2;
    const r = R1 + 0.02;
    const hexGeo = new THREE.CircleGeometry(0.03 + Math.random() * 0.02, 6);
    const hexEdges = new THREE.EdgesGeometry(hexGeo);
    const hex = new THREE.LineSegments(hexEdges, lineMat(C_MID, 0.5));
    hex.position.set(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi),
      r * Math.sin(phi) * Math.sin(theta),
    );
    hex.lookAt(0, 0, 0);
    outerShell.add(hex);
  }

  // ═══════════════════════════════════════════════
  // GESTURE / PROGRAMMATIC CAMERA CONTROL
  // ═══════════════════════════════════════════════
  const sphericalScratch = new THREE.Spherical();
  const offsetScratch = new THREE.Vector3();

  function rotateBy(deltaTheta: number, deltaPhi: number) {
    offsetScratch.copy(camera.position).sub(controls.target);
    sphericalScratch.setFromVector3(offsetScratch);
    sphericalScratch.theta -= deltaTheta;
    sphericalScratch.phi = THREE.MathUtils.clamp(
      sphericalScratch.phi - deltaPhi,
      0.05,
      Math.PI - 0.05,
    );
    sphericalScratch.makeSafe();
    offsetScratch.setFromSpherical(sphericalScratch);
    camera.position.copy(controls.target).add(offsetScratch);
    camera.lookAt(controls.target);
  }

  function zoomBy(factor: number) {
    offsetScratch.copy(camera.position).sub(controls.target);
    const dist = THREE.MathUtils.clamp(
      offsetScratch.length() * factor,
      MIN_DISTANCE,
      MAX_DISTANCE,
    );
    offsetScratch.setLength(dist);
    camera.position.copy(controls.target).add(offsetScratch);
  }

  function resetView() {
    camera.position.copy(HOME_POSITION);
    controls.target.set(0, 0, 0);
    camera.lookAt(controls.target);
    controls.update();
  }

  // ═══════════════════════════════════════════════
  // ANIMATION
  // ═══════════════════════════════════════════════
  const clock = new THREE.Clock();
  let flickerTimer = 0;
  let rafId = 0;
  let disposed = false;
  let currentAudioEnergy = 0;
  let targetAudioEnergy = 0;

  function setAudioEnergy(level: number) {
    targetAudioEnergy = Math.max(0, Math.min(1.5, level));
  }

  function setTheme(theme: "amber" | "crimson_red" | "cyan") {
    if (theme === "crimson_red") {
      colorTintUniform.value.set(1.5, 0.25, 0.45); // Dark Cosmic Crimson
      accretionRings.forEach((r, idx) => {
        (r.material as THREE.MeshBasicMaterial).color.setHex(idx % 2 === 0 ? 0xff1144 : 0x990033);
      });
      lensingRings.forEach((r, idx) => {
        (r.material as THREE.MeshBasicMaterial).color.setHex(idx % 2 === 0 ? 0xff4477 : 0xaa0044);
      });
      photonRingMat.color.setHex(0xff3366);
      icoWireMat.color.setHex(0xff2255);
    } else {
      colorTintUniform.value.set(0.65, 0.85, 1.35); // Deep Interstellar Cyan/Violet
      accretionRings.forEach((r, idx) => {
        (r.material as THREE.MeshBasicMaterial).color.setHex(idx % 2 === 0 ? C_NEON_BLUE : C_PURPLISH_BLUE);
      });
      lensingRings.forEach((r, idx) => {
        (r.material as THREE.MeshBasicMaterial).color.setHex(idx % 2 === 0 ? C_PURPLISH_BLUE : C_NEON_BLUE);
      });
      photonRingMat.color.setHex(C_PHOTON);
      icoWireMat.color.setHex(C_HOT);
    }
  }

  function animate() {
    if (disposed) return;
    rafId = requestAnimationFrame(animate);
    const t = clock.getElapsedTime();

    // Smooth audio reactivity
    currentAudioEnergy += (targetAudioEnergy - currentAudioEnergy) * 0.25;

    // Dynamic cinematic Depth-of-Field tracking (keeps central orb in razor focus)
    const distToCenter = camera.position.distanceTo(controls.target);
    const bokehUniforms = bokehPass.uniforms as Record<string, { value: any }>;
    if (bokehUniforms["focus"]) {
      bokehUniforms["focus"].value = distToCenter;
    }

    // ——— LIVING HOLOGRAPHIC BREATHING / PULSE ANIMATION ———
    // Organic respiration cycle (~4.0s) with layered harmonic sines to feel alive
    const breathPhase = t * 1.55;
    const primaryBreath = Math.sin(breathPhase);
    const secondaryHarmonic = Math.sin(breathPhase * 0.5 + 0.6) * 0.25;
    const organicBreath = (primaryBreath + secondaryHarmonic) * 0.032; // ±3.2% subtle living breath

    // Zero-g micro levitation float
    orbGroup.position.y = Math.sin(t * 0.85) * 0.025;

    // Layered breathing propagation across holographic shells
    const outerBreath = Math.sin(breathPhase - 0.45) * 0.022;
    outerShell.scale.setScalar(1 + outerBreath + currentAudioEnergy * 0.08);
    panelGroup.scale.setScalar(1 + outerBreath * 1.05 + currentAudioEnergy * 0.08);
    shell2.scale.setScalar(1 + Math.sin(breathPhase - 0.3) * 0.025 + currentAudioEnergy * 0.06);

    // Inner Core lattice breathing
    innerCore.scale.setScalar(1 + Math.sin(breathPhase - 0.15) * 0.03 + currentAudioEnergy * 0.12);

    // Central Black Hole Singularity living pulse
    blackHoleGroup.scale.setScalar(1 + organicBreath + currentAudioEnergy * 0.18);

    // Outer shell rotation (spins faster when speaking)
    outerShell.rotation.y += 0.0015 + currentAudioEnergy * 0.004;
    outerShell.rotation.x = Math.sin(t * 0.08) * 0.05;

    // Panel group follows shell but with slight offset
    panelGroup.rotation.y += 0.0018 + currentAudioEnergy * 0.005;
    panelGroup.rotation.x = Math.sin(t * 0.08 + 0.5) * 0.04;

    // Secondary shell counter-rotates slowly
    shell2.rotation.y -= 0.001 + currentAudioEnergy * 0.003;
    shell2.rotation.z = Math.sin(t * 0.12) * 0.03;

    // Inner core — opposite, faster
    innerCore.rotation.y -= 0.005 + currentAudioEnergy * 0.015;
    innerCore.rotation.z += 0.002;
    innerCore.rotation.x = Math.cos(t * 0.1) * 0.08;

    // Innermost black hole wireframe
    icoWire.rotation.x += 0.006 + currentAudioEnergy * 0.02;
    icoWire.rotation.y += 0.01 + currentAudioEnergy * 0.025;

    // Interstellar Black Hole Hollow Accretion Rings Swirl
    accretionRingGroup.rotation.z += 0.007 + currentAudioEnergy * 0.02;
    accretionRings.forEach((r, i) => {
      r.rotation.z += (0.003 / (i + 1)) * (i % 2 === 0 ? 1 : -0.7);
    });

    // Gravitational Lensing Hollow Rings Swirl
    lensingRingGroup.rotation.z -= 0.005 + currentAudioEnergy * 0.015;
    lensingRings.forEach((r, i) => {
      r.rotation.z -= (0.002 / (i + 1)) * (i % 2 === 0 ? 1 : -0.5);
    });

    // Black Hole Event Horizon Living Pulse
    const wave1 = Math.sin(t * 1.2);
    const horizonBreath = Math.sin(breathPhase * 1.2) * 0.022;
    const horizonScale = 1 + horizonBreath + currentAudioEnergy * 0.18 + wave1 * 0.015;
    eventHorizon.scale.setScalar(horizonScale);

    // Accretion rings lighting & subtle radius respiration
    const ringBreath = Math.sin(breathPhase + 0.25) * 0.032;
    const ringGroupScale = 1 + ringBreath + currentAudioEnergy * 0.25 + Math.sin(t * 4) * 0.015;
    accretionRingGroup.scale.setScalar(ringGroupScale);

    // Lensing rings elastic breathing scale
    const lensBreath = Math.sin(breathPhase - 0.2) * 0.025;
    lensingRingGroup.scale.setScalar(1 + lensBreath + currentAudioEnergy * 0.2);

    // Photon ring & ergosphere glow breathing illumination
    photonRing.scale.setScalar(1 + Math.sin(breathPhase * 1.3) * 0.02 + currentAudioEnergy * 0.15);
    photonRingMat.opacity = Math.min(1.0, 0.78 + Math.sin(breathPhase) * 0.08 + currentAudioEnergy * 0.2);
    glowSphere.scale.setScalar(1 + organicBreath * 1.4 + currentAudioEnergy * 0.6);
    glowSphereMat.opacity = Math.max(0, 0.05 + Math.sin(breathPhase) * 0.02 + currentAudioEnergy * 0.25);

    // Debris orbits
    debris.forEach((d) => {
      const u = d.userData as DebrisOrbit;
      const a = t * u.speed + u.phase;
      d.position.set(
        u.orbitR * Math.cos(a) * Math.cos(u.tiltX),
        u.orbitR * Math.sin(u.tiltX) * Math.sin(a * 0.8) + Math.sin(a * 0.3 + u.tiltZ) * 0.2,
        u.orbitR * Math.sin(a) * Math.cos(u.tiltZ),
      );
      d.rotation.x += 0.015;
      d.rotation.z += 0.01;
    });

    // Text drift
    const driftGroups: [THREE.Group, number][] = [
      [textOuter, 1],
      [textInner, 2],
      [textAmbient, 1.2],
    ];
    for (const [group, mult] of driftGroups) {
      group.children.forEach((sp) => {
        const u = sp.userData as SpriteDrift;
        u.theta += u.speed * mult;
        sp.position.set(
          u.r * Math.sin(u.phi) * Math.cos(u.theta),
          u.r * Math.cos(u.phi),
          u.r * Math.sin(u.phi) * Math.sin(u.theta),
        );
      });
    }

    // Scan rings sweeping
    const scanY1 = Math.sin(t * 0.4) * R1;
    scanRing1.position.y = scanY1;
    const scanS1 = Math.sqrt(Math.max(0, R1 * R1 - scanY1 * scanY1)) / R1;
    scanRing1.scale.set(scanS1, scanS1, 1);
    (scanRing1.material as THREE.MeshBasicMaterial).opacity = 0.2 * scanS1;

    const scanY2 = Math.sin(t * 0.6 + 2) * R3;
    scanRing2.position.y = scanY2;
    const scanS2 = Math.sqrt(Math.max(0, R3 * R3 - scanY2 * scanY2)) / R3;
    scanRing2.scale.set(scanS2, scanS2, 1);
    (scanRing2.material as THREE.MeshBasicMaterial).opacity = 0.15 * scanS2;

    // Dust rotation
    dustPoints.rotation.y += 0.0002;

    // Random flicker on some panels
    flickerTimer += 0.016;
    if (flickerTimer > 0.1) {
      flickerTimer = 0;
      panelGroup.children.forEach((p) => {
        if (Math.random() > 0.95) {
          p.visible = !p.visible;
        }
      });
    }

    // Bloom pulse
    bloom.strength = 1.6 + Math.sin(t * 0.8) * 0.3;

    // Update chromatic aberration time
    chromaticPass.uniforms.uTime.value = t;

    controls.update();
    composer.render();
  }

  animate();

  // ——— RESIZE ———
  function onResize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
    bokehPass.setSize(w, h);
  }
  window.addEventListener("resize", onResize);

  // ——— CLEANUP ———
  function dispose() {
    disposed = true;
    cancelAnimationFrame(rafId);
    window.removeEventListener("resize", onResize);
    controls.dispose();
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        if (!mat) continue;
        const anyMat = mat as THREE.Material & { map?: THREE.Texture };
        anyMat.map?.dispose();
        mat.dispose();
      }
    });
    composer.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  }

  return {
    rotateBy,
    zoomBy,
    zoomIn: () => zoomBy(0.65),
    zoomOut: () => zoomBy(1.55),
    resetView,
    setAudioEnergy,
    setTheme,
    dispose,
  };
}
