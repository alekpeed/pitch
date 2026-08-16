import { describe, expect, it } from 'vitest';
import { skillStates, type SkillState } from './adaptive';
import { ALL_EXERCISES } from './curriculum';
import { placementDay } from './path';
import { CLEAR_FRACTION, currentSection, PROVISIONAL_LEVEL, SECTIONS, sectionOf, sectionProgress, unlockedExercises } from './sections';
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
  it('starts below named intervals, which already assume too much', () => {
    // Naming an interval means holding two pitches and measuring between them.
    // The opening section only asks whether the second note moved, and which way.
    expect(SECTIONS[0].exercises).toEqual(['direction-recognition', 'motion-recognition', 'distance-recognition']);
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
    expect(progress.filter(status => status.unlocked).map(status => status.section.id)).toEqual([SECTIONS[0].id]);
    expect(progress.every(status => !status.cleared)).toBe(true);
    expect(currentSection([]).section.id).toBe(SECTIONS[0].id);
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

describe('diagnostic placement', () => {
  /** A diagnostic that demonstrated every drill in the given sections. */
  const diagnosed = (...indexes: number[]) => Object.fromEntries(
    indexes.flatMap(index => SECTIONS[index].exercises).map(exercise => [exercise.replace(/-recognition$/, ''), PROVISIONAL_LEVEL]),
  );

  it('changes nothing without a diagnostic', () => {
    expect(sectionProgress([]).some(status => status.cleared)).toBe(false);
    expect(placementDay([])).toBe(1);
  });
  it('clears a section the diagnostic demonstrated, and marks it as placed', () => {
    const progress = sectionProgress([], diagnosed(0));
    expect(progress[0]).toMatchObject({ cleared: true, provisional: true });
    expect(progress[0].assumed).toEqual([...SECTIONS[0].exercises]);
    expect(progress[1].unlocked).toBe(true);
  });
  it('skips the learner past what they already have', () => {
    expect(placementDay([], diagnosed(0, 1, 2))).toBeGreaterThan(placementDay([], diagnosed(0)));
    expect(placementDay([], diagnosed(0))).toBeGreaterThan(1);
  });
  it('will not skip a gap it has no evidence for', () => {
    // Demonstrating a later section while an earlier one is untested must not
    // start the learner past the hole; the ladder is a sequence.
    expect(placementDay([], diagnosed(2))).toBe(1);
  });
  it('does not count a level below the demonstrated bar', () => {
    const weak = Object.fromEntries(SECTIONS[0].exercises.map(exercise => [exercise.replace(/-recognition$/, ''), PROVISIONAL_LEVEL - 1]));
    expect(sectionProgress([], weak)[0].cleared).toBe(false);
  });
  it('never marks a genuinely earned section as provisional', () => {
    const progress = sectionProgress(statesFor(clearSection(0)), diagnosed(0));
    expect(progress[0]).toMatchObject({ cleared: true, provisional: false });
    expect(progress[0].assumed).toEqual([]);
  });
  it('spends the credit once the exercise has really been practised', () => {
    // Six poor attempts is thin, but it is no longer nothing — and practice
    // that disagrees with the diagnostic must win.
    const poor = SECTIONS[0].exercises.flatMap(exercise =>
      Array.from({ length: 8 }, () => attempt(exercise, { correct: false, response: 'wrong' })));
    const progress = sectionProgress(statesFor(poor), diagnosed(0));
    expect(progress[0].cleared).toBe(false);
    expect(progress[1].unlocked).toBe(false);
  });
  it('moves the learner back when placement is contradicted', () => {
    const poor = SECTIONS[0].exercises.flatMap(exercise =>
      Array.from({ length: 8 }, () => attempt(exercise, { correct: false, response: 'wrong' })));
    expect(placementDay([], diagnosed(0))).toBeGreaterThan(1);
    expect(placementDay(statesFor(poor), diagnosed(0))).toBe(1);
  });
});
