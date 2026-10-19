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

// ---------- the board's voice: modal wood. Each sound is a handful of resonances that ring and die fast ----------
// A piece set down on a wooden board is a few body modes (a low thud, a mid knock, a bright tick) plus a
// millisecond of contact noise. Modes: [Hz, level, ms until silent].
const MOVE_MODES = [[915, 0.5, 62], [474, 0.55, 40], [1303, 0.38, 46], [1077, 0.27, 44], [172, 0.2, 38], [205, 0.12, 50], [721, 0.13, 40],
  [484, 0.006, 160], [904, 0.006, 170], [614, 0.005, 150], [689, 0.004, 150]];
const OPP_MODES = [[883, 0.5, 62], [463, 0.36, 40], [1270, 0.42, 46], [1055, 0.26, 44], [312, 0.16, 40], [161, 0.18, 38], [592, 0.1, 45],
  [904, 0.007, 170], [614, 0.004, 150], [452, 0.004, 150]];
const CAPTURE_MODES = [[1281, 0.42, 55], [1432, 0.4, 62], [937, 0.36, 46], [1852, 0.24, 40], [151, 0.3, 50], [1120, 0.2, 50], [474, 0.16, 45],
  [1443, 0.014, 300], [1238, 0.01, 280], [452, 0.007, 220], [947, 0.007, 220]];

function wood(t, modes, level = 1, click = 1) {
  const out = ctx.createGain();
  out.gain.value = 0.42 * level;
  out.connect(master);
  const shift = drift(0.03);                         // no two set-downs are quite the same
  modes.forEach(([f, g, ms]) => {
    const o = ctx.createOscillator();
    o.frequency.value = f * shift;
    const e = ctx.createGain();
    e.gain.setValueAtTime(0.0001, t);
    e.gain.exponentialRampToValueAtTime(g, t + 0.0015);
    e.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
    o.connect(e).connect(out);
    o.start(t);
    o.stop(t + ms / 1000 + 0.02);
  });
  // the contact itself: a couple of milliseconds of bright noise
  const n = noise();
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2600;
  bp.Q.value = 0.9;
  const ng = ctx.createGain();
  env(ng, t, 0.22 * level * click, 0.0008, 0.007);
  n.connect(bp).connect(ng).connect(master);
  n.start(t, Math.random() * 0.3);
  n.stop(t + 0.02);
}

// the end of the game: two short pure notes, held a moment, then cut clean
function gameEnd(t) {
  [[t, 624, 0.12, 0.006], [t + 0.12, 592, 0.12, 0.018], [t + 0.12, 711, 0.06, 0.016]].forEach(([at, f, g, hold]) => {
    const o = ctx.createOscillator();
    o.frequency.value = f;
    const e = ctx.createGain();
    e.gain.setValueAtTime(0.0001, at);
    e.gain.exponentialRampToValueAtTime(g, at + 0.002);
    e.gain.setValueAtTime(g * 0.8, at + 0.002 + hold);
    e.gain.exponentialRampToValueAtTime(0.0001, at + 0.012 + hold);
    o.connect(e).connect(master);
    o.start(at);
    o.stop(at + hold + 0.03);
  });
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


// ---------- music: felt piano in loops of different lengths. Generated, never a file ----------
// Eno's tape-loop idea: six short phrases in D dorian, each repeating at its own odd period (17.1 s to 37.7 s),
// so they line up differently every time and the piece never audibly loops. A low drone swells under them,
// and the room is large and soft.
let musicBus = null, musicTimer = 0, musicOn = false, droneAt = 0;
const rnd = (a, b) => a + Math.random() * (b - a);
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
// [seconds into the loop, midi note, velocity]
const LOOPS = [
  { period: 19.7, pan: -0.3, notes: [[0, 62, 0.5], [2.3, 69, 0.38]] },
  { period: 23.3, pan: 0.35, notes: [[1.1, 65, 0.42], [3.6, 72, 0.3], [5.4, 76, 0.24]] },
  { period: 29.9, pan: -0.1, notes: [[0.4, 57, 0.45], [4.4, 67, 0.32]] },
  { period: 31.1, pan: 0.15, notes: [[2.0, 60, 0.36], [2.9, 64, 0.3]] },
  { period: 37.7, pan: 0, notes: [[0, 50, 0.5]] },
  { period: 17.1, pan: 0.5, notes: [[6.2, 81, 0.16]] },
].map((l) => ({ ...l, next: 0 }));

function room(seconds = 6, decay = 2.2) {
  // a large soft room built from decaying noise
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  const conv = ctx.createConvolver();
  conv.buffer = buf;
  return conv;
}

function musicGraph() {
  if (musicBus) return;
  musicBus = ctx.createGain();
  musicBus.gain.value = 0.0001;
  const soft = ctx.createBiquadFilter();
  soft.type = 'lowpass';
  soft.frequency.value = 4200;
  const dry = ctx.createGain();
  dry.gain.value = 0.55;
  const wet = ctx.createGain();
  wet.gain.value = 0.55;
  musicBus.connect(soft);
  soft.connect(dry).connect(master);
  soft.connect(room()).connect(wet).connect(master);
}

// felt piano: a few slightly inharmonic partials and a soft hammer; low notes ring longer
function piano(t, midi, vel, pan) {
  const f = mtof(midi);
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  p.connect(musicBus);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(f * (2 + vel * 6) * 0.75, t);
  lp.frequency.exponentialRampToValueAtTime(Math.max(f * 1.2, 200), t + 2.5);
  lp.connect(p);
  const out = ctx.createGain();
  const dec = Math.max(1.6, 7 - (midi - 48) * 0.09);
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(vel * 0.09, t + 0.012);
  out.gain.exponentialRampToValueAtTime(vel * 0.034, t + 0.35);
  out.gain.exponentialRampToValueAtTime(0.0001, t + dec);
  out.connect(lp);
  [[1, 1], [2, 0.42], [3, 0.16], [4, 0.07], [5, 0.03]].forEach(([n, a]) => {
    const o = ctx.createOscillator();
    o.frequency.value = f * n * (1 + 0.0004 * n * n);
    const g = ctx.createGain();
    g.gain.value = a;
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dec + 0.1);
  });
  // the hammer: a tiny filtered tick of noise
  const n = noise();
  const nf = ctx.createBiquadFilter();
  nf.type = 'bandpass';
  nf.frequency.value = f * 3;
  nf.Q.value = 1.2;
  const ng = ctx.createGain();
  env(ng, t, vel * 0.008, 0.001, 0.025);
  n.connect(nf).connect(ng).connect(p);
  n.start(t, Math.random() * 0.4);
  n.stop(t + 0.04);
}

