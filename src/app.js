/** Circuit Coder — browser UI. Depends on engine.js, levels.js, store.js. */
import {
  GATE_DEFS,
  createCircuit,
  addNode,
  removeNode,
  addWire,
  setInputWire,
  removeWire,
  simulate,
  evaluateLevel,
  countGates,
  serializeCircuit,
  deserializeCircuit,
} from "./engine.js";
import { LEVELS, starsFor } from "./levels.js";
import { LEVELS_CLOCKED } from "./clocked-levels.js";
import { simulateClocked, evaluateClocked } from "./clocked.js";
import { loadSave, persistSave } from "./store.js";
import { gateSVG, sevenSegSVG } from "./gates.js";
import { outputExprs } from "./synth.js";
import { kmapString } from "./minimize.js";
import { createCmosUI } from "./cmos-ui.js";
import { createAnalogUI } from "./analog-ui.js";

const W = 960;
const H = 540;
const NODE_W = 92;

const $ = (sel) => document.querySelector(sel);

const save = loadSave();
let showExpr = false;
let cmosUI = null;
const cmos = () => (cmosUI ??= createCmosUI({
  $, save, persistSave, syncTabs,
  renderPicker: renderSandboxPicker,
  onChallenge: () => { state.mode = "cmos"; },
}));
let analogUI = null;
const analog = () => (analogUI ??= createAnalogUI({
  $, save, persistSave, syncTabs,
  renderPicker: renderSandboxPicker,
  onChallenge: () => { state.mode = "analog"; },
}));
// Which bench owns the shared shell right now. Challenges map to their
// bench; sandbox maps to the picked bench (master sandbox).
const SANDBOX_BENCHES = [
  { id: "gates", sym: "&", name: "Gates bench", tag: "logic gates, everything unlocked" },
  { id: "cmos", sym: "T", name: "Transistor bench", tag: "CMOS parts, everything unlocked" },
  { id: "analog", sym: "~", name: "Analog bench", tag: "op-amps, everything unlocked" },
  { id: "clocked", sym: "◷", name: "Clocked bench", tag: "flops, clocks, traces" },
];
const activeBench = () => {
  if (state.mode === "sandbox") return save.sandboxBench;
  if (state.mode === "cmos") return "cmos";
  if (state.mode === "analog") return "analog";
  if (state.mode === "clocked") return "clocked";
  return "gates";
};
const inClockedBench = () => activeBench() === "clocked";
function renderSandboxPicker() {
  const list = $("#level-list");
  list.innerHTML = "";
  const h = document.createElement("div");
  h.className = "lvl-chapter";
  h.textContent = "Sandbox bench";
  list.appendChild(h);
  for (const b of SANDBOX_BENCHES) {
    const card = document.createElement("button");
    card.className = "level-card" + (save.sandboxBench === b.id ? " active" : "");
    card.dataset.bench = b.id;
    card.innerHTML = `<span class="lvl-num">${b.sym}</span>
      <span class="lvl-name">${b.name}</span>
      <span class="lvl-stars"></span>
      <span class="lvl-tag">${b.tag}</span>`;
    card.setAttribute("aria-label", `Sandbox on the ${b.name}`);
    card.addEventListener("click", () => {
      save.sandboxBench = b.id;
      persistSave(save);
      loadSandbox();
    });
    list.appendChild(card);
  }
}
const state = {
  mode: "challenge",
  levelIndex: 0,
  circuit: createCircuit(),
  inputStates: {},
  inputIds: [],
  outputIds: [],
  clockIds: [],
  selected: null, // { kind: 'node'|'wire', id }
  pendingWire: null, // { from, fromPin? } | { to, toPin }
  lastResults: null,
  spawnOffset: 0,
  clockTick: 0,
  clockTraces: null,
};
let clockTimer = null;

const PIN_GEOM = {
  out: { dx: NODE_W, dy: null }, // dy = h/2 computed
  in: (h, k, i) => ({ dx: 0, dy: Math.round((h * (i + 1)) / (k + 1)) }),
};

function nodeHeight(node) {
  const k = GATE_DEFS[node.type].inputs;
  if (node.type === "INPUT" || node.type === "OUTPUT") return 52;
  return k >= 2 ? 68 : 52;
}

function pinXY(node, kind, pin = 0) {
  const h = nodeHeight(node);
  if (kind === "out") {
    const nOut = GATE_DEFS[node.type].outputs;
    const y = nOut <= 1 ? Math.round(h / 2) : Math.round((h * (pin + 1)) / (nOut + 1));
    return { x: node.x + NODE_W, y: node.y + y };
  }
  const k = GATE_DEFS[node.type].inputs;
  const p = PIN_GEOM.in(h, k, pin);
  return { x: node.x + p.dx, y: node.y + p.dy };
}

// ---------- Level / circuit setup ----------

function currentLevel() {
  return LEVELS[state.levelIndex];
}

function loadLevel(index) {
  stopClock();
  state.levelIndex = Math.max(0, Math.min(LEVELS.length - 1, index));
  state.mode = "challenge";
  state.selected = null;
  state.pendingWire = null;
  state.lastResults = null;
  const level = currentLevel();
  const c = createCircuit();
  state.inputIds = [];
  state.outputIds = [];
  state.inputStates = {};
  level.inputs.forEach((name, i) => {
    const n = addNode(c, "INPUT", 30, 50 + i * 100, { locked: true, name });
    state.inputIds.push(n.id);
    state.inputStates[n.id] = 0;
  });
  level.outputs.forEach((name, i) => {
    const n = addNode(c, "OUTPUT", W - NODE_W - 30, 50 + i * 100, { locked: true, name });
    state.outputIds.push(n.id);
  });
  // Debug-ward prefill: pre-placed (possibly buggy) gates + wires.
  // Placed directly (bypassing validation) since level data is trusted —
  // e.g. a self-loop wire that the UI could never create.
  if (level.prefill) {
    const keyToId = {};
    state.inputIds.forEach((id, i) => (keyToId[`in${i}`] = id));
    state.outputIds.forEach((id, i) => (keyToId[`out${i}`] = id));
    for (const n of level.prefill.nodes ?? []) {
      const node = addNode(c, n.type, n.x, n.y, {});
      keyToId[n.key] = node.id;
    }
    for (const w of level.prefill.wires ?? []) {
      const wid = `w${c.seq++}`;
      c.wires[wid] = {
        id: wid,
        from: keyToId[w.from],
        fromPin: 0,
        to: keyToId[w.to],
        toPin: w.toPin ?? 0,
      };
    }
  }
  // Spread terminals vertically centered when few
  state.circuit = c;
  state.spawnOffset = 0;
  renderAll();
}

function clockedLevel() {
  return LEVELS_CLOCKED[state.levelIndex];
}

function clockTicks() {
  return state.mode === "clocked" ? clockedLevel().ticks : 8;
}

