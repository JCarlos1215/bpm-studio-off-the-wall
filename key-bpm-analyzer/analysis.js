const SAMPLE_RATE = 11025;
const ENVELOPE_RATE = 100;
const FFT_SIZE = 8192;
const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const CAMELOT_MAJOR = [8, 3, 10, 5, 12, 7, 2, 9, 4, 11, 6, 1];
const CAMELOT_MINOR = [5, 12, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10];

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function downsample(buffer) {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
  const length = Math.floor(buffer.length * SAMPLE_RATE / buffer.sampleRate);
  const mono = new Float32Array(length);
  const ratio = buffer.sampleRate / SAMPLE_RATE;
  for (let i = 0; i < length; i += 1) {
    const sourceIndex = Math.min(buffer.length - 1, Math.round(i * ratio));
    let sample = 0;
    for (const channel of channels) sample += channel[sourceIndex];
    mono[i] = sample / channels.length;
  }
  return mono;
}

function getEnvelope(samples) {
  const blockSize = Math.max(1, Math.round(SAMPLE_RATE / ENVELOPE_RATE));
  const rms = new Float32Array(Math.ceil(samples.length / blockSize));
  for (let frame = 0; frame < rms.length; frame += 1) {
    const start = frame * blockSize;
    const end = Math.min(samples.length, start + blockSize);
    let sum = 0;
    for (let i = start; i < end; i += 1) sum += samples[i] * samples[i];
    rms[frame] = Math.sqrt(sum / (end - start));
  }

  const onset = new Float32Array(rms.length);
  for (let i = 2; i < rms.length; i += 1) {
    const baseline = (rms[i - 1] + rms[i - 2]) / 2;
    onset[i] = Math.max(0, rms[i] - baseline);
  }
  const onsetMean = mean(onset);
  for (let i = 0; i < onset.length; i += 1) onset[i] = Math.max(0, onset[i] - onsetMean * 0.5);
  return { rms, onset };
}

function estimateTempo(onset) {
  if (onset.length < ENVELOPE_RATE * 5) return { bpm: 0, confidence: 'baja' };
  const candidates = [];
  for (let bpm = 60; bpm <= 180; bpm += 1) {
    const lag = Math.round(ENVELOPE_RATE * 60 / bpm);
    let score = 0;
    let norm = 0;
    for (let i = lag; i < onset.length; i += 1) {
      score += onset[i] * onset[i - lag];
      norm += onset[i] * onset[i];
    }
    candidates.push({ bpm, score: score / (norm + 1e-12) });
  }
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  const runnerUp = candidates.find(item => Math.abs(item.bpm - best.bpm) > 3);
  const bpm = best.bpm > 125 && best.score < 0.35 ? Math.round(best.bpm / 2) : best.bpm;
  const ratio = runnerUp?.score ? best.score / runnerUp.score : 1;
  return { bpm, confidence: best.score < 0.08 ? 'baja' : ratio > 1.18 ? 'alta' : 'media' };
}

function fft(real, imag) {
  const length = real.length;
  for (let i = 1, j = 0; i < length; i += 1) {
    let bit = length >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
  }
  for (let size = 2; size <= length; size <<= 1) {
    const angle = -2 * Math.PI / size;
    const stepReal = Math.cos(angle);
    const stepImag = Math.sin(angle);
    for (let start = 0; start < length; start += size) {
      let weightReal = 1;
      let weightImag = 0;
      const half = size >> 1;
      for (let offset = 0; offset < half; offset += 1) {
        const even = start + offset;
        const odd = even + half;
        const oddReal = real[odd] * weightReal - imag[odd] * weightImag;
        const oddImag = real[odd] * weightImag + imag[odd] * weightReal;
        real[odd] = real[even] - oddReal;
        imag[odd] = imag[even] - oddImag;
        real[even] += oddReal;
        imag[even] += oddImag;
        const nextReal = weightReal * stepReal - weightImag * stepImag;
        weightImag = weightReal * stepImag + weightImag * stepReal;
        weightReal = nextReal;
      }
    }
  }
}

function correlate(left, right) {
  const leftMean = mean(left);
  const rightMean = mean(right);
  let numerator = 0;
  let leftPower = 0;
  let rightPower = 0;
  for (let i = 0; i < left.length; i += 1) {
    const a = left[i] - leftMean;
    const b = right[i] - rightMean;
    numerator += a * b;
    leftPower += a * a;
    rightPower += b * b;
  }
  return numerator / Math.sqrt((leftPower * rightPower) || 1);
}

