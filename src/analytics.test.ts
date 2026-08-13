import { describe, expect, it } from 'vitest';
import { calibration, capabilityMilestones, confusionPairs, summarizeSession, summarizeSkills } from './analytics';
import type { Attempt } from './storage';
const attempt = (correct: boolean, expected = 'major', response = expected, overrides: Partial<Attempt> = {}): Attempt => ({ id: crypto.randomUUID(), sessionId: 'session-1', timestamp: '2026-01-01', exercise: 'triad-recognition', stimulus: {}, expected, response, correct, latencyMs: 1200, difficulty: { register: 'middle' }, replayCount: 0, ...overrides });
describe('progress analytics', () => {
  it('derives traceable skill summaries', () => expect(summarizeSkills([attempt(true), attempt(true), attempt(false, 'major', 'minor'), attempt(true)])[0]).toMatchObject({ attempts: 4, accuracy: .75, mastery: 'Developing', comparisonEvidence: 4 }));
  it('compares only attempts under compatible conditions', () => expect(summarizeSkills([attempt(true), attempt(false), attempt(true, 'major', 'major', { difficulty: { register: 'high' } })])[0].comparisonEvidence).toBe(1));
  it('counts directional confusions', () => expect(confusionPairs([attempt(false, 'major', 'minor'), attempt(false, 'major', 'minor')])[0]).toEqual({ pair: 'major → minor', count: 2 }));
  it('creates automatic session summaries', () => expect(summarizeSession([attempt(true), attempt(false)], 'session-1')).toMatchObject({ attempts: 2, correct: 1, accuracy: .5, focus: ['triad-recognition'] }));
  it('derives capability milestones from evidence', () => expect(capabilityMilestones(Array.from({ length: 12 }, () => attempt(true)))[0]).toMatchObject({ label: 'Reliable', evidenceCount: 12 }));
  it('reports accuracy at each confidence level and ignores unreported attempts', () => {
    const bands = calibration([
      attempt(true, 'major', 'major', { confidence: 'sure' }),
      attempt(true, 'major', 'major', { confidence: 'sure' }),
      attempt(false, 'major', 'minor', { confidence: 'guess' }),
      attempt(true),
    ]);
    expect(bands).toEqual([
      { confidence: 'guess', attempts: 1, accuracy: 0 },
      { confidence: 'sure', attempts: 2, accuracy: 1 },
    ]);
  });
  it('reports nothing when confidence was never asked for', () => expect(calibration([attempt(true)])).toEqual([]));
});
