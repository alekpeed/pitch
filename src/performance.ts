import { buildProgression, PROGRESSIONS } from './harmony';
import { chord, NOTE_NAMES, seededRandom, seventhChord } from './theory';
import { generateVoicing, type VoicingStyle } from './voicing';

/* ------------------------------------------------- call and response (68) */

export type CallKind = 'melody' | 'bass' | 'chord' | 'voicing';
export interface CallResponse {
  kind: CallKind; phrase: number[][]; expected: number[]; ordered: boolean; instruction: string; label: string;
}

/**
 * The app plays; the user reproduces. Melodic calls are graded in order, and
 * simultaneous ones as a set, because a chord has no inherent note order.
 */
export function generateCall(seed: number, kind: CallKind): CallResponse {
  const random = seededRandom(seed);
  const key = Math.floor(random() * 12);
  if (kind === 'chord' || kind === 'voicing') {
    const style: VoicingStyle = kind === 'voicing'
      ? (['shell', 'rootless', 'drop-2', 'spread'] as const)[Math.floor(random() * 4)]
      : 'close';
    const quality = (['major 7', 'dominant 7', 'minor 7'] as const)[Math.floor(random() * 3)];
    const expected = generateVoicing({ rootPitchClass: key, quality, style });
    return {
      kind, phrase: [expected], expected, ordered: false,
      instruction: 'Play back the voicing you just heard.',
      label: `${NOTE_NAMES[key]} ${quality}, ${style}`,
    };
  }
  const template = PROGRESSIONS[Math.floor(random() * PROGRESSIONS.length)];
  const progression = buildProgression(key, template);
  if (kind === 'bass') {
    const expected = progression.chords.map(notes => Math.min(...notes));
    return {
      kind, phrase: expected.map(note => [note]), expected, ordered: true,
      instruction: 'Play back the bass line you just heard.',
      label: `${progression.name} in ${NOTE_NAMES[key]}`,
    };
  }
  // A short melodic call: the top voice of each chord, which is what the ear follows.
  const expected = progression.chords.map(notes => Math.max(...notes));
  return {
    kind, phrase: expected.map(note => [note]), expected, ordered: true,
    instruction: 'Play back the melody you just heard.',
    label: `${progression.name} in ${NOTE_NAMES[key]}`,
  };
}

export function gradeCall(call: CallResponse, played: readonly number[], octaveEquivalent = true) {
  const fold = (note: number) => octaveEquivalent ? ((note % 12) + 12) % 12 : note;
  if (call.ordered) {
    const perItem = call.expected.map((note, index) => played[index] !== undefined && fold(note) === fold(played[index]));
    return { perItem, matched: perItem.filter(Boolean).length, total: call.expected.length, correct: perItem.every(Boolean) && played.length === call.expected.length };
  }
  const wanted = new Set(call.expected.map(fold));
  const given = new Set(played.map(fold));
  const perItem = call.expected.map(note => given.has(fold(note)));
  return { perItem, matched: perItem.filter(Boolean).length, total: call.expected.length, correct: wanted.size === given.size && [...wanted].every(note => given.has(note)) };
}

/* ------------------------------------------------------- fretboard (70) */

/** Standard tuning, low to high. */
export const GUITAR_TUNING = [40, 45, 50, 55, 59, 64] as const;
export const FRET_COUNT = 12;

export const fretToMidi = (stringIndex: number, fret: number) => GUITAR_TUNING[stringIndex] + fret;

/** Every place on the neck where a pitch can be played, for showing alternatives. */
export function fretPositions(midi: number): { stringIndex: number; fret: number }[] {
  return GUITAR_TUNING.flatMap((open, stringIndex) => {
    const fret = midi - open;
    return fret >= 0 && fret <= FRET_COUNT ? [{ stringIndex, fret }] : [];
  });
}

export const isPlayableOnGuitar = (midi: number) => fretPositions(midi).length > 0;

/* --------------------------------------------- functional prompts (71) */

export interface FunctionalPrompt { instruction: string; expected: number[]; label: string; policy: 'exact' | 'equivalent' }

const FUNCTIONAL_STYLES: VoicingStyle[] = ['rootless', 'shell', 'drop-2', 'spread'];

export function generateFunctionalPrompt(seed: number): FunctionalPrompt {
  const random = seededRandom(seed);
  const key = Math.floor(random() * 12);
  // Half the prompts ask for a whole voicing, half for a single chord member —
  // "play a rootless ii–V–I in E♭" versus "play the 7th of V7".
  if (random() > .5) {
    const style = FUNCTIONAL_STYLES[Math.floor(random() * FUNCTIONAL_STYLES.length)];
    const quality = (['major 7', 'dominant 7', 'minor 7'] as const)[Math.floor(random() * 3)];
    return {
      instruction: `Play a ${style} ${quality} on ${NOTE_NAMES[key]}.`,
      expected: generateVoicing({ rootPitchClass: key, quality, style }),
      label: `${NOTE_NAMES[key]} ${quality} (${style})`,
      policy: 'equivalent',
    };
  }
  const degrees = [
    { roman: 'V7', offset: 7, quality: 'dominant 7' as const },
    { roman: 'ii7', offset: 2, quality: 'minor 7' as const },
    { roman: 'Imaj7', offset: 0, quality: 'major 7' as const },
  ];
  const degree = degrees[Math.floor(random() * degrees.length)];
  const members = ['root', '3rd', '5th', '7th'];
  const memberIndex = Math.floor(random() * members.length);
  const notes = seventhChord(48 + ((key + degree.offset) % 12), degree.quality).map(note => note.midiNumber);
  return {
    instruction: `In ${NOTE_NAMES[key]}, play the ${members[memberIndex]} of ${degree.roman}.`,
    expected: [notes[memberIndex]],
    label: `${members[memberIndex]} of ${degree.roman} in ${NOTE_NAMES[key]}`,
    policy: 'equivalent',
  };
}

export const triadFor = (rootMidi: number) => chord(rootMidi, 'major').map(note => note.midiNumber);
