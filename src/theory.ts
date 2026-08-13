export const NOTE_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'] as const;
export type NoteName = (typeof NOTE_NAMES)[number];
export type ChordQuality = 'major' | 'minor' | 'diminished' | 'augmented';
export type SeventhQuality = 'major 7' | 'dominant 7' | 'minor 7' | 'half-diminished 7';
export interface Pitch { midiNumber: number; pitchClass: number; octave: number; spelling: NoteName }

export function pitch(midiNumber: number): Pitch {
  if (!Number.isInteger(midiNumber) || midiNumber < 0 || midiNumber > 127) throw new RangeError('MIDI note must be an integer from 0 to 127');
  const pitchClass = midiNumber % 12;
  return { midiNumber, pitchClass, octave: Math.floor(midiNumber / 12) - 1, spelling: NOTE_NAMES[pitchClass] };
}

export function frequency(midiNumber: number) { return 440 * 2 ** ((midiNumber - 69) / 12); }

/** Semitones above the tonic, indexed so position === chromatic degree. */
export const CHROMATIC_STEPS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;
export const CHROMATIC_DEGREES = ['1', '\u266d2', '2', '\u266d3', '3', '4', '\u266f4', '5', '\u266d6', '6', '\u266d7', '7'] as const;
export const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11] as const;

export type ModeName = 'Ionian' | 'Dorian' | 'Phrygian' | 'Lydian' | 'Mixolydian' | 'Aeolian' | 'Locrian';
/**
 * Modes are identified by the degree that separates them from their nearest
 * neighbour, never by mood, so the characteristic degree travels with the mode.
 */
export const MODES: Record<ModeName, { intervals: readonly number[]; characteristic: string }> = {
  Ionian: { intervals: [0, 2, 4, 5, 7, 9, 11], characteristic: 'natural 4th against a major 3rd' },
  Dorian: { intervals: [0, 2, 3, 5, 7, 9, 10], characteristic: 'natural 6th over a minor 3rd' },
  Phrygian: { intervals: [0, 1, 3, 5, 7, 8, 10], characteristic: 'flat 2nd' },
  Lydian: { intervals: [0, 2, 4, 6, 7, 9, 11], characteristic: 'sharp 4th' },
  Mixolydian: { intervals: [0, 2, 4, 5, 7, 9, 10], characteristic: 'flat 7th' },
  Aeolian: { intervals: [0, 2, 3, 5, 7, 8, 10], characteristic: 'flat 6th' },
  Locrian: { intervals: [0, 1, 3, 5, 6, 8, 10], characteristic: 'flat 5th' },
};
export const MODE_NAMES = Object.keys(MODES) as ModeName[];

const structures: Record<ChordQuality, readonly number[]> = { major: [0, 4, 7], minor: [0, 3, 7], diminished: [0, 3, 6], augmented: [0, 4, 8] };
const seventhStructures: Record<SeventhQuality, readonly number[]> = {
  'major 7': [0, 4, 7, 11], 'dominant 7': [0, 4, 7, 10],
  'minor 7': [0, 3, 7, 10], 'half-diminished 7': [0, 3, 6, 10]
};

export function chord(rootMidi: number, quality: ChordQuality, inversion = 0): Pitch[] {
  if (!Number.isInteger(inversion) || inversion < 0 || inversion > 2) throw new RangeError('Triad inversion must be 0, 1, or 2');
  const notes = structures[quality].map(value => rootMidi + value);
  for (let i = 0; i < inversion; i += 1) notes.push((notes.shift() as number) + 12);
  return notes.map(pitch);
}

export function seventhChord(rootMidi: number, quality: SeventhQuality, inversion = 0): Pitch[] {
  if (!Number.isInteger(inversion) || inversion < 0 || inversion > 3) throw new RangeError('Seventh-chord inversion must be 0 through 3');
  const notes = [...seventhStructures[quality]].map(value => rootMidi + value);
  for (let i = 0; i < inversion; i += 1) notes.push((notes.shift() as number) + 12);
  return notes.map(pitch);
}

export function melodicInterval(rootMidi: number, semitones: number, direction: 'ascending' | 'descending'): Pitch[] {
  return [pitch(rootMidi), pitch(rootMidi + (direction === 'ascending' ? semitones : -semitones))];
}

// Minimum spacing, in semitones, allowed between adjacent notes given the lower
// note of the pair. Stacking intervals tighter than this low in the register is
// what turns a chord to mud. Tuned for piano rather than sustained orchestral
// voices, so it is slightly more permissive than the classical table.
const lowIntervalLimits: readonly (readonly [number, number])[] = [[40, 12], [45, 7], [48, 5], [52, 3]];

export function minimumSpacing(lowerMidi: number) {
  for (const [ceiling, semitones] of lowIntervalLimits) if (lowerMidi < ceiling) return semitones;
  return 0;
}

export function respectsLowIntervalLimit(midiNotes: number[]) {
  const sorted = [...midiNotes].sort((a, b) => a - b);
  return sorted.every((note, index) => index === 0 || note - sorted[index - 1] >= minimumSpacing(sorted[index - 1]));
}

// Transposes the whole set up by octaves until it clears the limit. Moving every
// note together preserves the intervals, the inversion, and which chord member is
// in the bass, so only the absolute register changes and grading stays valid.
export function liftAboveMud(midiNotes: number[], ceiling = 84): number[] {
  let lifted = [...midiNotes];
  while (!respectsLowIntervalLimit(lifted) && Math.max(...lifted) + 12 <= ceiling) lifted = lifted.map(note => note + 12);
  return lifted;
}

export function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; };
}
