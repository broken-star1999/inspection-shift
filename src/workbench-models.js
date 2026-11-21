import * as THREE from 'three';

export const BOOTH_METRICS = {
  window: { x: .15, y: 2.72, z: -1.9, width: 5.95, height: 3.06 },
  deskTop: .66,
};

const halfPi = Math.PI / 2;
const deskY = BOOTH_METRICS.deskTop;

function finishTexture(kind) {
  const size = 128;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = Math.imul(x + 19, 374761393) ^ Math.imul(y + 71, 668265263);
      const speckle = ((n ^ (n >>> 13)) & 255) / 255;
      const grain = kind === 'grain' ? Math.sin(y * .31 + Math.sin(x * .05) * .6) * 7
        : kind === 'felt' ? ((x + y) % 4 === 0 ? -8 : 2)
          : Math.sin(x * .12 + y * .09) * 3;
      const tone = 244 + grain - speckle * (kind === 'felt' ? 18 : 12);
      const offset = (y * size + x) * 4;
      pixels.set([tone, tone, tone, 255], offset);
    }
  }
  const texture = new THREE.DataTexture(pixels, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function workshopMaterials() {
  const grain = finishTexture('grain');
  const paint = finishTexture('paint');
  const felt = finishTexture('felt');
  const mat = (color, roughness = .86, metalness = 0, map) => new THREE.MeshStandardMaterial({
    color, roughness, metalness, ...(map ? { map } : {}),
  });
  return {
    plaster: mat('#52695f', .96, 0, paint), darkPlaster: mat('#34493d', .96, 0, paint),
    ceiling: new THREE.MeshStandardMaterial({ color: '#40564e', map: paint, roughness: .98, emissive: '#263731', emissiveIntensity: .43 }),
    tube: new THREE.MeshStandardMaterial({ color: '#f6dca5', roughness: .58, emissive: '#d6a66d', emissiveIntensity: .83 }),
    panel: mat('#425a50', .93, 0, paint), column: mat('#374c40', .91, 0, paint),
    shadow: mat('#272e24'), rail: mat('#465340', .72, .09), edge: mat('#788168', .76, .08),
    seam: mat('#374432'), black: mat('#232b23'), bronze: mat('#9c8759', .52, .46),
    metal: mat('#92978a', .55, .50), screw: mat('#54584c', .59, .52),
    wood: mat('#927654', .92, 0, grain), woodEdge: mat('#654c32', .94, 0, grain),
    underDesk: mat('#6d7559', .83, .10), deskTop: mat('#77573b', .91, 0, grain),
    deskLip: mat('#a98656', .90, 0, grain), felt: mat('#626e58', .98, 0, felt),
    clipboard: mat('#8f734c', .94, 0, grain), paper: mat('#e5d6b6', .98),
    paperEdge: mat('#bfa783', .95), ink: mat('#5c6a55', .91), oldInk: mat('#8b6c4a', .95),
    binder: mat('#623630', .93, 0, paint), binderLight: mat('#865141', .94, 0, grain),
    phone: mat('#a6a079', .60, .05), phoneShade: mat('#77785a', .71, .05),
    phoneLight: mat('#c5bd92', .59, .03), key: mat('#e3d6ac', .76), cord: mat('#484437', .92),
    work: mat('#73806b', .86, .15), tray: mat('#3d4a3c', .89), trayFelt: mat('#69715b', .99, 0, felt),
    machine: mat('#3d4e43', .69, .27), machineEdge: mat('#697b66', .68, .18),
    pass: mat('#718d57', .64, .09), fail: mat('#9c5948', .65, .09), review: mat('#b68a45', .66, .11),
    stampMark: mat('#efe0ae', .77), graphite: mat('#3a322c', .89),
    pencil: mat('#dba939', .75), eraser: mat('#bb745e', .93),
    cargoTop: mat('#b38753', .97, 0, paint), cargoSide: mat('#94663b', .96, 0, paint),
    cargoTape: mat('#d6b979', .87), cargoLane: mat('#4a534a', .96, 0, paint),
    cargoMark: mat('#e2b546', .95),
  };
}

function place(parent, mesh, x, y, z) {
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function box(parent, material, w, h, d, x, y, z) {
  return place(parent, new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material), x, y, z);
}

function roundOutline(w, h, radius) {
  const x = -w / 2;
  const y = -h / 2;
  const r = Math.min(radius, w * .48, h * .48);
  const outline = new THREE.Shape();
  outline.moveTo(x + r, y);
  outline.lineTo(x + w - r, y);
  outline.quadraticCurveTo(x + w, y, x + w, y + r);
  outline.lineTo(x + w, y + h - r);
  outline.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  outline.lineTo(x + r, y + h);
  outline.quadraticCurveTo(x, y + h, x, y + h - r);
  outline.lineTo(x, y + r);
  outline.quadraticCurveTo(x, y, x + r, y);
  return outline;
}

function rounded(parent, material, w, h, depth, x, y, z, radius = .04, bevel = .017) {
  const geometry = new THREE.ExtrudeGeometry(roundOutline(w, h, radius), {
    depth, steps: 1, curveSegments: 3, bevelSegments: 1, bevelSize: bevel, bevelThickness: bevel,
  });
  geometry.translate(0, 0, -depth / 2);
  return place(parent, new THREE.Mesh(geometry, material), x, y, z);
}

function flat(parent, material, w, depth, height, x, y, z, radius, bevel) {
  const object = rounded(parent, material, w, depth, height, x, y, z, radius, bevel);
  object.rotation.x = -halfPi;
  return object;
}

function cylinder(parent, material, radius, height, x, y, z, segments = 10) {
  return place(parent, new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, segments), material), x, y, z);
}

