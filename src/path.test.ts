import { describe, expect, it } from 'vitest';
import { skillStates } from './adaptive';
import { buildDay, DAY_LENGTH, dayFor, dayPlan, placementDay, TOTAL_DAYS } from './path';
import { SECTIONS } from './sections';
import type { Attempt } from './storage';
import type { DrillConfig } from './training';

const NOW = Date.parse('2026-03-01T00:00:00.000Z');
const config = (kind: DrillConfig['kind']): DrillConfig => ({ kind, rootPool: 'all', inversions: false, melodic: false, register: 'middle', timbre: 'piano' });
const build = { configFor: (exercise: string) => config(exercise.replace('-recognition', '') as DrillConfig['kind']) };
const attempt = (exercise: string, overrides: Partial<Attempt> = {}): Attempt => ({
  id: crypto.randomUUID(), sessionId: 's', timestamp: new Date(NOW).toISOString(), exercise,
  stimulus: {}, expected: 'x', response: 'x', correct: true, latencyMs: 1100,
  difficulty: { register: 'middle' }, replayCount: 0, ...overrides,
});
const reliable = (exercise: string) => [
  ...Array.from({ length: 8 }, () => attempt(exercise, { difficulty: { register: 'middle' } })),
  ...Array.from({ length: 8 }, () => attempt(exercise, { difficulty: { register: 'high' } })),
];

describe('the day ladder', () => {
  it('starts on the first section and ends on the last', () => {
    expect(dayPlan(1).section.id).toBe(SECTIONS[0].id);
    expect(dayPlan(TOTAL_DAYS).section.id).toBe(SECTIONS.at(-1)!.id);
  });
  it('walks the sections in order, never skipping one', () => {
    const visited: string[] = [];
    for (let day = 1; day <= TOTAL_DAYS; day += 1) {
      const id = dayPlan(day).section.id;
      if (visited.at(-1) !== id) visited.push(id);
    }
    expect(visited).toEqual(SECTIONS.map(section => section.id));
  });
  it('clamps rather than inventing days off either end', () => {
    expect(dayPlan(0).day).toBe(1);
    expect(dayPlan(-5).day).toBe(1);
    expect(dayPlan(TOTAL_DAYS + 99).day).toBe(TOTAL_DAYS);
  });
  it('has nothing to revisit on the first section and always does later', () => {
    expect(dayPlan(1).reviews).toEqual([]);
    for (let day = 1; day <= TOTAL_DAYS; day += 1) {
      const plan = dayPlan(day);
      const isFirstSection = plan.section.id === SECTIONS[0].id;
      expect(plan.reviews.length > 0).toBe(!isFirstSection);
    }
  });
  it('rotates review across every earlier section rather than only the last', () => {
    // Late in the ladder there are many earlier sections; all should come round.
    const lastSectionDays = Array.from({ length: TOTAL_DAYS }, (_, index) => index + 1)
      .filter(day => dayPlan(day).section.id === SECTIONS.at(-1)!.id);
    const revisited = new Set(lastSectionDays.flatMap(day => dayPlan(day).reviews.map(section => section.id)));
    expect(revisited.size).toBeGreaterThan(1);
  });
  it('advances one day at a time and stops at the end', () => {
    expect(dayFor(0)).toBe(1);
    expect(dayFor(3)).toBe(4);
    expect(dayFor(TOTAL_DAYS)).toBe(TOTAL_DAYS);
  });
});

describe('placement', () => {
  it('starts a complete beginner at day one', () => expect(placementDay([])).toBe(1));
  it('skips past sections the evidence says are already cleared', () => {
    const states = skillStates({ attempts: SECTIONS[0].exercises.flatMap(reliable), now: NOW });
    const placed = placementDay(states);
    expect(placed).toBeGreaterThan(1);
    expect(dayPlan(placed).section.id).toBe(SECTIONS[1].id);
  });
});

describe('building a day', () => {
  it('is a finite, defined piece of work', () => {
    expect(buildDay(1, build)).toHaveLength(DAY_LENGTH);
    expect(buildDay(1, { ...build, total: 8 })).toHaveLength(8);
  });
  it('only draws on the section it teaches and the one it revisits', () => {
    for (const day of [1, 7, 20, TOTAL_DAYS]) {
      const plan = dayPlan(day);
      const allowed = new Set([...plan.section.exercises, ...plan.reviews.flatMap(section => section.exercises)]);
      buildDay(day, build).forEach(slot => expect(allowed.has(slot.exercise)).toBe(true));
    }
  });
  it('actually revisits earlier material rather than only promising to', () => {
    const day = TOTAL_DAYS - 1;
    const plan = dayPlan(day);
    const reviewed = new Set(plan.reviews.flatMap(section => section.exercises));
    expect(buildDay(day, build).some(slot => reviewed.has(slot.exercise))).toBe(true);
  });
  it('honours a due retention probe inside the day plan', () => {
    const exercise = SECTIONS[0].exercises[0];
    const slots = buildDay(1, { ...build, dueRetention: [{ exercise, probeId: 'p1' }] });
    expect(slots.some(slot => slot.probeId === 'p1')).toBe(true);
  });
  it('ignores a probe for material this day does not cover', () => {
    const slots = buildDay(1, { ...build, dueRetention: [{ exercise: 'transcription', probeId: 'p9' }] });
    expect(slots.some(slot => slot.exercise === 'transcription')).toBe(false);
  });
  it('never schedules production or transfer as part of a taught day', () => {
    // Those are sections in their own right; a day teaches its own section.
    for (const day of [1, 10, 25]) {
      buildDay(day, build).forEach(slot => expect(['production', 'transfer']).not.toContain(slot.purpose));
    }
  });
});
