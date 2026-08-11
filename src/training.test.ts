import { describe, expect, it } from 'vitest';
import { generateStimulus, recommendKind } from './training';

describe('training engine', () => {
  it('generates identical stimuli from identical seeds', () => {
    const config = { kind: 'seventh' as const, rootPool: 'all' as const, inversions: true, melodic: false };
    expect(generateStimulus(12, config)).toEqual(generateStimulus(12, config));
  });
  it('constrains roots and inversions when configured', () => {
    const stimulus = generateStimulus(99, { kind: 'triad', rootPool: 'white', inversions: false, melodic: false });
    expect([0, 2, 4, 5, 7, 9, 11]).toContain(stimulus.root % 12);
    expect(stimulus.inversion).toBe(0);
  });
  it('recommends an unpracticed or weaker area', () => {
    expect(recommendKind([{ exercise: 'interval-recognition', correct: true }])).toBe('triad');
  });
});
