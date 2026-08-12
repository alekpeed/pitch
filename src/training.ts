import { chord, liftAboveMud, melodicInterval, seededRandom, seventhChord, type ChordQuality, type SeventhQuality } from './theory';

export type ExerciseKind = 'scale-degree' | 'interval' | 'triad' | 'seventh' | 'bass';
export type Register = 'low' | 'middle' | 'high' | 'random';
export type Timbre = 'piano' | 'rhodes' | 'organ';
export interface DrillConfig { kind: ExerciseKind; rootPool: 'all' | 'white'; inversions: boolean; melodic: boolean; register: Register; timbre: Timbre }
export interface Stimulus { kind: ExerciseKind; root: number; answer: string; notes: number[]; inversion: number; contextNotes?: number[]; direction?: 'ascending' | 'descending'; quality?: string }

export const ANSWERS: Record<ExerciseKind, readonly string[]> = {
  'scale-degree': ['1 · tonic', '2 · supertonic', '3 · mediant', '4 · subdominant', '5 · dominant', '6 · submediant', '7 · leading tone'],
  interval: ['minor 2nd', 'major 2nd', 'minor 3rd', 'major 3rd', 'perfect 4th', 'tritone', 'perfect 5th', 'minor 6th', 'major 6th', 'minor 7th', 'major 7th', 'octave'],
  triad: ['major', 'minor', 'diminished', 'augmented'],
  seventh: ['major 7', 'dominant 7', 'minor 7', 'half-diminished 7'],
  bass: ['root in bass', 'third in bass', 'fifth in bass']
};
const intervalSizes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const majorScale = [0, 2, 4, 5, 7, 9, 11];
const whitePitchClasses = [0, 2, 4, 5, 7, 9, 11];
// C3 / G3 / D4. The old low base of C2 put whole triads an octave below the
// point where close spacing stays intelligible, which is the main reason drills
// sounded muddy.
const registerBases: Record<Exclude<Register, 'random'>, number> = { low: 48, middle: 55, high: 62 };
const triadQualities: ChordQuality[] = ['major', 'minor', 'diminished', 'augmented'];

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
  const answers = ANSWERS[config.kind];
  const answerIndex = Math.floor(random() * answers.length);
  const answer = answers[answerIndex];
  if (config.kind === 'scale-degree') {
    return { kind: config.kind, root, answer, notes: [root + majorScale[answerIndex]], contextNotes: liftAboveMud(chord(root, 'major').map(note => note.midiNumber)), inversion: 0 };
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
  const inversion = config.inversions ? Math.floor(random() * (config.kind === 'triad' ? 3 : 4)) : 0;
  const pitches = config.kind === 'triad' ? chord(root, answer as ChordQuality, inversion) : seventhChord(root, answer as SeventhQuality, inversion);
  return { kind: config.kind, ...sounded(root, pitches.map(note => note.midiNumber)), answer, inversion };
}

export function recommendKind(attempts: { exercise: string; correct: boolean }[]): ExerciseKind {
  const kinds: ExerciseKind[] = ['scale-degree', 'interval', 'triad', 'seventh', 'bass'];
  return kinds.map(kind => { const relevant = attempts.filter(item => item.exercise === `${kind}-recognition`).slice(-20); return { kind, score: relevant.length ? relevant.filter(item => item.correct).length / relevant.length : -1 }; }).sort((a, b) => a.score - b.score)[0].kind;
}
