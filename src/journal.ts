import { confusionPairs, summarizeSkills } from './analytics';
import type { RetentionProbe } from './retention';
import type { Attempt, Session } from './storage';

/* ------------------------------------------------------ manual note (97) */

/** The spec's optional self-report: factual fields only, never a diary requirement. */
export type PerceivedDifficulty = 'easier' | 'expected' | 'harder';
export interface SessionNote {
  sessionId: string; savedAt: string;
  note?: string; perceived?: PerceivedDifficulty;
  /** Something noticed away from the app — "heard the bass inversion in song X". */
  observation?: string;
}

const NOTE_KEY = 'perfect-ear-notes-v1';
function read<T>(key: string): T[] {
  try { const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? '[]'); return Array.isArray(parsed) ? parsed as T[] : []; }
  catch { return []; }
}

export const noteStore = {
  all: (): SessionNote[] => read<SessionNote>(NOTE_KEY),
  for(sessionId: string) { return this.all().find(item => item.sessionId === sessionId); },
  /** One note per session, replaced rather than appended, so editing is not a new record. */
  save(note: SessionNote) {
    localStorage.setItem(NOTE_KEY, JSON.stringify([...this.all().filter(item => item.sessionId !== note.sessionId), note]));
  },
  remove(sessionId: string) {
    localStorage.setItem(NOTE_KEY, JSON.stringify(this.all().filter(item => item.sessionId !== sessionId)));
  },
  replaceAll(notes: SessionNote[]) { localStorage.setItem(NOTE_KEY, JSON.stringify(notes)); },
  clear() { localStorage.removeItem(NOTE_KEY); },
};

/* --------------------------------------------------- journal entry (92) */

export interface JournalEntry {
  sessionId: string; startedAt: string; durationMinutes: number;
  attempts: number; accuracy: number; skills: string[]; conditions: string[];
  improvement?: string; confusions: string[]; retention: string[]; transfer?: string;
  nextTarget?: string; note?: SessionNote;
}

export interface JournalInput {
  attempts: Attempt[]; sessions: Session[]; notes?: SessionNote[];
  probes?: RetentionProbe[]; nextTarget?: string; now?: number;
}

const rate = (items: Attempt[]) => items.length ? items.filter(item => item.correct).length / items.length : 0;
const percent = (value: number) => `${Math.round(value * 100)}%`;

/**
 * The spec's journal entry, assembled from measured evidence. The user's own note
 * is carried alongside it and never folded into the numbers.
 */
export function journalEntry(sessionId: string, input: JournalInput): JournalEntry {
  const { attempts, sessions, notes = [], probes = [], nextTarget, now = Date.now() } = input;
  const evidence = attempts.filter(item => item.sessionId === sessionId);
  const session = sessions.find(item => item.id === sessionId);
  const startedAt = session?.startedAt ?? evidence[0]?.timestamp ?? new Date(now).toISOString();
  const ended = session?.endedAt ? Date.parse(session.endedAt) : (evidence.length ? Date.parse(evidence[evidence.length - 1].timestamp) : now);
  const skills = [...new Set(evidence.map(item => item.exercise))];

  // Improvement is only claimed where the conditions match and there is enough of
  // it to mean anything — a rise off three attempts is noise, not a gain.
  const improvements = summarizeSkills(evidence)
    .filter(skill => skill.comparisonEvidence >= 8 && skill.recentAccuracy - skill.earlierAccuracy >= .1)
    .sort((a, b) => (b.recentAccuracy - b.earlierAccuracy) - (a.recentAccuracy - a.earlierAccuracy));
  const best = improvements[0];

  const resolved = probes.filter(probe => probe.completedAt && evidence.some(item => item.retentionProbeId === probe.id));
  const transferAttempts = evidence.filter(item => item.transferCategory === 'real-music');

  return {
    sessionId, startedAt,
    durationMinutes: Math.max(0, Math.round((ended - Date.parse(startedAt)) / 60_000)),
    attempts: evidence.length, accuracy: rate(evidence), skills,
    conditions: [...new Set(evidence.flatMap(item => Object.entries(item.difficulty).map(([key, value]) => `${key}=${String(value)}`)))].sort(),
    improvement: best ? `${best.exercise.replaceAll('-', ' ')} ${percent(best.earlierAccuracy)} → ${percent(best.recentAccuracy)} over ${best.comparisonEvidence} matched attempts` : undefined,
    confusions: confusionPairs(evidence).slice(0, 3).map(item => `${item.pair} ×${item.count}`),
    retention: resolved.map(probe => `${probe.exercise.replaceAll('-', ' ')} ${probe.passed ? 'held' : 'lapsed'} at ${probe.intervalDays} day${probe.intervalDays === 1 ? '' : 's'}`),
    transfer: transferAttempts.length ? `${percent(rate(transferAttempts))} across ${transferAttempts.length} real-music attempts` : undefined,
    nextTarget, note: notes.find(item => item.sessionId === sessionId),
  };
}

/** The prose form the spec models: factual, one paragraph, no score. */
export function renderEntry(entry: JournalEntry): string {
  const when = new Date(entry.startedAt);
  const parts = [`${when.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} — ${entry.durationMinutes} min, ${entry.attempts} graded attempt${entry.attempts === 1 ? '' : 's'} at ${percent(entry.accuracy)}.`];
  if (entry.skills.length) parts.push(`Practiced ${entry.skills.map(skill => skill.replaceAll('-', ' ')).join(', ')}.`);
  if (entry.improvement) parts.push(`${entry.improvement}.`);
  if (entry.confusions.length) parts.push(`Recurring: ${entry.confusions.join('; ')}.`);
  if (entry.retention.length) parts.push(`Retention: ${entry.retention.join('; ')}.`);
  if (entry.transfer) parts.push(`Real music: ${entry.transfer}.`);
  if (entry.nextTarget) parts.push(`Next: ${entry.nextTarget.replaceAll('-', ' ')}.`);
  if (entry.note?.perceived) parts.push(`Felt ${entry.note.perceived} than expected.`);
  // The user's own words are kept verbatim; only a closing stop is added, and
  // only when they did not write one themselves.
  const stopped = (text: string) => /[.!?…]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`;
  if (entry.note?.note) parts.push(`Note: ${stopped(entry.note.note)}`);
  if (entry.note?.observation) parts.push(`Observed: ${stopped(entry.note.observation)}`);
  return parts.join(' ');
}

/** Every session that produced graded evidence, newest first. */
export function journal(input: JournalInput): JournalEntry[] {
  const ids = [...new Set(input.attempts.map(item => item.sessionId).filter((id): id is string => Boolean(id)))];
  return ids.map(id => journalEntry(id, input)).sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
}
