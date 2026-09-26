// Chiptune soundtrack synthesized with WebAudio, using a look-ahead step sequencer.
// Songs are 4 bars of 16th-note steps. Melody tokens: a note (e.g. 'A4', 'C#5'), '.' for a rest,
// or '-' to hold the previous note. Drums: k = kick, s = snare, h = hi-hat, '.' = rest.
// M mutes everything (Sfx.muted); N toggles just the music (saved per browser).

const SONGS = {
  menu: {
    bpm: 96, leadWave: 'triangle', leadVol: 0.05, bassWave: 'triangle', bassVol: 0.08,
    lead: [
      'C5 . E5 . G5 . E5 . C5 . E5 . G5 . C6 .',
      'A4 . C5 . E5 . C5 . A4 . C5 . E5 . A5 .',
      'F4 . A4 . C5 . A4 . F4 . A4 . C5 . F5 .',
      'G4 . B4 . D5 . B4 . G4 . B4 . D5 . G5 .',
    ],
    bass: [
      'C3 . . . G2 . . . C3 . . . G2 . . .',
      'A2 . . . E2 . . . A2 . . . E2 . . .',
      'F2 . . . C3 . . . F2 . . . C3 . . .',
      'G2 . . . D3 . . . G2 . . . B2 . . .',
    ],
    drums: 'k.......s.......',
  },
  main: {
    bpm: 118, leadWave: 'square', leadVol: 0.03, bassWave: 'triangle', bassVol: 0.09,
    lead: [
      'A4 - C5 - E5 - A5 - G5 - E5 - C5 - D5 -',
      'C5 - - - A4 - . . F4 - A4 - C5 - B4 -',
      'E5 - G5 - C6 - B5 - G5 - E5 - D5 - E5 -',
      'D5 - - - B4 - G4 - E4 - - - G#4 - B4 -',
    ],
    bass: [
      'A2 . A3 . A2 . A3 . A2 . A3 . G2 . G3 .',
      'F2 . F3 . F2 . F3 . F2 . F3 . E2 . E3 .',
      'C3 . C4 . C3 . C4 . G2 . G3 . G2 . G3 .',
      'G2 . G3 . G2 . G3 . E2 . E3 . E2 . G#2 .',
    ],
    drums: 'k.h.s.h.k.khs.h.',
  },
  boss: {
    bpm: 150, leadWave: 'square', leadVol: 0.035, bassWave: 'sawtooth', bassVol: 0.035,
    lead: [
      'D5 - - . A4 - - . F5 - E5 - D5 - C#5 -',
      'D5 - - - - - . . A#4 - C5 - C#5 - E5 -',
      'F5 - - . E5 - - . D5 - - . A5 - G5 -',
      'F5 - E5 - D5 - C#5 - D5 - - - . . . .',
    ],
    bass: [
      'D2 D2 D3 D2 D2 D3 D2 D3 D2 D2 D3 D2 F2 F3 E2 E3',
      'A#1 A#1 A#2 A#1 A#1 A#2 A#1 A#2 C2 C2 C3 C2 C#2 C#3 C#2 C#3',
      'D2 D2 D3 D2 D2 D3 D2 D3 D2 D2 D3 D2 F2 F3 E2 E3',
      'A#1 A#1 A#2 A#1 A#1 A#2 A#1 A#2 C2 C2 C3 C2 C#2 C#3 C#2 C#3',
    ],
    drums: 'k.hkk.hks.hkk.sh',
  },
};

const NOTE_INDEX = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };

