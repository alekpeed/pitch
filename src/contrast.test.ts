import { describe, expect, it } from 'vitest';
import { weightedConfusions } from './adaptive';
import { buildComparison, contrastCandidates, contrastConfig } from './contrast';
import type { Attempt } from './storage';
import { answersFor, generateStimulus, type DrillConfig } from './training';

const NOW = Date.parse('2026-03-01T00:00:00.000Z');
const base: DrillConfig = { kind: 'seventh', rootPool: 'all', inversions: false, melodic: false, register: 'middle', timbre: 'piano' };
const attempt = (overrides: Partial<Attempt> = {}): Attempt => ({
  id: crypto.randomUUID(), sessionId: 's1', timestamp: new Date(NOW).toISOString(), exercise: 'seventh-recognition',
  stimulus: {}, expected: 'major 7', response: 'major 7', correct: true, latencyMs: 1200,
  difficulty: { register: 'middle' }, replayCount: 0, ...overrides,
});
const many = (count: number, overrides: Partial<Attempt> = {}) => Array.from({ length: count }, () => attempt(overrides));

describe('contrast candidates', () => {
  const confused = [...many(6), ...many(6, { correct: false, response: 'dominant 7' })];
  it('promotes a confusion that recurs above threshold', () => {
    const [pair] = contrastCandidates(weightedConfusions(confused, NOW));
    expect(pair).toMatchObject({ kind: 'seventh', a: 'major 7', b: 'dominant 7' });
  });
  it('ignores a confusion that is only occasional', () => {
    const rare = [...many(40), ...many(1, { correct: false, response: 'dominant 7' })];
    expect(contrastCandidates(weightedConfusions(rare, NOW))).toEqual([]);
  });
  it('ranks the most pressing confusion first', () => {
    const mixed = [
      ...many(10), ...many(8, { correct: false, response: 'dominant 7' }),
      ...many(10, { expected: 'minor 7', response: 'minor 7' }), ...many(3, { expected: 'minor 7', correct: false, response: 'half-diminished 7' }),
    ];
    expect(contrastCandidates(weightedConfusions(mixed, NOW))[0].a).toBe('major 7');
  });
  it('narrows the drill to exactly the two confused labels', () => {
    const [pair] = contrastCandidates(weightedConfusions(confused, NOW));
    const config = contrastConfig(base, pair);
    expect(answersFor(config)).toEqual(['major 7', 'dominant 7']);
  });
  it('only ever generates one of the two labels under contrast', () => {
    const [pair] = contrastCandidates(weightedConfusions(confused, NOW));
    const config = contrastConfig(base, pair);
    const answers = new Set(Array.from({ length: 40 }, (_, seed) => generateStimulus(seed, config).answer));
    expect([...answers].every(answer => answer === 'major 7' || answer === 'dominant 7')).toBe(true);
    expect(answers.size).toBe(2);
  });
});

describe('error replay comparison', () => {
  it('puts both readings on the same root so only the confusion differs', () => {
    const comparison = buildComparison(7, base, 'major 7', 'dominant 7')!;
    expect(comparison.heard.root).toBe(comparison.alternative.root);
    expect(comparison.heard.answer).toBe('major 7');
    expect(comparison.alternative.answer).toBe('dominant 7');
  });
  it('isolates the tones that actually separate the two answers', () => {
    const comparison = buildComparison(7, base, 'major 7', 'dominant 7')!;
    // maj7 and dom7 differ by one note: the seventh.
    expect(comparison.differing).toHaveLength(2);
    expect(comparison.shared.length).toBeGreaterThan(1);
    expect(comparison.differing.every(note => !comparison.shared.includes(note))).toBe(true);
  });
  it('returns nothing when the answer was right', () => {
    expect(buildComparison(7, base, 'major 7', 'major 7')).toBeUndefined();
  });
  it('works for triads as well as sevenths', () => {
    const comparison = buildComparison(3, { ...base, kind: 'triad' }, 'major', 'minor')!;
    expect(comparison.differing.length).toBeGreaterThan(0);
    expect(comparison.heard.root).toBe(comparison.alternative.root);
  });
});
