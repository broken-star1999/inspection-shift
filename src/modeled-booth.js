import * as THREE from 'three';
import { BOOTH_METRICS, createWorkbenchModels } from './workbench-models.js';

const pixelsPerUnit = 86;
const workerNames = new Set(['luo', 'tang', 'xu', 'chen', 'zhou', 'sun']);
const baseFov = 38;
const deskDepartureMs = 285;
const deskArrivalMs = 368;
const shutterTravelMs = 420;
const catTravelMs = 900;
const cargoTravelMs = 740;
const slipDisplayMs = 620;
const evidencePassingMs = 590;
const cargoStart = { x: -1.05, z: -.04, angle: -.115 };
const cargoDestinations = {
  ready: cargoStart,
  shipping: { x: 3.92, z: -.045, angle: .035 },
  returned: { x: -3.96, z: -.060, angle: -.042 },
  held: { x: -2.11, z: -.015, angle: -.034 },
};
const slipInks = { returned: 'fail', supplementReturned: 'fail', fail: 'fail', held: 'review', supplementHeld: 'review', review: 'review' };
const shutterRestPhases = new Set(['brief', 'summary', 'ending']);
const initialFrame = { npc: null, day: 0, phase: 'home', documents: [], sample: null, positions: {}, pencil: false, heldDocuments: [], sampleHeld: false, visit: false, keepVisitor: false, approach: null, shutterClosed: null, catPassing: false, cargo: null, outgoingSlip: null, presentedEvidence: null };
const paperStyles = {
  label: { width: 1.04, depth: .78, bright: '#ead2a0', shade: '#c4a875', edge: '#a67b52', turn: -.081 },
  report: { width: 1.22, depth: .97, bright: '#f2e4bb', shade: '#d4c4a0', edge: '#6e7955', turn: .048 },
  order: { width: 1.04, depth: .88, bright: '#f0d8a4', shade: '#cdb382', edge: '#a38c65', turn: -.033 },
  archive: { width: 1.09, depth: .86, bright: '#e7caa5', shade: '#ceb28b', edge: '#9b795c', turn: -.047 },
};

