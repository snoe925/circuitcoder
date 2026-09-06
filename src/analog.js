/**
 * Op-Amp Lab — idealized analog DC solver (pure, no DOM).
 *
 * Modified nodal analysis for resistors + independent sources; ideal
 * op-amps obey V+ ≈ V− while the output stays within ±Vsat, else the
 * output clamps to the rail (re-solved with the output fixed). DC only:
 * no capacitors, no transient/AC, no non-ideal specs.
 *
 * Net model mirrors cmos.js: explicit nets, devices reference net ids:
 *   RES   { a, b, r }            VSRC { p, m } (volts from inputValues)
 *   OPAMP { out, vp, vm }        SUP  { net, volts }   GND/PROBE { net }
 */

export const ANALOG_KINDS = ["OPAMP", "RES", "VSRC", "SUP", "GND", "PROBE"];
export const ANALOG_PARTS = ["OPAMP", "RES"]; // budgeted; sources/rails/probes are free
export const RES_VALUES = [1000, 10000, 100000];
// Finite op-amp gain for the linear model: exact enough (nanovolts) while
// keeping every system non-singular — including open-loop comparators,
// where a hard V+≈V− constraint would contradict stiff input sources.
export const OP_GAIN = 1e9;

function gauss(A, b) {
  // Gaussian elimination with partial pivot; A is n×n, mutated. Returns x or null if singular.
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    }
    if (Math.abs(M[piv][col]) < 1e-12) return null;
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      if (f !== 0) for (let k = col; k <= n; k++) M[r][k] -= f * M[col][k];
    }
  }
  return M.map((row, i) => row[n] / M[i][i]);
}

/**
 * Solve one DC operating point.
 * @param {{ nets: string[], ground: string[], resistors, vsrcs, opamps, fixed?: Map }}
 *   resistors: [{a,b,r}], vsrcs: [{p,m,v}], opamps: [{out,vp,vm}]
 *   fixed: netId -> volts (clamped op-amp outputs)
 * @param {number} vsat saturation magnitude (unused when no op-amps clamp)
 * @returns {{ voltages: Map<string,number>, ok: boolean }}
 */
export function solveDC(spec) {
  const ground = new Set(spec.ground ?? []);
  const fixed = spec.fixed ?? new Map();
  const unknowns = spec.nets.filter((n) => !ground.has(n) && !fixed.has(n));
  const idx = new Map(unknowns.map((n, i) => [n, i]));
  let n = unknowns.length;
  // Extra current unknowns for voltage sources + linear (unclamped) op-amps.
  const srcs = [...(spec.vsrcs ?? []).map((s) => ({ ...s, kind: "v" }))];
  for (const o of spec.opamps ?? []) {
    if (!fixed.has(o.out)) srcs.push({ kind: "op", ref: o });
  }
  const size = n + srcs.length;
  const A = Array.from({ length: size }, () => new Array(size).fill(0));
  const b = new Array(size).fill(0);
  const V = (nid) => (ground.has(nid) ? 0 : fixed.has(nid) ? fixed.get(nid) : null);

  for (const { a, b: bb, r } of spec.resistors ?? []) {
    const g = 1 / r;
    const va = V(a), vb = V(bb);
    if (va === null && vb === null) {
      A[idx.get(a)][idx.get(a)] += g; A[idx.get(bb)][idx.get(bb)] += g;
      A[idx.get(a)][idx.get(bb)] -= g; A[idx.get(bb)][idx.get(a)] -= g;
    } else if (va === null) {
      A[idx.get(a)][idx.get(a)] += g; b[idx.get(a)] += g * vb;
    } else if (vb === null) {
      A[idx.get(bb)][idx.get(bb)] += g; b[idx.get(bb)] += g * va;
    }
  }
  srcs.forEach((s, k) => {
    const row = n + k;
    if (s.kind === "op") {
      // Ideal-ish op-amp as VCVS: Vout = A·(V+ − V−), current into `out`.
      const o = s.ref;
      const put = (nid, coeff) => {
        const v = V(nid);
        if (v === null) A[row][idx.get(nid)] += coeff;
        else b[row] -= coeff * v;
      };
      put(o.out, 1); put(o.vp, -OP_GAIN); put(o.vm, OP_GAIN);
      A[idx.get(o.out)][row] += 1;
    } else {
      // Independent source: current unknown, constraint V(p) − V(m) = v.
      const vp = s.p == null ? 0 : V(s.p);
      const vm = s.m == null ? 0 : V(s.m);
      if (s.p != null && vp === null) { A[idx.get(s.p)][row] += 1; A[row][idx.get(s.p)] += 1; }
      if (s.m != null && vm === null) { A[idx.get(s.m)][row] -= 1; A[row][idx.get(s.m)] -= 1; }
      b[row] = s.v - (vp === null ? 0 : vp) + (vm === null ? 0 : vm);
    }
  });
  const x = gauss(A, b);
  if (!x) return { voltages: new Map(), ok: false };
  const voltages = new Map();
  for (const nid of spec.nets) {
    if (ground.has(nid)) voltages.set(nid, 0);
    else if (fixed.has(nid)) voltages.set(nid, fixed.get(nid));
    else voltages.set(nid, x[idx.get(nid)]);
  }
  return { voltages, ok: true };
}

