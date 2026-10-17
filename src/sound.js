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


// ---------- ambient music: generated, never a file. Slow chords, a soft piano, a long room ----------
let musicBus = null, musicTimer = 0, musicOn = false, nextChordAt = 0, chordIdx = 0, nextNoteAt = 0;
// D dorian colours: Dm9, Bbmaj7, Fmaj7/A, C6/9 (Hz), each held for 8 seconds
const CHORDS = [
  [146.83, 174.61, 220.0, 261.63, 329.63],
  [116.54, 174.61, 220.0, 293.66, 349.23],
  [110.0, 174.61, 220.0, 261.63, 329.63],
  [130.81, 196.0, 246.94, 293.66, 329.63],
];
const CHORD_LEN = 8;

function room() {
  // a three-second hall built from decaying noise
  const len = ctx.sampleRate * 3;
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
  }
  const conv = ctx.createConvolver();
  conv.buffer = buf;
  return conv;
}

function musicGraph() {
  if (musicBus) return;
  musicBus = ctx.createGain();
  musicBus.gain.value = 0.0001;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2400;
  const wet = ctx.createGain();
  wet.gain.value = 0.55;
  const verb = room();
  musicBus.connect(lp);
  lp.connect(master);
  lp.connect(verb).connect(wet).connect(master);
}

function pad(t, freq, len) {
  [-6, 6].forEach((cents) => {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    o.detune.value = cents;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + 2.5);
    g.gain.setValueAtTime(0.05, t + len - 2);
    g.gain.linearRampToValueAtTime(0.0001, t + len + 1.5);
    o.connect(f).connect(g).connect(musicBus);
    o.start(t);
    o.stop(t + len + 1.6);
  });
}

function keyNote(t, freq, level = 0.09) {
  // a felt-piano note: sine body, a quieter octave, quick bloom, long fade
  [[1, level], [2, level * 0.25]].forEach(([mul, peak]) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq * mul;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
    o.connect(g).connect(musicBus);
    o.start(t);
    o.stop(t + 3.3);
  });
}

function scheduleMusic() {
  const now = ctx.currentTime;
  while (nextChordAt < now + 1) {
    const chord = CHORDS[chordIdx % CHORDS.length];
    pad(nextChordAt, chord[0] / 2, CHORD_LEN);              // low root
    chord.slice(1, 4).forEach((f) => pad(nextChordAt, f, CHORD_LEN));
    chordIdx++;
    nextChordAt += CHORD_LEN;
  }
  while (nextNoteAt < now + 1) {
    const chord = CHORDS[(chordIdx - 1 + CHORDS.length) % CHORDS.length];
    const f = chord[1 + Math.floor(Math.random() * (chord.length - 1))] * (Math.random() < 0.4 ? 2 : 1);
    keyNote(nextNoteAt, f, 0.05 + Math.random() * 0.05);
    nextNoteAt += 1.2 + Math.random() * 2.4;                 // unhurried, never on a grid
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
    nextChordAt = Math.max(nextChordAt, t + 0.1);
    nextNoteAt = Math.max(nextNoteAt, t + 1.5);
    scheduleMusic();
    musicTimer = setInterval(scheduleMusic, 400);
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