function makeTexture(doc, style, ownerDocument) {
  const canvas = ownerDocument.createElement('canvas');
  canvas.width = 512;
  canvas.height = 374;
  const ctx = canvas.getContext('2d');
  const tone = ctx.createLinearGradient(0, 0, 512, 374);
  tone.addColorStop(0, style.bright);
  tone.addColorStop(1, style.shade);
  ctx.fillStyle = tone;
  ctx.fillRect(0, 0, 512, 374);
  ctx.fillStyle = style.edge;
  ctx.fillRect(0, 0, 12, 374);
  ctx.fillStyle = '#fff2ca7f';
  ctx.fillRect(12, 0, 500, 3);

  for (let index = 0; index < 1420; index++) {
    const x = (index * 149 + 57) % 512;
    const y = (index * 79 + 43) % 374;
    ctx.fillStyle = index % 5 ? '#6d572719' : '#fff1d84c';
    ctx.fillRect(x, y, index % 7 === 0 ? 4 : 2, 1);
  }

  ctx.textBaseline = 'middle';
  ctx.font = '700 35px "Microsoft YaHei", "PingFang SC", sans-serif';
  ctx.fillStyle = '#3d3023';
  ctx.fillText(String(doc.title || '单据').slice(0, 14), 36, 82, 420);
  ctx.font = '750 58px Consolas, "Microsoft YaHei", monospace';
  ctx.fillText(String(doc.batch ?? ''), 36, 158, 418);

  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#725b436c';
  for (let index = 0; index < 6; index++) {
    ctx.beginPath();
    ctx.moveTo(36, 220 + index * 22);
    ctx.lineTo([341, 286, 365, 311, 351, 287][index], 220 + index * 22);
    ctx.stroke();
  }
  ctx.save();
  ctx.translate(433, 285);
  ctx.rotate(-.17);
  ctx.strokeStyle = '#833f3299';
  ctx.lineWidth = 3;
  ctx.strokeRect(-34, -30, 67, 61);
  ctx.strokeRect(-27, -22, 54, 46);
  ctx.fillStyle = '#833f32';
  ctx.font = '750 23px "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText({ label: '批', report: '检', order: '联', archive: '存' }[doc.type] ?? '件', 0, 1);
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function makeGloveSleeve(ownerDocument) {
  const imageWidth = 282;
  const imageHeight = 363;
  const margin = 20;
  const canvas = ownerDocument.createElement('canvas');
  canvas.width = imageWidth + margin * 2;
  canvas.height = imageHeight + margin * 2;
  const ctx = canvas.getContext('2d');
  const sleeve = new Path2D('M 17 15 L 302 9 L 313 25 L 317 307 L 306 339 L 266 335 L 232 343 L 191 334 L 151 341 L 113 336 L 60 345 L 19 339 L 9 306 L 8 29 Z');
  const kraft = ctx.createLinearGradient(15, 20, 309, 330);
  kraft.addColorStop(0, '#e1c18a');
  kraft.addColorStop(.52, '#cb9f60');
  kraft.addColorStop(1, '#a87840');
  ctx.fillStyle = kraft;
  ctx.fill(sleeve);
  ctx.save();
  ctx.clip(sleeve);
  ctx.fillStyle = '#8f5b3154';
  ctx.fill(new Path2D('M 9 14 L 30 21 L 29 304 L 45 344 L 9 344 Z M 300 12 L 314 17 L 321 344 L 284 341 L 300 311 Z'));
  ctx.fillStyle = '#f2d9a182';
  ctx.fill(new Path2D('M 17 14 L 307 8 L 312 27 L 12 36 Z M 28 46 L 34 56 L 42 296 L 36 299 Z'));
  ctx.strokeStyle = '#80502887';
  ctx.lineWidth = 2;
  ctx.stroke(new Path2D('M 20 34 L 306 25 M 33 64 L 40 284 M 191 251 L 265 283 L 294 278'));
  for (let index = 0; index < 530; index++) {
    const x = (index * 149 + 57) % canvas.width;
    const y = (index * 79 + 43) % canvas.height;
    ctx.fillStyle = index % 4 ? '#6942222c' : '#fae5bb79';
    ctx.fillRect(x, y, index % 5 === 0 ? 4 : 2, 1);
  }
  const mouth = new Path2D('M 19 339 L 60 345 L 113 336 L 151 341 L 191 334 L 232 343 L 266 335 L 306 339');
  ctx.strokeStyle = '#674321';
  ctx.lineWidth = 10;
  ctx.stroke(mouth);
  ctx.strokeStyle = '#edc581';
  ctx.lineWidth = 3;
  ctx.stroke(mouth);
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const cover = new THREE.Mesh(
    new THREE.PlaneGeometry(canvas.width / imageWidth, canvas.height / imageHeight),
    new THREE.MeshBasicMaterial({ map: texture, alphaTest: .4, toneMapped: false }),
  );
  cover.position.z = .009;
  cover.visible = false;
  return cover;
}

function createContactTexture() {
  const size = 48;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const radius = Math.hypot((x + .5) * 2 / size - 1, (y + .5) * 2 / size - 1);
      const index = (y * size + x) * 4;
      pixels[index] = 255;
      pixels[index + 1] = 255;
      pixels[index + 2] = 255;
      pixels[index + 3] = Math.round(255 * Math.max(0, 1 - radius ** 2) ** 2);
    }
  }
  const texture = new THREE.DataTexture(pixels, size, size);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function contactShadow(texture, width, depth, opacity) {
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshBasicMaterial({
      color: '#191b19', map: texture, transparent: true, opacity, depthWrite: false, toneMapped: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  return shadow;
}

function makeWindowShutter(window) {
  const { x, y, z, width, height } = window;
  const top = y + height / 2;
  const sill = y - height / 2 + .035;
  const openEdge = top - .094;
  const travel = openEdge - sill;
  const count = 28;
  const pitch = travel / count;
  const halfWidth = width / 2;
  const root = new THREE.Group();
  const finish = (color, roughness, metalness) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const casing = finish('#656c5c', .71, .22);
  const edging = finish('#888e78', .62, .34);
  const darkness = finish('#30382f', .90, .11);
  const steel = finish('#9a9983', .49, .41);
  const box = (parent, material, w, h, d, px, py, pz) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(px, py, pz);
    parent.add(mesh);
  };

  box(root, darkness, width + .20, .102, .20, x, top - .013, z + .135);
  box(root, casing, width + .255, .300, .308, x, top + .110, z + .195);
  box(root, edging, width + .15, .047, .034, x, top + .227, z + .356);
  box(root, edging, width + .135, .024, .031, x, top - .006, z + .348);
  box(root, darkness, width - .010, .024, .030, x, top - .043, z + .270);
  for (const side of [-1, 1]) {
    const edge = x + side * (halfWidth - .025);
    box(root, darkness, .111, height + .035, .123, edge, y + .022, z + .102);
    box(root, edging, .045, height + .031, .028, edge + side * .015, y + .018, z + .172);
    box(root, casing, .115, .262, .048, x + side * (halfWidth + .060), top + .110, z + .354);
    for (const screwY of [sill + .185, y, top - .252, top + .119]) {
      const screw = new THREE.Mesh(new THREE.CylinderGeometry(.013, .013, .014, 8), steel);
      screw.rotation.x = Math.PI / 2;
      screw.position.set(edge + side * .015, screwY, z + (screwY > top ? .386 : .190));
      root.add(screw);
    }
  }

  // One bent cross-section serves all the steel slats. The lip overlaps the
  // neighbouring slat slightly so the closed curtain blocks the room behind it.
  const profile = new THREE.Shape();
  profile.moveTo(.011, -.529 * pitch);
  profile.lineTo(-.003, -.529 * pitch);
  profile.quadraticCurveTo(-.016, -.48 * pitch, -.023, -.30 * pitch);
  profile.quadraticCurveTo(-.034, .035 * pitch, -.021, .31 * pitch);
  profile.lineTo(-.009, .529 * pitch);
  profile.lineTo(.011, .529 * pitch);
  profile.closePath();
  const slatWidth = width + .026;
  const shape = new THREE.ExtrudeGeometry(profile, { depth: slatWidth, bevelEnabled: false, curveSegments: 4 });
  shape.rotateY(Math.PI / 2).translate(-slatWidth / 2, 0, 0);
  const slats = new THREE.InstancedMesh(shape, finish('#818477', .86, .31), count);
  slats.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  slats.frustumCulled = false;
  root.add(slats);

  const bottomRail = new THREE.Group();
  box(bottomRail, darkness, width + .045, .034, .093, x, -.011, z + .110);
  box(bottomRail, edging, width + .040, .073, .087, x, .036, z + .126);
  box(bottomRail, casing, width - .108, .023, .012, x, .046, z + .171);
  box(bottomRail, darkness, .207, .045, .024, x, .040, z + .183);
  box(bottomRail, steel, .119, .015, .020, x, .032, z + .198);
  root.add(bottomRail);

  const matrix = new THREE.Matrix4();
  const patina = new THREE.Color();
  let previousCoverage = -1;
  function setCoverage(coverage) {
    if (previousCoverage === coverage) return;
    previousCoverage = coverage;
    const lift = travel * (1 - coverage);
    bottomRail.position.y = sill + lift;
    let visible = 0;
    for (let row = 0; row < count; row++) {
      const center = openEdge - (row + .5) * pitch + lift;
      if (center - .529 * pitch >= top + .048) continue;
      slats.setMatrixAt(visible, matrix.makeTranslation(x, center, z + .097));
      slats.setColorAt(visible, patina.setScalar(.94 - (row * 7 % 13) * .006));
      visible++;
    }
    slats.count = visible;
    slats.instanceMatrix.needsUpdate = true;
    slats.instanceColor.needsUpdate = true;
  }
  setCoverage(0);
  return { root, setCoverage };
}

function makeFactoryCat(shadowTexture) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  root.visible = false;
  const coat = (color) => new THREE.MeshStandardMaterial({ color, roughness: .91, flatShading: true });
  const fur = coat('#bf7746');
  const stripe = coat('#693b30');
  const milk = coat('#efcda0');
  const pink = coat('#b97662');
  const eye = coat('#31372a');
  const ellipsoid = new THREE.IcosahedronGeometry(.5, 1);
  function tuft(parent, material, x, y, z, width, height, depth) {
    const mesh = new THREE.Mesh(ellipsoid, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(width, height, depth);
    parent.add(mesh);
    return mesh;
  }

  const shadow = contactShadow(shadowTexture, 1.43, .50, .44);
  shadow.position.set(.04, .005, 0);
  root.add(shadow);
  tuft(body, fur, .045, .362, 0, .86, .337, .354);
  tuft(body, fur, .310, .369, -.012, .383, .361, .333);
  tuft(body, milk, -.235, .298, .072, .442, .214, .236);
  for (const x of [-.105, .105, .307]) {
    tuft(body, stripe, x, .420, .131, .096, .199, .091).rotation.z = -.44;
  }

  const head = new THREE.Group();
  head.position.set(-.405, .483, .024);
  head.rotation.y = .26;
  body.add(head);
  tuft(head, fur, 0, 0, 0, .316, .295, .301);
  tuft(head, milk, -.108, -.048, .073, .214, .126, .209);
  tuft(head, stripe, -.190, -.032, .064, .052, .053, .071);
  tuft(head, stripe, -.009, .032, .131, .167, .055, .047).rotation.z = -.20;
  tuft(head, eye, -.085, .038, .124, .053, .042, .043);
  tuft(head, milk, -.098, .048, .145, .017, .015, .010);

  const outline = new THREE.Shape();
  outline.moveTo(-.073, -.021);
  outline.lineTo(.071, -.023);
  outline.lineTo(.012, .152);
  outline.closePath();
  const earShape = new THREE.ExtrudeGeometry(outline, { depth: .055, bevelEnabled: false, curveSegments: 1 });
  earShape.translate(0, 0, -.0275);
  const innerEar = new THREE.ShapeGeometry(outline);
  for (const [x, z, tilt] of [[-.084, -.086, .14], [.048, .082, -.18]]) {
    const ear = new THREE.Mesh(earShape, stripe);
    ear.position.set(x, .092, z);
    ear.rotation.z = tilt;
    const inner = new THREE.Mesh(innerEar, pink);
    inner.scale.set(.63, .68, 1);
    inner.position.set(0, .008, .028);
    ear.add(inner);
    head.add(ear);
  }

  const legs = [];
  for (const front of [true, false]) {
    for (const near of [false, true]) {
      const side = near ? 1 : -1;
      const hip = new THREE.Group();
      hip.position.set(front ? -.235 : .314, .305, side * .108);
      body.add(hip);
      tuft(hip, fur, 0, -.075, 0, front ? .105 : .146, .225, .116);
      const ankle = new THREE.Group();
      ankle.position.y = -.163;
      hip.add(ankle);
      tuft(ankle, front ? milk : fur, 0, -.046, 0, .072, .148, .078);
      tuft(ankle, milk, -.040, -.104, .006, .140, .073, .094);
      legs.push({ hip, ankle, front, offset: front === near ? 0 : Math.PI });
    }
  }

  const tail = new THREE.Group();
  tail.position.set(.366, .417, -.040);
  body.add(tail);
  const tailPath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(.198, .091, -.025),
    new THREE.Vector3(.399, .247, -.024),
    new THREE.Vector3(.437, .387, .004),
    new THREE.Vector3(.359, .441, .025),
  ]);
  const rings = 14;
  const sides = 5;
  const tailShape = new THREE.TubeGeometry(tailPath, rings, .044, sides, false);
  const pigments = [];
  for (let ring = 0; ring <= rings; ring++) {
    const color = ring <= 2 || (ring >= 5 && ring <= 6) || ring >= 11 ? stripe.color : fur.color;
    for (let vertex = 0; vertex <= sides; vertex++) pigments.push(color.r, color.g, color.b);
  }
  tailShape.setAttribute('color', new THREE.Float32BufferAttribute(pigments, 3));
  tail.add(new THREE.Mesh(tailShape, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .92, flatShading: true })));
  tuft(tail, stripe, .359, .441, .025, .079, .083, .084);

  function setPose(stride) {
    const lift = Math.sin(stride * 2);
    body.position.y = .008 + .012 * lift;
    body.rotation.z = .019 * lift;
    tail.rotation.x = .19 * Math.sin(stride - .55);
    tail.rotation.z = .054 * Math.sin(stride);
    for (const { hip, ankle, front, offset } of legs) {
      const cycle = stride + offset;
      hip.rotation.z = .48 * Math.sin(cycle);
      ankle.rotation.z = (front ? -.24 : .24) * (.49 + .45 * Math.cos(cycle));
    }
  }
  return { root, setPose };
}

