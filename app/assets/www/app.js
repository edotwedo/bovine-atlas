'use strict';
/* Bovine Atlas — procedural 3D bovine anatomy for butchery training.
   Coordinates: metres, x = cranial (head), y = up, z = left lateral. Ground at y = 0.
   Paired structures are built on the left side and mirrored. */

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
const COLORS = { hide: 0x6b3a22, fat: 0xf1e2b4, muscle: 0xa8332f, bone: 0xe6dcc3, cart: 0xa9cfd8, hoof: 0x2b2420, horn: 0xcfc4a8 };
const LAYERS = ['skin', 'fat', 'muscle', 'bone'];
const LAYER_NAMES = { skin: 'Skin', fat: 'Fat', muscle: 'Muscle', bone: 'Bone' };

// ---------- geometry helpers ----------
function smooth(tbl, x, k) {
  if (x <= tbl[0][0]) return tbl[0][k];
  for (let i = 0; i < tbl.length - 1; i++) {
    const a = tbl[i], b = tbl[i + 1];
    if (x <= b[0]) {
      // Catmull-Rom through neighbours for C1 continuity
      const p0 = (tbl[i - 1] || a)[k], p1 = a[k], p2 = b[k], p3 = (tbl[i + 2] || b)[k];
      const u = (x - a[0]) / (b[0] - a[0]), u2 = u * u, u3 = u2 * u;
      return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
    }
  }
  return tbl[tbl.length - 1][k];
}

// Generic loft: center(t, out), w(t) lateral half-width, h(t) half-height; superellipse section exponent p.
function loft(center, wf, hf, o = {}) {
  const S = o.seg || 28, R = o.rad || 14, p = o.p || 2;
  const ref = o.ref || V3(0, 1, 0);
  const pos = new Float32Array(((S + 1) * R + 2) * 3);
  const idx = [];
  const c = V3(), a = V3(), b = V3(), T = V3(), B = V3(), N = V3();
  let k = 0;
  for (let i = 0; i <= S; i++) {
    const t = i / S;
    center(t, c);
    center(Math.min(1, t + 0.01), b); center(Math.max(0, t - 0.01), a);
    T.subVectors(b, a).normalize();
    if (o.axisX) T.set(1, 0, 0);
    B.crossVectors(T, ref).normalize(); N.crossVectors(B, T).normalize();
    const w = wf(t), h = hf(t), hb = o.hb ? o.hb(t) : h, dn = o.dn ? o.dn(t) : 0;
    for (let j = 0; j < R; j++) {
      const ang = j / R * TAU, ca = Math.cos(ang), sa = Math.sin(ang);
      const u = Math.sign(ca) * Math.pow(Math.abs(ca), 2 / p), v = Math.sign(sa) * Math.pow(Math.abs(sa), 2 / p);
      const hh = v >= 0 ? h : hb;
      pos[k++] = c.x + N.x * (v * hh + dn) + B.x * u * w;
      pos[k++] = c.y + N.y * (v * hh + dn) + B.y * u * w;
      pos[k++] = c.z + N.z * (v * hh + dn) + B.z * u * w;
    }
  }
  for (let i = 0; i < S; i++) for (let j = 0; j < R; j++) {
    const q = i * R + j, r = i * R + (j + 1) % R, s = (i + 1) * R + j, u = (i + 1) * R + (j + 1) % R;
    idx.push(q, s, r, r, s, u);
  }
  const cs = (S + 1) * R, ce = cs + 1;
  center(0, c); pos[k++] = c.x; pos[k++] = c.y; pos[k++] = c.z;
  center(1, c); pos[k++] = c.x; pos[k++] = c.y; pos[k++] = c.z;
  for (let j = 0; j < R; j++) {
    idx.push(cs, j, (j + 1) % R);
    idx.push(ce, S * R + (j + 1) % R, S * R + j);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function pathCenter(pts) {
  const curve = new THREE.CatmullRomCurve3(pts.map(p => V3(p[0], p[1], p[2])), false, 'centripetal');
  return (t, out) => curve.getPointAt(t, out);
}
function autoRef(pts) {
  const a = pts[0], b = pts[pts.length - 1];
  const d = V3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
  return Math.abs(d.y) > 0.7 ? V3(1, 0, 0) : V3(0, 1, 0);
}
const ENV = {
  spindle: t => 0.12 + 0.88 * Math.pow(Math.sin(Math.PI * t), 0.6),
  flat: t => 0.2 + 0.8 * Math.pow(Math.sin(Math.PI * t), 0.3),
  bone: t => 0.8 + 0.7 * Math.exp(-Math.pow(t / 0.09, 2)) + 0.6 * Math.exp(-Math.pow((1 - t) / 0.09, 2)),
  rod: t => 1,
};
function tube(pts, w, h, o = {}) {
  const env = typeof o.env === 'function' ? o.env : ENV[o.env || 'spindle'];
  const wf = typeof w === 'function' ? w : t => w * env(t);
  const hf = typeof h === 'function' ? h : t => h * env(t);
  return loft(pathCenter(pts), wf, hf, Object.assign({ ref: autoRef(pts) }, o));
}

// ---------- scene ----------
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2.5));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x15171c);
const camera = new THREE.PerspectiveCamera(38, 1, 0.02, 50);
const HOME = { pos: V3(1.2, 1.35, 3.3), target: V3(0.05, 0.78, 0) };
camera.position.copy(HOME.pos);
const controls = new THREE.OrbitControls(camera, canvas);
controls.target.copy(HOME.target);
controls.enableDamping = true; controls.dampingFactor = 0.09;
controls.rotateSpeed = 0.8; controls.zoomSpeed = 1.0; controls.panSpeed = 0.8;
controls.minDistance = 0.35; controls.maxDistance = 7;
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
controls.update();

scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a2e26, 0.75));
const key = new THREE.DirectionalLight(0xffffff, 0.85); key.position.set(2, 4, 3); scene.add(key);
const rim = new THREE.DirectionalLight(0xbfd4ff, 0.35); rim.position.set(-3, 2, -2); scene.add(rim);
const fill = new THREE.DirectionalLight(0xffffff, 0.25); fill.position.set(0, -2, 1); scene.add(fill);

const floor = new THREE.Mesh(new THREE.CircleGeometry(2.2, 64), new THREE.MeshBasicMaterial({ color: 0x1d2027 }));
floor.rotation.x = -Math.PI / 2; scene.add(floor);
const grid = new THREE.PolarGridHelper(2.2, 8, 6, 64, 0x2a2e37, 0x2a2e37); grid.position.y = 0.001; scene.add(grid);

const root = new THREE.Group(); scene.add(root);

// ---------- registry ----------
const S = {};           // sid -> structure
const meshes = [];      // all pickable meshes
function reg(sid, meta) {
  if (!S[sid]) S[sid] = Object.assign({ sid, meshes: [], facts: [], primal: [], geo: 'schem' }, meta);
  return S[sid];
}
function mat(color, o = {}) {
  return new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.62, metalness: 0.0 }, o));
}
function add(sid, geom, color, o = {}) {
  const st = S[sid];
  const m = new THREE.Mesh(geom, mat(color, o.mat));
  m.userData = { sid, layer: st.layer, base: new THREE.Color(color), region: o.region, side: o.mirror ? 'R' : 'L' };
  if (o.mirror) m.scale.z = -1;
  root.add(m); st.meshes.push(m); meshes.push(m);
  return m;
}
function addPair(sid, geom, color, o = {}) {
  add(sid, geom, color, Object.assign({}, o, { mirror: false }));
  if (S[sid].paired !== false) add(sid, geom, color, Object.assign({}, o, { mirror: true }));
}

