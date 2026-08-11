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

export function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; };
}
