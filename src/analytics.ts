import type { Attempt } from './storage';

export interface SkillSummary { exercise: string; attempts: number; accuracy: number; medianLatencyMs: number; mastery: 'Introduced' | 'Developing' | 'Reliable' | 'Automatic'; recentAccuracy: number; earlierAccuracy: number }
const rate = (items: Attempt[]) => items.length ? items.filter(item => item.correct).length / items.length : 0;
const median = (values: number[]) => { if (!values.length) return 0; const ordered = [...values].sort((a, b) => a - b); const middle = Math.floor(ordered.length / 2); return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2; };

export function summarizeSkills(attempts: Attempt[]): SkillSummary[] {
  return [...new Set(attempts.map(item => item.exercise))].map(exercise => {
    const evidence = attempts.filter(item => item.exercise === exercise); const split = Math.max(1, Math.floor(evidence.length / 2));
    const accuracy = rate(evidence); const medianLatencyMs = median(evidence.map(item => item.latencyMs));
    const mastery = evidence.length >= 20 && accuracy >= .9 && medianLatencyMs < 2500 ? 'Automatic' : evidence.length >= 12 && accuracy >= .8 ? 'Reliable' : evidence.length >= 4 ? 'Developing' : 'Introduced';
    return { exercise, attempts: evidence.length, accuracy, medianLatencyMs, mastery, earlierAccuracy: rate(evidence.slice(0, split)), recentAccuracy: rate(evidence.slice(split)) };
  });
}

export function confusionPairs(attempts: Attempt[]) {
  const counts = new Map<string, number>();
  attempts.filter(item => !item.correct).forEach(item => { const key = `${item.expected} → ${item.response}`; counts.set(key, (counts.get(key) ?? 0) + 1); });
  return [...counts].map(([pair, count]) => ({ pair, count })).sort((a, b) => b.count - a.count);
}
