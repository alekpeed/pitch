import { chord, liftAboveMud, NOTE_NAMES, respectsLowIntervalLimit, seededRandom, seventhChord, type ChordQuality, type SeventhQuality } from './theory';

export type HarmonyResponseMode = 'roman' | 'function' | 'modulation' | 'pivot';
export type HarmonicFunction =
  | 'authentic cadence' | 'half cadence' | 'predominant–dominant–tonic' | 'deceptive cadence' | 'plagal cadence'
  | 'secondary dominant' | 'modal mixture' | 'tritone substitution' | 'backdoor dominant' | 'diminished passing'
  | 'chromatic mediant' | 'pedal point' | 'modulation' | 'circle progression' | 'blues' | 'rhythm changes';
interface HarmonyChord { roman: string; offset: number; quality: ChordQuality | SeventhQuality }
export interface ProgressionTemplate {
  id: string; name: string; function: HarmonicFunction; chords: readonly HarmonyChord[];
  /** Scale degree held in the bass throughout, for pedal-point templates. */
  pedal?: number;
  /** Semitones from the opening key to the key the progression lands in. */
  modulatesTo?: number;
  /** Index of the chord that belongs to both keys. */
  pivotIndex?: number;
}
export interface HarmonyStimulus {
  keyPitchClass: number; templateId: string; name: string; function: HarmonicFunction; roman: string;
  chords: number[][]; notes: number[]; pedalNote?: number; destinationKey?: number; pivotIndex?: number; pivotRoman?: string;
}

