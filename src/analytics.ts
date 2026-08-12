import { masteryFor, type Mastery } from './adaptive';
import type { Attempt } from './storage';

export type { Mastery };
export interface SkillSummary { exercise: string; attempts: number; accuracy: number; medianLatencyMs: number; mastery: Mastery; recentAccuracy: number; earlierAccuracy: number; comparisonEvidence: number; condition: string }
export interface SessionSummary { attempts: number; correct: number; accuracy: number; medianLatencyMs: number; focus: string[]; confusions: { pair: string; count: number }[] }
const rate = (items: Attempt[]) => items.length ? items.filter(item => item.correct).length / items.length : 0;
const median = (values: number[]) => { if (!values.length) return 0; const ordered = [...values].sort((a, b) => a - b); const middle = Math.floor(ordered.length / 2); return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2; };
const conditionKey = (attempt: Attempt) => JSON.stringify(Object.entries(attempt.difficulty).sort(([a], [b]) => a.localeCompare(b)));

export function confusionPairs(attempts: Attempt[]) {
  const counts = new Map<string, number>();
  attempts.filter(item => !item.correct).forEach(item => { const key = `${item.expected} → ${item.response}`; counts.set(key, (counts.get(key) ?? 0) + 1); });
  return [...counts].map(([pair, count]) => ({ pair, count })).sort((a, b) => b.count - a.count);
}

export function summarizeSkills(attempts: Attempt[]): SkillSummary[] {
  return [...new Set(attempts.map(item => item.exercise))].map(exercise => {
    const evidence = attempts.filter(item => item.exercise === exercise); const accuracy = rate(evidence); const medianLatencyMs = median(evidence.map(item => item.latencyMs));
    // No retention/transfer context here, so this is the plain synthetic ladder;
    // adaptive.skillStates() applies the stricter gating.
    const mastery: Mastery = masteryFor({ attempts: evidence.length, accuracy, medianLatencyMs });
    const currentCondition = conditionKey(evidence[evidence.length - 1]); const compatible = evidence.filter(item => conditionKey(item) === currentCondition); const split = Math.max(1, Math.floor(compatible.length / 2));
    return { exercise, attempts: evidence.length, accuracy, medianLatencyMs, mastery, earlierAccuracy: rate(compatible.slice(0, split)), recentAccuracy: rate(compatible.slice(split)), comparisonEvidence: compatible.length, condition: currentCondition };
  });
}

export function summarizeSession(attempts: Attempt[], sessionId: string): SessionSummary {
  const evidence = attempts.filter(item => item.sessionId === sessionId);
  return { attempts: evidence.length, correct: evidence.filter(item => item.correct).length, accuracy: rate(evidence), medianLatencyMs: median(evidence.map(item => item.latencyMs)), focus: [...new Set(evidence.map(item => item.exercise))], confusions: confusionPairs(evidence).slice(0, 3) };
}

export function capabilityMilestones(attempts: Attempt[]) {
  return summarizeSkills(attempts).filter(skill => skill.mastery === 'Reliable' || skill.mastery === 'Automatic').map(skill => ({ skill: skill.exercise, label: skill.mastery, statement: `${skill.mastery} ${skill.exercise.replaceAll('-', ' ')}: ${Math.round(skill.accuracy * 100)}% across ${skill.attempts} attempts`, evidenceCount: skill.attempts }));
}