function loadClocked(index) {
  stopClock();
  state.levelIndex = Math.max(0, Math.min(LEVELS_CLOCKED.length - 1, index));
  state.mode = "clocked";
  state.selected = null;
  state.pendingWire = null;
  state.lastResults = null;
  state.clockTick = 0;
  state.clockTraces = null;
  const level = clockedLevel();
  const c = createCircuit();
  state.inputIds = [];
  state.outputIds = [];
  state.clockIds = [];
  state.inputStates = {};
  level.inputs.forEach((name, i) => {
    const n = addNode(c, "INPUT", 30, 50 + i * 100, { locked: true, name });
    state.inputIds.push(n.id);
    state.inputStates[n.id] = 0;
  });
  (level.clocks ?? []).forEach((name, i) => {
    const n = addNode(c, "CLOCK", 30, 400, { locked: true, name, period: level.period ?? 2 });
    state.clockIds.push(n.id);
  });
  level.probes.forEach((name, i) => {
    const n = addNode(c, "OUTPUT", W - NODE_W - 30, 50 + i * 100, { locked: true, name });
    state.outputIds.push(n.id);
  });
  state.circuit = c;
  state.spawnOffset = 0;
  renderAll();
}

/** Map level input/clock/probe names to node ids. */
function clockNameToId() {
  const lv = clockedLevel();
  const m = {};
  lv.inputs.forEach((n, i) => { m[n] = state.inputIds[i]; });
  (lv.clocks ?? []).forEach((n, i) => { m[n] = state.clockIds[i]; });
  lv.probes.forEach((n, i) => { m[n] = state.outputIds[i]; });
  return m;
}

function loadSandbox() {
  state.mode = "sandbox";
  save.mode = "sandbox";
  persistSave(save);
  stopClock();
  if (save.sandboxBench === "cmos") { cmos().enterPlayground(); return; }
  if (save.sandboxBench === "analog") { analog().enterPlayground(); return; }
  if (save.sandboxBench === "clocked") {
    state.selected = null;
    state.pendingWire = null;
    state.lastResults = null;
    state.inputIds = [];
    state.outputIds = [];
    state.clockIds = [];
    state.inputStates = {};
    state.clockTick = 0;
    state.clockTraces = null;
    state.circuit = save.sandboxClock ? deserializeCircuit(save.sandboxClock) : createCircuit();
    for (const n of Object.values(state.circuit.nodes)) {
      if (n.type === "INPUT") state.inputStates[n.id] = n.value ? 1 : 0;
    }
    state.spawnOffset = 0;
    renderAll();
    return;
  }
  state.selected = null;
  state.pendingWire = null;
  state.lastResults = null;
  state.inputIds = [];
  state.outputIds = [];
  state.inputStates = {};
  state.circuit = save.sandbox ? deserializeCircuit(save.sandbox) : createCircuit();
  // discover INPUT nodes for live toggles
  for (const n of Object.values(state.circuit.nodes)) {
    if (n.type === "INPUT") {
      state.inputStates[n.id] = n.value ? 1 : 0;
    }
  }
  state.spawnOffset = 0;
  renderAll();
}

function persistSandbox() {
  if (state.mode !== "sandbox") return;
  if (save.sandboxBench === "clocked") {
    save.sandboxClock = serializeCircuit(state.circuit);
  } else {
    save.sandbox = serializeCircuit(state.circuit);
  }
  persistSave(save);
}

// ---------- Palette ----------

// Every buildable gate. In challenges INPUT/OUTPUT terminals are pre-placed,
// so the palette offers gates only; disallowed ones show disabled instead of
// vanishing (an almost-empty palette looks broken).
const ALL_GATES = ["AND", "OR", "NOT", "NAND", "NOR", "XOR", "XNOR"];
const ALL_PARTS = ["INPUT", "OUTPUT", ...ALL_GATES, "PROBE"];
const CLOCKED_PARTS = ["DFF", "TFF", "DLATCH", "DELAY", "CLOCK"];

function paletteEntries() {
  if (state.mode === "sandbox") {
    return save.sandboxBench === "clocked"
      ? [...ALL_PARTS, ...CLOCKED_PARTS]
      : ALL_PARTS;
  }
  if (state.mode === "clocked") {
    // CLOCK terminals are pre-placed; the button shows locked for honesty.
    return [...Object.keys(clockedLevel().allowed), "PROBE", "CLOCK"];
  }
  // PROBE is a free measurement tool everywhere: unlimited, unbudgeted.
  return [...ALL_GATES, "PROBE"];
}

function usedCount(type) {
  return Object.values(state.circuit.nodes).filter((n) => n.type === type).length;
}

function renderPalette() {
  const el = $("#palette");
  el.innerHTML = "";
  $("#palette-label").textContent = state.mode === "sandbox" ? "Parts (all unlocked)" : "Parts (this level's budget)";
  $("#palette-hint").textContent = inClockedBench()
    ? "IN/CLK/OUT terminals are pre-placed — wire them up. Click a CLOCK to change its period."
    : "INPUT/OUTPUT terminals are pre-placed on the left/right — wire them up. Clip a free PROBE onto any output to watch it live.";
  $("#expr-toggle").style.display = "";
  for (const type of paletteEntries()) {
    const btn = document.createElement("button");
    btn.className = "pal-btn";
    btn.dataset.type = type;
    let remaining = Infinity;
    let available = true;
    if ((state.mode === "challenge" || state.mode === "clocked") && type !== "PROBE") {
      const budget = (state.mode === "clocked" ? clockedLevel().allowed : currentLevel().allowed)[type] ?? 0;
      available = budget > 0;
      remaining = budget - usedCount(type);
    }
    const def = GATE_DEFS[type];
    const countText =
      (state.mode === "challenge" || state.mode === "clocked") && !available
        ? `<span class="pal-count">locked</span>`
        : remaining !== Infinity
          ? `<span class="pal-count">${remaining} left</span>`
          : "";
    btn.innerHTML = `<span class="pal-sym">${def.symbol}</span><span class="pal-name">${type}</span>${countText}`;
    btn.disabled = !available || remaining <= 0;
    btn.title = !available
      ? `${type} isn't part of this level`
      : remaining <= 0
        ? "Budget exhausted"
        : `Add ${type}`;
    btn.setAttribute("aria-label", `Add ${type} gate`);
    btn.addEventListener("click", () => addGate(type));
    el.appendChild(btn);
  }
}

function addGate(type) {
  if ((state.mode === "challenge" || state.mode === "clocked") && type !== "PROBE") {
    const budget = (state.mode === "clocked" ? clockedLevel().allowed : currentLevel().allowed)[type] ?? 0;
    if (usedCount(type) >= budget) return;
  }
  const gx = state.spawnOffset % 5, gy = Math.floor(state.spawnOffset / 5) % 3;
  state.spawnOffset++;
  const n = addNode(state.circuit, type,
    Math.min(W - NODE_W - 10, 200 + gx * 140),
    Math.min(H - 78, 110 + gy * 130));
  if (type === "INPUT") {
    state.inputStates[n.id] = 0;
    if (state.mode === "sandbox") state.inputIds.push(n.id);
  }
  if (type === "OUTPUT" && state.mode === "sandbox") state.outputIds.push(n.id);
  state.selected = { kind: "node", id: n.id };
  afterMutation();
}