function buildPaper(doc, index, count, ownerDocument, shadowTexture, standalone) {
  const style = paperStyles[doc.type] ?? paperStyles.archive;
  const footprint = Math.min(1, 3 / count);
  const width = style.width * footprint;
  const depth = style.depth * footprint;
  const paper = new THREE.Group();
  const edge = new THREE.Mesh(
    new THREE.BoxGeometry(width, .018, depth),
    new THREE.MeshStandardMaterial({ color: style.edge, roughness: .93 }),
  );
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshBasicMaterial({ map: makeTexture(doc, style, ownerDocument), toneMapped: false }),
  );
  face.rotation.x = -Math.PI / 2;
  face.position.y = .011;
  const shadow = contactShadow(shadowTexture, width * 1.4, depth * 1.65, .30);
  shadow.position.set(.048, -.016, .034);
  paper.add(edge, face, shadow);
  paper.userData.paperBounds = edge;
  paper.rotation.y = style.turn;
  paper.userData.origin = {
    x: standalone ? -.82 : -2.43 + index * Math.min(1.16, 3.46 / Math.max(1, count)),
    y: BOOTH_METRICS.deskTop + .024 + index * .004,
    z: [2.05, 1.91, 2.12, 1.96][index % 4],
  };
  paper.userData.rest = new THREE.Vector3();
  return paper;
}

