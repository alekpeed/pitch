import { describe, expect, it } from 'vitest';
import { answersFor, generateStimulus, RECOGNITION_KINDS, recommendKind, type DrillConfig } from './training';
import { ALTERED_STRUCTURES, EXTENSION_STRUCTURES, MODES, NOTE_NAMES, respectsLowIntervalLimit } from './theory';
const config = (overrides: Partial<DrillConfig> = {}): DrillConfig => ({ kind: 'seventh', rootPool: 'all', inversions: true, melodic: false, register: 'middle', timbre: 'piano', ...overrides });

describe('training engine', () => {
  it('generates identical stimuli from identical seeds', () => expect(generateStimulus(12, config())).toEqual(generateStimulus(12, config())));
  it('constrains roots, registers, and inversions', () => {
    const stimulus = generateStimulus(99, config({ kind: 'triad', rootPool: 'white', inversions: false, register: 'high' }));
    expect([0, 2, 4, 5, 7, 9, 11]).toContain(stimulus.root % 12); expect(stimulus.root).toBeGreaterThanOrEqual(60); expect(stimulus.inversion).toBe(0);
  });
  it('establishes tonic before a scale-degree target', () => expect(generateStimulus(5, config({ kind: 'scale-degree' })).contextNotes).toHaveLength(3));
  it('makes the requested chord member the sounding bass', () => {
    for (let seed = 0; seed < 10; seed += 1) { const stimulus = generateStimulus(seed, config({ kind: 'bass' })); expect(stimulus.inversion).toBe(['root in bass', 'third in bass', 'fifth in bass'].indexOf(stimulus.answer)); }
  });
  it('recommends an unpracticed or weaker area', () => expect(recommendKind([{ exercise: 'scale-degree-recognition', correct: true }])).toBe('interval'));
  it('keeps the same interval when only the playback style changes', () => {
    // The together / one-after-another toggle changes presentation, never the
    // question — toggling mid-prompt must not hand the user a new interval.
    for (let seed = 0; seed < 30; seed += 1) {
      const together = generateStimulus(seed, config({ kind: 'interval', melodic: false }));
      const separate = generateStimulus(seed, config({ kind: 'interval', melodic: true }));
      expect(separate.answer).toBe(together.answer);
      expect(separate.root % 12).toBe(together.root % 12);
    }
  });
  it('never sounds a simultaneous stimulus below the low-interval limit', () => {
    for (const kind of ['triad', 'seventh', 'bass'] as const)
      for (const register of ['low', 'middle', 'high'] as const)
        for (let seed = 0; seed < 40; seed += 1) {
          const stimulus = generateStimulus(seed, config({ kind, register }));
          expect(respectsLowIntervalLimit(stimulus.notes)).toBe(true);
        }
  });
  it('keeps the reported root in step with the notes it lifted', () => {
    for (let seed = 0; seed < 40; seed += 1) {
      const stimulus = generateStimulus(seed, config({ kind: 'triad', register: 'low', inversions: false }));
      expect(stimulus.notes[0]).toBe(stimulus.root);
    }
  });
  it('widens scale degrees from seven to twelve with chromatic vocabulary', () => {
    expect(answersFor(config({ kind: 'scale-degree' }))).toHaveLength(7);
    expect(answersFor(config({ kind: 'scale-degree', vocabulary: 'chromatic' }))).toHaveLength(12);
  });
  it('sounds a chromatic degree the stated distance above the tonic', () => {
    const chromatic = answersFor(config({ kind: 'scale-degree', vocabulary: 'chromatic' }));
    for (let seed = 0; seed < 30; seed += 1) {
      const stimulus = generateStimulus(seed, config({ kind: 'scale-degree', vocabulary: 'chromatic' }));
      expect(stimulus.notes[0] - stimulus.root).toBe(chromatic.indexOf(stimulus.answer));
    }
  });
  it('gives absolute-note prompts no tonal context at all', () => {
    const stimulus = generateStimulus(4, config({ kind: 'absolute-note' }));
    expect(stimulus.contextNotes).toBeUndefined();
    expect(stimulus.answer).toBe(NOTE_NAMES[stimulus.notes[0] % 12]);
  });
  it('builds a tonal-center phrase that resolves to the answer but never opens on it', () => {
    for (let seed = 0; seed < 20; seed += 1) {
      const stimulus = generateStimulus(seed, config({ kind: 'tonal-center' }));
      expect(stimulus.phrase!.length).toBeGreaterThan(2);
      expect(stimulus.answer).toBe(NOTE_NAMES[stimulus.root % 12]);
      expect(stimulus.phrase!.at(-1)![0] % 12).toBe(stimulus.root % 12);
      expect(stimulus.phrase![0][0] % 12).not.toBe(stimulus.root % 12);
    }
  });
  it('plays a mode as its own scale and names the characteristic degree', () => {
    for (let seed = 0; seed < 20; seed += 1) {
      const stimulus = generateStimulus(seed, config({ kind: 'mode' }));
      const intervals = MODES[stimulus.answer as keyof typeof MODES].intervals;
      expect(stimulus.notes.map(note => note - stimulus.root)).toEqual([...intervals, 12]);
      expect(stimulus.melodic).toBe(true);
      expect(stimulus.explanation).toContain(MODES[stimulus.answer as keyof typeof MODES].characteristic);
    }
  });
  it('explains every stimulus in its own terms, never as a chord inversion', () => {
    (['absolute-note', 'tonal-center', 'mode'] as const).forEach(kind => {
      const stimulus = generateStimulus(6, config({ kind }));
      expect(stimulus.explanation).toBeTruthy();
      expect(stimulus.explanation).not.toContain('root position');
    });
  });
  it('generates a valid stimulus for every recognition kind', () => {
    RECOGNITION_KINDS.forEach(kind => {
      const stimulus = generateStimulus(11, config({ kind }));
      expect(stimulus.notes.length).toBeGreaterThan(0);
      expect(answersFor(config({ kind }))).toContain(stimulus.answer);
    });
  });
  it('offers the full triad and seventh vocabularies', () => {
    expect(answersFor(config({ kind: 'triad' }))).toEqual(expect.arrayContaining(['sus2', 'sus4', 'power']));
    expect(answersFor(config({ kind: 'seventh' }))).toEqual(expect.arrayContaining(['minor-major 7', 'diminished 7', 'augmented 7', 'augmented major 7']));
  });
  it('sounds extensions and alterations with their stated structure', () => {
    for (const kind of ['extension', 'altered'] as const) {
      for (let seed = 0; seed < 24; seed += 1) {
        const stimulus = generateStimulus(seed, config({ kind }));
        // The two tables have disjoint keys, so index them through a shared shape.
        const table: Record<string, readonly number[]> = kind === 'extension' ? EXTENSION_STRUCTURES : ALTERED_STRUCTURES;
        const structure = table[stimulus.answer];
        expect(stimulus.notes).toHaveLength(structure.length);
        expect(stimulus.notes.map(note => note - stimulus.root)).toEqual([...structure]);
      }
    }
  });
  it('never asks for an inversion a quality does not have', () => {
    for (let seed = 0; seed < 60; seed += 1) {
      const stimulus = generateStimulus(seed, config({ kind: 'triad', inversions: true }));
      expect(stimulus.inversion).toBeLessThan(stimulus.notes.length);
    }
  });
  it('asks decomposition for a real member and answers with that pitch', () => {
    for (let seed = 0; seed < 24; seed += 1) {
      const stimulus = generateStimulus(seed, config({ kind: 'decomposition' }));
      expect(stimulus.question).toMatch(/Name the (root|3rd|5th|7th) of this chord\./);
      expect(stimulus.notes.map(note => NOTE_NAMES[note % 12])).toContain(stimulus.answer);
    }
  });
  it('puts a displaced bass under the slash-chord triad and asks about one part at a time', () => {
    const questions = new Set<string>();
    for (let seed = 0; seed < 40; seed += 1) {
      const stimulus = generateStimulus(seed, config({ kind: 'slash-chord' }));
      questions.add(stimulus.question!);
      // The bass is the lowest note and is not the triad root.
      expect(Math.min(...stimulus.notes)).toBe(stimulus.notes[0]);
      expect(stimulus.notes).toHaveLength(4);
      expect(stimulus.explanation).toContain('/');
    }
    expect(questions.size).toBe(2);
  });
  it('keeps every new chord drill clear of the low-interval limit', () => {
    for (const kind of ['extension', 'altered', 'decomposition', 'slash-chord'] as const)
      for (let seed = 0; seed < 25; seed += 1)
        expect(respectsLowIntervalLimit(generateStimulus(seed, config({ kind })).notes)).toBe(true);
  });
  it('builds a delayed comparison whose second chord matches the stated change', () => {
    for (let seed = 0; seed < 60; seed += 1) {
      const stimulus = generateStimulus(seed, config({ kind: 'delayed-comparison' }));
      const [first, second] = stimulus.phrase!;
      const same = first.length === second.length && first.every((note, index) => note === second[index]);
      expect(same).toBe(stimulus.answer === 'identical');
      if (stimulus.answer === 'root changed') expect(new Set(second.map(n => n % 12))).not.toEqual(new Set(first.map(n => n % 12)));
    }
  });
  it('widens the gap between the two chords as memory delay rises', () => {
    const near = generateStimulus(5, config({ kind: 'delayed-comparison', memoryDelay: 'none' }));
    const far = generateStimulus(5, config({ kind: 'delayed-comparison', memoryDelay: 'long' }));
    expect(far.gapSeconds!).toBeGreaterThan(near.gapSeconds!);
  });
  it('caps multi-bar memory at a single listen', () => {
    for (let seed = 0; seed < 20; seed += 1) {
      const stimulus = generateStimulus(seed, config({ kind: 'multibar-memory' }));
      expect(stimulus.replayLimit).toBe(1);
      expect(stimulus.phrase!.length).toBeGreaterThanOrEqual(3);
      expect(answersFor(config({ kind: 'multibar-memory' }))).toContain(stimulus.answer);
    }
  });
});