function estimateKey(samples, onProgress) {
  const chroma = new Float64Array(12);
  const frameCount = Math.max(1, Math.floor((samples.length - FFT_SIZE) / (SAMPLE_RATE / 2)) + 1);
  const sampleCount = Math.min(frameCount, 90);
  const stride = Math.max(1, Math.floor((frameCount - 1) / Math.max(1, sampleCount - 1)));
  const real = new Float64Array(FFT_SIZE);
  const imag = new Float64Array(FFT_SIZE);

  for (let frame = 0; frame < sampleCount; frame += 1) {
    const frameIndex = frame * stride;
    const start = Math.min(Math.max(0, samples.length - FFT_SIZE), Math.floor(frameIndex * SAMPLE_RATE / 2));
    for (let i = 0; i < FFT_SIZE; i += 1) {
      const window = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (FFT_SIZE - 1));
      real[i] = (samples[start + i] || 0) * window;
      imag[i] = 0;
    }
    fft(real, imag);
    for (let bin = 4; bin < FFT_SIZE / 2; bin += 1) {
      const hz = bin * SAMPLE_RATE / FFT_SIZE;
      if (hz < 55 || hz > 5000) continue;
      const magnitude = Math.hypot(real[bin], imag[bin]);
      const midi = Math.round(69 + 12 * Math.log2(hz / 440));
      chroma[((midi % 12) + 12) % 12] += magnitude / Math.sqrt(hz);
    }
    onProgress?.(Math.round((frame + 1) / sampleCount * 70));
  }

  const scores = [];
  for (let root = 0; root < 12; root += 1) {
    const major = MAJOR_PROFILE.map((_, i) => MAJOR_PROFILE[(i - root + 12) % 12]);
    const minor = MINOR_PROFILE.map((_, i) => MINOR_PROFILE[(i - root + 12) % 12]);
    scores.push({ root, mode: 'mayor', score: correlate(chroma, major), camelot: `${CAMELOT_MAJOR[root]}B` });
    scores.push({ root, mode: 'menor', score: correlate(chroma, minor), camelot: `${CAMELOT_MINOR[root]}A` });
  }
  scores.sort((a, b) => b.score - a.score);
  return { ...scores[0], name: NOTE_NAMES[scores[0].root] };
}

function smooth(values, radius) {
  const output = new Float32Array(values.length);
  for (let i = 0; i < values.length; i += 1) {
    let total = 0;
    let count = 0;
    for (let j = Math.max(0, i - radius); j <= Math.min(values.length - 1, i + radius); j += 1) {
      total += values[j];
      count += 1;
    }
    output[i] = total / count;
  }
  return output;
}

function suggestCues(rms, duration) {
  if (duration < 12) return [];
  const smoothed = smooth(rms, Math.max(1, Math.round(ENVELOPE_RATE * 2)));
  const cues = [{ label: 'A', title: 'Inicio', time: 0, detail: 'Punto de referencia para el comienzo de la pista.', color: '#65b6ff' }];
  const start = Math.min(smoothed.length - 1, ENVELOPE_RATE * 8);
  const end = Math.max(start + 1, smoothed.length - ENVELOPE_RATE * 8);
  let peakIndex = start;
  for (let i = start + 1; i < end; i += 1) {
    if (smoothed[i] > smoothed[peakIndex]) peakIndex = i;
  }
  if (peakIndex > 0 && peakIndex / ENVELOPE_RATE < duration - 5) {
    cues.push({ label: 'B', title: 'Sección de mayor energía', time: peakIndex / ENVELOPE_RATE, detail: 'Pico de intensidad estimado; revisa si coincide con el drop.', color: '#ff8054' });
  }

  const middleStart = Math.floor(smoothed.length * 0.2);
  const middleEnd = Math.floor(smoothed.length * 0.8);
  const block = ENVELOPE_RATE * 8;
  let lowIndex = -1;
  let lowEnergy = Infinity;
  for (let i = middleStart; i < middleEnd; i += Math.max(1, block / 2)) {
    let total = 0;
    let count = 0;
    for (let j = i; j < Math.min(middleEnd, i + block); j += 1) {
      total += smoothed[j];
      count += 1;
    }
    if (count && total / count < lowEnergy) {
      lowEnergy = total / count;
      lowIndex = i;
    }
  }
  if (lowIndex > 0 && cues.every(cue => Math.abs(cue.time - lowIndex / ENVELOPE_RATE) > 8)) {
    cues.push({ label: 'C', title: 'Posible breakdown', time: lowIndex / ENVELOPE_RATE, detail: 'Tramo de menor energía dentro de la sección central.', color: '#c49aff' });
  }

  const outro = Math.max(0, duration - 16);
  if (cues.every(cue => Math.abs(cue.time - outro) > 5)) {
    cues.push({ label: 'D', title: 'Referencia de salida', time: outro, detail: 'Referencia aproximada 16 segundos antes del final.', color: '#9de1b0' });
  }
  return cues
    .sort((a, b) => a.time - b.time)
    .map((cue, index) => ({ ...cue, label: String.fromCharCode(65 + index) }));
}

export function formatTime(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function analyzeAudioBuffer(buffer, onProgress) {
  if (!buffer || !Number.isFinite(buffer.duration) || buffer.duration <= 0) {
    throw new Error('el audio está vacío o no es válido.');
  }
  const samples = downsample(buffer);
  onProgress?.(5);
  const { rms, onset } = getEnvelope(samples);
  const tempo = estimateTempo(onset);
  const key = estimateKey(samples, onProgress);
  onProgress?.(90);
  const averageEnergy = Math.sqrt(mean(Array.from(rms, value => value * value)));
  const energy = Math.max(0, Math.min(100, Math.round(100 * Math.sqrt(averageEnergy / 0.22))));
  const cues = suggestCues(rms, buffer.duration);
  onProgress?.(100);

  return {
    key: key.name,
    mode: key.mode,
    camelot: key.camelot,
    bpm: tempo.bpm,
    bpmConfidence: tempo.confidence,
    energy,
    cues,
  };
}
