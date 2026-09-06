/**
 * CMOS Lab — switch-level simulator (pure, no DOM).
 *
 * Nets are explicit (SPICE-style): devices hang off net ids, and the UI
 * merges nets by wiring pins together. Node state is { v: 0|1|'X',
 * s: strength } with s 0=unknown, 1=weak (pulls/diode-follow), 2=strong
 * (rails, driven inputs, ON channels). Fixed-point relaxation like the
 * gate engine; X-gated transistors stay OFF (fail-closed: the driven
 * side keeps its float, which verification rejects with a FLOAT hint).
 *
 * Statuses: STABLE | SHORT (strong 1 vs strong 0) | FLOAT (a probed net
 * stayed X) | UNSTABLE (no fixed point in bounded passes).
 */

export const CMOS_KINDS = [
  "NMOS", "PMOS", "NPN", "DIODE", "PULLUP", "PULLDOWN",
  "VDD", "GND", "IN", "PROBE",
];

// Budgeted parts (rails/IN/PROBE are free bench infrastructure).
export const CMOS_PARTS = ["NMOS", "PMOS", "NPN", "DIODE", "PULLUP", "PULLDOWN"];

export function createNet() {
  return { nets: {}, devices: {}, seq: 1 };
}

function nextId(net, prefix) {
  return `${prefix}${net.seq++}`;
}

/** Add a net (wire). Returns id. */
export function addNetNode(net, name, id) {
  const nid = id ?? nextId(net, "t");
  net.nets[nid] = { id: nid, name };
  return nid;
}

/**
 * Add a device. Terminals reference net ids:
 *   NMOS/PMOS: { gate, a, b }          NPN: { base, c, e }
 *   DIODE: { anode, cathode }           PULLUP/PULLDOWN/VDD/GND/IN/PROBE: { net }
 */
export function addDevice(net, kind, terminals, id) {
  if (!CMOS_KINDS.includes(kind)) throw new Error(`Unknown CMOS kind: ${kind}`);
  const did = id ?? nextId(net, "d");
  net.devices[did] = { id: did, kind, ...terminals };
  return net.devices[did];
}

export function removeDevice(net, id) {
  if (!net.devices[id]) return false;
  delete net.devices[id];
  return true;
}

/** Merge net `gone` into net `keep` (UI wiring). Rewires device terminals. */
export function mergeNets(net, keep, gone) {
  if (keep === gone || !net.nets[keep] || !net.nets[gone]) return false;
  for (const d of Object.values(net.devices)) {
    for (const k of ["gate", "a", "b", "base", "c", "e", "anode", "cathode", "net"]) {
      if (d[k] === gone) d[k] = keep;
    }
  }
  delete net.nets[gone];
  return true;
}

/** Count budgeted parts per kind (excludes rails/IN/PROBE). */
export function countCmosParts(net) {
  const used = {};
  for (const d of Object.values(net.devices)) {
    if (!CMOS_PARTS.includes(d.kind)) continue;
    used[d.kind] = (used[d.kind] ?? 0) + 1;
  }
  return used;
}

function resolve(drivers) {
  // drivers: [{ v: 0|1, s: 1|2 }]
  let s1 = false, s0 = false;
  for (const d of drivers) {
    if (d.s === 2) { if (d.v === 1) s1 = true; else s0 = true; }
  }
  if (s1 && s0) return { v: "X", s: 2, short: true };
  const top = drivers.filter((d) => d.s === 2);
  if (top.length > 0) return { v: top[0].v, s: 2, short: false };
  const weak = drivers.filter((d) => d.s === 1);
  if (weak.length === 0) return { v: "X", s: 0, short: false };
  const v = weak[0].v;
  if (weak.some((d) => d.v !== v)) return { v: "X", s: 1, short: false };
  return { v, s: 1, short: false };
}

/**
 * @param {object} net
 * @param {Record<string, 0|1>} inputValues map IN-device id -> bit
 * @param {{carry?: Record<string, {v,s}>, probeNets?: string[]}} opts
 */
