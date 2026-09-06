# 01 — Game Design

## Fantasy
"You are the CPU wiring tech. Given a spec (lamp on when...), wire the gates."

## Core loop
1. Read goal ("Build XOR from AND/OR/NOT" + truth table preview).
2. Drag gates from palette → canvas.
3. Wire: click output pin → click input pin (or drag). Click wire to delete.
4. Toggle INPUT switches, watch OUTPUT lamps + live wire colors update instantly.
5. Press **Check solution** → runs all test cases → pass/fail per case + stars.
6. Unlock next level. Progress saved.

## Controls
- **Add:** click palette button (or drag). Gate spawns at canvas center with small offset.
- **Move:** drag component body (pointer events, works touch).
- **Pan?** No pan in v1 — fixed 960×520 canvas with grid. Enough for ≤14 gates.
- **Wire:** mousedown on output pin, mouseup on input pin. Esc cancels. Each input accepts exactly 1 wire (new wire replaces old). Outputs fan out unlimited.
- **Delete:** select component or wire → Del/Backspace button or ×. INPUT/OUTPUT terminals of a challenge are locked (can't delete/move off-limits? movable but not deletable).
- **Toggle input:** click INPUT body.
- **Verify:** button + auto live-preview of current input combination.

## Visual language
- Dark lab bench, grid dots, glowing wires: green = 1, slate = 0, amber pulse = oscillating/unstable (cycle).
- Gates: traditional ANSI symbols drawn as inline SVG (triangle+bubble NOT,
  D-shaped AND, curved/pointed OR, bubbles on NAND/NOR/XNOR, pre-curve on
  XOR/XNOR) with leads reaching the clickable pins; inputs = toggle switches,
  outputs = lamps.
- Truth-table side panel shows expected vs actual for current toggle state + full check results.

## Rules
- Combinational only. Feedback loops flagged as `UNSTABLE` and fail verification.
- Unconnected gate input reads as `0` (and is highlighted to nudge wiring). Unconnected OUTPUT terminal reads `0`.
- Parts budget: each level lists `allowed: { AND: 4, ... }` or `Infinity` in sandbox. Exceeding blocks placement.
- Stars: ★ pass, ★★ pass at par gate count, ★★★ pass under par (par defined per level).

## Screens
1. **Header:** title, mode tabs (Challenges / Sandbox), sound? none, Reset, Help.
2. **Level select:** 12 cards with lock/unlock, stars, short tag.
3. **Workbench:** left palette, center canvas (SVG wires + HTML nodes), right spec panel (goal, truth table, check button, results).
4. **Help modal:** gate cheat-sheet + how to wire.

## Accessibility
- All buttons real `<button>`, pins are `<button>` with aria-labels.
- Keyboard: Tab to input switch → Space toggles; Delete removes selection.
- Color is never the only signal: lamps also show 0/1 text; wires differ in brightness + dash for 0.

## Difficulty curve
L1–L3 single-gate fluency → L4–L7 derived gates with budget pressure (NAND-only etc.) → L8–L9 arithmetic → L10–L12 choice/routing (MUX, majority, comparator).
Full table in `plans/03-levels-progression.md`.
