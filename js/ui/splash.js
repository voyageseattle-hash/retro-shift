// The studio card before the title: a CRT warming up, a wireframe apple drawn twice (red, then blue a hair off, like
// a misprinted page), FORBIDDEN FRUIT PRODUCTIONS, and PRESS ANY KEY. The key press that dismisses it is also the
// gesture that lets the browser start sound, so the title shout lands as the title appears.

const APPLE = `
<svg viewBox="-60 -70 120 130" class="apple" aria-hidden="true">
  <g class="pass red">
    <path d="M0 -28 C -14 -44, -52 -38, -50 -2 C -48 30, -24 52, -10 50 C -4 49, 4 49, 10 50 C 24 52, 48 30, 50 -2 C 51 -20, 42 -34, 30 -36" pathLength="1"/>
    <path d="M30 -36 C 26 -26, 36 -18, 44 -20" pathLength="1"/>
    <path d="M0 -28 C 0 -40, 4 -52, 10 -60" pathLength="1"/>
    <path d="M6 -46 C 14 -62, 32 -62, 34 -54 C 26 -46, 14 -44, 6 -46 Z" pathLength="1"/>
    <path d="M-30 -10 L 30 -10 M-38 6 L 38 6 M-34 22 L 34 22 M-20 38 L 20 38" pathLength="1" class="scan"/>
  </g>
  <g class="pass blue">
    <path d="M0 -28 C -14 -44, -52 -38, -50 -2 C -48 30, -24 52, -10 50 C -4 49, 4 49, 10 50 C 24 52, 48 30, 50 -2 C 51 -20, 42 -34, 30 -36" pathLength="1"/>
    <path d="M30 -36 C 26 -26, 36 -18, 44 -20" pathLength="1"/>
    <path d="M0 -28 C 0 -40, 4 -52, 10 -60" pathLength="1"/>
    <path d="M6 -46 C 14 -62, 32 -62, 34 -54 C 26 -46, 14 -44, 6 -46 Z" pathLength="1"/>
    <path d="M-30 -10 L 30 -10 M-38 6 L 38 6 M-34 22 L 34 22 M-20 38 L 20 38" pathLength="1" class="scan"/>
  </g>
</svg>`;

export function showSplash(app, done) {
  const s = document.createElement('div');
  s.id = 'splash';
  s.innerHTML = `<div class="crt"><div class="glass">
      ${APPLE}
      <div class="studio"><span class="ff">FORBIDDEN FRUIT</span><span class="pr">PRODUCTIONS</span></div>
      <div class="presents">PRESENTS</div>
      <div class="press">PRESS ANY KEY</div>
    </div></div>`;
  document.getElementById('app').appendChild(s);
  requestAnimationFrame(() => s.classList.add('on'));
  setTimeout(() => s.classList.add('ready'), 2600);
  let gone = false;
  const go = (e) => {
    // this press belongs to the splash, not to the menu under it
    e.stopImmediatePropagation();
    e.preventDefault();
    if (gone) return;
    gone = true;
    window.removeEventListener('keydown', go, true);
    window.removeEventListener('pointerdown', go, true);
    app.wake(true);
    app.audio.splashSting?.();
    s.classList.add('off');
    setTimeout(() => {
      s.remove();
      done?.();
    }, 650);
  };
  window.addEventListener('keydown', go, true);
  window.addEventListener('pointerdown', go, true);
}