// ---------- skeleton (proportional) ----------
const xT = i => 0.62 - (i - 1) * 0.05;      // thoracic vertebra i (1..13)
const yT = i => 1.02 + (i - 1) * 0.006;
const xL = j => -0.05 - (j - 1) * 0.068;    // lumbar vertebra j (1..6)
const yL = 1.1;
function bone(sid, name, latin, meta) { return reg(sid, Object.assign({ name, latin, layer: 'bone', geo: 'prop' }, meta)); }
const BF = (s) => [SKELETON_FACTS[s][0], SKELETON_FACTS[s][1]];

function vertebra(sid, name, latin, x, y, opts) {
  bone(sid, name, latin, { paired: false, primal: opts.primal, facts: opts.facts || [BF('formula')] });
  const len = opts.len || 0.042, r = opts.r || 0.032;
  add(sid, loft((t, o) => o.set(x + len / 2 - t * len, y, 0), t => r, t => r * 0.9, { seg: 4, rad: 12, p: 2.2 }), COLORS.bone);
  if (opts.spine) { // spinous process, leaning caudally
    const [hgt, lean] = opts.spine;
    add(sid, tube([[x, y + r * 0.7, 0], [x - lean * 0.5, y + hgt * 0.55, 0], [x - lean, y + hgt, 0]], 0.008, 0.018, { env: 'flat', seg: 6, rad: 8 }), COLORS.bone);
  }
  if (opts.trans) { // transverse processes
    const tl = opts.trans;
    for (const s of [1, -1]) add(sid, tube([[x, y, 0.02 * s], [x, y + 0.005, 0.5 * tl * s], [x, y - 0.005, tl * s]], 0.022, 0.006, { env: 'flat', seg: 6, rad: 8 }), COLORS.bone);
  }
}

