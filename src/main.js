import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';
import { PLIES, NOTES, moveLabel, buildTracks, ANNOTATIONS, ANNOTATION_STYLE } from './opera.js';
import { sound } from './sound.js';
import { createFx } from './fx.js';

gsap.registerPlugin(ScrollTrigger, SplitText);

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const fineHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const coarse = window.matchMedia('(pointer: coarse)').matches;
// a short buzz under the thumb, on phones that have one (never on scroll)
const buzz = (p) => { if (coarse && navigator.vibrate) navigator.vibrate(p); };
// is this spot the open board, rather than text or a control laid over it?
const overBoard = (el) => !!el && !el.closest('a, button, [data-cursor], .readout, .hero-foot, .hero-title, .top, .foot, main section:not(.hero):not(.game)');
const fx = !reduced ? createFx($('.fx')) : null;
// the entrance (every visit); the board waits for it before its pieces rise
const introOn = document.documentElement.classList.contains('is-intro');
let introDone = () => {};
const introReady = new Promise((r) => { introDone = r; });
if (!introOn) introDone();
// the name only jumps once the board is built and its shaders are compiled, so the jump never stutters
let boardWarmed = () => {};
const boardWarm = new Promise((r) => { boardWarmed = r; });

// ---------- smooth scroll on GSAP's clock, so scroll, tweens and WebGL share a frame ----------
let lenis = null;
if (!reduced) {
  lenis = new Lenis({ autoRaf: false, anchors: true, lerp: 0.1 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}

// ---------- move list ----------
const movelist = $('.movelist');
const moveSpans = PLIES.map((p, i) => {
  if (i % 2 === 0) movelist.append(`${i / 2 + 1}. `);
  const s = document.createElement('span');
  s.textContent = p.san;
  movelist.append(s, ' ');
  return s;
});

// the move ruler: one tick per move of the Opera Game
const ruler = $('.game-ruler');
const ticks = Array.from({ length: Math.ceil(PLIES.length / 2) }, (_, i) => {
  const li = document.createElement('li');
  li.dataset.n = String(i + 1);
  ruler?.append(li);
  return li;
});

const moveText = $('.move-text');
const moveBadge = $('.move-badge');
const note = $('.note');
let shownIdx = -2;
let shownNote = 0;
let noteTl = null;

// which plies take a piece, so the board can sound a capture instead of a plain move
const CAPTURES = new Set(buildTracks().filter((p) => p.capturedAt !== null).map((p) => p.capturedAt));

let lastSound = 0;
// the move label decodes out of scrambled chess notation, the way a cipher settles into plain text
const GLYPHS = 'abcdefgh12345678KQRBNx+#';
let decodeRaf = 0;
function decode(el, text) {
  cancelAnimationFrame(decodeRaf);
  if (reduced) { el.textContent = text; return; }
  const start = performance.now();
  const tick = (now) => {
    const t = now - start;
    const settled = Math.floor(Math.max(0, t - 60) / 34);
    let out = '';
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      out += i < settled || ch === ' ' || ch === '.' ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0];
    }
    el.textContent = out;
    if (settled < text.length) decodeRaf = requestAnimationFrame(tick);
  };
  decodeRaf = requestAnimationFrame(tick);
}

