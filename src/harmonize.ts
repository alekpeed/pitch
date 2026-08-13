import { buildProgression, PROGRESSIONS } from './harmony';
import { chord, NOTE_NAMES, seededRandom, seventhChord } from './theory';

/* ------------------------------------------------- melody over harmony (61) */

export interface MelodyOverChordTask {
  keyPitchClass: number; roman: string; chordNotes: number[]; melodyNote: number;
  answer: string; options: string[]; melodyRole: string;
}

const DEGREE_NAMES: Record<number, string> = {
  0: 'root', 2: '9th', 3: '♭3rd', 4: '3rd', 5: '11th', 6: '♯11th',
  7: '5th', 8: '♭13th', 9: '13th', 10: '♭7th', 11: '7th', 1: '♭9th',
};

/** Which tone of the chord the melody is sitting on — the thing that makes this hard. */
export const melodyRole = (melodyNote: number, chordRoot: number) =>
  DEGREE_NAMES[(((melodyNote - chordRoot) % 12) + 12) % 12] ?? 'colour tone';

/** Also a C, and an octave clear of the harmony so the melody always sits on top. */
const MELODY_BASE = 72;
const HARMONY_CHOICES = ['I', 'ii7', 'iii7', 'IV', 'V7', 'vi', 'viiø7'] as const;
const CHOICE_OFFSETS: Record<string, number> = { I: 0, ii7: 2, iii7: 4, IV: 5, V7: 7, vi: 9, 'viiø7': 11 };
const CHOICE_QUALITY: Record<string, 'major' | 'minor 7' | 'dominant 7' | 'half-diminished 7'> = {
  I: 'major', ii7: 'minor 7', iii7: 'minor 7', IV: 'major', V7: 'dominant 7', vi: 'minor 7', 'viiø7': 'half-diminished 7',
};

/**
 * `base` must be a C: roman offsets are degrees above the tonic, so anchoring on
 * any other pitch class transposes the chord away from the key it names. The root
 * is folded into one octave so the harmony stays under the melody.
 */
export function buildDiatonicChord(keyPitchClass: number, roman: string, base = 48): number[] {
  const root = base + ((keyPitchClass + CHOICE_OFFSETS[roman]) % 12);
  const quality = CHOICE_QUALITY[roman];
  return quality === 'major'
    ? chord(root, 'major').map(note => note.midiNumber)
    : seventhChord(root, quality).map(note => note.midiNumber);
}

export function generateMelodyOverChord(seed: number): MelodyOverChordTask {
  const random = seededRandom(seed);
  const keyPitchClass = Math.floor(random() * 12);
  const roman = HARMONY_CHOICES[Math.floor(random() * HARMONY_CHOICES.length)];
  const chordNotes = buildDiatonicChord(keyPitchClass, roman);
  const root = chordNotes[0];
  // The melody is often a tension rather than a chord tone, so the harmony has to
  // be heard underneath it instead of read off the top note.
  const colours = [0, 2, 4, 5, 7, 9, 11];
  const colour = colours[Math.floor(random() * colours.length)];
  const melodyNote = MELODY_BASE + ((root + colour) % 12);
  return {
    keyPitchClass, roman, chordNotes, melodyNote, answer: roman,
    options: [...HARMONY_CHOICES], melodyRole: melodyRole(melodyNote, root),
  };
}

/* ------------------------------------------------------- harmonization (62) */

export interface HarmonizationChoice { roman: string; valid: boolean; reason: string }
export interface HarmonizationTask { keyPitchClass: number; melody: number[]; options: readonly string[] }

/** Extensions a melody note may occupy without clashing, beyond the chord tones. */
const SUPPORTED_TENSIONS = [2, 9, 5, 14];

/**
 * Several harmonisations of one melody note are defensible, so a choice is judged
 * on whether the note is genuinely supported — a chord tone or a usable tension —
 * not on matching a single expected answer.
 */
export function judgeHarmonization(melodyNote: number, keyPitchClass: number, roman: string): HarmonizationChoice {
  const notes = buildDiatonicChord(keyPitchClass, roman);
  const root = notes[0];
  const interval = (((melodyNote - root) % 12) + 12) % 12;
  const chordTones = notes.map(note => (((note - root) % 12) + 12) % 12);
  if (chordTones.includes(interval)) return { roman, valid: true, reason: `melody is the ${melodyRole(melodyNote, root)}` };
  if (SUPPORTED_TENSIONS.includes(interval)) return { roman, valid: true, reason: `melody is the ${melodyRole(melodyNote, root)}, a usable tension` };
  return { roman, valid: false, reason: `melody is the ${melodyRole(melodyNote, root)}, which clashes` };
}

export function generateHarmonization(seed: number, length = 4): HarmonizationTask {
  const random = seededRandom(seed);
  const keyPitchClass = Math.floor(random() * 12);
  const scale = [0, 2, 4, 5, 7, 9, 11];
  const melody = Array.from({ length }, () => MELODY_BASE + ((keyPitchClass + scale[Math.floor(random() * scale.length)]) % 12));
  return { keyPitchClass, melody, options: HARMONY_CHOICES };
}

