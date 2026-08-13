import { describe, expect, it } from 'vitest';
import {
  BACKUP_VERSION, backupFilename, buildBackup, mergeBackup, parseBackup, toCsv, toJson, toReport,
  type Backup, type BackupInput,
} from './backup';
import { journal, journalEntry, renderEntry, type SessionNote } from './journal';
import type { Attempt, Session } from './storage';

const DAY = 86_400_000;
const NOW = Date.parse('2026-08-13T12:00:00.000Z');

const attempt = (over: Partial<Attempt> = {}): Attempt => ({
  id: 'a1', sessionId: 's1', timestamp: new Date(NOW - DAY).toISOString(), exercise: 'triad-recognition',
  stimulus: {}, expected: 'major', response: 'major', correct: true, latencyMs: 1400,
  difficulty: { register: 'middle', timbre: 'piano' }, replayCount: 0, transferCategory: 'synthetic', ...over,
});
const session = (over: Partial<Session> = {}): Session => ({
  id: 's1', startedAt: new Date(NOW - DAY).toISOString(), endedAt: new Date(NOW - DAY + 20 * 60_000).toISOString(), mode: 'mixed', ...over,
});
const empty: BackupInput = { attempts: [], sessions: [], notes: [], probes: [], submissions: [] };

describe('backup format', () => {
  it('stamps the app and version so a stranger file can be refused', () => {
    const backup = buildBackup(empty);
    expect(backup.app).toBe('perfect-ear');
    expect(backup.version).toBe(BACKUP_VERSION);
  });

  it('round-trips through JSON without losing anything', () => {
    const backup = buildBackup({ ...empty, attempts: [attempt(), attempt({ id: 'a2', correct: false, response: 'minor' })], sessions: [session()], notes: [{ sessionId: 's1', savedAt: new Date(NOW).toISOString(), note: 'Rhodes felt harder' }], profile: 'jazz' });
    const parsed = parseBackup(toJson(backup));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.backup).toEqual(backup);
  });

  it('names the file by the day it was taken', () => {
    expect(backupFilename('json', NOW)).toBe('perfect-ear-2026-08-13.json');
  });
});

describe('restoring an untrusted file', () => {
  const reject = (text: string) => {
    const result = parseBackup(text);
    expect(result.ok).toBe(false);
    return result.ok ? '' : result.error;
  };

  it('refuses malformed JSON', () => expect(reject('{oh no')).toMatch(/valid JSON/));
  it('refuses a bare array', () => expect(reject('[]')).toMatch(/JSON object/));
  it('refuses a file from another app', () => expect(reject('{"app":"something-else","version":1}')).toMatch(/not exported by Perfect Ear/));
  it('refuses an unversioned file', () => expect(reject('{"app":"perfect-ear"}')).toMatch(/no version/));
  it('refuses a backup newer than this app', () => expect(reject(`{"app":"perfect-ear","version":${BACKUP_VERSION + 1}}`)).toMatch(/newer than this app/));

  it('refuses attempts that are not attempts, rather than importing rubbish', () => {
    expect(reject('{"app":"perfect-ear","version":1,"attempts":[{"nope":true}]}')).toMatch(/not in a shape/);
  });

  it('tolerates a backup that simply has no history yet', () => {
    const result = parseBackup('{"app":"perfect-ear","version":1}');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.backup.attempts).toEqual([]);
  });
});

describe('merging a restore into existing history', () => {
  const incoming: Backup = buildBackup({
    ...empty,
    attempts: [attempt({ id: 'old' }), attempt({ id: 'shared', response: 'from-backup' })],
    sessions: [session({ id: 'sOld' })],
    notes: [{ sessionId: 's1', savedAt: new Date(NOW - DAY).toISOString(), note: 'from the backup' }],
    profile: 'rock',
  });

  it('keeps both histories rather than replacing one with the other', () => {
    const merged = mergeBackup({ ...empty, attempts: [attempt({ id: 'local' })] }, incoming);
    expect(merged.attempts.map(item => item.id).sort()).toEqual(['local', 'old', 'shared']);
  });

  it('never double-counts an attempt present on both sides', () => {
    const merged = mergeBackup({ ...empty, attempts: [attempt({ id: 'shared', response: 'local' })] }, incoming);
    expect(merged.attempts.filter(item => item.id === 'shared')).toHaveLength(1);
    // The copy already here wins, since it carries any later edits.
    expect(merged.attempts.find(item => item.id === 'shared')!.response).toBe('local');
  });

  it('keeps the local note for a session over the backed-up one', () => {
    const merged = mergeBackup({ ...empty, notes: [{ sessionId: 's1', savedAt: new Date(NOW).toISOString(), note: 'written since' }] }, incoming);
    expect(merged.notes).toHaveLength(1);
    expect(merged.notes[0].note).toBe('written since');
  });

  it('adopts a setting the local install does not have', () => {
    expect(mergeBackup(empty, incoming).profile).toBe('rock');
  });
});

describe('CSV export', () => {
  it('writes a header and one row per attempt', () => {
    const rows = toCsv([attempt(), attempt({ id: 'a2' })]).split('\n');
    expect(rows).toHaveLength(3);
    expect(rows[0].startsWith('id,timestamp,sessionId,exercise')).toBe(true);
  });

  it('escapes commas, quotes and newlines instead of breaking the row', () => {
    const csv = toCsv([attempt({ expected: 'major, minor', response: 'he said "maybe"', stimulus: {} })]);
    const row = csv.split('\n')[1];
    expect(row).toContain('"major, minor"');
    expect(row).toContain('"he said ""maybe"""');
    // Escaping worked if the file is still exactly two lines.
    expect(csv.split('\n')).toHaveLength(2);
  });

  it('serialises the difficulty conditions rather than dropping them', () => {
    expect(toCsv([attempt()])).toContain('register');
  });

  it('still produces a usable header with no attempts at all', () => {
    expect(toCsv([]).split('\n')).toHaveLength(1);
  });
});

