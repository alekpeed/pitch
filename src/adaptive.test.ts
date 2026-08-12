import { describe, expect, it } from 'vitest';
import {
  adjustDrill, assembleSession, challengeSignal, confusionPressure, DEFAULT_MIX, difficultyEnvelope,
  generalization, generalizationGap, interleave, masteryFor, skillPriority, skillStates, slotCounts,
  rankCatalog, reasonFor, weightedConfusions, type SessionSlot,
} from './adaptive';
import type { Attempt } from './storage';
import type { DrillConfig } from './training';

const DAY = 86_400_000;
const NOW = Date.parse('2026-03-01T00:00:00.000Z');
const at = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString();

const attempt = (overrides: Partial<Attempt> = {}): Attempt => ({
  id: crypto.randomUUID(), sessionId: 's1', timestamp: at(0), exercise: 'triad-recognition',
  stimulus: {}, expected: 'major', response: 'major', correct: true, latencyMs: 1200,
  difficulty: { register: 'middle', timbre: 'piano' }, replayCount: 0, ...overrides,
});
const many = (count: number, overrides: Partial<Attempt> = {}) => Array.from({ length: count }, () => attempt(overrides));

describe('mastery ladder', () => {
  it('keeps the plain synthetic ladder when no context is supplied', () => {
    expect(masteryFor({ attempts: 2, accuracy: 1, medianLatencyMs: 900 })).toBe('Introduced');
    expect(masteryFor({ attempts: 6, accuracy: 1, medianLatencyMs: 900 })).toBe('Developing');
    expect(masteryFor({ attempts: 12, accuracy: .9, medianLatencyMs: 3000 })).toBe('Reliable');
    expect(masteryFor({ attempts: 20, accuracy: .95, medianLatencyMs: 900 })).toBe('Automatic');
  });
  it('withholds Reliable until a delayed retest has been passed', () => {
    const evidence = { attempts: 20, accuracy: .95, medianLatencyMs: 900 };
    expect(masteryFor(evidence, { retentionPassed: false, distinctConditions: 4 })).toBe('Developing');
    expect(masteryFor(evidence, { retentionPassed: true, distinctConditions: 4 })).toBe('Automatic');
  });
  it('withholds Automatic until performance spans varied conditions', () => {
    expect(masteryFor({ attempts: 20, accuracy: .95, medianLatencyMs: 900 }, { distinctConditions: 1 })).toBe('Developing');
  });
  it('reports Transferred only on real-music evidence', () => {
    const evidence = { attempts: 20, accuracy: .95, medianLatencyMs: 900 };
    expect(masteryFor(evidence, { distinctConditions: 4, transferAttempts: 6, transferAccuracy: .85 })).toBe('Transferred');
    expect(masteryFor(evidence, { distinctConditions: 4, transferAttempts: 6, transferAccuracy: .4 })).toBe('Automatic');
  });
});

describe('confusion model', () => {
  const errors = [
    ...many(4, { correct: false, expected: 'major 7', response: 'dominant 7', timestamp: at(1) }),
    ...many(4, { correct: false, expected: 'major 7', response: 'dominant 7', timestamp: at(200) }),
    ...many(12, { expected: 'major 7', response: 'major 7' }),
  ];
  it('preserves labels that contain spaces', () => {
    expect(weightedConfusions(errors, NOW)[0]).toMatchObject({ expected: 'major 7', answered: 'dominant 7' });
  });
  it('decays old errors relative to recent ones', () => {
    const recent = weightedConfusions(many(4, { correct: false, expected: 'a', response: 'b', timestamp: at(1) }), NOW)[0];
    const stale = weightedConfusions(many(4, { correct: false, expected: 'a', response: 'b', timestamp: at(200) }), NOW)[0];
    expect(recent.weightedCount).toBeGreaterThan(stale.weightedCount * 5);
  });
  it('expresses pressure as a rate against exposure, not a raw count', () => {
    const pressure = confusionPressure(weightedConfusions(errors, NOW), 'triad-recognition');
    expect(pressure).toBeGreaterThan(0);
    expect(pressure).toBeLessThanOrEqual(1);
  });
  it('marks a confusion concentrated in recent history as rising', () => {
    const mixed = [
      ...many(1, { correct: false, expected: 'a', response: 'b', timestamp: at(30) }),
      ...many(4, { correct: false, expected: 'a', response: 'b', timestamp: at(1) }),
    ];
    expect(weightedConfusions(mixed, NOW)[0].trend).toBe('rising');
  });
});

