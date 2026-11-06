// Rival portraits for the RADIO box: each driver drawn in neon line work on a dark card, the way the game draws
// everything else. talk(0..1) opens the mouth, so the box can lip-flap while their radio voice plays.

const TAU = Math.PI * 2;
const hex = (c) => '#' + c.toString(16).padStart(6, '0');

// the head and shoulders every portrait starts from (the 8-bit kid and the shark draw their own)
function bust(g, col, { jaw = 1, neck = true } = {}) {
  g.strokeStyle = col;
  g.beginPath();
  g.moveTo(14, 120);
  g.quadraticCurveTo(22, 92, 60, 88);
  g.quadraticCurveTo(98, 92, 106, 120);
  g.stroke();
  if (neck) {
    g.beginPath();
    g.moveTo(52, 90);
    g.lineTo(52, 78);
    g.moveTo(68, 90);
    g.lineTo(68, 78);
    g.stroke();
  }
  g.beginPath();
  g.moveTo(38, 46);
  g.quadraticCurveTo(38, 74 + jaw * 4, 60, 82);
  g.quadraticCurveTo(82, 74 + jaw * 4, 82, 46);
  g.quadraticCurveTo(82, 22, 60, 22);
  g.quadraticCurveTo(38, 22, 38, 46);
  g.stroke();
}

function mouth(g, x, y, w, talk, col) {
  g.strokeStyle = col;
  g.beginPath();
  if (talk < 0.15) {
    g.moveTo(x - w, y);
    g.quadraticCurveTo(x, y + 2, x + w, y);
  } else {
    g.ellipse(x, y + talk * 2, w * (0.8 - talk * 0.2), 1 + talk * 4.5, 0, 0, TAU);
  }
  g.stroke();
}

const eyes = (g, y, open = 1, gap = 9) => {
  g.beginPath();
  for (const s of [-1, 1]) {
    g.moveTo(60 + s * gap - 4, y);
    g.quadraticCurveTo(60 + s * gap, y - 3 * open, 60 + s * gap + 4, y);
  }
  g.stroke();
};

