/**
 * Circuit Coder — pure combinational logic simulation engine.
 * Zero DOM dependencies. Importable from Node tests and the browser UI.
 *
 * Model:
 *   circuit = { nodes: Record<id, Node>, wires: Record<id, Wire> }
 *   Node = { id, type, x, y, locked?, name? }
 *   Wire = { id, from, fromPin, to, toPin }
 *
 * Pin convention:
 *   - INPUT: 0 inputs, 1 output (pin 0)
 *   - OUTPUT: 1 input (pin 0), 0 outputs
 *   - NOT: 1 in, 1 out
 *   - AND/OR/NAND/NOR/XOR/XNOR: 2 in, 1 out
 */

export const GATE_DEFS = {
  INPUT: { inputs: 0, outputs: 1, label: "INPUT", symbol: "IN" },
  OUTPUT: { inputs: 1, outputs: 0, label: "OUTPUT", symbol: "OUT" },
  AND: { inputs: 2, outputs: 1, label: "AND", symbol: "&" },
  OR: { inputs: 2, outputs: 1, label: "OR", symbol: "≥1" },
  NOT: { inputs: 1, outputs: 1, label: "NOT", symbol: "¬" },
  NAND: { inputs: 2, outputs: 1, label: "NAND", symbol: "⊼" },
  NOR: { inputs: 2, outputs: 1, label: "NOR", symbol: "⊽" },
  XOR: { inputs: 2, outputs: 1, label: "XOR", symbol: "⊕" },
  XNOR: { inputs: 2, outputs: 1, label: "XNOR", symbol: "⊙" },
};

export const GATE_TYPES = Object.keys(GATE_DEFS);

let uidCounter = 1;

/** Create an empty circuit. */
export function createCircuit() {
  return { nodes: {}, wires: {}, seq: 1 };
}

function nextId(circuit, prefix) {
  const id = `${prefix}${circuit.seq++}`;
  return id;
}

/** Add a node. Returns the node. Throws on unknown type. */
export function addNode(circuit, type, x = 0, y = 0, extra = {}) {
  if (!GATE_DEFS[type]) throw new Error(`Unknown gate type: ${type}`);
  const id = extra.id ?? nextId(circuit, "n");
  const node = { id, type, x, y, ...extra };
  // Don't let extra override identity basics accidentally
  node.id = id;
  node.type = type;
  circuit.nodes[id] = node;
  if (String(id).startsWith("n")) {
    const n = parseInt(id.slice(1), 10);
    if (Number.isFinite(n) && n >= circuit.seq) circuit.seq = n + 1;
  }
  return node;
}

/** Remove a node and all attached wires. Returns true if removed. */
export function removeNode(circuit, nodeId) {
  if (!circuit.nodes[nodeId]) return false;
  for (const wid of Object.keys(circuit.wires)) {
    const w = circuit.wires[wid];
    if (w.from === nodeId || w.to === nodeId) delete circuit.wires[wid];
  }
  delete circuit.nodes[nodeId];
  return true;
}

/**
 * Validate a prospective wire.
 * Returns { ok: true } or { ok: false, error }.
 */
export function validateWire(circuit, fromId, toId, toPin = 0, fromPin = 0) {
  const from = circuit.nodes[fromId];
  const to = circuit.nodes[toId];
  if (!from) return { ok: false, error: "Source node not found" };
  if (!to) return { ok: false, error: "Target node not found" };
  if (fromId === toId) return { ok: false, error: "Cannot wire a gate to itself" };
  const fromDef = GATE_DEFS[from.type];
  const toDef = GATE_DEFS[to.type];
  if (fromDef.outputs <= 0) return { ok: false, error: `${from.type} has no output` };
  if (toDef.inputs <= 0) return { ok: false, error: `${to.type} has no input` };
  if (fromPin < 0 || fromPin >= fromDef.outputs)
    return { ok: false, error: "Bad source pin" };
  if (toPin < 0 || toPin >= toDef.inputs)
    return { ok: false, error: "Bad target pin" };
  for (const w of Object.values(circuit.wires)) {
    if (w.to === toId && w.toPin === toPin)
      return { ok: false, error: "Input already wired (replace it first)" };
    if (w.from === fromId && w.fromPin === fromPin && w.to === toId && w.toPin === toPin)
      return { ok: false, error: "Wire already exists" };
  }
  return { ok: true };
}

/** Add a wire. Returns { ok, wire?, error? }. */
export function addWire(circuit, fromId, toId, toPin = 0, fromPin = 0, id) {
  const v = validateWire(circuit, fromId, toId, toPin, fromPin);
  if (!v.ok) return v;
  const wid = id ?? nextId(circuit, "w");
  const wire = { id: wid, from: fromId, fromPin, to: toId, toPin };
  circuit.wires[wid] = wire;
  return { ok: true, wire };
}

/** Remove a wire by id. */
export function removeWire(circuit, wireId) {
  if (!circuit.wires[wireId]) return false;
  delete circuit.wires[wireId];
  return true;
}

/** Replace (or add) the single wire feeding (toId, toPin). */
export function setInputWire(circuit, fromId, toId, toPin = 0, fromPin = 0) {
  for (const [wid, w] of Object.entries(circuit.wires)) {
    if (w.to === toId && w.toPin === toPin) delete circuit.wires[wid];
  }
  return addWire(circuit, fromId, toId, toPin, fromPin);
}

