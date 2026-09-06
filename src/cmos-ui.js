/**
 * CMOS Lab bench UI: devices + wire segments over merged nets, live
 * switch-level simulation. Operates on the shared shell DOM ids
 * (palette, canvas/stage, spec panel) when CMOS mode is active.
 *
 * UI state (separate from the engine net, rebuilt on every sim):
 *   devices: { id: { id, kind, x, y, locked?, name? } }
 *   segs:    { id: { id, from: { dev, pin }, to: { dev, pin } } }
 */
import {
  addNetNode, addDevice, simulateCmos, evaluateCmos, countCmosParts,
  CMOS_PARTS, serializeNet, deserializeNet,
} from "./cmos.js";
import { LEVELS_CMOS } from "./cmos-levels.js";
import { starsFor } from "./levels.js";

export const CMOS_SIZE = {
  NMOS: { w: 84, h: 104 }, PMOS: { w: 84, h: 104 }, NPN: { w: 84, h: 104 },
  DIODE: { w: 84, h: 52 }, PULLUP: { w: 72, h: 44 }, PULLDOWN: { w: 72, h: 44 },
  VDD: { w: 92, h: 52 }, GND: { w: 92, h: 52 }, IN: { w: 92, h: 52 }, PROBE: { w: 92, h: 52 },
};

const W = 960, H = 540, PIN_R = 12;

export function devicePins(kind) {
  if (kind === "NMOS" || kind === "PMOS" || kind === "NPN") return ["G", "A", "B"];
  if (kind === "DIODE") return ["A", "K"];
  if (kind === "PROBE") return ["A"];
  return ["Y"]; // PULLUP/PULLDOWN/VDD/GND/IN
}

/** Pin anchor in device-local coords (center of the 24px hit target). */
export function pinAnchor(kind, pin) {
  const { w, h } = CMOS_SIZE[kind];
  if (kind === "NMOS" || kind === "PMOS" || kind === "NPN") {
    if (pin === "G") return { x: 0, y: h / 2 };
    if (pin === "A") return { x: w / 2, y: 0 };
    return { x: w / 2, y: h };
  }
  if (kind === "DIODE") return pin === "A" ? { x: 0, y: h / 2 } : { x: w, y: h / 2 };
  if (kind === "PROBE") return { x: 0, y: h / 2 };
  return { x: w, y: h / 2 };
}

function pinAbs(dev, pin) {
  const a = pinAnchor(dev.kind, pin);
  return { x: dev.x + a.x, y: dev.y + a.y };
}

/** Build an engine net from UI state via union-find over seg endpoints. */
export function buildEngineNet(devices, segs) {
  const parent = {};
  const key = (dev, pin) => `${dev}:${pin}`;
  const find = (x) => {
    parent[x] ??= x;
    while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
    return x;
  };
  for (const d of Object.values(devices)) {
    for (const p of devicePins(d.kind)) find(key(d.id, p));
  }
  for (const s of Object.values(segs)) {
    find(key(s.from.dev, s.from.pin));
    find(key(s.to.dev, s.to.pin));
    parent[find(key(s.from.dev, s.from.pin))] = find(key(s.to.dev, s.to.pin));
  }
  const net = { nets: {}, devices: {}, seq: 1 };
  const rootToNet = {};
  const endpointNet = {};
  for (const d of Object.values(devices)) {
    for (const p of devicePins(d.kind)) {
      const root = find(key(d.id, p));
      if (!rootToNet[root]) {
        const nid = `t${net.seq++}`;
        net.nets[nid] = { id: nid };
        rootToNet[root] = nid;
      }
      endpointNet[key(d.id, p)] = rootToNet[root];
    }
  }
  const T = (dev, pin) => endpointNet[key(dev, pin)];
  for (const d of Object.values(devices)) {
    const t = (pin) => T(d.id, pin);
    switch (d.kind) {
      case "NMOS": case "PMOS":
        net.devices[d.id] = { id: d.id, kind: d.kind, gate: t("G"), a: t("A"), b: t("B") };
        break;
      case "NPN":
        net.devices[d.id] = { id: d.id, kind: "NPN", base: t("G"), c: t("A"), e: t("B") };
        break;
      case "DIODE":
        net.devices[d.id] = { id: d.id, kind: "DIODE", anode: t("A"), cathode: t("K") };
        break;
      default: // PULLUP/PULLDOWN/VDD/GND/IN/PROBE
        net.devices[d.id] = { id: d.id, kind: d.kind, net: t(d.kind === "PROBE" ? "A" : "Y") };
        break;
    }
  }
  return { net, endpointNet };
}

