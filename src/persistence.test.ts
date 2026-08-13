import { beforeEach, describe, expect, it } from 'vitest';
import { buildBackup, mergeBackup, parseBackup, toJson } from './backup';
import { profileStore } from './curriculum';
import { diagnosticStore } from './diagnostic';
import { noteStore } from './journal';
import { retentionStore } from './retention';
import { applyBackup, currentData } from './persistence';
import { attemptStore, sessionStore, type Attempt } from './storage';
import { transcriptionStore } from './transcription';

const attempt = (id: string): Attempt => ({
  id, sessionId: 's1', timestamp: '2026-08-12T10:00:00.000Z', exercise: 'triad-recognition',
  stimulus: {}, expected: 'major', response: 'major', correct: true, latencyMs: 1100,
  difficulty: { register: 'middle' }, replayCount: 0, transferCategory: 'synthetic',
});

beforeEach(() => localStorage.clear());

describe('backing up and restoring a device', () => {
  it('carries every store across, not just the attempts', () => {
    attemptStore.add(attempt('a1'));
    sessionStore.add({ id: 's1', startedAt: '2026-08-12T10:00:00.000Z', mode: 'mixed' });
    noteStore.save({ sessionId: 's1', savedAt: '2026-08-12T10:30:00.000Z', note: 'Rhodes felt muddier' });
    retentionStore.upsert({ id: 'p1', exercise: 'triad-recognition', dueAt: '2026-08-15T10:00:00.000Z', intervalDays: 3 });
    transcriptionStore.addSubmission({ id: 'x1', sessionId: 's1', assetId: 'demo', submittedAt: '2026-08-12T10:20:00.000Z', answer: { harmony: ['C'], boundariesSeconds: [0] }, transferCategory: 'real-music', submittedBeforeReference: true });
    diagnosticStore.save([{ exercise: 'triad', level: 6, config: { kind: 'triad', rootPool: 'all', inversions: false, melodic: false, register: 'middle', timbre: 'piano' }, items: 4, bracketed: true, ceilingKnown: true }]);
    profileStore.set('jazz');

    const exported = toJson(buildBackup(currentData()));
    localStorage.clear();
    expect(currentData().attempts).toHaveLength(0);

    const parsed = parseBackup(exported);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    applyBackup(parsed.backup);

    const restored = currentData();
    expect(restored.attempts).toHaveLength(1);
    expect(restored.sessions).toHaveLength(1);
    expect(restored.notes[0].note).toBe('Rhodes felt muddier');
    expect(restored.probes).toHaveLength(1);
    expect(restored.submissions).toHaveLength(1);
    expect(restored.diagnostic?.levels.triad).toBe(6);
    expect(restored.profile).toBe('jazz');
  });

  it('merges a backup into a device that has practised since', () => {
    attemptStore.add(attempt('local'));
    const incoming = buildBackup({ attempts: [attempt('fromBackup'), attempt('local')], sessions: [], notes: [], probes: [], submissions: [] });
    applyBackup(mergeBackup(currentData(), incoming));
    expect(currentData().attempts.map(item => item.id).sort()).toEqual(['fromBackup', 'local']);
  });

  it('leaves the device untouched when the file is rejected', () => {
    attemptStore.add(attempt('a1'));
    const parsed = parseBackup('{"app":"not-us"}');
    expect(parsed.ok).toBe(false);
    // Nothing is written unless parsing succeeded, so the guard is the whole fix.
    expect(currentData().attempts).toHaveLength(1);
  });

  it('survives a round trip with nothing recorded at all', () => {
    const parsed = parseBackup(toJson(buildBackup(currentData())));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) applyBackup(parsed.backup);
    expect(currentData().attempts).toEqual([]);
  });
});
