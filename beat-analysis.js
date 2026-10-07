// Shared 100 Hz onset estimator for microphone and decoded audio.
export function estimateBeat(onset, rate = 100, expectedBpm = null) {
  if (onset.length < rate * 6) return null;
  const baseline = Array.from(onset).reduce((s,v)=>s+v,0) / onset.length;
  const clean = Array.from(onset, v => Math.max(0,v-baseline));
  const x = Array.from(clean, (_, i) => ((clean[i - 1] || 0) + 2 * clean[i] + (clean[i + 1] || 0)) / 4);
  if (x.reduce((sum, v) => sum + v * v, 0) < 1e-8) return null;
  const minLag = Math.floor(rate * 60 / 200);
  const maxLag = Math.ceil(rate * 60 / 60);
  const corr = [];
  for (let lag = minLag - 1; lag <= maxLag + 1; lag++) {
    let dot = 0, a = 0, b = 0;
    for (let i = lag; i < x.length; i++) {
      dot += x[i] * x[i - lag]; a += x[i] ** 2; b += x[i - lag] ** 2;
    }
    corr[lag] = dot / Math.sqrt(a * b || 1);
  }
  const candidates = [];
  for (let lag = minLag; lag <= maxLag; lag++) {
    if (corr[lag] >= corr[lag - 1] && corr[lag] >= corr[lag + 1]) candidates.push({lag, score: corr[lag]});
  }
  candidates.sort((a, b) => b.score - a.score);
  let best = candidates[0];
  if (!best || best.score < .28) return null;
  // Repeated beats also correlate at two or three times the actual period.
  const fundamental = candidates.filter(c => c.lag < best.lag * .7 && c.score >= best.score * .82 && Math.abs(best.lag / c.lag - Math.round(best.lag / c.lag)) < .08);
  if (fundamental.length) best = fundamental.sort((a, b) => a.lag - b.lag)[0];
  let contextual = false;
  if (expectedBpm) {
    const expectedLag = rate * 60 / expectedBpm;
    const nearby = candidates.find(c => Math.abs(c.lag - expectedLag) < 1.5 && c.score >= best.score * .75);
    if (nearby && Math.abs(rate * 60 / best.lag - expectedBpm) > 3) {
      best = nearby;
      contextual = true;
    }
  }
  const l = best.lag, denominator = corr[l - 1] - 2 * corr[l] + corr[l + 1];
  const offset = denominator ? Math.max(-.5, Math.min(.5, .5 * (corr[l - 1] - corr[l + 1]) / denominator)) : 0;
  const bpm = rate * 60 / (l + offset);
  if (bpm < 60 || bpm > 200) return null;
  const rival = candidates.find(c => Math.abs(c.lag - l) > 3 && Math.abs(c.lag / l - Math.round(c.lag / l)) > .08 && Math.abs(l / c.lag - Math.round(l / c.lag)) > .08);
  const separation = rival ? Math.max(0, 1 - rival.score / best.score) : 1;
  return {bpm, contextual, confidence: Math.round(100 * best.score * (.7 + .3 * separation))};
}