// ---------- Nodes & wires rendering ----------

function renderNodes() {
  const layer = $("#nodes");
  layer.innerHTML = "";
  for (const node of Object.values(state.circuit.nodes)) {
    const h = nodeHeight(node);
    const div = document.createElement("div");
    div.className = `node type-${node.type}${state.selected?.kind === "node" && state.selected.id === node.id ? " selected" : ""}`;
    div.style.left = `${node.x}px`;
    div.style.top = `${node.y}px`;
    div.style.height = `${h}px`;
    div.dataset.id = node.id;
    div.tabIndex = 0;
    div.setAttribute("role", "button");
    div.setAttribute(
      "aria-label",
      `${node.type} ${node.name ?? node.id}${node.type === "INPUT" ? `, value ${state.inputStates[node.id] ? 1 : 0}, activate to toggle` : ""}`
    );

    const def = GATE_DEFS[node.type];
    let inner;
    if (node.type === "INPUT") {
      inner = `<div class="node-title">${node.name ?? "IN"}</div><div class="node-lamp">${state.inputStates[node.id] ? "1" : "0"}</div>`;
      div.classList.toggle("on", !!state.inputStates[node.id]);
    } else if (node.type === "OUTPUT") {
      const v = liveSim ? liveSim.nodeOutputs[node.id] ?? 0 : 0;
      inner = `<div class="node-title">${node.name ?? "OUT"}</div><div class="node-lamp">${v ? "1" : "0"}</div>`;
      div.classList.toggle("on", !!v);
    } else if (node.type === "PROBE") {
      const v = liveSim ? liveSim.nodeOutputs[node.id] ?? 0 : 0;
      div.classList.add("tprobe");
      inner = `<div class="node-title">PROBE</div><div class="node-lamp probe-led">${v ? "1" : "0"}</div>`;
      div.classList.toggle("on", !!v);
    } else {
      div.classList.add("tgate");
      inner = `<div class="node-title">${node.name ?? def.label}</div>${gateSVG(node.type)}`;
    }
    div.innerHTML = inner;

    // pins (24px targets; centered on the pin point)
    const PIN_R = 12;
    const nOut = def.outputs;
    for (let o = 0; o < nOut; o++) {
      const oy = nOut <= 1
        ? Math.round(h / 2)
        : Math.round((h * (o + 1)) / (nOut + 1));
      const p = document.createElement("button");
      p.className =
        "pin out" +
        (state.pendingWire?.from === node.id && (state.pendingWire?.fromPin ?? 0) === o ? " pending" : "") +
        (state.pendingWire?.to ? " compat" : "");
      p.dataset.node = node.id;
      p.dataset.kind = "out";
      p.dataset.pin = String(o);
      p.setAttribute("aria-label", `Output ${o} of ${node.name ?? node.id}. Activate to start or finish a wire.`);
      p.style.top = `${oy - PIN_R}px`;
      p.style.left = `${NODE_W - PIN_R}px`;
      p.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        onOutputPin(node.id, o);
      });
      p.addEventListener("click", (e) => {
        e.stopPropagation();
        onOutputPin(node.id, o);
      });
      div.appendChild(p);
    }
    for (let i = 0; i < def.inputs; i++) {
      const g = PIN_GEOM.in(h, def.inputs, i);
      const p = document.createElement("button");
      p.className =
        "pin in" +
        (state.pendingWire?.to === node.id && state.pendingWire?.toPin === i
          ? " pending"
          : "") +
        (state.pendingWire?.from ? " compat" : "");
      p.dataset.node = node.id;
      p.dataset.kind = "in";
      p.dataset.pin = String(i);
      p.setAttribute("aria-label", `Input ${i} of ${node.name ?? node.id}. Activate to start or finish a wire.`);
      p.style.top = `${g.dy - PIN_R}px`;
      p.style.left = `${-PIN_R}px`;
      p.addEventListener("pointerup", (e) => {
        e.stopPropagation();
        onInputPin(node.id, i);
      });
      p.addEventListener("click", (e) => {
        e.stopPropagation();
        onInputPin(node.id, i);
      });
      div.appendChild(p);
    }

    // delete badge for selected, unlocked nodes
    if (!node.locked && state.selected?.kind === "node" && state.selected.id === node.id) {
      const x = document.createElement("button");
      x.className = "node-del";
      x.textContent = "×";
      x.setAttribute("aria-label", `Delete ${node.type}`);
      x.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteNode(node.id);
      });
      div.appendChild(x);
    }

    // drag body + toggle for INPUT
    div.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".pin") || e.target.closest(".node-del")) return;
      startDrag(e, node.id);
    });
    div.addEventListener("click", (e) => {
      if (e.target.closest(".pin") || e.target.closest(".node-del")) return;
      if (node.type === "INPUT") toggleInput(node.id);
      else if (node.type === "CLOCK") {
        node.period = node.period >= 8 ? 2 : (node.period ?? 2) * 2;
        setStatus(`Clock period → ${node.period} ticks.`);
        afterMutation({ structural: false });
      } else {
        state.selected = { kind: "node", id: node.id };
        renderNodes();
      }
    });
    div.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (node.type === "INPUT") toggleInput(node.id);
        else if (node.type === "CLOCK") {
          node.period = node.period >= 8 ? 2 : (node.period ?? 2) * 2;
          setStatus(`Clock period → ${node.period} ticks.`);
          afterMutation({ structural: false });
        }
      }
    });
    layer.appendChild(div);
  }
}

let liveSim = null;

function wirePathD(a, b) {
  const dx = Math.max(30, Math.abs(b.x - a.x) / 2);
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
}