/**
 * Full op-amp-aware solve with saturation. Out-of-rail outputs are clamped
 * by *consistency search* (which rail keeps V+/V− polarity agreeing?), not
 * by the sign of the linear solution — the linear equilibrium of a
 * positive-feedback circuit is unstable and can point at the wrong rail.
 */
export function simulateAnalog(spec, vsat = 11) {
  const fixed = new Map([
    ...(spec.supply ?? []).map((s) => [s.net, s.v]),
    ...(spec.fixed ?? []),
  ]);
  const ops = spec.opamps ?? [];
  const clamped = [];
  for (let iter = 0; iter < 2 * ops.length + 3; iter++) {
    const r = solveDC({ ...spec, fixed });
    if (!r.ok) return { voltages: r.voltages, ok: false, saturated: clamped, ticks: iter };
    const over = ops.filter((o) => !fixed.has(o.out) && Math.abs(r.voltages.get(o.out) ?? 0) > vsat);
    if (over.length === 0) {
      return { voltages: r.voltages, ok: true, saturated: clamped, ticks: iter + 1 };
    }
    over.sort((a, b) => Math.abs(r.voltages.get(b.out)) - Math.abs(r.voltages.get(a.out)));
    const o = over[0];
    fixed.set(o.out, pickRail(spec, fixed, o, vsat, Math.sign(r.voltages.get(o.out))));
    clamped.push(o.out);
  }
  const r = solveDC({ ...spec, fixed });
  return { voltages: r.voltages, ok: r.ok, saturated: clamped, ticks: 2 * ops.length + 3 };
}

function pickRail(spec, fixed, o, vsat, linearSign) {
  const good = [];
  for (const rail of [vsat, -vsat]) {
    const t = solveDC({ ...spec, fixed: new Map([...fixed, [o.out, rail]]) });
    if (!t.ok) continue;
    const vd = (t.voltages.get(o.vp) ?? 0) - (t.voltages.get(o.vm) ?? 0);
    if ((rail > 0 && vd > -1e-9) || (rail < 0 && vd < 1e-9)) good.push(rail);
  }
  if (good.length === 1) return good[0];
  // none or ambiguous (hysteresis band on a fresh solve): fall back to linear sign
  return linearSign >= 0 ? vsat : -vsat;
}

/**
 * Transfer sweep with memory: carried saturation clamps are kept while the
 * op-amp input polarity still agrees with them, so Schmitt triggers plot
 * a hysteresis loop instead of a single step.
 * @returns [{ vin, vout }]
 */
export function sweepTransfer(spec, srcId, probeNet, points = 21, vsat = 11, vmin = -12, vmax = 12) {
  const out = [];
  let fixed = new Map(); // netId -> rail volts, carried across the sweep
  for (let i = 0; i < points; i++) {
    const vin = vmin + ((vmax - vmin) * i) / (points - 1);
    const vsrcs = (spec.vsrcs ?? []).map((s) => (s.id === srcId ? { ...s, v: vin } : s));
    let trial = fixed.size > 0 ? solveDC({ ...spec, vsrcs, fixed }) : null;
    let consistent = !!trial?.ok;
    if (consistent) {
      for (const [nid, rail] of fixed) {
        const o = (spec.opamps ?? []).find((x) => x.out === nid);
        if (!o) continue;
        const vd = (trial.voltages.get(o.vp) ?? 0) - (trial.voltages.get(o.vm) ?? 0);
        if ((rail > 0 && vd < -1e-9) || (rail < 0 && vd > 1e-9)) { consistent = false; break; }
      }
    }
    if (!consistent) {
      const fresh = simulateAnalog({ ...spec, vsrcs }, vsat);
      fixed = new Map(fresh.saturated.map((nid) => [nid, fresh.voltages.get(nid)]));
      out.push({ vin, vout: fresh.ok ? fresh.voltages.get(probeNet) : NaN });
    } else {
      out.push({ vin, vout: trial.voltages.get(probeNet) });
      // keep carried clamps and absorb any newly saturated outputs
      const full = simulateAnalog({ ...spec, vsrcs, fixed }, vsat);
      for (const nid of full.saturated) fixed.set(nid, full.voltages.get(nid));
    }
  }
  return out;
}

