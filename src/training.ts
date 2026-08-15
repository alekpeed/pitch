import { PROGRESSIONS, buildProgression } from './harmony';
import {
  ALTERED_QUALITIES, ALTERED_STRUCTURES, chord, CHROMATIC_DEGREES, CHROMATIC_STEPS, EXTENSION_QUALITIES,
  EXTENSION_STRUCTURES, liftAboveMud, MAJOR_SCALE, melodicInterval, MODE_NAMES, MODES, NOTE_NAMES,
  seededRandom, SEVENTH_QUALITIES, seventhChord, TERTIAN_TRIADS, TRIAD_QUALITIES, voiceChord,
  type AlteredQuality, type ChordQuality, type ExtensionQuality, type SeventhQuality,
} from './theory';

export type ExerciseKind = 'scale-degree' | 'interval' | 'triad' | 'seventh' | 'bass' | 'tonal-center' | 'mode' | 'extension' | 'altered' | 'decomposition' | 'slash-chord' | 'delayed-comparison' | 'multibar-memory';
export type Vocabulary = 'diatonic' | 'chromatic';
/** 'both' plays the chord whole and then arpeggiates it — the most information, so the easiest rung. */
export type Presentation = 'both' | 'block' | 'arpeggiated';
export type Exposure = 'sustained' | 'short';
export type Rhythm = 'steady' | 'syncopated';
/** Seconds of silence between the two chords in a delayed comparison. */
export type MemoryDelay = 'none' | 'short' | 'long';
/** Response deadline, in seconds; 'none' leaves the drill untimed. */
export type Deadline = 'none' | '8' | '5' | '3';
export const DELAY_SECONDS: Record<MemoryDelay, number> = { none: 1.1, short: 2.4, long: 4 };
export type Register = 'low' | 'middle' | 'high' | 'random';
export type Timbre = 'piano' | 'rhodes' | 'organ' | 'guitar' | 'strings' | 'pad';
export interface DrillConfig { kind: ExerciseKind; rootPool: 'all' | 'white'; inversions: boolean; melodic: boolean; register: Register; timbre: Timbre; vocabulary?: Vocabulary; presentation?: Presentation; exposure?: Exposure; rhythm?: Rhythm; memoryDelay?: MemoryDelay; deadline?: Deadline; blind?: boolean; only?: readonly string[]; confidence?: boolean }
export interface Stimulus { kind: ExerciseKind; root: number; answer: string; notes: number[]; inversion: number; contextNotes?: number[]; direction?: 'ascending' | 'descending'; quality?: string; phrase?: number[][]; melodic?: boolean; explanation?: string; question?: string; replayLimit?: number; gapSeconds?: number }

/**
 * Every answer vocabulary in this file is deliberately relative — an interval, a
 * scale degree, a chord member, a quality. None of them is an absolute letter
 * name, because naming a pitch with no reference sounding is a test of absolute
 * pitch rather than of ear training, and absolute pitch is not a skill this app
 * teaches or assumes.
 */
const DIATONIC_DEGREES = ['1 · tonic', '2 · supertonic', '3 · mediant', '4 · subdominant', '5 · dominant', '6 · submediant', '7 · leading tone'] as const;
// Indexed into the chord's own structure, so the "3rd" is whatever third that
// quality actually has rather than a fixed interval.
const CHORD_MEMBERS = ['root', '3rd', '5th', '7th'] as const;
/** How far the bass sits under the upper triad's root, named as an interval. */
const BASS_OFFSETS = ['minor 2nd', 'major 2nd', 'minor 3rd', 'major 3rd', 'perfect 4th', 'tritone', 'perfect 5th', 'minor 6th', 'major 6th', 'minor 7th', 'major 7th'] as const;

