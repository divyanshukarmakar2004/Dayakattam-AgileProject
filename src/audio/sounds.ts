/**
 * All sound effects are synthesised at runtime with the Web Audio API --
 * no external audio files, so nothing here can raise licensing questions.
 */
class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;

  private ensure(): AudioContext {
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new Ctor();
    }
    return this.ctx;
  }

  private tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.15, delay = 0) {
    if (this.muted) return;
    const c = this.ensure();
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private noiseClick(dur = 0.06, vol = 0.12, delay = 0) {
    if (this.muted) return;
    const c = this.ensure();
    const t0 = c.currentTime + delay;
    const bufferSize = Math.floor(c.sampleRate * dur);
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
    }
    const src = c.createBufferSource();
    src.buffer = buffer;
    const gain = c.createGain();
    gain.gain.setValueAtTime(vol, t0);
    src.connect(gain);
    gain.connect(c.destination);
    src.start(t0);
  }

  setMuted(v: boolean) { this.muted = v; }

  diceThrow() { for (let i = 0; i < 4; i++) this.noiseClick(0.05, 0.1, i * 0.12); }
  diceSettle() { this.tone(520, 0.15, 'triangle', 0.12); }
  move() { this.tone(300, 0.08, 'square', 0.05); }
  capture() { this.tone(180, 0.25, 'sawtooth', 0.15); this.tone(120, 0.3, 'sawtooth', 0.12, 0.08); }
  safe() { this.tone(660, 0.12, 'sine', 0.08); }
  home() { this.tone(700, 0.1, 'sine', 0.1); this.tone(880, 0.16, 'sine', 0.1, 0.1); }
  special() { this.tone(500, 0.1, 'triangle', 0.1); this.tone(750, 0.14, 'triangle', 0.1, 0.09); }
  victory() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.12, i * 0.13)); }
  defeat() { [400, 340, 280].forEach((f, i) => this.tone(f, 0.4, 'sawtooth', 0.1, i * 0.18)); }
}

export const Audio2 = new SoundEngine();
