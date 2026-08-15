import type { SkillState } from './adaptive';
import { HARMONY_EXERCISES, PRODUCTION_EXERCISES, TRANSFER_EXERCISES, VOICING_EXERCISES } from './curriculum';

/**
 * The progression spine: what is available to practise, and in what order.
 *
 * This is deliberately separate from the genre profiles in curriculum.ts. A
 * profile *reorders* practice toward a style and never removes anything; a
 * section *gates* it. Only the sections you have cleared, plus the one you are
 * working on, can be scheduled at all — so the app stops presenting its whole
 * catalogue at once and starts behaving like a course.
 *
 * Order runs foundations upward, and each section only asks for material the
 * ones before it have already made reliable.
 */

export interface Section {
  id: string;
  name: string;
  /** What clearing this section should leave you able to hear, in plain language. */
  goal: string;
  exercises: readonly string[];
}

export const SECTIONS: readonly Section[] = [
  {
    id: 'foundations',
    name: 'Foundations',
    goal: 'Place a note against a tonic you have just heard, and name the distance between two notes.',
    exercises: ['interval-recognition', 'scale-degree-recognition'],
  },
  {
    id: 'triads',
    name: 'Triads',
    goal: 'Hear a chord’s quality instantly, and hear which of its notes is in the bass.',
    exercises: ['triad-recognition', 'bass-recognition'],
  },
  {
    id: 'sevenths',
    name: 'Sevenths and function',
    goal: 'Tell the seventh qualities apart, and hear what a chord is doing in a key rather than only what it is called.',
    exercises: ['seventh-recognition', 'tonal-center-recognition', 'harmony-function'],
  },
  {
    id: 'colour',
    name: 'Colour',
    goal: 'Name the tone that colours a chord, and hear a mode by its characteristic degree.',
    exercises: ['mode-recognition', 'extension-recognition', 'altered-recognition'],
  },
  {
    id: 'inside-the-chord',
    name: 'Inside the chord',
    goal: 'Hear how a chord is built and arranged — its spacing, its parts, and which voice moved.',
    exercises: ['decomposition-recognition', 'slash-chord-recognition', ...VOICING_EXERCISES.filter(id => id !== 'inner-voice-reproduction')],
  },
  {
    id: 'memory',
    name: 'Memory and full harmony',
    goal: 'Hold harmony in your head across a gap and across several bars, and follow a key change.',
    exercises: ['delayed-comparison-recognition', 'multibar-memory-recognition', ...HARMONY_EXERCISES.filter(id => id !== 'harmony-function')],
  },
  {
    id: 'production',
    name: 'Production',
    goal: 'Reproduce what you hear instead of only recognising it.',
    exercises: [...PRODUCTION_EXERCISES, 'inner-voice-reproduction'],
  },
  {
    id: 'transfer',
    name: 'Transfer',
    goal: 'Use all of it on real music, under conditions nothing here controls.',
    exercises: [...TRANSFER_EXERCISES],
  },
];

/**
 * The bar for "cleared". Reliable is the app's existing evidence threshold, and
 * it already requires a passed retention probe and more than one condition — so
 * a section cannot be cleared by one lucky sitting.
 */
const MET: ReadonlySet<string> = new Set(['Reliable', 'Automatic', 'Transferred']);

/**
 * Clearing requires most of a section rather than all of it. One stubborn drill
 * should not wall off the rest of the app indefinitely; it keeps being scheduled
 * as a weakness inside the sections that stay unlocked.
 */
export const CLEAR_FRACTION = .75;

export interface SectionStatus {
  section: Section; index: number;
  met: string[]; outstanding: string[];
  /** Cleared exercises over total: the section's score. */
  score: number;
  cleared: boolean;
  unlocked: boolean;
  /** The section being worked on now — the first that is unlocked but not cleared. */
  current: boolean;
}

/**
 * Section standing, in order. A section unlocks when the one before it clears,
 * so exactly one uncleared section is ever open: the frontier.
 */
export function sectionProgress(states: readonly SkillState[]): SectionStatus[] {
  const masteryOf = (exercise: string) => states.find(state => state.exercise === exercise)?.mastery ?? '';
  let previousCleared = true;
  let frontierTaken = false;
  return SECTIONS.map((section, index) => {
    const met = section.exercises.filter(exercise => MET.has(masteryOf(exercise)));
    const score = section.exercises.length ? met.length / section.exercises.length : 1;
    const unlocked = previousCleared;
    const cleared = unlocked && score >= CLEAR_FRACTION;
    const current = unlocked && !cleared && !frontierTaken;
    if (current) frontierTaken = true;
    previousCleared = cleared;
    return {
      section, index, met: [...met],
      outstanding: section.exercises.filter(exercise => !met.includes(exercise)),
      score, cleared, unlocked, current,
    };
  });
}

/** The section being worked on, or the last one once the whole spine is cleared. */
export function currentSection(states: readonly SkillState[]): SectionStatus {
  const progress = sectionProgress(states);
  return progress.find(status => status.current) ?? progress[progress.length - 1];
}

/**
 * Everything schedulable right now: the current section plus everything already
 * cleared, so earlier material stays available for retention and review instead
 * of disappearing the moment it is passed.
 */
export function unlockedExercises(states: readonly SkillState[]): string[] {
  return sectionProgress(states).filter(status => status.unlocked).flatMap(status => [...status.section.exercises]);
}

/** Which section an exercise belongs to, for labelling it in a list. */
export function sectionOf(exercise: string): Section | undefined {
  return SECTIONS.find(section => section.exercises.includes(exercise));
}
