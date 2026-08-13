import type { WeightedConfusion } from './adaptive';
import { generateStimulus, type DrillConfig, type ExerciseKind, type Stimulus } from './training';

export interface ContrastPair { exercise: string; kind: ExerciseKind; a: string; b: string; pressure: number }

const kindOf = (exercise: string): ExerciseKind | undefined => {
  const stripped = exercise.replace(/-recognition$/, '');
  return stripped as ExerciseKind;
};

/**
 * Confusions worth drilling directly. The spec escalates to a clean A/B contrast
 * once a pair recurs above threshold, rather than only nudging the whole skill up
 * the priority list.
 */
export function contrastCandidates(confusions: WeightedConfusion[], threshold = .15): ContrastPair[] {
  return confusions
    .filter(item => item.recentRate >= threshold && item.expected !== item.answered)
    .map(item => ({ exercise: item.exercise, kind: kindOf(item.exercise)!, a: item.expected, b: item.answered, pressure: item.recentRate }))
    .filter(item => Boolean(item.kind))
    .sort((first, second) => second.pressure - first.pressure);
}

/** A drill narrowed to exactly the two confused labels. */
export function contrastConfig(base: DrillConfig, pair: ContrastPair): DrillConfig {
  return { ...base, kind: pair.kind, only: [pair.a, pair.b] };
}

export interface Comparison { heard: Stimulus; alternative: Stimulus; shared: number[]; differing: number[] }

/**
 * Builds the "expected versus what you chose" pair for error replay. Both are
 * generated from the same seed, so they sit on the same root and differ only in
 * the thing being confused — which is what makes the difference audible.
 */
export function buildComparison(seed: number, config: DrillConfig, heardAnswer: string, chosenAnswer: string): Comparison | undefined {
  if (heardAnswer === chosenAnswer) return undefined;
  const heard = generateStimulus(seed, { ...config, only: [heardAnswer] });
  const alternative = generateStimulus(seed, { ...config, only: [chosenAnswer] });
  if (heard.answer !== heardAnswer || alternative.answer !== chosenAnswer) return undefined;
  const heardSet = new Set(heard.notes);
  const otherSet = new Set(alternative.notes);
  return {
    heard, alternative,
    shared: heard.notes.filter(note => otherSet.has(note)),
    // The tones that actually separate the two answers, isolated for playback.
    differing: [...heard.notes.filter(note => !otherSet.has(note)), ...alternative.notes.filter(note => !heardSet.has(note))].sort((a, b) => a - b),
  };
}
