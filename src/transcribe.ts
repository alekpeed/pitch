import { buildProgression, PROGRESSIONS, type ProgressionTemplate } from './harmony';
import { NOTE_NAMES, seededRandom } from './theory';

export type TranscriptionTaskKind = 'melody-echo' | 'melody' | 'bass' | 'chords';
export type MixDensity = 'solo' | 'accompanied' | 'dense';

export interface TranscriptionTask {
  kind: TranscriptionTaskKind;
  keyPitchClass: number;
  templateName: string;
  bars: number;
  /** The line the user must reproduce, for melody and bass tasks. */
  line: number[];
  /** Backing harmony, also the answer for chord tasks. */
  chords: number[][];
  romans: string[];
  bassLine: number[];
  density: MixDensity;
}

const MELODY_STEPS = [0, 2, 4, 5, 7, 9, 11];
const ECHO_LENGTH = 4;

/**
 * Melody sits on chord tones at each change with a passing note between, so the
 * line is genuinely derived from the harmony rather than random.
 */
function melodyOver(chords: number[][], random: () => number, notesPerChord: number): number[] {
  return chords.flatMap(chord => {
    const tones = chord.map(note => note + 12).filter(note => note >= 60 && note <= 84);
    const anchor = tones.length ? tones[Math.floor(random() * tones.length)] : 72;
    return Array.from({ length: notesPerChord }, (_, index) => {
      if (index === 0) return anchor;
      const step = MELODY_STEPS[Math.floor(random() * MELODY_STEPS.length)];
      const direction = random() > .5 ? 1 : -1;
      return Math.max(60, Math.min(84, anchor + direction * (step % 5)));
    });
  });
}

export interface TaskOptions { kind: TranscriptionTaskKind; bars?: number; density?: MixDensity }

export function generateTranscription(seed: number, options: TaskOptions): TranscriptionTask {
  const random = seededRandom(seed);
  const keyPitchClass = Math.floor(random() * 12);
  const bars = options.bars ?? (options.kind === 'melody-echo' ? 1 : 2);
  // Longer tasks chain templates so the harmony keeps moving across the bars.
  const templates: ProgressionTemplate[] = Array.from({ length: Math.max(1, Math.ceil(bars / 2)) },
    () => PROGRESSIONS[Math.floor(random() * PROGRESSIONS.length)]);
  const built = templates.map(template => buildProgression(keyPitchClass, template));
  const chords = built.flatMap(item => item.chords);
  const romans = built.flatMap(item => item.roman.split(' – '));
  const bassLine = chords.map(notes => Math.min(...notes) - 12);
  const notesPerChord = options.kind === 'melody-echo' ? 2 : 3;
  const melody = melodyOver(chords, random, notesPerChord);
  // An echo is a short phrase held in memory, not a full transcription: the spec
  // puts it at two to four notes before it scales up.
  const line = options.kind === 'bass' ? bassLine
    : options.kind === 'melody-echo' ? melody.slice(0, ECHO_LENGTH)
    : melody;
  return {
    kind: options.kind, keyPitchClass, templateName: built.map(item => item.name).join(' + '),
    bars, line, chords, romans, bassLine, density: options.density ?? 'solo',
  };
}

/* ------------------------------------------------------------- grading */

export interface SequenceGrade { correct: boolean; matched: number; total: number; perItem: boolean[] }

export function gradeNotes(expected: readonly number[], actual: readonly number[], octaveEquivalent = true): SequenceGrade {
  const same = (a: number, b: number) => octaveEquivalent ? ((a - b) % 12 + 12) % 12 === 0 : a === b;
  const perItem = expected.map((note, index) => actual[index] !== undefined && same(note, actual[index]));
  const matched = perItem.filter(Boolean).length;
  return { correct: matched === expected.length && actual.length === expected.length, matched, total: expected.length, perItem };
}