// ---------- bench net model (shared with the future UI) ----------

// Pin keys per kind; single-pin kinds use "S".
export function analogPins(kind) {
  if (kind === "OPAMP") return ["OUT", "+", "-"];
  if (kind === "RES") return ["A", "B"];
  if (kind === "VSRC") return ["P", "M"];
  return ["S"]; // SUP, GND, PROBE
}

/**
 * Build a solver spec from bench state: devices {id,kind,...} plus
 * segs [{from:{dev,pin}, to:{dev,pin}}] merged by union-find.
 * VSRC volts come from inputValues keyed by device id.
 */
export function buildAnalogSpec(devices, segs, inputValues = {}) {
  const parent = {};
  const key = (dev, pin) => `${dev}:${pin}`;
  const find = (x) => {
    parent[x] ??= x;
    while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
    return x;
  };
  for (const d of Object.values(devices)) {
    for (const p of analogPins(d.kind)) find(key(d.id, p));
  }
  for (const s of Object.values(segs)) {
    find(key(s.from.dev, s.from.pin)); find(key(s.to.dev, s.to.pin));
    parent[find(key(s.from.dev, s.from.pin))] = find(key(s.to.dev, s.to.pin));
  }
  const nets = [];
  const rootToNet = {};
  const endpointNet = {};
  for (const d of Object.values(devices)) {
    for (const p of analogPins(d.kind)) {
      const root = find(key(d.id, p));
      if (!rootToNet[root]) {
        const nid = `n${nets.length}`;
        nets.push(nid);
        rootToNet[root] = nid;
      }
      endpointNet[key(d.id, p)] = rootToNet[root];
    }
  }
  const T = (dev, pin) => endpointNet[key(dev, pin)];
  const spec = { nets, ground: [], supply: [], resistors: [], vsrcs: [], opamps: [] };
  for (const d of Object.values(devices)) {
    switch (d.kind) {
      case "OPAMP":
        spec.opamps.push({ out: T(d.id, "OUT"), vp: T(d.id, "+"), vm: T(d.id, "-") });
        break;
      case "RES":
        spec.resistors.push({ a: T(d.id, "A"), b: T(d.id, "B"), r: d.r ?? 10000 });
        break;
      case "VSRC":
        spec.vsrcs.push({ id: d.id, p: T(d.id, "P"), m: T(d.id, "M"), v: inputValues[d.id] ?? 0 });
        break;
      case "SUP":
        spec.supply.push({ net: T(d.id, "S"), v: d.volts ?? 12 });
        break;
      case "GND":
        spec.ground.push(T(d.id, "S"));
        break;
      case "PROBE": break;
      default: throw new Error(`buildAnalogSpec: unknown kind ${d.kind}`);
    }
  }
  return { spec, endpointNet };
}

/** Count budgeted parts (OPAMP/RES only). */
export function countAnalogParts(devices) {
  const used = {};
  for (const d of Object.values(devices)) {
    if (d.kind === "OPAMP" || d.kind === "RES") used[d.kind] = (used[d.kind] ?? 0) + 1;
  }
  return used;
}

/**
 * Evaluate an analog level with tolerance.
 * level.tests = [{ in: [volts...], out: [volts...] }], tol in volts.
 */
export function evaluateAnalog(build, level, inIds, probeKeys, tol = 0.3, vsat = 11) {
  const results = [];
  for (const t of level.tests) {
    const inputValues = {};
    inIds.forEach((id, i) => { inputValues[id] = t.in[i]; });
    const { spec, endpointNet } = build(inputValues);
    const sim = simulateAnalog(spec, vsat);
    const actual = probeKeys.map((k) => sim.voltages.get(endpointNet[k]));
    const ok = sim.ok && actual.every((v, i) =>
      v !== undefined && !Number.isNaN(v) && Math.abs(v - t.out[i]) <= tol);
    results.push({ in: [...t.in], expected: [...t.out], actual, ok });
  }
  return { passed: results.every((r) => r.ok), results };
}
