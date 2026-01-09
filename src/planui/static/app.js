// =====================
// State + DOM
// =====================
const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");

const lastMeasureEl = document.getElementById("lastMeasure");
const scaleEl = document.getElementById("scale");

const bleLed = document.getElementById("bleLed");
const bleText = document.getElementById("bleText");
const bleMeta = document.getElementById("bleMeta");

const projectTitleEl = document.getElementById("projectTitle");

const chkGrid = document.getElementById("chkGrid");
const chkSnap = document.getElementById("chkSnap");
const chkOrtho = document.getElementById("chkOrtho");

const btnUndo = document.getElementById("btnUndo");
const btnRedo = document.getElementById("btnRedo");
const btnDeleteMode = document.getElementById("btnDeleteMode");

const btnSave = document.getElementById("btnSave");
const fileLoad = document.getElementById("fileLoad");

const btnExportJpg = document.getElementById("btnExport");
const btnExportPng = document.getElementById("btnExportPng");
const btnExportHD = document.getElementById("btnExportHD");

// 3D DOM
const btn3D = document.getElementById("btn3D");
const threeModal = document.getElementById("threeModal");
const threeRoot = document.getElementById("threeRoot");
const btn3DClose = document.getElementById("btn3DClose");
const btn3DRefresh = document.getElementById("btn3DRefresh");
const btn3DExport = document.getElementById("btn3DExport");
const height3dEl = document.getElementById("height3d");
const height3dInput = document.getElementById("height3dInput");
const btnHeightFromLast = document.getElementById("btnHeightFromLast");

const btnCamIso = document.getElementById("btnCamIso");
const btnCamTop = document.getElementById("btnCamTop");
const btnCamFront = document.getElementById("btnCamFront");

let lastMeasure = null;      // mètres
let pxPerM = parseFloat(scaleEl?.value || "200");

let showGrid = chkGrid ? chkGrid.checked : true;
let enableSnap = chkSnap ? chkSnap.checked : true;
let enableOrtho = chkOrtho ? chkOrtho.checked : false;

const GRID_STEP_PX = 25;
const SNAP_POINT_PX = 10;

// Plan model
let points = [];             // {x,y}
let segments = [];           // {a,b, len_m|null}  (len_m null => calculé)

// Interaction
let mode = "idle";           // idle | placing | delete | drag
let startPt = null;          // {x,y,idx}
let dragIdx = null;
let mouse = { x: 0, y: 0 };

// Undo/Redo stacks
let undoStack = [];
let redoStack = [];

// =====================
// Undo/Redo
// =====================
function snapshot() {
  return {
    pxPerM,
    points: points.map(p => ({ x: p.x, y: p.y })),
    segments: segments.map(s => ({ a: s.a, b: s.b, len_m: (s.len_m == null ? null : s.len_m) })),
    title: projectTitleEl ? (projectTitleEl.value || "") : ""
  };
}

function restore(snap) {
  pxPerM = snap.pxPerM ?? pxPerM;
  if (scaleEl) scaleEl.value = String(pxPerM);

  points = (snap.points || []).map(p => ({ x: p.x, y: p.y }));
  segments = (snap.segments || []).map(s => ({ a: s.a, b: s.b, len_m: (s.len_m == null ? null : s.len_m) }));

  if (projectTitleEl) projectTitleEl.value = snap.title || "";
  draw();
}

function pushUndo() {
  undoStack.push(snapshot());
  if (undoStack.length > 100) undoStack.shift();
  redoStack = [];
}

function doUndo() {
  if (!undoStack.length) return;
  redoStack.push(snapshot());
  restore(undoStack.pop());
}

function doRedo() {
  if (!redoStack.length) return;
  undoStack.push(snapshot());
  restore(redoStack.pop());
}