describe('difficulty envelope', () => {
  const evidence = [
    ...many(8, { difficulty: { register: 'middle' } }),
    ...many(8, { correct: false, difficulty: { register: 'low' } }),
  ];
  it('reports reliability per condition instead of one collapsed number', () => {
    const envelope = difficultyEnvelope(evidence, 'triad-recognition');
    expect(envelope.reliable).toContain('register=middle');
    expect(envelope.breakdown).toContain('register=low');
  });
  it('withholds a verdict until there is enough evidence', () => {
    const envelope = difficultyEnvelope(many(2, { difficulty: { register: 'middle' } }), 'triad-recognition');
    expect(envelope.reliable).toEqual([]);
    expect(envelope.breakdown).toEqual([]);
  });
  it('keeps difficulty values that contain spaces intact', () => {
    const envelope = difficultyEnvelope(many(8, { difficulty: { range: 'MIDI 40-84' } }), 'triad-recognition');
    expect(envelope.cells[0]).toMatchObject({ dimension: 'range', value: 'MIDI 40-84' });
  });
  it('treats a dimension as generalized only across two reliable values', () => {
    const spread = generalization(difficultyEnvelope(evidence, 'triad-recognition'));
    expect(spread.find(item => item.dimension === 'register')).toMatchObject({ valuesSeen: 2, valuesReliable: 1, generalized: false });
    expect(generalizationGap(spread)).toBe(1);
  });
});

describe('priority scoring', () => {
  const base = { accuracy: .9, evidenceCount: 20, confusionPressure: 0, retentionDue: false, generalizationGap: 0, transferGap: 0, pinned: false, recentRun: 0, automatic: false };
  it('ranks a weak skill above a strong one', () => expect(skillPriority({ ...base, accuracy: .4 })).toBeGreaterThan(skillPriority(base)));
  it('raises priority when retention falls due', () => expect(skillPriority({ ...base, retentionDue: true })).toBeGreaterThan(skillPriority(base)));
  it('raises priority when a skill has not generalized', () => expect(skillPriority({ ...base, generalizationGap: 1 })).toBeGreaterThan(skillPriority(base)));
  it('raises priority when transfer lags synthetic performance', () => expect(skillPriority({ ...base, transferGap: .5 })).toBeGreaterThan(skillPriority(base)));
  it('lets an explicit pin outrank the engine', () => expect(skillPriority({ ...base, pinned: true })).toBeGreaterThan(skillPriority({ ...base, accuracy: 0 })));
  it('backs off an automatic skill and a long identical run', () => {
    expect(skillPriority({ ...base, automatic: true })).toBeLessThan(skillPriority(base));
    expect(skillPriority({ ...base, recentRun: 5 })).toBeLessThan(skillPriority(base));
  });
  it('surfaces an unpracticed skill without pretending it failed', () => {
    expect(skillPriority({ ...base, evidenceCount: 0, accuracy: 0 })).toBeLessThan(skillPriority({ ...base, accuracy: 0 }));
    expect(skillPriority({ ...base, evidenceCount: 0, accuracy: 0 })).toBeGreaterThan(0);
  });
  it('never returns a negative priority', () => expect(skillPriority({ ...base, accuracy: 1, automatic: true, recentRun: 5 })).toBe(0));
});

describe('challenge zone', () => {
  it('holds until there is enough evidence to judge', () => expect(challengeSignal(1, 2)).toBe('hold'));
  it('raises when the user is barely making errors', () => expect(challengeSignal(.95, 20)).toBe('raise'));
  it('lowers when the user is mostly wrong', () => expect(challengeSignal(.4, 20)).toBe('lower'));
  it('holds inside the informative band', () => expect(challengeSignal(.78, 20)).toBe('hold'));
});

describe('difficulty stepping', () => {
  const config: DrillConfig = { kind: 'triad', rootPool: 'white', inversions: false, melodic: true, register: 'middle', timbre: 'piano' };
  it('steps exactly one dimension at a time', () => {
    const raised = adjustDrill(config, 'raise');
    const changed = Object.keys(config).filter(key => raised[key as keyof DrillConfig] !== config[key as keyof DrillConfig]);
    expect(changed).toHaveLength(1);
  });
  it('prefers a dimension the user has not generalized', () => {
    expect(adjustDrill(config, 'raise', ['timbre']).timbre).toBe('rhodes');
  });
  it('is a no-op when holding', () => expect(adjustDrill(config, 'hold')).toEqual(config));
  it('lowers the hardest dimension first', () => {
    const hard: DrillConfig = { ...config, rootPool: 'all', timbre: 'organ' };
    expect(adjustDrill(hard, 'lower').timbre).toBe('rhodes');
  });
  it('stays put at the floor and the ceiling', () => {
    const easiest: DrillConfig = { kind: 'triad', rootPool: 'white', inversions: false, melodic: true, register: 'middle', timbre: 'piano' };
    expect(adjustDrill(easiest, 'lower')).toEqual(easiest);
    const hardest: DrillConfig = { kind: 'triad', rootPool: 'all', inversions: true, melodic: false, register: 'random', timbre: 'organ' };
    expect(adjustDrill(hardest, 'raise')).toEqual(hardest);
  });
});

