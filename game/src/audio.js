// DUSTLINE — audio: every sound is synthesized with WebAudio, no audio files and
// no network. A gunshot is a noise burst through a low-pass filter plus a low
// thump; the rest are small oscillator phrases.
export function createAudio() {
  let ctx = null;
  let master = null;
  let enabled = true;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.32;
      master.connect(ctx.destination);
    } catch {
      return false;
    }
    return true;
  }

  function noiseBuffer(dur) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    return buf;
  }

  function burst(dur, filterFreq, gain, type = 'lowpass') {
    if (!ensure() || !enabled) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(dur);
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t);
  }

  function tone(freq, dur, gain, type = 'sine', slideTo = null) {
    if (!ensure() || !enabled) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur);
  }

  return {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
    toggle() { enabled = !enabled; return enabled; },
    play(name, head = false, bot = null) {
      if (!ensure() || !enabled) return;
      // Distant bot shots are quieter and duller.
      const dist = bot ? 0.35 : 1;
      switch (name) {
        case 'rifle': burst(0.12, 1800, 0.5 * dist); tone(120, 0.09, 0.3 * dist, 'sine', 55); break;
        case 'smg': burst(0.09, 2200, 0.4 * dist); tone(150, 0.06, 0.22 * dist, 'sine', 70); break;
        case 'pistol': burst(0.1, 2600, 0.42 * dist); tone(170, 0.07, 0.2 * dist, 'sine', 80); break;
        case 'sniper': burst(0.22, 900, 0.7 * dist); tone(90, 0.2, 0.4 * dist, 'sine', 40); break;
        case 'dry': tone(1200, 0.04, 0.12, 'square'); break;
        case 'reload': tone(700, 0.05, 0.12, 'square'); setTimeout(() => tone(500, 0.05, 0.12, 'square'), 180); break;
        case 'hit': tone(head ? 2400 : 1800, 0.06, 0.2, 'sine'); break;
        case 'kill': tone(880, 0.08, 0.2, 'sine'); setTimeout(() => tone(1320, 0.1, 0.2, 'sine'), 90); break;
        case 'explode': burst(0.7, 400, 0.9); tone(60, 0.5, 0.5, 'sine', 30); break;
        case 'smoke': burst(0.5, 800, 0.25, 'bandpass'); break;
        case 'plant': tone(1000, 0.09, 0.2, 'square'); setTimeout(() => tone(1000, 0.09, 0.2, 'square'), 200); break;
        case 'defuse': tone(1400, 0.09, 0.2, 'square'); setTimeout(() => tone(1400, 0.09, 0.2, 'square'), 200); break;
        case 'roundWin': [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.18, 0.22, 'triangle'), i * 130)); break;
        case 'roundLose': [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.2, 0.22, 'triangle'), i * 140)); break;
        case 'buy': tone(660, 0.06, 0.15, 'sine'); break;
        case 'click': tone(900, 0.03, 0.1, 'square'); break;
        default: break;
      }
    },
  };
}
