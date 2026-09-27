// Tiny WebAudio synth for retro sound effects. No audio files needed.

const Sfx = {
  ctx: null,
  master: null,
  muted: false,

  // Must be called from a user gesture (browsers block audio until then).
  init() {
    if (!this.ctx) {
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.6;
        this.master.connect(this.ctx.destination);
      } catch (e) {
        return;
      }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  },

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  },

  tone(freq, dur, type = 'square', vol = 0.08, delay = 0, slideTo = null) {
    const c = this.ctx;
    const t = c.currentTime + delay;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  },

  noise(dur, vol = 0.08, delay = 0) {
    const c = this.ctx;
    const t = c.currentTime + delay;
    const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    const gain = c.createGain();
    src.buffer = buf;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(gain).connect(this.master);
    src.start(t);
  },

  play(name, n = 0) {
    if (!this.ctx || this.muted) return;
    const seq = (notes, step, dur, type, vol) =>
      notes.forEach((f, i) => this.tone(f, dur, type, vol, i * step));
    switch (name) {
      case 'coin': this.tone(988, 0.06, 'square', 0.05); this.tone(1319, 0.1, 'square', 0.05, 0.06); break;
      case 'gem': seq([1047, 1319, 1568, 2093], 0.05, 0.08, 'square', 0.05); break;
      case 'bank': seq([523, 659, 784, 1047], 0.07, 0.12, 'triangle', 0.12); break;
      case 'bigbank': seq([523, 659, 784, 1047, 1319, 1568, 2093], 0.06, 0.14, 'square', 0.06); break;
      case 'hit': this.tone(260, 0.3, 'sawtooth', 0.12, 0, 55); this.noise(0.15, 0.12); break;
      case 'drop': seq([1200, 1000, 850, 700], 0.04, 0.05, 'square', 0.03); break;
      case 'shoot': this.noise(0.06, 0.05); this.tone(900, 0.08, 'triangle', 0.05, 0, 300); break;
      case 'thunk': this.noise(0.04, 0.03); break;
      case 'dash': this.tone(250, 0.2, 'sawtooth', 0.05, 0, 900); break;
      case 'windup': this.tone(500, 0.12, 'triangle', 0.04, 0, 800); break;
      case 'spawn': this.tone(110, 0.25, 'square', 0.06, 0, 220); break;
      case 'wave': seq([392, 392, 523], 0.12, 0.14, 'square', 0.07); break;
      case 'select': this.tone(660, 0.08, 'square', 0.06); this.tone(990, 0.1, 'square', 0.06, 0.07); break;
      case 'powerup': seq([660, 880, 1320, 1760], 0.06, 0.1, 'triangle', 0.1); break;
      case 'roll': this.tone(420, 0.14, 'triangle', 0.06, 0, 140); break;
      case 'ice': this.tone(1800, 0.35, 'sine', 0.05, 0, 500); this.noise(0.2, 0.04); break;
      case 'bless': seq([784, 988, 1175], 0.08, 0.2, 'sine', 0.07); break;
      case 'steal': seq([1200, 900], 0.05, 0.06, 'square', 0.04); break;
      case 'charge': this.tone(140, 0.5, 'sawtooth', 0.09, 0, 420); this.noise(0.3, 0.06); break;
      case 'stun': this.tone(900, 0.3, 'square', 0.05, 0, 250); this.noise(0.1, 0.1); break;
      case 'boss': seq([196, 196, 233, 196, 294, 277], 0.18, 0.22, 'sawtooth', 0.07); break;
      case 'bossleave': seq([523, 659, 784, 1047, 1319, 1568], 0.09, 0.2, 'triangle', 0.1); break;
      case 'chest': seq([784, 1047, 1319, 1047, 1319, 1568], 0.08, 0.14, 'triangle', 0.09); break;
      case 'unlock': seq([523, 784, 1047, 1568, 2093], 0.05, 0.12, 'square', 0.06); this.noise(0.05, 0.08); break;
      case 'combo': this.tone(600 + Math.min(n, 15) * 70, 0.07, 'square', 0.04, 0.05); break;
      case 'spikes': this.noise(0.06, 0.05); this.tone(1500, 0.05, 'square', 0.03); break;
      case 'barrel': this.tone(70, 0.9, 'sawtooth', 0.06, 0, 45); break;
      case 'crash': this.noise(0.3, 0.14); this.tone(160, 0.2, 'square', 0.06, 0, 60); break;
      case 'snap': this.noise(0.05, 0.15); this.tone(1200, 0.05, 'square', 0.08); this.tone(700, 0.1, 'square', 0.08, 0.04); break;
      case 'trapset': this.tone(500, 0.05, 'square', 0.04); this.tone(350, 0.06, 'square', 0.04, 0.07); break;
      case 'bounty': seq([659, 784, 988, 1319, 1568], 0.07, 0.16, 'square', 0.07); break;
      case 'newbounty': this.tone(880, 0.08, 'triangle', 0.05); this.tone(1320, 0.12, 'triangle', 0.05, 0.08); break;
      case 'down': seq([440, 330, 220], 0.12, 0.2, 'sawtooth', 0.07); break;
      case 'revive': seq([392, 523, 659, 784, 1047], 0.07, 0.14, 'triangle', 0.1); break;
      case 'achieve': seq([784, 1047, 1319, 1568, 2093], 0.06, 0.18, 'triangle', 0.1); this.tone(2637, 0.3, 'sine', 0.04, 0.3); break;
      case 'shiv': this.noise(0.08, 0.1); this.tone(1400, 0.08, 'sawtooth', 0.05, 0, 500); break;
      case 'kill': this.tone(300, 0.25, 'square', 0.08, 0, 80); this.noise(0.2, 0.1, 0.05); break;
      case 'caltrops': seq([1600, 1300, 1700, 1200], 0.03, 0.04, 'square', 0.03); break;
      case 'magnet': this.tone(300, 0.35, 'sine', 0.08, 0, 1200); break;
      case 'decoy': seq([988, 1319, 988, 1319], 0.08, 0.08, 'triangle', 0.05); break;
      case 'buy': seq([523, 784, 1047], 0.06, 0.1, 'square', 0.07); break;
      case 'nope': this.tone(180, 0.15, 'square', 0.06, 0, 120); break;
      case 'sizzle': this.noise(0.25, 0.06); this.tone(90, 0.25, 'sawtooth', 0.04, 0, 60); break;
      case 'arena': seq([262, 330, 392, 523, 392, 523, 659], 0.08, 0.18, 'triangle', 0.09); break;
      case 'gameover': seq([392, 330, 262, 196], 0.22, 0.3, 'square', 0.08); break;
    }
  },
};
