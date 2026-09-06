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
import { loadSave, persistSave } from "./store.js";
import { gateSVG } from "./gates.js";

const W = 960;
const H = 540;
const NODE_W = 92;

const $ = (sel) => document.querySelector(sel);

const save = loadSave();
const state = {
  mode: "challenge",
  levelIndex: 0,
  circuit: createCircuit(),
  inputStates: {},
  inputIds: [],
  outputIds: [],
  selected: null, // { kind: 'node'|'wire', id }
  pendingWire: null, // { from } | { to, toPin }
  lastResults: null,
  spawnOffset: 0,
};

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
  if (kind === "out") return { x: node.x + NODE_W, y: node.y + Math.round(h / 2) };
  const k = GATE_DEFS[node.type].inputs;
  const p = PIN_GEOM.in(h, k, pin);
  return { x: node.x + p.dx, y: node.y + p.dy };
}

// ---------- Level / circuit setup ----------

function currentLevel() {
  return LEVELS[state.levelIndex];
}

function loadLevel(index) {
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
  // Spread terminals vertically centered when few
  state.circuit = c;
  state.spawnOffset = 0;
  renderAll();
}

function loadSandbox() {
  state.mode = "sandbox";
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
  save.sandbox = serializeCircuit(state.circuit);
  persistSave(save);
}

// ---------- Palette ----------

// Every buildable gate. In challenges INPUT/OUTPUT terminals are pre-placed,
// so the palette offers gates only; disallowed ones show disabled instead of
// vanishing (an almost-empty palette looks broken).
const ALL_GATES = ["AND", "OR", "NOT", "NAND", "NOR", "XOR", "XNOR"];
const ALL_PARTS = ["INPUT", "OUTPUT", ...ALL_GATES];

function paletteEntries() {
  if (state.mode === "sandbox") return ALL_PARTS;
  return ALL_GATES;
}

function usedCount(type) {
  return Object.values(state.circuit.nodes).filter((n) => n.type === type).length;
}

function renderPalette() {
  const el = $("#palette");
  el.innerHTML = "";
  const label = $("#palette-label");
  if (label) {
    label.textContent =
      state.mode === "sandbox" ? "Parts (all unlocked)" : "Parts (this level's budget)";
  }
  for (const type of paletteEntries()) {
    const btn = document.createElement("button");
    btn.className = "pal-btn";
    btn.dataset.type = type;
    let remaining = Infinity;
    let available = true;
    if (state.mode === "challenge") {
      const budget = currentLevel().allowed[type] ?? 0;
      available = budget > 0;
      remaining = budget - usedCount(type);
    }
    const def = GATE_DEFS[type];
    const countText =
      state.mode === "challenge" && !available
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
  if (state.mode === "challenge") {
    const budget = currentLevel().allowed[type] ?? 0;
    if (usedCount(type) >= budget) return;
  }
  const off = (state.spawnOffset++ % 8) * 14;
  const n = addNode(state.circuit, type, W / 2 - NODE_W / 2 + off, H / 2 - 30 + off);
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
    } else {
      div.classList.add("tgate");
      inner = `<div class="node-title">${node.name ?? def.label}</div>${gateSVG(node.type)}`;
    }
    div.innerHTML = inner;

    // pins (24px targets; centered on the pin point)
    const PIN_R = 12;
    if (def.outputs > 0) {
      const p = document.createElement("button");
      p.className =
        "pin out" +
        (state.pendingWire?.from === node.id ? " pending" : "") +
        (state.pendingWire?.to ? " compat" : "");
      p.dataset.node = node.id;
      p.dataset.kind = "out";
      p.setAttribute("aria-label", `Output of ${node.name ?? node.id}. Activate to start or finish a wire.`);
      p.style.top = `${Math.round(h / 2) - PIN_R}px`;
      p.style.left = `${NODE_W - PIN_R}px`;
      p.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        onOutputPin(node.id);
      });
      p.addEventListener("click", (e) => {
        e.stopPropagation();
        onOutputPin(node.id);
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
      else {
        state.selected = { kind: "node", id: node.id };
        renderNodes();
      }
    });
    div.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (node.type === "INPUT") toggleInput(node.id);
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
    const v = liveSim ? liveSim.nodeOutputs[wire.from] ?? 0 : 0;
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
function onOutputPin(nodeId) {
  if (state.pendingWire?.to) {
    const { to, toPin } = state.pendingWire;
    state.pendingWire = null;
    if (nodeId === to) {
      setStatus("Cannot wire a gate to itself.");
      renderNodes();
      renderWires();
      return;
    }
    completeWire(nodeId, to, toPin);
    return;
  }
  if (state.pendingWire?.from === nodeId) {
    state.pendingWire = null; // toggle off
    renderNodes();
    renderWires();
    setStatus("Wire cancelled.");
    return;
  }
  state.pendingWire = { from: nodeId };
  state.selected = null;
  renderNodes();
  renderWires();
  setStatus("Output selected: now click an input pin (left dot) to connect. Esc cancels.");
}