export const ANSWERS: Record<ExerciseKind, readonly string[]> = {
  'scale-degree': DIATONIC_DEGREES,
  interval: ['minor 2nd', 'major 2nd', 'minor 3rd', 'major 3rd', 'perfect 4th', 'tritone', 'perfect 5th', 'minor 6th', 'major 6th', 'minor 7th', 'major 7th', 'octave'],
  triad: TRIAD_QUALITIES,
  seventh: SEVENTH_QUALITIES,
  bass: ['root in bass', 'third in bass', 'fifth in bass'],
  mode: MODE_NAMES,
  // The phrase itself establishes the key, so the degree is read against a tonic
  // that was heard rather than against a letter name that has to be known.
  'tonal-center': DIATONIC_DEGREES,
  extension: EXTENSION_QUALITIES,
  altered: ALTERED_QUALITIES,
  decomposition: CHORD_MEMBERS,
  'slash-chord': BASS_OFFSETS,
  'delayed-comparison': ['identical', 'quality changed', 'root changed', 'inversion changed'],
  'multibar-memory': PROGRESSIONS.map(template => template.chords.map(item => item.roman).join(' \u2013 '))
};

/** Scale-degree vocabulary widens to all twelve degrees as difficulty rises. */
function fullAnswersFor(config: DrillConfig): readonly string[] {
  if (config.kind === 'scale-degree' && config.vocabulary === 'chromatic') return CHROMATIC_DEGREES;
  return ANSWERS[config.kind];
}

/**
 * `only` narrows a drill to a specific set of labels, which is what turns an
 * ordinary drill into an A/B contrast between two confused answers.
 */
