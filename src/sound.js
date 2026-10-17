// Small synthesized sound set: no audio files, nothing plays until the visitor turns it on.
const KEY = 'na-sound';
let ctx = null;
let master = null;
let enabled = false;
let chosen = false;
const lastAt = {};

try {
  const v = localStorage.getItem(KEY);
  enabled = v === 'on';
  chosen = v !== null;
} catch { /* storage blocked: stay off */ }

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

let noiseBuf = null;
function noise() {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  return s;
}

function env(node, t, peak, attack, decay) {
  node.gain.setValueAtTime(0.0001, t);
  node.gain.exponentialRampToValueAtTime(peak, t + attack);
  node.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

// a wooden piece set down on a board: a filtered click over a short low thump
function knock(t, pitch = 1, level = 1) {
  const n = noise();
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1700 * pitch;
  bp.Q.value = 1.4;
  const ng = ctx.createGain();
  env(ng, t, 0.5 * level, 0.002, 0.045);
  n.connect(bp).connect(ng).connect(master);
  n.start(t);
  n.stop(t + 0.08);

  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(210 * pitch, t);
  o.frequency.exponentialRampToValueAtTime(90 * pitch, t + 0.07);
  const og = ctx.createGain();
  env(og, t, 0.42 * level, 0.003, 0.09);
  o.connect(og).connect(master);
  o.start(t);
  o.stop(t + 0.12);
}

function tone(t, freq, peak, decay, type = 'sine') {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const g = ctx.createGain();
  env(g, t, peak, 0.01, decay);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + decay + 0.05);
}

// each kind of sound keeps its own anti-spam clock, so a click never swallows a move
function play(fn, gap = 45, kind = 'ui') {
  if (!enabled) return;
  const now = performance.now();
  if (now - (lastAt[kind] || 0) < gap) return;
  lastAt[kind] = now;
  const c = audio();
  if (c) fn(c.currentTime + 0.005);
}


// ---------- music: a lo-fi electric piano, played like a person would. Generated, never a file ----------
// ii-V-I-vi in F (Gm9, C13, Fmaj9, Dm9) at 68 bpm, close voicings that move by step. Chords are strummed
// a little late and uneven, the tape wobbles, the record crackles, and the room is small and warm.
let musicBus = null, musicTimer = 0, musicOn = false, nextBarAt = 0, barIdx = 0, wow = null, crackle = null;
const BEAT = 60 / 68, BAR = BEAT * 4;
const PROG = [
  { root: 98.0, chord: [174.61, 233.08, 293.66, 440.0] },   // Gm9: F Bb D A over G
  { root: 130.81, chord: [164.81, 233.08, 293.66, 440.0] }, // C13: E Bb D A over C
  { root: 87.31, chord: [164.81, 220.0, 261.63, 392.0] },   // Fmaj9: E A C G over F
  { root: 73.42, chord: [174.61, 220.0, 261.63, 329.63] },  // Dm9: F A C E over D
];
const rnd = (a, b) => a + Math.random() * (b - a);

function room() {
  // a small warm room built from decaying noise
  const len = ctx.sampleRate * 2.2;
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
  }
  const conv = ctx.createConvolver();
  conv.buffer = buf;
  return conv;
}

function musicGraph() {
  if (musicBus) return;
  musicBus = ctx.createGain();
  musicBus.gain.value = 0.0001;
  const warm = ctx.createBiquadFilter();
  warm.type = 'lowpass';
  warm.frequency.value = 2600;
  warm.Q.value = 0.5;
  const wet = ctx.createGain();
  wet.gain.value = 0.32;
  musicBus.connect(warm);
  warm.connect(master);
  warm.connect(room()).connect(wet).connect(master);

  // tape wow: one slow wobble shared by every note, so the whole record drifts together
  wow = ctx.createGain();
  wow.gain.value = 7;            // cents
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.45;
  lfo.connect(wow);
  lfo.start();

  // vinyl: sparse pops and a breath of hiss, looped
  const len = ctx.sampleRate * 3;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    d[i] = (Math.random() * 2 - 1) * 0.012;
    if (Math.random() < 0.00035) d[i] = (Math.random() * 2 - 1) * rnd(0.3, 1);
  }
  crackle = ctx.createBufferSource();
  crackle.buffer = buf;
  crackle.loop = true;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 1200;
  const cg = ctx.createGain();
  cg.gain.value = 0.05;
  crackle.connect(hp).connect(cg).connect(musicBus);
  crackle.start();
}

