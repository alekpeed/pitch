import { beforeEach, describe, expect, it } from 'vitest';
import { dayStore, gradeFor, localDate, standing, type DayRecord } from './progression';

const record = (day: number, date: string, correct = 15, total = 15): DayRecord => ({ day, date, correct, total, medianLatencyMs: 1200 });

describe('local dates', () => {
  it('uses the calendar day the learner is living in, not UTC', () => {
    // Late evening local time is still that evening, even where UTC has rolled over.
    const lateNight = new Date(2026, 2, 1, 23, 30);
    expect(localDate(lateNight)).toBe('2026-03-01');
  });
  it('pads so dates sort lexicographically', () => expect(localDate(new Date(2026, 0, 5))).toBe('2026-01-05'));
});

describe('grades', () => {
  it('bands accuracy without ever gating on it', () => {
    expect(gradeFor(1)).toBe('A');
    expect(gradeFor(.8)).toBe('B');
    expect(gradeFor(.62)).toBe('C');
    expect(gradeFor(.2)).toBe('D');
  });
});

describe('standing', () => {
  const today = '2026-03-10';
  it('is empty for someone who has never practised', () => {
    expect(standing([], today)).toMatchObject({ completedDays: 0, streak: 0, doneToday: false });
  });
  it('counts consecutive calendar days', () => {
    const records = [record(1, '2026-03-08'), record(2, '2026-03-09'), record(3, today)];
    expect(standing(records, today)).toMatchObject({ streak: 3, doneToday: true, completedDays: 3 });
  });
  it('keeps a streak alive during a day that has not been worked yet', () => {
    // Mid-morning, before today's session: yesterday's streak is not yet broken.
    const records = [record(1, '2026-03-08'), record(2, '2026-03-09')];
    expect(standing(records, today)).toMatchObject({ streak: 2, doneToday: false });
  });
  it('breaks a streak once a whole day has been missed', () => {
    const records = [record(1, '2026-03-06'), record(2, '2026-03-07')];
    expect(standing(records, today).streak).toBe(0);
  });
  it('reports days worked in the fortnight, which a streak alone hides', () => {
    const records = [record(1, '2026-03-01'), record(2, '2026-03-04'), record(3, '2026-03-09')];
    const result = standing(records, today);
    expect(result.streak).toBe(1);
    expect(result.recentDaysWorked).toBe(3);
  });
  it('grades the most recent day', () => {
    expect(standing([record(1, today, 15, 15)], today).lastGrade).toBe('A');
    expect(standing([record(1, today, 6, 15)], today).lastGrade).toBe('D');
  });
});

describe('the day store', () => {
  beforeEach(() => localStorage.clear());
  it('round-trips a completion', () => {
    dayStore.complete(record(1, '2026-03-01'));
    expect(dayStore.all()).toHaveLength(1);
  });
  it('replaying a day overwrites it rather than inflating the count', () => {
    dayStore.complete(record(1, '2026-03-01', 10, 15));
    dayStore.complete(record(1, '2026-03-02', 15, 15));
    expect(dayStore.all()).toHaveLength(1);
    expect(dayStore.all()[0]).toMatchObject({ date: '2026-03-02', correct: 15 });
  });
  it('keeps days in order however they arrive', () => {
    dayStore.complete(record(3, '2026-03-03'));
    dayStore.complete(record(1, '2026-03-01'));
    expect(dayStore.all().map(item => item.day)).toEqual([1, 3]);
  });
  it('survives nonsense in storage rather than throwing', () => {
    localStorage.setItem('perfect-ear-days-v1', '{ not json');
    expect(dayStore.all()).toEqual([]);
  });
});
