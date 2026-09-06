/**
 * Op-Amp Lab bench UI: devices + wire segments over merged nets, live
 * analog DC solve, gradient wires, voltmeter probes, transfer-curve plot.
 * Same shared-shell pattern as src/cmos-ui.js.
 */
import {
  buildAnalogSpec, simulateAnalog, sweepTransfer, evaluateAnalog,
  countAnalogParts, analogPins, RES_VALUES,
} from "./analog.js";
import { LEVELS_ANALOG } from "./analog-levels.js";
import { starsFor } from "./levels.js";

export const ANALOG_SIZE = {
  OPAMP: { w: 120, h: 104 },
  RES: { w: 84, h: 44 },
  VSRC: { w: 72, h: 96 },
  SUP: { w: 92, h: 44 },
  GND: { w: 72, h: 52 },
  PROBE: { w: 92, h: 64 },
};

const W = 960, H = 540, PIN_R = 12;

export function pinAnchor(kind, pin) {
  const { w, h } = ANALOG_SIZE[kind];
  if (kind === "OPAMP") {
    if (pin === "OUT") return { x: w, y: h / 2 };
    if (pin === "+") return { x: 0, y: h - 32 };
    return { x: 0, y: 32 };
  }
  if (kind === "RES") return pin === "A" ? { x: 0, y: h / 2 } : { x: w, y: h / 2 };
  if (kind === "VSRC") return pin === "P" ? { x: w / 2, y: 0 } : { x: w / 2, y: h };
  if (kind === "SUP") return { x: w / 2, y: h };
  if (kind === "GND") return { x: w / 2, y: 0 };
  return { x: 0, y: h / 2 }; // PROBE
}

function pinAbs(dev, pin) {
  const a = pinAnchor(dev.kind, pin);
  return { x: dev.x + a.x, y: dev.y + a.y };
}

/** Voltage (-12..+12) to wire color: blue → slate → red. */
export function voltColor(v) {
  if (v == null || Number.isNaN(v)) return "#475569";
  const t = Math.max(-12, Math.min(12, v)) / 12; // -1..1
  const lerp = (a, b, f) => Math.round(a + (b - a) * f);
  let r, g, b;
  if (t < 0) { const f = -t; r = lerp(71, 96, f); g = lerp(85, 165, f); b = lerp(105, 250, f); }
  else { const f = t; r = lerp(71, 248, f); g = lerp(85, 113, f); b = lerp(105, 113, f); }
  return `rgb(${r},${g},${b})`;
}

export function fmtV(v) {
  if (v == null || Number.isNaN(v)) return "?";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;
}

// ---------- artwork ----------
function opArt() {
  const { w, h } = ANALOG_SIZE.OPAMP;
  return `<svg class="cdev-art" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">`
    + `<path d="M0 32H34M0 72H34" stroke="#8ea2c8" stroke-width="2"/>`
    + `<polygon points="34,10 34,94 102,52" fill="#22315a" stroke="#e8eefc" stroke-width="2"/>`
    + `<path d="M102 52H${w}" stroke="#8ea2c8" stroke-width="2"/>`
    + `<text x="6" y="28" fill="#e8eefc" font-size="13">−</text>`
    + `<text x="6" y="82" fill="#e8eefc" font-size="13">+</text></svg>`;
}
function resArt(r) {
  const { w, h } = ANALOG_SIZE.RES;
  const pts = [];
  for (let i = 0; i <= 6; i++) pts.push(`${14 + i * 8},${h / 2 + (i % 2 ? -8 : 8)}`);
  return `<svg class="cdev-art" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">`
    + `<path d="M0 ${h / 2}H14" stroke="#8ea2c8" stroke-width="2"/>`
    + `<polyline points="${pts.join(" ")}" fill="none" stroke="#e8eefc" stroke-width="2"/>`
    + `<path d="M62 ${h / 2}H${w}" stroke="#8ea2c8" stroke-width="2"/>`
    + `<text x="26" y="12" fill="#93a3c4" font-size="9">${r >= 1000 ? `${r / 1000}k` : r}</text></svg>`;
}
function vsrcArt(v) {
  const { w, h } = ANALOG_SIZE.VSRC;
  return `<svg class="cdev-art" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">`
    + `<path d="M${w / 2} 0V28M${w / 2} 68V${h}" stroke="#8ea2c8" stroke-width="2"/>`
    + `<circle cx="${w / 2}" cy="${h / 2}" r="20" fill="#22315a" stroke="#e8eefc" stroke-width="2"/>`
    + `<text x="${w / 2 - 5}" y="${h / 2 - 2}" fill="#e8eefc" font-size="12">+</text>`
    + `<text x="${w / 2 - 4}" y="${h / 2 + 14}" fill="#e8eefc" font-size="12">−</text></svg>`;
}