/** Boolean function of a gate given its input bits (array of 0|1). */
export function computeGate(type, inputs) {
  const b = inputs.map((v) => (v ? 1 : 0));
  switch (type) {
    case "AND":
      return b[0] & b[1] ? 1 : 0;
    case "OR":
      return b[0] | b[1] ? 1 : 0;
    case "NOT":
      return b[0] ? 0 : 1;
    case "NAND":
      return b[0] & b[1] ? 0 : 1;
    case "NOR":
      return b[0] | b[1] ? 0 : 1;
    case "XOR":
      return b[0] ^ b[1] ? 1 : 0;
    case "XNOR":
      return b[0] ^ b[1] ? 0 : 1;
    default:
      throw new Error(`computeGate: unsupported type ${type}`);
  }
}

function inputCount(node) {
  return GATE_DEFS[node.type].inputs;
}

/**
 * Simulate the circuit to a fixed point (synchronous passes).
 *
 * @param {object} circuit
 * @param {Record<string, 0|1>} inputValues map INPUT node id -> bit
 * @returns {{
 *   nodeOutputs: Record<string, 0|1>,
 *   pinValues: Record<string, 0|1>,   // `${nodeId}:${pin}` for input pins
 *   status: 'STABLE' | 'UNSTABLE',
 *   ticks: number
 * }}
 */
export function simulate(circuit, inputValues = {}) {
  const nodes = Object.values(circuit.nodes);
  const nodeOutputs = {};
  // Seed
  for (const n of nodes) {
    if (n.type === "INPUT") {
      const v = inputValues[n.id] ?? n.value ?? 0;
      nodeOutputs[n.id] = v ? 1 : 0;
    } else {
      nodeOutputs[n.id] = 0;
    }
  }

  // Index incoming wires by target
  const incoming = new Map(); // key `${to}:${pin}` -> wire
  for (const w of Object.values(circuit.wires)) {
    incoming.set(`${w.to}:${w.toPin}`, w);
  }

  const readPin = (nodeId, pin, outputs) => {
    const w = incoming.get(`${nodeId}:${pin}`);
    if (!w) return 0;
    return outputs[w.from] ? 1 : 0;
  };

  const maxPasses = nodes.length + 1;
  let ticks = 0;
  let status = "STABLE";
  for (let pass = 0; pass < maxPasses; pass++) {
    ticks = pass + 1;
    const next = { ...nodeOutputs };
    let changed = false;
    for (const n of nodes) {
      if (n.type === "INPUT") continue;
      if (n.type === "OUTPUT") {
        const v = readPin(n.id, 0, nodeOutputs);
        if (next[n.id] !== v) {
          next[n.id] = v;
          changed = true;
        }
        continue;
      }
      const k = inputCount(n);
      const ins = [];
      for (let p = 0; p < k; p++) ins.push(readPin(n.id, p, nodeOutputs));
      const v = computeGate(n.type, ins);
      if (next[n.id] !== v) {
        next[n.id] = v;
        changed = true;
      }
    }
    Object.assign(nodeOutputs, next);
    if (!changed) {
      status = "STABLE";
      break;
    }
    if (pass === maxPasses - 1 && changed) status = "UNSTABLE";
  }

  const pinValues = {};
  for (const n of nodes) {
    const k = inputCount(n);
    for (let p = 0; p < k; p++) pinValues[`${n.id}:${p}`] = readPin(n.id, p, nodeOutputs);
  }

  return { nodeOutputs, pinValues, status, ticks };
}

/**
 * Evaluate a level spec against a circuit.
 * level = { inputs: [nodeIds or names], outputs, tests: [{in:[], out:[]}], inputIds?, outputIds? }
 * Caller maps test vector positions to actual INPUT/OUTPUT node ids in order.
 */
export function evaluateLevel(circuit, level, inputIds, outputIds) {
  const results = [];
  let unstable = false;
  for (const t of level.tests) {
    const inputValues = {};
    inputIds.forEach((id, i) => {
      inputValues[id] = t.in[i] ? 1 : 0;
    });
    const sim = simulate(circuit, inputValues);
    if (sim.status === "UNSTABLE") unstable = true;
    const actual = outputIds.map((id) => sim.nodeOutputs[id] ?? 0);
    const ok =
      sim.status === "STABLE" &&
      actual.length === t.out.length &&
      actual.every((v, i) => v === (t.out[i] ? 1 : 0));
    results.push({ in: [...t.in], expected: [...t.out], actual, ok });
  }
  return { passed: results.every((r) => r.ok), results, unstable };
}

/** Count non-terminal gates (excludes INPUT/OUTPUT). */
export function countGates(circuit) {
  return Object.values(circuit.nodes).filter(
    (n) => n.type !== "INPUT" && n.type !== "OUTPUT"
  ).length;
}

/** Serialize circuit to JSON-safe object (for localStorage). */
export function serializeCircuit(circuit) {
  return {
    nodes: Object.values(circuit.nodes),
    wires: Object.values(circuit.wires),
    seq: circuit.seq,
  };
}

/** Restore circuit from serialized form. */
export function deserializeCircuit(data) {
  const circuit = createCircuit();
  if (!data || typeof data !== "object") return circuit;
  circuit.seq = Number.isFinite(data.seq) && data.seq > 0 ? data.seq : 1;
  for (const n of data.nodes ?? []) {
    if (n && n.id && GATE_DEFS[n.type]) circuit.nodes[n.id] = { ...n };
  }
  for (const w of data.wires ?? []) {
    if (w && w.from && w.to && circuit.nodes[w.from] && circuit.nodes[w.to]) {
      circuit.wires[w.id] = { ...w };
    }
  }
  return circuit;
}
