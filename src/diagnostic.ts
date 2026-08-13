import { configAtLevel, MAX_DIFFICULTY_LEVEL } from './adaptive';
import type { DrillConfig, ExerciseKind } from './training';

export interface SkillBracket {
  exercise: ExerciseKind;
  /** Highest level demonstrated, and lowest level failed. */
  passed: number; failed: number;
  level: number; items: number; done: boolean;
}
export interface DiagnosticState { brackets: SkillBracket[]; index: number; maxItemsPerSkill: number }
export interface DiagnosticEstimate { exercise: ExerciseKind; level: number; config: DrillConfig; items: number; bracketed: boolean; ceilingKnown: boolean }

const START_LEVEL = 3;
const NOT_PASSED = -1;
const NOT_FAILED = MAX_DIFFICULTY_LEVEL + 1;

export function startDiagnostic(kinds: readonly ExerciseKind[], maxItemsPerSkill = 5): DiagnosticState {
  return {
    brackets: kinds.map(exercise => ({ exercise, passed: NOT_PASSED, failed: NOT_FAILED, level: START_LEVEL, items: 0, done: false })),
    index: 0, maxItemsPerSkill,
  };
}

/** A skill is finished once its ceiling is bracketed to a single step. */
const bracketed = (bracket: SkillBracket) => bracket.failed - bracket.passed <= 1;

/**
 * Doubling probe upward while nothing has failed yet, then bisection. Strong
 * performance escapes easy material quickly; an error drops straight into a local
 * probe rather than continuing to climb.
 */
function nextLevel(bracket: SkillBracket): number {
  if (bracket.failed > MAX_DIFFICULTY_LEVEL) return Math.min(MAX_DIFFICULTY_LEVEL, Math.max(bracket.level + 1, bracket.level * 2));
  const midpoint = Math.floor((bracket.passed + bracket.failed) / 2);
  return Math.max(0, Math.min(MAX_DIFFICULTY_LEVEL, midpoint));
}

export function currentProbe(state: DiagnosticState) {
  const bracket = state.brackets[state.index];
  if (!bracket || bracket.done) return undefined;
  return { exercise: bracket.exercise, level: bracket.level, config: configAtLevel(bracket.exercise, bracket.level) };
}

export function recordDiagnostic(state: DiagnosticState, correct: boolean): DiagnosticState {
  const brackets = state.brackets.map((bracket, index) => {
    if (index !== state.index || bracket.done) return bracket;
    const updated: SkillBracket = {
      ...bracket,
      items: bracket.items + 1,
      passed: correct ? Math.max(bracket.passed, bracket.level) : bracket.passed,
      failed: correct ? bracket.failed : Math.min(bracket.failed, bracket.level),
    };
    updated.done = bracketed(updated) || updated.items >= state.maxItemsPerSkill;
    updated.level = updated.done ? updated.level : nextLevel(updated);
    return updated;
  });
  // Advance to the next unfinished skill, wrapping so skills interleave rather
  // than running one to exhaustion before the next begins.
  let index = state.index;
  for (let step = 1; step <= brackets.length; step += 1) {
    const candidate = (state.index + step) % brackets.length;
    if (!brackets[candidate].done) { index = candidate; break; }
    index = candidate;
  }
  return { ...state, brackets, index };
}

export const diagnosticComplete = (state: DiagnosticState) => state.brackets.every(bracket => bracket.done);
export const diagnosticProgress = (state: DiagnosticState) => ({
  answered: state.brackets.reduce((total, bracket) => total + bracket.items, 0),
  remaining: state.brackets.filter(bracket => !bracket.done).length,
});

/**
 * The result is a per-skill envelope, never one placement level. `ceilingKnown`
 * separates a real ceiling from a skill that simply ran out of items.
 */
export function diagnosticEstimate(state: DiagnosticState): DiagnosticEstimate[] {
  return state.brackets.map(bracket => {
    const level = Math.max(0, bracket.passed);
    return {
      exercise: bracket.exercise, level, config: configAtLevel(bracket.exercise, level),
      items: bracket.items, bracketed: bracketed(bracket), ceilingKnown: bracket.failed <= MAX_DIFFICULTY_LEVEL,
    };
  });
}

const KEY = 'perfect-ear-diagnostic-v1';
export interface StoredDiagnostic { completedAt: string; levels: Record<string, number> }

export const diagnosticStore = {
  latest(): StoredDiagnostic | undefined {
    try { const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null'); return parsed && typeof parsed === 'object' ? parsed as StoredDiagnostic : undefined; }
    catch { return undefined; }
  },
  save(estimates: DiagnosticEstimate[], now = Date.now()) {
    const levels = Object.fromEntries(estimates.map(estimate => [estimate.exercise, estimate.level]));
    localStorage.setItem(KEY, JSON.stringify({ completedAt: new Date(now).toISOString(), levels }));
  },
  clear() { localStorage.removeItem(KEY); },
};
