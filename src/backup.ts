import { confusionPairs, summarizeSkills } from './analytics';
import type { StoredDiagnostic } from './diagnostic';
import { journal, renderEntry, type SessionNote } from './journal';
import type { RetentionProbe } from './retention';
import type { Attempt, Session } from './storage';
import type { TranscriptionSubmission } from './transcription';

/* --------------------------------------------------------- backup (100) */

export const BACKUP_VERSION = 1;
/** Identifies the file as ours before anything is read out of it. */
export const BACKUP_APP = 'perfect-ear';

export interface Backup {
  app: typeof BACKUP_APP; version: number; exportedAt: string;
  attempts: Attempt[]; sessions: Session[]; notes: SessionNote[];
  probes: RetentionProbe[]; submissions: TranscriptionSubmission[];
  diagnostic?: StoredDiagnostic; profile?: string;
}

export type BackupInput = Omit<Backup, 'app' | 'version' | 'exportedAt'> & { exportedAt?: string };

export const buildBackup = (input: BackupInput): Backup => ({
  app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: input.exportedAt ?? new Date().toISOString(),
  attempts: input.attempts, sessions: input.sessions, notes: input.notes,
  probes: input.probes, submissions: input.submissions,
  diagnostic: input.diagnostic, profile: input.profile,
});

export type ParseResult = { ok: true; backup: Backup } | { ok: false; error: string };

/**
 * Restores are the one place a user hands the app a file, so nothing is trusted:
 * the shape is checked before any of it reaches a store, and a clear reason comes
 * back instead of a half-applied restore.
 */
export function parseBackup(text: string): ParseResult {
  let parsed: unknown;
  try { parsed = JSON.parse(text); }
  catch { return { ok: false, error: 'That is not valid JSON.' }; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false, error: 'A backup must be a JSON object.' };
  const value = parsed as Record<string, unknown>;
  if (value.app !== BACKUP_APP) return { ok: false, error: 'This file was not exported by Perfect Ear.' };
  if (typeof value.version !== 'number') return { ok: false, error: 'This backup has no version, so it cannot be read safely.' };
  if (value.version > BACKUP_VERSION) return { ok: false, error: `This backup is version ${value.version}, newer than this app understands (${BACKUP_VERSION}).` };
  const list = <T,>(key: string): T[] => Array.isArray(value[key]) ? value[key] as T[] : [];
  const attempts = list<Attempt>('attempts').filter(item => item && typeof item.id === 'string' && typeof item.exercise === 'string');
  if (Array.isArray(value.attempts) && value.attempts.length && !attempts.length) return { ok: false, error: 'The attempts in this backup are not in a shape this app recognises.' };
  return {
    ok: true,
    backup: {
      app: BACKUP_APP, version: value.version,
      exportedAt: typeof value.exportedAt === 'string' ? value.exportedAt : new Date().toISOString(),
      attempts, sessions: list<Session>('sessions'), notes: list<SessionNote>('notes'),
      probes: list<RetentionProbe>('probes'), submissions: list<TranscriptionSubmission>('submissions'),
      diagnostic: value.diagnostic as StoredDiagnostic | undefined,
      profile: typeof value.profile === 'string' ? value.profile : undefined,
    },
  };
}

const byId = <T extends { id: string }>(current: readonly T[], incoming: readonly T[]) => {
  // The record already here wins, because it is the one with any later edits.
  const seen = new Map(incoming.map(item => [item.id, item]));
  current.forEach(item => seen.set(item.id, item));
  return [...seen.values()];
};

/**
 * Merging is the default because a restore is usually "get my history back on a
 * new phone", not "throw away what I have done since". Attempts are immutable and
 * carry stable ids, so merging by id cannot double-count a session.
 */
export function mergeBackup(current: BackupInput, incoming: Backup): Backup {
  const notes = new Map(incoming.notes.map(note => [note.sessionId, note]));
  current.notes.forEach(note => notes.set(note.sessionId, note));
  return buildBackup({
    attempts: byId(current.attempts, incoming.attempts),
    sessions: byId(current.sessions, incoming.sessions),
    probes: byId(current.probes, incoming.probes),
    submissions: byId(current.submissions, incoming.submissions),
    notes: [...notes.values()],
    diagnostic: current.diagnostic ?? incoming.diagnostic,
    profile: current.profile ?? incoming.profile,
  });
}

/* ---------------------------------------------------------- export (99) */

