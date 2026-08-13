import { liftAboveMud, NOTE_NAMES, seededRandom, seventhChord, type SeventhQuality } from './theory';
import { generateVoicing, type VoicingStyle } from './voicing';

/**
 * Hearing inside a chord rather than naming it: how it is spaced, what triad sits
 * on top of it, which voice moved, and what changed between two near-identical
 * versions of it.
 */

const QUALITIES = ['major 7', 'dominant 7', 'minor 7'] as const;
type Quality = (typeof QUALITIES)[number];
const mod = (value: number) => ((value % 12) + 12) % 12;
const spell = (midi: number) => `${NOTE_NAMES[mod(midi)]}${Math.floor(midi / 12) - 1}`;
/**
 * Puts a pitch class in the octave starting at `floorC`, which MUST be a C.
 * Anchoring on anything else transposes the pitch class by that interval, which
 * is silent and uniform and therefore very hard to hear as a bug.
 */
const place = (pitchClass: number, floorC: number) => floorC + mod(pitchClass);

/* ------------------------------------------------ spacing recognition (23, 24, 27, 28) */

export type Spacing = 'close' | 'open' | 'drop-2' | 'drop-3' | 'spread' | 'quartal';
export const SPACINGS: readonly Spacing[] = ['close', 'open', 'drop-2', 'drop-3', 'spread', 'quartal'];
const SPACING_NOTES: Record<Spacing, string> = {
  close: 'close position: every voice inside one octave, with no gaps opened up.',
  open: 'open position: the second voice lifted an octave, opening a gap in the middle.',
  'drop-2': 'a drop-2 voicing: the second voice from the top dropped an octave.',
  'drop-3': 'a drop-3 voicing: the third voice from the top dropped an octave, leaving a wider gap under the melody.',
  spread: 'a spread voicing: alternate voices lifted an octave, spread over two octaves.',
  // Quartal is a way of building the chord rather than a way of spacing one, so
  // it does not get described as a "position".
  quartal: 'a quartal voicing: built by stacking fourths from the parent scale instead of thirds.',
};

export interface SpacingTask {
  notes: number[]; answer: Spacing; options: readonly Spacing[];
  rootPitchClass: number; quality: Quality; label: string; explanation: string;
}

/**
 * Identity is held constant on purpose: the same chord in every option, so the
 * only thing left to hear is the spacing.
 */
export function generateSpacing(seed: number, options: readonly Spacing[] = SPACINGS): SpacingTask {
  const pool = options.length ? options : SPACINGS;
  const random = seededRandom(seed);
  const rootPitchClass = Math.floor(random() * 12);
  const quality = QUALITIES[Math.floor(random() * QUALITIES.length)];
  const answer = pool[Math.floor(random() * pool.length)];
  return {
    notes: generateVoicing({ rootPitchClass, quality, style: answer as VoicingStyle }),
    answer, options: pool, rootPitchClass, quality,
    label: `${NOTE_NAMES[rootPitchClass]} ${quality}`,
    explanation: `${NOTE_NAMES[rootPitchClass]} ${quality} in ${SPACING_NOTES[answer]}`,
  };
}

/* ----------------------------------------------- upper-structure triads (29) */

/** Interval above the chord root, named as the tension it sounds like. */
const TENSION_NAMES = ['root', '♭9', '9', '♯9', '3rd', '11', '♯11', '5th', '♭13', '13', '♭7', 'major 7th'];

export interface UpperStructure { label: string; offset: number }
/** The six triads commonly played over a dominant, by their degree above its root. */
export const UPPER_STRUCTURES: readonly UpperStructure[] = [
  { label: 'II', offset: 2 }, { label: '♭II', offset: 1 }, { label: '♭III', offset: 3 },
  { label: '♯IV', offset: 6 }, { label: 'VI', offset: 9 }, { label: '♭VI', offset: 8 },
];

export interface UpperStructureTask {
  notes: number[]; upper: number[]; lower: number[]; answer: string; tensions: string[];
  rootPitchClass: number; label: string; explanation: string;
}

/** Names each note of the triad by the tension it makes against the dominant under it. */
export const tensionsOver = (rootPitchClass: number, upper: readonly number[]) =>
  upper.map(note => TENSION_NAMES[mod(note - rootPitchClass)]);