function drone(t, midi, level, len) {
  const o = ctx.createOscillator();
  o.frequency.value = mtof(midi);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(level, t + 6);
  g.gain.setValueAtTime(level, t + len);
  g.gain.linearRampToValueAtTime(0.0001, t + len + 8);
  o.connect(g).connect(musicBus);
  o.start(t);
  o.stop(t + len + 8.1);
}

function scheduleMusic() {
  const now = ctx.currentTime, until = now + 1.5;
  for (const L of LOOPS) {
    while (L.next < until) {
      for (const [dt, m, v] of L.notes) {
        const t = L.next + dt + rnd(-0.03, 0.03);
        if (t > now) piano(t, m, v * rnd(0.85, 1.1), L.pan);
      }
      L.next += L.period;
    }
  }
  while (droneAt < until) {
    drone(droneAt, 38, 0.014, 12);
    drone(droneAt + 3, 45, 0.007, 10);
    droneAt += 22;
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
    // each loop starts somewhere in its first few seconds, so no two visits begin alike
    for (const L of LOOPS) L.next = Math.max(L.next, t + 0.3 + rnd(0, 6));
    droneAt = Math.max(droneAt, t + 0.3);
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

// a pure ping: one sine (or triangle) with a quick rise and a smooth exponential fall
const drift = (k) => 1 + (Math.random() - 0.5) * k;
function ping(t, freq, peak, decay, type = 'sine') {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const g = ctx.createGain();
  env(g, t, peak, 0.0015, decay);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + decay + 0.05);
}

// a click on the page: a soft glass tick, a short high ping with a faint octave; a little pitch drift
// so a hundred clicks never sound the same
function tap(t, pitch, level) {
  const f = 2637 * pitch * drift(0.06);
  ping(t, f, 0.035 * level, 0.045);
  ping(t, f * 2, 0.006 * level, 0.02);
}

// touching a piece: the board's own wood, a few struck modes and a low knock, lighter than a move
function piece(t, level) {
  const k = drift(0.05);
  [[1180, 0.1, 40], [1900, 0.05, 50], [3050, 0.02, 70], [240, 0.1, 28]].forEach(([f, a, damp]) => ping(t, f * k, a * level, 1 / damp));
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
  // white's moves knock a touch fuller than black's, the way a board sounds from your own side
  move: (white = true) => play((t) => wood(t, white ? MOVE_MODES : OPP_MODES, white ? 1 : 0.7), 45, 'move'),
  capture: () => play((t) => { wood(t, MOVE_MODES, 0.45, 0.6); wood(t + 0.008, CAPTURE_MODES, 1, 1.3); }, 45, 'move'),
  castle: () => play((t) => { wood(t, MOVE_MODES, 0.13); wood(t + 0.09, MOVE_MODES, 1); }, 45, 'move'),
  mate: () => play((t) => {
    wood(t, MOVE_MODES, 1);
    gameEnd(t + 0.16);
    [98, 146.8, 196].forEach((f, i) => tone(t + 0.2 + i * 0.03, f, 0.04, 2, i % 2 ? 'triangle' : 'sine'));
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
  land: () => play((t) => wood(t, MOVE_MODES, 0.85), 30, 'land'),
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
  // links and buttons: two glass notes rising a fifth
  press: () => play((t) => { ping(t, 1318.5, 0.06, 0.12, 'triangle'); ping(t + 0.045, 1975.5, 0.05, 0.18, 'triangle'); }, 40, 'press'),
  piece: (level = 1) => play((t) => piece(t, level), 40, 'piece'),
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