export const PROGRESSIONS: readonly ProgressionTemplate[] = [
  { id: 'authentic', name: 'Authentic cadence', function: 'authentic cadence', chords: [{ roman: 'I', offset: 0, quality: 'major' }, { roman: 'V7', offset: 7, quality: 'dominant 7' }, { roman: 'I', offset: 0, quality: 'major' }] },
  { id: 'two-five-one', name: 'ii–V–I', function: 'predominant–dominant–tonic', chords: [{ roman: 'ii7', offset: 2, quality: 'minor 7' }, { roman: 'V7', offset: 7, quality: 'dominant 7' }, { roman: 'Imaj7', offset: 0, quality: 'major 7' }] },
  { id: 'deceptive', name: 'Deceptive cadence', function: 'deceptive cadence', chords: [{ roman: 'IV', offset: 5, quality: 'major' }, { roman: 'V7', offset: 7, quality: 'dominant 7' }, { roman: 'vi', offset: 9, quality: 'minor' }] },
  { id: 'plagal', name: 'Plagal cadence', function: 'plagal cadence', chords: [{ roman: 'I', offset: 0, quality: 'major' }, { roman: 'IV', offset: 5, quality: 'major' }, { roman: 'I', offset: 0, quality: 'major' }] },
  { id: 'secondary-dominant', name: 'Secondary dominant', function: 'secondary dominant', chords: [{ roman: 'I', offset: 0, quality: 'major' }, { roman: 'V7/V', offset: 2, quality: 'dominant 7' }, { roman: 'V7', offset: 7, quality: 'dominant 7' }, { roman: 'I', offset: 0, quality: 'major' }] },
  { id: 'modal-mixture', name: 'Borrowed minor iv', function: 'modal mixture', chords: [{ roman: 'I', offset: 0, quality: 'major' }, { roman: 'iv', offset: 5, quality: 'minor' }, { roman: 'I', offset: 0, quality: 'major' }] },
  { id: 'tritone-sub', name: 'Tritone substitution', function: 'tritone substitution', chords: [{ roman: 'ii7', offset: 2, quality: 'minor 7' }, { roman: '♭II7', offset: 1, quality: 'dominant 7' }, { roman: 'Imaj7', offset: 0, quality: 'major 7' }] },

  // --- progression chunks -------------------------------------------------
  { id: 'one-six-two-five', name: 'I–vi–ii–V', function: 'circle progression', chords: [{ roman: 'I', offset: 0, quality: 'major' }, { roman: 'vi', offset: 9, quality: 'minor' }, { roman: 'ii7', offset: 2, quality: 'minor 7' }, { roman: 'V7', offset: 7, quality: 'dominant 7' }] },
  { id: 'axis', name: 'I–V–vi–IV', function: 'circle progression', chords: [{ roman: 'I', offset: 0, quality: 'major' }, { roman: 'V', offset: 7, quality: 'major' }, { roman: 'vi', offset: 9, quality: 'minor' }, { roman: 'IV', offset: 5, quality: 'major' }] },
  { id: 'circle-fifths', name: 'Circle of fifths', function: 'circle progression', chords: [{ roman: 'iii7', offset: 4, quality: 'minor 7' }, { roman: 'vi7', offset: 9, quality: 'minor 7' }, { roman: 'ii7', offset: 2, quality: 'minor 7' }, { roman: 'V7', offset: 7, quality: 'dominant 7' }] },
  { id: 'blues', name: 'Blues turnaround', function: 'blues', chords: [{ roman: 'I7', offset: 0, quality: 'dominant 7' }, { roman: 'IV7', offset: 5, quality: 'dominant 7' }, { roman: 'I7', offset: 0, quality: 'dominant 7' }, { roman: 'V7', offset: 7, quality: 'dominant 7' }] },
  { id: 'rhythm-changes', name: 'Rhythm changes A', function: 'rhythm changes', chords: [{ roman: 'I', offset: 0, quality: 'major' }, { roman: 'vi7', offset: 9, quality: 'minor 7' }, { roman: 'ii7', offset: 2, quality: 'minor 7' }, { roman: 'V7', offset: 7, quality: 'dominant 7' }, { roman: 'I', offset: 0, quality: 'major' }] },

  // --- cadences -----------------------------------------------------------
  { id: 'half', name: 'Half cadence', function: 'half cadence', chords: [{ roman: 'I', offset: 0, quality: 'major' }, { roman: 'ii7', offset: 2, quality: 'minor 7' }, { roman: 'V', offset: 7, quality: 'major' }] },
  { id: 'backdoor', name: 'Backdoor dominant', function: 'backdoor dominant', chords: [{ roman: 'IV', offset: 5, quality: 'major' }, { roman: '♭VII7', offset: 10, quality: 'dominant 7' }, { roman: 'Imaj7', offset: 0, quality: 'major 7' }] },

  // --- modal interchange --------------------------------------------------
  { id: 'flat-six', name: 'Borrowed ♭VI', function: 'modal mixture', chords: [{ roman: 'I', offset: 0, quality: 'major' }, { roman: '♭VI', offset: 8, quality: 'major' }, { roman: 'I', offset: 0, quality: 'major' }] },
  { id: 'flat-seven', name: 'Borrowed ♭VII', function: 'modal mixture', chords: [{ roman: 'I', offset: 0, quality: 'major' }, { roman: '♭VII', offset: 10, quality: 'major' }, { roman: 'I', offset: 0, quality: 'major' }] },
  { id: 'half-dim-two', name: 'Borrowed iiø7', function: 'modal mixture', chords: [{ roman: 'iiø7', offset: 2, quality: 'half-diminished 7' }, { roman: 'V7', offset: 7, quality: 'dominant 7' }, { roman: 'I', offset: 0, quality: 'major' }] },

  // --- chromatic colour ---------------------------------------------------
  { id: 'dim-passing', name: 'Diminished passing chord', function: 'diminished passing', chords: [{ roman: 'I', offset: 0, quality: 'major' }, { roman: '♯iº7', offset: 1, quality: 'diminished 7' }, { roman: 'ii7', offset: 2, quality: 'minor 7' }, { roman: 'V7', offset: 7, quality: 'dominant 7' }] },
  { id: 'chromatic-mediant', name: 'Chromatic mediant', function: 'chromatic mediant', chords: [{ roman: 'I', offset: 0, quality: 'major' }, { roman: '♭III', offset: 3, quality: 'major' }, { roman: 'I', offset: 0, quality: 'major' }] },

  // --- pedal point: the bass stays put while the harmony moves over it -----
  { id: 'tonic-pedal', name: 'Tonic pedal', function: 'pedal point', pedal: 0, chords: [{ roman: 'I', offset: 0, quality: 'major' }, { roman: 'IV', offset: 5, quality: 'major' }, { roman: 'V', offset: 7, quality: 'major' }, { roman: 'I', offset: 0, quality: 'major' }] },
  { id: 'dominant-pedal', name: 'Dominant pedal', function: 'pedal point', pedal: 7, chords: [{ roman: 'V', offset: 7, quality: 'major' }, { roman: 'IV', offset: 5, quality: 'major' }, { roman: 'I', offset: 0, quality: 'major' }, { roman: 'V7', offset: 7, quality: 'dominant 7' }] },

  // --- modulation: the pivot belongs to both keys -------------------------
  { id: 'modulate-dominant', name: 'Modulation to the dominant', function: 'modulation', modulatesTo: 7, pivotIndex: 1, chords: [{ roman: 'I', offset: 0, quality: 'major' }, { roman: 'vi', offset: 9, quality: 'minor' }, { roman: 'V7/V', offset: 2, quality: 'dominant 7' }, { roman: 'V', offset: 7, quality: 'major' }] },
  { id: 'modulate-relative', name: 'Modulation to the relative minor', function: 'modulation', modulatesTo: 9, pivotIndex: 1, chords: [{ roman: 'I', offset: 0, quality: 'major' }, { roman: 'IV', offset: 5, quality: 'major' }, { roman: 'V7/vi', offset: 4, quality: 'dominant 7' }, { roman: 'vi', offset: 9, quality: 'minor' }] },
] as const;

