import { describe, expect, it } from 'vitest';
import { estimatePitch, isPitchCorrect } from './pitchDetection';

describe('microphone pitch detection', () => {
  it('recognizes a concert A sine wave', () => {
    const rate = 48_000;
    const samples = Float32Array.from({ length: 4096 }, (_, index) => Math.sin(2 * Math.PI * 440 * index / rate));
    const result = estimatePitch(samples, rate);
    expect(result?.midi).toBe(69); expect(result?.frequency).toBeCloseTo(440, -1); expect(isPitchCorrect(result, 69, 25)).toBe(true);
  });
  it('does not grade silence or uncertain input as an error', () => {
    const result = estimatePitch(new Float32Array(2048), 48_000);
    expect(result).toBeUndefined(); expect(isPitchCorrect(result, 69, 25)).toBeUndefined();
  });
});