function fastener(parent, material, x, y, z, radius = .044) {
  const screw = cylinder(parent, material, radius, .025, x, y, z, 8);
  screw.rotation.x = halfPi;
}

function wallFrame(parent, material, x, y, z, width, height, shoulder, depth) {
  const across = width + 2 * shoulder;
  for (const sign of [-1, 1]) {
    rounded(parent, material, across, shoulder, depth, x, y + sign * (height + shoulder) / 2, z, .035, .019);
    rounded(parent, material, shoulder, height, depth, x + sign * (width + shoulder) / 2, y, z, .024, .017);
  }
}

function makeRoom(group, m, window) {
  const { x, y, z, width, height } = window;
  const left = x - width / 2;
  const right = x + width / 2;
  const base = y - height / 2;
  const top = y + height / 2;
  const wallX = 6.25;
  const wallY = 5.55;
  const wallZ = -2.12;

  box(group, m.plaster, left + wallX, wallY, .35, (left - wallX) / 2, wallY / 2, wallZ);
  box(group, m.plaster, wallX - right, wallY, .35, (right + wallX) / 2, wallY / 2, wallZ);
  box(group, m.plaster, width, wallY - top, .35, x, (wallY + top) / 2, wallZ);
  box(group, m.darkPlaster, width, base, .35, x, base / 2, wallZ);
  for (const sign of [-1, 1]) {
    const section = sign === -1 ? [left + wallX, (left - wallX) / 2] : [wallX - right, (right + wallX) / 2];
    box(group, m.darkPlaster, section[0], 1.4, .04, section[1], .7, -1.93);
    box(group, m.edge, section[0], .06, .08, section[1], 1.405, -1.9);
    box(group, m.column, .27, wallY, .43, sign * 5.86, wallY / 2, -1.89);
    box(group, m.panel, .35, wallY, 3.46, sign * 6.21, wallY / 2, -.57);
    box(group, m.darkPlaster, .035, 1.42, 3.40, sign * 6.02, .71, -.57);
    box(group, m.edge, .08, .075, 3.43, sign * 6.01, 1.443, -.55);
    box(group, m.shadow, .09, .12, 3.40, sign * 6, .11, -.57);
  }

  box(group, m.black, 12.7, .16, 6.5, 0, -.11, .17);
  box(group, m.column, 12.3, .17, .31, 0, 4.96, -1.82);
  box(group, m.ceiling, 12.7, .16, 6.10, 0, 5.51, .90);
  rounded(group, [m.column, m.rail], 3.7, .31, .16, .14, 4.77, -1.82, .045, .025);
  for (let i = -4; i <= 4; i++) {
    rounded(group, m.edge, .17, .06, .017, .14 + i * .29, 4.77, -1.715, .021, .003);
  }

  const lamp = place(group, new THREE.Group(), -.74, 5.34, -.72);
  flat(lamp, [m.underDesk, m.rail], 2.75, .43, .14, 0, 0, 0, .069, .023);
  flat(lamp, m.seam, 2.61, .31, .056, 0, -.092, 0, .052, .008);
  const diffuser = cylinder(lamp, m.tube, .071, 2.41, 0, -.119, -.015, 10);
  diffuser.rotation.z = halfPi;
  for (const x of [-1.227, 1.227]) flat(lamp, m.metal, .13, .319, .096, x, -.128, 0, .033, .013);
  for (const z of [-.17, .17]) flat(lamp, m.screw, 2.57, .026, .027, 0, -.216, z, .013, .007);
  for (const x of [-1.01, -.67, -.33, .01, .35, .69, 1.03]) {
    flat(lamp, m.screw, .027, .368, .031, x, -.226, 0, .013, .005);
  }

  wallFrame(group, [m.rail, m.seam], x, y, z + .047, width + .18, height + .16, .27, .28);
  wallFrame(group, [m.edge, m.rail], x, y, z + .13, width + .045, height + .04, .117, .15);
  wallFrame(group, [m.seam, m.rail], x, y, z + .16, width + .009, height + .009, .04, .074);
  rounded(group, [m.edge, m.rail], width + .64, .14, .34, x, base - .022, z + .22, .077, .034);
  for (const side of [-1, 1]) {
    for (const level of [-1, 1]) {
      fastener(group, m.screw, x + side * (width / 2 + .23), y + level * (height / 2 + .21), z + .227, .059);
    }
    for (const cy of [1.91, 3.47]) {
      rounded(group, m.rail, .10, .54, .09, x + side * (width / 2 + .18), cy, z + .24, .031, .012);
      fastener(group, m.bronze, x + side * (width / 2 + .18), cy + .16, z + .31, .031);
    }
  }

  const hatchX = .24;
  const hatchY = 1.002;
  rounded(group, [m.rail, m.seam], 3.17, .242, .19, hatchX, hatchY, z + .17, .06, .024);
  rounded(group, m.black, 2.84, .098, .046, hatchX, hatchY + .015, z + .293, .027, .005);
  rounded(group, m.bronze, 2.86, .022, .044, hatchX, hatchY - .051, z + .322, .008, .004);
  for (const hx of [-1.48, 1.48]) fastener(group, m.metal, hatchX + hx, hatchY, z + .287, .037);

  const opening = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial());
  opening.visible = false;
  place(group, opening, x, y, z);
  return opening;
}