// =====================
// Helpers
// =====================
function setBleStatus(connected, name, addr) {
  bleLed?.classList.toggle("led-green", !!connected);
  bleLed?.classList.toggle("led-red", !connected);
  if (bleText) bleText.textContent = connected ? "GLM connecté" : "GLM non connecté";

  const meta = [];
  if (name) meta.push(name);
  if (addr) meta.push(addr);
  if (bleMeta) bleMeta.textContent = meta.length ? `(${meta.join(" • ")})` : "";
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function lenMeters(a, b) {
  return dist(a, b) / pxPerM;
}

function snapToGrid(x, y) {
  const sx = Math.round(x / GRID_STEP_PX) * GRID_STEP_PX;
  const sy = Math.round(y / GRID_STEP_PX) * GRID_STEP_PX;
  return { x: sx, y: sy };
}

function snapToExistingPoint(x, y) {
  let best = null;
  let bestD = 1e9;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < bestD) { bestD = d; best = { idx: i, x: p.x, y: p.y, d }; }
  }
  if (best && best.d <= SNAP_POINT_PX) return best;
  return null;
}

function applySnap(x, y) {
  let out = { x, y };

  if (enableSnap) {
    const near = snapToExistingPoint(out.x, out.y);
    if (near) return { x: near.x, y: near.y, snappedPointIdx: near.idx };

    out = snapToGrid(out.x, out.y);
  }
  return out;
}

function findPointAt(x, y, tol = 8) {
  for (let i = 0; i < points.length; i++) {
    if (Math.hypot(points[i].x - x, points[i].y - y) <= tol) return i;
  }
  return null;
}

function pointToSegmentDistance(px, py, ax, ay, bx, by) {
  const abx = bx - ax, aby = by - ay;
  const apx = px - ax, apy = py - ay;
  const ab2 = abx * abx + aby * aby;
  if (ab2 <= 1e-9) return Math.hypot(px - ax, py - ay);
  let t = (apx * abx + apy * aby) / ab2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * abx, cy = ay + t * aby;
  return Math.hypot(px - cx, py - cy);
}

function findSegmentAt(x, y, tol = 6) {
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    const A = points[s.a], B = points[s.b];
    if (!A || !B) continue;
    const d = pointToSegmentDistance(x, y, A.x, A.y, B.x, B.y);
    if (d <= tol) return i;
  }
  return null;
}

function removePoint(idx) {
  const keepSegments = [];
  for (const s of segments) {
    if (s.a === idx || s.b === idx) continue;
    keepSegments.push({
      a: s.a > idx ? s.a - 1 : s.a,
      b: s.b > idx ? s.b - 1 : s.b,
      len_m: s.len_m
    });
  }
  segments = keepSegments;
  points.splice(idx, 1);
}

function removeSegment(idx) {
  segments.splice(idx, 1);
}

// =====================
// Drawing (fond blanc = export OK)
// =====================
function drawLabel(text, x, y) {
  ctx.save();
  ctx.font = "14px sans-serif";
  const padX = 4, padY = 3;
  const w = ctx.measureText(text).width;
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.fillRect(x - padX, y - 14 - padY, w + padX * 2, 18 + padY * 2);
  ctx.fillStyle = "#000";
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawCartouche() {
  const title = projectTitleEl ? (projectTitleEl.value || "") : "";
  const dateStr = new Date().toLocaleString();

  const lines = [
    title ? `Projet: ${title}` : "Projet: (sans nom)",
    `Date: ${dateStr}`,
    `Échelle: ${pxPerM.toFixed(0)} px/m`
  ];

  ctx.save();
  ctx.font = "12px sans-serif";
  const pad = 8;
  const boxW = 260;
  const boxH = 14 * lines.length + pad * 2;

  const x = 10;
  const y = canvas.height - boxH - 10;

  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillRect(x, y, boxW, boxH);
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.strokeRect(x, y, boxW, boxH);

  ctx.fillStyle = "#000";
  let ty = y + pad + 12;
  for (const line of lines) {
    ctx.fillText(line, x + pad, ty);
    ty += 14;
  }
  ctx.restore();
}

function drawGrid() {
  ctx.save();
  ctx.strokeStyle = "rgba(0,0,0,0.06)";
  ctx.lineWidth = 1;

  for (let x = 0; x < canvas.width; x += GRID_STEP_PX) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += GRID_STEP_PX) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
  }
  ctx.restore();
}