function buildSkeleton() {
  // Skull and mandible (midline)
  bone('skull', 'Skull', 'Cranium', { paired: false, primal: ['none'], facts: [['Polled (hornless) skull shown; horned breeds carry cornual processes on the frontal bone.', 'budras']] });
  add('skull', tube([[1.12, 1.17, 0], [1.22, 1.08, 0], [1.34, 0.96, 0], [1.44, 0.86, 0]],
    t => 0.085 * (1 - 0.45 * t) + 0.012 * Math.exp(-Math.pow((t - 0.15) / 0.12, 2)), t => 0.07 * (1 - 0.35 * t), { env: 'flat', seg: 18, p: 2.4 }), COLORS.bone);
  for (const s of [1, -1]) add('skull', new THREE.SphereGeometry(0.024, 12, 10).translate(1.2, 1.12, 0.072 * s), COLORS.bone); // orbits
  bone('mandible', 'Mandible', 'Mandibula', { paired: false, primal: ['none'], facts: [['Paired halves joined at the rostral symphysis.', 'budras']] });
  for (const s of [1, -1]) add('mandible', tube([[1.13, 1.07, 0.055 * s], [1.21, 1.0, 0.05 * s], [1.33, 0.92, 0.04 * s], [1.42, 0.87, 0.02 * s]], 0.009, 0.026, { env: 'flat', seg: 12, rad: 8 }), COLORS.bone);

  // Cervical C1-C7
  const cerv = [[1.06, 1.12], [0.99, 1.08], [0.92, 1.04], [0.85, 1.01], [0.78, 0.99], [0.72, 0.98], [0.665, 0.985]];
  cerv.forEach(([x, y], i) => vertebra('C' + (i + 1), 'Cervical vertebra C' + (i + 1), 'Vertebra cervicalis ' + (i + 1), x, y,
    { primal: ['chuck'], len: i === 0 ? 0.04 : 0.06, r: 0.03, trans: 0.05, spine: i >= 5 ? [0.05 + i * 0.02, 0.0] : null }));
  // Thoracic T1-T13, tall spines at the withers
  for (let i = 1; i <= 13; i++) {
    const h = i <= 3 ? 0.26 + (i - 1) * 0.015 : Math.max(0.1, 0.29 - (i - 3) * 0.02);
    const primal = i <= 5 ? ['chuck'] : i <= 12 ? ['rib'] : ['shortloin'];
    vertebra('T' + i, 'Thoracic vertebra T' + i, 'Vertebra thoracica ' + i, xT(i), yT(i), { primal, spine: [h, 0.08 - i * 0.004], trans: 0.045 });
  }
  // Lumbar L1-L6, long transverse processes
  for (let j = 1; j <= 6; j++) {
    vertebra('L' + j, 'Lumbar vertebra L' + j, 'Vertebra lumbalis ' + j, xL(j), yL, { primal: j <= 5 ? ['shortloin'] : ['sirloin'], len: 0.058, r: 0.033, spine: [0.1, 0.01], trans: 0.12 });
  }
  // Sacrum (5 fused)
  bone('sacrum', 'Sacrum', 'Os sacrum', { paired: false, primal: ['sirloin', 'round'], facts: [['Five fused sacral vertebrae.', 'budras']] });
  add('sacrum', tube([[-0.42, 1.11, 0], [-0.56, 1.1, 0], [-0.7, 1.07, 0]], 0.06, 0.03, { env: t => 1 - 0.6 * t, seg: 10 }), COLORS.bone);
  add('sacrum', tube([[-0.45, 1.13, 0], [-0.58, 1.17, 0], [-0.68, 1.12, 0]], 0.008, 0.02, { env: 'flat', seg: 8, rad: 6 }), COLORS.bone);
  // Coccygeal
  bone('coccygeal', 'Coccygeal vertebrae', 'Vertebrae caudales (Cd1–Cd18±)', { paired: false, primal: ['none'], facts: [BF('formula')] });
  const tail = new THREE.CatmullRomCurve3([V3(-0.71, 1.07, 0), V3(-0.8, 1.0, 0), V3(-0.84, 0.8, 0), V3(-0.85, 0.5, 0)]);
  for (let i = 0; i < 18; i++) {
    const t0 = i / 18, t1 = (i + 0.8) / 18, a = tail.getPointAt(t0), b = tail.getPointAt(t1), r = 0.022 * (1 - i / 22);
    add('coccygeal', tube([[a.x, a.y, 0], [(a.x + b.x) / 2, (a.y + b.y) / 2, 0], [b.x, b.y, 0]], r, r, { env: 'bone', seg: 4, rad: 8 }), COLORS.bone);
  }

  // Sternum
  bone('sternum', 'Sternum', 'Sternum', { paired: false, primal: ['brisket', 'plate'], facts: [['Seven sternebrae; the first eight rib pairs articulate with it via costal cartilages.', 'budras']] });
  add('sternum', tube([[0.68, 0.62, 0], [0.5, 0.56, 0], [0.3, 0.54, 0], [0.2, 0.55, 0]], 0.03, 0.02, { env: 'flat', seg: 14 }), COLORS.bone);

  // Ribs 1-13 with costal cartilages
  const sternX = k => 0.64 - (k - 1) * 0.055, sternY = k => 0.575 - (k - 1) * 0.004;
  for (let i = 1; i <= 13; i++) {
    const sid = 'rib_' + i, sternal = i <= 8;
    const primal = i <= 5 ? ['chuck'] : i <= 12 ? ['rib', 'plate'] : ['shortloin', 'flank'];
    bone(sid, 'Rib ' + i + (sternal ? ' (sternal)' : ' (asternal)'), 'Costa ' + i, { primal, facts: [BF('ribs')] });
    const xd = xT(i) - 0.01, yd = yT(i), w = 0.15 + 0.17 * Math.sin(Math.min(1, (i - 1) / 7) * Math.PI / 2) - (i > 11 ? (i - 11) * 0.01 : 0);
    const yv = sternal ? 0.72 - Math.min(i, 5) * 0.012 : 0.7 + (i - 8) * 0.04;
    const xv = xd - 0.08 - i * 0.008;
    const zv = sternal ? w * 0.75 : w * 0.95;
    const pts = [[xd, yd + 0.01, 0.035], [xd - 0.012, yd + 0.015, w * 0.55], [xd - 0.04, yd - 0.12, w], [xv + 0.01, (yd + yv) / 2 - 0.08, w * 1.0], [xv, yv, zv]];
    addPair(sid, tube(pts, 0.009, 0.017 + (i < 8 ? i * 0.0015 : 0.012), { env: 'rod', seg: 20, rad: 7 }), COLORS.bone);
    // costal cartilage
    let cEnd;
    if (sternal) cEnd = [sternX(i), sternY(i), 0.03];
    else cEnd = [xv - 0.05, yv - 0.07, zv * 0.85];
    addPair(sid, tube([[xv, yv, zv], [(xv + cEnd[0]) / 2, (yv + cEnd[1]) / 2 - 0.01, (zv + cEnd[2]) / 2 + 0.03], cEnd], 0.008, 0.012, { env: 'rod', seg: 10, rad: 6 }), COLORS.cart);
  }

  // Forelimb (left, mirrored)
  bone('scapula', 'Scapula', 'Scapula', { primal: ['chuck'], facts: [['Flat triangular bone with a spine dividing the supra- and infraspinous fossae.', 'budras']] });
  addPair('scapula', tube([[0.47, 1.26, 0.165], [0.56, 1.08, 0.205], [0.66, 0.94, 0.24], [0.69, 0.9, 0.245]],
    t => 0.011, t => 0.02 + 0.09 * Math.pow(1 - t, 1.4) + 0.025 * Math.exp(-Math.pow((1 - t) / 0.06, 2)), { env: 'rod', seg: 16, rad: 10, p: 2.5 }), COLORS.bone);
  addPair('scapula', tube([[0.5, 1.23, 0.185], [0.6, 1.07, 0.23], [0.67, 0.95, 0.255]], 0.012, 0.006, { env: 'flat', seg: 8, rad: 6 }), COLORS.bone);
  bone('humerus', 'Humerus', 'Humerus', { primal: ['chuck'], facts: [['Arm bone from the shoulder joint to the elbow.', 'budras']] });
  addPair('humerus', tube([[0.7, 0.92, 0.225], [0.62, 0.8, 0.225], [0.52, 0.67, 0.212]], 0.028, 0.032, { env: 'bone', seg: 14 }), COLORS.bone);
  bone('radius_ulna', 'Radius and ulna', 'Radius et ulna', { primal: ['foreshank'], facts: [['In the ox the ulna runs the length of the forearm, closely united with the radius.', 'budras']] });
  addPair('radius_ulna', tube([[0.53, 0.66, 0.215], [0.54, 0.5, 0.205], [0.55, 0.36, 0.195]], 0.025, 0.022, { env: 'bone', seg: 12 }), COLORS.bone);
  addPair('radius_ulna', tube([[0.46, 0.73, 0.21], [0.5, 0.64, 0.21], [0.52, 0.5, 0.2]], 0.012, 0.022, { env: 'spindle', seg: 10 }), COLORS.bone);
  bone('carpus', 'Carpal bones', 'Ossa carpi', { primal: ['none'], facts: [['The carpus is the "knee" of the foreleg.', 'budras']] });
  addPair('carpus', tube([[0.55, 0.36, 0.195], [0.553, 0.335, 0.195], [0.555, 0.31, 0.195]], 0.03, 0.03, { env: 'rod', seg: 4, p: 2.6 }), COLORS.bone);
  bone('metacarpus', 'Metacarpal III+IV (cannon)', 'Os metacarpale III et IV', { primal: ['none'], facts: [['Metacarpals III and IV are fused into one cannon bone.', 'budras']] });
  addPair('metacarpus', tube([[0.555, 0.305, 0.195], [0.557, 0.21, 0.195], [0.56, 0.12, 0.195]], 0.022, 0.018, { env: 'bone', seg: 10 }), COLORS.bone);
  bone('phalanges_fore', 'Phalanges (fore)', 'Ossa digitorum manus', { primal: ['none'], facts: [BF('digits')] });
  for (const d of [1, -1]) addPair('phalanges_fore', tube([[0.56, 0.115, 0.195 + d * 0.022], [0.575, 0.07, 0.195 + d * 0.026], [0.6, 0.025, 0.195 + d * 0.028]], 0.011, 0.014, { env: 'bone', seg: 8, rad: 8 }), COLORS.bone);

  // Hindlimb
  bone('os_coxae', 'Os coxae (pelvis)', 'Os coxae (ilium, ischium, pubis)', { primal: ['sirloin', 'round'], facts: [['Tuber coxae = hook bone; tuber ischiadicum = pin bone. The aitch bone of butchery is the pelvis.', 'budras']] });
  addPair('os_coxae', tube([[-0.41, 1.17, 0.25], [-0.45, 1.17, 0.16], [-0.48, 1.18, 0.08]], 0.035, 0.012, { env: 'flat', seg: 10, rad: 10 }), COLORS.bone);
  addPair('os_coxae', tube([[-0.45, 1.16, 0.17], [-0.54, 1.07, 0.175], [-0.62, 0.98, 0.18]], 0.018, 0.03, { env: 'flat', seg: 10 }), COLORS.bone);
  addPair('os_coxae', tube([[-0.62, 0.98, 0.17], [-0.71, 1.0, 0.14], [-0.81, 1.02, 0.1]], 0.014, 0.04, { env: 'flat', seg: 10 }), COLORS.bone);
  addPair('os_coxae', tube([[-0.6, 0.95, 0.15], [-0.66, 0.9, 0.08], [-0.7, 0.89, 0.005]], 0.035, 0.01, { env: 'flat', seg: 8 }), COLORS.bone);
  bone('femur', 'Femur', 'Femur', { primal: ['round'], facts: [['Thigh bone from the hip (acetabulum) to the stifle.', 'budras']] });
  addPair('femur', tube([[-0.63, 1.0, 0.205], [-0.57, 0.82, 0.215], [-0.5, 0.65, 0.21]], 0.026, 0.03, { env: 'bone', seg: 14 }), COLORS.bone);
  bone('patella', 'Patella', 'Patella', { primal: ['round'], facts: [['Sesamoid in the quadriceps tendon at the stifle.', 'budras']] });
  addPair('patella', new THREE.SphereGeometry(0.022, 12, 10).scale(0.8, 1.2, 0.8).translate(-0.465, 0.675, 0.215), COLORS.bone);
  bone('tibia', 'Tibia', 'Tibia (fibula reduced)', { primal: ['hindshank'], facts: [['The fibula is reduced: its head fuses to the tibia and its distal end is the separate malleolar bone.', 'budras']] });
  addPair('tibia', tube([[-0.5, 0.63, 0.205], [-0.59, 0.5, 0.19], [-0.68, 0.38, 0.18]], 0.025, 0.026, { env: 'bone', seg: 12 }), COLORS.bone);
  bone('tarsus', 'Tarsal bones (hock)', 'Ossa tarsi', { primal: ['none'], facts: [['The calcaneus forms the point of the hock.', 'budras']] });
  addPair('tarsus', tube([[-0.745, 0.46, 0.18], [-0.715, 0.4, 0.18], [-0.685, 0.35, 0.18]], 0.016, 0.018, { env: 'bone', seg: 8 }), COLORS.bone);
  addPair('tarsus', tube([[-0.68, 0.385, 0.18], [-0.675, 0.35, 0.18], [-0.67, 0.31, 0.18]], 0.028, 0.026, { env: 'rod', seg: 4, p: 2.6 }), COLORS.bone);
  bone('metatarsus', 'Metatarsal III+IV (cannon)', 'Os metatarsale III et IV', { primal: ['none'], facts: [['Metatarsals III and IV are fused into one cannon bone.', 'budras']] });
  addPair('metatarsus', tube([[-0.67, 0.305, 0.18], [-0.655, 0.21, 0.18], [-0.64, 0.12, 0.18]], 0.02, 0.018, { env: 'bone', seg: 10 }), COLORS.bone);
  bone('phalanges_hind', 'Phalanges (hind)', 'Ossa digitorum pedis', { primal: ['none'], facts: [BF('digits')] });
  for (const d of [1, -1]) addPair('phalanges_hind', tube([[-0.64, 0.115, 0.18 + d * 0.022], [-0.625, 0.07, 0.18 + d * 0.026], [-0.6, 0.025, 0.18 + d * 0.028]], 0.011, 0.014, { env: 'bone', seg: 8, rad: 8 }), COLORS.bone);
}