function onInputPin(nodeId, pin) {
  if (state.pendingWire?.from) {
    const fromId = state.pendingWire.from;
    state.pendingWire = null;
    if (fromId === nodeId) {
      setStatus("Cannot wire a gate to itself.");
      renderWires();
      renderNodes();
      return;
    }
    completeWire(fromId, nodeId, pin);
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

function completeWire(fromId, toId, toPin) {
  // Replace existing feed if occupied (friendlier than error)
  const res = setInputWire(state.circuit, fromId, toId, toPin, 0);
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

function afterMutation(opts = { structural: true }) {
  runLiveSim();
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
  $("#spec-challenge").hidden = !isChallenge;
  $("#spec-sandbox").hidden = isChallenge;
  if (isChallenge) {
    const level = currentLevel();
    $("#level-name").textContent = `${state.levelIndex + 1}. ${level.name}`;
    $("#level-brief").textContent = level.briefing;
    const budget = Object.entries(level.allowed)
      .map(([t, n]) => `${t}×${n}`)
      .join(" · ");
    $("#level-budget").textContent = `Budget: ${budget} · Par: ${level.par} gates · Gates used: ${countGates(state.circuit)}`;
    renderTruthTable();
  } else {
    $("#sandbox-info").textContent = `Gates: ${countGates(state.circuit)} · Wires: ${Object.keys(state.circuit.wires).length}${
      liveSim?.status === "UNSTABLE" ? " · ⚠ feedback loop (combinational only)" : ""
    }`;
  }
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
}

function checkSolution() {
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

// ---------- Level select ----------

function renderLevels() {
  const list = $("#level-list");
  list.innerHTML = "";
  LEVELS.forEach((level, i) => {
    const locked = i + 1 > save.unlocked && state.mode === "challenge";
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
  // mode tabs
  $("#mode-challenge").classList.toggle("active", state.mode === "challenge");
  $("#mode-sandbox").classList.toggle("active", state.mode === "sandbox");
}

// ---------- Wiring ----------

function bindGlobal() {
  $("#check-btn").addEventListener("click", checkSolution);
  $("#delete-btn").addEventListener("click", deleteSelected);
  $("#reset-btn").addEventListener("click", () => {
    if (state.mode === "challenge") loadLevel(state.levelIndex);
    else {
      state.circuit = createCircuit();
      state.inputIds = [];
      state.outputIds = [];
      state.inputStates = {};
      afterMutation();
    }
  });
  $("#canvas").addEventListener("click", (e) => {
    if (e.target.closest(".node") || e.target.closest("button") || e.target.closest("path")) {
      return;
    }
    if (e.target.closest("#canvas")) {
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
      state.pendingWire = null;
      state.selected = null;
      renderNodes();
      renderWires();
      updateDeleteBtn();
    }
    if ((e.key === "Delete" || e.key === "Backspace") && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName ?? "")) {
      e.preventDefault();
      deleteSelected();
    }
  });
  $("#mode-challenge").addEventListener("click", () => {
    state.mode = "challenge";
    loadLevel(Math.min(state.levelIndex, save.unlocked - 1));
  });
  $("#mode-sandbox").addEventListener("click", loadSandbox);
  $("#help-btn").addEventListener("click", () => ($("#help-modal").hidden = false));
  $("#help-close").addEventListener("click", () => ($("#help-modal").hidden = true));
  $("#help-modal").addEventListener("click", (e) => {
    if (e.target.id === "help-modal") $("#help-modal").hidden = true;
  });
}

function renderAll() {
  runLiveSim();
  renderLevels();
  renderPalette();
  renderNodes();
  renderWires();
  renderSpec();
  updateDeleteBtn();
  fitStage();
  const place = state.mode === "challenge" ? `Level ${state.levelIndex + 1} of ${LEVELS.length}` : "Sandbox — everything unlocked";
  setStatus(`${place}. Click any pin, then the other end, to wire. INPUT terminals are left, OUTPUT terminals are right.`);
}

// boot
bindGlobal();
if (state.mode === "challenge") loadLevel(0);
else loadSandbox();