describe('readable report', () => {
  const backup = buildBackup({
    ...empty,
    attempts: [
      ...Array.from({ length: 10 }, (_, index) => attempt({ id: `r${index}`, correct: index > 2 })),
      ...Array.from({ length: 6 }, (_, index) => attempt({ id: `old${index}`, correct: false, timestamp: new Date(NOW - 200 * DAY).toISOString() })),
      attempt({ id: 't1', exercise: 'transcription', transferCategory: 'real-music', correct: true }),
    ],
    sessions: [session()],
    notes: [{ sessionId: 's1', savedAt: new Date(NOW - DAY).toISOString(), note: 'Rhodes felt muddier than piano', perceived: 'harder' }],
    probes: [{ id: 'p1', exercise: 'triad-recognition', dueAt: new Date(NOW - 2 * DAY).toISOString(), intervalDays: 3, completedAt: new Date(NOW - DAY).toISOString(), passed: true }],
  });

  it('covers every section the spec asks for', () => {
    const report = toReport(backup, 'all', NOW);
    ['Skill profile', 'Active weaknesses', 'Transfer to real music', 'Retention', 'Session chronology', 'Your notes']
      .forEach(heading => expect(report, heading).toContain(`## ${heading}`));
  });

  it('reports change only against evidence from before the period', () => {
    // A month window has the older attempts outside it, so a comparison exists...
    expect(toReport(backup, 'month', NOW)).toMatch(/was \d+% before this period/);
    // ...but over all time there is nothing earlier to compare against.
    expect(toReport(backup, 'all', NOW)).not.toContain('before this period');
  });

  it('keeps real-music evidence separate from synthetic', () => {
    expect(toReport(backup, 'all', NOW)).toMatch(/across 1 real-music attempt/);
  });

  it('says so plainly when a period is empty rather than implying zero', () => {
    const report = toReport(buildBackup(empty), 'week', NOW);
    expect(report).toContain('No graded attempts in this period.');
    expect(report).toContain('No sessions in this period.');
  });

  it('includes the user note without folding it into the numbers', () => {
    const report = toReport(backup, 'all', NOW);
    expect(report).toContain('Rhodes felt muddier than piano');
    expect(report).toContain('never replaces it');
  });
});

describe('journal entries', () => {
  const attempts = [
    ...Array.from({ length: 12 }, (_, index) => attempt({ id: `j${index}`, correct: index >= 4 })),
    attempt({ id: 'jx', exercise: 'seventh-recognition', correct: false, response: 'minor 7' }),
  ];
  const input = { attempts, sessions: [session()], now: NOW };

  it('measures duration from the session, not from the attempts', () => {
    expect(journalEntry('s1', input).durationMinutes).toBe(20);
  });

  it('lists every skill practised and counts every graded attempt', () => {
    const entry = journalEntry('s1', input);
    expect(entry.attempts).toBe(13);
    expect(entry.skills).toContain('seventh-recognition');
  });

  it('does not claim improvement off a handful of attempts', () => {
    expect(journalEntry('s1', { attempts: [attempt({ id: 'x1', correct: false }), attempt({ id: 'x2' })], sessions: [session()] }).improvement).toBeUndefined();
  });

  it('reports retention results only for probes this session resolved', () => {
    const probe = { id: 'p1', exercise: 'triad-recognition', dueAt: new Date(NOW).toISOString(), intervalDays: 7, completedAt: new Date(NOW).toISOString(), passed: false };
    const entry = journalEntry('s1', { ...input, attempts: [attempt({ retentionProbeId: 'p1' })], probes: [probe] });
    expect(entry.retention).toEqual(['triad recognition lapsed at 7 days']);
    expect(journalEntry('s1', { ...input, probes: [probe] }).retention).toEqual([]);
  });

  it('carries the user note alongside the evidence rather than inside it', () => {
    const note: SessionNote = { sessionId: 's1', savedAt: new Date(NOW).toISOString(), note: 'tired', perceived: 'harder' };
    const entry = journalEntry('s1', { ...input, notes: [note] });
    expect(entry.note).toEqual(note);
    expect(entry.accuracy).toBe(journalEntry('s1', input).accuracy);
    expect(renderEntry(entry)).toContain('Felt harder than expected.');
    expect(renderEntry(entry)).toContain('Note: tired');
  });

  it('reads as one factual paragraph with no score', () => {
    const line = renderEntry(journalEntry('s1', input));
    expect(line).toMatch(/13 graded attempts at \d+%/);
    expect(line).not.toMatch(/point|streak|XP|level up/i);
  });

  it('lists one entry per session that produced evidence, newest first', () => {
    const entries = journal({
      attempts: [attempt({ id: 'e1', sessionId: 's1' }), attempt({ id: 'e2', sessionId: 's2', timestamp: new Date(NOW).toISOString() })],
      sessions: [session(), session({ id: 's2', startedAt: new Date(NOW).toISOString(), endedAt: undefined })],
    });
    expect(entries.map(entry => entry.sessionId)).toEqual(['s2', 's1']);
  });
});