// ---------- conform: keep deep structures inside the fat layer ----------
const FAT_IN = 0.028;
function neckT(x) { let best = 0, bd = 1e9; for (let i = 0; i <= 80; i++) { const t = i / 80, d = Math.abs(smooth(NECK, t, 1) - x); if (d < bd) { bd = d; best = t; } } return best; }
function conformGeom(g, inset, keepBelow) {
  const pos = g.attributes.position, x0 = BODY[0][0], x1 = BODY[BODY.length - 1][0];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const cands = [];
    if (x > x0 && x < x1) cands.push([smooth(BODY, x, 1), smooth(BODY, x, 2), smooth(BODY, x, 3), smooth(BODY, x, 4), 2.5]);
    if (x > 0.67 && x < 1.16) { const t = neckT(x), nh = smooth(NECK, t, 3); cands.push([smooth(NECK, t, 2), nh, nh * (1.15 - 0.1 * t), smooth(NECK, t, 4), 2.2]); }
    let best = null, be = 1e9;
    for (const [yc, ht, hb, w, p] of cands) {
      const dy = y - yc, h = (dy >= 0 ? ht : hb) - inset, ww = w - inset;
      if (h < 0.01 || ww < 0.01) continue;
      if (keepBelow && dy < -h) continue;
      const e = Math.pow(Math.abs(z) / ww, p) + Math.pow(Math.abs(dy) / h, p);
      if (e < be) { be = e; best = [yc, p]; }
    }
    if (!best || be <= 1) continue;
    const f = Math.pow(be, -1 / best[1]);
    pos.setXYZ(i, x, best[0] + (y - best[0]) * f, z * f);
  }
  pos.needsUpdate = true; g.computeVertexNormals();
  return g;
}

// ---------- muscles (schematic) ----------
function buildMuscles() {
  MUSCLES.forEach((m, i) => {
    reg(m.sid, { name: m.name, latin: m.latin, layer: 'muscle', geo: 'schem', primal: m.primal, facts: m.facts });
    const hue = new THREE.Color(COLORS.muscle).offsetHSL((i % 5 - 2) * 0.008, 0, ((i * 7) % 5 - 2) * 0.025);
    if (m.custom === 'diaphragm') {
      // dome bulging cranially, spanning the caudal thorax
      const g = new THREE.SphereGeometry(1, 28, 16, 0, TAU, 0, Math.PI * 0.5);
      g.rotateZ(-Math.PI / 2); g.scale(0.16, 0.31, 0.3); g.rotateZ(-0.28); g.translate(0.02, 0.86, 0);
      add(m.sid, g, hue.getHex(), { mat: { side: THREE.DoubleSide } });
      S[m.sid].paired = false;
      return;
    }
    const g = tube(m.path, m.w, m.h, { env: m.env || 'spindle', seg: 22, rad: 14, p: 2.2 });
    if (!m.limb) conformGeom(g, FAT_IN + 0.006);
    addPair(m.sid, g, hue.getHex());
  });
}

// ---------- body shell (skin + fat) ----------
// x, centre y, half-height top, half-height bottom, half-width
const BODY = [
  [-0.9, 1.04, 0.05, 0.05, 0.05],
  [-0.84, 1.0, 0.17, 0.2, 0.16],
  [-0.74, 0.97, 0.25, 0.3, 0.25],
  [-0.6, 0.95, 0.28, 0.34, 0.3],
  [-0.42, 0.94, 0.3, 0.37, 0.33],
  [-0.2, 0.93, 0.31, 0.42, 0.375],
  [0.05, 0.95, 0.3, 0.44, 0.385],
  [0.28, 0.98, 0.32, 0.42, 0.37],
  [0.48, 1.0, 0.36, 0.43, 0.32],
  [0.64, 0.96, 0.32, 0.42, 0.31],
  [0.76, 0.88, 0.25, 0.32, 0.25],
  [0.83, 0.82, 0.12, 0.16, 0.1],
];
const NECK = [ // along t: x, y, half-h, half-w
  [0, 0.66, 0.98, 0.3, 0.2], [0.35, 0.86, 1.04, 0.22, 0.15], [0.7, 1.02, 1.08, 0.16, 0.11], [1, 1.14, 1.08, 0.13, 0.1],
];
function shell(inset) {
  const out = [];
  const x0 = BODY[0][0] + inset, x1 = BODY[BODY.length - 1][0] - inset;
  const body = loft((t, o) => { const x = x0 + (x1 - x0) * t; return o.set(x, smooth(BODY, x, 1), 0); },
    t => Math.max(0.01, smooth(BODY, x0 + (x1 - x0) * t, 4) - inset),
    t => Math.max(0.01, smooth(BODY, x0 + (x1 - x0) * t, 2) - inset),
    { seg: 90, rad: 40, p: 2.5, axisX: true, hb: t => Math.max(0.01, smooth(BODY, x0 + (x1 - x0) * t, 3) - inset) });
  out.push([body, 'body']);
  const neck = loft((t, o) => o.set(smooth(NECK, t, 1), smooth(NECK, t, 2), 0),
    t => Math.max(0.01, smooth(NECK, t, 4) - inset), t => Math.max(0.01, smooth(NECK, t, 3) - inset),
    { seg: 30, rad: 28, p: 2.2, axisX: true, hb: t => Math.max(0.01, smooth(NECK, t, 3) * (inset > 0 ? 0.9 : 1.15 - 0.1 * t) - inset) }); // dewlap (hide only)
  out.push([neck, 'neck']);
  return out;
}
function legShell(pts, prof) {
  return tube(pts, t => smooth(prof, t, 1), t => smooth(prof, t, 2), { env: 'rod', seg: 40, rad: 16, p: 2.2 });
}
const FORE_PROF = [[0, 0.085, 0.12], [0.2, 0.078, 0.1], [0.42, 0.055, 0.065], [0.55, 0.05, 0.052], [0.62, 0.044, 0.042], [0.82, 0.04, 0.036], [0.9, 0.045, 0.045], [1, 0.038, 0.05]];
const HIND_PROF = [[0, 0.095, 0.15], [0.2, 0.08, 0.12], [0.4, 0.06, 0.1], [0.5, 0.052, 0.095], [0.58, 0.044, 0.06], [0.82, 0.04, 0.038], [0.9, 0.045, 0.045], [1, 0.038, 0.05]];
function buildShell() {
  reg('skin', { name: 'Skin (hide)', latin: 'Cutis', layer: 'skin', geo: 'schem', paired: false, primal: [],
    facts: [['Hide is removed at slaughter; the outline here is a generic beef-type body, not a measured animal.', 'budras']] });
  reg('fat', { name: 'Subcutaneous fat', latin: 'Panniculus adiposus', layer: 'fat', geo: 'schem', paired: false, primal: [],
    facts: [['External (subcutaneous) fat cover; real depth varies with breed, finish and site.', 'namp']] });
  for (const [g, region] of shell(0)) add('skin', g, 0xffffff, { region, mat: { vertexColors: true, roughness: 0.85 } });
  for (const [g, region] of shell(0.028)) add('fat', g, 0xffffff, { region, mat: { vertexColors: true, roughness: 0.5 } });
  // head
  add('skin', tube([[1.06, 1.2, 0], [1.2, 1.1, 0], [1.33, 0.97, 0], [1.475, 0.83, 0]],
    t => 0.122 - 0.045 * t, t => 0.12 - 0.04 * t, { env: t => 0.35 + 0.65 * Math.pow(Math.sin(Math.PI * Math.min(0.94, t * 1.05 + 0.06)), 0.35), seg: 26, rad: 24, p: 2.4,
      hb: t => (0.16 - 0.07 * t) * (0.35 + 0.65 * Math.pow(Math.sin(Math.PI * Math.min(0.94, t * 1.05 + 0.06)), 0.35)) }), 0xffffff, { region: 'head', mat: { vertexColors: true, roughness: 0.85 } });
  for (const s of [1, -1]) { // ears
    const e = tube([[1.13, 1.16, 0.09 * s], [1.1, 1.18, 0.17 * s], [1.08, 1.17, 0.24 * s]], 0.01, 0.045, { env: 'spindle', seg: 10, rad: 10 });
    add('skin', e, 0xffffff, { region: 'head', mat: { vertexColors: true, roughness: 0.85 } });
  }
  // legs (left, mirrored)
  const legs = [
    [[[0.52, 0.8, 0.215], [0.52, 0.62, 0.21], [0.55, 0.36, 0.198], [0.56, 0.13, 0.196], [0.59, 0.05, 0.196]], FORE_PROF, 'foreleg'],
    [[[-0.6, 0.82, 0.21], [-0.56, 0.64, 0.2], [-0.705, 0.4, 0.181], [-0.668, 0.28, 0.18], [-0.645, 0.13, 0.18], [-0.61, 0.05, 0.181]], HIND_PROF, 'hindleg'],
  ];
  for (const [pts, prof, region] of legs) {
    const g = legShell(pts, prof);
    for (const mirror of [false, true]) add('skin', g, 0xffffff, { region, mirror, mat: { vertexColors: true, roughness: 0.85 } });
  }
  // tail with switch
  add('skin', tube([[-0.7, 1.08, 0], [-0.8, 1.01, 0], [-0.845, 0.8, 0], [-0.855, 0.45, 0]], 0.036, 0.036, { env: t => 1 - 0.55 * t, seg: 24, rad: 12 }), 0xffffff, { region: 'tail', mat: { vertexColors: true, roughness: 0.9 } });
  add('skin', tube([[-0.855, 0.5, 0], [-0.857, 0.4, 0], [-0.86, 0.28, 0]], 0.04, 0.04, { env: 'spindle', seg: 10, rad: 10 }), 0xffffff, { region: 'tail', mat: { vertexColors: true, roughness: 1 } });
  // hooves (claws)
  reg('hooves', { name: 'Claws (hooves)', latin: 'Ungulae', layer: 'skin', geo: 'schem', primal: ['none'], facts: [BF('digits')] });
  for (const [x, z] of [[0.6, 0.2], [-0.6, 0.185]]) for (const d of [1, -1]) {
    addPair('hooves', new THREE.CylinderGeometry(0.022, 0.03, 0.05, 10).scale(1.4, 1, 0.7).translate(x + 0.01, 0.025, z + d * 0.028), COLORS.hoof);
  }
}

