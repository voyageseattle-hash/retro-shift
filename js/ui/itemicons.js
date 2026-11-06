// The SEAM CHARGE icons: one bold, distinct shape per charge, so what you're holding reads at a glance on a TV from
// the couch (shape first, colour second). Inline SVG, 64x64, drawn in neon strokes like the rest of the HUD.

const S = (body) => `<svg viewBox="0 0 64 64" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ITEM_ICONS = {
  // LENS CELL: a battery split red | blue with a lightning core: free lens
  cell: S(`<rect x="12" y="18" width="38" height="28" rx="4" stroke="#fff" stroke-width="4"/>
    <rect x="50" y="26" width="5" height="12" rx="1.5" fill="#fff"/>
    <rect x="17" y="23" width="13" height="18" rx="1" fill="#ff3b5c"/>
    <rect x="32" y="23" width="13" height="18" rx="1" fill="#2a8cff"/>`),
  // EMP: a burst ring round a lightning bolt
  emp: S(`<circle cx="32" cy="32" r="25" stroke="#6ae0ff" stroke-width="3.5" stroke-dasharray="7 5"/>
    <path d="M35 10 L20 35 H31 L28 54 L45 27 H34 Z" fill="#6ae0ff" stroke="#e8fbff" stroke-width="2"/>`),
  // FLIP: two arrows chasing round, red and blue: everyone else swaps worlds
  flip: S(`<path d="M14 28 A18 18 0 0 1 46 20" stroke="#ff3b5c" stroke-width="5"/>
    <path d="M40 12 L48 21 L37 25" stroke="#ff3b5c" stroke-width="5"/>
    <path d="M50 36 A18 18 0 0 1 18 44" stroke="#2a8cff" stroke-width="5"/>
    <path d="M24 52 L16 43 L27 39" stroke="#2a8cff" stroke-width="5"/>`),
  // LIGHTSPEED: a streak of light ending in a hot point
  beam: S(`<path d="M6 40 H40" stroke="#fff6a8" stroke-width="4"/>
    <path d="M12 30 H44" stroke="#fff6a8" stroke-width="3" opacity="0.7"/>
    <path d="M10 50 H34" stroke="#fff6a8" stroke-width="2.5" opacity="0.5"/>
    <path d="M38 22 L58 36 L38 50 Z" fill="#fff6a8" stroke="#fff" stroke-width="2"/>`),
  // SEAM WALL: a brick barrier
  wall: S(`<rect x="8" y="16" width="48" height="34" stroke="#ff8a3a" stroke-width="4"/>
    <path d="M8 27 H56 M8 38 H56 M24 16 V27 M40 16 V27 M16 27 V38 M32 27 V38 M48 27 V38 M24 38 V50 M40 38 V50" stroke="#ff8a3a" stroke-width="3"/>`),
  // PATCH: a medic cross
  patch: S(`<path d="M24 8 H40 V24 H56 V40 H40 V56 H24 V40 H8 V24 H24 Z" fill="#163a22" stroke="#7aff9a" stroke-width="4"/>
    <path d="M32 18 V46 M18 32 H46" stroke="#7aff9a" stroke-width="5"/>`),
  // nothing held: an empty prism outline
  none: S(`<path d="M32 8 L54 46 H10 Z" stroke="#8a7aa8" stroke-width="3" stroke-dasharray="5 5"/>`),
};
