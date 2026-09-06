/**
 * Clocked (synchronous sequential) simulator — pure, no DOM.
 *
 * Runs on the same circuit data as the gate engine, but interprets the
 * clocked parts (CLOCK/DFF/TFF/DLATCH/DELAY, see engine GATE_DEFS):
 *   - Each tick: drive INPUTs (held scalars or per-tick programs) and
 *     CLOCK sources, settle the combinational cloud with flop/latch/delay
 *     outputs frozen, detect rising edges, capture next states.
 *   - DFF: Q←D on rising CLK; async R forces Q=0 (applied at tick end).
 *   - TFF: Q←Q⊕T on rising CLK; same R override.
 *   - DLATCH: transparent (out=D) while EN=1, else holds.
 *   - DELAY: out[t] = in[t−1].
 *   - Feedback through an edge is legal; pure combinational loops still
 *     fail with UNSETTLED.
 */
import { GATE_DEFS, computeGate } from "./engine.js";

export const CLOCKED_TYPES = new Set(["CLOCK", "DFF", "TFF", "DLATCH", "DELAY"]);

function isFlop(n) {
  return n.type === "DFF" || n.type === "TFF" || n.type === "DLATCH" || n.type === "DELAY";
}

function clockValue(node, tick) {
  const period = Math.max(2, node.period ?? 2);
  const high = Math.max(1, Math.floor(period / 2));
  return ((tick + period - high) % period) < high ? 1 : 0;
}

/**
 * @param {object} circuit gate-engine circuit (may include clocked parts)
 * @param {Record<string, number|number[]>} programs node id -> held bit or per-tick array
 * @param {number} ticks number of ticks to run
 * @param {{ traceIds?: string[] }} opts record subset (default: every node)
 */
