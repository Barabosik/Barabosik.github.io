import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { createBoard, webglAvailable } from './board.js';
import { PLIES, NOTES, moveLabel, buildTracks } from './opera.js';
import { sound } from './sound.js';

gsap.registerPlugin(ScrollTrigger);

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

const moveText = $('.move-text');
const note = $('.note');
let shownIdx = -2;
let shownNote = 0;
let noteTl = null;

// which plies take a piece, so the board can sound a capture instead of a plain move
const CAPTURES = new Set(buildTracks().filter((p) => p.capturedAt !== null).map((p) => p.capturedAt));

let lastSound = 0;
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
  moveText.textContent = idx < 0 ? 'Paris, 1858' : moveLabel(idx);
  if (!reduced) gsap.fromTo(moveText, { yPercent: 30, opacity: 0.2 }, { yPercent: 0, opacity: 1, duration: 0.3, ease: 'power3.out', overwrite: 'auto' });
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

// ---------- WebGL board ----------
const canvas = $('.stage');
let board = null;
if (webglAvailable()) {
  try {
    board = createBoard(canvas, { reducedMotion: reduced });
  } catch (err) {
    console.warn('WebGL board unavailable', err);
  }
}

if (board) {
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
  // the about section is opaque: once it covers the screen, stop drawing
  ScrollTrigger.create({
    trigger: '.about', start: 'top top',
    onEnter: () => { active = false; canvas.classList.add('is-off'); },
    onLeaveBack: () => { active = true; board.settle(); canvas.classList.remove('is-off'); },
  });

  window.addEventListener('pointermove', (e) => {
    board.pointer((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => board.pointerOff());
  window.addEventListener('resize', () => board.resize());
} else {
  document.documentElement.classList.add('no-webgl');
  moveText.textContent = '17. Rd8#';
  note.textContent = NOTES[NOTES.length - 1].text;
  moveSpans.forEach((s) => s.classList.remove('ahead'));
}

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

// header: transparent over the hero, a solid band after it; hides while reading down, returns on the way up
const top = $('.top');
let lastY = 0;
ScrollTrigger.create({
  start: () => window.innerHeight * 0.8, end: 'max',
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
  soundBtn.querySelector('.sound-label').textContent = sound.on ? 'Sound on' : 'Sound off';
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
      x: vw(i % 2 ? -2 : 3), ease: 'none', invalidateOnRefresh: true,
      scrollTrigger: { trigger: '.hire', start: 'top bottom', end: 'bottom top', scrub: true },
    });
  });
  // a soft air sound as each screenshot opens
  $$('[data-shot]').forEach((fig) => ScrollTrigger.create({ trigger: fig, start: 'top 88%', once: true, onEnter: () => sound.whoosh() }));
}