describe('session assembly', () => {
  const ranked = [{ exercise: 'triad-recognition' }, { exercise: 'seventh-recognition' }, { exercise: 'interval-recognition' }];
  const full = {
    total: 20, ranked,
    dueRetention: [{ exercise: 'bass-recognition', probeId: 'p1' }, { exercise: 'interval-recognition', probeId: 'p2' }],
    growth: { exercise: 'seventh-recognition' },
    production: ['exact-voicing-copy'], transfer: ['transcription'],
  };
  const countBy = (slots: SessionSlot[], purpose: string) => slots.filter(slot => slot.purpose === purpose).length;

  it('apportions the spec mix so the parts sum to the whole', () => {
    const counts = slotCounts(20);
    expect(counts).toEqual({ retention: 4, weakness: 7, growth: 4, production: 3, transfer: 2 });
    expect(Object.values(counts).reduce((a, b) => a + b)).toBe(20);
  });
  it('sums to the requested total at awkward sizes', () => {
    [1, 3, 7, 13, 20, 37].forEach(total => expect(Object.values(slotCounts(total)).reduce((a, b) => a + b)).toBe(total));
  });
  it('builds a session of exactly the requested length', () => expect(assembleSession(full)).toHaveLength(20));
  it('fills every purpose when material exists', () => {
    const slots = assembleSession(full);
    (['retention', 'weakness', 'growth', 'production', 'transfer'] as const).forEach(purpose => expect(countBy(slots, purpose)).toBeGreaterThan(0));
  });
  it('spills unfillable purposes into weakness rather than shortening the session', () => {
    const slots = assembleSession({ total: 20, ranked });
    expect(slots).toHaveLength(20);
    expect(countBy(slots, 'retention')).toBe(0);
    expect(countBy(slots, 'weakness')).toBe(20);
  });
  it('never schedules more retention than is actually due', () => {
    expect(countBy(assembleSession(full), 'retention')).toBe(2);
  });
  it('carries the probe id so the outcome can be recorded', () => {
    expect(assembleSession(full).find(slot => slot.purpose === 'retention')?.probeId).toBeTruthy();
  });
  it('returns nothing when there is no material at all', () => expect(assembleSession({ total: 20, ranked: [] })).toEqual([]));
  it('spreads purposes instead of front-loading them', () => {
    const slots = assembleSession(full);
    const nonWeakness = slots.map((slot, index) => ({ slot, index })).filter(item => item.slot.purpose !== 'weakness');
    // Every non-weakness item landing in the first third would mean no spread.
    expect(Math.max(...nonWeakness.map(item => item.index))).toBeGreaterThan(slots.length / 2);
    const runs = slots.filter((slot, index) => index >= 2 && slot.purpose === slots[index - 1].purpose && slot.purpose === slots[index - 2].purpose);
    expect(runs.filter(slot => slot.purpose !== 'weakness')).toHaveLength(0);
  });
  it('uses the documented default mix', () => expect(DEFAULT_MIX).toEqual({ retention: .2, weakness: .35, growth: .2, production: .15, transfer: .1 }));
});

describe('interleaving', () => {
  it('avoids consecutive repeats of the same exercise', () => {
    const slots = [
      { purpose: 'weakness', exercise: 'a', reason: '' }, { purpose: 'weakness', exercise: 'a', reason: '' },
      { purpose: 'weakness', exercise: 'b', reason: '' }, { purpose: 'weakness', exercise: 'b', reason: '' },
    ] as SessionSlot[];
    const ordered = interleave(slots);
    expect(ordered.filter((slot, index) => index && slot.exercise === ordered[index - 1].exercise)).toHaveLength(0);
  });
  it('keeps every item when repeats are unavoidable', () => {
    const slots = Array.from({ length: 3 }, () => ({ purpose: 'weakness', exercise: 'a', reason: '' })) as SessionSlot[];
    expect(interleave(slots)).toHaveLength(3);
  });
});

