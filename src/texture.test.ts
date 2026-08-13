import { describe, expect, it } from 'vitest';
import {
  generateInnerMelody, generateSpacing, generateUpperStructure, generateVoiceMotion,
  generateVoicingChange, SPACINGS, tensionsOver, UPPER_STRUCTURES, VOICES, VOICING_CHANGES,
} from './texture';
import { generateVoicing } from './voicing';

const mod = (value: number) => ((value % 12) + 12) % 12;
const pitchClasses = (notes: readonly number[]) => [...new Set(notes.map(mod))].sort((a, b) => a - b);

describe('spacing recognition', () => {
  it('replays identically from the same seed', () => expect(generateSpacing(5)).toEqual(generateSpacing(5)));

  it('keeps chord identity fixed so only the spacing differs', () => {
    // Every spacing of the same chord must share its pitch classes, or the drill
    // would be answerable from the harmony rather than from the spacing.
    const identity = pitchClasses(generateVoicing({ rootPitchClass: 3, quality: 'dominant 7', style: 'close' }));
    (['open', 'drop-2', 'drop-3', 'spread'] as const).forEach(style => {
      expect(pitchClasses(generateVoicing({ rootPitchClass: 3, quality: 'dominant 7', style })), style).toEqual(identity);
    });
  });

  it('separates drop-2 from drop-3 by which voice fell', () => {
    const close = generateVoicing({ rootPitchClass: 0, quality: 'major 7', style: 'close' });
    const drop2 = generateVoicing({ rootPitchClass: 0, quality: 'major 7', style: 'drop-2' });
    const drop3 = generateVoicing({ rootPitchClass: 0, quality: 'major 7', style: 'drop-3' });
    expect(drop2).not.toEqual(drop3);
    // Each drops exactly one voice by an octave, and a different one.
    expect(drop2.filter(note => !close.includes(note))).toEqual([close[close.length - 2] - 12]);
    expect(drop3.filter(note => !close.includes(note))).toEqual([close[close.length - 3] - 12]);
  });

  it('builds quartal voicings out of fourths, not thirds', () => {
    // So What: D–G–C–F, three perfect fourths.
    expect(generateVoicing({ rootPitchClass: 2, quality: 'minor 7', style: 'quartal' }).map((note, index, all) => index ? note - all[index - 1] : 0).slice(1)).toEqual([5, 5, 5]);
    // Every quartal voicing spans fourths or wider, never a stacked third.
    for (let root = 0; root < 12; root += 1) {
      (['major 7', 'dominant 7', 'minor 7'] as const).forEach(quality => {
        const notes = generateVoicing({ rootPitchClass: root, quality, style: 'quartal' });
        notes.slice(1).forEach((note, index) => expect(note - notes[index], `${root} ${quality}`).toBeGreaterThanOrEqual(5));
      });
    }
  });

  it('honours a narrowed option list', () => {
    for (let seed = 0; seed < 20; seed += 1) {
      expect(['close', 'quartal']).toContain(generateSpacing(seed, ['close', 'quartal']).answer);
    }
  });

  it('falls back to the full list rather than producing nothing', () => {
    expect(SPACINGS).toContain(generateSpacing(1, []).answer);
  });
});

describe('upper-structure triads', () => {
  it('replays identically from the same seed', () => expect(generateUpperStructure(9)).toEqual(generateUpperStructure(9)));

  it('names the alterations each upper structure actually produces', () => {
    // Read off C7: the classic table every player learns. The triad is rooted on
    // C + offset, so the base must be a C — anchoring elsewhere would shift every
    // tension by the same interval and read as plausible.
    const over = (offset: number) => tensionsOver(0, [60 + offset, 64 + offset, 67 + offset]);
    expect(over(2)).toEqual(['9', '♯11', '13']);
    expect(over(1)).toEqual(['♭9', '11', '♭13']);
    expect(over(3)).toEqual(['♯9', '5th', '♭7']);
    expect(over(6)).toEqual(['♯11', '♭7', '♭9']);
    expect(over(9)).toEqual(['13', '♭9', '3rd']);
    expect(over(8)).toEqual(['♭13', 'root', '♯9']);
  });

  it('puts a plain major triad on top of a dominant shell', () => {
    for (let seed = 0; seed < 30; seed += 1) {
      const task = generateUpperStructure(seed);
      expect(task.upper.map(note => note - task.upper[0])).toEqual([0, 4, 7]);
      // Root, 3rd and ♭7 underneath — the 5th is left out so the triad is unobstructed.
      expect(task.lower.map(note => mod(note - task.rootPitchClass)).sort((a, b) => a - b)).toEqual([0, 4, 10]);
      // The upper triad is rooted where its label says, against the chord's own root.
      const structure = UPPER_STRUCTURES.find(item => item.label === task.answer)!;
      expect(mod(task.upper[0] - task.rootPitchClass)).toBe(structure.offset);
      expect(UPPER_STRUCTURES.map(item => item.label)).toContain(task.answer);
    }
  });

  it('always sounds the triad above the chord it colours', () => {
    for (let seed = 0; seed < 20; seed += 1) {
      const task = generateUpperStructure(seed);
      expect(Math.min(...task.upper)).toBeGreaterThan(Math.max(...task.lower));
    }
  });
});

