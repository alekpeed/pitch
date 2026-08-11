import { describe, expect, it } from 'vitest';
import { confusionPairs, summarizeSkills } from './analytics';
import type { Attempt } from './storage';
const attempt = (correct: boolean, expected = 'major', response = expected): Attempt => ({ id: crypto.randomUUID(), timestamp: '2026-01-01', exercise: 'triad-recognition', stimulus: {}, expected, response, correct, latencyMs: 1200, difficulty: {}, replayCount: 0 });
describe('progress analytics', () => {
  it('derives traceable skill summaries', () => expect(summarizeSkills([attempt(true), attempt(true), attempt(false, 'major', 'minor'), attempt(true)])[0]).toMatchObject({ attempts: 4, accuracy: .75, mastery: 'Developing' }));
  it('counts directional confusions', () => expect(confusionPairs([attempt(false, 'major', 'minor'), attempt(false, 'major', 'minor')])[0]).toEqual({ pair: 'major → minor', count: 2 }));
});