// ---------- device artwork (inline SVG, leads reach the pin anchors) ----------
function mosArt(kind) {
  const { w, h } = CMOS_SIZE[kind];
  const cx = w / 2, mid = h / 2;
  const bubble = kind === "PMOS" ? `<circle cx="${cx - 8}" cy="${mid}" r="4.5" fill="#16213c" stroke="#e8eefc" stroke-width="2"/>` : "";
  const arrow = kind === "NPN" ? `<polygon points="${cx},${h - 14} ${cx - 6},${h - 26} ${cx + 6},${h - 26}" fill="#e8eefc"/>` : "";
  return `<svg class="cdev-art" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">`
    + `<path d="M0 ${mid}H${cx - 8}" stroke="#8ea2c8" stroke-width="2"/>`
    + `<path d="M${cx} 0V${h}" stroke="#8ea2c8" stroke-width="2"/>`
    + `<path d="M${cx} 26V${h - 26}" stroke="#e8eefc" stroke-width="5"/>`
    + `<path d="M${cx - 8} ${mid - 13}V${mid + 13}" stroke="#e8eefc" stroke-width="3"/>`
    + bubble + arrow + `</svg>`;
}
function diodeArt() {
  const { w, h } = CMOS_SIZE.DIODE;
  return `<svg class="cdev-art" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">`
    + `<path d="M0 ${h / 2}H28" stroke="#8ea2c8" stroke-width="2"/>`
    + `<polygon points="28,10 28,42 56,26" fill="#22315a" stroke="#e8eefc" stroke-width="2"/>`
    + `<path d="M56 10V42" stroke="#e8eefc" stroke-width="3"/>`
    + `<path d="M56 ${h / 2}H${w}" stroke="#8ea2c8" stroke-width="2"/></svg>`;
}
function pullArt(up) {
  const { w, h } = CMOS_SIZE.PULLUP;
  const pts = [];
  for (let i = 0; i <= 6; i++) pts.push(`${10 + i * 8},${h / 2 + (i % 2 ? -8 : 8)}`);
  return `<svg class="cdev-art" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">`
    + `<path d="M0 ${h / 2}H10" stroke="#8ea2c8" stroke-width="2"/>`
    + `<polyline points="${pts.join(" ")}" fill="none" stroke="#e8eefc" stroke-width="2"/>`
    + `<path d="M58 ${h / 2}H${w}" stroke="#8ea2c8" stroke-width="2"/>`
    + `<text x="30" y="12" fill="#93a3c4" font-size="9">${up ? "↑VDD" : "↓GND"}</text></svg>`;
}

function deviceInner(dev, lamp) {
  switch (dev.kind) {
    case "NMOS": case "PMOS": case "NPN":
      return `<div class="node-title">${dev.kind}</div>${mosArt(dev.kind)}`;
    case "DIODE":
      return `<div class="node-title">DIODE</div>${diodeArt()}`;
    case "PULLUP": return `<div class="node-title">PULL</div>${pullArt(true)}`;
    case "PULLDOWN": return `<div class="node-title">PULL</div>${pullArt(false)}`;
    case "VDD": return `<div class="node-title term-vdd">VDD</div><div class="node-lamp on-static">1</div>`;
    case "GND": return `<div class="node-title">GND</div><div class="node-lamp">0</div>`;
    case "IN":
      return `<div class="node-title">${dev.name ?? "IN"}</div><div class="node-lamp">${lamp ? "1" : "0"}</div>`;
    case "PROBE":
      return `<div class="node-title">${dev.name ?? "OUT"}</div><div class="node-lamp">${lamp ?? "?"}</div>`;
    default: return dev.kind;
  }
}