function updateReadout(ply) {
  const idx = Math.min(PLIES.length - 1, Math.ceil(ply - 0.001) - 1);
  if (idx === shownIdx) return;
  // when scrubbing fast, several plies pass in one frame: play one sound, not a pile of them
  const now = performance.now();
  if (shownIdx > -2 && idx >= 0 && now - lastSound > 70) {
    lastSound = now;
    if (idx === PLIES.length - 1 && idx > shownIdx) { sound.mate(); setTimeout(() => secret('opera'), 900); }
    else {
      if (CAPTURES.has(idx)) sound.capture();
      else if (/O-O/.test(PLIES[idx].san)) sound.castle();
      else sound.move(idx % 2 === 0);
      if (ANNOTATIONS[idx] && idx > shownIdx) setTimeout(() => sound[ANNOTATIONS[idx]](), 260);
    }
  }
  shownIdx = idx;
  decode(moveText, idx < 0 ? 'Paris, 1858' : moveLabel(idx));
  // annotated moves wear their badge in the readout too
  const kind = ANNOTATIONS[idx];
  moveText.parentElement.dataset.kind = kind || '';
  if (moveBadge) {
    moveBadge.classList.toggle('is-on', !!kind);
    if (kind) {
      moveBadge.textContent = ANNOTATION_STYLE[kind].text;
      moveBadge.dataset.kind = kind;
      moveBadge.setAttribute('title', ANNOTATION_STYLE[kind].name);
    }
  }
  if (!reduced) gsap.fromTo(moveText, { yPercent: 30, opacity: 0.2 }, { yPercent: 0, opacity: 1, duration: 0.3, ease: 'power3.out', overwrite: 'auto' });
  const moveNo = idx < 0 ? -1 : Math.floor(idx / 2);
  ticks.forEach((t, i) => { t.classList.toggle('on', i === moveNo); t.classList.toggle('done', i < moveNo); });
  moveSpans.forEach((s, i) => {
    s.classList.toggle('on', i === idx);
    s.classList.toggle('ahead', i > idx);
  });
  let n = 0;
  NOTES.forEach((nt, i) => { if (idx >= nt.from) n = i; });
  if (n !== shownNote) {
    shownNote = n;
    if (reduced) note.textContent = NOTES[n].text;
    else {
      // one running swap at a time: a new note kills the previous fade instead of queueing behind it
      noteTl?.kill();
      noteTl = gsap.timeline()
        .to(note, { opacity: 0, y: -8, duration: 0.16, ease: 'power2.in' })
        .add(() => { note.textContent = NOTES[shownNote].text; })
        .to(note, { opacity: 1, y: 0, duration: 0.4, ease: 'power3.out', startAt: { y: 10 } });
    }
  }
}
updateReadout(0);


let boardSquare = () => null;
let boardLive = () => false;
let boardApi = null;

