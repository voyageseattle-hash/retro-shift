// The studio card before the title, built from the Forbidden Fruit Productions logo. Browsers keep sound off until
// the first key press, so the card waits dark behind PRESS ANY KEY; that press switches the set on and the card plays
// with its sound (audio.splashIntro): a CRT warms up, the logo's outline is traced in red and then in blue a hair off
// (a misprinted 3-D page), the snake and apple come up out of the dark, the cracks in the apple pulse purple. Then it
// hands over to the title and the announcer's shout. A second press skips ahead.

export function showSplash(app, done) {
  const s = document.createElement('div');
  s.id = 'splash';
  s.innerHTML = `<div class="crt"><div class="glass">
      <div class="logo" aria-label="Forbidden Fruit Productions" role="img">
        <div class="body"></div>
        <div class="line red"></div>
        <div class="line blue"></div>
        <div class="veins"></div>
        <div class="sweep"></div>
      </div>
      <div class="presents">PRESENTS</div>
    </div></div>
    <div class="power">PRESS ANY KEY</div>`;
  document.getElementById('app').appendChild(s);
  let on = 0;
  let gone = false;
  let timer = 0;
  const leave = () => {
    if (gone) return;
    gone = true;
    clearTimeout(timer);
    window.removeEventListener('keydown', press, true);
    window.removeEventListener('pointerdown', press, true);
    app.audio.splashSting?.();
    app.titleAudio?.(0.45);
    s.classList.add('off');
    setTimeout(() => {
      s.remove();
      done?.();
    }, 650);
  };
  const press = (e) => {
    // this press belongs to the splash, not to the menu under it
    e.stopImmediatePropagation();
    e.preventDefault();
    if (!on) {
      on = performance.now();
      app.wake(true);
      app.audio.splashIntro?.();
      s.classList.add('on');
      timer = setTimeout(leave, 4700);
    } else if (performance.now() - on > 900) leave();
  };
  window.addEventListener('keydown', press, true);
  window.addEventListener('pointerdown', press, true);
}
