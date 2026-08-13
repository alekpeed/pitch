export type VoicingStyle = 'close' | 'open' | 'spread' | 'drop-2' | 'drop-3' | 'quartal' | 'shell' | 'rootless';
export type GradingPolicy = 'exact' | 'equivalent';
export interface VoicingOptions { rootPitchClass: number; quality: 'major 7' | 'dominant 7' | 'minor 7'; style: VoicingStyle; low?: number; high?: number }
export interface MidiNoteEvent { note: number; timeMs: number; velocity: number }
export interface MidiGrade { correct: boolean; pitchCorrect: boolean; timingAccepted: boolean; timingSpreadMs: number; missing: number[]; extra: number[] }
const structures = { 'major 7': [0, 4, 7, 11], 'dominant 7': [0, 4, 7, 10], 'minor 7': [0, 3, 7, 10] } as const;
/**
 * The scale each quality is drawn from. Quartal voicings are built by stacking
 * every third degree of it, which is what makes their fourths mostly perfect but
 * not uniformly so — the one augmented fourth is inherent to the scale, not a bug.
 */
const parentScales = {
  'major 7': [0, 2, 4, 5, 7, 9, 11], 'dominant 7': [0, 2, 4, 5, 7, 9, 10], 'minor 7': [0, 2, 3, 5, 7, 9, 10],
} as const;
const mod = (value: number) => ((value % 12) + 12) % 12;

function fit(notes: number[], low: number, high: number) {
  const fitted = notes.map(note => { let value = note; while (value < low) value += 12; while (value > high) value -= 12; return value; }).sort((a, b) => a - b);
  if (new Set(fitted).size !== fitted.length || fitted.some(note => note < low || note > high)) throw new RangeError('Range cannot contain this voicing');
  return fitted;
}

export function generateVoicing({ rootPitchClass, quality, style, low = 40, high = 84 }: VoicingOptions): number[] {
  if (!Number.isInteger(rootPitchClass) || rootPitchClass < 0 || rootPitchClass > 11) throw new RangeError('Root pitch class must be 0 through 11');
  if (high - low < 24) throw new RangeError('Voicing range must span at least two octaves');
  const root = 48 + rootPitchClass; const intervals = structures[quality];
  let notes: number[] = intervals.map(interval => root + interval);
  if (style === 'shell') notes = [root, root + intervals[1], root + intervals[3]];
  if (style === 'rootless') notes = [root + intervals[1], root + intervals[3], root + 14];
  if (style === 'open') notes = [notes[0], notes[2], notes[1] + 12, notes[3]];
  if (style === 'spread') notes = notes.map((note, index) => note + (index % 2 ? 12 : 0));
  if (style === 'drop-2') { notes.sort((a, b) => a - b); notes[notes.length - 2] -= 12; }
  // Drop-3 takes the third voice from the top rather than the second, which opens
  // a wider gap under the melody than drop-2 does.
  if (style === 'drop-3') { notes.sort((a, b) => a - b); notes[notes.length - 3] -= 12; }
  if (style === 'quartal') {
    const scale = parentScales[quality];
    notes = [0, 3, 6, 9].map(step => root + scale[step % 7] + 12 * Math.floor(step / 7));
  }
  return fit(notes, low, high);
}

export function gradeMidiPerformance(events: MidiNoteEvent[], expected: number[], policy: GradingPolicy, timingToleranceMs = 120): MidiGrade {
  const attacks = events.filter(event => event.velocity > 0); const played = [...new Set(attacks.map(event => event.note))].sort((a, b) => a - b);
  const expectedValues = [...new Set(expected)].sort((a, b) => a - b);
  const normalize = (notes: number[]) => policy === 'exact' ? notes : [...new Set(notes.map(mod))].sort((a, b) => a - b);
  const actualGrade = normalize(played); const expectedGrade = normalize(expectedValues);
  const missing = expectedGrade.filter(note => !actualGrade.includes(note)); const extra = actualGrade.filter(note => !expectedGrade.includes(note));
  const times = attacks.map(event => event.timeMs); const timingSpreadMs = times.length ? Math.max(...times) - Math.min(...times) : 0; const timingAccepted = attacks.length > 0 && timingSpreadMs <= timingToleranceMs;
  const pitchCorrect = missing.length === 0 && extra.length === 0;
  return { correct: pitchCorrect && timingAccepted, pitchCorrect, timingAccepted, timingSpreadMs, missing, extra };
}

export function guideToneVoicings(keyPitchClass: number): number[][] {
  const roots = [keyPitchClass + 2, keyPitchClass + 7, keyPitchClass]; const qualities: VoicingOptions['quality'][] = ['minor 7', 'dominant 7', 'major 7'];
  const raw = roots.map((root, index) => generateVoicing({ rootPitchClass: mod(root), quality: qualities[index], style: 'shell' }).slice(1));
  for (let chordIndex = 1; chordIndex < raw.length; chordIndex += 1) raw[chordIndex] = raw[chordIndex].map(note => { const previous = raw[chordIndex - 1]; const candidates = [note - 12, note, note + 12]; return candidates.sort((a, b) => Math.min(...previous.map(value => Math.abs(a - value))) - Math.min(...previous.map(value => Math.abs(b - value))))[0]; }).sort((a, b) => a - b);
  return raw;
}

export function voiceLeadingMotion(voicings: number[][]) {
  return voicings.slice(1).map((notes, index) => notes.map(note => Math.min(...voicings[index].map(previous => Math.abs(note - previous)))));
}