function draw() {
  // Fond blanc (évite export noir)
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (showGrid) drawGrid();

  // segments
  ctx.save();
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 2;

  segments.forEach(s => {
    const A = points[s.a], B = points[s.b];
    if (!A || !B) return;

    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(B.x, B.y);
    ctx.stroke();

    const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
    const Lm = (s.len_m == null) ? lenMeters(A, B) : s.len_m;
    drawLabel(`${Lm.toFixed(3)} m`, mx + 6, my - 6);
  });

  // points
  ctx.fillStyle = "#000";
  points.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
  });

  // preview segment
  if (mode === "placing" && startPt) {
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(startPt.x, startPt.y);
    ctx.lineTo(mouse.x, mouse.y);
    ctx.stroke();
    ctx.setLineDash([]);

    const previewLenM = dist(startPt, mouse) / pxPerM;
    drawLabel(`preview: ${previewLenM.toFixed(3)} m`, mouse.x + 10, mouse.y + 10);
  }

  ctx.restore();
  drawCartouche();
}

// =====================
// Interaction
// =====================
scaleEl?.addEventListener("input", () => {
  pxPerM = parseFloat(scaleEl.value);
  draw();
});

chkGrid?.addEventListener("change", () => { showGrid = chkGrid.checked; draw(); });
chkSnap?.addEventListener("change", () => enableSnap = chkSnap.checked);
chkOrtho?.addEventListener("change", () => enableOrtho = chkOrtho.checked);

btnUndo?.addEventListener("click", doUndo);
btnRedo?.addEventListener("click", doRedo);

btnDeleteMode?.addEventListener("click", () => {
  if (mode === "delete") {
    mode = "idle";
    btnDeleteMode.textContent = "Supprimer";
  } else {
    mode = "delete";
    btnDeleteMode.textContent = "Suppr: ON";
  }
  startPt = null;
  dragIdx = null;
  draw();
});

document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); doUndo(); return; }
  if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) {
    e.preventDefault(); doRedo(); return;
  }
  if (e.key === "Escape") {
    mode = "idle";
    startPt = null;
    dragIdx = null;
    if (btnDeleteMode) btnDeleteMode.textContent = "Supprimer";
    draw();
  }
});

canvas.addEventListener("mousemove", (e) => {
  const r = canvas.getBoundingClientRect();
  let x = e.clientX - r.left;
  let y = e.clientY - r.top;

  if (mode === "placing" && startPt && enableOrtho) {
    const dx = x - startPt.x;
    const dy = y - startPt.y;
    if (Math.abs(dx) > Math.abs(dy)) y = startPt.y;
    else x = startPt.x;
  }

  const snapped = applySnap(x, y);
  mouse.x = snapped.x;
  mouse.y = snapped.y;

  if (mode === "drag" && dragIdx != null) {
    points[dragIdx].x = mouse.x;
    points[dragIdx].y = mouse.y;
  }

  if (mode === "placing" || mode === "drag") draw();
});

canvas.addEventListener("mousedown", (e) => {
  const r = canvas.getBoundingClientRect();
  const x = e.clientX - r.left;
  const y = e.clientY - r.top;

  const snapped = applySnap(x, y);
  const idx = findPointAt(snapped.x, snapped.y, 10);

  if (idx != null && mode !== "placing" && mode !== "delete") {
    pushUndo();
    dragIdx = idx;
    mode = "drag";
  }
});

canvas.addEventListener("mouseup", () => {
  if (mode === "drag") {
    mode = "idle";
    dragIdx = null;
    draw();
  }
});