function noteFreq(name) {
  const m = /^([A-G]#?)(\d)$/.exec(name);
  const midi = (Number(m[2]) + 1) * 12 + NOTE_INDEX[m[1]];
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// Turn bar strings into one step array of { freq, len } (or null for nothing starting on that step).
function parseMelody(bars) {
  const tokens = bars.join(' ').split(/\s+/);
  return tokens.map((tok, i) => {
    if (tok === '.' || tok === '-') return null;
    let len = 1;
    while (tokens[i + len] === '-') len++;
    return { freq: noteFreq(tok), len };
  });
}

for (const song of Object.values(SONGS)) {
  song.leadSteps = parseMelody(song.lead);
  song.bassSteps = parseMelody(song.bass);
  song.length = song.leadSteps.length;
}

const Music = {
  wanted: null,   // track requested (may be before audio is unlocked)
  track: null,    // track actually playing
  bpm: 120,
  step: 0,
  nextTime: 0,
  timer: null,
  paused: false,
  gain: null,
  enabled: (() => {
    try { return localStorage.getItem('lootgoblin_music') !== 'off'; } catch (e) { return true; }
  })(),

  // Switch to a track (or just retune the tempo if it is already playing).
  play(name, bpm = SONGS[name].bpm) {
    this.wanted = name;
    this.bpm = bpm;
    this.paused = false;
    this.start();
  },

  // Starts playback once Sfx has an AudioContext (i.e. after the first key or click).
  start() {
    const ctx = Sfx.ctx;
    if (!ctx || !this.wanted) return;
    if (!this.gain) {
      this.gain = ctx.createGain();
      this.gain.gain.value = 0.7;
      this.gain.connect(ctx.destination);
    }
    if (this.track !== this.wanted) {
      this.track = this.wanted;
      this.step = 0;
      this.nextTime = ctx.currentTime + 0.06;
    }
    if (!this.timer) this.timer = setInterval(() => this.tick(), 25);
  },

  stop() {
    this.wanted = null;
    this.track = null;
    clearInterval(this.timer);
    this.timer = null;
  },

  pause() { this.paused = true; },

  resume() {
    this.paused = false;
    if (Sfx.ctx) this.nextTime = Sfx.ctx.currentTime + 0.05;
  },

  toggle() {
    this.enabled = !this.enabled;
    try { localStorage.setItem('lootgoblin_music', this.enabled ? 'on' : 'off'); } catch (e) { /* storage unavailable */ }
    return this.enabled;
  },

  tick() {
    const ctx = Sfx.ctx;
    if (!ctx || !this.track || this.paused) return;
    // If the tab was throttled we fell behind; skip ahead instead of playing a burst of notes.
    if (this.nextTime < ctx.currentTime - 0.2) this.nextTime = ctx.currentTime + 0.02;
    const song = SONGS[this.track];
    const stepDur = 60 / this.bpm / 4;
    while (this.nextTime < ctx.currentTime + 0.12) {
      if (this.enabled && !Sfx.muted) this.playStep(song, this.step % song.length, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step++;
    }
  },

  playStep(song, i, t, stepDur) {
    const lead = song.leadSteps[i];
    if (lead) this.note(lead.freq, t, lead.len * stepDur * 0.9, song.leadWave, song.leadVol);
    const bass = song.bassSteps[i];
    if (bass) this.note(bass.freq, t, bass.len * stepDur * 0.85, song.bassWave, song.bassVol);
    const drum = song.drums[i % song.drums.length];
    if (drum === 'k') this.kick(t);
    else if (drum === 's') this.noise(t, 0.09, 0.07);
    else if (drum === 'h') this.noise(t, 0.025, 0.025);
  },

  note(freq, t, dur, type, vol) {
    const ctx = Sfx.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t);
    g.gain.setValueAtTime(vol, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.gain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  },

  kick(t) {
    const ctx = Sfx.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    osc.connect(g).connect(this.gain);
    osc.start(t);
    osc.stop(t + 0.16);
  },

  noise(t, dur, vol) {
    const ctx = Sfx.ctx;
    if (!this.noiseBuf) {
      this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    src.buffer = this.noiseBuf;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(g).connect(this.gain);
    src.start(t);
    src.stop(t + dur + 0.02);
  },
};