export const MODULATION_ANSWERS = NOTE_NAMES;

export function harmonyAnswers(mode: HarmonyResponseMode, stimulus?: HarmonyStimulus): readonly string[] {
  if (mode === 'modulation') return MODULATION_ANSWERS;
  // The pivot is one of the chords actually heard, so the options come from the stimulus.
  if (mode === 'pivot') return stimulus ? stimulus.roman.split(' – ') : [];
  return [...new Set(PROGRESSIONS.map(item => mode === 'roman' ? item.chords.map(value => value.roman).join(' – ') : item.function))];
}

/**
 * Base register for the opening chord. It MUST be a C, because chord offsets are
 * scale degrees above the tonic of the key the progression is built in — anchoring
 * on any other pitch class transposes the entire progression away from its label.
 */
const PROGRESSION_BASE = 48;
// Must be a C, since pedal degrees are offsets from the tonic of the key the
// progression is built in. Anchoring on any other pitch class transposes every
// pedal by that interval.
const PEDAL_BASE = 36;
const VOICING_FLOOR = 48;
const VOICING_CEILING = 60;

/**
 * Places each chord as close to the previous one as it can, so successive
 * harmonies share common tones and voices move by step rather than leaping back
 * to root position every bar.
 */
export function leadVoicing(previous: readonly number[], notes: readonly number[]): number[] {
  const rootPosition = [...notes].sort((a, b) => a - b);
  if (!previous.length) return rootPosition;
  const pitchClasses = rootPosition.map(note => ((note % 12) + 12) % 12);
  let best: number[] | undefined;
  let bestCost = Number.POSITIVE_INFINITY;
  // Fallback for the rare chord no arrangement can voice cleanly; the caller
  // lifts it afterwards.
  let fallback: number[] | undefined;
  let fallbackCost = Number.POSITIVE_INFINITY;
  // Search every inversion at every playable octave and keep the arrangement
  // that moves least. Choosing an inversion is what lets voices stay put instead
  // of the whole chord sliding to follow the root.
  for (let inversion = 0; inversion < pitchClasses.length; inversion += 1) {
    const rotated = [...pitchClasses.slice(inversion), ...pitchClasses.slice(0, inversion)];
    for (let octave = VOICING_FLOOR; octave <= VOICING_CEILING; octave += 12) {
      const voicing: number[] = [];
      let last = octave + (((rotated[0] - octave) % 12) + 12) % 12;
      voicing.push(last);
      for (let index = 1; index < rotated.length; index += 1) {
        let next = last + (((rotated[index] - last) % 12) + 12) % 12;
        if (next === last) next += 12;
        voicing.push(next); last = next;
      }
      if (voicing[0] < VOICING_FLOOR || last > VOICING_CEILING + 12) continue;
      const cost = voicing.reduce((total, note) => total + Math.min(...previous.map(earlier => Math.abs(note - earlier))), 0);
      if (cost < fallbackCost) { fallbackCost = cost; fallback = voicing; }
      // A voicing that violates the low-interval limit will be lifted an octave
      // afterwards, which costs far more motion than choosing a wider spacing
      // here — so tight-but-muddy candidates are excluded from the search.
      if (!respectsLowIntervalLimit(voicing)) continue;
      if (cost < bestCost) { bestCost = cost; best = voicing; }
    }
  }
  return best ?? fallback ?? rootPosition;
}

