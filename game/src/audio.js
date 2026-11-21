// Tiny synthesized sound effects for The Velvet Hour — WebAudio only, no files.
// Everything is a short oscillator blip so the game stays fully offline.

let ctx = null;
let muted = false;

export function ensureAudio() {
  if (!ctx) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
    } catch {
      ctx = null;
    }
  }
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

export function setMuted(value) {
  muted = !!value;
}

export function isMuted() {
  return muted;
}

function blip(freq, dur, type, gain, slideTo) {
  if (muted) return;
  const ac = ensureAudio();
  if (!ac) return;
  const t = ac.currentTime;
  const osc = ac.createOscillator();
  const amp = ac.createGain();
  osc.type = type || 'sine';
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  amp.gain.setValueAtTime(gain || 0.08, t);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(amp).connect(ac.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export const sfx = {
  pickup() {
    blip(660, 0.12, 'sine', 0.09, 990);
    setTimeout(() => blip(990, 0.14, 'sine', 0.07, 1320), 70);
  },
  coin() {
    blip(1240, 0.07, 'triangle', 0.08, 1560);
  },
  spotted() {
    blip(220, 0.28, 'sawtooth', 0.09, 440);
  },
  caught() {
    blip(330, 0.5, 'sawtooth', 0.1, 110);
  },
  clear() {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.18, 'triangle', 0.08), i * 90));
  },
  click() {
    blip(440, 0.05, 'square', 0.04);
  },
};
