import type { PitchEstimate } from './pitchDetection';
import { chord, CHROMATIC_DEGREES, CHROMATIC_STEPS, liftAboveMud, NOTE_NAMES, seededRandom } from './theory';

export type ProductionKind = 'scale-degree-production' | 'interval-production';
export interface ProductionPrompt {
  kind: ProductionKind; tonicMidi: number; targetMidi: number; answer: string;
  instruction: string; contextNotes: number[]; referenceNotes: number[];
}

const INTERVAL_NAMES = ['unison', 'minor 2nd', 'major 2nd', 'minor 3rd', 'major 3rd', 'perfect 4th', 'tritone', 'perfect 5th', 'minor 6th', 'major 6th', 'minor 7th', 'major 7th', 'octave'];

/**
 * Production asks the user to generate a pitch rather than recognise one, which
 * is stronger evidence than picking from a list.
 */
export function generateProduction(seed: number, kind: ProductionKind, options: { comfortableMidi?: number } = {}): ProductionPrompt {
  const random = seededRandom(seed);
  const tonicMidi = (options.comfortableMidi ?? 48) + Math.floor(random() * 12);
  const context = liftAboveMud(chord(tonicMidi, 'major').map(note => note.midiNumber));
  if (kind === 'scale-degree-production') {
    const degree = 1 + Math.floor(random() * (CHROMATIC_STEPS.length - 1));
    return {
      kind, tonicMidi, targetMidi: tonicMidi + CHROMATIC_STEPS[degree], answer: CHROMATIC_DEGREES[degree],
      instruction: `Sing scale degree ${CHROMATIC_DEGREES[degree]} above the tonic.`,
      contextNotes: context, referenceNotes: [tonicMidi],
    };
  }
  const size = 1 + Math.floor(random() * 12);
  const ascending = random() > .35;
  return {
    kind, tonicMidi, targetMidi: tonicMidi + (ascending ? size : -size), answer: `${INTERVAL_NAMES[size]} ${ascending ? 'above' : 'below'}`,
    instruction: `Sing a ${INTERVAL_NAMES[size]} ${ascending ? 'above' : 'below'} the given note.`,
    contextNotes: [tonicMidi], referenceNotes: [tonicMidi],
  };
}

/** Signed cents from the target, folded into the nearest octave when equivalence is allowed. */
export function centsFromTarget(estimate: PitchEstimate, targetMidi: number, octaveEquivalent = true) {
  const sung = estimate.midi + estimate.cents / 100;
  let distance = sung - targetMidi;
  if (octaveEquivalent) {
    distance = ((distance % 12) + 12) % 12;
    if (distance > 6) distance -= 12;
  }
  return Math.round(distance * 100);
}

/**
 * Returns undefined when the detector is not confident, so a detector failure is
 * never recorded as a user error.
 */
export function gradeProduction(estimate: PitchEstimate | undefined, targetMidi: number, toleranceCents: number, octaveEquivalent = true) {
  if (!estimate || estimate.confidence < .75) return undefined;
  return Math.abs(centsFromTarget(estimate, targetMidi, octaveEquivalent)) <= toleranceCents;
}

export const noteLabel = (midi: number) => `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
