import { describe, expect, it } from 'vitest';
import { dayBriefing, dayReport } from './tutor';
import { TOTAL_DAYS } from './path';
import type { DayRecord } from './progression';
import type { Attempt } from './storage';

const NOW = Date.parse('2026-03-01T00:00:00.000Z');
let counter = 0;
const attempt = (exercise: string, correct: boolean, overrides: Partial<Attempt> = {}): Attempt => ({
  id: `a${counter += 1}`, sessionId: 's', timestamp: new Date(NOW).toISOString(), exercise,
  stimulus: {}, expected: 'major', response: correct ? 'major' : 'minor', correct, latencyMs: 1200,
  difficulty: {}, replayCount: 0, ...overrides,
});
const report = (attempts: Attempt[], day = 3) =>
  dayReport({ day, attempts, todayIds: new Set(attempts.map(item => item.id)), now: NOW });

describe('the end-of-day report', () => {
  it('grades on what was actually answered', () => {
    const result = report([...Array.from({ length: 9 }, () => attempt('triad-recognition', true)), attempt('triad-recognition', false)]);
    expect(result).toMatchObject({ correct: 9, total: 10, grade: 'A' });
    expect(result.headline).toContain('9 of 10');
  });
  it('counts only this day, never the whole history', () => {
    const today = Array.from({ length: 4 }, () => attempt('triad-recognition', true));
    const history = Array.from({ length: 50 }, () => attempt('triad-recognition', false));
    const result = dayReport({ day: 2, attempts: [...history, ...today], todayIds: new Set(today.map(item => item.id)), now: NOW });
    expect(result.total).toBe(4);
    expect(result.grade).toBe('A');
  });
  it('names the drill that slipped', () => {
    const result = report([
      ...Array.from({ length: 5 }, () => attempt('interval-recognition', false)),
      ...Array.from({ length: 5 }, () => attempt('triad-recognition', true)),
    ]);
    expect(result.notes.join(' ')).toContain('interval');
  });
  it('names a confusion as a pair, which is something you can listen for', () => {
    const errors = Array.from({ length: 3 }, () => attempt('seventh-recognition', false, { expected: 'major 7', response: 'dominant 7' }));
    expect(report(errors).notes.join(' ')).toContain('major 7 as dominant 7');
  });
  it('notices when the sound is there but not yet immediate', () => {
    const laboured = Array.from({ length: 4 }, () => attempt('triad-recognition', true, { replayCount: 4 }));
    expect(report(laboured).notes.join(' ')).toContain('three or more listens');
  });
  it('stays quiet rather than inventing observations from thin evidence', () => {
    expect(report([attempt('triad-recognition', true)]).notes).toEqual([]);
  });
  it('holds the learner on a section after a bad day instead of pressing on', () => {
    const rough = Array.from({ length: 10 }, () => attempt('triad-recognition', false));
    const result = report(rough);
    expect(result.grade).toBe('D');
    expect(result.next).toContain('repeats');
  });
  it('says what tomorrow does, and knows when there is no tomorrow', () => {
    const good = Array.from({ length: 10 }, () => attempt('triad-recognition', true));
    expect(report(good, 3).next).toContain('Tomorrow');
    expect(report(good, TOTAL_DAYS).next).toContain('end of the pathway');
  });
  it('handles a day with nothing recorded', () => {
    expect(report([])).toMatchObject({ total: 0, correct: 0 });
    expect(report([]).headline).toContain('Nothing recorded');
  });
});

describe('the briefing', () => {
  const records: DayRecord[] = [{ day: 1, date: '2026-03-01', correct: 4, total: 15, medianLatencyMs: 1200 }];
  it('says plainly that day one starts at the beginning', () => {
    expect(dayBriefing(1, [])).toContain('beginning');
  });
  it('acknowledges a rough previous day rather than glossing over it', () => {
    expect(dayBriefing(2, records)).toContain('rough');
  });
  it('flags new ground when a section opens', () => {
    expect(dayBriefing(7, [])).toContain('New ground');
  });
});
