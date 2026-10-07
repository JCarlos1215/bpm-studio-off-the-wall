import { fft } from './fft.js?v=tempo-20261007-3';

// Positive spectral change distinguishes drum attacks from sustained bass notes.
export class SpectralOnset {
  constructor(sampleRate = 11025, onValue = null) {
    this.sampleRate = sampleRate;
    this.onValue = onValue;
    this.values = [];
    this.ring = new Float32Array(1024);
    this.real = new Float64Array(1024);
    this.imag = new Float64Array(1024);
    this.previous = new Float64Array(512);
    this.window = Float64Array.from({length:1024}, (_, i) => .5 - .5 * Math.cos(2 * Math.PI * i / 1023));
    this.position = 0;
    this.count = 0;
    this.frame = 1;
  }
  push(sample) {
    this.ring[this.position] = sample;
    this.position = (this.position + 1) % 1024;
    this.count++;
    if (this.count < Math.round(this.frame * this.sampleRate / 100)) return;
    this.frame++;
    for (let i = 0; i < 1024; i++) {
      this.real[i] = this.ring[(this.position + i) % 1024] * this.window[i];
      this.imag[i] = 0;
    }
    fft(this.real, this.imag);
    let flux = 0;
    for (let bin = 3; bin < 465; bin++) {
      const value = Math.log1p(20 * Math.hypot(this.real[bin], this.imag[bin]) / 512);
      flux += Math.max(0, value - this.previous[bin]);
      this.previous[bin] = value;
    }
    const value = flux / 462;
    if (this.onValue) this.onValue(value);
    else this.values.push(value);
  }
}