/**
 * A plain major triad stacked over a dominant shell. The point is that a stack of
 * alterations is easier to hear as one familiar triad than as four separate tensions.
 */
export function generateUpperStructure(seed: number): UpperStructureTask {
  const random = seededRandom(seed);
  const rootPitchClass = Math.floor(random() * 12);
  const structure = UPPER_STRUCTURES[Math.floor(random() * UPPER_STRUCTURES.length)];
  // Root, 3rd and ♭7 only: the 5th is left out so the triad on top is unobstructed.
  // The bass sits a full octave below the guide tones, which keeps the whole
  // structure clear of the low-interval limit.
  const lower = [place(rootPitchClass, 36), place(rootPitchClass + 4, 48), place(rootPitchClass + 10, 48)].sort((a, b) => a - b);
  const triadRoot = place(rootPitchClass + structure.offset, 60);
  const upper = [triadRoot, triadRoot + 4, triadRoot + 7];
  const tensions = tensionsOver(rootPitchClass, upper);
  return {
    notes: [...lower, ...upper], upper, lower, answer: structure.label, tensions, rootPitchClass,
    label: `${NOTE_NAMES[rootPitchClass]}7`,
    explanation: `${NOTE_NAMES[mod(triadRoot)]} major triad over ${NOTE_NAMES[rootPitchClass]}7 — upper structure ${structure.label}, sounding ${tensions.join(', ')}.`,
  };
}

/* -------------------------------------------------- voice-leading tracking (33) */

/** Low to high, so an index into a sorted voicing is also the voice's name. */
export const VOICES = ['bass', 'tenor', 'alto', 'soprano'] as const;
export type Voice = (typeof VOICES)[number];

export interface MotionTask {
  first: number[]; second: number[]; answer: Voice; semitones: number; direction: 'up' | 'down';
  commonTones: number[]; explanation: string;
}

/**
 * Exactly one voice moves, by a step, without crossing its neighbours — so the
 * question "which voice moved?" has one defensible answer.
 */
export function generateVoiceMotion(seed: number): MotionTask {
  const random = seededRandom(seed);
  const root = 48 + Math.floor(random() * 12);
  const quality = QUALITIES[Math.floor(random() * QUALITIES.length)] as SeventhQuality;
  const first = liftAboveMud(seventhChord(root, quality).map(note => note.midiNumber)).sort((a, b) => a - b);
  const index = Math.floor(random() * first.length);
  const step = 1 + Math.floor(random() * 2);
  const lower = index > 0 ? first[index - 1] : Number.NEGATIVE_INFINITY;
  const upper = index < first.length - 1 ? first[index + 1] : Number.POSITIVE_INFINITY;
  // Prefer the drawn direction, but never let a voice cross the one beside it —
  // a crossed voice makes "which voice moved?" ambiguous rather than difficult.
  const wanted = random() > .5 ? step : -step;
  const semitones = first[index] + wanted > lower && first[index] + wanted < upper ? wanted : -wanted;
  const second = first.map((note, at) => at === index ? note + semitones : note);
  return {
    first, second, answer: VOICES[index], semitones: Math.abs(semitones),
    direction: semitones > 0 ? 'up' : 'down',
    commonTones: first.filter((_, at) => at !== index),
    explanation: `The ${VOICES[index]} moved ${semitones > 0 ? 'up' : 'down'} ${Math.abs(semitones)} semitone${Math.abs(semitones) === 1 ? '' : 's'}, from ${spell(first[index])} to ${spell(second[index])}. The other ${first.length - 1} voices are common tones.`,
  };
}

/* -------------------------------------------------- inner-voice melody (34) */

export interface InnerMelodyTask {
  chords: number[][]; answer: Voice; melody: number[]; steps: number[]; explanation: string;
}

/**
 * One voice carries a line while the other three hold their pitches exactly, so
 * the melody is genuinely in that voice rather than merely most audible there.
 */
