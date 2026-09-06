/**
 * Op-Amp Lab catalogue O1–O8. VSRC inputs, rails (+12/−12/GND) and PROBE
 * meters are free bench infrastructure; `allowed` budgets OPAMP/RES only.
 * Tests are { in: [volts...], out: [volts...] } with per-level tol.
 */
export const LEVELS_ANALOG = [
  { id: "o-follow", mode: "analog", chapter: "Op-Amp Lab", name: "Voltage Follower", tag: "Buffer",
    briefing: "Wire output back to − and the source to +. The op-amp copies Vin to Vout.",
    allowed: { OPAMP: 1 }, par: 1, inputs: ["Vin"], probes: ["Out"], tol: 0.2,
    tests: [{ in: [-5], out: [-5] }, { in: [0], out: [0] }, { in: [3.3], out: [3.3] }] },
  { id: "o-comp", mode: "analog", chapter: "Op-Amp Lab", name: "Comparator", tag: "Bang-bang",
    briefing: "Open loop against a 6V divider (two 10k from +12 to GND): Vin above 6 slams +, below slams −. Stay clear of exactly 6.",
    allowed: { OPAMP: 1, RES: 2 }, par: 3, inputs: ["Vin"], probes: ["Out"], tol: 0.5,
    tests: [{ in: [0], out: [-11] }, { in: [5.9], out: [-11] }, { in: [6.1], out: [11] }, { in: [12], out: [11] }] },
  { id: "o-noninv", mode: "analog", chapter: "Op-Amp Lab", name: "Non-inverting Amp", tag: "Gain ×11",
    briefing: "Gain = 1 + Rf/R1: 1k to GND, 10k feedback. 1V in → 11V out (mind the rails).",
    allowed: { OPAMP: 1, RES: 2 }, par: 3, inputs: ["Vin"], probes: ["Out"], tol: 0.3,
    tests: [{ in: [0], out: [0] }, { in: [0.5], out: [5.5] }, { in: [1], out: [11] }] },
  { id: "o-inv", mode: "analog", chapter: "Op-Amp Lab", name: "Inverting Amp", tag: "Gain −10",
    briefing: "Gain = −Rf/Rin: 1k in, 10k back, + grounded. Sign flips, magnitude ×10.",
    allowed: { OPAMP: 1, RES: 2 }, par: 3, inputs: ["Vin"], probes: ["Out"], tol: 0.3,
    tests: [{ in: [1], out: [-10] }, { in: [-0.5], out: [5] }, { in: [0], out: [0] }] },
  { id: "o-sum", mode: "analog", chapter: "Op-Amp Lab", name: "Summing Amp", tag: "Mix",
    briefing: "Two 10k inputs, one 10k back: Out = −(Va+Vb). Superposition you can touch.",
    allowed: { OPAMP: 1, RES: 3 }, par: 4, inputs: ["Va", "Vb"], probes: ["Out"], tol: 0.3,
    tests: [{ in: [0, 0], out: [0] }, { in: [1, 0], out: [-1] }, { in: [0, 1], out: [-1] }, { in: [1, 1], out: [-2] }, { in: [2, -1], out: [-1] }] },
  { id: "o-schmitt", mode: "analog", chapter: "Op-Amp Lab", name: "Schmitt Trigger", tag: "Hysteresis",
    briefing: "Positive feedback to + (1k in, 10k back, − grounded): the trip points split to ∓1.1V. Static extremes checked here — open the transfer plot to see the loop.",
    allowed: { OPAMP: 1, RES: 2 }, par: 3, inputs: ["Vin"], probes: ["Out"], tol: 0.5,
    tests: [{ in: [5], out: [11] }, { in: [-5], out: [-11] }] },
  { id: "o-diff", mode: "analog", chapter: "Op-Amp Lab", name: "Difference Amp", tag: "Subtract",
    briefing: "Four matched 10k: Out = Vb−Va. Common signals cancel, differences amplify.",
    allowed: { OPAMP: 1, RES: 4 }, par: 5, inputs: ["Va", "Vb"], probes: ["Out"], tol: 0.3,
    tests: [{ in: [0, 0], out: [0] }, { in: [1, 0], out: [-1] }, { in: [0, 1], out: [1] }, { in: [2, 1], out: [-1] }, { in: [1, 2], out: [1] }] },
  { id: "o-clip", mode: "analog", chapter: "Op-Amp Lab", name: "Clipping Lab", tag: "Rails",
    briefing: "Same ×11 amp as before, but drive it with 2V: the math says 22, the rails say ±11. Design on the edge — verify it clips exactly.",
    allowed: { OPAMP: 1, RES: 2 }, par: 3, inputs: ["Vin"], probes: ["Out"], tol: 0.3,
    tests: [{ in: [2], out: [11] }, { in: [-2], out: [-11] }, { in: [0.5], out: [5.5] }] },
];