export function answersFor(config: DrillConfig): readonly string[] {
  const full = fullAnswersFor(config);
  const narrowed = config.only?.length ? full.filter(answer => config.only!.includes(answer)) : full;
  return narrowed.length ? narrowed : full;
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
  const answerPool = answersFor(config);
  const answer = answerPool[Math.floor(random() * answerPool.length)];
  // Indexed against the unrestricted list, because several generators use the
  // answer's position to look up a parallel table of intervals or structures.
  const answerIndex = Math.max(0, fullAnswersFor(config).indexOf(answer));
  if (config.kind === 'scale-degree') {
    const steps = config.vocabulary === 'chromatic' ? CHROMATIC_STEPS : majorScale;
    return { kind: config.kind, root, answer, notes: [root + steps[answerIndex]], contextNotes: liftAboveMud(chord(root, 'major').map(note => note.midiNumber)), inversion: 0 };
  }
  if (config.kind === 'tonal-center') {
    // The phrase establishes a key; a single note then follows. Answering means
    // holding that tonic in the ear and placing the note against it — the same
    // skill as before, but read as a degree rather than as a letter name, so no
    // absolute pitch is involved.
    const template = tonalPhrases[Math.floor(random() * tonalPhrases.length)];
    const phrase = template.map(offset => liftAboveMud(chord(root + offset, 'major').map(note => note.midiNumber)));
    const probe = phrase.at(-1)![0] + majorScale[answerIndex];
    return {
      kind: config.kind, root, answer, notes: [probe], phrase: [...phrase, [probe]], inversion: 0,
      question: 'Where did that last note land in the key the phrase set up?',
      explanation: `The phrase resolved to its tonic, and the note after it was ${answer}.`,
    };
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
    // The chord sounds, then one of its notes on its own. Naming which member
    // that note was is a relative judgement inside the chord just heard; the
    // older form asked for its letter name, which needed absolute pitch.
    const quality = SEVENTH_QUALITIES[Math.floor(random() * SEVENTH_QUALITIES.length)];
    const voiced = seventhChord(root, quality);
    const heard = sounded(root, voiced.map(note => note.midiNumber));
    const target = voiced[answerIndex].midiNumber + (heard.root - root);
    return {
      kind: config.kind, root: heard.root, notes: [target], contextNotes: heard.notes, answer, inversion: 0, quality,
      question: 'Which member of that chord was the note after it?',
      explanation: `The chord was a ${quality}, and the note that followed was its ${answer}.`,
    };
  }
  if (config.kind === 'slash-chord') {
    const quality = triadQualities[Math.floor(random() * triadQualities.length)];
    // The bass is displaced from the triad root, and may be outside the triad
    // entirely, which is what separates a slash chord from a plain inversion.
    // The distance between the two is what is asked for: naming either pitch
    // outright would have required absolute pitch.
    const bass = root - (answerIndex + 1);
    const voiced = [bass, ...chord(root, quality).map(note => note.midiNumber)];
    const heard = sounded(bass, voiced);
    return {
      kind: config.kind, root: heard.root, notes: heard.notes, inversion: 0, quality, answer,
      question: 'How far below the upper triad is the bass?',
      explanation: `A ${quality} triad with its bass a ${answer} below the triad's root.`,
    };
  }
  if (config.kind === 'delayed-comparison') {
    const quality = triadQualities[Math.floor(random() * triadQualities.length)];
    const inversion = Math.floor(random() * 3);
    const first = chord(root, quality, inversion).map(note => note.midiNumber);
    const second =
      answer === 'identical' ? first
      : answer === 'quality changed' ? chord(root, triadQualities[(triadQualities.indexOf(quality) + 1 + Math.floor(random() * 3)) % triadQualities.length], inversion).map(note => note.midiNumber)
      : answer === 'root changed' ? chord(root + 1 + Math.floor(random() * 4), quality, inversion).map(note => note.midiNumber)
      : chord(root, quality, (inversion + 1 + Math.floor(random() * 2)) % 3).map(note => note.midiNumber);
    const phrase = [liftAboveMud(first), liftAboveMud(second)];
    return {
      kind: config.kind, root, answer, notes: phrase[1], phrase, inversion, quality,
      gapSeconds: DELAY_SECONDS[config.memoryDelay ?? 'none'],
      question: 'Hear both chords, then say what changed.',
      explanation: `The second chord ${answer === 'identical' ? 'was the same' : answer}.`,
    };
  }
  if (config.kind === 'multibar-memory') {
    const template = PROGRESSIONS[answerIndex % PROGRESSIONS.length];
    const stimulus = buildProgression(root % 12, template);
    return {
      kind: config.kind, root, answer: ANSWERS['multibar-memory'][answerIndex % PROGRESSIONS.length],
      notes: stimulus.chords.at(-1)!, phrase: stimulus.chords.map(liftAboveMud), inversion: 0,
      // Heard once: reconstruction from memory, not from repeated listening.
      replayLimit: 1,
      question: 'One listen only. Which progression was that?',
      explanation: `${stimulus.name} in ${NOTE_NAMES[stimulus.keyPitchClass]} — ${stimulus.roman}.`,
    };
  }
  const pitches = config.kind === 'triad' ? chord(root, answer as ChordQuality, 0) : seventhChord(root, answer as SeventhQuality, 0);
  // Inversion is capped by the notes a quality actually has, so a power chord
  // cannot be asked for a third inversion it does not possess.
  const inversion = config.inversions ? Math.floor(random() * Math.min(config.kind === 'triad' ? 3 : 4, pitches.length)) : 0;
  const voiced = config.kind === 'triad' ? chord(root, answer as ChordQuality, inversion) : seventhChord(root, answer as SeventhQuality, inversion);
  return { kind: config.kind, ...sounded(root, voiced.map(note => note.midiNumber)), answer, inversion };
}

export const RECOGNITION_KINDS: readonly ExerciseKind[] = ['scale-degree', 'interval', 'triad', 'seventh', 'bass', 'tonal-center', 'mode', 'extension', 'altered', 'decomposition', 'slash-chord', 'delayed-comparison', 'multibar-memory'];

/** `available` narrows the recommendation to the drills a section gate has opened. */
export function recommendKind(attempts: { exercise: string; correct: boolean }[], available: readonly ExerciseKind[] = RECOGNITION_KINDS): ExerciseKind {
  const kinds: ExerciseKind[] = available.length ? [...available] : [...RECOGNITION_KINDS];
  return kinds.map(kind => { const relevant = attempts.filter(item => item.exercise === `${kind}-recognition`).slice(-20); return { kind, score: relevant.length ? relevant.filter(item => item.correct).length / relevant.length : -1 }; }).sort((a, b) => a.score - b.score)[0].kind;
}