// ---------- primal mapping ----------
function roundLineX(y) { return -0.7 + (1.15 - y) * 0.375; }
function primalAt(x, y, z, region) {
  if (region === 'head' || region === 'tail') return 'none';
  if (region === 'foreleg') return y < 0.36 ? 'none' : y < 0.66 ? 'foreshank' : (y < 0.78 ? 'brisket' : 'chuck');
  if (region === 'hindleg') return y < 0.38 ? 'none' : y < 0.62 ? 'hindshank' : 'round';
  if (region === 'neck') return 'chuck';
  if (x < roundLineX(y)) return 'round';
  const ventral = x > 0.4 ? 0.78 : 0.82;
  if (y < ventral) return x >= 0.395 ? 'brisket' : x >= 0.045 ? 'plate' : 'flank';
  return x >= 0.395 ? 'chuck' : x >= 0.045 ? 'rib' : x >= -0.365 ? 'shortloin' : 'sirloin';
}

// ---------- state ----------
const state = {
  mode: 'anatomy',             // anatomy | primals | cuts | dissect
  layers: { skin: 'on', fat: 'on', muscle: 'on', bone: 'on' },
  sel: null,                   // selected sid
  primalSel: null,
  cut: null,
  isolate: null,               // Set of sids
  removed: new Set(),          // removed meshes (dissect)
  removedStack: [],
  explode: 0,
};

function paintShell() {
  for (const m of meshes) {
    if (m.userData.layer !== 'skin' && m.userData.layer !== 'fat') continue;
    if (!m.material.vertexColors) continue;
    const g = m.geometry, pos = g.attributes.position;
    let col = g.attributes.color;
    if (!col) { col = new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3); g.setAttribute('color', col); }
    const base = new THREE.Color(m.userData.layer === 'skin' ? COLORS.hide : COLORS.fat);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      if (state.mode === 'primals' || state.mode === 'cuts') {
        c.set(PRIMALS[primalAt(x, y, z, m.userData.region)].color);
        if (m.userData.layer === 'skin') c.lerp(base, 0.12);
      } else {
        c.copy(base);
        if (m.userData.layer === 'skin') { // countershading + white face blaze for readability
          const shade = THREE.MathUtils.clamp((y - 0.5) * 0.35, -0.08, 0.12);
          c.offsetHSL(0, 0, shade);
          if (m.userData.region === 'head' && Math.abs(z) < 0.05 && y < 1.15) c.lerp(new THREE.Color(0xeee6d8), 0.85);
        }
      }
      col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
  }
}

function primalOfMesh(m) {
  const st = S[m.userData.sid];
  return st.primal && st.primal.length ? st.primal[0] : null;
}

function applyLook() {
  const sel = state.sel, iso = state.isolate;
  const cutSet = state.cut ? new Set(state.cut.muscles) : null;
  for (const m of meshes) {
    const ud = m.userData, st = S[ud.sid];
    let vis = state.layers[ud.layer] !== 'off' && !state.removed.has(m);
    let opacity = state.layers[ud.layer] === 'ghost' ? (ud.layer === 'muscle' || ud.layer === 'bone' ? 0.3 : 0.16) : 1;
    let color = ud.base.clone();
    if ((state.mode === 'primals' || state.mode === 'cuts') && (ud.layer === 'muscle' || ud.layer === 'bone')) {
      const p = primalOfMesh(m);
      if (p) color = new THREE.Color(PRIMALS[p].color).lerp(ud.base, ud.layer === 'bone' ? 0.6 : 0.25);
    }
    if (state.primalSel && state.mode === 'primals' && (ud.layer === 'muscle' || ud.layer === 'bone')) {
      if (!(st.primal || []).includes(state.primalSel)) opacity = Math.min(opacity, 0.12);
    }
    if (cutSet) {
      if (ud.layer === 'muscle') { if (!cutSet.has(ud.sid)) opacity = Math.min(opacity, 0.07); else color = new THREE.Color(0xd8483f); }
      else if (ud.layer === 'skin' || ud.layer === 'fat') vis = false;
      else opacity = Math.min(opacity, 0.18);
    }
    if (iso) vis = vis && iso.has(ud.sid) || (iso.has(ud.sid) && !state.removed.has(m));
    m.visible = vis;
    m.material.color.copy(color);
    const tr = opacity < 0.999;
    m.material.transparent = tr; m.material.opacity = opacity; m.material.depthWrite = !tr;
    m.renderOrder = tr ? 2 : 0;
    const hi = (sel && ud.sid === sel) || (cutSet && cutSet.has(ud.sid));
    m.material.emissive.setHex(hi ? 0x2a6f6a : 0x000000);
    m.material.emissiveIntensity = hi ? 0.9 : 0;
    m.material.needsUpdate = true;
  }
}