// ---------- WebGL board (three.js arrives as its own chunk, after the text has painted) ----------
const canvas = $('.stage');
async function startBoard() {
  let board = null;
  try {
    const { createBoard, webglAvailable } = await import('./board.js');
    if (webglAvailable()) board = await createBoard(canvas, {
      reducedMotion: reduced,
      onLand: (p, phase) => {
        if (phase === 'slam') { sound.slam(); buzz([20, 30, 20]); }
        else if (phase === 'step') sound.tap(1.3, 0.7);
        else if (phase === 'land' || (phase === 'end' && (p.type === 'n' || p.type === 'p'))) sound.land();
      },
      onTurn: () => secret('spin'),
    });
  } catch (err) {
    console.warn('WebGL board unavailable', err);
  }
  if (board) await board.warm();
  boardWarmed();
  if (!board) {
    document.documentElement.classList.add('no-webgl');
    moveText.textContent = '17. Rd8#';
    note.textContent = NOTES[NOTES.length - 1].text;
    moveSpans.forEach((s) => s.classList.remove('ahead'));
    ScrollTrigger.refresh();
    return;
  }
  let active = true;
  gsap.ticker.add((_, dt) => {
    // the readout follows the eased ply the board actually draws, so text and pieces agree
    if (active && !document.hidden) updateReadout(board.render(Math.min(dt, 50) / 1000));
  });
  if (!reduced) introReady.then(() => gsap.to(board, { intro: 1, duration: 2.1, ease: 'none', delay: 0.15 }));

  ScrollTrigger.create({
    trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true,
    onUpdate: (st) => board.setHero(st.progress),
  });
  ScrollTrigger.create({
    trigger: '.game', start: 'top top', end: 'bottom bottom', scrub: true,
    onUpdate: (st) => board.setGame(st.progress),
    onRefresh: (st) => { board.setGame(st.progress); board.settle(); },
  });
  // as the page rises over the final position, the board dims away instead of being cut off
  gsap.fromTo(canvas, { opacity: 1 }, {
    opacity: 0.15, ease: 'none',
    scrollTrigger: { trigger: '.about', start: 'top bottom', end: 'top top', scrub: true },
  });
  // the about section is opaque: once it covers the screen, stop drawing
  ScrollTrigger.create({
    trigger: '.about', start: 'top top',
    onEnter: () => { active = false; canvas.classList.add('is-off'); },
    onLeaveBack: () => { active = true; board.settle(); canvas.classList.remove('is-off'); },
  });

  window.addEventListener('pointermove', (e) => {
    board.pointer((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
  }, { passive: true });
  boardSquare = () => (active ? board.square : null);
  boardLive = () => active;
  boardApi = board;

  // the board under the hand: a click pokes, a mouse drag spins it
  let down = null;
  const ndc = (e) => [(e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1)];
  window.addEventListener('pointerdown', (e) => {
    if (!active || e.button !== 0 || !overBoard(e.target)) return;
    down = { x: e.clientX, y: e.clientY, lastX: e.clientX, drag: false, mouse: e.pointerType === 'mouse' };
  });
  window.addEventListener('pointermove', (e) => {
    if (!down?.mouse) return;
    if (!down.drag && Math.abs(e.clientX - down.x) > 6) {
      down.drag = true;
      board.dragStart();
      document.documentElement.classList.add('is-grabbing');
    }
    if (down.drag) { board.drag(e.clientX - down.lastX); down.lastX = e.clientX; }
  }, { passive: true });
  const release = (e) => {
    if (!down) return;
    if (down.drag) {
      if (Math.abs(board.dragEnd()) > 3) sound.whoosh();
    } else if (e.type === 'pointerup' && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 8) {
      const hit = board.poke(...ndc(e));
      if (hit?.piece) {
        ({ n: sound.hop, b: sound.spin, q: sound.rise, k: sound.wobble, p: () => sound.tap(1.2, 0.7), r: () => {} })[hit.piece.type]?.();
        buzz(12);
        if (hit.piece.type === 'k' && !hit.piece.white) secret('king');
      }
    }
    down = null;
    document.documentElement.classList.remove('is-grabbing');
  };
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);
  document.documentElement.addEventListener('pointerleave', () => board.pointerOff());
  window.addEventListener('resize', () => board.resize());
  ScrollTrigger.refresh();
}
startBoard();

// ---------- fitted display lines ----------
function fit(el, target) {
  el.style.fontSize = '100px';
  const w = el.getBoundingClientRect().width;
  if (w) el.style.fontSize = `${(target / w) * 100}px`;
}
function fitAll() {
  const inner = document.documentElement.clientWidth;
  const margin = parseFloat(getComputedStyle($('.contact')).paddingLeft);
  const email = $('.email-text');
  if (inner > 760) fit(email, inner - margin * 2);
  else email.style.fontSize = '';
  fit($('.foot-name'), inner - margin * 2);
}
// size the display lines only once the display face itself has arrived
fitAll();
Promise.all([document.fonts.load('800 100px "Big Shoulders"'), document.fonts.ready])
  .then(() => { fitAll(); ScrollTrigger.refresh(); });
window.addEventListener('load', () => { fitAll(); ScrollTrigger.refresh(); });
document.fonts.addEventListener('loadingdone', fitAll);
window.addEventListener('resize', fitAll);

// header: transparent over the hero; turns solid the moment the big name slides under it, and stays put
const top = $('.top');
ScrollTrigger.create({
  trigger: '.hero-title', start: () => `top ${top.offsetHeight}px`, end: 'max',
  toggleClass: { targets: top, className: 'is-solid' },
});

// header ink flips over the light fields
[['.hire', 'on-accent'], ['.contact', 'on-light']].forEach(([sel, cls]) => {
  ScrollTrigger.create({ trigger: sel, start: 'top 40px', end: 'bottom 40px', toggleClass: { targets: '.top', className: cls } });
});

// ---------- entrances: each section arrives in its own way ----------
// the about paragraph lights up as it is read, word by word, tied to the scroll
$$('[data-words]').forEach((p) => {
  const words = p.textContent.trim().split(/\s+/);
  p.textContent = '';
  words.forEach((w, i) => {
    const s = document.createElement('span');
    s.className = 'w';
    s.textContent = w;
    // "prove code wrong." is the thesis: it gets the serif voice
    if (i >= 6 && i <= 8 && p.classList.contains('about-text')) s.classList.add('accent');
    p.append(s, i < words.length - 1 ? ' ' : '');
  });
  if (!reduced) gsap.fromTo(p.querySelectorAll('.w'), { opacity: 0.22 }, {
    opacity: 1, ease: 'none', stagger: 0.05,
    scrollTrigger: { trigger: p, start: 'top 78%', end: 'bottom 42%', scrub: 0.4 },
  });
});
if (!reduced) {
  const once = (trigger, start = 'top 82%') => ({ trigger, start, once: true });

  $$('[data-reveal]').forEach((el) => {
    gsap.from(el, { y: 28, opacity: 0, duration: 1, ease: 'power3.out', scrollTrigger: once(el) });
  });
  $$('[data-stagger]').forEach((el) => {
    gsap.from(el.children, { y: 22, opacity: 0, duration: 0.8, ease: 'power3.out', stagger: 0.075, scrollTrigger: once(el) });
  });
  $$('[data-shot]').forEach((fig) => {
    const img = fig.querySelector('img');
    gsap.fromTo(fig, { clipPath: 'inset(100% 0% 0% 0%)' }, {
      clipPath: 'inset(0% 0% 0% 0%)', duration: 1.25, ease: 'expo.out', scrollTrigger: once(fig, 'top 88%'),
    });
    gsap.fromTo(img, { scale: 1.08 }, { scale: 1, duration: 1.6, ease: 'expo.out', scrollTrigger: once(fig, 'top 88%') });
  });
  gsap.from('.hire-title', { y: 20, opacity: 0, duration: 0.8, ease: 'power3.out', scrollTrigger: once('.hire') });
  // headings come into focus letter by letter (blur only where the GPU can afford it)
  const fine = window.matchMedia('(pointer: fine)').matches;
  document.fonts.ready.then(() => {
    $$('.project-title').forEach((h) => {
      const split = SplitText.create(h, { type: 'words,chars', wordsClass: 'wd', charsClass: 'ch' });
      gsap.from(split.chars, {
        opacity: 0, yPercent: 18, filter: fine ? 'blur(14px)' : 'none',
        duration: 1.1, ease: 'power3.out', stagger: 0.035, scrollTrigger: once(h, 'top 85%'),
        onComplete: () => gsap.set(split.chars, { clearProps: 'filter' }),
      });
    });
  });
  gsap.from('.hire-list li > span', {
    xPercent: -6, opacity: 0, duration: 1, ease: 'expo.out', stagger: 0.09, scrollTrigger: once('.hire-list'),
  });
  $$('.lineup tr').forEach((tr) => {
    gsap.from(tr, { y: 18, opacity: 0, duration: 0.7, ease: 'power3.out', scrollTrigger: once(tr, 'top 92%') });
  });
  gsap.from('.contact-lead', { y: 20, opacity: 0, duration: 0.8, ease: 'power3.out', scrollTrigger: once('.contact', 'top 70%') });
  gsap.from('.email-text', { yPercent: 110, duration: 1.1, ease: 'expo.out', scrollTrigger: once('.email', 'top 85%') });
  gsap.from('.foot-name', { yPercent: 60, duration: 1.3, ease: 'expo.out', scrollTrigger: once('.foot', 'top 70%') });
}

// ---------- sound: off until the visitor asks for it ----------
const soundBtn = $('.sound');
const paintSound = () => {
  soundBtn.setAttribute('aria-pressed', String(sound.on));
  soundBtn.setAttribute('title', sound.on ? 'Sound on' : 'Sound off');
};
paintSound();
soundBtn.addEventListener('click', () => { sound.set(!sound.on); paintSound(); });
$$('a, button').forEach((el) => el.addEventListener('pointerenter', () => sound.tick()));

// every click gets an answer: a tap you can hear, a ring you can see, a buzz you can feel.
// On touch only a real tap answers; a finger that starts a scroll stays silent.
let touchDown = null;
window.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  if (e.pointerType === 'touch') touchDown = { x: e.clientX, y: e.clientY, t: e.timeStamp };
  else answerClick(e);
});
window.addEventListener('pointerup', (e) => {
  if (e.pointerType !== 'touch' || !touchDown) return;
  const d = touchDown;
  touchDown = null;
  if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 10 && e.timeStamp - d.t < 400) answerClick(e);
});
window.addEventListener('pointercancel', () => { touchDown = null; });
function answerClick(e) {
  const el = e.target;
  const onBoard = boardLive() && overBoard(el);
  fx?.burst(e.clientX, e.clientY, { dark: !!el.closest?.('.hire, .contact'), big: onBoard });
  if (el.closest?.('a, button, [data-cursor]')) sound.press();
  else sound.tap(onBoard ? 0.8 : 1);
  buzz(8);
}

