import { beforeEach, describe, expect, it } from 'vitest';
import { configAtLevel, MAX_DIFFICULTY_LEVEL } from './adaptive';
import {
  currentProbe, diagnosticComplete, diagnosticEstimate, diagnosticProgress, diagnosticStore,
  recordDiagnostic, startDiagnostic, type DiagnosticState,
} from './diagnostic';
import type { ExerciseKind } from './training';

const KINDS: ExerciseKind[] = ['triad', 'seventh', 'interval'];
/** Answers every probe as a user whose true ceiling is `ceiling`. */
const runTo = (ceiling: number, kinds = KINDS, cap = 5) => {
  let state = startDiagnostic(kinds, cap);
  for (let guard = 0; guard < 200 && !diagnosticComplete(state); guard += 1) {
    const probe = currentProbe(state);
    if (!probe) break;
    state = recordDiagnostic(state, probe.level <= ceiling);
  }
  return state;
};

describe('levelled difficulty scale', () => {
  it('is monotone: every level is at least as hard as the one below', () => {
    const hardness = (level: number) => {
      const config = configAtLevel('triad', level);
      return [config.rootPool === 'all', config.inversions, config.vocabulary === 'chromatic', config.presentation === 'arpeggiated',
        config.register !== 'middle', config.timbre !== 'piano', config.rhythm === 'syncopated', config.exposure === 'short',
        config.memoryDelay !== 'none', config.deadline !== 'none', !config.melodic].filter(Boolean).length;
    };
    for (let level = 1; level <= MAX_DIFFICULTY_LEVEL; level += 1) expect(hardness(level)).toBeGreaterThanOrEqual(hardness(level - 1));
  });
  it('clamps outside its range', () => {
    expect(configAtLevel('triad', -5)).toEqual(configAtLevel('triad', 0));
    expect(configAtLevel('triad', 999)).toEqual(configAtLevel('triad', MAX_DIFFICULTY_LEVEL));
  });
});

describe('diagnostic staircase', () => {
  it('starts every skill unfinished and serves a probe', () => {
    const state = startDiagnostic(KINDS);
    expect(diagnosticComplete(state)).toBe(false);
    expect(currentProbe(state)?.exercise).toBe('triad');
  });
  it('interleaves skills rather than exhausting one at a time', () => {
    let state: DiagnosticState = startDiagnostic(KINDS);
    const seen: string[] = [];
    for (let step = 0; step < 3; step += 1) { seen.push(currentProbe(state)!.exercise); state = recordDiagnostic(state, true); }
    expect(new Set(seen).size).toBe(3);
  });
  it('climbs quickly for a strong user instead of walking up one step at a time', () => {
    let state = startDiagnostic(['triad'], 6);
    const levels: number[] = [];
    for (let step = 0; step < 3; step += 1) { levels.push(currentProbe(state)!.level); state = recordDiagnostic(state, true); }
    expect(levels[1]).toBeGreaterThan(levels[0] + 1);
  });
  it('drops into a local probe after an error rather than continuing to climb', () => {
    let state = startDiagnostic(['triad'], 6);
    state = recordDiagnostic(state, true);
    const climbed = currentProbe(state)!.level;
    state = recordDiagnostic(state, false);
    expect(currentProbe(state)!.level).toBeLessThan(climbed);
  });
  it('terminates for every ceiling and brackets it to a single step', () => {
    for (const ceiling of [0, 1, 4, 9, MAX_DIFFICULTY_LEVEL]) {
      const state = runTo(ceiling, ['triad'], 12);
      expect(diagnosticComplete(state)).toBe(true);
      const [estimate] = diagnosticEstimate(state);
      expect(estimate.level).toBeLessThanOrEqual(ceiling);
      expect(estimate.bracketed).toBe(true);
    }
  });
  it('spends fewer items on a skill that brackets early — the "skip known material" case', () => {
    const easy = runTo(0, ['triad'], 12);
    const hard = runTo(9, ['triad'], 12);
    expect(diagnosticEstimate(easy)[0].items).toBeLessThan(diagnosticEstimate(hard)[0].items);
  });
  it('never exceeds its per-skill item cap', () => {
    const state = runTo(7, KINDS, 4);
    diagnosticEstimate(state).forEach(estimate => expect(estimate.items).toBeLessThanOrEqual(4));
  });
  it('reports an envelope per skill, not one placement level', () => {
    const state = runTo(6, KINDS, 12);
    const estimates = diagnosticEstimate(state);
    expect(estimates).toHaveLength(KINDS.length);
    estimates.forEach(estimate => expect(estimate.config.kind).toBe(estimate.exercise));
  });
  it('separates a known ceiling from simply running out of items', () => {
    const capped = runTo(MAX_DIFFICULTY_LEVEL, ['triad'], 2);
    expect(diagnosticEstimate(capped)[0].ceilingKnown).toBe(false);
  });
  it('counts progress as it goes', () => {
    let state = startDiagnostic(KINDS);
    expect(diagnosticProgress(state)).toEqual({ answered: 0, remaining: 3 });
    state = recordDiagnostic(state, true);
    expect(diagnosticProgress(state).answered).toBe(1);
  });
});

describe('diagnostic store', () => {
  beforeEach(() => localStorage.clear());
  it('saves a level per skill and reads it back', () => {
    diagnosticStore.save(diagnosticEstimate(runTo(5, KINDS, 12)), Date.parse('2026-03-01T00:00:00.000Z'));
    const stored = diagnosticStore.latest()!;
    expect(Object.keys(stored.levels).sort()).toEqual([...KINDS].sort());
    expect(stored.completedAt).toBe('2026-03-01T00:00:00.000Z');
  });
  it('returns nothing when no diagnostic has been taken', () => expect(diagnosticStore.latest()).toBeUndefined());
  it('recovers from invalid local data', () => {
    localStorage.setItem('perfect-ear-diagnostic-v1', 'broken');
    expect(diagnosticStore.latest()).toBeUndefined();
  });
});