// ---------- explode / dissect ----------
const tmpBox = new THREE.Box3();
function computeExplodeDirs() {
  for (const m of meshes) {
    m.updateMatrixWorld(true);
    tmpBox.setFromObject(m);
    const c = tmpBox.getCenter(V3());
    m.userData.center = c.clone();
    const d = V3(0, c.y - 0.92, c.z);
    if (c.y < 0.72) d.set(0, -0.2, c.z * 3); // limbs: push laterally
    if (d.lengthSq() < 1e-6) d.set(0, 1, 0);
    d.normalize();
    d.x += (c.x - 0.0) * 0.25;
    m.userData.dir = d.normalize();
  }
}
function applyExplode() {
  for (const m of meshes) {
    const L = m.userData.layer;
    if (L !== 'muscle') continue;
    const k = state.explode * 0.32;
    m.position.copy(m.userData.dir).multiplyScalar(k);
  }
}
const flying = [];
function removeMesh(m) {
  flying.push({ m, t: 0, from: m.position.clone() });
  state.removedStack.push(m);
}
function stepFlying(dt) {
  for (let i = flying.length - 1; i >= 0; i--) {
    const f = flying[i]; f.t += dt / 0.45;
    const e = Math.min(1, f.t);
    f.m.position.copy(f.from).addScaledVector(f.m.userData.dir, e * e * 1.4);
    f.m.material.transparent = true; f.m.material.opacity = 1 - e;
    if (e >= 1) { state.removed.add(f.m); flying.splice(i, 1); applyExplode(); applyLook(); }
  }
}

// ---------- picking ----------
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function pick(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const cand = meshes.filter(m => m.visible && !(m.material.transparent && m.material.opacity < 0.5));
  const hits = ray.intersectObjects(cand, false);
  if (hits.length) return hits[0];
  const ghosts = meshes.filter(m => m.visible);
  const h2 = ray.intersectObjects(ghosts, false);
  return h2.length ? h2[0] : null;
}

let down = null;
canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, t: performance.now(), n: (down && down.n) || 0 }; });
canvas.addEventListener('pointerup', e => {
  if (!down) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t;
  down = null;
  if (moved > 10 || dt > 450) return;
  const hit = pick(e.clientX, e.clientY);
  onTap(hit);
});

function onTap(hit) {
  if (!hit) { select(null); return; }
  const m = hit.object, ud = m.userData;
  if (state.mode === 'dissect' && ud.layer === 'muscle') {
    toast('Removed: ' + S[ud.sid].name + (S[ud.sid].paired === false ? '' : ud.side === 'L' ? ' (left)' : ' (right)'));
    removeMesh(m); select(ud.sid, true); return;
  }
  if (state.mode === 'primals' && (ud.layer === 'skin' || ud.layer === 'fat')) {
    const p = primalAt(hit.point.x, hit.point.y, hit.point.z, ud.region);
    selectPrimal(p); return;
  }
  select(ud.sid);
}

// ---------- UI ----------
const $ = s => document.querySelector(s);
const sheet = $('#sheet'), sheetBody = $('#sheetBody');
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function srcTag(k) { return `<sup class="src" data-src="${k}">${Object.keys(SOURCES).indexOf(k) + 1}</sup>`; }
function badge(tier) { const f = FIDELITY[tier]; return `<span class="badge" style="--c:${f.color}">${f.label}</span>`; }
function primalChip(p) { return `<button class="chip pchip" data-primal="${p}" style="--c:${PRIMALS[p].color}">${esc(PRIMALS[p].name)}</button>`; }

function cutsForSid(sid) { return CUTS.filter(c => c.muscles.includes(sid)); }

function select(sid, keepSheet) {
  state.sel = sid; state.primalSel = null;
  applyLook();
  if (!sid) { if (!keepSheet) showHome(); return; }
  const st = S[sid];
  const cuts = cutsForSid(sid);
  const facts = (st.facts || []).map(([t, k]) => `<li>${esc(t)}${srcTag(k)}</li>`).join('');
  sheetBody.innerHTML = `
    <div class="h"><div><div class="ttl">${esc(st.name)}</div><div class="lat">${esc(st.latin || '')}</div></div>
      <button class="x" data-act="close">✕</button></div>
    <div class="row">${badge(st.geo)}<span class="badge" style="--c:${FIDELITY.fact.color}">Facts cited</span>
      <span class="meta">${LAYER_NAMES[st.layer]} · ${st.paired === false ? 'midline / single' : 'paired (L+R)'}</span></div>
    ${st.primal && st.primal.length ? `<div class="row"><span class="lbl">Primal</span>${st.primal.map(primalChip).join('')}</div>` : ''}
    ${cuts.length ? `<div class="row"><span class="lbl">Cuts</span>${cuts.map(c => `<button class="chip cchip" data-cut="${esc(c.name)}">${esc(c.name)}</button>`).join('')}</div>` : ''}
    <ul class="facts">${facts}</ul>
    <div class="fid">${esc(FIDELITY[st.geo].text)}</div>
    <div class="acts">
      <button data-act="isolate">${state.isolate ? 'Show all' : 'Isolate'}</button>
      <button data-act="focus">Focus</button>
      <button data-act="hide">Hide</button>
    </div>`;
  openSheet();
}

function selectPrimal(p) {
  state.primalSel = p; state.sel = null; applyLook();
  const P = PRIMALS[p];
  const cuts = CUTS.filter(c => c.primal === p);
  const muscles = MUSCLES.filter(m => m.primal.includes(p));
  sheetBody.innerHTML = `
    <div class="h"><div><div class="ttl"><span class="dot" style="--c:${P.color}"></span>${esc(P.name)}</div><div class="lat">US primal (IMPS / NAMP)</div></div>
      <button class="x" data-act="close">✕</button></div>
    <div class="row">${badge('fact')}<span class="meta">boundary rule cited · 3D plane approximate</span></div>
    <p class="rule">${esc(P.rule)}${P.src.map(srcTag).join('')}</p>
    ${cuts.length ? `<div class="row"><span class="lbl">Cuts</span>${cuts.map(c => `<button class="chip cchip" data-cut="${esc(c.name)}">${esc(c.name)}</button>`).join('')}</div>` : ''}
    ${muscles.length ? `<div class="row"><span class="lbl">Muscles</span>${muscles.map(m => `<button class="chip mchip" data-sid="${m.sid}">${esc(m.name)}</button>`).join('')}</div>` : ''}`;
  openSheet();
}

function selectCut(name) {
  const c = CUTS.find(x => x.name === name); if (!c) return;
  setMode('cuts', true);
  state.cut = c; state.sel = null; state.primalSel = null; applyLook();
  const P = PRIMALS[c.primal];
  sheetBody.innerHTML = `
    <div class="h"><div><div class="ttl">${esc(c.name)}</div><div class="lat">Retail cut · ${esc(P.name)}</div></div>
      <button class="x" data-act="close">✕</button></div>
    <div class="row">${badge('fact')}<span class="meta">cut → muscle mapping cited · muscle shapes schematic</span></div>
    <div class="row"><span class="lbl">Primal</span>${primalChip(c.primal)}</div>
    <div class="row"><span class="lbl">From</span>${c.muscles.map(s => `<button class="chip mchip" data-sid="${s}">${esc(S[s].name)}</button>`).join('')}</div>
    ${c.note ? `<p class="rule">${esc(c.note)}</p>` : ''}
    <p class="meta">Sources: ${c.src.map(srcTag).join(' ')}</p>
    <div class="acts"><button data-act="cutsback">All cuts</button><button data-act="focuscut">Focus</button></div>`;
  focusOn(c.muscles);
  openSheet();
}