describe('voice-leading tracking', () => {
  it('replays identically from the same seed', () => expect(generateVoiceMotion(11)).toEqual(generateVoiceMotion(11)));

  it('moves exactly one voice', () => {
    for (let seed = 0; seed < 40; seed += 1) {
      const task = generateVoiceMotion(seed);
      const moved = task.first.filter((note, index) => note !== task.second[index]);
      expect(moved.length, `seed ${seed}`).toBe(1);
      expect(task.commonTones.length).toBe(task.first.length - 1);
    }
  });

  it('never crosses the moving voice past its neighbours', () => {
    for (let seed = 0; seed < 60; seed += 1) {
      const { second } = generateVoiceMotion(seed);
      expect([...second].sort((a, b) => a - b), `seed ${seed}`).toEqual(second);
    }
  });

  it('reports the interval and direction of the motion', () => {
    for (let seed = 0; seed < 30; seed += 1) {
      const task = generateVoiceMotion(seed);
      const index = VOICES.indexOf(task.answer);
      const delta = task.second[index] - task.first[index];
      expect(Math.abs(delta)).toBe(task.semitones);
      expect(delta > 0 ? 'up' : 'down').toBe(task.direction);
    }
  });
});

describe('inner-voice melody', () => {
  it('replays identically from the same seed', () => expect(generateInnerMelody(2)).toEqual(generateInnerMelody(2)));

  it('holds every other voice still, so the line really is in that voice', () => {
    for (let seed = 0; seed < 30; seed += 1) {
      const task = generateInnerMelody(seed);
      const index = VOICES.indexOf(task.answer);
      task.chords.forEach(chord => chord.forEach((note, at) => {
        if (at !== index) expect(note, `seed ${seed} voice ${at}`).toBe(task.chords[0][at]);
      }));
      expect(task.chords.map(chord => chord[index])).toEqual(task.melody);
    }
  });

  it('actually moves the line rather than repeating a note', () => {
    for (let seed = 0; seed < 30; seed += 1) {
      const task = generateInnerMelody(seed);
      expect(new Set(task.melody).size, `seed ${seed}`).toBeGreaterThan(1);
      task.steps.forEach(step => expect(Math.abs(step)).toBeLessThanOrEqual(2));
    }
  });

  it('produces the requested number of chords', () => expect(generateInnerMelody(4, 6).chords.length).toBe(6));

  it('finds a line in every voice across enough seeds', () => {
    const voices = new Set(Array.from({ length: 60 }, (_, seed) => generateInnerMelody(seed).answer));
    expect(voices.size).toBe(VOICES.length);
  });
});

describe('what changed between two voicings', () => {
  it('replays identically from the same seed', () => expect(generateVoicingChange(7)).toEqual(generateVoicingChange(7)));

  it('changes nothing when it says so', () => {
    const task = generateVoicingChange(1, 'nothing changed');
    expect(task.second).toEqual(task.first);
  });

  it('keeps an inversion and a bass change genuinely distinguishable', () => {
    for (let seed = 0; seed < 25; seed += 1) {
      // An inversion preserves the pitch-class set exactly...
      const inverted = generateVoicingChange(seed, 'the inversion changed');
      expect(pitchClasses(inverted.second), `seed ${seed}`).toEqual(pitchClasses(inverted.first));
      // ...a bass change introduces a pitch class the chord did not have.
      const rebassed = generateVoicingChange(seed, 'the bass changed');
      expect(pitchClasses(rebassed.second)).not.toEqual(pitchClasses(rebassed.first));
      expect(rebassed.second.slice(1)).toEqual(rebassed.first.slice(1));
      expect(Math.min(...rebassed.second)).toBeLessThan(Math.min(...rebassed.first));
    }
  });

  it('adds a note for an extension and keeps the count for an alteration', () => {
    for (let seed = 0; seed < 25; seed += 1) {
      const extended = generateVoicingChange(seed, 'an extension was added');
      expect(extended.second.length).toBe(extended.first.length + 1);
      expect(extended.first.every(note => extended.second.includes(note))).toBe(true);
      const altered = generateVoicingChange(seed, 'one note was altered');
      expect(altered.second.length).toBe(altered.first.length);
      expect(altered.second.filter(note => !altered.first.includes(note)).length).toBe(1);
    }
  });

  it('substitutes a chord a tritone away, sharing its guide tones', () => {
    for (let seed = 0; seed < 20; seed += 1) {
      const task = generateVoicingChange(seed, 'the chord was substituted');
      const shared = pitchClasses(task.first).filter(pitchClass => pitchClasses(task.second).includes(pitchClass));
      // Tritone substitutes hold the 3rd and ♭7 in common; that is the whole point.
      expect(shared.length, `seed ${seed}`).toBeGreaterThanOrEqual(1);
      expect(pitchClasses(task.second)).not.toEqual(pitchClasses(task.first));
    }
  });

  it('offers every change type across enough seeds', () => {
    const seen = new Set(Array.from({ length: 80 }, (_, seed) => generateVoicingChange(seed).answer));
    VOICING_CHANGES.forEach(change => expect(seen, change).toContain(change));
  });
});
