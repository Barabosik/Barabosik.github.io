// Small synthesized sound set: no audio files, nothing plays until the visitor turns it on.
const KEY = 'na-sound';
let ctx = null;
let master = null;
let enabled = false;
let lastAt = 0;

try { enabled = localStorage.getItem(KEY) === 'on'; } catch { /* storage blocked: stay off */ }

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

function play(fn, gap = 45) {
  if (!enabled) return;
  const now = performance.now();
  if (now - lastAt < gap) return;
  lastAt = now;
  const c = audio();
  if (c) fn(c.currentTime + 0.005);
}

export const sound = {
  get on() { return enabled; },
  set(on) {
    enabled = on;
    try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* ignore */ }
    if (on) { audio(); play((t) => { tone(t, 660, 0.08, 0.12); tone(t + 0.07, 990, 0.06, 0.16); }, 0); }
  },
  move: () => play((t) => knock(t, 1 + (Math.random() - 0.5) * 0.08)),
  capture: () => play((t) => { knock(t, 1.05, 1); knock(t + 0.075, 0.82, 0.9); }),
  mate: () => play((t) => {
    knock(t, 0.75, 1.2);
    [98, 146.8, 196, 293.7].forEach((f, i) => tone(t + 0.04 + i * 0.03, f, 0.09, 2.2, i % 2 ? 'triangle' : 'sine'));
  }, 0),
  tick: () => play((t) => tone(t, 2600, 0.025, 0.03), 60),
  press: () => play((t) => {
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(520, t);
    o.frequency.exponentialRampToValueAtTime(260, t + 0.05);
    const g = ctx.createGain();
    env(g, t, 0.1, 0.003, 0.06);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.1);
  }, 0),
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
  }, 200),
};
