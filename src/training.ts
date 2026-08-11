import { chord, melodicInterval, seededRandom, seventhChord, type ChordQuality, type SeventhQuality } from './theory';

export type ExerciseKind = 'interval' | 'triad' | 'seventh';
export interface DrillConfig { kind: ExerciseKind; rootPool: 'all' | 'white'; inversions: boolean; melodic: boolean }
export interface Stimulus { kind: ExerciseKind; root: number; answer: string; notes: number[]; inversion: number; direction?: 'ascending' | 'descending' }

export const ANSWERS: Record<ExerciseKind, readonly string[]> = {
  interval: ['minor 2nd', 'major 2nd', 'minor 3rd', 'major 3rd', 'perfect 4th', 'tritone', 'perfect 5th', 'minor 6th', 'major 6th', 'minor 7th', 'major 7th', 'octave'],
  triad: ['major', 'minor', 'diminished', 'augmented'],
  seventh: ['major 7', 'dominant 7', 'minor 7', 'half-diminished 7']
};
const intervalSizes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const whitePitchClasses = [0, 2, 4, 5, 7, 9, 11];

export function generateStimulus(seed: number, config: DrillConfig): Stimulus {
  const random = seededRandom(seed);
  const pool = config.rootPool === 'white' ? whitePitchClasses : Array.from({ length: 12 }, (_, index) => index);
  const root = 48 + pool[Math.floor(random() * pool.length)];
  const answers = ANSWERS[config.kind];
  const answerIndex = Math.floor(random() * answers.length);
  const answer = answers[answerIndex];
  if (config.kind === 'interval') {
    const direction = random() > .5 ? 'ascending' : 'descending';
    const size = intervalSizes[answerIndex];
    const notes = config.melodic ? melodicInterval(root, size, direction).map(note => note.midiNumber) : [root, root + size];
    return { kind: config.kind, root, answer, notes, inversion: 0, direction };
  }
  const inversion = config.inversions ? Math.floor(random() * (config.kind === 'triad' ? 3 : 4)) : 0;
  const pitches = config.kind === 'triad' ? chord(root, answer as ChordQuality, inversion) : seventhChord(root, answer as SeventhQuality, inversion);
  return { kind: config.kind, root, answer, notes: pitches.map(note => note.midiNumber), inversion };
}

export function recommendKind(attempts: { exercise: string; correct: boolean }[]): ExerciseKind {
  const kinds: ExerciseKind[] = ['interval', 'triad', 'seventh'];
  return kinds.map(kind => {
    const relevant = attempts.filter(item => item.exercise === `${kind}-recognition`).slice(-20);
    return { kind, score: relevant.length ? relevant.filter(item => item.correct).length / relevant.length : -1 };
  }).sort((a, b) => a.score - b.score)[0].kind;
}