export function simulateClocked(circuit, programs = {}, ticks = 8, opts = {}) {
  const nodes = Object.values(circuit.nodes);
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const inc = new Map();
  for (const w of Object.values(circuit.wires)) {
    inc.set(`${w.to}:${w.toPin}`, w);
  }
  const valAt = (id, t) => {
    const p = programs[id];
    if (Array.isArray(p)) return t < p.length ? (p[t] ? 1 : 0) : (p.length ? (p[p.length - 1] ? 1 : 0) : 0);
    return p ? 1 : 0;
  };
  const state = {};
  for (const n of nodes) {
    if (isFlop(n)) state[n.id] = n.init ? 1 : 0;
  }
  const prevClk = {};
  const traces = {};

  for (let t = 0; t < ticks; t++) {
    // Driven sources (tick-constant).
    const driven = {};
    for (const n of nodes) {
      if (n.type === "INPUT") driven[n.id] = valAt(n.id, t);
      else if (n.type === "CLOCK") driven[n.id] = clockValue(n, t);
    }
    // Frozen flop outputs for cloud settling (DFF/TFF Q, opaque latch,
    // DELAY previous input). Latches track transparently inside settle.
    const frozen = { ...state };
    const settle = (frz) => {
      const out = { ...driven };
      for (const n of nodes) {
        if (n.type === "DFF" || n.type === "TFF" || n.type === "DELAY") out[n.id] = frz[n.id] ?? 0;
      }
      const srcVal = (w) => {
        const sn = byId[w.from];
        if (!sn) return 0;
        if ((sn.type === "DFF" || sn.type === "TFF") && w.fromPin === 1) {
          return (frz[sn.id] ?? 0) ? 0 : 1;
        }
        return out[w.from] ?? 0;
      };
      const readPin = (nodeId, pin) => {
        const w = inc.get(`${nodeId}:${pin}`);
        if (!w) return 0;
        return srcVal(w);
      };
      const maxPasses = nodes.length + 2;
      for (let pass = 0; pass < maxPasses; pass++) {
        const next = { ...out };
        let changed = false;
        for (const n of nodes) {
          if (n.type === "INPUT" || n.type === "CLOCK") continue;
          let v;
          if (n.type === "DFF" || n.type === "TFF" || n.type === "DELAY") {
            v = frz[n.id] ?? 0;
          } else if (n.type === "DLATCH") {
            v = readPin(n.id, 1) === 1 ? readPin(n.id, 0) : (frz[n.id] ?? 0);
          } else if (n.type === "OUTPUT" || n.type === "PROBE") {
            v = readPin(n.id, 0);
          } else if (GATE_DEFS[n.type] && !CLOCKED_TYPES.has(n.type)) {
            const k = GATE_DEFS[n.type].inputs;
            const ins = [];
            for (let p = 0; p < k; p++) ins.push(readPin(n.id, p));
            v = computeGate(n.type, ins);
          } else {
            throw new Error(`simulateClocked: unsupported type ${n.type}`);
          }
          if (next[n.id] !== v) { next[n.id] = v; changed = true; }
        }
        Object.assign(out, next);
        if (!changed) return { out, readPin, settled: true };
      }
      return { out, readPin: null, settled: false };
    };

    let s = settle(frozen);
    if (!s.settled) {
      for (const n of nodes) {
        if (opts.traceIds && !opts.traceIds.includes(n.id)) continue;
        (traces[n.id] ??= []).push(s.out[n.id] ?? 0);
      }
      return { traces, status: "UNSETTLED", unsettledTick: t };
    }
    // Edge capture into next-state...
    const nextState = { ...state };
    for (const n of nodes) {
      if (n.type === "DLATCH") {
        if (s.readPin(n.id, 1) === 1) nextState[n.id] = s.readPin(n.id, 0);
        continue;
      }
      if (n.type === "DELAY") {
        nextState[n.id] = s.readPin(n.id, 0);
        continue;
      }
      if (n.type !== "DFF" && n.type !== "TFF") continue;
      const w = inc.get(`${n.id}:1`);
      const cur = w ? s.readPin(n.id, 1) : 0;
      const had = n.id in prevClk;
      const prev = prevClk[n.id] ?? 0;
      prevClk[n.id] = cur;
      let q = state[n.id];
      if (had && prev === 0 && cur === 1) {
        q = n.type === "DFF" ? s.readPin(n.id, 0) : state[n.id] ^ s.readPin(n.id, 0);
      }
      nextState[n.id] = q;
    }
    // ...then async-reset propagation: captured states can assert R
    // combinationally (counter reset), so re-settle and force, bounded.
    for (let k = 0; k < 3; k++) {
      Object.assign(frozen, nextState);
      s = settle(frozen);
      if (!s.settled) {
        for (const n of nodes) {
          if (opts.traceIds && !opts.traceIds.includes(n.id)) continue;
          (traces[n.id] ??= []).push(s.out[n.id] ?? 0);
        }
        return { traces, status: "UNSETTLED", unsettledTick: t };
      }
      let fired = false;
      for (const n of nodes) {
        if (n.type !== "DFF" && n.type !== "TFF") continue;
        if (s.readPin(n.id, 2) === 1 && nextState[n.id] !== 0) {
          nextState[n.id] = 0;
          fired = true;
        }
      }
      if (!fired) break;
    }
    const delayHold = {};
    for (const n of nodes) {
      if (n.type === "DELAY") delayHold[n.id] = state[n.id] ?? 0;
    }
    Object.assign(state, nextState);
    // Record end-of-tick outputs: everything settled with the new flop
    // states, except DELAY (definitionally previous-tick input).
    const fin = settle({ ...state, ...delayHold });
    for (const n of nodes) {
      if (opts.traceIds && !opts.traceIds.includes(n.id)) continue;
      const v = fin.settled ? (fin.out[n.id] ?? 0) : (s.out[n.id] ?? 0);
      (traces[n.id] ??= []).push(v);
    }
  }
  return { traces, status: "OK" };
}

/**
 * Evaluate a clocked level.
 * level.tests = [{ in: {name: scalar|array}, ticks, expect: {probeName: [...]}}]
 * nameToId maps level input/probe names to node ids.
 */
export function evaluateClocked(circuit, level, nameToId) {
  const results = [];
  for (const t of level.tests) {
    const programs = {};
    for (const [name, v] of Object.entries(t.in ?? {})) {
      const id = nameToId[name];
      if (!id) return { passed: false, results, error: `unknown input '${name}'` };
      programs[id] = v;
    }
    const ticks = t.ticks ?? Math.max(...Object.values(t.expect).map((w) => w.length));
    const sim = simulateClocked(circuit, programs, ticks);
    const diffs = [];
    if (sim.status !== "OK") {
      diffs.push({ status: sim.status, tick: sim.unsettledTick });
    } else {
      for (const [pname, wave] of Object.entries(t.expect)) {
        const id = nameToId[pname];
        if (!id) return { passed: false, results, error: `unknown probe '${pname}'` };
        const got = sim.traces[id] ?? [];
        for (let i = 0; i < wave.length; i++) {
          if ((got[i] ?? 0) !== (wave[i] ? 1 : 0)) {
            diffs.push({ probe: pname, tick: i, expected: wave[i] ? 1 : 0, actual: got[i] ?? 0 });
            break;
          }
        }
      }
    }
    results.push({ ok: diffs.length === 0, diffs });
  }
  return { passed: results.every((r) => r.ok), results };
}