canvas.addEventListener("click", (e) => {
  const r = canvas.getBoundingClientRect();
  let x = e.clientX - r.left;
  let y = e.clientY - r.top;

  if (mode === "placing" && startPt && enableOrtho) {
    const dx = x - startPt.x;
    const dy = y - startPt.y;
    if (Math.abs(dx) > Math.abs(dy)) y = startPt.y;
    else x = startPt.x;
  }

  const snapped = applySnap(x, y);
  x = snapped.x; y = snapped.y;

  if (mode === "delete") {
    pushUndo();
    const pIdx = findPointAt(x, y, 10);
    if (pIdx != null) { removePoint(pIdx); draw(); return; }

    const sIdx = findSegmentAt(x, y, 8);
    if (sIdx != null) { removeSegment(sIdx); draw(); return; }
    return;
  }

  if (e.shiftKey) {
    pushUndo();
    points.push({ x, y });
    draw();
    return;
  }

  if (mode === "idle") {
    pushUndo();
    points.push({ x, y });
    draw();
    return;
  }

  if (mode === "placing" && startPt) {
    if (!lastMeasure || lastMeasure <= 0) return;

    pushUndo();

    const dx = x - startPt.x;
    const dy = y - startPt.y;
    const norm = Math.hypot(dx, dy) || 1.0;

    const Lpx = lastMeasure * pxPerM;
    const ex = startPt.x + (dx / norm) * Lpx;
    const ey = startPt.y + (dy / norm) * Lpx;

    const a = startPt.idx;
    points.push({ x: ex, y: ey });
    const b = points.length - 1;

    segments.push({ a, b, len_m: lastMeasure });

    mode = "idle";
    startPt = null;
    draw();
  }
});

document.getElementById("btnUseLast")?.addEventListener("click", () => {
  if (!lastMeasure || lastMeasure <= 0) return;

  if (points.length === 0) {
    pushUndo();
    points.push({ x: 200, y: 200 });
  }

  startPt = { ...points[points.length - 1], idx: points.length - 1 };
  mode = "placing";
  draw();
});

// =====================
// Save / Load JSON
// =====================
btnSave?.addEventListener("click", () => {
  const data = snapshot();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const title = (projectTitleEl?.value || "plan").trim().replace(/\s+/g, "_");
  a.download = `${title || "plan"}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

fileLoad?.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const txt = await file.text();
  try {
    const data = JSON.parse(txt);
    pushUndo();
    restore(data);
  } catch {
    alert("JSON invalide");
  } finally {
    e.target.value = "";
  }
});

// =====================
// Export (fond blanc garanti)
// =====================
function renderToContext(rctx, scale = 1, opts = { showGrid: showGrid, cartouche: true }) {
  const W = canvas.width * scale;
  const H = canvas.height * scale;

  rctx.fillStyle = "#ffffff";
  rctx.fillRect(0, 0, W, H);

  if (opts.showGrid) {
    rctx.save();
    rctx.strokeStyle = "rgba(0,0,0,0.06)";
    rctx.lineWidth = 1;
    const step = GRID_STEP_PX * scale;
    for (let x = 0; x < W; x += step) { rctx.beginPath(); rctx.moveTo(x, 0); rctx.lineTo(x, H); rctx.stroke(); }
    for (let y = 0; y < H; y += step) { rctx.beginPath(); rctx.moveTo(0, y); rctx.lineTo(W, y); rctx.stroke(); }
    rctx.restore();
  }

  // segments
  rctx.save();
  rctx.strokeStyle = "#000";
  rctx.lineWidth = 2 * scale;

  const label = (text, x, y) => {
    rctx.save();
    rctx.font = `${14 * scale}px sans-serif`;
    const padX = 4 * scale, padY = 3 * scale;
    const w = rctx.measureText(text).width;
    rctx.fillStyle = "rgba(255,255,255,0.88)";
    rctx.fillRect(x - padX, y - 14 * scale - padY, w + padX * 2, 18 * scale + padY * 2);
    rctx.fillStyle = "#000";
    rctx.fillText(text, x, y);
    rctx.restore();
  };

  segments.forEach(s => {
    const A = points[s.a], B = points[s.b];
    if (!A || !B) return;

    rctx.beginPath();
    rctx.moveTo(A.x * scale, A.y * scale);
    rctx.lineTo(B.x * scale, B.y * scale);
    rctx.stroke();

    const mx = ((A.x + B.x) / 2) * scale;
    const my = ((A.y + B.y) / 2) * scale;
    const Lm = (s.len_m == null) ? lenMeters(A, B) : s.len_m;
    label(`${Lm.toFixed(3)} m`, mx + 6 * scale, my - 6 * scale);
  });

  // points
  rctx.fillStyle = "#000";
  points.forEach(p => {
    rctx.beginPath();
    rctx.arc(p.x * scale, p.y * scale, 4 * scale, 0, Math.PI * 2);
    rctx.fill();
  });

  // cartouche
  if (opts.cartouche) {
    const title = projectTitleEl ? (projectTitleEl.value || "") : "";
    const dateStr = new Date().toLocaleString();
    const lines = [
      title ? `Projet: ${title}` : "Projet: (sans nom)",
      `Date: ${dateStr}`,
      `Échelle: ${pxPerM.toFixed(0)} px/m`
    ];

    rctx.save();
    rctx.font = `${12 * scale}px sans-serif`;
    const pad = 8 * scale;
    const boxW = 260 * scale;
    const boxH = (14 * lines.length + 16) * scale;

    const x = 10 * scale;
    const y = (canvas.height * scale) - boxH - (10 * scale);

    rctx.fillStyle = "rgba(255,255,255,0.92)";
    rctx.fillRect(x, y, boxW, boxH);
    rctx.strokeStyle = "rgba(0,0,0,0.25)";
    rctx.lineWidth = 1 * scale;
    rctx.strokeRect(x, y, boxW, boxH);

    rctx.fillStyle = "#000";
    let ty = y + pad + 12 * scale;
    for (const line of lines) {
      rctx.fillText(line, x + pad, ty);
      ty += 14 * scale;
    }
    rctx.restore();
  }

  rctx.restore();
}

function downloadDataUrl(url, filename) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
}

function exportHD(type = "png", factor = 1) {
  const out = document.createElement("canvas");
  out.width = canvas.width * factor;
  out.height = canvas.height * factor;

  const octx = out.getContext("2d");
  renderToContext(octx, factor, { showGrid, cartouche: true });

  const title = (projectTitleEl?.value || "plan").trim().replace(/\s+/g, "_") || "plan";
  const name = `${title}.${type}`;

  if (type === "jpg" || type === "jpeg") {
    downloadDataUrl(out.toDataURL("image/jpeg", 0.95), name);
  } else {
    downloadDataUrl(out.toDataURL("image/png"), name);
  }
}

btnExportPng?.addEventListener("click", () => exportHD("png", 1));
btnExportJpg?.addEventListener("click", () => exportHD("jpg", 1));
btnExportHD?.addEventListener("click", () => exportHD("png", 4));

// =====================
// WebSocket
// =====================
function connectWS() {
  const proto = (location.protocol === "https:") ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/ws`);

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);

    if (msg.type === "measure") {
      lastMeasure = msg.value_m;
      if (lastMeasureEl) lastMeasureEl.textContent = Number(lastMeasure).toFixed(4);
    }

    if (msg.type === "ble_status") {
      setBleStatus(msg.connected, msg.device_name, msg.device_address);
    }
  };

  ws.onclose = () => setTimeout(connectWS, 1000);
}

