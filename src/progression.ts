/**
 * Dated record of completed days, and the standing derived from it.
 *
 * Attempts are already stored, but an attempt log cannot answer "did I do my
 * work today?" — it only grows. A day is either done on a given calendar date or
 * it is not, and that is what a streak, a grade and a sense of progress are all
 * built from.
 */

export interface DayRecord {
  /** The numbered day on the pathway, not a date. */
  day: number;
  /** Local calendar date, YYYY-MM-DD — the day the learner experienced, not UTC. */
  date: string;
  correct: number;
  total: number;
  /** Median response time, kept because speed is the other half of fluency. */
  medianLatencyMs: number;
}

/** Local date rather than ISO, so a late-night session counts as that night. */
export function localDate(at: number | Date = Date.now()): string {
  const date = at instanceof Date ? at : new Date(at);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const shiftDate = (date: string, days: number) => {
  const [year, month, day] = date.split('-').map(Number);
  return localDate(new Date(year, month - 1, day + days));
};

export type Grade = 'A' | 'B' | 'C' | 'D';

/**
 * Bands are deliberately generous at the bottom. A grade here reports how a
 * session went; it never gates anything, and a hard day should not read as
 * failure when the difficulty is being tuned toward the edge of ability anyway.
 */
export function gradeFor(accuracy: number): Grade {
  if (accuracy >= .9) return 'A';
  if (accuracy >= .75) return 'B';
  if (accuracy >= .6) return 'C';
  return 'D';
}

export interface Standing {
  completedDays: number;
  /** Consecutive calendar days worked, counting back from today. */
  streak: number;
  /** Distinct days worked in the last fortnight — a fairer picture than a streak. */
  recentDaysWorked: number;
  doneToday: boolean;
  lastGrade?: Grade;
}

export function standing(records: readonly DayRecord[], today = localDate()): Standing {
  const byDay = [...records].sort((a, b) => a.day - b.day);
  const dates = new Set(records.map(record => record.date));
  // A streak may end yesterday and still be alive: today is not missed until it
  // is over. Counting from today when today is empty would zero it at midnight.
  let cursor = dates.has(today) ? today : shiftDate(today, -1);
  let streak = 0;
  while (dates.has(cursor)) { streak += 1; cursor = shiftDate(cursor, -1); }
  const fortnight = new Set<string>();
  for (let back = 0; back < 14; back += 1) { const date = shiftDate(today, -back); if (dates.has(date)) fortnight.add(date); }
  const last = byDay.at(-1);
  return {
    completedDays: byDay.length ? byDay.at(-1)!.day : 0,
    streak, recentDaysWorked: fortnight.size, doneToday: dates.has(today),
    lastGrade: last ? gradeFor(last.total ? last.correct / last.total : 0) : undefined,
  };
}

const KEY = 'perfect-ear-days-v1';

export const dayStore = {
  all(): DayRecord[] {
    try { const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]'); return Array.isArray(value) ? value as DayRecord[] : []; }
    catch { return []; }
  },
  /**
   * Completing a day already recorded overwrites it rather than appending, so
   * replaying a day cannot inflate the count or the streak.
   */
  complete(record: DayRecord) {
    const kept = this.all().filter(item => item.day !== record.day);
    localStorage.setItem(KEY, JSON.stringify([...kept, record].sort((a, b) => a.day - b.day)));
  },
  replaceAll(records: DayRecord[]) { localStorage.setItem(KEY, JSON.stringify(records)); },
  clear() { localStorage.removeItem(KEY); },
};