// the first deliberate click turns sound on, unless the visitor has muted it before
window.addEventListener('click', (e) => {
  if (sound.on || sound.chosen || e.target.closest('a, .sound')) return;
  sound.set(true);
  paintSound();
  soundBtn.classList.add('just-on');
  setTimeout(() => soundBtn.classList.remove('just-on'), 1200);
});

// ---------- small things under the hand (fine pointers only) ----------
if (!reduced && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
  // screenshots lean toward the pointer, like a print picked up off a table
  $$('[data-shot]').forEach((fig) => {
    const rx = gsap.quickTo(fig, 'rotationX', { duration: 0.6, ease: 'power3.out' });
    const ry = gsap.quickTo(fig, 'rotationY', { duration: 0.6, ease: 'power3.out' });
    gsap.set(fig, { transformPerspective: 1400 });
    fig.addEventListener('pointermove', (e) => {
      const r = fig.getBoundingClientRect();
      ry(((e.clientX - r.left) / r.width - 0.5) * 5);
      rx(-((e.clientY - r.top) / r.height - 0.5) * 4);
    });
    fig.addEventListener('pointerleave', () => { rx(0); ry(0); });
  });
}

if (!reduced) {
  // the hire lines drift against each other as the field scrolls past
  if (window.innerWidth > 760) $$('.hire-list li').forEach((li, i) => {
    const vw = (n) => () => (window.innerWidth * n) / 100;
    gsap.fromTo(li, { x: vw(i % 2 ? 5 : -3) }, {
      x: vw(i % 2 ? -2 : 3), ease: 'none',
      scrollTrigger: { trigger: '.hire', start: 'top bottom', end: 'bottom top', scrub: true, invalidateOnRefresh: true },
    });
  });
  // a soft air sound as each screenshot opens
  $$('[data-shot]').forEach((fig) => ScrollTrigger.create({ trigger: fig, start: 'top 88%', once: true, onEnter: () => sound.whoosh() }));
}

