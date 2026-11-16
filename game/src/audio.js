// audio.js — every sound is synthesized with WebAudio. No audio files,
// no network: a shared noise buffer, oscillators and filters, with distance
// attenuation for gunfire. Safe to call before any user gesture; the
// context is created lazily on the first ensure() after interaction.

let ctx = null;
let noiseBuf = null;
let master = null;

export function ensureAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return true;
  }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    // Two seconds of white noise, reused by every percussive sound.
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return true;
  } catch (_) {
    return false;
  }
}

function noiseSrc() {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  return src;
}

// Volume falls off with distance: full inside 8 m, gone by 60 m.
function distGain(dist) {
  if (dist === undefined) return 1;
  return Math.max(0, 1 - Math.max(0, dist - 8) / 52);
}

function playNoise({ dur, type = 'bandpass', freq = 1200, q = 1, gain = 0.5, at = 0, dist }) {
  if (!ctx) return;
  const t = ctx.currentTime + at;
  const src = noiseSrc();
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  const g = ctx.createGain();
  const vol = gain * distGain(dist);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(filter);
  filter.connect(g);
  g.connect(master);
  src.start(t);
  src.stop(t + dur + 0.02);
}

function playTone({ freq, freqEnd, dur, type = 'sine', gain = 0.3, at = 0 }) {
  if (!ctx) return;
  const t = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (freqEnd !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(g);
  g.connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export const sfx = {
  shot(weapon, dist) {
    if (!ctx) return;
    if (weapon === 'shotgun') {
      playNoise({ dur: 0.28, freq: 900, q: 0.6, gain: 0.9, dist });
      playTone({ freq: 120, freqEnd: 45, dur: 0.22, type: 'triangle', gain: 0.5 });
    } else if (weapon === 'dmr') {
      playNoise({ dur: 0.3, freq: 1600, q: 0.8, gain: 0.85, dist });
      playTone({ freq: 100, freqEnd: 40, dur: 0.3, type: 'triangle', gain: 0.55 });
    } else if (weapon === 'rifle') {
      playNoise({ dur: 0.12, freq: 2200, q: 0.9, gain: 0.55, dist });
      playTone({ freq: 160, freqEnd: 60, dur: 0.12, type: 'triangle', gain: 0.35 });
    } else {
      playNoise({ dur: 0.09, freq: 2800, q: 1.2, gain: 0.45, dist });
      playTone({ freq: 200, freqEnd: 80, dur: 0.09, type: 'triangle', gain: 0.25 });
    }
  },
  dry() {
    playTone({ freq: 1400, dur: 0.03, type: 'square', gain: 0.12 });
  },
  reload() {
    playTone({ freq: 900, dur: 0.04, type: 'square', gain: 0.15 });
    playTone({ freq: 600, dur: 0.04, type: 'square', gain: 0.15, at: 0.18 });
    playTone({ freq: 1100, dur: 0.05, type: 'square', gain: 0.18, at: 0.45 });
  },
  hit(head) {
    playTone({ freq: head ? 2400 : 1800, dur: 0.06, type: 'sine', gain: 0.3 });
  },
  kill() {
    playTone({ freq: 880, dur: 0.08, type: 'sine', gain: 0.3 });
    playTone({ freq: 1320, dur: 0.12, type: 'sine', gain: 0.3, at: 0.08 });
  },
  hurt() {
    playNoise({ dur: 0.15, type: 'lowpass', freq: 400, gain: 0.4 });
    playTone({ freq: 90, freqEnd: 50, dur: 0.2, type: 'sawtooth', gain: 0.2 });
  },
  explode(dist) {
    playNoise({ dur: 1.1, type: 'lowpass', freq: 500, gain: 1.0, dist });
    playTone({ freq: 90, freqEnd: 28, dur: 0.9, type: 'sine', gain: 0.9 });
    playNoise({ dur: 0.4, freq: 3000, q: 0.5, gain: 0.3, at: 0.05, dist });
  },
  plant() {
    playTone({ freq: 1200, dur: 0.1, type: 'square', gain: 0.2 });
    playTone({ freq: 1200, dur: 0.1, type: 'square', gain: 0.2, at: 0.2 });
  },
  beep() {
    playTone({ freq: 1500, dur: 0.07, type: 'square', gain: 0.18 });
  },
  defuse() {
    playTone({ freq: 1000, dur: 0.08, type: 'sine', gain: 0.2 });
    playTone({ freq: 1400, dur: 0.08, type: 'sine', gain: 0.2, at: 0.12 });
  },
  buy() {
    playTone({ freq: 700, dur: 0.05, type: 'triangle', gain: 0.25 });
    playTone({ freq: 1050, dur: 0.07, type: 'triangle', gain: 0.25, at: 0.06 });
  },
  roundWin() {
    [523, 659, 784].forEach((f, i) => playTone({ freq: f, dur: 0.18, type: 'triangle', gain: 0.3, at: i * 0.12 }));
  },
  roundLose() {
    [392, 330, 262].forEach((f, i) => playTone({ freq: f, dur: 0.2, type: 'triangle', gain: 0.28, at: i * 0.13 }));
  },
  throw_() {
    playNoise({ dur: 0.12, freq: 600, q: 1, gain: 0.25 });
  },
};