const DRAW = {
  // VEX: the veteran. Open-face helmet, square jaw, stubble, an old scar.
  vector(g, c, talk) {
    bust(g, c, { jaw: 1.6 });
    // helmet shell and raised visor
    g.beginPath();
    g.moveTo(32, 58);
    g.quadraticCurveTo(28, 14, 60, 12);
    g.quadraticCurveTo(92, 14, 88, 58);
    g.stroke();
    g.beginPath();
    g.moveTo(36, 30);
    g.quadraticCurveTo(60, 18, 84, 30);
    g.lineTo(82, 36);
    g.quadraticCurveTo(60, 26, 38, 36);
    g.closePath();
    g.stroke();
    // flat, unbothered eyes
    g.beginPath();
    g.moveTo(46, 50);
    g.lineTo(55, 50);
    g.moveTo(65, 50);
    g.lineTo(74, 50);
    g.stroke();
    // scar over the left eye
    g.beginPath();
    g.moveTo(70, 42);
    g.lineTo(76, 58);
    g.stroke();
    // stubble
    g.save();
    g.globalAlpha = 0.55;
    for (let k = 0; k < 16; k++) g.fillRect(46 + ((k * 7) % 28), 68 + ((k * 3) % 8), 1.4, 1.4);
    g.restore();
    mouth(g, 60, 70, 7, talk, c);
  },
  // LINA SCAN: speed freak. Hair streaming back, goggles pushed up, a grin.
  scanline(g, c, talk) {
    bust(g, c);
    for (let k = 0; k < 6; k++) {
      g.beginPath();
      g.moveTo(40, 30 + k * 4);
      g.quadraticCurveTo(20 - k * 2, 30 + k * 5, 4, 26 + k * 7);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(38, 36);
    g.quadraticCurveTo(52, 20, 84, 30);
    g.stroke();
    // goggles on the forehead
    for (const x of [50, 70]) {
      g.beginPath();
      g.ellipse(x, 32, 8, 5, 0, 0, TAU);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(38, 32);
    g.lineTo(42, 32);
    g.moveTo(78, 32);
    g.lineTo(82, 32);
    g.stroke();
    eyes(g, 50, 1.3);
    // a grin, a little lopsided
    g.beginPath();
    g.moveTo(51, 67);
    g.quadraticCurveTo(61, 74 + talk * 4, 71, 64);
    g.stroke();
    // speed lines
    g.save();
    g.globalAlpha = 0.45;
    for (let k = 0; k < 4; k++) {
      g.beginPath();
      g.moveTo(94, 30 + k * 12);
      g.lineTo(116, 30 + k * 12);
      g.stroke();
    }
    g.restore();
  },
  // POLLY GONE: low-poly head, round glasses, a pencil behind the ear.
  polygon(g, c, talk) {
    g.strokeStyle = c;
    g.beginPath();
    g.moveTo(14, 120);
    g.lineTo(28, 96);
    g.lineTo(60, 88);
    g.lineTo(92, 96);
    g.lineTo(106, 120);
    g.stroke();
    const head = [[60, 18], [80, 26], [86, 48], [78, 72], [60, 82], [42, 72], [34, 48], [40, 26]];
    g.beginPath();
    head.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.stroke();
    // facets
    g.save();
    g.globalAlpha = 0.35;
    g.beginPath();
    for (const [x, y] of head) {
      g.moveTo(x, y);
      g.lineTo(60, 52);
    }
    g.stroke();
    g.restore();
    // a blunt bob
    g.beginPath();
    g.moveTo(34, 56);
    g.lineTo(36, 24);
    g.lineTo(60, 14);
    g.lineTo(84, 24);
    g.lineTo(86, 56);
    g.stroke();
    // glasses
    for (const x of [50, 70]) {
      g.beginPath();
      g.arc(x, 48, 7, 0, TAU);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(57, 48);
    g.lineTo(63, 48);
    g.stroke();
    g.fillStyle = c;
    g.fillRect(49, 47, 2.4, 2.4);
    g.fillRect(69, 47, 2.4, 2.4);
    // pencil
    g.beginPath();
    g.moveTo(86, 30);
    g.lineTo(100, 14);
    g.lineTo(102, 16);
    g.lineTo(88, 32);
    g.stroke();
    mouth(g, 60, 68, 5, talk, c);
  },
  // KROMA: big hair, star shades, sparkles.
  chroma(g, c, talk) {
    bust(g, c);
    for (let k = 0; k < 9; k++) {
      const a = Math.PI * (0.95 + (k / 8) * 1.1);
      g.beginPath();
      g.arc(60 + Math.cos(a) * 32, 44 + Math.sin(a) * 32, 11, 0, TAU);
      g.stroke();
    }
    const star = (x, y, r) => {
      g.beginPath();
      for (let k = 0; k < 10; k++) {
        const rr = k % 2 ? r * 0.45 : r;
        const a = -Math.PI / 2 + (k / 10) * TAU;
        g[k ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      g.closePath();
      g.stroke();
    };
    star(50, 49, 9);
    star(70, 49, 9);
    g.beginPath();
    g.moveTo(58, 49);
    g.lineTo(62, 49);
    g.stroke();
    // lips
    g.beginPath();
    g.moveTo(52, 68);
    g.quadraticCurveTo(56, 64, 60, 67);
    g.quadraticCurveTo(64, 64, 68, 68);
    g.quadraticCurveTo(60, 72 + talk * 6, 52, 68);
    g.stroke();
    g.save();
    g.globalAlpha = 0.8;
    star(100, 22, 5);
    star(18, 74, 4);
    star(104, 70, 3);
    g.restore();
  },
  // RAZ: an 8-bit kid, drawn in pixels, cap on backwards.
  raster(g, c, talk) {
    const px = (x, y, w = 1, h = 1) => g.fillRect(12 + x * 8, 14 + y * 8, w * 8 - 1, h * 8 - 1);
    g.fillStyle = c;
    // cap (backwards: the peak sticks out the back)
    px(2, 1, 8);
    px(1, 2, 10);
    px(-1, 3, 3);
    // face outline
    g.globalAlpha = 0.35;
    px(1, 3, 1, 6);
    px(10, 3, 1, 6);
    px(2, 9, 8);
    g.globalAlpha = 1;
    // eyes
    px(3, 5);
    px(7, 5);
    // mouth: one row closed, a box open
    if (talk > 0.3) {
      px(4, 7, 3);
      px(4, 8, 3);
    } else px(4, 7, 3);
    // shoulders
    g.globalAlpha = 0.6;
    px(1, 11, 10);
    px(0, 12, 12);
    g.globalAlpha = 1;
  },
  // GL1TCH: a face that came back wrong, sliced and offset, one eye red, one eye blue.
  glitch(g, c, talk, t = 0) {
    const slices = [0, 34, 48, 62, 120];
    for (let k = 0; k < slices.length - 1; k++) {
      const off = Math.round(Math.sin(t * 9 + k * 2.3) * 5 + (k === 1 ? 8 : k === 2 ? -7 : 0));
      g.save();
      g.beginPath();
      g.rect(0, slices[k], 120, slices[k + 1] - slices[k]);
      g.clip();
      g.translate(off, 0);
      bust(g, c);
      // hood
      g.beginPath();
      g.moveTo(30, 70);
      g.quadraticCurveTo(26, 12, 60, 12);
      g.quadraticCurveTo(94, 12, 90, 70);
      g.stroke();
      mouth(g, 60, 68, 7, talk, c);
      g.restore();
    }
    g.fillStyle = '#ff2a4a';
    g.fillRect(46, 46, 7, 4);
    g.fillStyle = '#1e8cff';
    g.fillRect(67, 47, 7, 4);
    g.save();
    g.globalAlpha = 0.3;
    g.fillStyle = c;
    for (let y = 2; y < 120; y += 4) g.fillRect(0, y, 120, 1);
    g.restore();
  },
  // DASH (from LAST LINE): a stick figure, hollow head, red headband tails flying.
  dash(g, c, talk) {
    g.strokeStyle = c;
    g.beginPath();
    g.arc(60, 46, 24, 0, TAU);
    g.stroke();
    g.beginPath();
    g.moveTo(60, 70);
    g.lineTo(60, 110);
    g.moveTo(60, 84);
    g.lineTo(34, 100);
    g.moveTo(60, 84);
    g.lineTo(88, 72);
    g.stroke();
    g.strokeStyle = '#ff2a4a';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(37, 38);
    g.quadraticCurveTo(60, 30, 83, 38);
    g.stroke();
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(37, 38);
    g.quadraticCurveTo(22, 30, 8, 40);
    g.moveTo(37, 40);
    g.quadraticCurveTo(24, 44, 12, 54);
    g.stroke();
    g.lineWidth = 2;
    g.fillStyle = c;
    g.fillRect(51, 46, 3, 5);
    g.fillRect(66, 46, 3, 5);
    mouth(g, 60, 58, 5, talk, c);
  },
  // Captain Finn Razorback (from ABSURD COMBAT RACING): a shark in a captain's hat.
  greatwedge(g, c, talk) {
    g.strokeStyle = c;
    // snout and jaw, opening as he talks
    g.beginPath();
    g.moveTo(20, 54);
    g.quadraticCurveTo(40, 26, 92, 34);
    g.quadraticCurveTo(108, 44, 104, 58);
    g.stroke();
    const j = talk * 10;
    g.beginPath();
    g.moveTo(26, 62);
    g.quadraticCurveTo(60, 66 + j, 102, 62 + j * 0.3);
    g.quadraticCurveTo(70, 88 + j, 22, 80);
    g.stroke();
    // teeth
    g.beginPath();
    for (let x = 34; x < 96; x += 7) {
      g.moveTo(x, 58);
      g.lineTo(x + 3, 63);
      g.lineTo(x + 6, 58);
      g.moveTo(x, 66 + j * 0.8);
      g.lineTo(x + 3, 61 + j * 0.8);
      g.lineTo(x + 6, 66 + j * 0.8);
    }
    g.stroke();
    // eye and gills
    g.fillStyle = c;
    g.beginPath();
    g.arc(78, 44, 3, 0, TAU);
    g.fill();
    g.beginPath();
    for (const x of [20, 26, 32]) {
      g.moveTo(x, 84);
      g.quadraticCurveTo(x - 4, 94, x, 104);
    }
    g.stroke();
    // captain's hat
    g.beginPath();
    g.moveTo(40, 32);
    g.lineTo(44, 14);
    g.quadraticCurveTo(66, 4, 88, 16);
    g.lineTo(88, 32);
    g.moveTo(34, 32);
    g.lineTo(96, 32);
    g.stroke();
    g.fillRect(62, 18, 6, 6);
  },
};

// Draw a driver's portrait into a canvas (any size; drawn on a 120 x 120 grid).
export function drawPortrait(canvas, id, color, talk = 0, t = 0) {
  const g = canvas.getContext('2d');
  const s = canvas.width / 120;
  g.setTransform(s, 0, 0, s, 0, 0);
  g.clearRect(0, 0, 120, 120);
  const bg = g.createRadialGradient(60, 50, 4, 60, 60, 80);
  const c = hex(color);
  bg.addColorStop(0, c + '40');
  bg.addColorStop(1, '#07030f');
  g.fillStyle = bg;
  g.fillRect(0, 0, 120, 120);
  g.lineWidth = 2;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.shadowColor = c;
  g.shadowBlur = 8;
  (DRAW[id] || DRAW.vector)(g, c, talk, t);
  g.shadowBlur = 0;
}

export const hasPortrait = (id) => !!DRAW[id];