function showHome() {
  state.cut = null;
  if (state.mode === 'cuts') return showCutList();
  if (state.mode === 'primals') {
    sheetBody.innerHTML = `<div class="h"><div><div class="ttl">Beef primals</div><div class="lat">Tap the body or a primal below</div></div></div>
      <div class="row wrap">${Object.keys(PRIMALS).filter(p => p !== 'none').map(primalChip).join('')}</div>`;
  } else if (state.mode === 'dissect') {
    sheetBody.innerHTML = `<div class="h"><div><div class="ttl">Virtual disassembly</div><div class="lat">Open the seams, then tap a muscle to lift it out</div></div></div>
      <label class="slider">Seam separation <input id="explode" type="range" min="0" max="1" step="0.01" value="${state.explode}"></label>
      <div class="acts"><button data-act="undo">Undo</button><button data-act="reassemble">Reassemble</button></div>
      <div class="fid">${esc(FIDELITY.schem.text)} Seams open along schematic directions, not along true fascial planes yet.</div>`;
    $('#explode').addEventListener('input', e => { state.explode = +e.target.value; applyExplode(); });
  } else {
    sheetBody.innerHTML = `<div class="h"><div><div class="ttl">Bovine Atlas</div><div class="lat">Drag to rotate · pinch to zoom · two fingers to pan · tap to identify</div></div></div>
      <div class="row wrap"><span class="lbl">Fidelity</span>${Object.keys(FIDELITY).map(badge).join('')}</div>
      <div class="fid">${esc(REVIEW_NOTE)}</div>`;
  }
  openSheet(true);
}

function showCutList() {
  const groups = Object.keys(PRIMALS).filter(p => CUTS.some(c => c.primal === p)).map(p =>
    `<div class="grp"><div class="gh"><span class="dot" style="--c:${PRIMALS[p].color}"></span>${esc(PRIMALS[p].name)}</div>
      <div class="row wrap">${CUTS.filter(c => c.primal === p).map(c => `<button class="chip cchip" data-cut="${esc(c.name)}">${esc(c.name)}</button>`).join('')}</div></div>`).join('');
  sheetBody.innerHTML = `<div class="h"><div><div class="ttl">Retail cuts</div><div class="lat">Pick a cut to see the muscles it comes from</div></div></div>${groups}`;
  openSheet();
}

function openSheet(compact) { sheet.classList.add('open'); sheet.classList.toggle('compact', !!compact); }

function focusOn(sids) {
  const box = new THREE.Box3();
  let any = false;
  for (const sid of sids) for (const m of S[sid].meshes) {
    if (state.removed.has(m)) continue;
    m.updateMatrixWorld(true); box.expandByObject(m); any = true;
  }
  if (!any) return;
  const c = box.getCenter(V3()), size = box.getSize(V3()).length();
  const dir = camera.position.clone().sub(controls.target).normalize();
  if (dir.z * c.z < 0 && Math.abs(c.z) > 0.05) { dir.z = -dir.z; } // look from the side the structure is on
  animateCam(c, c.clone().add(dir.multiplyScalar(Math.max(0.6, size * 1.9))));
}
let camAnim = null;
function animateCam(target, pos) {
  camAnim = { t: 0, ft: controls.target.clone(), fp: camera.position.clone(), tt: target, tp: pos };
}

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), 1600);
}

sheet.addEventListener('click', e => {
  const b = e.target.closest('button, sup.src'); if (!b) return;
  if (b.dataset.src) { showSources(b.dataset.src); return; }
  if (b.dataset.primal) { if (state.mode !== 'primals') setMode('primals', true); selectPrimal(b.dataset.primal); return; }
  if (b.dataset.cut) { selectCut(b.dataset.cut); return; }
  if (b.dataset.sid) { if (state.mode === 'cuts') { state.cut = null; setMode('anatomy', true); } select(b.dataset.sid); focusOn([b.dataset.sid]); return; }
  const act = b.dataset.act;
  if (act === 'close') { state.sel = null; state.primalSel = null; state.cut = null; applyLook(); showHome(); }
  if (act === 'isolate') {
    state.isolate = state.isolate ? null : new Set([state.sel]);
    applyLook(); select(state.sel); if (state.isolate) focusOn([state.sel]);
  }
  if (act === 'focus' && state.sel) focusOn([state.sel]);
  if (act === 'hide' && state.sel) { for (const m of S[state.sel].meshes) state.removed.add(m); state.removedStack.push(...S[state.sel].meshes); toast('Hidden: ' + S[state.sel].name + ' (Undo in Dissect)'); state.sel = null; applyLook(); showHome(); }
  if (act === 'undo') { const m = state.removedStack.pop(); if (m) { state.removed.delete(m); m.material.opacity = 1; applyExplode(); applyLook(); toast('Restored: ' + S[m.userData.sid].name); } }
  if (act === 'reassemble') { state.removed.clear(); state.removedStack = []; state.explode = 0; const s = $('#explode'); if (s) s.value = 0; applyExplode(); applyLook(); }
  if (act === 'cutsback') { state.cut = null; applyLook(); showCutList(); }
  if (act === 'focuscut' && state.cut) focusOn(state.cut.muscles);
});

// layers: tap cycles on -> ghost -> off
function renderLayers() {
  $('#layers').innerHTML = LAYERS.map(L => `<button class="layer ${state.layers[L]}" data-layer="${L}"><i class="sw ${L}"></i>${LAYER_NAMES[L]}<small>${state.layers[L] === 'on' ? '' : state.layers[L] === 'ghost' ? 'x-ray' : 'off'}</small></button>`).join('');
}
$('#layers').addEventListener('click', e => {
  const b = e.target.closest('[data-layer]'); if (!b) return;
  const L = b.dataset.layer, order = ['on', 'ghost', 'off'];
  state.layers[L] = order[(order.indexOf(state.layers[L]) + 1) % 3];
  renderLayers(); applyLook();
});

function setMode(mode, silent) {
  state.mode = mode;
  document.querySelectorAll('#modes button').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
  if (mode !== 'cuts') state.cut = null;
  if (mode !== 'primals') state.primalSel = null;
  if (mode === 'dissect') { state.layers.skin = 'off'; state.layers.fat = 'off'; state.layers.muscle = 'on'; renderLayers(); }
  if (mode === 'cuts') { state.layers.muscle = 'on'; renderLayers(); }
  paintShell(); applyLook();
  if (!silent) { state.sel = null; showHome(); }
  updateLabels();
}
$('#modes').addEventListener('click', e => { const b = e.target.closest('[data-mode]'); if (b) setMode(b.dataset.mode); });

// structure index
function showIndex() {
  const groups = { muscle: [], bone: [], skin: [], fat: [] };
  Object.values(S).forEach(s => groups[s.layer].push(s));
  const html = ['muscle', 'bone', 'fat', 'skin'].map(L => `<div class="grp"><div class="gh">${LAYER_NAMES[L]}</div>
    <div class="list">${groups[L].map(s => `<button data-sid="${s.sid}"><span>${esc(s.name)}</span><em>${esc(s.latin || '')}</em>${badge(s.geo)}</button>`).join('')}</div></div>`).join('');
  $('#panelBody').innerHTML = `<input id="q" placeholder="Search structures…" autocomplete="off">${html}`;
  $('#panel').classList.add('open');
  $('#q').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll('#panelBody .list button').forEach(b => { b.style.display = b.textContent.toLowerCase().includes(q) ? '' : 'none'; });
  });
}
function showSources(hl) {
  $('#panelBody').innerHTML = `<div class="gh">How to read this model</div>
    ${Object.keys(FIDELITY).map(k => `<p>${badge(k)} ${esc(FIDELITY[k].text)}</p>`).join('')}
    <p class="fid">${esc(REVIEW_NOTE)}</p>
    <div class="gh">References</div><ol class="refs">${Object.keys(SOURCES).map(k => `<li class="${k === hl ? 'hl' : ''}">${esc(SOURCES[k])}</li>`).join('')}</ol>
    <div class="gh">What is accurate today</div>
    <p>Bone counts and identities (C7 T13 L6 S5, 13 rib pairs with 8 sternal), the order of bones in each limb, muscle names and their cut mappings, and the primal boundary rules are taken from the references.</p>
    <p>Bone positions are proportional approximations. Muscle shapes, seams and fat depth are schematic and will be replaced with segmented reference meshes.</p>
    <div class="gh">About</div><p>Bovine Atlas ${esc(window.APP_VERSION || '')} · works fully offline · Three.js r147 (MIT).</p>`;
  $('#panel').classList.add('open');
}
$('#panel').addEventListener('click', e => {
  if (e.target.closest('[data-act="pclose"]')) { $('#panel').classList.remove('open'); return; }
  const b = e.target.closest('button[data-sid]'); if (!b) return;
  $('#panel').classList.remove('open');
  const sid = b.dataset.sid, L = S[sid].layer;
  if (state.layers[L] === 'off') { state.layers[L] = 'on'; renderLayers(); }
  // reveal: ghost outer layers so the structure is visible
  const order = ['skin', 'fat', 'muscle', 'bone'];
  for (const o of order.slice(0, order.indexOf(L))) if (state.layers[o] === 'on') state.layers[o] = 'ghost';
  renderLayers();
  if (state.mode !== 'anatomy' && state.mode !== 'primals') setMode('anatomy', true);
  select(sid); focusOn([sid]);
});
$('#btnIndex').addEventListener('click', showIndex);
$('#btnInfo').addEventListener('click', () => showSources());
$('#btnHome').addEventListener('click', () => { animateCam(HOME.target.clone(), HOME.pos.clone()); });

