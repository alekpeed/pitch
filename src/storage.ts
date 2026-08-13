export type TransferCategory = 'synthetic' | 'semi-realistic' | 'real-music';
/** Optional self-report, used only to measure calibration against outcomes. */
export type Confidence = 'guess' | 'unsure' | 'sure';
/** Absent transferCategory reads as 'synthetic', so existing records stay valid. */
export interface Attempt { id: string; sessionId?: string; timestamp: string; exercise: string; stimulus: Record<string, unknown>; expected: string; response: string; correct: boolean; latencyMs: number; difficulty: Record<string, unknown>; replayCount: number; transferCategory?: TransferCategory; retentionProbeId?: string; confidence?: Confidence }
export interface Session { id: string; startedAt: string; endedAt?: string; mode: 'practice' | 'harmony' | 'mixed' }
const ATTEMPT_KEY = 'perfect-ear-attempts-v1';
const SESSION_KEY = 'perfect-ear-sessions-v1';
function read<T>(key: string): T[] { try { const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]'); return Array.isArray(value) ? value as T[] : []; } catch { return []; } }
export const attemptStore = {
  all: (): Attempt[] => read<Attempt>(ATTEMPT_KEY),
  add(attempt: Attempt) { localStorage.setItem(ATTEMPT_KEY, JSON.stringify([...this.all(), attempt])); },
  clear() { localStorage.removeItem(ATTEMPT_KEY); }
};
export const sessionStore = {
  all: (): Session[] => read<Session>(SESSION_KEY),
  add(session: Session) { if (!this.all().some(item => item.id === session.id)) localStorage.setItem(SESSION_KEY, JSON.stringify([...this.all(), session])); },
  finish(id: string, endedAt: string) { localStorage.setItem(SESSION_KEY, JSON.stringify(this.all().map(item => item.id === id ? { ...item, endedAt } : item))); },
  clear() { localStorage.removeItem(SESSION_KEY); }
};