// =====================
// 3D (robuste + debug)
// =====================
let three = {
  inited: false,
  scene: null,
  camera: null,
  renderer: null,
  controls: null,
  group: null,
  animId: null,
  debugAdded: false,
};

function get3DHeight() {
  const v = parseFloat(height3dInput?.value || "2.5");
  return (Number.isFinite(v) && v > 0) ? v : 2.5;
}

function set3DHeight(h) {
  if (height3dInput) height3dInput.value = String(h.toFixed(2));
  if (height3dEl) height3dEl.textContent = h.toFixed(3);
}

function open3D() {
  const h = get3DHeight();
  set3DHeight(h);
  threeModal?.classList.remove("hidden");
  init3DOnce();

  // double rAF = layout stable
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      resize3D();
      rebuild3D(get3DHeight());
    });
  });
}

function close3D() {
  threeModal?.classList.add("hidden");
}

btn3D?.addEventListener("click", open3D);
btn3DClose?.addEventListener("click", close3D);

btnHeightFromLast?.addEventListener("click", () => {
  if (lastMeasure && lastMeasure > 0) {
    set3DHeight(lastMeasure);
    rebuild3D(get3DHeight());
  }
});

btn3DRefresh?.addEventListener("click", () => {
  set3DHeight(get3DHeight());
  rebuild3D(get3DHeight());
});