const ROOTS: Record<string, number> = {};
NOTE_NAMES.forEach((name, index) => { ROOTS[name.toLowerCase()] = index; });
// Enharmonics the app does not spell itself but a user may reasonably type.
Object.entries({ 'c#': 1, db: 1, 'd#': 3, eb: 3, 'f#': 6, gb: 6, 'g#': 8, ab: 8, 'a#': 10, bb: 10 })
  .forEach(([name, value]) => { ROOTS[name] = value; });

// Case is semantic in chord symbols: M means major, m means minor. Matching
// case-insensitively would grade a correct m7 as maj7, so the leading letter is
// expanded to an unambiguous word before anything is lower-cased.
function canonicalSuffix(suffix: string): string {
  return suffix
    .replace(/^Δ/, 'maj')
    .replace(/^M(?![a-z])/, 'maj')
    .replace(/^m(?![a-z])/, 'min')
    .replace(/^maj/i, 'maj')
    .replace(/^min/i, 'min')
    .toLowerCase();
}

const QUALITY_ALIASES: [RegExp, string][] = [
  [/^(maj7|major7)$/, 'maj7'],
  [/^(min7|-7)$/, 'm7'],
  [/^(7|dom7)$/, '7'],
  [/^(ø7?|min7b5|half-?dim7?)$/, 'm7b5'],
  [/^(dim7?|o7?|°7?)$/, 'dim7'],
  [/^(min|-|minor)$/, 'm'],
  [/^(|maj|major)$/, ''],
];

/**
 * Chord labels are genuinely ambiguous in notation — Cmaj7, CM7 and CΔ are the
 * same harmony, and C♯ and D♭ are the same root. Grading compares the harmony a
 * label denotes, not the characters used to write it.
 */
export function normalizeChordLabel(label: string): string | undefined {
  const cleaned = label.trim().replace(/\s+/g, '').replace(/♭/g, 'b').replace(/♯/g, '#');
  const match = /^([A-Ga-g][#b]?)(.*)$/.exec(cleaned);
  if (!match) return undefined;
  const root = ROOTS[match[1].toLowerCase()];
  if (root === undefined) return undefined;
  const suffix = canonicalSuffix(match[2]);
  const alias = QUALITY_ALIASES.find(([pattern]) => pattern.test(suffix));
  return `${root}${alias ? alias[1] : suffix}`;
}

export function gradeChordLabels(expected: readonly string[], actual: readonly string[]): SequenceGrade {
  const perItem = expected.map((label, index) => {
    const wanted = normalizeChordLabel(label);
    const given = actual[index] === undefined ? undefined : normalizeChordLabel(actual[index]);
    return wanted !== undefined && wanted === given;
  });
  const matched = perItem.filter(Boolean).length;
  return { correct: matched === expected.length && actual.length === expected.length, matched, total: expected.length, perItem };
}

/* --------------------------------------------------------------- hints */

export const HINT_LADDER = ['key', 'bass', 'function', 'family', 'answer'] as const;
export type HintLevel = (typeof HINT_LADDER)[number];

/** Reveals only as much as asked for, in the order the spec specifies. */
export function hintsFor(task: TranscriptionTask, revealed: number): string[] {
  const all: Record<HintLevel, string> = {
    key: `The key centre is ${NOTE_NAMES[task.keyPitchClass]}.`,
    bass: `The bass moves ${task.bassLine.map(note => NOTE_NAMES[((note % 12) + 12) % 12]).join(' – ')}.`,
    function: `Functionally this is ${task.templateName}.`,
    family: `The chords are ${task.romans.join(' – ')}.`,
    answer: task.kind === 'chords'
      ? `The answer is ${task.romans.join(' – ')}.`
      : `The line is ${task.line.map(note => NOTE_NAMES[((note % 12) + 12) % 12]).join(' – ')}.`,
  };
  return HINT_LADDER.slice(0, Math.max(0, Math.min(revealed, HINT_LADDER.length))).map(level => all[level]);
}