function makeDesk(group, m) {
  const center = 1.425;
  const legHeight = deskY - .21;
  flat(group, [m.wood, m.woodEdge], 12.14, 4.19, .15, 0, deskY - .119, center, .20, .027);
  flat(group, [m.deskTop, m.deskLip], 11.97, 4.04, .027, 0, deskY - .028, center, .19, .013);
  rounded(group, [m.wood, m.woodEdge], 11.98, .148, .14, 0, deskY - .154, 3.47, .052, .026);
  rounded(group, m.deskLip, 11.84, .041, .03, 0, deskY - .115, 3.568, .017, .008);
  box(group, m.underDesk, 11.45, .16, .15, 0, deskY - .32, 3.22);
  box(group, m.underDesk, 10.9, .13, .14, 0, deskY - .55, 3.25);
  for (const x of [-5.36, 5.36]) {
    for (const z of [-.23, 3.28]) {
      rounded(group, [m.underDesk, m.rail], .16, legHeight, .15, x, .015 + legHeight / 2, z, .04, .012);
      flat(group, m.black, .25, .24, .045, x, .034, z, .042, .01);
    }
    box(group, m.underDesk, .14, .11, 3.31, x, deskY - .42, 1.51);
  }
  for (const x of [-5.35, -2.6, 2.6, 5.35]) fastener(group, m.bronze, x, deskY - .20, 3.559, .026);

  flat(group, m.felt, 4.22, 1.24, .007, -1.17, deskY + .009, 1.91, .11, .008);
  for (const x of [-3.21, .87]) {
    for (const z of [1.34, 2.48]) {
      flat(group, m.paperEdge, .10, .10, .009, x, deskY + .021, z, .033, .002);
    }
  }
  for (const x of [-5.6, 5.58]) {
    flat(group, m.rail, .27, .48, .053, x, deskY + .034, -.40, .06, .012);
    cylinder(group, m.bronze, .045, .015, x, deskY + .073, -.46, 8);
  }
}