function deviceInner(dev, probeText) {
  switch (dev.kind) {
    case "OPAMP": return `<div class="node-title">OP-AMP ±12V</div>${opArt()}`;
    case "RES": return `<div class="node-title">RES</div>${resArt(dev.r ?? 10000)}`;
    case "VSRC": return `<div class="node-title">${dev.name ?? "SRC"} · ${fmtV(dev.volts ?? 0)}V</div>${vsrcArt()}`;
    case "SUP":
      return `<div class="node-title term-vdd">${dev.volts > 0 ? "+12V" : "−12V"}</div><div class="node-lamp on-static">${dev.volts > 0 ? "+" : "−"}</div>`;
    case "GND": return `<div class="node-title">GND</div><div class="node-lamp">0</div>`;
    case "PROBE": return `<div class="node-title">${dev.name ?? "OUT"}</div><div class="node-lamp probe-v">${probeText}</div>`;
    default: return dev.kind;
  }
}

// ---------- controller ----------
export function createAnalogUI(deps) {
  const { $, save, persistSave } = deps;
  const asave = () => {
    save.analog ??= { unlocked: 1, stars: {}, playground: null };
    return save.analog;
  };
  const S = {
    levelIndex: 0, playground: false,
    devices: {}, segs: {}, inputStates: {},
    inIds: [], probeIds: [],
    selected: null, pending: null, lastResults: null,
    spawn: 0, seq: 1,
  };
  let live = null; // { sim, endpointNet }

  const level = () => LEVELS_ANALOG[S.levelIndex];
  const isPlayground = () => S.playground;
  const newId = (p) => `${p}${S.seq++}`;

  function addDeviceUI(kind, x, y, extra = {}) {
    const id = newId("a");
    S.devices[id] = { id, kind, x, y, ...extra };
    if (kind === "VSRC") S.inputStates[id] = extra.volts ?? 0;
    return S.devices[id];
  }

  function terminals() {
    const lv = level();
    lv.inputs.forEach((name, i) => {
      const d = addDeviceUI("VSRC", 30, 96 + i * 125, { locked: true, name, volts: 0 });
      S.inIds.push(d.id);
    });
    lv.probes.forEach((name, i) => {
      const d = addDeviceUI("PROBE", W - 92 - 30, 96 + i * 125, { locked: true, name });
      S.probeIds.push(d.id);
    });
    addDeviceUI("SUP", 30, 8, { locked: true, name: "+12V", volts: 12 });
    addDeviceUI("SUP", 30, 488, { locked: true, name: "−12V", volts: -12 });
    addDeviceUI("GND", 150, 488, { locked: true, name: "GND" });
  }

  function loadLevel(index) {
    S.playground = false;
    S.levelIndex = Math.max(0, Math.min(LEVELS_ANALOG.length - 1, index));
    S.devices = {}; S.segs = {}; S.inputStates = {};
    S.inIds = []; S.probeIds = [];
    S.selected = null; S.pending = null; S.lastResults = null;
    S.spawn = 0; S.seq = 1;
    terminals();
    renderAll();
  }

  function loadPlayground() {
    S.playground = true;
    S.selected = null; S.pending = null; S.lastResults = null;
    S.inIds = []; S.probeIds = []; S.inputStates = {};
    S.spawn = 0; S.seq = 1;
    const saved = asave().playground;
    if (saved) {
      S.devices = saved.devices ?? {};
      S.segs = saved.segs ?? {};
      for (const d of Object.values(S.devices)) {
        if (d.kind === "VSRC") { S.inputStates[d.id] = d.volts ?? 0; S.inIds.push(d.id); }
        if (d.kind === "PROBE") S.probeIds.push(d.id);
      }
      let max = 0;
      for (const id of [...Object.keys(S.devices), ...Object.keys(S.segs)]) {
        const m = /^[aw](\d+)$/.exec(id);
        if (m) max = Math.max(max, parseInt(m[1], 10));
      }
      S.seq = max + 1;
    } else {
      S.devices = {}; S.segs = {};
    }
    renderAll();
  }

  function persistPlayground() {
    if (!isPlayground()) return;
    for (const d of Object.values(S.devices)) {
      if (d.kind === "VSRC") d.volts = S.inputStates[d.id] ?? 0;
    }
    asave().playground = { devices: S.devices, segs: S.segs };
    persistSave(save);
  }

  // ----- palette -----
  function paletteKinds() {
    if (isPlayground()) return ["OPAMP", "RES", "VSRC", "SUP", "GND", "PROBE"];
    return ["OPAMP", "RES"];
  }
  function usedCount(kind) {
    return Object.values(S.devices).filter((d) => d.kind === kind).length;
  }
  function renderPalette() {
    const el = $("#palette");
    el.innerHTML = "";
    $("#palette-label").textContent = isPlayground() ? "Parts (all unlocked)" : "Parts (this level's budget)";
    $("#palette-hint").textContent = "Sources, ±12V rails and meters are pre-placed — wire up your circuit.";
    for (const kind of paletteKinds()) {
      const btn = document.createElement("button");
      btn.className = "pal-btn";
      btn.dataset.type = kind;
      let remaining = Infinity, available = true;
      if (!isPlayground()) {
        const budget = level().allowed[kind] ?? 0;
        available = budget > 0;
        remaining = budget - usedCount(kind);
      }
      btn.innerHTML = `<span class="pal-sym">${kind}</span>` +
        (isPlayground() || available
          ? (remaining !== Infinity ? `<span class="pal-count">${remaining} left</span>` : "")
          : `<span class="pal-count">locked</span>`);
      btn.disabled = !available || remaining <= 0;
      btn.setAttribute("aria-label", `Add ${kind}`);
      btn.addEventListener("click", () => {
        if (!isPlayground() && usedCount(kind) >= (level().allowed[kind] ?? 0)) return;
        const { w, h } = ANALOG_SIZE[kind];
        const gx = S.spawn % 5, gy = Math.floor(S.spawn / 5) % 3;
        S.spawn++;
        const extra = kind === "RES" ? { r: 10000 } : kind === "VSRC" ? { volts: 0 } : {};
        const d = addDeviceUI(kind, Math.min(W - w - 10, 200 + gx * 140), Math.min(H - h - 10, 110 + gy * 130), extra);
        if (kind === "VSRC") S.inIds.push(d.id);
        if (kind === "PROBE") S.probeIds.push(d.id);
        S.selected = { kind: "dev", id: d.id };
        afterMutation();
      });
      el.appendChild(btn);
    }
  }

  // ----- live sim -----
  function inputMap(testsRow) {
    const m = {};
    S.inIds.forEach((id, i) => { m[id] = testsRow ? testsRow[i] : (S.inputStates[id] ?? 0); });
    return m;
  }
  function buildLive() {
    const { spec, endpointNet } = buildAnalogSpecFromUI(inputMap());
    return { sim: simulateAnalog(spec), endpointNet };
  }
  function buildAnalogSpecFromUI(values) {
    const devs = {};
    for (const [id, d] of Object.entries(S.devices)) devs[id] = { ...d };
    return buildAnalogSpec(devs, S.segs, values);
  }
  function afterMutation() {
    live = buildLive();
    renderPalette();
    renderDevices();
    renderSegs();
    renderSpec();
    $("#delete-btn").disabled = !S.selected;
    persistPlayground();
  }

  function segVolt(seg) {
    if (!live?.sim.ok) return null;
    const nid = live.endpointNet[`${seg.from.dev}:${seg.from.pin}`];
    return live.sim.voltages.get(nid) ?? null;
  }
  function probeText(devId) {
    if (!live?.sim.ok) return "?";
    const nid = live.endpointNet[`${devId}:S`];
    return fmtV(live.sim.voltages.get(nid));
  }

  // ----- devices -----
  function renderDevices() {
    const layer = $("#nodes");
    layer.innerHTML = "";
    for (const dev of Object.values(S.devices)) {
      const { w, h } = ANALOG_SIZE[dev.kind];
      const div = document.createElement("div");
      div.className = `node cdev kind-${dev.kind}` +
        (S.selected?.kind === "dev" && S.selected.id === dev.id ? " selected" : "");
      div.style.left = `${dev.x}px`;
      div.style.top = `${dev.y}px`;
      div.style.width = `${w}px`;
      div.style.height = `${h}px`;
      div.dataset.id = dev.id;
      if (dev.name) div.dataset.name = dev.name;
      div.tabIndex = 0;
      div.setAttribute("role", "button");
      div.setAttribute("aria-label", `${dev.kind} ${dev.name ?? dev.id}`);
      div.innerHTML = deviceInner(dev, probeText(dev.id));
      for (const p of analogPins(dev.kind)) {
        const a = pinAnchor(dev.kind, p);
        const b = document.createElement("button");
        const isPending = S.pending?.dev === dev.id && S.pending?.pin === p;
        b.className = "pin cpin" + (isPending ? " pending" : "") + (S.pending && !isPending ? " compat" : "");
        b.dataset.dev = dev.id;
        b.dataset.pin = p;
        b.setAttribute("aria-label", `Pin ${p} of ${dev.name ?? dev.id}.`);
        b.style.left = `${a.x - PIN_R}px`;
        b.style.top = `${a.y - PIN_R}px`;
        b.addEventListener("pointerdown", (e) => { e.stopPropagation(); onPin(dev.id, p); });
        b.addEventListener("click", (e) => { e.stopPropagation(); onPin(dev.id, p); });
        div.appendChild(b);
      }
      if (dev.kind === "VSRC") {
        const sl = document.createElement("input");
        sl.type = "range"; sl.min = "-12"; sl.max = "12"; sl.step = "0.5";
        sl.value = String(S.inputStates[dev.id] ?? 0);
        sl.className = "vsrc-slider";
        sl.setAttribute("aria-label", `Source ${dev.name} volts`);
        sl.addEventListener("pointerdown", (e) => e.stopPropagation());
        sl.addEventListener("click", (e) => e.stopPropagation());
        sl.addEventListener("input", () => {
          S.inputStates[dev.id] = parseFloat(sl.value);
          dev.volts = parseFloat(sl.value);
          afterMutation();
        });
        div.appendChild(sl);
      }
      if (!dev.locked && S.selected?.kind === "dev" && S.selected.id === dev.id) {
        const x = document.createElement("button");
        x.className = "node-del";
        x.textContent = "×";
        x.setAttribute("aria-label", `Delete ${dev.kind}`);
        x.addEventListener("click", (e) => { e.stopPropagation(); deleteDev(dev.id); });
        div.appendChild(x);
      }
      div.addEventListener("pointerdown", (e) => {
        if (e.target.closest(".pin") || e.target.closest(".node-del") || e.target.closest("input")) return;
        startDrag(e, dev.id);
      });
      div.addEventListener("click", (e) => {
        if (e.target.closest(".pin") || e.target.closest(".node-del") || e.target.closest("input")) return;
        S.selected = { kind: "dev", id: dev.id };
        if (dev.kind === "RES") {
          // Clicking a resistor selects it AND steps its value (announced).
          const i = (RES_VALUES.indexOf(dev.r ?? 10000) + 1) % RES_VALUES.length;
          dev.r = RES_VALUES[i];
          setStatus(`Resistor → ${dev.r >= 1000 ? `${dev.r / 1000}k` : dev.r} (selected; Del removes).`);
          afterMutation();
        } else {
          renderDevices();
        }
      });
      layer.appendChild(div);
    }
  }

  let drag = null;
  function startDrag(e, devId) {
    const dev = S.devices[devId];
    if (!dev) return;
    const { w, h } = ANALOG_SIZE[dev.kind];
    drag = { devId, startX: e.clientX, startY: e.clientY, origX: dev.x, origY: dev.y, moved: false };
    const scale = $("#canvas").clientWidth / W;
    const onMove = (ev) => {
      if (!drag) return;
      const nx = Math.round(Math.min(W - w, Math.max(0, drag.origX + (ev.clientX - drag.startX) / scale)));
      const ny = Math.round(Math.min(H - h, Math.max(0, drag.origY + (ev.clientY - drag.startY) / scale)));
      if (nx !== dev.x || ny !== dev.y) {
        drag.moved = true;
        dev.x = nx; dev.y = ny;
        const el = document.querySelector(`.node[data-id="${CSS.escape(devId)}"]`);
        if (el) { el.style.left = `${nx}px`; el.style.top = `${ny}px`; }
        renderSegs();
      }
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (drag?.moved) afterMutation();
      drag = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  // ----- wiring -----
  function onPin(devId, pin) {
    if (S.pending && (S.pending.dev !== devId || S.pending.pin !== pin)) {
      const from = S.pending;
      S.pending = null;
      const dup = Object.values(S.segs).some((s) =>
        (s.from.dev === from.dev && s.from.pin === from.pin && s.to.dev === devId && s.to.pin === pin) ||
        (s.from.dev === devId && s.from.pin === pin && s.to.dev === from.dev && s.to.pin === from.pin));
      if (from.dev === devId && from.pin === pin) setStatus("Cannot wire a pin to itself.");
      else if (dup) setStatus("Already wired.");
      else {
        const wid = `w${S.seq++}`;
        S.segs[wid] = { id: wid, from: { ...from }, to: { dev: devId, pin } };
        setStatus("Wired.");
        S.selected = { kind: "seg", id: wid };
      }
      afterMutation();
      return;
    }
    if (S.pending?.dev === devId && S.pending?.pin === pin) {
      S.pending = null;
      setStatus("Wire cancelled.");
    } else {
      S.pending = { dev: devId, pin };
      S.selected = null;
      setStatus("Pin selected: click another pin to connect. Esc cancels.");
    }
    renderDevices();
    renderSegs();
    $("#delete-btn").disabled = !S.selected;
  }

  function deleteDev(id) {
    const d = S.devices[id];
    if (!d || d.locked) { setStatus("That terminal is locked."); return; }
    for (const [sid, s] of Object.entries(S.segs)) {
      if (s.from.dev === id || s.to.dev === id) delete S.segs[sid];
    }
    delete S.devices[id];
    delete S.inputStates[id];
    S.inIds = S.inIds.filter((x) => x !== id);
    S.probeIds = S.probeIds.filter((x) => x !== id);
    if (S.selected?.id === id) S.selected = null;
    afterMutation();
  }

  function deleteSelected() {
    if (!S.selected) return;
    if (S.selected.kind === "seg") {
      delete S.segs[S.selected.id];
      S.selected = null;
      afterMutation();
    } else deleteDev(S.selected.id);
  }

  // ----- segs -----
  function renderSegs() {
    const svg = $("#wires");
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    for (const s of Object.values(S.segs)) {
      const a = S.devices[s.from.dev], b = S.devices[s.to.dev];
      if (!a || !b) continue;
      const p1 = pinAbs(a, s.from.pin), p2 = pinAbs(b, s.to.pin);
      const v = segVolt(s);
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", wireD(p1, p2));
      path.setAttribute("class", "wire" + (S.selected?.kind === "seg" && S.selected.id === s.id ? " selected" : ""));
      if (v == null || !live?.sim.ok) path.style.strokeDasharray = "7 5";
      else path.style.stroke = voltColor(v);
      if (v == null) path.style.stroke = "#475569";
      path.dataset.id = s.id;
      const sel = (e) => {
        e.stopPropagation();
        S.selected = { kind: "seg", id: s.id };
        renderSegs(); renderDevices();
        $("#delete-btn").disabled = false;
      };
      path.addEventListener("click", sel);
      svg.appendChild(path);
      const hit = document.createElementNS("http://www.w3.org/2000/svg", "path");
      hit.setAttribute("d", wireD(p1, p2));
      hit.setAttribute("class", "wire-hit");
      hit.addEventListener("click", sel);
      svg.appendChild(hit);
    }
    if (S.pending) {
      const d = S.devices[S.pending.dev];
      if (d) {
        const a = pinAbs(d, S.pending.pin);
        const ghost = document.createElementNS("http://www.w3.org/2000/svg", "path");
        ghost.setAttribute("d", `M ${a.x} ${a.y} C ${a.x + 40} ${a.y}, ${a.x + 60} ${a.y + 30}, ${a.x + 80} ${a.y + 30}`);
        ghost.setAttribute("class", "wire pending-ghost");
        svg.appendChild(ghost);
      }
    }
  }
  function wireD(a, b) {
    const dx = Math.max(30, Math.abs(b.x - a.x) / 2);
    return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
  }

  // ----- spec / check -----
  function setStatus(msg) { $("#status").textContent = msg; }

  function renderSpec() {
    const isChallenge = !isPlayground();
    $("#spec-challenge").hidden = !isChallenge;
    $("#spec-sandbox").hidden = isChallenge;
    $("#hint-details").hidden = true;
    document.querySelector("#spec-challenge .check-row").style.display = isChallenge ? "" : "none";
    document.querySelector("#spec-challenge .table-wrap").style.display = isChallenge ? "" : "none";
    document.querySelector("#spec-challenge h3").style.display = isChallenge ? "" : "none";
    document.querySelector("#xfer-wrap").style.display = "";
    if (isChallenge) {
      const lv = level();
      $("#level-name").textContent = `O${S.levelIndex + 1}. ${lv.name}`;
      $("#level-brief").textContent = lv.briefing;
      const budget = Object.entries(lv.allowed).map(([t, n]) => `${t}×${n}`).join(" · ");
      const used = countAnalogParts(Object.values(S.devices).reduce((m, d) => (m[d.id] = d, m), {}));
      const total = Object.values(used).reduce((a, b) => a + b, 0);
      $("#level-budget").textContent = `Budget: ${budget} · Par: ${lv.par} parts · Parts used: ${total} · tol ±${lv.tol}V`;
      renderAnalogTable();
    } else {
      const ndev = Object.keys(S.devices).length, nseg = Object.keys(S.segs).length;
      $("#sandbox-info").textContent = `Devices: ${ndev} · Wires: ${nseg}${
        live && !live.sim.ok ? " · doesn't solve — check ground returns" : ""}`;
    }
    renderPlot();
    renderExprHide();
  }
  function renderExprHide() {
    $("#expr-view").hidden = true;
    const t = $("#expr-toggle");
    t.setAttribute("aria-pressed", "false");
    t.classList.remove("active");
    t.style.display = "none";
  }

  function liveRows() {
    const lv = level();
    return lv.tests.map((t) => {
      const inMap = {};
      S.inIds.forEach((id, i) => { inMap[id] = t.in[i]; });
      const { spec, endpointNet } = buildAnalogSpecFromUI(inMap);
      const sim = simulateAnalog(spec);
      return S.probeIds.map((id) => {
        const v = sim.voltages.get(endpointNet[`${id}:S`]);
        return v == null || Number.isNaN(v) || !sim.ok ? "?" : fmtV(v);
      });
    });
  }

  function renderAnalogTable() {
    const lv = level();
    const table = $("#truth-table");
    table.innerHTML = "";
    const head = document.createElement("tr");
    for (const n of lv.inputs) { const th = document.createElement("th"); th.textContent = `${n} (V)`; head.appendChild(th); }
    for (const n of lv.probes) { const th = document.createElement("th"); th.textContent = `${n} exp`; head.appendChild(th); }
    const liveTh = document.createElement("th");
    liveTh.textContent = "live";
    head.appendChild(liveTh);
    if (S.lastResults) {
      const r = document.createElement("th");
      r.textContent = "check";
      head.appendChild(r);
    }
    table.appendChild(head);
    const liveVals = liveRows();
    const resByKey = new Map((S.lastResults ?? []).map((r) => [r.in.join(","), r]));
    lv.tests.forEach((t, ri) => {
      const tr = document.createElement("tr");
      for (const b of t.in) { const td = document.createElement("td"); td.textContent = fmtV(b); tr.appendChild(td); }
      for (const b of t.out) { const td = document.createElement("td"); td.textContent = fmtV(b); tr.appendChild(td); }
      const td = document.createElement("td");
      td.textContent = liveVals[ri].join(" ");
      td.className = "live-cell";
      tr.appendChild(td);
      if (S.lastResults) {
        const rr = resByKey.get(t.in.join(","));
        const td2 = document.createElement("td");
        td2.textContent = rr?.ok ? "✓" : "✗";
        td2.className = rr?.ok ? "ok" : "bad";
        tr.appendChild(td2);
      }
      table.appendChild(tr);
    });
    const res = $("#check-results");
    if (live && !live.sim.ok) {
      res.innerHTML = `<span class="fail">⚠ Circuit doesn't solve — every source needs a ground return; check for shorts and floating op-amp inputs.</span>`;
    } else if (!S.lastResults) {
      res.innerHTML = `<span class="muted">Press “Check solution” to run all ${lv.tests.length} case(s) within ±${lv.tol}V.</span>`;
    }
  }

  function checkSolution() {
    const lv = level();
    const build = (inputValues) => buildAnalogSpecFromUI(inputValues);
    const pks = S.probeIds.map((id) => `${id}:S`);
    const { passed, results } = evaluateAnalog(build, lv, S.inIds, pks, lv.tol);
    S.lastResults = results;
    const used = countAnalogParts(S.devices);
    const total = Object.values(used).reduce((a, b) => a + b, 0);
    const res = $("#check-results");
    const fails = results.filter((r) => !r.ok);
    if (passed) {
      const stars = starsFor(lv, total);
      res.innerHTML = `<span class="pass">✓ Solved! ${"★".repeat(stars)}${"☆".repeat(3 - stars)} (${total} parts, par ${lv.par})</span>`;
      const as = asave();
      as.stars[lv.id] = Math.max(as.stars[lv.id] ?? 0, stars);
      as.unlocked = Math.max(as.unlocked, Math.min(LEVELS_ANALOG.length, S.levelIndex + 2));
      persistSave(save);
      renderLevelList();
      setStatus(`Level solved with ${stars} stars.`);
      if (S.levelIndex + 1 < LEVELS_ANALOG.length) {
        const btn = document.createElement("button");
        btn.className = "btn primary";
        btn.textContent = "Next level →";
        btn.addEventListener("click", () => loadLevel(S.levelIndex + 1));
        res.appendChild(document.createTextNode(" "));
        res.appendChild(btn);
      }
    } else {
      const f = fails[0];
      const got = f.actual.map((v) => (v == null || Number.isNaN(v) ? "?" : fmtV(v))).join(",");
      res.innerHTML = `<span class="fail">✗ Not yet — ${fails.length} of ${results.length} fail (tol ±${lv.tol}V). First: in=${f.in.join(",")} expected=${f.expected.join(",")} got=${got}.</span>`;
      setStatus("Check failed.");
    }
    renderAnalogTable();
    renderPalette();
  }

  // ----- transfer plot -----
  function renderPlot() {
    const wrap = document.querySelector("#xfer-wrap");
    const svg = document.querySelector("#xfer");
    svg.innerHTML = "";
    if (S.inIds.length === 0 || S.probeIds.length === 0) {
      wrap.style.display = "none";
      return;
    }
    wrap.style.display = "";
    const inMap = {};
    S.inIds.forEach((id) => { inMap[id] = S.inputStates[id] ?? 0; });
    const { spec, endpointNet } = buildAnalogSpecFromUI(inMap);
    const srcDev = S.inIds[0];
    const probeKey = `${S.probeIds[0]}:S`;
    const probeNet = endpointNet[probeKey];
    const pts = sweepTransfer(spec, srcDev, probeNet, 25);
    const Wp = 260, Hp = 150, pad = 14;
    const X = (vin) => pad + ((vin + 12) / 24) * (Wp - 2 * pad);
    const Y = (v) => {
      const c = Math.max(-13, Math.min(13, v ?? 0));
      return pad + ((13 - c) / 26) * (Hp - 2 * pad);
    };
    const axis = (x1, y1, x2, y2) =>
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#2a3a5f" stroke-width="1"/>`;
    let inner = axis(pad, Y(0), Wp - pad, Y(0)) + axis(X(0), pad, X(0), Hp - pad);
    const d = pts.filter((p) => !Number.isNaN(p.vout))
      .map((p, i) => `${i === 0 ? "M" : "L"}${X(p.vin).toFixed(1)} ${Y(p.vout).toFixed(1)}`).join(" ");
    if (d) inner += `<path d="${d}" fill="none" stroke="#60a5fa" stroke-width="2"/>`;
    const cur = S.inputStates[srcDev] ?? 0;
    const curOut = live?.sim.ok ? live.sim.voltages.get(probeNet) : NaN;
    if (!Number.isNaN(curOut)) {
      inner += `<circle cx="${X(cur)}" cy="${Y(curOut)}" r="4" fill="#34d399"/>`;
    }
    svg.setAttribute("viewBox", `0 0 ${Wp} ${Hp}`);
    svg.innerHTML = inner;
  }

  // ----- level list -----
  function renderLevelList() {
    const list = $("#level-list");
    list.innerHTML = "";
    const as = asave();
    const pg = document.createElement("button");
    pg.className = "level-card playground" + (isPlayground() ? " active" : "");
    pg.innerHTML = `<span class="lvl-num">⚗</span><span class="lvl-name">Playground</span><span class="lvl-stars"></span><span class="lvl-tag">free parts</span>`;
    pg.setAttribute("aria-label", "Analog playground with free parts");
    pg.addEventListener("click", loadPlayground);
    list.appendChild(pg);
    const h = document.createElement("div");
    h.className = "lvl-chapter";
    h.textContent = "Op-Amp Lab";
    list.appendChild(h);
    LEVELS_ANALOG.forEach((lv, i) => {
      const locked = i + 1 > as.unlocked && !save.freePlay;
      const card = document.createElement("button");
      card.className = "level-card" + (!isPlayground() && i === S.levelIndex ? " active" : "");
      card.disabled = locked;
      const stars = as.stars[lv.id] ?? 0;
      card.innerHTML = `<span class="lvl-num">${locked ? "🔒" : `O${i + 1}`}</span>
        <span class="lvl-name">${lv.name}</span>
        <span class="lvl-stars">${"★".repeat(stars)}${"☆".repeat(3 - stars)}</span>
        <span class="lvl-tag">${lv.tag}</span>`;
      card.setAttribute("aria-label", `${locked ? "Locked" : ""} Op-amp level ${i + 1}: ${lv.name}`);
      if (!locked) card.addEventListener("click", () => loadLevel(i));
      list.appendChild(card);
    });
    for (const id of ["#mode-challenge", "#mode-sandbox", "#mode-cmos"]) {
      document.querySelector(id)?.classList.remove("active");
    }
    document.querySelector("#mode-analog")?.classList.add("active");
  }

  function renderAll() {
    live = buildLive();
    renderLevelList();
    renderPalette();
    renderDevices();
    renderSegs();
    renderSpec();
    $("#delete-btn").disabled = !S.selected;
    const place = isPlayground() ? "Analog Playground" : `Op-amp level ${S.levelIndex + 1} of ${LEVELS_ANALOG.length}`;
    setStatus(`${place}. Click any pin, then another pin, to wire. Click a resistor to change its value.`);
    fitStage();
  }
  function fitStage() {
    const canvas = $("#canvas");
    const stage = $("#stage");
    if (!canvas || !stage) return;
    stage.style.transform = `scale(${canvas.clientWidth / W})`;
  }

  let resizeBound = false;
  return {
    enter(index = 0) {
      if (!resizeBound) { window.addEventListener("resize", fitStage); resizeBound = true; }
      loadLevel(Math.min(index, asave().unlocked - 1));
    },
    enterPlayground: loadPlayground,
    renderLevelList,
    onCheck: () => { if (!isPlayground()) checkSolution(); },
    onDelete: deleteSelected,
    onReset: () => { if (isPlayground()) { S.devices = {}; S.segs = {}; afterMutation(); } else loadLevel(S.levelIndex); },
    onEscape: () => {
      S.pending = null; S.selected = null;
      renderDevices(); renderSegs();
      $("#delete-btn").disabled = true;
    },
    onCanvasBackground: () => {
      S.pending = null; S.selected = null;
      renderDevices(); renderSegs();
      $("#delete-btn").disabled = true;
    },
    _state: S,
  };
}