btn3DExport?.addEventListener("click", () => {
  if (!three.inited) return;
  const url = three.renderer.domElement.toDataURL("image/png");
  const title = (projectTitleEl?.value || "vue3d").trim().replace(/\s+/g, "_") || "vue3d";
  downloadDataUrl(url, `${title}_3d.png`);
});

btnCamIso?.addEventListener("click", () => setCamPreset("iso"));
btnCamTop?.addEventListener("click", () => setCamPreset("top"));
btnCamFront?.addEventListener("click", () => setCamPreset("front"));

window.addEventListener("resize", () => {
  if (threeModal && !threeModal.classList.contains("hidden")) resize3D();
});

function init3DOnce() {
  if (three.inited) return;

  if (!window.THREE) {
    console.error("[3D] THREE n'est pas chargé. Vérifie les <script> three.min.js.");
    return;
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a1a);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.01, 5000);
  camera.position.set(2.5, 2.0, 2.5);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
    alpha: false
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  threeRoot.innerHTML = "";
  threeRoot.appendChild(renderer.domElement);

  let controls;
  if (THREE.OrbitControls) {
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.6, 0);
    controls.update();
  } else {
    console.warn("[3D] OrbitControls non chargé -> fallback.");
    controls = { update() { }, target: new THREE.Vector3(0, 0.6, 0) };
    camera.lookAt(controls.target);
  }

  // Lights
  const hemi = new THREE.HemisphereLight(0xffffff, 0x222222, 1.2);
  scene.add(hemi);

  const dir = new THREE.DirectionalLight(0xffffff, 1.2);
  dir.position.set(3, 6, 3);
  scene.add(dir);

  // Helpers (si tu ne les vois pas => problème rendu/taille)
  const grid = new THREE.GridHelper(20, 40, 0x777777, 0x333333);
  scene.add(grid);

  const axes = new THREE.AxesHelper(1.5);
  scene.add(axes);

  // Debug cube (doit être visible)
  const dbg = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.5, 0.5),
    new THREE.MeshStandardMaterial({ color: 0xff4444 })
  );
  dbg.position.set(0, 0.25, 0);
  scene.add(dbg);

  const group = new THREE.Group();
  scene.add(group);

  three.scene = scene;
  three.camera = camera;
  three.renderer = renderer;
  three.controls = controls;
  three.group = group;
  three.inited = true;

  const animate = () => {
    three.animId = requestAnimationFrame(animate);
    if (three.controls && three.controls.update) three.controls.update();
    renderer.render(scene, camera);
  };
  animate();

  resize3D();
}

function resize3D() {
  if (!three.inited) return;

  const rect = threeRoot.getBoundingClientRect();
  const w = Math.floor(rect.width);
  const h = Math.floor(rect.height);

  if (w <= 10 || h <= 10) {
    console.warn("[3D] threeRoot size too small:", w, h, rect);
    return;
  }

  three.camera.aspect = w / h;
  three.camera.updateProjectionMatrix();
  three.renderer.setSize(w, h, false);
}

function setCamPreset(which) {
  if (!three.inited) return;
  if (which === "iso") {
    three.camera.position.set(2.5, 2.0, 2.5);
  } else if (which === "top") {
    three.camera.position.set(0, 6.0, 0.001);
  } else if (which === "front") {
    three.camera.position.set(0, 1.6, 4.0);
  }
  if (three.controls && three.controls.update) three.controls.update();
}

function getClosedPolygonIndices() {
  if (segments.length < 3) return null;

  const deg = new Map();
  const adj = new Map();

  const addEdge = (u, v) => {
    deg.set(u, (deg.get(u) || 0) + 1);
    deg.set(v, (deg.get(v) || 0) + 1);
    if (!adj.has(u)) adj.set(u, []);
    if (!adj.has(v)) adj.set(v, []);
    adj.get(u).push(v);
    adj.get(v).push(u);
  };

  for (const s of segments) addEdge(s.a, s.b);

  const verts = Array.from(deg.keys());
  for (const v of verts) {
    if (deg.get(v) !== 2) return null;
  }

  const start = verts[0];
  const poly = [start];
  let prev = null;
  let cur = start;

  for (let i = 0; i < verts.length + 2; i++) {
    const neigh = adj.get(cur) || [];
    const next = (neigh[0] === prev) ? neigh[1] : neigh[0];
    if (next == null) return null;
    if (next === start) return poly;
    poly.push(next);
    prev = cur;
    cur = next;
    if (poly.length > verts.length + 1) return null;
  }

  return null;
}