function makeClipboard(parent, m) {
  const group = place(parent, new THREE.Group(), -4.02, 2.9, -1.73);
  group.rotation.z = .052;
  rounded(group, [m.clipboard, m.woodEdge], 1.32, 1.68, .108, 0, 0, 0, .074, .026);
  rounded(group, m.paperEdge, 1.085, 1.38, .02, .013, -.016, .072, .021, .008);
  rounded(group, m.paper, 1.064, 1.36, .017, 0, -.003, .087, .021, .007);
  rounded(group, [m.metal, m.screw], .42, .154, .075, 0, .698, .113, .055, .017);
  fastener(group, m.bronze, 0, .75, .177, .025);
  rounded(group, m.ink, .67, .071, .009, 0, .455, .106, .017, .004);
  for (const [index, length] of [.62, .52, .66, .48, .59].entries()) {
    const y = .261 - index * .167;
    const mark = rounded(group, m.ink, .047, .047, .009, -.371, y, .106, .008, .002);
    mark.rotation.z = Math.PI / 4;
    rounded(group, m.oldInk, length, .022, .008, -.26 + length / 2, y, .107, .006, .002);
  }
  return group;
}

function makeShiftHolder(parent, m) {
  const group = place(parent, new THREE.Group(), 4.03, 3.56, -1.72);
  rounded(group, [m.rail, m.seam], 1.12, .63, .102, 0, 0, 0, .071, .026);
  rounded(group, m.paper, .882, .378, .024, 0, -.004, .076, .03, .007);
  rounded(group, m.ink, .78, .026, .009, 0, .127, .104, .008, .003);
  for (const x of [-.47, .47]) fastener(group, m.bronze, x, 0, .077, .034);
  return group;
}

function makeBinder(parent, m) {
  const group = place(parent, new THREE.Group(), 4.24, 2.30, -1.66);
  group.rotation.set(-.085, -.115, -.11);
  rounded(group, m.woodEdge, 1.28, 1.53, .145, 0, -.05, -.104, .087, .023);
  rounded(group, [m.binder, m.binderLight], 1.22, 1.42, .034, 0, 0, -.059, .062, .016);
  rounded(group, [m.paper, m.paperEdge], 1.127, 1.331, .149, .032, -.028, .031, .05, .009);
  rounded(group, [m.binder, m.binderLight], 1.202, 1.401, .053, 0, .006, .139, .067, .020);
  rounded(group, m.binderLight, .136, 1.353, .022, -.506, .006, .182, .039, .009);
  for (const y of [-.399, .022, .438]) {
    const ring = place(group, new THREE.Mesh(new THREE.TorusGeometry(.117, .024, 6, 20), m.metal), -.525, y, .153);
    ring.rotation.y = halfPi;
  }
  rounded(group, m.paperEdge, .602, .322, .011, .117, .194, .192, .045, .009);
  rounded(group, m.paper, .550, .274, .011, .119, .196, .207, .038, .005);
  rounded(group, m.oldInk, .357, .017, .007, .119, .206, .219, .006, .002);
  for (let i = 0; i < 5; i++) {
    box(group, m.paperEdge, .99 - i * .009, .013, .008, .039, -.655 + i * .018, .111 + i * .005);
  }
  return group;
}

