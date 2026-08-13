export interface RetentionProbe {
  id: string; exercise: string; dueAt: string; intervalDays: number;
  sourceSessionId?: string; sourceSeed?: number; completedAt?: string; passed?: boolean;
}

const DAY_MS = 86_400_000;
/** Expanding schedule; a failure steps back down rather than resetting to zero. */
export const RETENTION_LADDER = [1, 3, 7, 16, 35] as const;

const rungFor = (intervalDays: number) => {
  let best = 0;
  RETENTION_LADDER.forEach((value, index) => { if (Math.abs(value - intervalDays) < Math.abs(RETENTION_LADDER[best] - intervalDays)) best = index; });
  return best;
};

/** Success lengthens the interval, failure shortens it. */
export function nextInterval(intervalDays: number, passed: boolean) {
  const rung = rungFor(intervalDays);
  return RETENTION_LADDER[Math.max(0, Math.min(RETENTION_LADDER.length - 1, passed ? rung + 1 : rung - 1))];
}

export function scheduleProbe(exercise: string, options: { id: string; intervalDays?: number; passed?: boolean; now?: number; sourceSessionId?: string; sourceSeed?: number }): RetentionProbe {
  const { id, intervalDays, passed, now = Date.now(), sourceSessionId, sourceSeed } = options;
  const days = intervalDays === undefined ? RETENTION_LADDER[0] : nextInterval(intervalDays, passed ?? false);
  return { id, exercise, intervalDays: days, dueAt: new Date(now + days * DAY_MS).toISOString(), sourceSessionId, sourceSeed };
}

export function dueProbes(probes: RetentionProbe[], now = Date.now()) {
  return probes.filter(probe => !probe.completedAt && Date.parse(probe.dueAt) <= now).sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
}

/**
 * Retention checks must use altered examples, never exact repeats, so the probe
 * carries the seed it came from and callers derive a different one.
 */
export function probeSeed(probe: RetentionProbe, now = Date.now()) {
  const base = probe.sourceSeed ?? Date.parse(probe.dueAt);
  return (base + Math.floor(now / DAY_MS) + 1) >>> 0;
}

const KEY = 'perfect-ear-retention-v1';
function read(): RetentionProbe[] { try { const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]'); return Array.isArray(parsed) ? parsed as RetentionProbe[] : []; } catch { return []; } }

export const retentionStore = {
  all: read,
  due: (now = Date.now()) => dueProbes(read(), now),
  upsert(probe: RetentionProbe) { localStorage.setItem(KEY, JSON.stringify([...read().filter(item => item.id !== probe.id), probe])); },
  replaceAll(probes: RetentionProbe[]) { localStorage.setItem(KEY, JSON.stringify(probes)); },
  /** Records the outcome and immediately queues the next probe for that skill. */
  complete(id: string, passed: boolean, now = Date.now()) {
    const probes = read(); const probe = probes.find(item => item.id === id);
    if (!probe) return undefined;
    const completed = { ...probe, completedAt: new Date(now).toISOString(), passed };
    const follow = scheduleProbe(probe.exercise, { id: `${probe.exercise}:${now}`, intervalDays: probe.intervalDays, passed, now, sourceSeed: probe.sourceSeed });
    localStorage.setItem(KEY, JSON.stringify([...probes.filter(item => item.id !== id), completed, follow]));
    return follow;
  },
  clear() { localStorage.removeItem(KEY); },
};
