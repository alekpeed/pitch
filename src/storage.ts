export interface Attempt { id: string; timestamp: string; exercise: string; stimulus: Record<string, unknown>; expected: string; response: string; correct: boolean; latencyMs: number; difficulty: Record<string, unknown>; replayCount: number }
const KEY = 'perfect-ear-attempts-v1';
export const attemptStore = {
  all(): Attempt[] { try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') as Attempt[]; } catch { return []; } },
  add(attempt: Attempt) { const attempts = this.all(); attempts.push(attempt); localStorage.setItem(KEY, JSON.stringify(attempts)); },
  clear() { localStorage.removeItem(KEY); }
};