// ---------- controller ----------
export function createCmosUI(deps) {
  const { $, save, persistSave } = deps;
  const cmosSave = () => {
    save.cmos ??= { unlocked: 1, stars: {}, playground: null };
    return save.cmos;
  };
  const S = {
    levelIndex: 0,
    playground: false,
    devices: {},
    segs: {},
    inputStates: {}, // IN device id -> 0|1
    inIds: [],       // IN device ids in level input order
    probeIds: [],    // PROBE device ids in level probe order
    selected: null,  // { kind: 'dev'|'seg', id }
    pending: null,   // { dev, pin }
    lastResults: null,
    spawn: 0,
    seq: 1,
  };
  let live = null;

  const level = () => LEVELS_CMOS[S.levelIndex];
  const isPlayground = () => S.playground;

  function newId(prefix) { return `${prefix}${S.seq++}`; }

  function addDeviceUI(kind, x, y, extra = {}) {
    const id = newId("c");
    S.devices[id] = { id, kind, x, y, ...extra };
    if (kind === "IN") S.inputStates[id] = 0;
    return S.devices[id];
  }

  function loadLevel(index) {
    S.playground = false;
    S.levelIndex = Math.max(0, Math.min(LEVELS_CMOS.length - 1, index));
    S.devices = {}; S.segs = {}; S.inputStates = {};
    S.inIds = []; S.probeIds = [];
    S.selected = null; S.pending = null; S.lastResults = null;
    S.spawn = 0; S.seq = 1;
    const lv = level();
    lv.inputs.forEach((name, i) => {
      const d = addDeviceUI("IN", 30, 60 + i * 110, { locked: true, name });
      S.inIds.push(d.id);
    });
    lv.probes.forEach((name, i) => {
      const d = addDeviceUI("PROBE", W - 92 - 30, 60 + i * 110, { locked: true, name });
      S.probeIds.push(d.id);
    });
    addDeviceUI("VDD", 30, 8, { locked: true, name: "VDD" });
    addDeviceUI("GND", 30, 480, { locked: true, name: "GND" });
    if (lv.prefill) {
      // (reserved for CMOS debug levels; same key shape as gate prefill)
      const keyToId = {};
      S.inIds.forEach((id, i) => (keyToId[`in${i}`] = id));
      S.probeIds.forEach((id, i) => (keyToId[`out${i}`] = id));
      for (const n of lv.prefill.nodes ?? []) {
        const d = addDeviceUI(n.type, n.x, n.y, {});
        keyToId[n.key] = d.id;
      }
      void keyToId;
    }
    renderAll();
  }

  function loadPlayground() {
    S.playground = true;
    S.selected = null; S.pending = null; S.lastResults = null;
    S.inIds = []; S.probeIds = []; S.inputStates = {};
    S.spawn = 0; S.seq = 1;
    const saved = cmosSave().playground;
    if (saved) {
      S.devices = saved.devices ?? {};
      S.segs = saved.segs ?? {};
      for (const d of Object.values(S.devices)) {
        if (d.kind === "IN") { S.inputStates[d.id] = d.value ? 1 : 0; S.inIds.push(d.id); }
        if (d.kind === "PROBE") S.probeIds.push(d.id);
      }
      let max = 0;
      for (const id of [...Object.keys(S.devices), ...Object.keys(S.segs)]) {
        const m = /^c(\d+)$/.exec(id);
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
      if (d.kind === "IN") d.value = S.inputStates[d.id] ? 1 : 0;
    }
    cmosSave().playground = { devices: S.devices, segs: S.segs };
    persistSave(save);
  }

  // ----- palette -----
  function paletteKinds() {
    if (isPlayground()) return [...CMOS_PARTS, "VDD", "GND", "IN", "PROBE"];
    return CMOS_PARTS;
  }
  function usedCount(kind) {
    return Object.values(S.devices).filter((d) => d.kind === kind).length;
  }
  function renderPalette() {
    const el = $("#palette");
    el.innerHTML = "";
    $("#palette-label").textContent = isPlayground() ? "Parts (all unlocked)" : "Parts (this level's budget)";
    $("#palette-hint").textContent = "VDD/GND rails + IN/PROBE terminals are pre-placed — wire up your transistors.";
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
        (isPlayground() || available ? (remaining !== Infinity ? `<span class="pal-count">${remaining} left</span>` : "") : `<span class="pal-count">locked</span>`);
      btn.disabled = !available || remaining <= 0;
      btn.title = !available ? `${kind} isn't part of this level` : `Add ${kind}`;
      btn.setAttribute("aria-label", `Add ${kind}`);
      btn.addEventListener("click", () => {
        if (!isPlayground() && usedCount(kind) >= (level().allowed[kind] ?? 0)) return;
        const { w, h } = CMOS_SIZE[kind];
        // grid placement so fresh devices never bury each other's pins
        const gx = S.spawn % 5, gy = Math.floor(S.spawn / 5) % 3;
        S.spawn++;
        const x = Math.min(W - w - 10, 180 + gx * 140);
        const y = Math.min(H - h - 10, 110 + gy * 130);
        const d = addDeviceUI(kind, x, y, {});
        if (kind === "IN") S.inIds.push(d.id);
        if (kind === "PROBE") S.probeIds.push(d.id);
        S.selected = { kind: "dev", id: d.id };
        afterMutation();
      });
      el.appendChild(btn);
    }
  }

  // ----- live sim -----
  function buildLive() {
    const { net, endpointNet } = buildEngineNet(S.devices, S.segs);
    const sim = simulateCmos(net, S.inputStates);
    return { sim, endpointNet, net };
  }
  function segState(seg) {
    if (!live) return "X";
    const nid = live.endpointNet[`${seg.from.dev}:${seg.from.pin}`];
    return live.sim.states[nid]?.v ?? "X";
  }
  function probeLamp(devId) {
    if (!live) return "?";
    const dev = S.devices[devId];
    const pin = dev.kind === "PROBE" ? "A" : "Y";
    const v = live.sim.states[live.endpointNet[`${devId}:${pin}`]]?.v;
    return v === 1 ? "1" : v === 0 ? "0" : "?";
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

  // ----- devices -----
  function renderDevices() {
    const layer = $("#nodes");
    layer.innerHTML = "";
    for (const dev of Object.values(S.devices)) {
      const { w, h } = CMOS_SIZE[dev.kind];
      const div = document.createElement("div");
      div.className = `node cdev kind-${dev.kind}` +
        (S.selected?.kind === "dev" && S.selected.id === dev.id ? " selected" : "") +
        (dev.kind === "IN" && S.inputStates[dev.id] ? " on" : "") +
        (dev.kind === "PROBE" && probeLamp(dev.id) === "1" ? " on" : "");
      div.style.left = `${dev.x}px`;
      div.style.top = `${dev.y}px`;
      div.style.width = `${w}px`;
      div.style.height = `${h}px`;
      div.dataset.id = dev.id;
      if (dev.name) div.dataset.name = dev.name;
      div.tabIndex = 0;
      div.setAttribute("role", "button");
      div.setAttribute("aria-label", `${dev.kind} ${dev.name ?? dev.id}`);
      div.innerHTML = deviceInner(dev, dev.kind === "IN" ? S.inputStates[dev.id] : dev.kind === "PROBE" ? probeLamp(dev.id) : 0);
      for (const p of devicePins(dev.kind)) {
        const a = pinAnchor(dev.kind, p);
        const b = document.createElement("button");
        const isPending = S.pending?.dev === dev.id && S.pending?.pin === p;
        b.className = "pin cpin" + (isPending ? " pending" : "") + (S.pending && !isPending ? " compat" : "");
        b.dataset.dev = dev.id;
        b.dataset.pin = p;
        b.setAttribute("aria-label", `Pin ${p} of ${dev.name ?? dev.id}. Activate to start or finish a wire.`);
        b.style.left = `${a.x - PIN_R}px`;
        b.style.top = `${a.y - PIN_R}px`;
        b.addEventListener("pointerdown", (e) => { e.stopPropagation(); onPin(dev.id, p); });
        b.addEventListener("click", (e) => { e.stopPropagation(); onPin(dev.id, p); });
        div.appendChild(b);
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
        if (e.target.closest(".pin") || e.target.closest(".node-del")) return;
        startDrag(e, dev.id);
      });
      div.addEventListener("click", (e) => {
        if (e.target.closest(".pin") || e.target.closest(".node-del")) return;
        if (dev.kind === "IN") {
          S.inputStates[dev.id] = S.inputStates[dev.id] ? 0 : 1;
          afterMutation();
        } else {
          S.selected = { kind: "dev", id: dev.id };
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
    const { h } = CMOS_SIZE[dev.kind];
    drag = { devId, startX: e.clientX, startY: e.clientY, origX: dev.x, origY: dev.y, moved: false };
    const scale = $("#canvas").clientWidth / W;
    const onMove = (ev) => {
      if (!drag) return;
      const nx = Math.round(Math.min(W - CMOS_SIZE[dev.kind].w, Math.max(0, drag.origX + (ev.clientX - drag.startX) / scale)));
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

  // ----- wiring (any pin order; segs merge nets) -----
  function onPin(devId, pin) {
    if (S.pending && (S.pending.dev !== devId || S.pending.pin !== pin)) {
      const from = S.pending;
      S.pending = null;
      const dup = Object.values(S.segs).some((s) =>
        (s.from.dev === from.dev && s.from.pin === from.pin && s.to.dev === devId && s.to.pin === pin) ||
        (s.from.dev === devId && s.from.pin === pin && s.to.dev === from.dev && s.to.pin === from.pin));
      if (from.dev === devId && from.pin === pin) {
        setStatus("Cannot wire a pin to itself.");
      } else if (dup) {
        setStatus("Already wired.");
      } else {
        const id = newId("c");
        // avoid id collision with devices: segs share the counter; prefix w
        const wid = `w${id.slice(1)}`;
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
      const v = segState(s);
      const cls = v === 1 ? "v1" : v === 0 ? "v0" : "vX";
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", wireD(p1, p2));
      path.setAttribute("class", `wire ${cls}` + (S.selected?.kind === "seg" && S.selected.id === s.id ? " selected" : ""));
      path.dataset.id = s.id;
      path.addEventListener("click", (e) => {
        e.stopPropagation();
        S.selected = { kind: "seg", id: s.id };
        renderSegs(); renderDevices();
        $("#delete-btn").disabled = false;
      });
      svg.appendChild(path);
      const hit = document.createElementNS("http://www.w3.org/2000/svg", "path");
      hit.setAttribute("d", wireD(p1, p2));
      hit.setAttribute("class", "wire-hit");
      hit.dataset.id = s.id;
      hit.addEventListener("click", (e) => {
        e.stopPropagation();
        S.selected = { kind: "seg", id: s.id };
        renderSegs(); renderDevices();
        $("#delete-btn").disabled = false;
      });
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

  function currentLevel() { return LEVELS_CMOS[S.levelIndex]; }

  function probeNetIds() {
    if (!live) return [];
    return S.probeIds.map((id) => {
      const dev = S.devices[id];
      return live.endpointNet[`${id}:${dev.kind === "PROBE" ? "A" : "Y"}`];
    });
  }

  function renderSpec() {
    const isChallenge = !isPlayground();
    $("#spec-challenge").hidden = !isChallenge;
    $("#spec-sandbox").hidden = isChallenge;
    $("#hint-details").hidden = true;
    document.querySelector("#spec-challenge .check-row").style.display = isChallenge ? "" : "none";
    document.querySelector("#spec-challenge .table-wrap").style.display = "";
    document.querySelector("#spec-challenge h3").style.display = "";
    document.querySelector("#xfer-wrap").style.display = "none";
    if (isChallenge) {
      const lv = currentLevel();
      $("#level-name").textContent = `C${S.levelIndex + 1}. ${lv.name}`;
      $("#level-brief").textContent = lv.briefing;
      const budget = Object.entries(lv.allowed).map(([t, n]) => `${t}×${n}`).join(" · ") || "rails only";
      const used = Object.values(S.devices).filter((d) => d.kind !== "IN" && d.kind !== "PROBE" && d.kind !== "VDD" && d.kind !== "GND").length;
      $("#level-budget").textContent = `Budget: ${budget} · Par: ${lv.par} parts · Parts used: ${used}`;
      renderCmosTable();
    } else {
      const ndev = Object.keys(S.devices).length, nseg = Object.keys(S.segs).length;
      $("#sandbox-info").textContent = `Devices: ${ndev} · Wires: ${nseg}${
        live?.sim.short ? " · 🔥 SHORT CIRCUIT" : live?.sim.status === "FLOAT" ? " · ? floating nets" : ""}`;
    }
    renderExprHide();
  }
  function renderExprHide() {
    // gate-mode expression view doesn't apply to nets; hide it here
    $("#expr-view").hidden = true;
    const t = $("#expr-toggle");
    t.setAttribute("aria-pressed", "false");
    t.classList.remove("active");
    t.style.display = "none";
  }

  function liveProbeValues() {
    // sequential carry for stateful levels, mirroring evaluateCmos
    const lv = currentLevel();
    const vals = [];
    let carry = null;
    const { net, endpointNet } = buildEngineNet(S.devices, S.segs);
    for (const t of lv.tests) {
      const inMap = {};
      S.inIds.forEach((id, i) => { inMap[id] = t.in[i] ? 1 : 0; });
      const sim = simulateCmos(net, inMap, lv.stateful && carry ? { carry } : {});
      if (lv.stateful) carry = Object.fromEntries(Object.entries(sim.states).map(([k, s]) => [k, { ...s }]));
      vals.push(S.probeIds.map((id) => {
        const dev = S.devices[id];
        const nid = endpointNet[`${id}:${dev.kind === "PROBE" ? "A" : "Y"}`];
        const v = sim.states[nid]?.v;
        return v === 1 ? "1" : v === 0 ? "0" : "?";
      }));
    }
    return vals;
  }

  function renderCmosTable() {
    const lv = currentLevel();
    const table = $("#truth-table");
    table.innerHTML = "";
    const head = document.createElement("tr");
    for (const n of lv.inputs) { const th = document.createElement("th"); th.textContent = n; head.appendChild(th); }
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
    const liveVals = liveProbeValues();
    const resByKey = new Map((S.lastResults ?? []).map((r) => [r.in.join(""), r]));
    lv.tests.forEach((t, ri) => {
      const tr = document.createElement("tr");
      for (const b of t.in) { const td = document.createElement("td"); td.textContent = String(b); tr.appendChild(td); }
      for (const b of t.out) { const td = document.createElement("td"); td.textContent = String(b); tr.appendChild(td); }
      const td = document.createElement("td");
      td.textContent = liveVals[ri].join(" ");
      td.className = "live-cell";
      tr.appendChild(td);
      if (S.lastResults) {
        const rr = resByKey.get(t.in.join(""));
        const td2 = document.createElement("td");
        td2.textContent = rr?.ok ? "✓" : "✗";
        td2.className = rr?.ok ? "ok" : "bad";
        tr.appendChild(td2);
      }
      table.appendChild(tr);
    });
    const res = $("#check-results");
    if (live?.sim.short) {
      res.innerHTML = `<span class="fail">🔥 SHORT CIRCUIT — a path connects VDD to GND. Break it before checking.</span>`;
    } else if (live?.sim.status === "FLOAT") {
      res.innerHTML = `<span class="warn">? Floating nets (amber) — every path needs a drive. Add a pull or complete the wiring.</span>`;
    } else if (!S.lastResults) {
      res.innerHTML = `<span class="muted">Press “Check solution” to run all ${lv.tests.length} case(s).</span>`;
    }
  }

  function checkSolution() {
    const lv = currentLevel();
    const { net } = buildEngineNet(S.devices, S.segs);
    const inMap = S.inIds;
    const probes = probeNetIds();
    const { passed, results, short } = evaluateCmos(net, lv, inMap, probes);
    S.lastResults = results;
    const used = countCmosParts(net);
    const total = Object.values(used).reduce((a, b) => a + b, 0);
    const res = $("#check-results");
    const fails = results.filter((r) => !r.ok);
    if (passed) {
      const stars = starsFor(lv, total);
      res.innerHTML = `<span class="pass">✓ Solved! ${"★".repeat(stars)}${"☆".repeat(3 - stars)} (${total} parts, par ${lv.par})</span>`;
      const cs = cmosSave();
      cs.stars[lv.id] = Math.max(cs.stars[lv.id] ?? 0, stars);
      cs.unlocked = Math.max(cs.unlocked, Math.min(LEVELS_CMOS.length, S.levelIndex + 2));
      persistSave(save);
      renderLevelList();
      setStatus(`Level solved with ${stars} stars.`);
      if (S.levelIndex + 1 < LEVELS_CMOS.length) {
        const btn = document.createElement("button");
        btn.className = "btn primary";
        btn.textContent = "Next level →";
        btn.addEventListener("click", () => loadLevel(S.levelIndex + 1));
        res.appendChild(document.createTextNode(" "));
        res.appendChild(btn);
      }
    } else {
      const msg = short
        ? "a short-circuit was detected. Break the VDD–GND path first."
        : `${fails.length} of ${results.length} cases fail. First fail: in=${fails[0].in.join("")} expected=${fails[0].expected.join("")} got=${fails[0].actual.join("")} (${fails[0].status}).`;
      res.innerHTML = `<span class="fail">✗ Not yet — ${msg}</span>`;
      setStatus("Check failed.");
    }
    renderCmosTable();
    renderPalette();
  }

  // ----- level list -----
  function renderLevelList() {
    const list = $("#level-list");
    list.innerHTML = "";
    const cs = cmosSave();
    const pg = document.createElement("button");
    pg.className = "level-card playground" + (isPlayground() ? " active" : "");
    pg.innerHTML = `<span class="lvl-num">⚗</span><span class="lvl-name">Playground</span><span class="lvl-stars"></span><span class="lvl-tag">free parts</span>`;
    pg.setAttribute("aria-label", "CMOS playground with free parts");
    pg.addEventListener("click", loadPlayground);
    list.appendChild(pg);
    const h = document.createElement("div");
    h.className = "lvl-chapter";
    h.textContent = "CMOS Lab";
    list.appendChild(h);
    LEVELS_CMOS.forEach((lv, i) => {
      const locked = i + 1 > cs.unlocked && !save.freePlay;
      const card = document.createElement("button");
      card.className = "level-card" + (!isPlayground() && i === S.levelIndex ? " active" : "");
      card.disabled = locked;
      const stars = cs.stars[lv.id] ?? 0;
      card.innerHTML = `<span class="lvl-num">${locked ? "🔒" : `C${i + 1}`}</span>
        <span class="lvl-name">${lv.name}</span>
        <span class="lvl-stars">${"★".repeat(stars)}${"☆".repeat(3 - stars)}</span>
        <span class="lvl-tag">${lv.tag}</span>`;
      card.setAttribute("aria-label", `${locked ? "Locked" : ""} CMOS level ${i + 1}: ${lv.name}`);
      if (!locked) card.addEventListener("click", () => loadLevel(i));
      list.appendChild(card);
    });
    $("#mode-challenge").classList.remove("active");
    $("#mode-sandbox").classList.remove("active");
    $("#mode-cmos").classList.add("active");
  }

  function renderAll() {
    live = buildLive();
    renderLevelList();
    renderPalette();
    renderDevices();
    renderSegs();
    renderSpec();
    $("#delete-btn").disabled = !S.selected;
    const place = isPlayground() ? "CMOS Playground" : `CMOS level ${S.levelIndex + 1} of ${LEVELS_CMOS.length}`;
    setStatus(`${place}. Click any pin, then another pin, to wire.`);
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
      loadLevel(Math.min(index, cmosSave().unlocked - 1));
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
    levelCount: () => LEVELS_CMOS.length,
    _state: S, // test seam
  };
}
