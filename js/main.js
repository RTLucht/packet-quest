// Boot + main loop.
(function () {
  'use strict';
  const PQ = window.PQ;
  const canvas = document.getElementById('game');
  canvas.width = PQ.W * PQ.SCALE;
  canvas.height = PQ.H * PQ.SCALE;
  const g = canvas.getContext('2d');
  PQ.bindMouse(canvas);
  PQ.state = PQ.load() || PQ.newState();

  // Integer-scale the 320x240 canvas to fit the window.
  function fit() {
    const s = Math.max(1, Math.floor(Math.min(window.innerWidth / PQ.W, (window.innerHeight - 8) / PQ.H)));
    canvas.style.width = PQ.W * s + 'px';
    canvas.style.height = PQ.H * s + 'px';
  }
  window.addEventListener('resize', fit);
  fit();

  PQ.setScene(PQ.titleScene());
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    PQ.time += dt;
    if (PQ.input.pressed('KeyM')) PQ.audio.toggleMute();
    g.setTransform(PQ.SCALE, 0, 0, PQ.SCALE, 0, 0);
    g.imageSmoothingEnabled = false;
    try {
      PQ.scene.update(dt);
      PQ.scene.draw(g, dt);
    } catch (err) {
      console.error('[PQ]', err);
    }
    PQ.input.endFrame();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
