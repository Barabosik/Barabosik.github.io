import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';
import { PLIES, NOTES, moveLabel, buildTracks } from './opera.js';
import { sound } from './sound.js';

gsap.registerPlugin(ScrollTrigger, SplitText);

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

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
    if (idx === PLIES.length - 1 && idx > shownIdx) sound.mate();
    else if (CAPTURES.has(idx)) sound.capture();
    else sound.move();
  }
  shownIdx = idx;
  decode(moveText, idx < 0 ? 'Paris, 1858' : moveLabel(idx));
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


// ---------- WebGL board (three.js arrives as its own chunk, after the text has painted) ----------
const canvas = $('.stage');
async function startBoard() {
  let board = null;
  try {
    const { createBoard, webglAvailable } = await import('./board.js');
    if (webglAvailable()) board = createBoard(canvas, { reducedMotion: reduced });
  } catch (err) {
    console.warn('WebGL board unavailable', err);
  }
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
  if (!reduced) gsap.to(board, { intro: 1, duration: 2.1, ease: 'none', delay: 0.15 });

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
    cursorTo(e.clientX, e.clientY);
  }, { passive: true });
  // a ring that names the square under it, only while the pointer is over the live board
  const cursor = $(".cursor");
  const cursorLabel = $('.cursor span');
  const cx = cursor && gsap.quickTo(cursor, 'x', { duration: 0.35, ease: 'power3.out' });
  const cy = cursor && gsap.quickTo(cursor, 'y', { duration: 0.35, ease: 'power3.out' });
  let overUi = false;
  function cursorTo(x, y) {
    if (!cursor) return;
    cx(x); cy(y);
    const el = document.elementFromPoint(x, y);
    overUi = !!el?.closest('a, button, .readout, .hero-foot, .hero-title, .top');
  }
  if (cursor) gsap.ticker.add(() => {
    const sq = active && !overUi ? board.square : null;
    cursor.classList.toggle('is-on', !!sq);
    if (sq && cursorLabel.textContent !== sq) cursorLabel.textContent = sq;
  });
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

// header: transparent over the hero; turns frosted the moment the big name slides under it,
// hides while reading down, returns on the way up
const top = $('.top');
let lastY = 0;
ScrollTrigger.create({
  trigger: '.hero-title', start: () => `top ${top.offsetHeight}px`, end: 'max',
  onUpdate: (st) => {
    const y = st.scroll();
    top.classList.add('is-solid');
    top.classList.toggle('is-hidden', y > lastY + 4 && y > window.innerHeight);
    if (y < lastY - 4) top.classList.remove('is-hidden');
    lastY = y;
  },
  onLeaveBack: () => top.classList.remove('is-solid', 'is-hidden'),
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
$$('a, button').forEach((el) => {
  el.addEventListener('pointerenter', () => sound.tick());
  el.addEventListener('pointerdown', () => sound.press());
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