describe('skill states', () => {
  const evidence = [
    ...many(10, { exercise: 'triad-recognition', difficulty: { register: 'middle' } }),
    ...many(10, { exercise: 'seventh-recognition', correct: false, expected: 'major 7', response: 'dominant 7', difficulty: { register: 'middle' } }),
  ];
  it('ranks the weaker skill first', () => {
    expect(skillStates({ attempts: evidence, now: NOW })[0].exercise).toBe('seventh-recognition');
  });
  it('separates real-music evidence from synthetic', () => {
    const state = skillStates({
      attempts: [...many(10, { exercise: 'triad-recognition' }), ...many(5, { exercise: 'triad-recognition', correct: false, transferCategory: 'real-music' })],
      now: NOW,
    })[0];
    expect(state.transferAttempts).toBe(5);
    expect(state.transferAccuracy).toBe(0);
  });
  it('treats a pending retention probe as unproven rather than reliable', () => {
    const attempts = many(20, { exercise: 'triad-recognition' });
    const proven = skillStates({ attempts, now: NOW })[0];
    const due = skillStates({ attempts, now: NOW, retentionDue: ['triad-recognition'] })[0];
    expect(due.priority).toBeGreaterThan(proven.priority);
  });
  it('respects an explicit pin over the engine ranking', () => {
    expect(skillStates({ attempts: evidence, now: NOW, pinned: ['triad-recognition'] })[0].exercise).toBe('triad-recognition');
  });
});

describe('catalog ranking', () => {
  const CATALOG = ['triad-recognition', 'seventh-recognition', 'bass-recognition'];
  const practiced = many(10, { exercise: 'triad-recognition' });

  it('ranks every catalog entry, including skills never practiced', () => {
    const ranked = rankCatalog({ catalog: CATALOG, states: skillStates({ attempts: practiced, now: NOW }) });
    expect(ranked.map(item => item.exercise).sort()).toEqual([...CATALOG].sort());
  });
  it('puts an untouched skill ahead of one already going well', () => {
    const ranked = rankCatalog({ catalog: CATALOG, states: skillStates({ attempts: practiced, now: NOW }) });
    expect(ranked[0].exercise).not.toBe('triad-recognition');
    expect(ranked.find(item => item.exercise === 'bass-recognition')?.reason).toBe('Not practiced yet');
  });
  it('lets a due retention probe outrank an untouched skill', () => {
    const ranked = rankCatalog({ catalog: CATALOG, states: skillStates({ attempts: practiced, now: NOW, retentionDue: ['triad-recognition'] }), retentionDue: ['triad-recognition'] });
    expect(ranked[0].exercise).toBe('triad-recognition');
    expect(ranked[0].reason).toBe('Retention probe due');
  });
  it('explains a pin above every other signal', () => {
    const states = skillStates({ attempts: practiced, now: NOW, pinned: ['triad-recognition'] });
    expect(rankCatalog({ catalog: CATALOG, states, pinned: ['triad-recognition'] })[0].reason).toBe('Pinned by you');
  });
  it('names the recurring confusion when one dominates', () => {
    const confused = many(10, { exercise: 'seventh-recognition', correct: false, expected: 'major 7', response: 'dominant 7' });
    const state = skillStates({ attempts: confused, now: NOW })[0];
    expect(reasonFor(state)).toContain('major 7');
  });
  it('names the condition where reliability breaks down', () => {
    // Enough correct exposure that no single confusion pair dominates, leaving the
    // breakdown condition as the strongest remaining signal.
    const mixed = [
      ...many(30, { exercise: 'triad-recognition', difficulty: { register: 'middle' } }),
      ...many(24, { exercise: 'triad-recognition', difficulty: { register: 'high' } }),
      ...many(8, { exercise: 'triad-recognition', correct: false, response: 'minor', difficulty: { register: 'low' } }),
    ];
    expect(reasonFor(skillStates({ attempts: mixed, now: NOW })[0])).toContain('register=low');
  });
  it('prefers a dominant confusion over a breakdown condition', () => {
    const confused = [
      ...many(8, { exercise: 'triad-recognition', difficulty: { register: 'middle' } }),
      ...many(8, { exercise: 'triad-recognition', correct: false, response: 'minor', difficulty: { register: 'low' } }),
    ];
    expect(reasonFor(skillStates({ attempts: confused, now: NOW })[0])).toContain('Recurring');
  });
});

describe('degenerate evidence', () => {
  it('ignores an error whose answer matches the expectation', () => {
    expect(weightedConfusions(many(4, { correct: false, expected: 'major', response: 'major' }), NOW)).toEqual([]);
  });
});
