const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");
const lastMeasureEl = document.getElementById("lastMeasure");
const scaleEl = document.getElementById("scale");
const bleLed = document.getElementById("bleLed");
const bleText = document.getElementById("bleText");
const bleMeta = document.getElementById("bleMeta");

let lastMeasure = null;      // en mètres
let pxPerM = parseFloat(scaleEl.value);

let points = [];             // {x,y}
let segments = [];           // {a:idx, b:idx, len_m}

let mode = "idle";
let startPt = null;

scaleEl.addEventListener("input", () => {
  pxPerM = parseFloat(scaleEl.value);
  draw();
});

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // segments
  ctx.lineWidth = 2;
  segments.forEach(s => {
    const A = points[s.a], B = points[s.b];
    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(B.x, B.y);
    ctx.stroke();

    // label
    const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
    ctx.font = "14px sans-serif";
    ctx.fillText(`${s.len_m.toFixed(3)} m`, mx + 6, my - 6);
  });

  // points
  points.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
  });

  // preview
  if (mode === "placing" && startPt) {
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(startPt.x, startPt.y);
    ctx.lineTo(mouse.x, mouse.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function setBleStatus(connected, name, addr) {
  bleLed.classList.toggle("led-green", !!connected);
  bleLed.classList.toggle("led-red", !connected);
  bleText.textContent = connected ? "GLM connecté" : "GLM non connecté";
  const meta = [];
  if (name) meta.push(name);
  if (addr) meta.push(addr);
  bleMeta.textContent = meta.length ? `(${meta.join(" • ")})` : "";
}

let mouse = { x: 0, y: 0 };
canvas.addEventListener("mousemove", (e) => {
  const r = canvas.getBoundingClientRect();
  mouse.x = e.clientX - r.left;
  mouse.y = e.clientY - r.top;
  if (mode === "placing") draw();
});

canvas.addEventListener("click", (e) => {
  const r = canvas.getBoundingClientRect();
  const x = e.clientX - r.left;
  const y = e.clientY - r.top;

  if (mode === "idle") {
    // pose un point
    points.push({ x, y });
    draw();
    return;
  }

  if (mode === "placing" && startPt && lastMeasure) {
    // end point contraint à lastMeasure (direction = start->click)
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

document.getElementById("btnUseLast").addEventListener("click", () => {
  if (!lastMeasure) return;
  if (points.length === 0) {
    // crée un point de départ par défaut
    points.push({ x: 200, y: 200 });
  }
  // prend le dernier point comme départ
  startPt = { ...points[points.length - 1], idx: points.length - 1 };
  mode = "placing";
  draw();
});

document.getElementById("btnExport").addEventListener("click", () => {
  const url = canvas.toDataURL("image/jpeg", 0.95);
  const a = document.createElement("a");
  a.href = url;
  a.download = "plan.jpg";
  a.click();
});

function connectWS() {
  const ws = new WebSocket(`ws://${location.host}/ws`);
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);

    if (msg.type === "measure") {
      lastMeasure = msg.value_m;
      lastMeasureEl.textContent = lastMeasure.toFixed(4);
    }

    if (msg.type === "ble_status") {
      setBleStatus(msg.connected, msg.device_name, msg.device_address);
    }
  };

  ws.onclose = () => setTimeout(connectWS, 1000);
}
connectWS();

draw();