// skip link: Lenis handles the jump, so move focus by hand to the section it lands on
$('.skip')?.addEventListener('click', () => requestAnimationFrame(() => $('#about').focus({ preventScroll: true })));

// copy the address for people without a mail client set up
$$('[data-copy]').forEach((btn) => btn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(btn.dataset.copy);
    btn.textContent = 'Copied';
  } catch {
    btn.textContent = btn.dataset.copy;
  }
  setTimeout(() => { btn.textContent = 'Copy email'; }, 1800);
}));

// ---------- the cursor ----------
// The system cursor stays. On top of it, only where it helps: a soft highlight that grows out of the pointer
// and wraps the control under it (the iPad pointer), a jade disc over project images that names the click,
// and a ring with the square's name over the board. Elsewhere nothing is drawn. Only transforms move per frame.
const cursor = $('.cursor');
const cursorShape = $('.cursor i');
const cursorLabel = $('.cursor span');
if (cursor && fineHover && !reduced) {
  const SMALL = 14;
  const mouse = { x: -100, y: -100 }, pos = { x: -100, y: -100 };
  const size = { w: SMALL, h: SMALL, r: SMALL / 2 };
  let mode = '', label = '', target = null, live = false, moved = false;
  let lastW = '', lastH = '', lastR = '';
  window.addEventListener('pointermove', (e) => {
    mouse.x = e.clientX; mouse.y = e.clientY; moved = true;
    if (!live) { pos.x = mouse.x; pos.y = mouse.y; live = true; cursor.classList.add('is-live'); }
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => cursor.classList.remove('is-live'));
  document.documentElement.addEventListener('pointerenter', () => { if (live) cursor.classList.add('is-live'); });
  const sense = () => {
    const el = document.elementFromPoint(mouse.x, mouse.y);
    cursor.classList.toggle('on-light', !!el?.closest('.hire, .contact'));
    const tagged = el?.closest('[data-cursor]');
    target = null;
    if (tagged) { mode = 'label'; label = tagged.dataset.cursor; }
    else if (el?.closest('a, button')) { mode = 'link'; target = el.closest('a, button'); }
    else if (overBoard(el)) mode = 'board';
    else mode = '';
  };

  gsap.ticker.add((_, dtMs) => {
    if (!live) return;
    const dt = Math.min(dtMs, 34) / 1000;
    if (moved) { sense(); moved = false; }
    const sq = mode === 'board' && !document.documentElement.classList.contains('is-grabbing') ? boardSquare() : null;
    const m = mode === 'board' ? (sq ? 'square' : '') : mode;
    let tx = mouse.x, ty = mouse.y, w = SMALL, h = SMALL, r = SMALL / 2, follow = 0;
    if (m === 'link' && target) {
      const bx = target.getBoundingClientRect();
      const cx = bx.left + bx.width / 2, cy = bx.top + bx.height / 2;
      tx = cx + (mouse.x - cx) * 0.16;
      ty = cy + (mouse.y - cy) * 0.16;
      w = bx.width + 22; h = bx.height + 14; r = Math.min(14, h / 2); follow = 22;
    } else if (m === 'label') { w = h = 80; r = 40; }
    else if (m === 'square') { w = h = 36; r = 18; }
    if (follow) { const k = 1 - Math.exp(-dt * follow); pos.x += (tx - pos.x) * k; pos.y += (ty - pos.y) * k; }
    else { pos.x = tx; pos.y = ty; }
    // shrinks back to a point while hidden, so the next highlight grows out of the pointer
    const ks = 1 - Math.exp(-dt * (m ? 18 : 30));
    size.w += (w - size.w) * ks; size.h += (h - size.h) * ks; size.r += (r - size.r) * ks;
    cursor.style.transform = `translate3d(${pos.x.toFixed(2)}px, ${pos.y.toFixed(2)}px, 0)`;
    const W = `${size.w.toFixed(1)}px`, H = `${size.h.toFixed(1)}px`, R = `${size.r.toFixed(1)}px`;
    if (W !== lastW) { cursorShape.style.width = W; lastW = W; }
    if (H !== lastH) { cursorShape.style.height = H; lastH = H; }
    if (R !== lastR) { cursorShape.style.borderRadius = R; lastR = R; }
    if (cursor.dataset.mode !== m) cursor.dataset.mode = m;
    const text = m === 'label' ? label : m === 'square' ? sq : '';
    if (cursorLabel.textContent !== text) cursorLabel.textContent = text;
  });

  // buttons lean toward the pointer, then spring back
  $$('.button, .top nav a, .sound, .socials a').forEach((b) => {
    const bx = gsap.quickTo(b, 'x', { duration: 0.5, ease: 'elastic.out(1, 0.5)' });
    const by = gsap.quickTo(b, 'y', { duration: 0.5, ease: 'elastic.out(1, 0.5)' });
    b.addEventListener('pointermove', (e) => {
      const r = b.getBoundingClientRect();
      bx((e.clientX - (r.left + r.width / 2)) * 0.25);
      by((e.clientY - (r.top + r.height / 2)) * 0.3);
    });
    b.addEventListener('pointerleave', () => { bx(0); by(0); });
  });

  // a quiet invitation to turn the sound on: it trails the pointer for a few seconds over the hero
  const pill = $('.sound-pill');
  if (pill && !sound.on) {
    const px = gsap.quickTo(pill, 'x', { duration: 0.6, ease: 'power3.out' });
    const py = gsap.quickTo(pill, 'y', { duration: 0.6, ease: 'power3.out' });
    let shown = false, done = false;
    const hide = () => { if (done) return; done = true; pill.classList.remove('is-on'); };
    const hero = $('.hero');
    const onMove = (e) => {
      if (done) return;
      px(e.clientX + 22); py(e.clientY + 22);
      if (!shown) { shown = true; pill.classList.add('is-on'); setTimeout(hide, 5000); }
    };
    hero.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('click', hide);
    window.addEventListener('scroll', () => { if (window.scrollY > 120) hide(); }, { passive: true });
  }
}

// project images open the project, and say so under the cursor (not on touch: a swipe could land as a tap)
if (fineHover) [['.project-chess', 'Open'], ['.project-tether', 'Play']].forEach(([sel, word]) => {
  const href = $(`${sel} .button`)?.href;
  $$(`${sel} [data-shot]`).forEach((fig) => {
    fig.dataset.cursor = word;
    if (href) fig.addEventListener('click', () => window.open(href, '_blank', 'noopener'));
  });
});

// images bend a little with the speed of the scroll, and settle when it stops
if (lenis && !reduced && fineHover) {
  const benders = $$('[data-shot] img').map((img) => gsap.quickTo(img, 'skewY', { duration: 0.6, ease: 'power3.out' }));
  lenis.on('scroll', ({ velocity }) => {
    const k = gsap.utils.clamp(-3.2, 3.2, velocity * 0.12);
    benders.forEach((b) => b(k));
  });
}

// ---------- the name answers the hand: letters lean away from the pointer, a click shuffles them ----------
const titleLines = $$('.hero-title [data-line]');
$('.hero-title')?.setAttribute('aria-label', titleLines.map((l) => l.textContent).join(' '));
const chars = [];
titleLines.forEach((line) => {
  const word = line.textContent;
  line.textContent = '';
  [...word].forEach((c) => {
    const s = document.createElement('span');
    s.className = 'hc';
    s.textContent = c;
    s.setAttribute('aria-hidden', 'true');
    line.append(s);
    chars.push(s);
  });
});
let lettersLive = !introOn;
if (!reduced && fineHover && chars.length) {
  // soft and slow to settle: pushed letters overshoot, swing back and wobble before they rest
  const jelly = { duration: 1.6, ease: 'elastic.out(1, 0.42)' };
  const movers = chars.map((c) => ({
    el: c,
    x: gsap.quickTo(c, 'x', jelly),
    y: gsap.quickTo(c, 'y', jelly),
    r: gsap.quickTo(c, 'rotation', jelly),
    sy: gsap.quickTo(c, 'scaleY', jelly),
  }));
  const R = 150;
  window.addEventListener('pointermove', (e) => {
    if (!lettersLive || window.scrollY > window.innerHeight) return;
    for (const m of movers) {
      const b = m.el.getBoundingClientRect();
      const cx = b.left + b.width / 2 - gsap.getProperty(m.el, 'x');
      const cy = b.top + b.height / 2 - gsap.getProperty(m.el, 'y');
      const dx = cx - e.clientX, dy = cy - e.clientY;
      const d = Math.hypot(dx, dy);
      const f = d < R ? (1 - d / R) ** 2 : 0;
      m.x(d ? (dx / d) * f * 22 : 0);
      m.y(d ? (dy / d) * f * 16 : 0);
      m.r(d ? (dx / d) * f * 7 : 0);
      m.sy(1 - f * 0.1);
    }
  }, { passive: true });
}
// a click on a word shuffles its letters and settles them back one by one, each a note higher
titleLines.forEach((line) => {
  const cs = [...line.querySelectorAll('.hc')];
  const word = cs.map((c) => c.textContent);
  let busy = false;
  line.addEventListener('click', () => {
    if (busy || reduced) return;
    busy = true;
    const start = performance.now();
    let settled = 0;
    const step = (now) => {
      const n = Math.floor((now - start) / 55);
      while (settled < Math.min(n, cs.length)) { sound.letter(settled); settled++; }
      cs.forEach((c, i) => { c.textContent = i < settled ? word[i] : word[(Math.random() * word.length) | 0]; });
      if (settled < cs.length) requestAnimationFrame(step);
      else busy = false;
    };
    requestAnimationFrame(step);
  });
});

// ---------- secrets: six things to find, counted in the footer, kept between visits ----------
const SECRETS = {
  opera: 'You played the whole Opera Game.',
  king: 'The king does not like being poked.',
  spin: 'A full turn of the board.',
  konami: 'Terminal mode. Enter the code again to leave it.',
  sudo: 'nikita is not in the sudoers file. This incident will be reported.',
  e4: '1. e4, best by test.',
};
const TOTAL = Object.keys(SECRETS).length;
let found = [];
try { found = JSON.parse(localStorage.getItem('na-secrets') || '[]').filter((k) => k in SECRETS); } catch { /* fresh */ }
const countEl = $('.secrets-count');
const hintEl = $('.secrets-hint');
const paintSecrets = () => {
  if (countEl) countEl.textContent = String(found.length);
  if (hintEl && found.length === TOTAL) hintEl.textContent = 'All of them. Thanks for poking around.';
};
paintSecrets();
const toast = $('.toast');
let toastTimer = 0;
function say(text, tag = '') {
  if (!toast) return;
  toast.querySelector('.toast-tag').textContent = tag;
  toast.querySelector('.toast-text').textContent = text;
  toast.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-on'), 3600);
}
function secret(key, again = false) {
  if (found.includes(key)) { if (again) say(SECRETS[key]); return; }
  found.push(key);
  try { localStorage.setItem('na-secrets', JSON.stringify(found)); } catch { /* ignore */ }
  paintSecrets();
  say(SECRETS[key], `${found.length} of ${TOTAL}`);
  sound.secret();
  buzz([30, 50, 30, 50, 60]);
}

// keys: the Konami code, and a few words typed anywhere on the page
const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
let keys = [], typed = '';
window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input, textarea')) return;
  keys = [...keys, e.key.length === 1 ? e.key.toLowerCase() : e.key].slice(-KONAMI.length);
  if (keys.join() === KONAMI.join()) {
    keys = [];
    const on = boardApi?.toggleWire();
    if (on !== undefined) { secret('konami', true); if (!on) say('Back to wood and stone.'); }
  }
  if (e.key.length === 1) {
    typed = (typed + e.key.toLowerCase()).slice(-8);
    if (typed.endsWith('sudo')) { typed = ''; secret('sudo', true); }
    if (typed.endsWith('e4')) { typed = ''; secret('e4', true); }
  }
});