export function generateInnerMelody(seed: number, length = 4): InnerMelodyTask {
  const random = seededRandom(seed);
  const root = 48 + Math.floor(random() * 12);
  const quality = QUALITIES[Math.floor(random() * QUALITIES.length)] as SeventhQuality;
  const base = liftAboveMud(seventhChord(root, quality).map(note => note.midiNumber)).sort((a, b) => a - b);
  const index = Math.floor(random() * base.length);
  const stepPool = [1, 2, -1, -2];
  const steps = Array.from({ length: length - 1 }, () => stepPool[Math.floor(random() * stepPool.length)]);
  const melody = steps.reduce((line, step) => [...line, line[line.length - 1] + step], [base[index]]);
  const chords = melody.map(note => base.map((held, at) => at === index ? note : held));
  return {
    chords, answer: VOICES[index], melody, steps,
    explanation: `The line was in the ${VOICES[index]}: ${melody.map(spell).join(' → ')}. Every other voice held its pitch throughout.`,
  };
}

/* -------------------------------------------------- what changed (35) */

export type VoicingChange = 'nothing changed' | 'one note was altered' | 'the bass changed' | 'an extension was added' | 'the inversion changed' | 'the chord was substituted';
export const VOICING_CHANGES: readonly VoicingChange[] = ['nothing changed', 'one note was altered', 'the bass changed', 'an extension was added', 'the inversion changed', 'the chord was substituted'];

export interface ChangeTask { first: number[]; second: number[]; answer: VoicingChange; label: string; explanation: string }

/**
 * Two near-identical voicings. The categories are kept genuinely separable: an
 * inversion preserves the pitch-class set exactly, whereas a bass change
 * introduces a pitch class the chord did not have — so the two never overlap.
 */
export function generateVoicingChange(seed: number, answer?: VoicingChange): ChangeTask {
  const random = seededRandom(seed);
  const rootPitchClass = Math.floor(random() * 12);
  const quality = QUALITIES[Math.floor(random() * QUALITIES.length)];
  const chosen = answer ?? VOICING_CHANGES[Math.floor(random() * VOICING_CHANGES.length)];
  const first = generateVoicing({ rootPitchClass, quality, style: 'close' });
  const label = `${NOTE_NAMES[rootPitchClass]} ${quality}`;
  let second = [...first];
  let detail: string;
  if (chosen === 'one note was altered') {
    // An inner voice, so the change is a colour change rather than a new bass or melody.
    const index = 1 + Math.floor(random() * (first.length - 2));
    const shift = random() > .5 ? 1 : -1;
    second[index] += shift;
    detail = `${spell(first[index])} became ${spell(second[index])}.`;
  } else if (chosen === 'the bass changed') {
    // A pitch class the chord does not contain, which is what makes it a slash
    // chord rather than another inversion of the same harmony.
    const outside = [1, 2, 5, 6, 8, 9, 10, 11].map(step => mod(rootPitchClass + step))
      .filter(pitchClass => !first.map(mod).includes(pitchClass));
    const bass = first[0] - 12 + ((outside[Math.floor(random() * outside.length)] - mod(first[0] - 12) + 12) % 12);
    second = [bass, ...first.slice(1)];
    detail = `The bass moved to ${NOTE_NAMES[mod(bass)]}, which is not in the chord — ${label} over ${NOTE_NAMES[mod(bass)]}.`;
  } else if (chosen === 'an extension was added') {
    second = [...first, first[0] + 14];
    detail = `A 9th was added on top; nothing else moved.`;
  } else if (chosen === 'the inversion changed') {
    second = [...first.slice(1), first[0] + 12];
    detail = `The same notes, with ${NOTE_NAMES[mod(first[0])]} moved from the bottom to the top.`;
  } else if (chosen === 'the chord was substituted') {
    // A tritone away: the guide tones are shared, so it is a substitution rather
    // than an unrelated chord.
    second = generateVoicing({ rootPitchClass: mod(rootPitchClass + 6), quality: 'dominant 7', style: 'close' });
    detail = `${label} was replaced by ${NOTE_NAMES[mod(rootPitchClass + 6)]} dominant 7, a tritone away.`;
  } else {
    detail = 'The second voicing was the first one again.';
  }
  return { first, second: second.sort((a, b) => a - b), answer: chosen, label, explanation: detail };
}