function renderWires() {
  const svg = $("#wires");
  // clear
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  for (const wire of Object.values(state.circuit.wires)) {
    const from = state.circuit.nodes[wire.from];
    const to = state.circuit.nodes[wire.to];
    if (!from || !to) continue;
    const a = pinXY(from, "out", wire.fromPin);
    const b = pinXY(to, "in", wire.toPin);
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", wirePathD(a, b));
    let v = liveSim ? liveSim.nodeOutputs[wire.from] ?? 0 : 0;
    if (wire.fromPin === 1 && (from.type === "DFF" || from.type === "TFF")) v = v ? 0 : 1;
    path.setAttribute("class", `wire v${v}` + (state.selected?.kind === "wire" && state.selected.id === wire.id ? " selected" : ""));
    path.dataset.id = wire.id;
    path.addEventListener("click", (e) => {
      e.stopPropagation();
      state.selected = { kind: "wire", id: wire.id };
      renderWires();
      renderNodes();
      updateDeleteBtn();
    });
    svg.appendChild(path);
    // invisible fat hit path
    const hit = document.createElementNS("http://www.w3.org/2000/svg", "path");
    hit.setAttribute("d", wirePathD(a, b));
    hit.setAttribute("class", "wire-hit");
    hit.dataset.id = wire.id;
    hit.addEventListener("click", (e) => {
      e.stopPropagation();
      state.selected = { kind: "wire", id: wire.id };
      renderWires();
      renderNodes();
      updateDeleteBtn();
    });
    svg.appendChild(hit);
  }
  // pending wire preview stub
  if (state.pendingWire) {
    const ghost = document.createElementNS("http://www.w3.org/2000/svg", "path");
    if (state.pendingWire.from) {
      const from = state.circuit.nodes[state.pendingWire.from];
      if (from) {
        const a = pinXY(from, "out", 0);
        ghost.setAttribute(
          "d",
          `M ${a.x} ${a.y} C ${a.x + 40} ${a.y}, ${a.x + 60} ${a.y + 30}, ${a.x + 80} ${a.y + 30}`
        );
        ghost.setAttribute("class", "wire pending-ghost");
        svg.appendChild(ghost);
      }
    } else if (state.pendingWire.to) {
      const to = state.circuit.nodes[state.pendingWire.to];
      if (to) {
        const b = pinXY(to, "in", state.pendingWire.toPin);
        ghost.setAttribute(
          "d",
          `M ${b.x - 80} ${b.y - 30} C ${b.x - 60} ${b.y - 30}, ${b.x - 40} ${b.y}, ${b.x} ${b.y}`
        );
        ghost.setAttribute("class", "wire pending-ghost");
        svg.appendChild(ghost);
      }
    }
  }
}

// ---------- Interaction ----------

let drag = null;

function startDrag(e, nodeId) {
  const node = state.circuit.nodes[nodeId];
  if (!node) return;
  const startX = e.clientX;
  const startY = e.clientY;
  const origX = node.x;
  const origY = node.y;
  drag = { nodeId, startX, startY, origX, origY, moved: false };
  const onMove = (ev) => {
    if (!drag) return;
    const scale = canvasScale();
    const nx = Math.round(Math.min(W - NODE_W, Math.max(0, drag.origX + (ev.clientX - drag.startX) / scale)));
    const ny = Math.round(Math.min(H - nodeHeight(node), Math.max(0, drag.origY + (ev.clientY - drag.startY) / scale)));
    if (nx !== node.x || ny !== node.y) {
      drag.moved = true;
      node.x = nx;
      node.y = ny;
      positionNodeEl(nodeId, nx, ny);
      renderWires();
    }
  };
  const onUp = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    if (drag && !drag.moved) {
      // treated as click (handled separately)
    }
    if (drag?.moved) afterMutation({ structural: false });
    drag = null;
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
}

function canvasScale() {
  const canvas = $("#canvas");
  return canvas.clientWidth / W;
}

/** Scale the fixed 960×540 stage to the displayed canvas width. */
function fitStage() {
  const canvas = $("#canvas");
  const stage = $("#stage");
  if (!canvas || !stage) return;
  stage.style.transform = `scale(${canvasScale()})`;
}

function positionNodeEl(nodeId, x, y) {
  const el = document.querySelector(`.node[data-id="${CSS.escape(nodeId)}"]`);
  if (el) {
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }
}

/**
 * Wiring works in either direction: click any pin (output or input) to start,
 * then click the other end to complete. Toggling the same pin cancels.
 */
function onOutputPin(nodeId, fromPin = 0) {
  if (state.pendingWire?.to) {
    const { to, toPin } = state.pendingWire;
    state.pendingWire = null;
    if (nodeId === to) {
      setStatus("Cannot wire a gate to itself.");
      renderNodes();
      renderWires();
      return;
    }
    completeWire(nodeId, to, toPin, fromPin);
    return;
  }
  if (state.pendingWire?.from === nodeId && (state.pendingWire?.fromPin ?? 0) === fromPin) {
    state.pendingWire = null; // toggle off
    renderNodes();
    renderWires();
    setStatus("Wire cancelled.");
    return;
  }
  state.pendingWire = { from: nodeId, fromPin };
  state.selected = null;
  renderNodes();
  renderWires();
  setStatus("Output selected: now click an input pin (left dot) to connect. Esc cancels.");
}

function onInputPin(nodeId, pin) {
  if (state.pendingWire?.from) {
    const fromId = state.pendingWire.from;
    const fromPin = state.pendingWire.fromPin ?? 0;
    state.pendingWire = null;
    if (fromId === nodeId) {
      setStatus("Cannot wire a gate to itself.");
      renderWires();
      renderNodes();
      return;
    }
    completeWire(fromId, nodeId, pin, fromPin);
    return;
  }
  if (state.pendingWire?.to === nodeId && state.pendingWire?.toPin === pin) {
    state.pendingWire = null; // toggle off
    renderNodes();
    renderWires();
    setStatus("Wire cancelled.");
    return;
  }
  state.pendingWire = { to: nodeId, toPin: pin };
  state.selected = null;
  renderNodes();
  renderWires();
  setStatus("Input selected: now click an output pin (right dot) to connect. Esc cancels.");
}

function completeWire(fromId, toId, toPin, fromPin = 0) {
  // Replace existing feed if occupied (friendlier than error)
  const res = setInputWire(state.circuit, fromId, toId, toPin, fromPin);
  if (!res.ok) {
    setStatus(`Wire rejected: ${res.error}`);
  } else {
    setStatus("Wired.");
    state.selected = { kind: "wire", id: res.wire.id };
  }
  afterMutation();
}

function toggleInput(nodeId) {
  state.inputStates[nodeId] = state.inputStates[nodeId] ? 0 : 1;
  const n = state.circuit.nodes[nodeId];
  if (n) n.value = state.inputStates[nodeId];
  afterMutation({ structural: false });
  persistSandbox();
}

function deleteNode(nodeId) {
  const n = state.circuit.nodes[nodeId];
  if (!n || n.locked) {
    setStatus("That terminal is locked.");
    return;
  }
  removeNode(state.circuit, nodeId);
  delete state.inputStates[nodeId];
  state.inputIds = state.inputIds.filter((id) => id !== nodeId);
  state.outputIds = state.outputIds.filter((id) => id !== nodeId);
  state.clockIds = state.clockIds.filter((id) => id !== nodeId);
  if (state.selected?.id === nodeId) state.selected = null;
  afterMutation();
}

function deleteSelected() {
  if (!state.selected) return;
  if (state.selected.kind === "wire") {
    removeWire(state.circuit, state.selected.id);
    state.selected = null;
    afterMutation();
  } else {
    deleteNode(state.selected.id);
  }
}

function updateDeleteBtn() {
  const btn = $("#delete-btn");
  btn.disabled = !state.selected;
}

// ---------- Simulation bridge ----------

function runLiveSim() {
  liveSim = simulate(state.circuit, state.inputStates);
  return liveSim;
}

