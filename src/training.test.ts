import { describe, expect, it } from 'vitest';
import { generateStimulus, recommendKind, type DrillConfig } from './training';
import { respectsLowIntervalLimit } from './theory';
const config = (overrides: Partial<DrillConfig> = {}): DrillConfig => ({ kind: 'seventh', rootPool: 'all', inversions: true, melodic: false, register: 'middle', timbre: 'piano', ...overrides });

describe('training engine', () => {
  it('generates identical stimuli from identical seeds', () => expect(generateStimulus(12, config())).toEqual(generateStimulus(12, config())));
  it('constrains roots, registers, and inversions', () => {
    const stimulus = generateStimulus(99, config({ kind: 'triad', rootPool: 'white', inversions: false, register: 'high' }));
    expect([0, 2, 4, 5, 7, 9, 11]).toContain(stimulus.root % 12); expect(stimulus.root).toBeGreaterThanOrEqual(60); expect(stimulus.inversion).toBe(0);
  });
  it('establishes tonic before a scale-degree target', () => expect(generateStimulus(5, config({ kind: 'scale-degree' })).contextNotes).toHaveLength(3));
  it('makes the requested chord member the sounding bass', () => {
    for (let seed = 0; seed < 10; seed += 1) { const stimulus = generateStimulus(seed, config({ kind: 'bass' })); expect(stimulus.inversion).toBe(['root in bass', 'third in bass', 'fifth in bass'].indexOf(stimulus.answer)); }
  });
  it('recommends an unpracticed or weaker area', () => expect(recommendKind([{ exercise: 'scale-degree-recognition', correct: true }])).toBe('interval'));
  it('never sounds a simultaneous stimulus below the low-interval limit', () => {
    for (const kind of ['triad', 'seventh', 'bass'] as const)
      for (const register of ['low', 'middle', 'high'] as const)
        for (let seed = 0; seed < 40; seed += 1) {
          const stimulus = generateStimulus(seed, config({ kind, register }));
          expect(respectsLowIntervalLimit(stimulus.notes)).toBe(true);
        }
  });
  it('keeps the reported root in step with the notes it lifted', () => {
    for (let seed = 0; seed < 40; seed += 1) {
      const stimulus = generateStimulus(seed, config({ kind: 'triad', register: 'low', inversions: false }));
      expect(stimulus.notes[0]).toBe(stimulus.root);
    }
  });
});
