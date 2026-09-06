/**
 * Logic minimization: Quine–McCluskey with don't-cares + essentials/greedy
 * cover, ASCII K-map rendering, and SOP pretty-printing.
 *
 * Cover format shared with level data: [[[var, polarity]]] where
 * polarity 1 = true literal, 0 = complemented. Minterm indices assume
 * vars[0] is MSB (same numbering as engine allCombos rows).
 */

function bits(n, count) {
  const b = [];
  for (let i = count - 1; i >= 0; i--) b.push((n >> i) & 1);
  return b; // b[i] corresponds to vars[i]
}

function combineTerms(a, b, nvars) {
  if (a.mask !== b.mask) return null;
  let diff = -1;
  for (let i = 0; i < nvars; i++) {
    if (a.mask & (1 << i)) continue;
    if (a.vals[i] !== b.vals[i]) {
      if (diff >= 0) return null;
      diff = i;
    }
  }
  if (diff < 0) return null;
  return {
    mask: a.mask | (1 << diff),
    vals: a.vals.slice(),
    covers: [...new Set([...a.covers, ...b.covers])],
  };
}

/**
 * Minimize a boolean function.
 * @param {{on: number[], dc?: number[], vars: string[]}} spec
 * @returns {{cover: [[[string, 0|1]]], constant: 0|1|null}}
 * constant is 0/1 when the function is constant (cover [] means constant-0;
 * a [[]] single empty term means constant-1).
 */
export function minimize({ on, dc = [], vars }) {
  const nvars = vars.length;
  if (nvars < 1 || nvars > 6) throw new Error("minimize: need 1–6 vars");
  const max = 2 ** nvars;
  for (const m of [...on, ...dc]) {
    if (!Number.isInteger(m) || m < 0 || m >= max)
      throw new Error(`minimize: minterm ${m} out of range for ${nvars} vars`);
  }
  if (on.length === 0) return { cover: [], constant: 0 };

  let terms = [...new Set([...on, ...dc])].map((m) => ({
    mask: 0, vals: bits(m, nvars), covers: [m],
  }));
  const primes = [];
  const seen = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    const used = new Set(terms.map((_, i) => i));
    const next = [];
    const nextSeen = new Set();
    for (let i = 0; i < terms.length; i++) {
      for (let j = i + 1; j < terms.length; j++) {
        const c = combineTerms(terms[i], terms[j], nvars);
        if (c) {
          used.delete(i); used.delete(j);
          const k = `${c.mask}:${c.vals.join("")}`;
          if (!nextSeen.has(k)) { nextSeen.add(k); next.push(c); }
          changed = true;
        }
      }
    }
    for (const i of used) {
      const k = `${terms[i].mask}:${terms[i].vals.join("")}`;
      if (!seen.has(k)) { seen.add(k); primes.push(terms[i]); }
    }
    terms = next;
  }

  const uncovered = new Set(on);
  const chosen = [];
  while (uncovered.size > 0) {
    let picked = null;
    for (const m of uncovered) {
      const ps = primes.filter((p) => p.covers.includes(m));
      if (ps.length === 1) { picked = ps[0]; break; }
    }
    if (!picked) {
      let best = -1;
      for (const p of primes) {
        const n = p.covers.filter((m) => uncovered.has(m)).length;
        if (n > best) { best = n; picked = p; }
      }
      if (!picked) throw new Error("minimize: cover failed (unreachable)");
    }
    chosen.push(picked);
    for (const m of picked.covers) uncovered.delete(m);
  }
  const cover = [];
  const seenC = new Set();
  for (const p of chosen) {
    const k = `${p.mask}:${p.vals.join("")}`;
    if (seenC.has(k)) continue;
    seenC.add(k);
    const lits = [];
    for (let i = 0; i < nvars; i++) {
      if (!(p.mask & (1 << i))) lits.push([vars[i], p.vals[i]]);
    }
    cover.push(lits);
  }
  const constant = cover.length === 1 && cover[0].length === 0 ? 1 : null;
  return { cover, constant };
}

const GRAY2 = ["00", "01", "11", "10"];

/**
 * ASCII K-map for 2–4 vars. `on`/`dc` are minterm indices (vars[0] = MSB).
 * Cell marks: 1 = on, d = don't-care, 0 = off.
 */
export function kmapString({ on, dc = [], vars }) {
  const n = vars.length;
  if (n < 2 || n > 4) throw new Error("kmapString: need 2–4 vars");
  const onSet = new Set(on), dcSet = new Set(dc);
  const split = n === 4 ? 2 : 1; // row vars | col vars
  const rowCodes = split === 1 ? ["0", "1"] : GRAY2;
  const colCodes = n - split === 1 ? ["0", "1"] : GRAY2;
  const cell = (m) => (onSet.has(m) ? "1" : dcSet.has(m) ? "d" : "0");
  const lines = [];
  lines.push(`      ${vars.slice(split).join("")}  ${colCodes.join("  ")}`);
  lines.push(`     ${vars.slice(0, split).join("")} +${"---+".repeat(colCodes.length)}`);
  for (const r of rowCodes) {
    const row = colCodes.map((c) => cell(parseInt(r + c, 2)));
    lines.push(`     ${r} | ${row.join(" | ")} |`);
  }
  lines.push(`       +${"---+".repeat(colCodes.length)}`);
  return lines.join("\n");
}

/** Pretty-print a cover, e.g. `¬x∧¬z ∨ y ∨ x∧z ∨ w`. */
export function coverString(cover) {
  if (cover.length === 0) return "0";
  return cover
    .map((term) =>
      term.length === 0 ? "1" : term.map(([v, pol]) => (pol ? v : `¬${v}`)).join("∧")
    )
    .join(" ∨ ");
}