/** Free-run the clocked bench over N ticks with held inputs. */
function runClockedSim() {
  const ticks = state.mode === "clocked" ? clockedLevel().ticks : 8;
  const sim = simulateClocked(state.circuit, { ...state.inputStates }, ticks);
  state.clockTraces = sim.traces;
  state.clockTick = Math.min(state.clockTick, ticks - 1);
  const col = {};
  for (const n of Object.values(state.circuit.nodes)) {
    col[n.id] = sim.traces[n.id]?.[state.clockTick] ?? 0;
  }
  liveSim = { nodeOutputs: col, status: sim.status === "OK" ? "STABLE" : sim.status };
  if (sim.status !== "OK") {
    setStatus("⚠ Comb feedback loop — break it with a clocked part (flops isolate loops).");
  }
  return liveSim;
}

function stopClock() {
  if (clockTimer) {
    clearInterval(clockTimer);
    clockTimer = null;
    const btn = document.querySelector("#t-play");
    if (btn) {
      btn.textContent = "▶";
      btn.setAttribute("aria-pressed", "false");
    }
  }
}

function afterMutation(opts = { structural: true }) {
  if (inClockedBench()) runClockedSim();
  else runLiveSim();
  renderPalette();
  renderNodes();
  renderWires();
  renderSpec();
  updateDeleteBtn();
  persistSandbox();
}

// ---------- Spec panel / verification ----------

function setStatus(msg) {
  $("#status").textContent = msg;
}

function currentInputVector() {
  return state.inputIds.map((id) => state.inputStates[id] ?? 0);
}

function renderSpec() {
  const isChallenge = state.mode === "challenge";
  const isClocked = state.mode === "clocked";
  $("#spec-challenge").hidden = !(isChallenge || isClocked);
  $("#spec-sandbox").hidden = isChallenge || isClocked;
  // restore shared spec chrome other modes may have changed
  document.querySelector("#spec-challenge .check-row").style.display = "";
  document.querySelector("#spec-challenge .table-wrap").style.display = "";
  document.querySelector("#spec-challenge h3").style.display = "";
  document.querySelector("#xfer-wrap").style.display = "none";
  $("#trace-view").hidden = !inClockedBench();
  if (inClockedBench()) $("#expr-toggle").style.display = "none";
  if (isClocked) {
    const level = clockedLevel();
    $("#level-name").textContent = `K${state.levelIndex + 1}. ${level.name}`;
    $("#level-brief").textContent = level.briefing;
    const budget = Object.entries(level.allowed)
      .map(([t, n]) => `${t}×${n}`)
      .join(" · ") || "clock + wires";
    $("#level-budget").textContent = `Budget: ${budget} · Par: ${level.par} parts · Parts used: ${countGates(state.circuit)} · ${level.ticks} ticks`;
    renderClockedTable();
    renderTraces();
  } else if (isChallenge) {
    const level = currentLevel();
    $("#level-name").textContent = `${state.levelIndex + 1}. ${level.name}`;
    $("#level-brief").textContent = level.briefing;
    const budget = Object.entries(level.allowed)
      .map(([t, n]) => `${t}×${n}`)
      .join(" · ");
    $("#level-budget").textContent = `Budget: ${budget} · Par: ${level.par} gates · Gates used: ${countGates(state.circuit)}`;
    renderSegDisplay();
    renderTruthTable();
  } else {
    if (inClockedBench()) {
      $("#sandbox-info").textContent = `Parts: ${countGates(state.circuit)} · Wires: ${Object.keys(state.circuit.wires).length}${
        liveSim?.status && liveSim.status !== "STABLE" ? ` · ⚠ ${liveSim.status}` : ""
      } · ${clockTicks()} ticks`;
      renderTraces();
    } else {
      $("#sandbox-info").textContent = `Gates: ${countGates(state.circuit)} · Wires: ${Object.keys(state.circuit.wires).length}${
        liveSim?.status === "UNSTABLE" ? " · ⚠ feedback loop (combinational only)" : ""
      }`;
    }
  }
  renderExprView();
}

/** Live 7-seg display for seg levels: digit from wxyz toggles, target outlined. */
function renderSegDisplay() {
  const box = $("#seg-display");
  const level = currentLevel();
  if (!level.segDisplay) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  const bits = state.inputIds.map((id) => (state.inputStates[id] ? 1 : 0));
  const digit = bits[0] * 8 + bits[1] * 4 + bits[2] * 2 + bits[3];
  const target = (level.outputs[0] || "").toLowerCase();
  const valid = digit <= 9;
  box.innerHTML = `<div class="seg-row">${sevenSegSVG(valid ? digit : null, target)}`
    + `<div class="seg-cap">input digit: <b>${valid ? digit : "–"}</b>${valid ? "" : " (invalid BCD)"}<br>`
    + `target segment: <b>${target.toUpperCase()}</b> (outlined)<br>`
    + `<span class="muted">toggle wxyz on the bench</span></div></div>`;
  box.hidden = false;
}

/** Live boolean formulas per output; sandbox uses terminal names. */
function renderExprView() {
  const box = $("#expr-view");
  const toggle = $("#expr-toggle");
  toggle.setAttribute("aria-pressed", String(showExpr));
  toggle.classList.toggle("active", showExpr);
  if (!showExpr) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  const names = {};
  if (state.mode === "challenge") {
    const level = currentLevel();
    state.inputIds.forEach((id, i) => (names[id] = level.inputs[i]));
    state.outputIds.forEach((id, i) => (names[id] = level.outputs[i]));
  }
  const exprs = outputExprs(state.circuit, state.outputIds, names);
  const rows = Object.entries(exprs).map(([name, text]) => {
    const shown = text.length > 300 ? text.slice(0, 300) + " …" : text;
    return `<div class="expr-row"><span class="expr-name">${name} =</span> <code>${shown}</code></div>`;
  });
  box.innerHTML =
    (liveSim?.status === "UNSTABLE" ? `<div class="warn">⟳ loop — expressions unstable</div>` : "") +
    (rows.join("") || `<span class="muted">No outputs yet.</span>`);
  box.hidden = false;
}