function disposeObject(object, retainedTexture) {
  const geometry = new Set();
  const materials = new Set();
  const textures = new Set();
  object.traverse((child) => {
    if (child.isInstancedMesh) child.dispose();
    if (child.geometry) geometry.add(child.geometry);
    if (!child.material) return;
    for (const material of [].concat(child.material)) {
      materials.add(material);
      if (material.map && material.map !== retainedTexture) textures.add(material.map);
    }
  });
  for (const item of geometry) item.dispose();
  for (const item of materials) item.dispose();
  for (const item of textures) item.dispose();
}

const point = new THREE.Vector3();
function projectBox(box, camera, width, height) {
  if (!box || box.isEmpty()) return null;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        point.set(x, y, z).project(camera);
        if (!Number.isFinite(point.x + point.y) || point.z < -1 || point.z > 1) continue;
        const px = (point.x + 1) * width / 2;
        const py = (1 - point.y) * height / 2;
        left = Math.min(left, px);
        top = Math.min(top, py);
        right = Math.max(right, px);
        bottom = Math.max(bottom, py);
      }
    }
  }
  if (!Number.isFinite(left + top + right + bottom)) return null;
  return { x: left, y: top, w: right - left, h: bottom - top };
}

export function mountModeledBooth(host, { baseUrl = import.meta.env.BASE_URL, onLayout, onReady, onUnavailable } = {}) {
  if (!host) return null;
  const ownerDocument = host.ownerDocument;
  const view = ownerDocument.defaultView;
  const canvas = ownerDocument.createElement('canvas');
  let renderer;
  try {
    const context = canvas.getContext('webgl2', {
      alpha: false, antialias: true, powerPreference: 'low-power', depth: true,
    });
    if (!context) return null;
    renderer = new THREE.WebGLRenderer({ canvas, context, antialias: true, alpha: false });
  } catch {
    return null;
  }

  const reduced = view.matchMedia('(prefers-reduced-motion: reduce)');
  const art = `${baseUrl.replace(/\/?$/, '/')}art/`;
  const roomPath = `${art}room.webp`;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#202e24');
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.setPixelRatio(Math.min(view.devicePixelRatio || 1, 1.6));
  const camera = new THREE.PerspectiveCamera(baseFov, 1.7, .07, 44);

  const models = createWorkbenchModels();
  scene.add(models.group);
  const shutter = makeWindowShutter(BOOTH_METRICS.window);
  scene.add(shutter.root);
  const caps = Object.entries(models.caps ?? {}).map(([key, cap]) => ({ key, cap, baseY: cap.position.y }));
  scene.add(new THREE.HemisphereLight('#e8eef4', '#4e3d31', 1.49));
  const daylight = new THREE.DirectionalLight('#eff3fb', 1.31);
  daylight.position.set(-2.8, 6.3, 4.6);
  scene.add(daylight);
  const practical = new THREE.PointLight('#ffbc74', 9.1, 4.2, 2);
  practical.position.set(2.1, 3.18, .7);
  scene.add(practical);

  const loader = new THREE.TextureLoader();
  const textures = new Map();
  let destroyed = false;
  let contextLost = false;
  let ready = false;
  let raf = 0;
  let width = 0;
  let height = 0;
  let frame = initialFrame;
  let shutterSettled = false;
  let shutterFrom = 0;
  let shutterTarget = 0;
  let shutterMotionAt = -Infinity;
  let catMotionAt = -Infinity;
  let paperSet = [];
  let paperKey = null;
  let deskMotionAt = -Infinity;
  let sampleOnDesk = false;
  let sampleFilename = null;
  let portraitMotionAt = -Infinity;
  let cargo = null;
  let cargoMotionAt = -Infinity;
  let slipMotionAt = -Infinity;
  let evidenceKey = null;
  let evidenceMotionAt = -Infinity;
  let pressed = null;
  let pressedAt = -Infinity;
  let poseX = 0;
  let poseY = 0;
  let layoutDirty = true;

  function invalidate() {
    if (!destroyed && !contextLost && !raf) raf = view.requestAnimationFrame(draw);
  }

  function loseContext(event) {
    event.preventDefault();
    if (destroyed || contextLost) return;
    contextLost = true;
    ready = false;
    if (raf) view.cancelAnimationFrame(raf);
    raf = 0;
    onUnavailable?.();
  }

  function restoreContext() {
    if (destroyed || !contextLost) return;
    contextLost = false;
    layoutDirty = true;
    invalidate();
  }

  function loadTexture(path, onReady) {
    const cached = textures.get(path);
    if (cached) {
      if (cached.ready) onReady?.(cached.texture);
      else if (onReady && !cached.failed) cached.listeners.add(onReady);
      return cached.texture;
    }
    const entry = { texture: null, ready: false, failed: false, listeners: new Set(onReady ? [onReady] : []) };
    entry.texture = loader.load(path, (loaded) => {
      if (destroyed) return;
      entry.ready = true;
      for (const listener of entry.listeners) listener(loaded);
      entry.listeners.clear();
      invalidate();
    }, undefined, () => {
      if (destroyed) return;
      entry.failed = true;
      entry.listeners.clear();
      invalidate();
    });
    const { texture } = entry;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    textures.set(path, entry);
    return texture;
  }

  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color: '#566b54', toneMapped: false }),
  );
  backdrop.position.set(BOOTH_METRICS.window.x, BOOTH_METRICS.window.y, -3.62);
  backdrop.scale.set(8.2, 4.2, 1);
  loadTexture(roomPath, (texture) => {
    const aspect = texture.image.width / texture.image.height;
    const h = Math.max(4.2, 8.2 / aspect);
    backdrop.scale.set(h * aspect, h, 1);
    backdrop.material.map = texture;
    backdrop.material.needsUpdate = true;
    backdrop.material.color.setHex(0xffffff);
  });
  scene.add(backdrop);

  const portrait = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      transparent: true, depthWrite: false, alphaTest: .025, toneMapped: false,
    }),
  );
  portrait.visible = false;
  const portraitFloor = BOOTH_METRICS.window.y - BOOTH_METRICS.window.height * .51;
  const portraitHeight = 2.86;
  let portraitWidth = 2.12;
  portrait.scale.set(portraitWidth, portraitHeight, 1);
  scene.add(portrait);

  const papers = new THREE.Group();
  scene.add(papers);
  const evidenceSlip = new THREE.Mesh(new THREE.PlaneGeometry(.72, .53), new THREE.MeshBasicMaterial({
    map: makeTexture({ type: 'archive', title: '查验依据' }, paperStyles.archive, ownerDocument),
    toneMapped: false,
  }));
  evidenceSlip.visible = false;
  scene.add(evidenceSlip);
  const sample = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      transparent: true, depthWrite: false, alphaTest: .08, toneMapped: false,
    }),
  );
  sample.visible = false;
  sample.rotation.x = -Math.PI / 2;
  const gloveSleeve = makeGloveSleeve(ownerDocument);
  sample.add(gloveSleeve);
  scene.add(sample);

  scene.updateMatrixWorld(true);
  const staticBounds = Object.fromEntries(Object.entries(models.anchors ?? {}).map(([key, object]) =>
    [key, new THREE.Box3().setFromObject(object)]));
  const shadowTexture = createContactTexture();
  const cat = makeFactoryCat(shadowTexture);
  scene.add(cat.root);
  const stampBounds = new THREE.Box3();
  for (const key of ['pass', 'fail', 'review']) {
    if (staticBounds[key]) stampBounds.union(staticBounds[key]);
  }
  for (const bounds of [staticBounds.phone, staticBounds.sample, stampBounds]) {
    if (!bounds || bounds.isEmpty()) continue;
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const shadow = contactShadow(shadowTexture, size.x * 1.45, size.z * 1.6, .46);
    shadow.position.set(center.x + .075, BOOTH_METRICS.deskTop + .005, center.z + .055);
    scene.add(shadow);
  }
  const sampleBounds = staticBounds.sample;
  const sampleSize = sampleBounds?.getSize(new THREE.Vector3());
  const sampleCenter = sampleBounds?.getCenter(new THREE.Vector3());
  sample.position.set(sampleCenter?.x ?? 1.62, (sampleBounds?.max.y ?? BOOTH_METRICS.deskTop) + .02, sampleCenter?.z ?? 1.7);
  const sampleRest = sample.position.clone();

  function fitSample(aspect) {
    const modelWidth = Math.min(1.57, (sampleSize?.x || 1.64) * .89);
    const modelDepth = Math.min(1.22, (sampleSize?.z || 1.27) * .88);
    const depth = Math.min(modelDepth, modelWidth / aspect);
    sample.scale.set(depth * aspect, depth, 1);
  }

  function setPaperOffset(index, offset) {
    const paper = paperSet[index];
    if (!paper) return;
    const { origin, rest } = paper.userData;
    rest.set(origin.x + (offset?.x || 0) / pixelsPerUnit, origin.y, origin.z + (offset?.y || 0) / pixelsPerUnit);
    paper.position.copy(rest);
    layoutDirty = true;
    invalidate();
  }

  function updatePaperSet(documents, standalone) {
    const signature = JSON.stringify([standalone, documents]);
    if (paperKey === signature) return;
    paperKey = signature;
    for (const paper of paperSet) {
      papers.remove(paper);
      disposeObject(paper, shadowTexture);
    }
    paperSet = documents.map((doc, index) => buildPaper(doc, index, documents.length, ownerDocument, shadowTexture, standalone));
    paperSet.forEach((paper) => papers.add(paper));
  }

  function artPath(filename) {
    return filename.includes('/') || /^(data|blob):/.test(filename) ? filename : `${art}${filename}`;
  }

  function shutterCoverage(now) {
    if (reduced.matches || shutterFrom === shutterTarget) return shutterTarget;
    const duration = shutterTravelMs * Math.abs(shutterTarget - shutterFrom);
    const progress = THREE.MathUtils.clamp((now - shutterMotionAt) / duration, 0, 1);
    return THREE.MathUtils.lerp(shutterFrom, shutterTarget, progress ** 2 * (3 - 2 * progress));
  }

  function setFrame(next = {}) {
    if (destroyed) return;
    const before = frame;
    frame = { ...initialFrame, ...next };
    if (frame.catPassing && !before.catPassing) catMotionAt = view.performance.now();
    const nextShutter = Number(frame.shutterClosed ?? shutterRestPhases.has(frame.phase));
    if (!shutterSettled || before.phase === 'home' || frame.phase === 'home' || reduced.matches) {
      shutterFrom = shutterTarget = nextShutter;
      shutterSettled = true;
    } else if (shutterTarget !== nextShutter) {
      const now = view.performance.now();
      shutterFrom = shutterCoverage(now);
      shutterMotionAt = now;
      shutterTarget = nextShutter;
    }
    const waiting = frame.phase === 'waiting';
    const arriving = frame.phase === 'arriving';
    const working = arriving || frame.phase === 'case' || frame.phase === 'receipt' || frame.visit;
    const now = view.performance.now();
    const evidence = frame.phase === 'case' && !frame.visit ? frame.presentedEvidence : null;
    const nextEvidenceKey = evidence ? JSON.stringify([evidence.caseId, evidence.key, evidence.source, evidence.text]) : null;
    if (nextEvidenceKey !== evidenceKey) {
      evidenceKey = nextEvidenceKey;
      evidenceMotionAt = evidence ? now : -Infinity;
    }
    const nextCargo = frame.cargo ?? (waiting ? cargo : null);
    if (nextCargo?.id !== cargo?.id || nextCargo?.route !== cargo?.route) {
      cargo = nextCargo;
      cargoMotionAt = cargo?.animate && cargo.route !== 'ready' ? now : -Infinity;
    }
    const slip = frame.outgoingSlip;
    if (slip?.id !== before.outgoingSlip?.id || slip?.route !== before.outgoingSlip?.route) {
      slipMotionAt = slip?.animate ? now : -Infinity;
      if (slip) models.outgoingSlip.imprint.material = models.outgoingSlip.inks[slipInks[slip.route] ?? 'pass'];
    }
    if ((waiting || arriving) && before.phase !== frame.phase) deskMotionAt = now;
    if (models.anchors?.pencil) models.anchors.pencil.visible = working && !arriving && Boolean(frame.pencil);
    const { npc: nextNpc, sampleFilename: nextSample } = frame.approach ?? {};
    if (workerNames.has(nextNpc)) loadTexture(`${art}${nextNpc}.webp`);
    if (nextSample) loadTexture(artPath(nextSample));
    if (waiting) {
      if (!frame.keepVisitor && before.phase !== 'waiting') portraitMotionAt = deskMotionAt;
    } else {
      updatePaperSet(working ? frame.documents ?? [] : [], frame.visit);
      paperSet.forEach((paper, index) => {
        paper.userData.onDesk = !frame.heldDocuments.includes(index);
        setPaperOffset(index, frame.positions?.[index]);
      });
      const filename = working && frame.sample?.filename;
      sampleOnDesk = Boolean(filename && !frame.sampleHeld);
      gloveSleeve.visible = Boolean(filename && frame.sample.kind === 'yellow' && !frame.sample.unpacked);
      if (filename) {
        if (filename !== sampleFilename) {
          sampleFilename = filename;
          const texture = loadTexture(artPath(filename), (loaded) => {
            if (sampleFilename === filename) fitSample(loaded.image.width / loaded.image.height);
          });
          if (sample.material.map !== texture) {
            sample.material.map = texture;
            sample.material.needsUpdate = true;
          }
        }
      }
    }
    if (!waiting && (frame.npc !== before.npc || (before.phase === 'waiting' && !before.keepVisitor) || (before.phase === 'receipt' && frame.phase === 'case'))) {
      portrait.visible = false;
      if (workerNames.has(frame.npc)) {
        const id = frame.npc;
        loadTexture(`${art}${id}.webp`, (texture) => {
          if (destroyed || frame.npc !== id) return;
          const aspect = texture.image.width / texture.image.height;
          portraitWidth = Math.min(3, portraitHeight * aspect);
          portrait.scale.set(portraitWidth, portraitHeight, 1);
          portrait.material.map = texture;
          portrait.material.needsUpdate = true;
          portrait.visible = true;
          portraitMotionAt = view.performance.now();
          invalidate();
        });
      }
    }
    layoutDirty = true;
    invalidate();
  }

  function placeDesk(now) {
    const leaving = frame.phase === 'waiting';
    const arriving = frame.phase === 'arriving';
    const moving = (leaving || arriving) && !reduced.matches;
    const duration = leaving ? deskDepartureMs : deskArrivalMs;
    const elapsed = now - deskMotionAt;
    let active = false;
    function place(object, rest, onDesk, stagger, distance) {
      const progress = moving ? THREE.MathUtils.clamp((elapsed - stagger) / duration, 0, 1) : 1;
      object.visible = Boolean(onDesk && (!leaving || progress < 1));
      if (!object.visible) return;
      active ||= moving && progress < 1;
      const slide = leaving ? progress ** 1.7 : (1 - progress) ** 2.6;
      const offset = leaving || arriving ? slide : 0;
      object.position.set(rest.x + (BOOTH_METRICS.window.x - rest.x) * offset * .13,
        rest.y + Math.sin(progress * Math.PI) * .026, rest.z - offset * distance);
    }
    paperSet.forEach((paper, index) => {
      place(paper, paper.userData.rest, paper.userData.onDesk, index * 13, .69 + (index % 3) * .13);
    });
    place(sample, sampleRest, sampleOnDesk && sample.material.map?.image, 24, .69);
    return active;
  }

  function placeCat(now) {
    const resting = reduced.matches;
    const elapsed = now - catMotionAt;
    cat.root.visible = frame.catPassing && (resting || elapsed < catTravelMs);
    if (!cat.root.visible) return false;
    const progress = resting ? .56 : THREE.MathUtils.clamp(elapsed / catTravelMs, 0, 1);
    const { x, y, z, width, height } = BOOTH_METRICS.window;
    cat.root.position.set(x + THREE.MathUtils.lerp(width / 2 + .83, -width / 2 - .96, progress),
      y - height / 2 + .075, z - .40 + .030 * Math.sin(Math.PI * progress));
    cat.setPose(resting ? .65 : progress * Math.PI * 2 * 5);
    return !resting;
  }

  function placeCargo(now) {
    const box = models.cargo;
    const destination = cargo && cargoDestinations[cargo.route];
    if (!destination) {
      box.visible = false;
      return false;
    }
    const progress = reduced.matches ? 1 : THREE.MathUtils.clamp((now - cargoMotionAt) / cargoTravelMs, 0, 1);
    const remainsInWindow = cargo.route === 'ready' || cargo.route === 'held';
    box.visible = remainsInWindow || progress < 1;
    if (!box.visible) return false;
    const slide = cargo.route === 'held' ? 1 - (1 - progress) ** 3 : progress ** 1.5;
    box.position.set(THREE.MathUtils.lerp(cargoStart.x, destination.x, slide), 0,
      THREE.MathUtils.lerp(cargoStart.z, destination.z, slide));
    box.rotation.y = THREE.MathUtils.lerp(cargoStart.angle, destination.angle, slide);
    return progress < 1;
  }

  function placeOutgoingSlip(now) {
    const { paper } = models.outgoingSlip;
    const elapsed = now - slipMotionAt;
    paper.visible = Boolean(frame.outgoingSlip && elapsed >= 42 && elapsed < slipDisplayMs);
    if (paper.visible) {
      const travel = reduced.matches ? 1 : 1 - (1 - THREE.MathUtils.clamp((elapsed - 42) / 152, 0, 1)) ** 2;
      const settle = reduced.matches ? 1 : THREE.MathUtils.clamp((elapsed - 264) / 220, 0, 1);
      paper.position.set(-.035 * settle, .139 - .034 * settle, .342 + .425 * travel + .044 * settle);
      paper.rotation.x = .12 * settle;
    }
    return elapsed < slipDisplayMs;
  }

  function placeEvidenceSlip(now) {
    const elapsed = now - evidenceMotionAt;
    evidenceSlip.visible = evidenceKey !== null && elapsed < evidencePassingMs;
    if (!evidenceSlip.visible) return false;
    const resting = reduced.matches;
    const forward = resting ? 1 : 1 - (1 - THREE.MathUtils.clamp(elapsed / 370, 0, 1)) ** 2;
    const lift = THREE.MathUtils.smoothstep(forward, .68, 1);
    const taken = resting ? 0 : THREE.MathUtils.smoothstep(elapsed, 445, evidencePassingMs);
    evidenceSlip.position.set(THREE.MathUtils.lerp(-.44, .24, forward),
      BOOTH_METRICS.deskTop + .065 + .3 * lift, THREE.MathUtils.lerp(1.37, -1.34, forward) - .55 * taken);
    evidenceSlip.rotation.set(-Math.PI / 2 + .22 * lift, 0, -.11 * (1 - forward));
    return true;
  }

  function refreshLayout() {
    if (!onLayout || !width || !height) return;
    const controls = {};
    for (const [key, box] of Object.entries(staticBounds)) {
      const rect = projectBox(box, camera, width, height);
      if (rect) controls[key] = rect;
    }
    if (frame.phase !== 'waiting' && frame.phase !== 'arriving') {
      paperSet.forEach((paper, index) => {
        const rect = projectBox(new THREE.Box3().setFromObject(paper.userData.paperBounds), camera, width, height);
        if (rect) controls[`doc${index}`] = rect;
      });
    }
    onLayout(controls);
  }

  function aimCamera(viewCamera, x, y) {
    const eyeX = BOOTH_METRICS.window.x + x * .085;
    viewCamera.position.set(eyeX, 2.8 - y * .19, 7.2 + Math.max(Math.abs(x), Math.abs(y)) * .08);
    viewCamera.lookAt(eyeX + x * .17, 2.05 - y * .36, -.25);
    viewCamera.updateMatrixWorld(true);
  }

  function fitFieldOfView(aspect) {
    const probe = camera.clone();
    const corner = new THREE.Vector3();
    let vertical = Math.tan(THREE.MathUtils.degToRad(baseFov) / 2);
    // Choose one lens for the whole pan. The phone is closer to the eye than
    // the notices, so sizing from the window alone can cut off the hardware.
    for (const x of [-1, 0, 1]) {
      for (const y of [-1, 0, 1]) {
        aimCamera(probe, x, y);
        for (const box of Object.values(staticBounds)) {
          if (box.isEmpty()) continue;
          for (const px of [box.min.x, box.max.x]) {
            for (const py of [box.min.y, box.max.y]) {
              for (const pz of [box.min.z, box.max.z]) {
                corner.set(px, py, pz).applyMatrix4(probe.matrixWorldInverse);
                const depth = -corner.z;
                if (depth > camera.near) {
                  vertical = Math.max(vertical, Math.abs(corner.y) / (depth * .91), Math.abs(corner.x) / (depth * aspect * .96));
                }
              }
            }
          }
        }
      }
    }
    return THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(2 * Math.atan(vertical)), baseFov, 92);
  }

  function syncSize() {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (w === width && h === height) return;
    width = w;
    height = h;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.fov = fitFieldOfView(camera.aspect);
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    layoutDirty = true;
  }

  function draw(now) {
    raf = 0;
    if (destroyed || contextLost) return;
    syncSize();
    if (!width || !height) return;
    const x = reduced.matches ? 0 : poseX;
    const y = reduced.matches ? 0 : poseY;
    aimCamera(camera, x, y);

    const day = THREE.MathUtils.clamp(frame.day / 4, 0, 1);
    const closing = frame.phase === 'summary' || frame.phase === 'handoff' || frame.phase === 'ending';
    daylight.intensity = closing ? .86 : 1.31 - day * .16;
    practical.intensity = closing ? 12.8 : 9.1 + day * 2;
    if (backdrop.material.map) {
      backdrop.material.color.setRGB(closing ? .72 : .9 + .04 * (1 - day), closing ? .74 : .92, closing ? .74 : .89 + .06 * day);
    }

    const leaving = frame.phase === 'waiting' && !frame.keepVisitor;
    const progress = reduced.matches ? 1 : THREE.MathUtils.clamp((now - portraitMotionAt) / (leaving ? 280 : 340), 0, 1);
    const presence = leaving ? 1 - progress : 1 - (1 - progress) ** 2;
    const slide = (leaving ? .94 : -.52) * (1 - presence);
    portrait.position.set(BOOTH_METRICS.window.x + slide, portraitFloor + portraitHeight / 2, -2.43);
    portrait.material.opacity = presence;
    if (leaving && progress === 1) portrait.visible = false;
    portrait.material.color.setScalar(closing ? .81 : .98 - day * .045);

    const cargoMoving = placeCargo(now);
    const slipVisible = placeOutgoingSlip(now);
    const evidenceVisible = placeEvidenceSlip(now);
    const deskMoving = placeDesk(now);
    const catMoving = placeCat(now);
    if (reduced.matches) shutterFrom = shutterTarget;
    const coverage = shutterCoverage(now);
    shutter.setCoverage(coverage);
    const shutterMoving = coverage !== shutterTarget;
    const pressAge = now - pressedAt;
    const pressDepth = reduced.matches || pressAge >= 165 ? 0 : Math.sin(pressAge / 165 * Math.PI) * .073;
    for (const { key, cap, baseY } of caps) cap.position.y = baseY - (pressed === key ? pressDepth : 0);
    scene.updateMatrixWorld(true);
    renderer.render(scene, camera);
    if (renderer.getContext().isContextLost()) return;
    if (layoutDirty) {
      layoutDirty = false;
      refreshLayout();
    }
    const room = textures.get(roomPath);
    if (!ready && (room.ready || room.failed)) {
      ready = true;
      onReady?.();
    }
    if (shutterMoving || catMoving || deskMoving || cargoMoving || slipVisible || evidenceVisible || (portrait.visible && progress < 1) ||
        (!reduced.matches && pressed && pressAge < 165)) invalidate();
  }

  function captureDeskProjection() {
    if (!width || !height || !ready || destroyed) return null;
    const rect = host.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const rotated = host.closest('.game-shell')?.dataset.rotated === 'true';
    const frozen = camera.clone();
    frozen.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const hit = new THREE.Vector3();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(BOOTH_METRICS.deskTop + .035));
    return (clientX, clientY) => {
      const u = rotated ? (clientY - rect.top) / rect.height : (clientX - rect.left) / rect.width;
      const v = rotated ? (rect.right - clientX) / rect.width : (clientY - rect.top) / rect.height;
      ndc.set(u * 2 - 1, 1 - v * 2);
      ray.setFromCamera(ndc, frozen);
      if (!ray.ray.intersectPlane(plane, hit)) return { x: u * width, y: v * height };
      return { x: hit.x * pixelsPerUnit, y: hit.z * pixelsPerUnit };
    };
  }

  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, { display: 'block', width: '100%', height: '100%', pointerEvents: 'none' });
  canvas.addEventListener('webglcontextlost', loseContext);
  canvas.addEventListener('webglcontextrestored', restoreContext);
  host.append(canvas);
  host.dataset.renderer = 'three-webgl';
  const resizeObserver = view.ResizeObserver ? new view.ResizeObserver(invalidate) : null;
  resizeObserver?.observe(host);
  view.addEventListener('resize', invalidate);
  reduced.addEventListener('change', invalidate);
  invalidate();

  return {
    setFrame,
    setPaperOffset,
    setViewPose(x, y) {
      poseX = THREE.MathUtils.clamp(x, -1, 1);
      poseY = THREE.MathUtils.clamp(y, -1, 1);
      layoutDirty = true;
      invalidate();
    },
    setPressed(key) {
      pressed = key;
      pressedAt = view.performance.now();
      invalidate();
    },
    captureDeskProjection,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (raf) view.cancelAnimationFrame(raf);
      resizeObserver?.disconnect();
      view.removeEventListener('resize', invalidate);
      reduced.removeEventListener('change', invalidate);
      canvas.removeEventListener('webglcontextlost', loseContext);
      canvas.removeEventListener('webglcontextrestored', restoreContext);
      disposeObject(scene);
      for (const { texture } of textures.values()) texture.dispose();
      renderer.dispose();
      canvas.remove();
      delete host.dataset.renderer;
    },
  };
}