// one electric-piano note: a sine carrier, FM'd by its own pitch with an index that falls fast
// (bright bark on the attack, round tone after), plus a second string a few cents off for width
function ep(t, f, vel, len = 3) {
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(0.07 * vel, t + 0.006);
  out.gain.exponentialRampToValueAtTime(0.03 * vel, t + 0.35);
  out.gain.exponentialRampToValueAtTime(0.0001, t + len);
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.setValueAtTime(900 + 2600 * vel, t);
  tone.frequency.exponentialRampToValueAtTime(700, t + 1.2);
  tone.connect(out).connect(musicBus);

  const mod = ctx.createOscillator();
  mod.frequency.value = f;
  const idx = ctx.createGain();
  idx.gain.setValueAtTime(f * (0.8 + 1.6 * vel), t);
  idx.gain.exponentialRampToValueAtTime(f * 0.12, t + 0.5);
  mod.connect(idx);
  [[0, 1], [rnd(3, 6), 0.5]].forEach(([cents, lvl]) => {
    const car = ctx.createOscillator();
    car.frequency.value = f;
    car.detune.value = cents;
    idx.connect(car.frequency);
    wow.connect(car.detune);
    const g = ctx.createGain();
    g.gain.value = lvl;
    car.connect(g).connect(tone);
    car.start(t);
    car.stop(t + len + 0.05);
  });
  // the tine: a faint high ping that dies almost at once
  const tine = ctx.createOscillator();
  tine.frequency.value = f * 7.1;
  const tg = ctx.createGain();
  tg.gain.setValueAtTime(0.0001, t);
  tg.gain.exponentialRampToValueAtTime(0.012 * vel, t + 0.003);
  tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  tine.connect(tg).connect(musicBus);
  tine.start(t);
  tine.stop(t + 0.15);
  mod.start(t);
  mod.stop(t + len + 0.05);
}

function bass(t, f, len) {
  const o = ctx.createOscillator();
  o.frequency.value = f;
  wow.connect(o.detune);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.11, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 320;
  o.connect(lp).connect(g).connect(musicBus);
  o.start(t);
  o.stop(t + len + 0.05);
}

// a hand never hits every key at once: roll the chord upward with uneven gaps and uneven weight
function strum(t, notes, vel) {
  let at = t + rnd(0, 0.02);
  notes.forEach((f) => {
    ep(at, f, vel * rnd(0.8, 1.05), rnd(2.6, 3.6));
    at += rnd(0.012, 0.035);
  });
}

function playBar(t) {
  const { root, chord } = PROG[barIdx % PROG.length];
  bass(t + rnd(0, 0.015), root, BAR * 0.9);
  strum(t, chord, rnd(0.55, 0.75));
  // sometimes a soft push on the "and" of three, top notes only
  if (Math.random() < 0.55) strum(t + BEAT * 2.5 + rnd(-0.02, 0.03), chord.slice(-2), rnd(0.3, 0.42));
  // a few melody notes from the chord, an octave up, never on a grid and never crowded
  let last = -2;
  for (let e = 1; e < 8; e++) {
    if (e - last < 2 || Math.random() > 0.2) continue;
    last = e;
    const f = chord[(Math.random() * chord.length) | 0] * 2;
    ep(t + e * (BEAT / 2) + rnd(-0.02, 0.025), f, rnd(0.3, 0.5), rnd(1.8, 2.6));
  }
  barIdx++;
}

function scheduleMusic() {
  const now = ctx.currentTime;
  while (nextBarAt < now + 1.2) {
    playBar(nextBarAt);
    nextBarAt += BAR;
  }
}

function setMusic(on) {
  if (!audio()) return;
  musicGraph();
  const t = ctx.currentTime;
  musicBus.gain.cancelScheduledValues(t);
  musicBus.gain.setValueAtTime(Math.max(musicBus.gain.value, 0.0001), t);
  if (on && !musicOn) {
    musicOn = true;
    nextBarAt = Math.max(nextBarAt, t + 0.3);
    scheduleMusic();
    musicTimer = setInterval(scheduleMusic, 300);
    musicBus.gain.exponentialRampToValueAtTime(0.3, t + 4);   // the whole bed sits far under the UI sounds
  } else if (!on && musicOn) {
    musicOn = false;
    clearInterval(musicTimer);
    musicBus.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
  }
}

// hidden tab: let the room go quiet; back again: pick up where it was
document.addEventListener('visibilitychange', () => {
  if (!ctx) return;
  if (document.hidden) ctx.suspend();
  else if (enabled) ctx.resume();
});
// a returning visitor who left sound on: start once the browser allows audio (first gesture)
if (enabled) {
  const start = () => { setMusic(true); window.removeEventListener('pointerdown', start); window.removeEventListener('keydown', start); };
  window.addEventListener('pointerdown', start);
  window.addEventListener('keydown', start);
}

