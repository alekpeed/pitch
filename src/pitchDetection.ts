export interface PitchEstimate { frequency: number; midi: number; cents: number; confidence: number }

export function estimatePitch(samples: Float32Array, sampleRate: number): PitchEstimate | undefined {
  let energy = 0;
  for (const sample of samples) energy += sample * sample;
  if (Math.sqrt(energy / samples.length) < 0.01) return undefined;
  const minimumLag = Math.floor(sampleRate / 1000);
  const maximumLag = Math.min(Math.floor(sampleRate / 65), samples.length - 1);
  let bestLag = 0; let bestCorrelation = 0;
  for (let lag = minimumLag; lag <= maximumLag; lag += 1) {
    let correlation = 0; let normalization = 0;
    for (let index = 0; index < samples.length - lag; index += 1) {
      correlation += samples[index] * samples[index + lag];
      normalization += samples[index] ** 2 + samples[index + lag] ** 2;
    }
    const normalized = normalization ? 2 * correlation / normalization : 0;
    if (normalized > bestCorrelation) { bestCorrelation = normalized; bestLag = lag; }
  }
  if (!bestLag || bestCorrelation < 0.65) return undefined;
  const frequency = sampleRate / bestLag;
  const exactMidi = 69 + 12 * Math.log2(frequency / 440); const midi = Math.round(exactMidi);
  return { frequency, midi, cents: Math.round((exactMidi - midi) * 100), confidence: bestCorrelation };
}

export function isPitchCorrect(estimate: PitchEstimate | undefined, targetMidi: number, toleranceCents: number) {
  if (!estimate || estimate.confidence < 0.75) return undefined;
  return Math.abs((estimate.midi - targetMidi) * 100 + estimate.cents) <= toleranceCents;
}
