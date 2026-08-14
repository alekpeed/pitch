export const NOTE_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'] as const;
export type NoteName = (typeof NOTE_NAMES)[number];
export type ChordQuality = 'major' | 'minor' | 'diminished' | 'augmented' | 'sus2' | 'sus4' | 'power';
export type SeventhQuality = 'major 7' | 'dominant 7' | 'minor 7' | 'half-diminished 7' | 'minor-major 7' | 'diminished 7' | 'augmented 7' | 'augmented major 7';
export type ExtensionQuality = '6' | 'minor 6' | '6/9' | 'add9' | 'major 9' | 'dominant 9' | 'minor 9' | 'dominant 11' | 'minor 11' | 'dominant 13';
export type AlteredQuality = '7\u266d9' | '7\u266f9' | '7\u266d5' | '7\u266f11' | '7\u266f5' | '7\u266d13' | '7\u266f9\u266f5';
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

const structures: Record<ChordQuality, readonly number[]> = {
  major: [0, 4, 7], minor: [0, 3, 7], diminished: [0, 3, 6], augmented: [0, 4, 8],
  sus2: [0, 2, 7], sus4: [0, 5, 7], power: [0, 7],
};
const seventhStructures: Record<SeventhQuality, readonly number[]> = {
  'major 7': [0, 4, 7, 11], 'dominant 7': [0, 4, 7, 10],
  'minor 7': [0, 3, 7, 10], 'half-diminished 7': [0, 3, 6, 10],
  'minor-major 7': [0, 3, 7, 11], 'diminished 7': [0, 3, 6, 9],
  'augmented 7': [0, 4, 8, 10], 'augmented major 7': [0, 4, 8, 11],
};
/** Colour tones. The 11th omits the 3rd, as it is voiced in practice. */
export const EXTENSION_STRUCTURES: Record<ExtensionQuality, readonly number[]> = {
  '6': [0, 4, 7, 9], 'minor 6': [0, 3, 7, 9], '6/9': [0, 4, 7, 9, 14], add9: [0, 4, 7, 14],
  'major 9': [0, 4, 7, 11, 14], 'dominant 9': [0, 4, 7, 10, 14], 'minor 9': [0, 3, 7, 10, 14],
  'dominant 11': [0, 7, 10, 14, 17], 'minor 11': [0, 3, 7, 10, 14, 17], 'dominant 13': [0, 4, 7, 10, 14, 21],
};
export const ALTERED_STRUCTURES: Record<AlteredQuality, readonly number[]> = {
  '7\u266d9': [0, 4, 7, 10, 13], '7\u266f9': [0, 4, 7, 10, 15], '7\u266d5': [0, 4, 6, 10],
  '7\u266f11': [0, 4, 7, 10, 18], '7\u266f5': [0, 4, 8, 10], '7\u266d13': [0, 4, 7, 10, 20],
  '7\u266f9\u266f5': [0, 4, 8, 10, 15],
};
export const TRIAD_QUALITIES = Object.keys(structures) as ChordQuality[];
export const SEVENTH_QUALITIES = Object.keys(seventhStructures) as SeventhQuality[];
export const EXTENSION_QUALITIES = Object.keys(EXTENSION_STRUCTURES) as ExtensionQuality[];
export const ALTERED_QUALITIES = Object.keys(ALTERED_STRUCTURES) as AlteredQuality[];
/** Tertian qualities only — the ones with a real third and fifth to put in the bass. */
export const TERTIAN_TRIADS: ChordQuality[] = ['major', 'minor', 'diminished', 'augmented'];

const rotate = (notes: number[], inversion: number) => {
  const voiced = [...notes];
  for (let index = 0; index < Math.min(inversion, voiced.length - 1); index += 1) voiced.push((voiced.shift() as number) + 12);
  return voiced;
};

/** Builds any structure from the tables above, inverting within the notes it has. */
export function voiceChord(rootMidi: number, intervals: readonly number[], inversion = 0): Pitch[] {
  return rotate(intervals.map(value => rootMidi + value), inversion).map(pitch);
}

export function chord(rootMidi: number, quality: ChordQuality, inversion = 0): Pitch[] {
  if (!Number.isInteger(inversion) || inversion < 0 || inversion > 2) throw new RangeError('Triad inversion must be 0, 1, or 2');
  return voiceChord(rootMidi, structures[quality], inversion);
}

export function seventhChord(rootMidi: number, quality: SeventhQuality, inversion = 0): Pitch[] {
  if (!Number.isInteger(inversion) || inversion < 0 || inversion > 3) throw new RangeError('Seventh-chord inversion must be 0 through 3');
  return voiceChord(rootMidi, seventhStructures[quality], inversion);
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

/**
 * Every generator in the app calls this, and every "next prompt" advances the
 * seed by exactly 1 (or reseeds from Date.now(), which moves by 1 per
 * millisecond) — so nearby seeds are the normal case, not an edge case. A raw
 * LCG's *first* output is nearly linear in the seed (multiplying a delta of 1
 * by the LCG's own multiplier is still a tiny fraction of the output range),
 * so seed and seed+1 produced almost the same first draw — measured at ~215
 * consecutive seeds before that draw moved to a different bucket at all. Any
 * generator whose most salient value is the first random() call (a chord
 * root, say) looked stuck on one answer for hundreds of prompts in a row.
 * Scrambling the seed once with a standard integer finalizer (Murmur3's
 * fmix32) before iterating fixes that: two adjacent seeds now produce
 * unrelated starting states, so the first draw decorrelates immediately,
 * while a given seed still always produces the same sequence.
 */
function scramble(seed: number): number {
  let h = seed >>> 0;
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

export function seededRandom(seed: number) {
  let value = scramble(seed);
  return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; };
}
