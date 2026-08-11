import { chord, seventhChord, seededRandom, type ChordQuality, type SeventhQuality } from './theory';

export type HarmonyResponseMode = 'roman' | 'function';
export type HarmonicFunction = 'authentic cadence' | 'predominant–dominant–tonic' | 'deceptive cadence' | 'plagal cadence' | 'secondary dominant' | 'modal mixture' | 'tritone substitution';
interface HarmonyChord { roman: string; offset: number; quality: ChordQuality | SeventhQuality }
export interface ProgressionTemplate { id: string; name: string; function: HarmonicFunction; chords: readonly HarmonyChord[] }
export interface HarmonyStimulus { keyPitchClass: number; templateId: string; name: string; function: HarmonicFunction; roman: string; chords: number[][]; notes: number[] }

export const PROGRESSIONS: readonly ProgressionTemplate[] = [
  { id: 'authentic', name: 'Authentic cadence', function: 'authentic cadence', chords: [{ roman: 'I', offset: 0, quality: 'major' }, { roman: 'V7', offset: 7, quality: 'dominant 7' }, { roman: 'I', offset: 0, quality: 'major' }] },
  { id: 'two-five-one', name: 'ii–V–I', function: 'predominant–dominant–tonic', chords: [{ roman: 'ii7', offset: 2, quality: 'minor 7' }, { roman: 'V7', offset: 7, quality: 'dominant 7' }, { roman: 'Imaj7', offset: 0, quality: 'major 7' }] },
  { id: 'deceptive', name: 'Deceptive cadence', function: 'deceptive cadence', chords: [{ roman: 'IV', offset: 5, quality: 'major' }, { roman: 'V7', offset: 7, quality: 'dominant 7' }, { roman: 'vi', offset: 9, quality: 'minor' }] },
  { id: 'plagal', name: 'Plagal cadence', function: 'plagal cadence', chords: [{ roman: 'I', offset: 0, quality: 'major' }, { roman: 'IV', offset: 5, quality: 'major' }, { roman: 'I', offset: 0, quality: 'major' }] },
  { id: 'secondary-dominant', name: 'Secondary dominant', function: 'secondary dominant', chords: [{ roman: 'I', offset: 0, quality: 'major' }, { roman: 'V7/V', offset: 2, quality: 'dominant 7' }, { roman: 'V7', offset: 7, quality: 'dominant 7' }, { roman: 'I', offset: 0, quality: 'major' }] },
  { id: 'modal-mixture', name: 'Borrowed minor iv', function: 'modal mixture', chords: [{ roman: 'I', offset: 0, quality: 'major' }, { roman: 'iv', offset: 5, quality: 'minor' }, { roman: 'I', offset: 0, quality: 'major' }] },
  { id: 'tritone-sub', name: 'Tritone substitution', function: 'tritone substitution', chords: [{ roman: 'ii7', offset: 2, quality: 'minor 7' }, { roman: '♭II7', offset: 1, quality: 'dominant 7' }, { roman: 'Imaj7', offset: 0, quality: 'major 7' }] }
] as const;

export const harmonyAnswers = (mode: HarmonyResponseMode) => [...new Set(PROGRESSIONS.map(item => mode === 'roman' ? item.chords.map(value => value.roman).join(' – ') : item.function))];

export function buildProgression(keyPitchClass: number, template: ProgressionTemplate): HarmonyStimulus {
  if (!Number.isInteger(keyPitchClass) || keyPitchClass < 0 || keyPitchClass > 11) throw new RangeError('Key pitch class must be 0 through 11');
  const chords = template.chords.map(item => {
    const root = 48 + keyPitchClass + item.offset;
    return (item.quality.includes('7') ? seventhChord(root, item.quality as SeventhQuality) : chord(root, item.quality as ChordQuality)).map(note => note.midiNumber);
  });
  return { keyPitchClass, templateId: template.id, name: template.name, function: template.function, roman: template.chords.map(item => item.roman).join(' – '), chords, notes: chords.flat() };
}

export function generateHarmony(seed: number): HarmonyStimulus {
  const random = seededRandom(seed); const key = Math.floor(random() * 12); const template = PROGRESSIONS[Math.floor(random() * PROGRESSIONS.length)];
  return buildProgression(key, template);
}