function frameCameraToGroup() {
  const box = new THREE.Box3().setFromObject(three.group);
  if (box.isEmpty()) return;

  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);

  if (three.controls && three.controls.target) {
    three.controls.target.copy(center);
    if (three.controls.update) three.controls.update();
  }

  const maxDim = Math.max(size.x, size.y, size.z);
  const dist = Math.max(2.5, maxDim * 2.0);

  const dir = new THREE.Vector3(1, 0.8, 1).normalize();
  three.camera.position.copy(center.clone().add(dir.multiplyScalar(dist)));

  three.camera.near = Math.max(0.01, dist / 200);
  three.camera.far = Math.max(200, dist * 20);
  three.camera.updateProjectionMatrix();
}

function rebuild3D(heightM) {
  if (!three.inited) return;

  while (three.group.children.length) three.group.remove(three.group.children[0]);

  if (!points.length || !segments.length) {
    frameCameraToGroup();
    return;
  }

  const pts = points.map(p => ({ x: p.x, y: p.y }));
  const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
  const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length;

  function toMeters(p) {
    const x = (p.x - cx) / pxPerM;
    const z = -(p.y - cy) / pxPerM;
    return { x, z };
  }

  const wallThickness = 0.05;
  const matWall = new THREE.MeshStandardMaterial({
    color: 0xdddddd, metalness: 0.0, roughness: 0.9
  });

  const polyIdx = getClosedPolygonIndices();
  if (polyIdx && polyIdx.length >= 3) {
    const shape = new THREE.Shape();
    const first = toMeters(points[polyIdx[0]]);
    shape.moveTo(first.x, first.z);
    for (let i = 1; i < polyIdx.length; i++) {
      const p = toMeters(points[polyIdx[i]]);
      shape.lineTo(p.x, p.z);
    }
    shape.lineTo(first.x, first.z);

    const floorGeom = new THREE.ShapeGeometry(shape);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x333333, roughness: 1.0, metalness: 0.0, side: THREE.DoubleSide
    });
    const floor = new THREE.Mesh(floorGeom, floorMat);
    floor.rotation.x = Math.PI / 2;
    floor.position.y = 0;
    three.group.add(floor);

    for (let i = 0; i < polyIdx.length; i++) {
      const aIdx = polyIdx[i];
      const bIdx = polyIdx[(i + 1) % polyIdx.length];

      const A = toMeters(points[aIdx]);
      const B = toMeters(points[bIdx]);

      const dx = B.x - A.x;
      const dz = B.z - A.z;
      const len = Math.hypot(dx, dz);
      if (len < 1e-6) continue;

      const geom = new THREE.BoxGeometry(len, heightM, wallThickness);
      const mesh = new THREE.Mesh(geom, matWall);

      const mx = (A.x + B.x) / 2;
      const mz = (A.z + B.z) / 2;
      mesh.position.set(mx, heightM / 2, mz);

      const angle = Math.atan2(dz, dx);
      mesh.rotation.y = -angle;

      three.group.add(mesh);
    }

    frameCameraToGroup();
    return;
  }

  // fallback: walls per segment
  segments.forEach(s => {
    const Apx = points[s.a];
    const Bpx = points[s.b];
    if (!Apx || !Bpx) return;

    const A = toMeters(Apx);
    const B = toMeters(Bpx);

    const dx = B.x - A.x;
    const dz = B.z - A.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) return;

    const geom = new THREE.BoxGeometry(len, heightM, wallThickness);
    const mesh = new THREE.Mesh(geom, matWall);

    const mx = (A.x + B.x) / 2;
    const mz = (A.z + B.z) / 2;
    mesh.position.set(mx, heightM / 2, mz);

    const angle = Math.atan2(dz, dx);
    mesh.rotation.y = -angle;

    three.group.add(mesh);
  });

  frameCameraToGroup();
}

// =====================
// Boot
// =====================
connectWS();
draw();
