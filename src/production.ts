import { buildProgression, PROGRESSIONS } from './harmony';
import type { PitchEstimate } from './pitchDetection';
import { chord, CHROMATIC_DEGREES, CHROMATIC_STEPS, liftAboveMud, NOTE_NAMES, seededRandom, seventhChord } from './theory';

export type ProductionKind =
  | 'scale-degree-production' | 'interval-production'
  | 'chord-tone-production' | 'guide-tone-production' | 'root-motion-production';
export interface ProductionPrompt {
  kind: ProductionKind; tonicMidi: number; targetMidi: number; answer: string;
  instruction: string; contextNotes: number[]; referenceNotes: number[];
  /** Harmonic context played before the prompt, for the progression-based kinds. */
  contextChords?: number[][];
}

const SEVENTH_MEMBERS = [
  { index: 0, label: 'root' }, { index: 1, label: '3rd' }, { index: 2, label: '5th' }, { index: 3, label: '7th' },
] as const;
/** Guide tones are the 3rd and 7th — the voices that carry functional motion. */
const GUIDE_TONES = [1, 3] as const;

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
  if (kind === 'chord-tone-production') {
    const quality = (['major 7', 'dominant 7', 'minor 7'] as const)[Math.floor(random() * 3)];
    const notes = seventhChord(tonicMidi, quality).map(note => note.midiNumber);
    const member = SEVENTH_MEMBERS[Math.floor(random() * SEVENTH_MEMBERS.length)];
    return {
      kind, tonicMidi, targetMidi: notes[member.index], answer: `${member.label} of ${NOTE_NAMES[tonicMidi % 12]}${quality}`,
      instruction: `Sing the ${member.label} of this chord.`,
      contextNotes: liftAboveMud(notes), referenceNotes: liftAboveMud(notes),
    };
  }
  if (kind === 'guide-tone-production' || kind === 'root-motion-production') {
    const template = PROGRESSIONS[Math.floor(random() * PROGRESSIONS.length)];
    const progression = buildProgression(tonicMidi % 12, template);
    const position = Math.floor(random() * progression.chords.length);
    const chordNotes = [...progression.chords[position]].sort((a, b) => a - b);
    const romans = progression.roman.split(' – ');
    if (kind === 'root-motion-production') {
      return {
        kind, tonicMidi, targetMidi: chordNotes[0], answer: `root of ${romans[position]}`,
        instruction: `Sing the root of chord ${position + 1} of ${romans.length}.`,
        contextNotes: progression.chords[0], referenceNotes: chordNotes,
        contextChords: progression.chords,
      };
    }
    const guide = GUIDE_TONES[Math.floor(random() * GUIDE_TONES.length)];
    const target = chordNotes[Math.min(guide, chordNotes.length - 1)];
    return {
      kind, tonicMidi, targetMidi: target, answer: `${guide === 1 ? '3rd' : '7th'} of ${romans[position]}`,
      instruction: `Sing the ${guide === 1 ? '3rd' : '7th'} of chord ${position + 1} of ${romans.length}.`,
      contextNotes: progression.chords[0], referenceNotes: chordNotes,
      contextChords: progression.chords,
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
