import { describe, expect, it } from 'vitest';
import { skillStates, type SkillState } from './adaptive';
import { ALL_EXERCISES } from './curriculum';
import { CLEAR_FRACTION, currentSection, SECTIONS, sectionOf, sectionProgress, unlockedExercises } from './sections';
import type { Attempt } from './storage';

const NOW = Date.parse('2026-03-01T00:00:00.000Z');
const attempt = (exercise: string, overrides: Partial<Attempt> = {}): Attempt => ({
  id: crypto.randomUUID(), sessionId: 's1', timestamp: new Date(NOW).toISOString(), exercise,
  stimulus: {}, expected: 'major', response: 'major', correct: true, latencyMs: 1200,
  difficulty: { register: 'middle', timbre: 'piano' }, replayCount: 0, ...overrides,
});

/** Enough correct evidence, across two conditions, to reach Reliable. */
const reliable = (exercise: string) => [
  ...Array.from({ length: 8 }, () => attempt(exercise, { difficulty: { register: 'middle' } })),
  ...Array.from({ length: 8 }, () => attempt(exercise, { difficulty: { register: 'high' } })),
];
const statesFor = (attempts: Attempt[]): SkillState[] => skillStates({ attempts, now: NOW });
/** Clears a whole section by name, so tests read as "having finished section N". */
const clearSection = (index: number) => SECTIONS[index].exercises.flatMap(reliable);

describe('section spine', () => {
  it('covers every schedulable exercise exactly once', () => {
    const listed = SECTIONS.flatMap(section => section.exercises);
    expect([...listed].sort()).toEqual([...ALL_EXERCISES].sort());
    expect(new Set(listed).size).toBe(listed.length);
  });
  it('places an exercise in the section that owns it', () => {
    expect(sectionOf('interval-recognition')?.id).toBe('foundations');
    expect(sectionOf('transcription')?.id).toBe('transfer');
    expect(sectionOf('not-an-exercise')).toBeUndefined();
  });
});

describe('gating', () => {
  it('opens only the first section to someone with no history', () => {
    const progress = sectionProgress([]);
    expect(progress.filter(status => status.unlocked).map(status => status.section.id)).toEqual(['foundations']);
    expect(progress.every(status => !status.cleared)).toBe(true);
    expect(currentSection([]).section.id).toBe('foundations');
  });
  it('schedules nothing beyond the opening section until it is cleared', () => {
    expect(unlockedExercises([])).toEqual([...SECTIONS[0].exercises]);
  });
  it('unlocks the next section once the current one clears', () => {
    const states = statesFor(clearSection(0));
    const progress = sectionProgress(states);
    expect(progress[0].cleared).toBe(true);
    expect(progress[1].unlocked).toBe(true);
    expect(progress[2].unlocked).toBe(false);
    expect(currentSection(states).section.id).toBe(SECTIONS[1].id);
  });
  it('keeps cleared material schedulable rather than retiring it', () => {
    const unlocked = unlockedExercises(statesFor(clearSection(0)));
    expect(unlocked).toEqual(expect.arrayContaining([...SECTIONS[0].exercises]));
    expect(unlocked).toEqual(expect.arrayContaining([...SECTIONS[1].exercises]));
  });
  it('never opens a later section while an earlier one is open', () => {
    const progress = sectionProgress(statesFor(clearSection(0)));
    expect(progress.filter(status => status.current)).toHaveLength(1);
    // Unlocked sections are a prefix: no gaps, no skipping ahead.
    const unlocked = progress.map(status => status.unlocked);
    expect(unlocked.indexOf(false) === -1 || !unlocked.slice(unlocked.indexOf(false)).includes(true)).toBe(true);
  });
  it('clears on most of a section so one stubborn drill cannot wall off the app', () => {
    const section = SECTIONS.find(item => item.exercises.length >= 4)!;
    const enough = Math.ceil(section.exercises.length * CLEAR_FRACTION);
    const index = SECTIONS.indexOf(section);
    // Everything before it has to be cleared first for the gate to be reachable.
    const earlier = SECTIONS.slice(0, index).flatMap((_, at) => clearSection(at));
    const states = statesFor([...earlier, ...section.exercises.slice(0, enough).flatMap(reliable)]);
    expect(sectionProgress(states)[index].cleared).toBe(true);
  });
  it('reports a partial score rather than only a pass or fail', () => {
    const section = SECTIONS[1];
    const states = statesFor([...clearSection(0), ...reliable(section.exercises[0])]);
    const status = sectionProgress(states)[1];
    expect(status.score).toBeCloseTo(1 / section.exercises.length);
    expect(status.met).toEqual([section.exercises[0]]);
    expect(status.outstanding).toEqual([...section.exercises.slice(1)]);
  });
  it('holds at the last section once the whole spine is cleared', () => {
    const states = statesFor(SECTIONS.flatMap((_, index) => clearSection(index)));
    expect(sectionProgress(states).every(status => status.cleared)).toBe(true);
    expect(currentSection(states).section.id).toBe(SECTIONS.at(-1)!.id);
    expect(unlockedExercises(states)).toEqual(expect.arrayContaining([...ALL_EXERCISES]));
  });
});
