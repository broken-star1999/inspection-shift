import * as THREE from 'three';
import { BOOTH_METRICS, createWorkbenchModels } from './workbench-models.js';

const pixelsPerUnit = 86;
const workerNames = new Set(['luo', 'tang', 'xu', 'chen', 'zhou', 'sun']);
const baseFov = 38;
const initialFrame = { npc: null, day: 0, phase: 'home', documents: [], sample: null, positions: {}, pencil: false };
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

function buildPaper(doc, index, count, ownerDocument, shadowTexture) {
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
    x: -2.43 + index * Math.min(1.16, 3.46 / Math.max(1, count)),
    y: BOOTH_METRICS.deskTop + .024 + index * .004,
    z: [2.05, 1.91, 2.12, 1.96][index % 4],
  };
  return paper;
}

function disposeObject(object, retainedTexture) {
  const geometry = new Set();
  const materials = new Set();
  const textures = new Set();
  object.traverse((child) => {
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

export function mountModeledBooth(host, { baseUrl = import.meta.env.BASE_URL, onLayout } = {}) {
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
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#202e24');
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.setPixelRatio(Math.min(view.devicePixelRatio || 1, 1.6));
  const camera = new THREE.PerspectiveCamera(baseFov, 1.7, .07, 44);

  const models = createWorkbenchModels();
  scene.add(models.group);
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
  let raf = 0;
  let width = 0;
  let height = 0;
  let frame = initialFrame;
  let paperSet = [];
  let paperKey = null;
  let portraitMotionAt = -Infinity;
  let pressed = null;
  let pressedAt = -Infinity;
  let poseX = 0;
  let poseY = 0;
  let layoutDirty = true;

  function invalidate() {
    if (!destroyed && !raf) raf = view.requestAnimationFrame(draw);
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
  loadTexture(`${art}room.webp`, (texture) => {
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
  const sample = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      transparent: true, depthWrite: false, alphaTest: .08, toneMapped: false,
    }),
  );
  sample.visible = false;
  sample.rotation.x = -Math.PI / 2;
  scene.add(sample);

  scene.updateMatrixWorld(true);
  const staticBounds = Object.fromEntries(Object.entries(models.anchors ?? {}).map(([key, object]) =>
    [key, new THREE.Box3().setFromObject(object)]));
  const shadowTexture = createContactTexture();
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

  function fitSample(aspect) {
    const modelWidth = Math.min(1.57, (sampleSize?.x || 1.64) * .89);
    const modelDepth = Math.min(1.22, (sampleSize?.z || 1.27) * .88);
    const depth = Math.min(modelDepth, modelWidth / aspect);
    sample.scale.set(depth * aspect, depth, 1);
  }

  function setPaperOffset(index, offset) {
    const paper = paperSet[index];
    if (!paper) return;
    const origin = paper.userData.origin;
    paper.position.set(origin.x + (offset?.x || 0) / pixelsPerUnit, origin.y, origin.z + (offset?.y || 0) / pixelsPerUnit);
    layoutDirty = true;
    invalidate();
  }

  function updatePaperSet(documents) {
    const signature = JSON.stringify(documents);
    if (paperKey === signature) return;
    paperKey = signature;
    for (const paper of paperSet) {
      papers.remove(paper);
      disposeObject(paper, shadowTexture);
    }
    paperSet = documents.map((doc, index) => buildPaper(doc, index, documents.length, ownerDocument, shadowTexture));
    paperSet.forEach((paper) => papers.add(paper));
  }

  function artPath(filename) {
    return filename.includes('/') || /^(data|blob):/.test(filename) ? filename : `${art}${filename}`;
  }

  function setFrame(next = {}) {
    if (destroyed) return;
    const before = frame;
    frame = { ...initialFrame, ...next };
    const working = frame.phase === 'case' || frame.phase === 'receipt';
    if (models.anchors?.pencil) models.anchors.pencil.visible = working && Boolean(frame.pencil);
    updatePaperSet(working ? frame.documents ?? [] : []);
    paperSet.forEach((paper, index) => setPaperOffset(index, frame.positions?.[index]));
    if (frame.phase === 'waiting') {
      if (before.phase !== 'waiting') portraitMotionAt = view.performance.now();
    } else if (frame.npc !== before.npc || (before.phase === 'receipt' && frame.phase === 'case')) {
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
    const filename = working && frame.sample?.filename;
    if (filename) {
      const path = artPath(filename);
      const texture = loadTexture(path);
      if (sample.material.map !== texture) {
        sample.material.map = texture;
        sample.material.needsUpdate = true;
      }
      if (texture.image) fitSample(texture.image.width / texture.image.height);
      else loadTexture(path, (image) => {
        if (frame.sample?.filename === filename) fitSample(image.image.width / image.image.height);
      });
      sample.visible = true;
      sample.material.color.setHex(frame.sample.kind === 'yellow' && !frame.sample.unpacked ? 0xdcccc0 : 0xffffff);
    } else sample.visible = false;
    layoutDirty = true;
    invalidate();
  }

  function refreshLayout() {
    if (!onLayout || !width || !height) return;
    const controls = {};
    for (const [key, box] of Object.entries(staticBounds)) {
      const rect = projectBox(box, camera, width, height);
      if (rect) controls[key] = rect;
    }
    paperSet.forEach((paper, index) => {
      const rect = projectBox(new THREE.Box3().setFromObject(paper.userData.paperBounds), camera, width, height);
      if (rect) controls[`doc${index}`] = rect;
    });
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
    if (destroyed) return;
    syncSize();
    if (!width || !height) return;
    const x = reduced.matches ? 0 : poseX;
    const y = reduced.matches ? 0 : poseY;
    aimCamera(camera, x, y);

    const day = THREE.MathUtils.clamp(frame.day / 4, 0, 1);
    const closing = frame.phase === 'summary' || frame.phase === 'handoff' || frame.phase === 'ending';
    daylight.intensity = closing ? .86 : 1.31 - day * .16;
    practical.intensity = closing ? 12.8 : 9.1 + day * 2;
    backdrop.material.color.setRGB(closing ? .72 : .9 + .04 * (1 - day), closing ? .74 : .92, closing ? .74 : .89 + .06 * day);

    const leaving = frame.phase === 'waiting';
    const progress = reduced.matches ? 1 : THREE.MathUtils.clamp((now - portraitMotionAt) / (leaving ? 280 : 340), 0, 1);
    const presence = leaving ? 1 - progress : 1 - (1 - progress) ** 2;
    const slide = (leaving ? .94 : -.52) * (1 - presence);
    portrait.position.set(BOOTH_METRICS.window.x + slide, portraitFloor + portraitHeight / 2, -2.43);
    portrait.material.opacity = presence;
    if (leaving && progress === 1) portrait.visible = false;
    portrait.material.color.setScalar(closing ? .81 : .98 - day * .045);

    const pressAge = now - pressedAt;
    const pressDepth = reduced.matches || pressAge >= 165 ? 0 : Math.sin(pressAge / 165 * Math.PI) * .073;
    for (const { key, cap, baseY } of caps) cap.position.y = baseY - (pressed === key ? pressDepth : 0);
    scene.updateMatrixWorld(true);
    renderer.render(scene, camera);
    if (layoutDirty) {
      layoutDirty = false;
      refreshLayout();
    }
    if ((portrait.visible && progress < 1) || (!reduced.matches && pressed && pressAge < 165)) invalidate();
  }

  function captureDeskProjection() {
    if (!width || !height || destroyed) return null;
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
      disposeObject(scene);
      for (const { texture } of textures.values()) texture.dispose();
      renderer.dispose();
      canvas.remove();
      delete host.dataset.renderer;
    },
  };
}
