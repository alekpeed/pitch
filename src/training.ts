import {
  ALTERED_QUALITIES, ALTERED_STRUCTURES, chord, CHROMATIC_DEGREES, CHROMATIC_STEPS, EXTENSION_QUALITIES,
  EXTENSION_STRUCTURES, liftAboveMud, MAJOR_SCALE, melodicInterval, MODE_NAMES, MODES, NOTE_NAMES,
  seededRandom, SEVENTH_QUALITIES, seventhChord, TERTIAN_TRIADS, TRIAD_QUALITIES, voiceChord,
  type AlteredQuality, type ChordQuality, type ExtensionQuality, type SeventhQuality,
} from './theory';

export type ExerciseKind = 'scale-degree' | 'interval' | 'triad' | 'seventh' | 'bass' | 'absolute-note' | 'tonal-center' | 'mode' | 'extension' | 'altered' | 'decomposition' | 'slash-chord';
export type Vocabulary = 'diatonic' | 'chromatic';
export type Presentation = 'block' | 'arpeggiated';
export type Exposure = 'sustained' | 'short';
export type Rhythm = 'steady' | 'syncopated';
export type Register = 'low' | 'middle' | 'high' | 'random';
export type Timbre = 'piano' | 'rhodes' | 'organ' | 'guitar' | 'strings' | 'pad';
export interface DrillConfig { kind: ExerciseKind; rootPool: 'all' | 'white'; inversions: boolean; melodic: boolean; register: Register; timbre: Timbre; vocabulary?: Vocabulary; presentation?: Presentation; exposure?: Exposure; rhythm?: Rhythm }
export interface Stimulus { kind: ExerciseKind; root: number; answer: string; notes: number[]; inversion: number; contextNotes?: number[]; direction?: 'ascending' | 'descending'; quality?: string; phrase?: number[][]; melodic?: boolean; explanation?: string; question?: string }

export const ANSWERS: Record<ExerciseKind, readonly string[]> = {
  'scale-degree': ['1 · tonic', '2 · supertonic', '3 · mediant', '4 · subdominant', '5 · dominant', '6 · submediant', '7 · leading tone'],
  interval: ['minor 2nd', 'major 2nd', 'minor 3rd', 'major 3rd', 'perfect 4th', 'tritone', 'perfect 5th', 'minor 6th', 'major 6th', 'minor 7th', 'major 7th', 'octave'],
  triad: TRIAD_QUALITIES,
  seventh: SEVENTH_QUALITIES,
  bass: ['root in bass', 'third in bass', 'fifth in bass'],
  'absolute-note': NOTE_NAMES,
  'tonal-center': NOTE_NAMES,
  mode: MODE_NAMES,
  extension: EXTENSION_QUALITIES,
  altered: ALTERED_QUALITIES,
  // Decomposition and slash chords both answer with a note name, so one grid serves both.
  decomposition: NOTE_NAMES,
  'slash-chord': NOTE_NAMES
};

// Indexed into the chord's own structure, so the "3rd" is whatever third that
// quality actually has rather than a fixed interval.
const CHORD_MEMBERS = ['root', '3rd', '5th', '7th'] as const;

/** Scale-degree vocabulary widens to all twelve degrees as difficulty rises. */
export function answersFor(config: DrillConfig): readonly string[] {
  if (config.kind === 'scale-degree' && config.vocabulary === 'chromatic') return CHROMATIC_DEGREES;
  return ANSWERS[config.kind];
}

// Each phrase ends on the tonic but never opens on it, so the answer has to be
// heard as a resolution rather than read off the first chord.
const tonalPhrases = [[5, 7, 0], [2, 7, 0], [9, 5, 7, 0]] as const;
const intervalSizes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const majorScale = MAJOR_SCALE;
const whitePitchClasses = [0, 2, 4, 5, 7, 9, 11];
// C3 / G3 / D4. The old low base of C2 put whole triads an octave below the
// point where close spacing stays intelligible, which is the main reason drills
// sounded muddy.
const registerBases: Record<Exclude<Register, 'random'>, number> = { low: 48, middle: 55, high: 62 };
const triadQualities: ChordQuality[] = TERTIAN_TRIADS;

// Lifts a stimulus clear of the low-interval limit, keeping the reported root in
// step with the notes that actually sound.
function sounded(root: number, notes: number[]) {
  const lifted = liftAboveMud(notes);
  return { root: root + (lifted[0] - notes[0]), notes: lifted };
}