export function simulateCmos(net, inputValues = {}, opts = {}) {
  const netIds = Object.keys(net.nets);
  const states = {};
  for (const nid of netIds) {
    states[nid] = opts.carry?.[nid] ? { ...opts.carry[nid] } : { v: "X", s: 0 };
  }

  // Union-find over ON channels, rebuilt every pass from gate levels.
  const parent = {};
  const find = (x) => {
    parent[x] ??= x;
    while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
    return x;
  };
  const union = (a, b) => { parent[find(a)] = find(b); };

  const maxPasses = netIds.length + Object.keys(net.devices).length + 2;
  let short = false;
  let ticks = 0;
  for (let pass = 0; pass < maxPasses; pass++) {
    ticks = pass + 1;
    for (const nid of netIds) parent[nid] = nid;
    const extra = {}; // netId -> drivers from diodes (directional)
    const pushX = (nid, v, s) => {
      if (nid == null || !states[nid]) return;
      (extra[nid] ??= []).push({ v, s });
    };
    for (const d of Object.values(net.devices)) {
      const on = (g) => states[g]?.v === 1;
      const off = (g) => states[g]?.v === 0;
      switch (d.kind) {
        case "NMOS": if (on(d.gate)) union(d.a, d.b); break;
        case "NPN": if (on(d.base)) union(d.c, d.e); break;
        case "PMOS": if (off(d.gate)) union(d.a, d.b); break;
        case "DIODE": {
          const k = states[d.cathode];
          if (k?.v === 0) pushX(d.anode, 0, 2); // forward bias: drag anode low hard
          else if (states[d.anode]?.v === "X" && k?.v === 1) pushX(d.anode, 1, 1);
          break;
        }
        default: break;
      }
    }
    // Base drivers per net, then merged across each connected component.
    const base = {};
    const pushB = (nid, v, s) => {
      if (nid == null || !states[nid]) return;
      (base[nid] ??= []).push({ v, s });
    };
    for (const d of Object.values(net.devices)) {
      switch (d.kind) {
        case "VDD": pushB(d.net, 1, 2); break;
        case "GND": pushB(d.net, 0, 2); break;
        case "IN": pushB(d.net, inputValues[d.id] ? 1 : 0, 2); break;
        case "PULLUP": pushB(d.net, 1, 1); break;
        case "PULLDOWN": pushB(d.net, 0, 1); break;
        default: break;
      }
    }
    const merged = {};
    for (const nid of netIds) {
      const root = find(nid);
      (merged[root] ??= []).push(...(base[nid] ?? []), ...(extra[nid] ?? []));
    }
    let changed = false;
    for (const nid of netIds) {
      const r = resolve(merged[find(nid)] ?? []);
      if (r.short) short = true;
      const cur = states[nid];
      if (cur.v !== r.v || cur.s !== r.s) { states[nid] = { v: r.v, s: r.s }; changed = true; }
    }
    if (!changed) {
      return finish(states, short, ticks, net, opts);
    }
  }
  return { states, status: "UNSTABLE", short, floatNets: [], ticks };
}

function finish(states, short, ticks, net, opts) {
  const floatNets = [];
  if (!short) {
    const probes = opts.probeNets ?? Object.values(net.devices)
      .filter((d) => d.kind === "PROBE").map((d) => d.net);
    for (const nid of probes) {
      if (states[nid]?.v === "X") floatNets.push(nid);
    }
  }
  const status = short ? "SHORT" : floatNets.length > 0 ? "FLOAT" : "STABLE";
  return { states, status, short, floatNets, ticks };
}

/**
 * Evaluate a CMOS level. level.tests = [{ in: [...], out: [...] }],
 * out[j] matches probeNetIds[j].
 * Stateful levels (SR latch) carry net states across vectors, except
 * vectors marked { fresh: true } which reset first — driven transitions
 * (set/reset) start from unknown, hold vectors verify memory.
 */
export function evaluateCmos(net, level, inDeviceIds, probeNetIds) {
  const results = [];
  let carry = null;
  let short = false, unstable = false;
  for (const t of level.tests) {
    const inputValues = {};
    inDeviceIds.forEach((id, i) => { inputValues[id] = t.in[i] ? 1 : 0; });
    const useCarry = level.stateful && carry && !t.fresh;
    const sim = simulateCmos(net, inputValues, useCarry ? { carry } : {});
    if (level.stateful) {
      carry = Object.fromEntries(Object.entries(sim.states).map(([k, s]) => [k, { ...s }]));
    }
    if (sim.short) short = true;
    if (sim.status === "UNSTABLE") unstable = true;
    const actual = probeNetIds.map((nid) => (sim.states[nid]?.v === 1 ? 1 : 0));
    const ok = (sim.status === "STABLE" || (level.stateful && !sim.short && sim.status !== "UNSTABLE")) &&
      actual.length === t.out.length &&
      actual.every((v, i) => v === (t.out[i] ? 1 : 0)) &&
      // stateful hold vectors must be genuinely driven, not floating
      probeNetIds.every((nid) => sim.states[nid]?.v !== "X");
    results.push({ in: [...t.in], expected: [...t.out], actual, ok, status: sim.status });
  }
  return { passed: results.every((r) => r.ok), results, short, unstable };
}

/** Serialize a netlist (level prefill / savegames). */
export function serializeNet(net) {
  return {
    nets: Object.values(net.nets),
    devices: Object.values(net.devices),
    seq: net.seq,
  };
}

export function deserializeNet(data) {
  const net = createNet();
  if (!data || typeof data !== "object") return net;
  net.seq = Number.isFinite(data.seq) && data.seq > 0 ? data.seq : 1;
  for (const n of data.nets ?? []) if (n?.id) net.nets[n.id] = { ...n };
  for (const d of data.devices ?? []) {
    if (d?.id && CMOS_KINDS.includes(d.kind)) net.devices[d.id] = { ...d };
  }
  return net;
}