function renderTruthTable() {
  const level = currentLevel();
  const table = $("#truth-table");
  table.innerHTML = "";
  const head = document.createElement("tr");
  for (const n of level.inputs) {
    const th = document.createElement("th");
    th.textContent = n;
    head.appendChild(th);
  }
  for (const n of level.outputs) {
    const th = document.createElement("th");
    th.textContent = n + " exp";
    head.appendChild(th);
  }
  const liveTh = document.createElement("th");
  liveTh.textContent = "live";
  head.appendChild(liveTh);
  if (state.lastResults) {
    const r = document.createElement("th");
    r.textContent = "check";
    head.appendChild(r);
  }
  table.appendChild(head);

  const cur = currentInputVector().join("");
  const resByKey = new Map((state.lastResults ?? []).map((r) => [r.in.join(""), r]));
  for (const t of level.tests) {
    const tr = document.createElement("tr");
    if (t.in.join("") === cur) tr.className = "current-row";
    for (const b of t.in) {
      const td = document.createElement("td");
      td.textContent = String(b);
      tr.appendChild(td);
    }
    for (const b of t.out) {
      const td = document.createElement("td");
      td.textContent = String(b);
      tr.appendChild(td);
    }
    // live actual for this row
    const sim = simulate(
      state.circuit,
      Object.fromEntries(state.inputIds.map((id, i) => [id, t.in[i]]))
    );
    const actual = state.outputIds.map((id) => sim.nodeOutputs[id] ?? 0);
    const td = document.createElement("td");
    td.textContent = sim.status === "UNSTABLE" ? "loop" : actual.join(" ");
    td.className = "live-cell";
    tr.appendChild(td);
    if (state.lastResults) {
      const rr = resByKey.get(t.in.join(""));
      const td2 = document.createElement("td");
      td2.textContent = rr?.ok ? "✓" : "✗";
      td2.className = rr?.ok ? "ok" : "bad";
      tr.appendChild(td2);
    }
    table.appendChild(tr);
  }
  const res = $("#check-results");
  if (liveSim?.status === "UNSTABLE") {
    res.innerHTML = `<span class="warn">⚠ Feedback loop detected — combinational circuits can't loop back. Remove the cycle.</span>`;
  } else if (!state.lastResults) {
    res.innerHTML = `<span class="muted">Press “Check solution” to run all ${level.tests.length} cases.</span>`;
  }
  renderKmapHint();
}

/** K-map hint regrouping the expected table (2–4 inputs, exhaustive only). */
function renderKmapHint() {
  const details = $("#hint-details");
  const level = currentLevel();
  const n = level.inputs.length;
  if (n < 2 || n > 4 || level.tests.length !== 2 ** n) {
    details.hidden = true;
    return;
  }
  const vars = level.inputs;
  const blocks = level.outputs.map((oname, j) => {
    const on = level.tests
      .filter((t) => t.out[j] === 1)
      .map((t) => parseInt(t.in.join(""), 2));
    return `${oname}:\n${kmapString({ on, dc: [], vars })}`;
  });
  $("#kmap-pre").textContent = blocks.join("\n\n");
  details.hidden = false;
}

// ---------- Clocked spec / traces / transport ----------

function waveStr(wave) {
  return wave.map((b) => (b ? "▅" : "▁")).join("");
}

function renderClockedTable() {
  const level = clockedLevel();
  const table = $("#truth-table");
  table.innerHTML = "";
  const head = document.createElement("tr");
  const th0 = document.createElement("th");
  th0.textContent = "case";
  head.appendChild(th0);
  for (const n of [...level.inputs, ...(level.clocks ?? [])]) {
    const th = document.createElement("th");
    th.textContent = `${n} in`;
    head.appendChild(th);
  }
  for (const n of level.probes) {
    const th = document.createElement("th");
    th.textContent = `${n} exp`;
    head.appendChild(th);
  }
  if (state.lastResults) {
    const r = document.createElement("th");
    r.textContent = "check";
    head.appendChild(r);
  }
  table.appendChild(head);
  const resByIdx = new Map((state.lastResults ?? []).map((r, i) => [i, r]));
  level.tests.forEach((t, i) => {
    const tr = document.createElement("tr");
    const td0 = document.createElement("td");
    td0.textContent = `#${i + 1} (${t.ticks ?? level.ticks}t)`;
    tr.appendChild(td0);
    for (const n of [...level.inputs, ...(level.clocks ?? [])]) {
      const td = document.createElement("td");
      const v = t.in?.[n];
      td.textContent = Array.isArray(v) ? waveStr(v) : String(v ?? "—");
      tr.appendChild(td);
    }
    for (const n of level.probes) {
      const td = document.createElement("td");
      td.textContent = waveStr(t.expect[n] ?? []);
      tr.appendChild(td);
    }
    if (state.lastResults) {
      const rr = resByIdx.get(i);
      const td = document.createElement("td");
      td.textContent = rr?.ok ? "✓" : "✗";
      td.className = rr?.ok ? "ok" : "bad";
      tr.appendChild(td);
    }
    table.appendChild(tr);
  });
  const res = $("#check-results");
  if (liveSim?.status && liveSim.status !== "STABLE") {
    res.innerHTML = `<span class="warn">⚠ Combinational loop — break it with a clocked part.</span>`;
  } else if (!state.lastResults) {
    res.innerHTML = `<span class="muted">Press “Check solution” to run ${level.tests.length} scenario(s) over ${level.ticks} ticks.</span>`;
  }
}

/** Lanes to draw: level clocks+inputs+probes, or all such terminals in sandbox. */
function traceLanes() {
  const ids = {};
  if (state.mode === "clocked") {
    const m = clockNameToId();
    for (const n of clockedLevel().clocks ?? []) ids[n] = { id: m[n], color: "#fbbf24" };
    for (const n of clockedLevel().inputs) ids[n] = { id: m[n], color: "#60a5fa" };
    for (const n of clockedLevel().probes) ids[n] = { id: m[n], color: "#34d399" };
  } else {
    for (const n of Object.values(state.circuit.nodes)) {
      if (n.type === "INPUT") ids[n.name ?? n.id] = { id: n.id, color: "#60a5fa" };
      else if (n.type === "CLOCK") ids[n.name ?? n.id] = { id: n.id, color: "#fbbf24" };
      else if (n.type === "OUTPUT") ids[n.name ?? n.id] = { id: n.id, color: "#34d399" };
    }
  }
  return ids;
}

function renderTraces() {
  const svg = $("#traces");
  if (!svg) return;
  svg.innerHTML = "";
  const ticks = clockTicks();
  const lanes = traceLanes();
  const names = Object.keys(lanes);
  const labelW = 52, px = 26, laneH = 26, padTop = 6;
  const Wpx = labelW + ticks * px + 12;
  const Hpx = padTop + names.length * laneH + 8;
  svg.setAttribute("viewBox", `0 0 ${Wpx} ${Hpx}`);
  svg.style.minWidth = `${Wpx}px`;
  const X = (t) => labelW + t * px;
  names.forEach((name, li) => {
    const y0 = padTop + li * laneH;
    const yHi = y0 + 5, yLo = y0 + 19;
    const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
    t.setAttribute("x", "4");
    t.setAttribute("y", String(y0 + 16));
    t.setAttribute("fill", "#93a3c4");
    t.setAttribute("font-size", "12");
    t.textContent = name;
    svg.appendChild(t);
    const wave = state.clockTraces?.[lanes[name].id] ?? [];
    let d = "";
    for (let i = 0; i < ticks; i++) {
      const v = wave[i] ? 1 : 0;
      const y = v ? yHi : yLo;
      const x0 = X(i), x1 = X(i + 1);
      const prevY = i === 0 ? y : ((wave[i - 1] ? yHi : yLo));
      d += `${i === 0 ? `M${x0} ${y}` : `L${x0} ${prevY}L${x0} ${y}`}L${x1} ${y}`;
    }
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", lanes[name].color);
    path.setAttribute("stroke-width", "2.5");
    svg.appendChild(path);
  });
  // playhead
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("x1", String(X(state.clockTick)));
  line.setAttribute("x2", String(X(state.clockTick)));
  line.setAttribute("y1", "0");
  line.setAttribute("y2", String(Hpx));
  line.setAttribute("stroke", "#e8eefc");
  line.setAttribute("stroke-width", "1.5");
  line.setAttribute("stroke-dasharray", "3 3");
  svg.appendChild(line);
  // transport chrome
  const scrub = $("#t-scrub");
  scrub.max = String(ticks - 1);
  scrub.value = String(state.clockTick);
  $("#t-label").textContent = `t=${state.clockTick}/${ticks - 1}`;
}