// a tap on wood: three filter colours in turn and a little pitch drift, so a hundred clicks never sound the same
const TAP = [1800, 2350, 1450];
let tapIdx = 0;
const drift = (k) => 1 + (Math.random() - 0.5) * k;
function tap(t, pitch, level) {
  const n = noise();
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = TAP[tapIdx++ % TAP.length] * pitch * drift(0.12);
  bp.Q.value = 6;
  const g = ctx.createGain();
  env(g, t, 0.32 * level, 0.002, 0.06);
  n.connect(bp).connect(g).connect(master);
  n.start(t, Math.random() * 0.3);
  n.stop(t + 0.09);
}

export const sound = {
  get on() { return enabled; },
  // has the visitor ever chosen? if they muted once, the page never turns sound on by itself
  get chosen() { return chosen; },
  set(on) {
    enabled = on;
    chosen = true;
    try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* ignore */ }
    if (on) { audio(); play((t) => { tone(t, 660, 0.08, 0.12); tone(t + 0.07, 990, 0.06, 0.16); }, 0); }
    setMusic(on);
  },
  move: () => play((t) => knock(t, 1 + (Math.random() - 0.5) * 0.08), 45, 'move'),
  capture: () => play((t) => { knock(t, 1.05, 1); knock(t + 0.075, 0.82, 0.9); }, 45, 'move'),
  mate: () => play((t) => {
    knock(t, 0.75, 1.2);
    [98, 146.8, 196, 293.7].forEach((f, i) => tone(t + 0.04 + i * 0.03, f, 0.09, 2.2, i % 2 ? 'triangle' : 'sine'));
  }, 0, 'mate'),
  tick: () => play((t) => tone(t, 2600, 0.025, 0.03), 60, 'tick'),
  tap: (pitch = 1, level = 1) => play((t) => tap(t, pitch, level), 55, 'tap'),
  // a poked piece leaves the board with a rising blip, and lands with a knock
  hop: () => play((t) => {
    const o = ctx.createOscillator();
    const f = 340 * drift(0.15);
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 2.1, t + 0.13);
    const g = ctx.createGain();
    env(g, t, 0.07, 0.01, 0.14);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.2);
    tap(t, 1.1, 0.7);
  }, 40, 'hop'),
  land: () => play((t) => knock(t, 1.08 * drift(0.1), 0.85), 30, 'land'),
  // annotated moves: a shimmering rising bell for brilliant, a clean two-note for great
  brilliant: () => play((t) => {
    [659.25, 830.61, 987.77, 1318.51, 1661.22].forEach((f, i) => {
      tone(t + i * 0.055, f, 0.05, 1.1, 'triangle');
      tone(t + i * 0.055 + 0.01, f * 2, 0.012, 0.6);
    });
    tone(t, 164.81, 0.06, 1.2);
  }, 0, 'mark'),
  great: () => play((t) => { tone(t, 880, 0.05, 0.5, 'triangle'); tone(t + 0.09, 1318.51, 0.045, 0.7, 'triangle'); }, 0, 'mark'),
  // the rook coming down: a deep double knock
  slam: () => play((t) => { knock(t, 0.62, 1.3); knock(t + 0.045, 0.5, 0.9); }, 30, 'land'),
  // the queen rising: three soft rising notes
  rise: () => play((t) => [659.25, 880, 1174.66].forEach((f, i) => tone(t + i * 0.09, f, 0.035, 0.6, 'triangle')), 0, 'rise'),
  // the bishop spinning, the king wobbling
  spin: () => play((t) => { const n = noise(); const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 3; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(2600, t + 0.6); const g = ctx.createGain(); env(g, t, 0.05, 0.08, 0.8); n.connect(f).connect(g).connect(master); n.start(t); n.stop(t + 0.5); }, 100, 'spin'),
  wobble: () => play((t) => [0, 0.2, 0.36].forEach((d, i) => knock(t + d, 0.8 + i * 0.08, 0.5 - i * 0.12)), 0, 'land'),
  // a letter settling into place: each one a semitone above the last
  letter: (i) => play((t) => tone(t, 880 * Math.pow(2, i / 12), 0.03, 0.05, 'triangle'), 0, 'letter'),
  // a secret found: a bright arpeggio over a low root
  secret: () => play((t) => {
    tone(t, 130.81, 0.07, 1.4);
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(t + i * 0.06, f, 0.06, 0.9, 'triangle'));
  }, 0, 'secret'),
  press: () => play((t) => {
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(520, t);
    o.frequency.exponentialRampToValueAtTime(260, t + 0.05);
    const g = ctx.createGain();
    env(g, t, 0.1, 0.003, 0.06);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.1);
  }, 40, 'press'),
  whoosh: () => play((t) => {
    const n = noise();
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 0.8;
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(2200, t + 0.35);
    const g = ctx.createGain();
    env(g, t, 0.06, 0.12, 0.3);
    n.connect(f).connect(g).connect(master);
    n.start(t);
    n.stop(t + 0.5);
  }, 200, 'whoosh'),
};
