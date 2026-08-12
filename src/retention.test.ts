import { beforeEach, describe, expect, it } from 'vitest';
import { dueProbes, nextInterval, probeSeed, RETENTION_LADDER, retentionStore, scheduleProbe, type RetentionProbe } from './retention';

const DAY = 86_400_000;
const NOW = Date.parse('2026-03-01T00:00:00.000Z');
const probe = (overrides: Partial<RetentionProbe> = {}): RetentionProbe => ({
  id: 'p1', exercise: 'triad-recognition', dueAt: new Date(NOW - DAY).toISOString(), intervalDays: 3, ...overrides,
});

describe('retention scheduling', () => {
  it('lengthens the interval after a pass and shortens it after a failure', () => {
    expect(nextInterval(3, true)).toBe(7);
    expect(nextInterval(3, false)).toBe(1);
  });
  it('holds at both ends of the ladder', () => {
    expect(nextInterval(RETENTION_LADDER.at(-1)!, true)).toBe(RETENTION_LADDER.at(-1));
    expect(nextInterval(RETENTION_LADDER[0], false)).toBe(RETENTION_LADDER[0]);
  });
  it('snaps an unrecognised interval to the nearest rung', () => expect(nextInterval(6, true)).toBe(16));
  it('starts a new skill at the shortest interval', () => {
    expect(scheduleProbe('triad-recognition', { id: 'p1', now: NOW }).intervalDays).toBe(RETENTION_LADDER[0]);
  });
  it('dates the probe forward by its interval', () => {
    const scheduled = scheduleProbe('triad-recognition', { id: 'p1', intervalDays: 3, passed: true, now: NOW });
    expect(Date.parse(scheduled.dueAt) - NOW).toBe(7 * DAY);
  });
});

describe('due probes', () => {
  it('returns only probes that have come due', () => {
    const probes = [probe(), probe({ id: 'p2', dueAt: new Date(NOW + DAY).toISOString() })];
    expect(dueProbes(probes, NOW).map(item => item.id)).toEqual(['p1']);
  });
  it('ignores probes already completed', () => {
    expect(dueProbes([probe({ completedAt: new Date(NOW).toISOString() })], NOW)).toEqual([]);
  });
  it('orders the most overdue first', () => {
    const probes = [probe({ id: 'recent', dueAt: new Date(NOW - DAY).toISOString() }), probe({ id: 'stale', dueAt: new Date(NOW - 9 * DAY).toISOString() })];
    expect(dueProbes(probes, NOW).map(item => item.id)).toEqual(['stale', 'recent']);
  });
  it('derives a different seed than the attempt it came from, so retests are not exact repeats', () => {
    expect(probeSeed(probe({ sourceSeed: 42 }), NOW)).not.toBe(42);
  });
});

describe('retention store', () => {
  beforeEach(() => localStorage.clear());
  it('records an outcome and immediately queues the follow-up probe', () => {
    retentionStore.upsert(probe());
    const follow = retentionStore.complete('p1', true, NOW);
    expect(follow?.intervalDays).toBe(7);
    const stored = retentionStore.all();
    expect(stored.find(item => item.id === 'p1')).toMatchObject({ passed: true, completedAt: new Date(NOW).toISOString() });
    expect(stored).toHaveLength(2);
  });
  it('shortens the next interval after a failed probe', () => {
    retentionStore.upsert(probe());
    expect(retentionStore.complete('p1', false, NOW)?.intervalDays).toBe(1);
  });
  it('does not re-serve a probe once completed', () => {
    retentionStore.upsert(probe());
    retentionStore.complete('p1', true, NOW);
    expect(retentionStore.due(NOW).map(item => item.id)).not.toContain('p1');
  });
  it('ignores an unknown probe id', () => expect(retentionStore.complete('missing', true, NOW)).toBeUndefined());
  it('recovers from invalid local data', () => {
    localStorage.setItem('perfect-ear-retention-v1', 'broken');
    expect(retentionStore.all()).toEqual([]);
  });
  it('replaces rather than duplicates on upsert', () => {
    retentionStore.upsert(probe());
    retentionStore.upsert(probe({ intervalDays: 16 }));
    expect(retentionStore.all()).toHaveLength(1);
  });
});
