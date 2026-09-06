/**
 * Traditional ANSI-style logic-gate artwork as inline SVG strings.
 * Pure module (no DOM) so Node tests can assert on the markup.
 *
 * Coordinate space matches the node box: 92 wide, 52 tall (NOT) or
 * 68 tall (2-input gates). Input leads end where the pin buttons sit
 * (y=23/45, x=0) and output leads reach x=92 at mid-height, so the
 * drawn symbol always lines up with the clickable pins.
 */

export const GATE_ART_HEIGHT = {
  NOT: 52,
  AND: 68,
  OR: 68,
  NAND: 68,
  NOR: 68,
  XOR: 68,
  XNOR: 68,
  CLOCK: 52,
  DFF: 68,
  TFF: 68,
  DLATCH: 68,
  DELAY: 52,
};

const LEAD = "#8ea2c8";
const BODY_FILL = "#22315a";
const INK = "#e8eefc";
const BUBBLE_FILL = "#16213c";

const inLeads = (x) =>
  `<path d="M0 23H${x}M0 45H${x}" stroke="${LEAD}" stroke-width="2" fill="none"/>`;
const outLead = (x1) =>
  `<path d="M${x1} 34H92" stroke="${LEAD}" stroke-width="2" fill="none"/>`;
const bubble = (cx, cy) =>
  `<circle cx="${cx}" cy="${cy}" r="4.5" fill="${BUBBLE_FILL}" stroke="${INK}" stroke-width="2"/>`;

const AND_BODY = `<path d="M24 14H46A20 20 0 0 1 46 54H24Z" fill="${BODY_FILL}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`;
const OR_BODY = `<path d="M24 12C32 24 32 44 24 56L31 56C45 52 57 44 65 34C57 24 45 16 31 12Z" fill="${BODY_FILL}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`;
const XOR_PRE = `<path d="M17 12C25 24 25 44 17 56" fill="none" stroke="${INK}" stroke-width="2"/>`;
const NOT_BODY = `<path d="M26 12L26 40L58 26Z" fill="${BODY_FILL}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`;
const flopBody = (main, h) =>
  `<rect x="16" y="8" width="60" height="${h - 16}" fill="${BODY_FILL}" stroke="${INK}" stroke-width="2"/>`
  + `<text x="22" y="22" fill="${INK}" font-size="11">${main}</text>`
  + `<text x="22" y="38" fill="${LEAD}" font-size="9">CLK</text>`
  + `<polygon points="8,30 8,38 15,34" fill="${INK}"/>`
  + `<text x="22" y="56" fill="${LEAD}" font-size="9">R</text>`
  + `<text x="62" y="28" fill="${INK}" font-size="11">Q</text>`
  + `<text x="58" y="50" fill="${LEAD}" font-size="9">Qb</text>`;

function art(type) {
  switch (type) {
    case "AND":
      return `${inLeads(24)}${AND_BODY}${outLead(66)}`;
    case "NAND":
      return `${inLeads(24)}${AND_BODY}${bubble(70.5, 34)}${outLead(75)}`;
    case "OR":
      return `${inLeads(30)}${OR_BODY}${outLead(65)}`;
    case "NOR":
      return `${inLeads(30)}${OR_BODY}${bubble(69.5, 34)}${outLead(74)}`;
    case "XOR":
      return `${inLeads(23)}${XOR_PRE}${OR_BODY}${outLead(65)}`;
    case "XNOR":
      return `${inLeads(23)}${XOR_PRE}${OR_BODY}${bubble(69.5, 34)}${outLead(74)}`;
    case "NOT":
      return (
        `<path d="M0 26H26" stroke="${LEAD}" stroke-width="2" fill="none"/>` +
        `${NOT_BODY}${bubble(62.5, 26)}` +
        `<path d="M67 26H92" stroke="${LEAD}" stroke-width="2" fill="none"/>`
      );
    case "DFF":
    case "TFF": {
      const main = type === "DFF" ? "D" : "T";
      return (
        `<path d="M0 17H16M0 34H16M0 51H16" stroke="${LEAD}" stroke-width="2" fill="none"/>` +
        `${flopBody(main, 68)}` +
        `<path d="M76 23H92M76 45H92" stroke="${LEAD}" stroke-width="2" fill="none"/>`
      );
    }
    case "DLATCH":
      return (
        `<path d="M0 23H16M0 45H16" stroke="${LEAD}" stroke-width="2" fill="none"/>` +
        `<rect x="16" y="8" width="60" height="52" fill="${BODY_FILL}" stroke="${INK}" stroke-width="2"/>` +
        `<text x="22" y="28" fill="${INK}" font-size="11">D</text>` +
        `<text x="22" y="50" fill="${LEAD}" font-size="9">EN</text>` +
        `<text x="62" y="39" fill="${INK}" font-size="11">Q</text>` +
        `<path d="M76 34H92" stroke="${LEAD}" stroke-width="2" fill="none"/>`
      );
    case "CLOCK":
      return (
        `<circle cx="42" cy="26" r="17" fill="${BODY_FILL}" stroke="${INK}" stroke-width="2"/>` +
        `<text x="42" y="31" fill="${INK}" font-size="12" text-anchor="middle">CLK</text>` +
        `<path d="M59 26H92" stroke="${LEAD}" stroke-width="2" fill="none"/>`
      );
    case "DELAY":
      return (
        `<path d="M0 26H16" stroke="${LEAD}" stroke-width="2" fill="none"/>` +
        `<rect x="16" y="10" width="60" height="32" fill="${BODY_FILL}" stroke="${INK}" stroke-width="2"/>` +
        `<text x="46" y="32" fill="${INK}" font-size="12" text-anchor="middle">Δ1</text>` +
        `<path d="M76 26H92" stroke="${LEAD}" stroke-width="2" fill="none"/>`
      );
    default:
      throw new Error(`No gate artwork for type: ${type}`);
  }
}

/** SVG markup for a gate symbol. Throws for non-gate types (INPUT/OUTPUT). */
export function gateSVG(type) {
  const h = GATE_ART_HEIGHT[type];
  if (!h) throw new Error(`No gate artwork for type: ${type}`);
  return `<svg class="gate" viewBox="0 0 92 ${h}" width="92" height="${h}" aria-hidden="true">${art(type)}</svg>`;
}