export function gradeHarmonization(task: HarmonizationTask, chosen: readonly string[]) {
  const judgements = task.melody.map((note, index) =>
    chosen[index] ? judgeHarmonization(note, task.keyPitchClass, chosen[index]) : { roman: '', valid: false, reason: 'no chord chosen' });
  const valid = judgements.filter(item => item.valid).length;
  return { judgements, valid, total: task.melody.length, allValid: valid === task.melody.length };
}

/* ----------------------------------------------------- reharmonization (63) */

export interface Substitution {
  id: string; label: string; appliesTo: string; result: string; explanation: string;
  /** Semitones above the tonic, and the quality the substitute is actually built with. */
  offset: number; quality: 'major' | 'minor 7' | 'dominant 7' | 'diminished 7';
}

export const SUBSTITUTIONS: readonly Substitution[] = [
  { id: 'tritone substitution', label: 'Tritone substitution', appliesTo: 'V7', result: '♭II7', offset: 1, quality: 'dominant 7', explanation: 'Shares the tritone with V7 and resolves down by a semitone.' },
  { id: 'backdoor dominant', label: 'Backdoor dominant', appliesTo: 'V7', result: '♭VII7', offset: 10, quality: 'dominant 7', explanation: 'Approaches the tonic from the flat side instead of the dominant.' },
  { id: 'modal mixture', label: 'Modal mixture', appliesTo: 'IV', result: 'iv', offset: 5, quality: 'minor 7', explanation: 'Borrows the minor subdominant for a darker approach.' },
  { id: 'passing diminished', label: 'Passing diminished', appliesTo: 'I', result: '♯iº7', offset: 1, quality: 'diminished 7', explanation: 'Steps chromatically between I and ii.' },
  { id: 'relative substitution', label: 'Relative substitution', appliesTo: 'I', result: 'vi', offset: 9, quality: 'minor 7', explanation: 'Shares three tones with the tonic and softens the arrival.' },
];

/** Valid only where the substitution actually applies to the chord in that slot. */
export function judgeSubstitution(originalRoman: string, substitutionId: string) {
  const substitution = SUBSTITUTIONS.find(item => item.id === substitutionId);
  if (!substitution) return { valid: false, reason: 'Unknown substitution.' };
  const applies = originalRoman.replace(/maj7|7$/, '') === substitution.appliesTo.replace(/7$/, '')
    || originalRoman === substitution.appliesTo;
  return applies
    ? { valid: true, reason: `${substitution.label}: ${substitution.explanation}` }
    : { valid: false, reason: `${substitution.label} applies to ${substitution.appliesTo}, not ${originalRoman}.` };
}

/* ------------------------------------------------- compare harmonizations (64) */

export interface ComparisonTask {
  keyPitchClass: number; templateName: string;
  original: number[][]; altered: number[][];
  romans: string[]; alteredRomans: string[];
  answer: string; options: string[];
}

// Every substitution is nameable, plus the case where nothing was substituted.
const COMPARISON_ANSWERS = [...SUBSTITUTIONS.map(item => item.id), 'voice leading only'];

/** Same harmony, different arrangement: the lowest voice moves up an octave. */
export function revoice(notes: readonly number[]): number[] {
  if (notes.length < 2) return [...notes];
  const sorted = [...notes].sort((a, b) => a - b);
  return [...sorted.slice(1), sorted[0] + 12];
}

export function generateComparison(seed: number): ComparisonTask {
  const random = seededRandom(seed);
  const keyPitchClass = Math.floor(random() * 12);
  const template = PROGRESSIONS.find(item => item.id === 'two-five-one')!;
  const original = buildProgression(keyPitchClass, template);
  const romans = original.roman.split(' – ');
  const substitution = SUBSTITUTIONS[Math.floor(random() * SUBSTITUTIONS.length)];
  const index = romans.findIndex(roman => roman.replace(/7$/, '') === substitution.appliesTo.replace(/7$/, ''));
  // Nothing in this progression takes the chosen substitution, so the two readings
  // must differ only in how the voices move. The alternative is genuinely
  // re-voiced — returning the identical chords would make "voice leading only"
  // describe a change that never happened.
  if (index < 0) {
    return {
      keyPitchClass, templateName: original.name, original: original.chords,
      altered: original.chords.map(revoice),
      romans, alteredRomans: romans, answer: 'voice leading only', options: COMPARISON_ANSWERS,
    };
  }
  const root = 48 + ((keyPitchClass + substitution.offset) % 12);
  const substituteNotes = substitution.quality === 'major'
    ? chord(root, 'major').map(note => note.midiNumber)
    : seventhChord(root, substitution.quality).map(note => note.midiNumber);
  return {
    keyPitchClass, templateName: original.name, original: original.chords,
    altered: original.chords.map((notes, position) => position === index ? substituteNotes : notes),
    romans, alteredRomans: romans.map((roman, position) => position === index ? substitution.result : roman),
    answer: substitution.id, options: COMPARISON_ANSWERS,
  };
}

export const chordLabel = (keyPitchClass: number, roman: string) => `${NOTE_NAMES[(keyPitchClass + (CHOICE_OFFSETS[roman] ?? 0)) % 12]} ${roman}`;