/** Show one recorded tick column on the bench lamps/wires. */
function renderTickColumn() {
  const col = {};
  for (const n of Object.values(state.circuit.nodes)) {
    col[n.id] = state.clockTraces?.[n.id]?.[state.clockTick] ?? 0;
  }
  liveSim = { nodeOutputs: col, status: "STABLE" };
  renderNodes();
  renderWires();
  renderTraces();
}

function checkSolution() {
  if (state.mode === "clocked") return checkClocked();
  const level = currentLevel();
  const { passed, results, unstable } = evaluateLevel(
    state.circuit,
    level,
    state.inputIds,
    state.outputIds
  );
  state.lastResults = results;
  const gates = countGates(state.circuit);
  const res = $("#check-results");
  const fails = results.filter((r) => !r.ok);
  if (passed) {
    const stars = starsFor(level, gates);
    res.innerHTML = `<span class="pass">✓ Solved! ${"★".repeat(stars)}${"☆".repeat(3 - stars)} (${gates} gates, par ${level.par})</span>`;
    // persist progress
    const prev = save.stars[level.id] ?? 0;
    save.stars[level.id] = Math.max(prev, stars);
    save.unlocked = Math.max(save.unlocked, Math.min(LEVELS.length, state.levelIndex + 2));
    persistSave(save);
    renderLevels();
    setStatus(`Level solved with ${stars} stars.`);
    if (state.levelIndex + 1 < LEVELS.length) {
      const btn = document.createElement("button");
      btn.className = "btn primary";
      btn.textContent = "Next level →";
      btn.addEventListener("click", () => loadLevel(state.levelIndex + 1));
      res.appendChild(document.createTextNode(" "));
      res.appendChild(btn);
    }
  } else {
    const msg = unstable
      ? `Loop detected plus ${fails.length} failing case(s). Break the cycle first.`
      : `${fails.length} of ${results.length} cases fail. First fail: in=${fails[0].in.join("")} expected=${fails[0].expected.join("")} got=${fails[0].actual.join("")}.`;
    res.innerHTML = `<span class="fail">✗ Not yet — ${msg}</span>`;
    setStatus("Check failed. See highlighted rows.");
  }
  renderTruthTable();
  renderPalette();
}

function checkClocked() {
  const level = clockedLevel();
  const { passed, results, error } = evaluateClocked(state.circuit, level, clockNameToId());
  state.lastResults = results;
  const parts = countGates(state.circuit);
  const res = $("#check-results");
  if (error) {
    res.innerHTML = `<span class="fail">✗ Cannot check — ${error}.</span>`;
    return;
  }
  const fails = results.filter((r) => !r.ok);
  if (passed) {
    const stars = starsFor(level, parts);
    res.innerHTML = `<span class="pass">✓ Solved! ${"★".repeat(stars)}${"☆".repeat(3 - stars)} (${parts} parts, par ${level.par})</span>`;
    const cs = save.clocked;
    cs.stars[level.id] = Math.max(cs.stars[level.id] ?? 0, stars);
    cs.unlocked = Math.max(cs.unlocked, Math.min(LEVELS_CLOCKED.length, state.levelIndex + 2));
    persistSave(save);
    renderLevels();
    setStatus(`Level solved with ${stars} stars.`);
    if (state.levelIndex + 1 < LEVELS_CLOCKED.length) {
      const btn = document.createElement("button");
      btn.className = "btn primary";
      btn.textContent = "Next level →";
      btn.addEventListener("click", () => loadClocked(state.levelIndex + 1));
      res.appendChild(document.createTextNode(" "));
      res.appendChild(btn);
    }
  } else {
    const f = fails[0];
    const d = f.diffs[0] ?? {};
    const msg = d.status
      ? `the circuit didn't settle (combinational loop at tick ${d.tick}).`
      : `${fails.length} of ${results.length} scenarios fail. First: probe ${d.probe} differs at t=${d.tick} (expected ${d.expected}, got ${d.actual}).`;
    res.innerHTML = `<span class="fail">✗ Not yet — ${msg}</span>`;
    setStatus("Check failed. Scrub the traces to the failing tick.");
  }
  renderClockedTable();
  renderPalette();
}

// ---------- Level select ----------

function syncTabs() {
  $("#mode-challenge").classList.toggle("active", state.mode === "challenge");
  $("#mode-sandbox").classList.toggle("active", state.mode === "sandbox");
  $("#mode-cmos").classList.toggle("active", state.mode === "cmos");
  $("#mode-analog").classList.toggle("active", state.mode === "analog");
  $("#mode-clocked").classList.toggle("active", state.mode === "clocked");
}

function renderLevels() {
  // mode tabs always reflect app state
  syncTabs();
  if (state.mode === "clocked") {
    const list = $("#level-list");
    list.innerHTML = "";
    const h = document.createElement("div");
    h.className = "lvl-chapter";
    h.textContent = "Clocked";
    list.appendChild(h);
    const cs = save.clocked;
    LEVELS_CLOCKED.forEach((level, i) => {
      const locked = i + 1 > cs.unlocked && !save.freePlay;
      const card = document.createElement("button");
      card.className = "level-card" + (i === state.levelIndex ? " active" : "");
      card.disabled = locked;
      const stars = cs.stars[level.id] ?? 0;
      card.innerHTML = `<span class="lvl-num">${locked ? "🔒" : `K${i + 1}`}</span>
        <span class="lvl-name">${level.name}</span>
        <span class="lvl-stars">${"★".repeat(stars)}${"☆".repeat(3 - stars)}</span>
        <span class="lvl-tag">${level.tag}</span>`;
      card.setAttribute("aria-label", `${locked ? "Locked" : ""} Clocked level ${i + 1}: ${level.name}`);
      if (!locked) card.addEventListener("click", () => loadClocked(i));
      list.appendChild(card);
    });
    return;
  }
  if (state.mode === "cmos") {
    cmos().renderLevelList();
    return;
  }
  if (state.mode === "analog") {
    analog().renderLevelList();
    return;
  }
  const list = $("#level-list");
  if (state.mode === "sandbox") {
    // master sandbox: pick which bench to play on
    renderSandboxPicker();
    return;
  }
  list.innerHTML = "";
  let lastChapter = null;
  LEVELS.forEach((level, i) => {
    if (level.chapter !== lastChapter) {
      lastChapter = level.chapter;
      const h = document.createElement("div");
      h.className = "lvl-chapter";
      h.textContent = level.chapter ?? `Levels`;
      list.appendChild(h);
    }
    const locked = i + 1 > save.unlocked && state.mode === "challenge" && !save.freePlay;
    const card = document.createElement("button");
    card.className = "level-card" + (i === state.levelIndex && state.mode === "challenge" ? " active" : "");
    card.disabled = locked;
    const stars = save.stars[level.id] ?? 0;
    card.innerHTML = `<span class="lvl-num">${locked ? "🔒" : i + 1}</span>
      <span class="lvl-name">${level.name}</span>
      <span class="lvl-stars">${"★".repeat(stars)}${"☆".repeat(3 - stars)}</span>
      <span class="lvl-tag">${level.tag}</span>`;
    card.setAttribute("aria-label", `${locked ? "Locked" : ""} Level ${i + 1}: ${level.name}`);
    if (!locked) card.addEventListener("click", () => loadLevel(i));
    list.appendChild(card);
  });
}