// primal labels
const labelsEl = $('#labels');
function updateLabels() {
  const on = state.mode === 'primals';
  labelsEl.style.display = on ? '' : 'none';
  if (!on) return;
  if (!labelsEl.childElementCount) {
    for (const [k, P] of Object.entries(PRIMALS)) if (P.label) {
      const d = document.createElement('div'); d.className = 'plabel'; d.dataset.p = k; d.textContent = P.name; d.style.setProperty('--c', P.color);
      d.addEventListener('click', () => selectPrimal(k)); labelsEl.appendChild(d);
    }
  }
}
const pv = V3();
function placeLabels() {
  if (state.mode !== 'primals') return;
  const w = canvas.clientWidth, h = canvas.clientHeight, side = Math.sign(camera.position.z - controls.target.z) || 1;
  for (const d of labelsEl.children) {
    const P = PRIMALS[d.dataset.p];
    pv.set(P.label[0], P.label[1], Math.abs(P.label[2]) * side + 0.04 * side).project(camera);
    const vis = pv.z < 1 && Math.abs(pv.x) < 1.1 && Math.abs(pv.y) < 1.1;
    d.style.display = vis ? '' : 'none';
    d.style.transform = `translate(${(pv.x * 0.5 + 0.5) * w}px, ${(-pv.y * 0.5 + 0.5) * h}px) translate(-50%, -50%)`;
    d.classList.toggle('sel', state.primalSel === d.dataset.p);
  }
}

window.handleBack = () => {
  if ($('#panel').classList.contains('open')) { $('#panel').classList.remove('open'); return true; }
  if (state.isolate) { state.isolate = null; applyLook(); if (state.sel) select(state.sel); return true; }
  if (state.sel || state.primalSel || state.cut) { state.sel = null; state.primalSel = null; state.cut = null; applyLook(); showHome(); return true; }
  if (state.mode !== 'anatomy') { setMode('anatomy'); return true; }
  return false;
};

// ---------- resize + loop ----------
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // portrait phones: pull back so the whole animal fits
  camera.fov = w < h ? 50 : 38;
  camera.updateProjectionMatrix();
  // fit the whole animal (~2.5 m nose to tail) across the screen width
  const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.aspect);
  const dist = Math.max(3.2, 1.3 / Math.tan(hfov / 2));
  const dir = V3(0.34, 0.16, 1).normalize();
  HOME.target.set(0.08, w < h ? 0.5 : 0.72, 0);
  HOME.pos.copy(HOME.target).addScaledVector(dir, dist);
  if (!resize.done) { camera.position.copy(HOME.pos); controls.target.copy(HOME.target); resize.done = true; }
  controls.maxDistance = dist * 1.8;
}
window.addEventListener('resize', resize);
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (camAnim) {
    camAnim.t = Math.min(1, camAnim.t + dt / 0.6);
    const e = 1 - Math.pow(1 - camAnim.t, 3);
    controls.target.lerpVectors(camAnim.ft, camAnim.tt, e);
    camera.position.lerpVectors(camAnim.fp, camAnim.tp, e);
    if (camAnim.t >= 1) camAnim = null;
  }
  stepFlying(dt);
  controls.update();
  renderer.render(scene, camera);
  placeLabels();
  requestAnimationFrame(frame);
}

// ---------- boot ----------
function boot() {
  buildSkeleton(); buildMuscles(); buildShell();
  const done = new Set();
  for (const st of Object.values(S)) {
    const trunk = /^(C\d|T\d|L\d|rib_|sternum|sacrum|scapula|os_coxae)/.test(st.sid);
    if (st.layer !== 'bone' || !trunk) continue;
    for (const m of st.meshes) if (!done.has(m.geometry)) { done.add(m.geometry); conformGeom(m.geometry, FAT_IN + 0.004, false); }
  }
  computeExplodeDirs();
  paintShell(); renderLayers(); applyLook(); resize();
  setMode('anatomy');
  // test hook: #mode=primals&skin=off&fat=ghost&sel=biceps_femoris&cut=Tri-tip&explode=0.5
  const q = new URLSearchParams(location.hash.slice(1));
  for (const L of LAYERS) if (q.get(L)) state.layers[L] = q.get(L);
  renderLayers();
  if (q.get('mode')) setMode(q.get('mode'));
  if (q.get('explode')) { state.explode = +q.get('explode'); applyExplode(); }
  if (q.get('sel')) select(q.get('sel'));
  if (q.get('cut')) selectCut(q.get('cut'));
  if (q.get('primal')) selectPrimal(q.get('primal'));
  if (q.get('cam')) { const c = q.get('cam').split(',').map(Number); camera.position.set(c[0], c[1], c[2]); }
  applyLook();
  if (q.get('debug') === '2') {
    // report vertices outside the hide (body+neck shells), per structure
    const out = {}; const x0 = BODY[0][0], x1 = BODY[BODY.length - 1][0]; const v = V3();
    for (const m of meshes) { if (m.userData.layer === 'skin' || m.userData.layer === 'fat' || m.userData.side === 'R') continue;
      const pos = m.geometry.attributes.position; let worst = 0, wp = null;
      for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); if (v.x < x0 || v.x > x1) continue;
        const yc = smooth(BODY, v.x, 1), dy = v.y - yc, h = dy >= 0 ? smooth(BODY, v.x, 2) : smooth(BODY, v.x, 3), w = smooth(BODY, v.x, 4);
        let e = Math.pow(Math.abs(v.z) / w, 2.5) + Math.pow(Math.abs(dy) / h, 2.5);
        if (v.x > 0.62 && v.x < 1.16) { const t = neckT(v.x), nh = smooth(NECK, t, 3), ndy = v.y - smooth(NECK, t, 2); e = Math.min(e, Math.pow(Math.abs(v.z) / smooth(NECK, t, 4), 2.2) + Math.pow(Math.abs(ndy) / (ndy >= 0 ? nh : nh * (1.15 - 0.1 * t)), 2.2)); }
        if (e > worst && !(dy < -h && /limb|leg/.test(''))) { worst = e; wp = v.toArray().map(n => +n.toFixed(2)); } }
      if (worst > 1.0) out[m.userData.sid] = [+worst.toFixed(2), wp]; }
    document.getElementById('err').textContent = JSON.stringify(out);
  }
  if (q.get('debug') === '1') setTimeout(() => { document.getElementById('err').textContent = JSON.stringify({w: canvas.clientWidth, h: canvas.clientHeight, cam: camera.position.toArray().map(v => +v.toFixed(2)), tgt: controls.target.toArray().map(v => +v.toFixed(2)), fov: camera.fov}); }, 1500);
  document.body.classList.add('ready');
  window.__atlas = { S, meshes, state, setMode, select, selectCut, selectPrimal, camera, controls, renderer, scene };
  requestAnimationFrame(frame);
}
try { boot(); } catch (err) {
  document.getElementById('err').textContent = 'Startup error: ' + err.message;
  console.error(err);
}
