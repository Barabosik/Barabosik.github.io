// Pointer ink, drawn on one canvas above the page: a short glowing trail while the pointer is over
// the board, and a ring with a few sparks wherever a click lands. The loop sleeps when nothing is alive.
const JADE = '159,199,184';
const BONE = '223,240,232';
const INK = '22,28,26';
const TRAIL_LIFE = 0.55;

export function createFx(canvas) {
  const g = canvas.getContext('2d');
  let w = 0, h = 0;
  const trail = [];
  const rings = [];
  const sparks = [];
  let raf = 0, last = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  const wake = () => {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(loop);
  };

  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = now / 1000;
    g.clearRect(0, 0, w, h);

    // trail: a wide faint stroke under a thin bright one, both tapering with age
    while (trail.length && t - trail[0].t > TRAIL_LIFE) trail.shift();
    if (trail.length > 1) {
      g.globalCompositeOperation = 'lighter';
      g.lineCap = 'round';
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 1; i < trail.length; i++) {
          const a = trail[i - 1], b = trail[i];
          const k = 1 - (t - b.t) / TRAIL_LIFE;
          g.strokeStyle = pass ? `rgba(${BONE},${0.75 * k * k})` : `rgba(${JADE},${0.2 * k})`;
          g.lineWidth = pass ? 1 + 2.4 * k : 5 + 14 * k;
          g.beginPath();
          g.moveTo(a.x, a.y);
          g.lineTo(b.x, b.y);
          g.stroke();
        }
      }
    }

    // rings: open fast, thin out as they go
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      const a = (t - r.t) / r.life;
      if (a >= 1) { rings.splice(i, 1); continue; }
      const e = 1 - Math.pow(1 - a, 3);
      g.globalCompositeOperation = r.dark ? 'source-over' : 'lighter';
      g.strokeStyle = `rgba(${r.dark ? INK : JADE},${(1 - a) * 0.9})`;
      g.lineWidth = 1.6 * (1 - a) + 0.4;
      g.beginPath();
      g.arc(r.x, r.y, 4 + r.size * e, 0, Math.PI * 2);
      g.stroke();
    }

    // sparks: short streaks along their velocity, slowed by air
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.life -= dt;
      if (s.life <= 0) { sparks.splice(i, 1); continue; }
      const drag = Math.exp(-dt * 6);
      s.vx *= drag;
      s.vy = s.vy * drag + 140 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      const k = s.life / s.max;
      g.globalCompositeOperation = s.dark ? 'source-over' : 'lighter';
      g.strokeStyle = `rgba(${s.dark ? INK : BONE},${k})`;
      g.lineWidth = 1.4;
      g.beginPath();
      g.moveTo(s.x, s.y);
      g.lineTo(s.x - s.vx * 0.03, s.y - s.vy * 0.03);
      g.stroke();
    }
    g.globalCompositeOperation = 'source-over';

    raf = trail.length > 1 || rings.length || sparks.length ? requestAnimationFrame(loop) : 0;
  }

  return {
    // the pointer moved; ink only when it is over the open board
    move(x, y, ink) {
      if (!ink) { if (trail.length) trail.length = 0; return; }
      trail.push({ x, y, t: performance.now() / 1000 });
      if (trail.length > 48) trail.shift();
      wake();
    },
    burst(x, y, { dark = false, big = false } = {}) {
      const t = performance.now() / 1000;
      rings.push({ x, y, t, dark, size: big ? 64 : 38, life: big ? 0.6 : 0.45 });
      const n = big ? 12 : 7;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.6;
        const v = (big ? 260 : 170) * (0.6 + Math.random() * 0.6);
        const life = 0.3 + Math.random() * 0.25;
        sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, dark });
      }
      wake();
    },
  };
}