function phoneBody(parent, m) {
  const profile = new THREE.Shape();
  profile.moveTo(-.406, .069);
  profile.lineTo(.395, .069);
  profile.lineTo(.375, .319);
  profile.quadraticCurveTo(.335, .355, .247, .329);
  profile.lineTo(-.355, .181);
  profile.quadraticCurveTo(-.432, .154, -.406, .069);
  const geometry = new THREE.ExtrudeGeometry(profile, {
    depth: 1.105, steps: 1, curveSegments: 4, bevelSize: .023, bevelThickness: .025, bevelSegments: 2,
  });
  geometry.rotateY(halfPi);
  geometry.translate(-.5525, 0, 0);
  parent.add(new THREE.Mesh(geometry, [m.phoneShade, m.phone]));
}

function makePhone(parent, m) {
  const group = place(parent, new THREE.Group(), -3.64, deskY, 1.03);
  group.rotation.y = -.14;
  flat(group, [m.phoneShade, m.cord], 1.17, .867, .112, 0, .091, .027, .103, .025);
  phoneBody(group, m);
  const keypad = place(group, new THREE.Group(), 0, .258, .082);
  keypad.rotation.x = .24;
  flat(keypad, [m.phoneShade, m.cord], .77, .574, .047, 0, .017, .008, .061, .019);
  for (let row = 0; row < 4; row++) {
    for (let column = 0; column < 3; column++) {
      const x = (column - 1) * .205;
      const z = .128 + (row - 1.5) * .105 - .11;
      flat(keypad, [m.key, m.phoneLight], .142, .069, .039, x, .065, z, .027, .011);
    }
  }
  for (const x of [-.385, .385]) {
    flat(group, [m.phoneShade, m.phone], .25, .289, .096, x, .339, -.233, .074, .024);
  }
  const handle = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-.485, .443, -.245), new THREE.Vector3(-.304, .55, -.247),
    new THREE.Vector3(.005, .574, -.264), new THREE.Vector3(.301, .542, -.26),
    new THREE.Vector3(.484, .432, -.247),
  ]);
  group.add(new THREE.Mesh(new THREE.TubeGeometry(handle, 21, .087, 8, false), m.phoneLight));
  for (const x of [-.506, .506]) {
    const earpiece = flat(group, [m.phoneLight, m.phone], .285, .297, .146, x, .43, -.244, .088, .036);
    earpiece.rotateY(x < 0 ? -.09 : .09);
  }
  rounded(group, m.bronze, .211, .033, .015, -.289, .13, .475, .013, .006);

  const cordCenter = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-.628, .406, -.224), new THREE.Vector3(-.781, .202, -.101),
    new THREE.Vector3(-.852, .103, .133), new THREE.Vector3(-.816, .076, .442),
    new THREE.Vector3(-.674, .075, .579), new THREE.Vector3(-.535, .126, .392),
  ]);
  const cordSpine = [];
  for (let i = 0; i <= 144; i++) {
    const t = i / 144;
    const point = cordCenter.getPoint(t);
    const direction = cordCenter.getTangent(t);
    const side = new THREE.Vector3(-direction.z, 0, direction.x).normalize();
    const up = new THREE.Vector3().crossVectors(direction, side).normalize();
    const radius = .046 * Math.min(1, t * 15, (1 - t) * 15);
    const phase = t * Math.PI * 35;
    cordSpine.push(point.addScaledVector(side, Math.sin(phase) * radius).addScaledVector(up, Math.cos(phase) * radius));
  }
  group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cordSpine), 160, .014, 6, false), m.cord));
  return group;
}