export function buildProgression(keyPitchClass: number, template: ProgressionTemplate): HarmonyStimulus {
  if (!Number.isInteger(keyPitchClass) || keyPitchClass < 0 || keyPitchClass > 11) throw new RangeError('Key pitch class must be 0 through 11');
  // Built in C and transposed as a whole, so voice leading cannot make the
  // result depend on the key it is played in.
  let previous: number[] = [];
  const relative = template.chords.map(item => {
    const root = PROGRESSION_BASE + item.offset;
    const notes = (item.quality.includes('7') ? seventhChord(root, item.quality as SeventhQuality) : chord(root, item.quality as ChordQuality)).map(note => note.midiNumber);
    // Leading toward the previous chord can fold a voicing below the register
    // where close spacing stays intelligible, so each result is lifted clear.
    // The lift moves every voice together, preserving the leading.
    const led = liftAboveMud(leadVoicing(previous, notes));
    previous = led;
    return led;
  });
  const pedalNote = template.pedal === undefined ? undefined : PEDAL_BASE + template.pedal + keyPitchClass;
  const chords = relative.map(notes => {
    const transposed = notes.map(note => note + keyPitchClass);
    if (pedalNote === undefined) return transposed;
    // The pedal sits under the harmony; if the harmony already reaches it, the
    // chord rises rather than doubling the bass onto the same pitch.
    const lifted = Math.min(...transposed) - pedalNote < 5 ? transposed.map(note => note + 12) : transposed;
    return [pedalNote, ...lifted];
  });
  return {
    keyPitchClass, templateId: template.id, name: template.name, function: template.function,
    roman: template.chords.map(item => item.roman).join(' – '), chords, notes: chords.flat(), pedalNote,
    destinationKey: template.modulatesTo === undefined ? undefined : (keyPitchClass + template.modulatesTo) % 12,
    pivotIndex: template.pivotIndex,
    pivotRoman: template.pivotIndex === undefined ? undefined : template.chords[template.pivotIndex].roman,
  };
}

/** Modes that ask about a key change can only use progressions that make one. */
export const templatesFor = (mode: HarmonyResponseMode) =>
  mode === 'modulation' ? PROGRESSIONS.filter(item => item.modulatesTo !== undefined)
  : mode === 'pivot' ? PROGRESSIONS.filter(item => item.pivotIndex !== undefined)
  : PROGRESSIONS;

export function generateHarmony(seed: number, mode: HarmonyResponseMode = 'function'): HarmonyStimulus {
  const random = seededRandom(seed);
  const key = Math.floor(random() * 12);
  const pool = templatesFor(mode);
  return buildProgression(key, pool[Math.floor(random() * pool.length)]);
}

/** The answer the user must produce, which differs by response mode. */
export function expectedHarmonyAnswer(stimulus: HarmonyStimulus, mode: HarmonyResponseMode): string {
  if (mode === 'roman') return stimulus.roman;
  if (mode === 'function') return stimulus.function;
  if (mode === 'modulation') return NOTE_NAMES[stimulus.destinationKey ?? stimulus.keyPitchClass];
  return stimulus.pivotRoman ?? '';
}