// for the people who open the console first
console.log('%cHello, console reader.', 'font: 600 15px system-ui; color: #9fc7b8');
console.log('Six secrets on this page. Here is one, in base64: dHlwZSBlNCBvbiB0aGUgcGFnZQ==');

// ---------- the entrance ----------
// The name rises out of black in the middle of the screen, then jumps to where it lives. On the way its
// letters lean back against the motion; on landing they squash and wobble like jelly, one after another.
async function playIntro() {
  const html = document.documentElement;
  lenis?.stop();
  await Promise.race([document.fonts.load('800 100px "Big Shoulders"'), new Promise((r) => setTimeout(r, 800))]);
  const h1 = $('.hero-title');
  const hr = h1.getBoundingClientRect();
  const cr = chars.map((c) => c.getBoundingClientRect());
  const lr = $$('.hero-title .line').map((l) => l.getBoundingClientRect());
  const left = Math.min(...cr.map((r) => r.left)), right = Math.max(...cr.map((r) => r.right));
  const cx = (left + right) / 2, cy = (lr[0].top + lr[lr.length - 1].bottom) / 2;
  const s = Math.min(0.62, (window.innerWidth * 0.62) / (right - left));
  const dx = window.innerWidth / 2 - cx, dy = window.innerHeight / 2 - cy;
  gsap.set(h1, { x: dx, y: dy, scale: s, transformOrigin: `${cx - hr.left}px ${cy - hr.top}px` });
  gsap.set(chars, { transformOrigin: '50% 85%' });
  html.classList.add('intro-go');
  const from = dx > 0 ? 'end' : 'start';      // the wave starts at the leading edge of the move
  // hold on black while the name rises and the board gets ready (never longer than 3.5 s)
  const t0 = performance.now();
  await Promise.race([boardWarm, new Promise((r) => setTimeout(r, 3500))]);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const wait = Math.max(0.05, 1.15 - (performance.now() - t0) / 1000);
  gsap.timeline({ delay: wait })
    // the name travels as one mass on a long, even curve; nothing bends or wobbles
    .to(h1, { x: 0, y: 0, scale: 1, duration: 1.5, ease: 'expo.inOut' }, 0)
    .add(() => html.classList.add('title-free'), 0.1)      // the rise is over: let the letters out of their masks
    // a quiet wave runs through the letters on the way: each lifts a touch, then settles slowly into place
    .to(chars, { yPercent: -5, duration: 0.6, ease: 'sine.inOut', stagger: { each: 0.025, from } }, 0.2)
    .to(chars, { yPercent: 0, duration: 1.2, ease: 'power3.out', stagger: { each: 0.025, from } }, 0.8)
    .add(() => { html.classList.add('intro-done'); introDone(); }, 0.7)
    .add(() => {
      lenis?.start();
      gsap.set(h1, { clearProps: 'transform' });
      lettersLive = true;
    }, 1.6)
    .add(() => html.classList.remove('is-intro', 'intro-go', 'intro-done'), 2.6);
}
if (introOn) playIntro();
else setTimeout(() => document.documentElement.classList.add('title-free'), 1500);