function makeTray(parent, m) {
  const group = place(parent, new THREE.Group(), 1.62, deskY, 1.7);
  flat(group, [m.tray, m.rail], 1.40, 1.09, .071, 0, .066, 0, .109, .027);
  flat(group, m.trayFelt, 1.237, .909, .031, 0, .104, 0, .073, .012);
  for (const side of [-1, 1]) {
    flat(group, [m.work, m.rail], .058, .823, .051, side * .642, .125, 0, .027, .009);
    cylinder(group, m.bronze, .034, .023, side * .596, .134, .412, 8);
  }
  rounded(group, m.bronze, .188, .039, .015, 0, .084, .558, .014, .004);
  return group;
}

function makePencil(parent, m) {
  const group = place(parent, new THREE.Group(), .52, deskY + .053, 2.60);
  group.rotation.y = -.28;
  const segment = (x, length, outer, inner, material, sides) => {
    const geometry = new THREE.CylinderGeometry(outer, inner, length, sides);
    const body = place(group, new THREE.Mesh(geometry, material), x, 0, 0);
    body.rotation.z = -halfPi;
  };
  segment(-.019, .681, .032, .032, m.pencil, 6);
  segment(.376, .11, .006, .031, m.deskLip, 6);
  segment(.442, .026, .001, .007, m.graphite, 6);
  segment(-.38, .061, .032, .033, m.metal, 10);
  segment(-.391, .008, .035, .035, m.bronze, 10);
  segment(-.432, .045, .030, .025, m.eraser, 10);
  group.visible = false;
  return group;
}

function markStroke(parent, material, x1, z1, x2, z2, thickness, y) {
  const len = Math.hypot(x2 - x1, z2 - z1);
  const stroke = flat(parent, material, len, thickness, .015, (x1 + x2) / 2, y, (z1 + z2) / 2, .013, .003);
  stroke.rotateZ(-Math.atan2(z2 - z1, x2 - x1));
}

function makeCargoLane(parent, m) {
  const lane = place(parent, new THREE.Group(), .15, 1.27, -2.39);
  flat(lane, [m.cargoLane, m.rail], 7.24, .96, .096, 0, -.079, 0, .046, .016);
  box(lane, m.seam, 7.18, .062, .039, 0, -.105, .483);
  for (const x of [-2.86, -.69, 1.49, 2.84]) {
    fastener(lane, m.metal, x, -.104, .507, .018);
  }

  // The isolated bay is a painted bay on the real shelf, with front corners visible from the booth.
  const bay = -2.11;
  for (const side of [-1, 1]) {
    const corner = bay + side * .62;
    box(lane, m.cargoMark, .073, .011, .78, corner, -.015, 0);
    box(lane, m.cargoMark, .26, .011, .063, corner - side * .094, -.015, .393);
    box(lane, m.cargoMark, .081, .056, .017, corner, -.053, .489);
  }
  box(lane, m.cargoMark, 1.31, .012, .063, bay, -.015, -.393);

  const cargo = place(lane, new THREE.Group(), 0, 0, 0);
  const width = .90;
  const depth = .65;
  const height = .62;
  rounded(cargo, [m.cargoTop, m.cargoSide], width, height, depth, 0, height / 2, 0, .031, .016);
  box(cargo, m.cargoTape, .113, .012, depth + .017, .048, height + .019, 0);
  box(cargo, m.cargoTape, .112, .146, .011, .048, height - .053, depth / 2 + .02);
  box(cargo, m.cargoSide, width - .053, .013, .012, 0, height - .104, depth / 2 + .019);

  const label = place(cargo, new THREE.Group(), -.235, .277, depth / 2 + .020);
  label.rotation.z = -.047;
  box(label, m.paper, .254, .167, .014, 0, 0, 0);
  box(label, m.ink, .161, .023, .006, -.012, .046, .009);
  box(label, m.oldInk, .119, .011, .006, -.033, .007, .009);
  for (const x of [-.076, -.046, -.020, .013, .037, .075]) {
    box(label, m.graphite, .013, .037, .007, x, -.039, .009);
  }
  box(cargo, m.oldInk, .115, .072, .007, .286, .133, depth / 2 + .023);
  cargo.visible = false;
  return cargo;
}