/** RFC 4180: quote anything containing a comma, quote or newline, and double inner quotes. */
const cell = (value: unknown) => {
  const text = value === undefined || value === null ? ''
    : typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

const CSV_COLUMNS = [
  'id', 'timestamp', 'sessionId', 'exercise', 'expected', 'response', 'correct',
  'latencyMs', 'replayCount', 'transferCategory', 'confidence', 'retentionProbeId', 'difficulty',
] as const;

export function toCsv(attempts: readonly Attempt[]): string {
  const rows = attempts.map(attempt => CSV_COLUMNS.map(column =>
    cell(column === 'difficulty' ? attempt.difficulty : attempt[column as keyof Attempt])).join(','));
  return [CSV_COLUMNS.join(','), ...rows].join('\n');
}

export const toJson = (backup: Backup) => JSON.stringify(backup, null, 2);

export type ReportPeriod = 'week' | 'month' | 'quarter' | 'year' | 'all';
export const PERIOD_DAYS: Record<ReportPeriod, number> = { week: 7, month: 30, quarter: 90, year: 365, all: Number.POSITIVE_INFINITY };
export const PERIOD_LABELS: Record<ReportPeriod, string> = {
  week: 'the last week', month: 'the last month', quarter: 'the last three months',
  year: 'the last year', all: 'all recorded practice',
};

const DAY_MS = 86_400_000;
const percent = (value: number) => `${Math.round(value * 100)}%`;
const rate = (items: readonly Attempt[]) => items.length ? items.filter(item => item.correct).length / items.length : 0;

/**
 * The readable report the spec asks for: skill profile, change over the period,
 * active weaknesses, transfer, session chronology and the user's own notes.
 * Markdown rather than PDF — it reads as plain text and prints from any viewer.
 */
export function toReport(backup: Backup, period: ReportPeriod = 'all', now = Date.now()): string {
  const cutoff = PERIOD_DAYS[period] === Number.POSITIVE_INFINITY ? -Infinity : now - PERIOD_DAYS[period] * DAY_MS;
  const within = backup.attempts.filter(item => Date.parse(item.timestamp) >= cutoff);
  const before = backup.attempts.filter(item => Date.parse(item.timestamp) < cutoff);
  const lines: string[] = [
    '# Perfect Ear — practice report',
    '',
    `Covering ${PERIOD_LABELS[period]}, generated ${new Date(now).toISOString().slice(0, 10)}.`,
    `${within.length} graded attempt${within.length === 1 ? '' : 's'} at ${percent(rate(within))} overall.`,
    '',
    '## Skill profile',
    '',
  ];

  const skills = summarizeSkills(within).sort((a, b) => b.attempts - a.attempts);
  if (!skills.length) lines.push('No graded attempts in this period.');
  skills.forEach(skill => {
    const earlier = before.filter(item => item.exercise === skill.exercise);
    // Change is only reported against evidence that exists; without a prior period
    // there is nothing to compare, and inventing a baseline would be a lie.
    const change = earlier.length >= 5 ? ` (was ${percent(rate(earlier))} before this period)` : '';
    lines.push(`- **${skill.exercise.replaceAll('-', ' ')}** — ${skill.mastery}, ${percent(skill.accuracy)} over ${skill.attempts}, median ${(skill.medianLatencyMs / 1000).toFixed(1)}s${change}`);
  });

  lines.push('', '## Active weaknesses', '');
  const weak = skills.filter(skill => skill.attempts >= 4 && skill.accuracy < .8).sort((a, b) => a.accuracy - b.accuracy);
  if (!weak.length) lines.push('Nothing below 80% with enough evidence to call it a weakness.');
  weak.forEach(skill => lines.push(`- ${skill.exercise.replaceAll('-', ' ')} at ${percent(skill.accuracy)} over ${skill.attempts}`));
  const confusions = confusionPairs(within).slice(0, 8);
  if (confusions.length) {
    lines.push('', 'Recurring confusions:', '');
    confusions.forEach(item => lines.push(`- ${item.pair} ×${item.count}`));
  }

  lines.push('', '## Transfer to real music', '');
  const transfer = within.filter(item => item.transferCategory === 'real-music');
  lines.push(transfer.length
    ? `${percent(rate(transfer))} across ${transfer.length} real-music attempts, tracked separately from synthetic drills.`
    : 'No real-music evidence in this period, so synthetic success is not yet evidence of transfer.');

  lines.push('', '## Retention', '');
  const resolved = backup.probes.filter(probe => probe.completedAt && Date.parse(probe.completedAt) >= cutoff);
  lines.push(resolved.length
    ? `${resolved.filter(probe => probe.passed).length} of ${resolved.length} delayed probes held.`
    : 'No delayed probes resolved in this period.');

  lines.push('', '## Session chronology', '');
  const entries = journal({ attempts: within, sessions: backup.sessions, notes: backup.notes, probes: backup.probes });
  if (!entries.length) lines.push('No sessions in this period.');
  entries.forEach(entry => lines.push(`- ${renderEntry(entry)}`));

  const notes = backup.notes.filter(note => {
    const entry = entries.find(item => item.sessionId === note.sessionId);
    return entry && (note.note || note.observation);
  });
  if (notes.length) {
    lines.push('', '## Your notes', '');
    notes.forEach(note => lines.push(`- ${new Date(note.savedAt).toISOString().slice(0, 10)}: ${[note.note, note.observation].filter(Boolean).join(' — ')}`));
  }

  lines.push('', '---', 'Self-report is recorded alongside measured evidence and never replaces it.');
  return lines.join('\n');
}

export const backupFilename = (extension: string, now = Date.now()) =>
  `perfect-ear-${new Date(now).toISOString().slice(0, 10)}.${extension}`;
