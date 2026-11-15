// Sound, synthesized: every effect is an oscillator or filtered noise made in
// code, so the game ships no audio files and requests nothing. Each loud event
// also drops a hearing marker on the bus, which bots read to react to what they
// hear (gunfire carries 25 m, running steps 8 m, quiet walking nothing).
// If the AudioContext is suspended (no gesture yet, or shot mode), the markers
// still land and the sounds are skipped.
const HEARING_RANGE = { shot: 25, step: 8, explosion: 60, plant: 12, reload: 6 };

export function createAudio() {
  let ctx = null;
  let master = null;
  const hearings = [];
  let muted = false;

  function ensure() {
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
      return true;
    } catch {
      return false;
    }
  }

  function noiseBurst(seconds, filterFreq, gainValue, when = 0) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime + when;
    const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + seconds);
    source.connect(filter).connect(gain).connect(master);
    source.start(t);
  }

  function tone(freq, seconds, gainValue, type = 'sine', when = 0) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + seconds);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + seconds + 0.02);
  }

  function hear(type, x, z, time) {
    hearings.push({ type, x, z, radius: HEARING_RANGE[type] || 10, time });
    if (hearings.length > 40) hearings.splice(0, hearings.length - 40);
  }

  return {
    hearings,
    unlock() {
      ensure();
    },
    setMuted(value) {
      muted = value;
    },
    shot(weaponId, x, z, time) {
      hear('shot', x, z, time);
      if (weaponId === 'pistol') noiseBurst(0.09, 1800, 0.35);
      else if (weaponId === 'smg') noiseBurst(0.07, 2400, 0.28);
      else noiseBurst(0.12, 1400, 0.45);
      tone(90, 0.08, 0.3, 'triangle');
    },
    step(x, z, running, time) {
      if (running) hear('step', x, z, time);
      noiseBurst(0.03, 500, running ? 0.06 : 0.02);
    },
    reload(x, z, time) {
      hear('reload', x, z, time);
      tone(1200, 0.05, 0.12, 'square');
      tone(900, 0.05, 0.1, 'square', 0.12);
    },
    hit(killed) {
      tone(killed ? 1400 : 1000, 0.06, 0.15, 'sine');
    },
    hurt() {
      tone(160, 0.12, 0.25, 'sawtooth');
    },
    beep() {
      tone(1800, 0.07, 0.2, 'square');
    },
    plant(x, z, time) {
      hear('plant', x, z, time);
      tone(700, 0.1, 0.2, 'square');
      tone(1050, 0.12, 0.2, 'square', 0.12);
    },
    explosion(x, z, time) {
      hear('explosion', x, z, time);
      noiseBurst(0.7, 300, 0.8);
      tone(55, 0.6, 0.6, 'sine');
    },
    win(attackersWon) {
      tone(523, 0.12, 0.2, 'sine');
      tone(attackersWon ? 784 : 392, 0.2, 0.2, 'sine', 0.12);
    },
    buy() {
      tone(880, 0.06, 0.15, 'sine');
      tone(1320, 0.08, 0.15, 'sine', 0.07);
    },
    denied() {
      tone(220, 0.12, 0.15, 'square');
    },
    prune(time) {
      while (hearings.length && time - hearings[0].time > 6) hearings.shift();
    },
  };
}