function makeStampMachine(parent, m, anchors, caps) {
  const machine = place(parent, new THREE.Group(), 3.46, deskY, 1.04);
  flat(machine, [m.machine, m.seam], 2.12, 1.014, .146, 0, .125, 0, .128, .046);
  flat(machine, [m.machineEdge, m.rail], 2, .892, .070, 0, .231, -.017, .094, .029);
  flat(machine, m.rail, 1.887, .137, .061, 0, .286, -.354, .041, .012);
  rounded(machine, m.black, 1.42, .057, .042, 0, .131, .529, .022, .009);
  rounded(machine, m.bronze, 1.45, .024, .039, 0, .090, .533, .012, .004);
  for (const x of [-.934, .938]) {
    rounded(machine, m.machineEdge, .122, .212, .095, x, .136, .442, .04, .018);
    fastener(machine, m.screw, x, .127, .508, .041);
  }

  for (const [index, key] of ['pass', 'fail', 'review'].entries()) {
    const anchor = place(machine, new THREE.Group(), (index - 1) * .597, 0, .004);
    anchors[key] = anchor;
    flat(anchor, [m.black, m.screw], .487, .488, .07, 0, .300, 0, .067, .018);
    const cap = place(anchor, new THREE.Group(), 0, .367, 0);
    caps[key] = cap;
    flat(cap, [m[key], m.rail], .401, .399, .102, 0, 0, 0, .066, .021);
    flat(cap, m[key], .332, .315, .022, 0, .066, -.007, .054, .011);
    if (key === 'pass') {
      markStroke(cap, m.stampMark, -.103, -.006, -.034, .069, .032, .092);
      markStroke(cap, m.stampMark, -.037, .068, .109, -.087, .031, .092);
    } else if (key === 'fail') {
      markStroke(cap, m.stampMark, -.079, -.079, .079, .079, .031, .092);
      markStroke(cap, m.stampMark, .079, -.079, -.079, .079, .031, .092);
    } else {
      markStroke(cap, m.stampMark, -.082, -.052, .082, -.052, .027, .092);
      markStroke(cap, m.stampMark, -.082, .051, .082, .051, .027, .092);
    }
  }

  const paper = place(machine, new THREE.Group(), 0, .139, .480);
  flat(paper, m.paper, .56, .44, .009, 0, 0, 0, .019, .003);
  for (const z of [-.142, -.072, .012]) box(paper, m.oldInk, .302, .003, .019, -.05, .008, z);
  const imprint = flat(paper, m.pass, .141, .067, .006, .143, .009, .106, .012, .002);
  imprint.rotateZ(.13);
  paper.visible = false;
  return { paper, imprint, inks: { pass: m.pass, fail: m.fail, review: m.review } };
}

export function createWorkbenchModels() {
  const group = new THREE.Group();
  const m = workshopMaterials();
  const caps = {};
  const anchors = {};

  anchors.window = makeRoom(group, m, BOOTH_METRICS.window);
  makeDesk(group, m);
  anchors.rules = makeClipboard(group, m);
  anchors.shift = makeShiftHolder(group, m);
  anchors.archive = makeBinder(group, m);
  anchors.phone = makePhone(group, m);
  anchors.sample = makeTray(group, m);
  anchors.pencil = makePencil(group, m);
  const outgoingSlip = makeStampMachine(group, m, anchors, caps);
  const cargo = makeCargoLane(group, m);
  return { group, anchors, caps, cargo, outgoingSlip };
}