export function generateStimulus(seed: number, config: DrillConfig): Stimulus {
  const random = seededRandom(seed);
  const pool = config.rootPool === 'white' ? whitePitchClasses : Array.from({ length: 12 }, (_, index) => index);
  const register = config.register === 'random' ? (['low', 'middle', 'high'] as const)[Math.floor(random() * 3)] : config.register;
  const root = registerBases[register] + pool[Math.floor(random() * pool.length)];
  const answers = answersFor(config);
  const answerIndex = Math.floor(random() * answers.length);
  const answer = answers[answerIndex];
  if (config.kind === 'scale-degree') {
    const steps = config.vocabulary === 'chromatic' ? CHROMATIC_STEPS : majorScale;
    return { kind: config.kind, root, answer, notes: [root + steps[answerIndex]], contextNotes: liftAboveMud(chord(root, 'major').map(note => note.midiNumber)), inversion: 0 };
  }
  if (config.kind === 'absolute-note') {
    // Deliberately no tonic context: the point is naming a pitch without one.
    return { kind: config.kind, root, answer: NOTE_NAMES[root % 12], notes: [root], inversion: 0, explanation: `${NOTE_NAMES[root % 12]}, named without any tonal context.` };
  }
  if (config.kind === 'tonal-center') {
    const template = tonalPhrases[Math.floor(random() * tonalPhrases.length)];
    const tonic = root;
    const phrase = template.map(offset => liftAboveMud(chord(tonic + offset, 'major').map(note => note.midiNumber)));
    return { kind: config.kind, root: tonic, answer: NOTE_NAMES[tonic % 12], notes: phrase.at(-1)!, phrase, inversion: 0, explanation: `The phrase resolved to ${NOTE_NAMES[tonic % 12]}.` };
  }
  if (config.kind === 'mode') {
    const name = MODE_NAMES[answerIndex];
    const scale = [...MODES[name].intervals, 12].map(step => root + step);
    return { kind: config.kind, root, answer: name, notes: scale, melodic: true, inversion: 0, explanation: `${name} is marked by its ${MODES[name].characteristic}.` };
  }
  if (config.kind === 'interval') {
    const direction = random() > .5 ? 'ascending' : 'descending'; const size = intervalSizes[answerIndex];
    // Melodic intervals never overlap, so only the harmonic form needs the limit.
    if (config.melodic) return { kind: config.kind, root, answer, notes: melodicInterval(root, size, direction).map(note => note.midiNumber), inversion: 0, direction };
    return { kind: config.kind, ...sounded(root, [root, root + size]), answer, inversion: 0, direction };
  }
  if (config.kind === 'bass') {
    const quality = triadQualities[Math.floor(random() * triadQualities.length)];
    return { kind: config.kind, ...sounded(root, chord(root, quality, answerIndex).map(note => note.midiNumber)), answer, inversion: answerIndex, quality };
  }
  if (config.kind === 'extension' || config.kind === 'altered') {
    const structure = config.kind === 'extension'
      ? EXTENSION_STRUCTURES[answer as ExtensionQuality]
      : ALTERED_STRUCTURES[answer as AlteredQuality];
    const voiced = voiceChord(root, structure).map(note => note.midiNumber);
    return { kind: config.kind, ...sounded(root, voiced), answer, inversion: 0, quality: answer, explanation: `${NOTE_NAMES[root % 12]}${answer} \u2014 ${structure.length} voices.` };
  }
  if (config.kind === 'decomposition') {
    const quality = SEVENTH_QUALITIES[Math.floor(random() * SEVENTH_QUALITIES.length)];
    const voiced = seventhChord(root, quality);
    const memberIndex = Math.floor(random() * CHORD_MEMBERS.length);
    const heard = sounded(root, voiced.map(note => note.midiNumber));
    const shift = heard.root - root;
    const target = voiced[memberIndex].midiNumber + shift;
    return {
      kind: config.kind, ...heard, answer: NOTE_NAMES[target % 12], inversion: 0, quality,
      question: `Name the ${CHORD_MEMBERS[memberIndex]} of this chord.`,
      explanation: `${NOTE_NAMES[heard.root % 12]} ${quality} \u2014 its ${CHORD_MEMBERS[memberIndex]} is ${NOTE_NAMES[target % 12]}.`,
    };
  }
  if (config.kind === 'slash-chord') {
    const quality = triadQualities[Math.floor(random() * triadQualities.length)];
    // The bass is displaced from the triad root, and may be outside the triad
    // entirely, which is what separates a slash chord from a plain inversion.
    const bass = root - (1 + Math.floor(random() * 11));
    const voiced = [bass, ...chord(root, quality).map(note => note.midiNumber)];
    const heard = sounded(bass, voiced);
    const shift = heard.root - bass;
    const askBass = random() > .5;
    const upperRoot = root + shift;
    const label = `${NOTE_NAMES[upperRoot % 12]} ${quality} / ${NOTE_NAMES[(bass + shift) % 12]}`;
    return {
      kind: config.kind, root: heard.root, notes: heard.notes, inversion: 0, quality,
      answer: NOTE_NAMES[(askBass ? bass + shift : upperRoot) % 12],
      question: askBass ? 'Name the bass note.' : 'Name the root of the upper triad.',
      explanation: `${label} \u2014 upper triad and bass are named independently.`,
    };
  }
  const pitches = config.kind === 'triad' ? chord(root, answer as ChordQuality, 0) : seventhChord(root, answer as SeventhQuality, 0);
  // Inversion is capped by the notes a quality actually has, so a power chord
  // cannot be asked for a third inversion it does not possess.
  const inversion = config.inversions ? Math.floor(random() * Math.min(config.kind === 'triad' ? 3 : 4, pitches.length)) : 0;
  const voiced = config.kind === 'triad' ? chord(root, answer as ChordQuality, inversion) : seventhChord(root, answer as SeventhQuality, inversion);
  return { kind: config.kind, ...sounded(root, voiced.map(note => note.midiNumber)), answer, inversion };
}

export const RECOGNITION_KINDS: readonly ExerciseKind[] = ['scale-degree', 'interval', 'triad', 'seventh', 'bass', 'absolute-note', 'tonal-center', 'mode', 'extension', 'altered', 'decomposition', 'slash-chord'];

export function recommendKind(attempts: { exercise: string; correct: boolean }[]): ExerciseKind {
  const kinds: ExerciseKind[] = [...RECOGNITION_KINDS];
  return kinds.map(kind => { const relevant = attempts.filter(item => item.exercise === `${kind}-recognition`).slice(-20); return { kind, score: relevant.length ? relevant.filter(item => item.correct).length / relevant.length : -1 }; }).sort((a, b) => a.score - b.score)[0].kind;
}
