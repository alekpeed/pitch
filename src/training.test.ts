import { describe, expect, it } from 'vitest';
import { answersFor, generateStimulus, RECOGNITION_KINDS, recommendKind, type DrillConfig } from './training';
import { ALTERED_STRUCTURES, EXTENSION_STRUCTURES, MAJOR_SCALE, MODES, NOTE_NAMES, respectsLowIntervalLimit } from './theory';
const config = (overrides: Partial<DrillConfig> = {}): DrillConfig => ({ kind: 'seventh', rootPool: 'all', inversions: true, melodic: false, register: 'middle', timbre: 'piano', ...overrides });

describe('training engine', () => {
  it('generates identical stimuli from identical seeds', () => expect(generateStimulus(12, config())).toEqual(generateStimulus(12, config())));
  it('constrains roots, registers, and inversions', () => {
    const stimulus = generateStimulus(99, config({ kind: 'triad', rootPool: 'white', inversions: false, register: 'high' }));
    expect([0, 2, 4, 5, 7, 9, 11]).toContain(stimulus.root % 12); expect(stimulus.root).toBeGreaterThanOrEqual(60); expect(stimulus.inversion).toBe(0);
  });
  it('establishes tonic before a scale-degree target', () => expect(generateStimulus(5, config({ kind: 'scale-degree' })).contextNotes).toHaveLength(3));
  it('sounds the ground-floor drills as two notes, one after the other', () => {
    (['direction', 'motion', 'distance'] as const).forEach(kind => {
      for (let seed = 0; seed < 20; seed += 1) {
        const stimulus = generateStimulus(seed, config({ kind }));
        expect(stimulus.notes).toHaveLength(2);
        expect(stimulus.melodic).toBe(true);
        expect(answersFor(config({ kind }))).toContain(stimulus.answer);
      }
    });
  });
  it('moves the second note the way a direction drill says it did', () => {
    for (let seed = 0; seed < 30; seed += 1) {
      const [first, second] = generateStimulus(seed, config({ kind: 'direction' })).notes;
      const stimulus = generateStimulus(seed, config({ kind: 'direction' }));
      expect(second === first).toBe(false);
      expect(second > first ? 'up' : 'down').toBe(stimulus.answer);
    }
  });
  it('repeats the note exactly when a motion drill says nothing changed', () => {
    for (let seed = 0; seed < 40; seed += 1) {
      const stimulus = generateStimulus(seed, config({ kind: 'motion' }));
      const [first, second] = stimulus.notes;
      expect(first === second).toBe(stimulus.answer === 'same note');
    }
  });
  it('keeps steps and leaps far enough apart to be a fair question', () => {
    for (let seed = 0; seed < 40; seed += 1) {
      const stimulus = generateStimulus(seed, config({ kind: 'distance' }));
      const size = Math.abs(stimulus.notes[1] - stimulus.notes[0]);
      if (stimulus.answer === 'a step') expect(size).toBeLessThanOrEqual(2);
      else expect(size).toBeGreaterThanOrEqual(5);
    }
  });
  it('makes the requested chord member the sounding bass', () => {
    for (let seed = 0; seed < 10; seed += 1) { const stimulus = generateStimulus(seed, config({ kind: 'bass' })); expect(stimulus.inversion).toBe(['root in bass', 'third in bass', 'fifth in bass'].indexOf(stimulus.answer)); }
  });
  it('recommends an unpracticed or weaker area', () => expect(recommendKind([{ exercise: 'scale-degree-recognition', correct: true }])).toBe('direction'));
  it('recommends only from what it is offered', () => {
    expect(recommendKind([{ exercise: 'triad-recognition', correct: true }], ['triad', 'seventh'])).toBe('seventh');
  });
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
  it('resolves a tonal-center phrase to its tonic without ever opening on it', () => {
    for (let seed = 0; seed < 20; seed += 1) {
      const stimulus = generateStimulus(seed, config({ kind: 'tonal-center' }));
      // The phrase, plus the single probe note that follows it.
      expect(stimulus.phrase!.length).toBeGreaterThan(3);
      const resolution = stimulus.phrase!.at(-2)!;
      expect(resolution[0] % 12).toBe(stimulus.root % 12);
      expect(stimulus.phrase![0][0] % 12).not.toBe(stimulus.root % 12);
    }
  });
  it('answers tonal-center with a degree against the heard tonic, never a letter name', () => {
    const degrees = answersFor(config({ kind: 'tonal-center' }));
    for (let seed = 0; seed < 30; seed += 1) {
      const stimulus = generateStimulus(seed, config({ kind: 'tonal-center' }));
      expect(degrees).toContain(stimulus.answer);
      // The probe sits that many scale steps above the tonic the phrase landed on.
      const tonic = stimulus.phrase!.at(-2)![0];
      expect(stimulus.notes[0] - tonic).toBe(MAJOR_SCALE[degrees.indexOf(stimulus.answer)]);
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
    (['tonal-center', 'mode'] as const).forEach(kind => {
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
  it('sounds the decomposition chord as context and probes one of its members', () => {
    const members = answersFor(config({ kind: 'decomposition' }));
    for (let seed = 0; seed < 24; seed += 1) {
      const stimulus = generateStimulus(seed, config({ kind: 'decomposition' }));
      expect(members).toContain(stimulus.answer);
      // The chord is heard first, so the member is judged against it rather than named cold.
      expect(stimulus.contextNotes).toHaveLength(4);
      expect(stimulus.notes).toHaveLength(1);
      expect(stimulus.contextNotes).toContain(stimulus.notes[0]);
      expect(stimulus.contextNotes![members.indexOf(stimulus.answer)]).toBe(stimulus.notes[0]);
    }
  });
  it('answers a slash chord with the distance to its bass, never a letter name', () => {
    const offsets = answersFor(config({ kind: 'slash-chord' }));
    for (let seed = 0; seed < 40; seed += 1) {
      const stimulus = generateStimulus(seed, config({ kind: 'slash-chord' }));
      expect(offsets).toContain(stimulus.answer);
      // The bass is the lowest note and is not the triad root.
      expect(Math.min(...stimulus.notes)).toBe(stimulus.notes[0]);
      expect(stimulus.notes).toHaveLength(4);
      expect(stimulus.notes[1] - stimulus.notes[0]).toBe(offsets.indexOf(stimulus.answer) + 1);
    }
  });
  it('never answers any recognition drill with a bare letter name', () => {
    // Absolute pitch is not a skill the app teaches, so no answer grid may ask for one.
    RECOGNITION_KINDS.forEach(kind => {
      expect(answersFor(config({ kind }))).not.toEqual(expect.arrayContaining([...NOTE_NAMES]));
    });
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