// ---------- Wiring ----------

function bindGlobal() {
  // Shared Check/Delete buttons follow whichever bench owns the shell.
  const benchCall = (what) => {
    const b = activeBench();
    if (b === "cmos") return what === "check" ? cmos().onCheck() : cmos().onDelete();
    if (b === "analog") return what === "check" ? analog().onCheck() : analog().onDelete();
    return what === "check" ? checkSolution() : deleteSelected();
  };
  $("#check-btn").addEventListener("click", () => benchCall("check"));
  $("#delete-btn").addEventListener("click", () => benchCall("del"));
  $("#expr-toggle").addEventListener("click", () => {
    if (activeBench() !== "gates") return; // expressions are a gates-mode aid
    showExpr = !showExpr;
    renderExprView();
  });
  $("#reset-btn").addEventListener("click", () => {
    const b = activeBench();
    if (b === "cmos") { cmos().onReset(); return; }
    if (b === "analog") { analog().onReset(); return; }
    if (state.mode === "challenge") loadLevel(state.levelIndex);
    else {
      stopClock();
      state.circuit = createCircuit();
      state.inputIds = [];
      state.outputIds = [];
      state.clockIds = [];
      state.inputStates = {};
      state.clockTick = 0;
      state.clockTraces = null;
      afterMutation();
    }
  });
  $("#canvas").addEventListener("click", (e) => {
    if (e.target.closest(".node") || e.target.closest("button") || e.target.closest("path")) {
      return;
    }
    if (e.target.closest("#canvas")) {
      const b = activeBench();
      if (b === "cmos") { cmos().onCanvasBackground(); return; }
      if (b === "analog") { analog().onCanvasBackground(); return; }
      state.selected = null;
      state.pendingWire = null;
      renderNodes();
      renderWires();
      updateDeleteBtn();
    }
  });
  window.addEventListener("resize", fitStage);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const b = activeBench();
      if (b === "cmos") { cmos().onEscape(); return; }
      if (b === "analog") { analog().onEscape(); return; }
      state.pendingWire = null;
      state.selected = null;
      renderNodes();
      renderWires();
      updateDeleteBtn();
    }
    if ((e.key === "Delete" || e.key === "Backspace") && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName ?? "")) {
      e.preventDefault();
      benchCall("del");
    }
  });
  $("#mode-challenge").addEventListener("click", () => {
    state.mode = "challenge";
    save.mode = "challenge";
    persistSave(save);
    loadLevel(Math.min(state.levelIndex, save.unlocked - 1));
  });
  $("#mode-sandbox").addEventListener("click", loadSandbox);
  $("#mode-cmos").addEventListener("click", () => {
    state.mode = "cmos";
    save.mode = "cmos";
    persistSave(save);
    stopClock();
    cmos().enter();
  });
  $("#mode-analog").addEventListener("click", () => {
    state.mode = "analog";
    save.mode = "analog";
    persistSave(save);
    stopClock();
    analog().enter();
  });
  $("#mode-clocked").addEventListener("click", () => {
    state.mode = "clocked";
    save.mode = "clocked";
    persistSave(save);
    loadClocked(Math.min(state.levelIndex, save.clocked.unlocked - 1));
  });
  // trace transport (clocked bench only)
  $("#t-run").addEventListener("click", () => {
    if (!inClockedBench()) return;
    state.clockTick = clockTicks() - 1;
    afterMutation();
  });
  $("#t-play").addEventListener("click", () => {
    if (!inClockedBench()) return;
    if (clockTimer) { stopClock(); return; }
    const btn = $("#t-play");
    btn.textContent = "⏸";
    btn.setAttribute("aria-pressed", "true");
    clockTimer = setInterval(() => {
      state.clockTick = (state.clockTick + 1) % clockTicks();
      if (state.clockTick === 0) { stopClock(); }
      renderTickColumn();
    }, 450);
  });
  $("#t-scrub").addEventListener("input", (e) => {
    if (!inClockedBench()) return;
    stopClock();
    state.clockTick = Math.max(0, Math.min(clockTicks() - 1, parseInt(e.target.value, 10) || 0));
    renderTickColumn();
  });
  const free = $("#freeplay");
  free.checked = save.freePlay === true;
  free.addEventListener("change", () => {
    save.freePlay = free.checked;
    persistSave(save);
    renderLevels();
    setStatus(free.checked ? "Free play on: every level is open." : "Free play off: back to progression.");
  });
  $("#help-btn").addEventListener("click", () => ($("#help-modal").hidden = false));
  $("#help-close").addEventListener("click", () => ($("#help-modal").hidden = true));
  $("#help-modal").addEventListener("click", (e) => {
    if (e.target.id === "help-modal") $("#help-modal").hidden = true;
  });
}

function renderAll() {
  if (inClockedBench()) runClockedSim();
  else runLiveSim();
  renderLevels();
  renderPalette();
  renderNodes();
  renderWires();
  renderSpec();
  updateDeleteBtn();
  fitStage();
  const place = state.mode === "clocked"
    ? `K-level ${state.levelIndex + 1} of ${LEVELS_CLOCKED.length}`
    : state.mode === "challenge"
      ? `Level ${state.levelIndex + 1} of ${LEVELS.length}`
      : "Sandbox — everything unlocked";
  setStatus(`${place}. Click any pin, then the other end, to wire.`);
}

// boot: restore the last-used mode
bindGlobal();
if (save.mode === "cmos") {
  state.mode = "cmos";
  cmos().enter();
} else if (save.mode === "analog") {
  state.mode = "analog";
  analog().enter();
} else if (save.mode === "clocked") {
  loadClocked(0);
} else if (save.mode === "sandbox") {
  loadSandbox();
} else if (state.mode === "challenge") loadLevel(0);
else loadSandbox();
