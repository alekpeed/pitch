import { describe, expect, it } from 'vitest';
import {
  buildDiatonicChord, generateComparison, generateHarmonization, generateMelodyOverChord,
  gradeHarmonization, judgeHarmonization, judgeSubstitution, melodyRole, SUBSTITUTIONS,
} from './harmonize';

describe('melody over harmony', () => {
  it('replays identically from the same seed', () => {
    expect(generateMelodyOverChord(5)).toEqual(generateMelodyOverChord(5));
  });
  it('puts the melody above the harmony, not inside it', () => {
    for (let seed = 0; seed < 30; seed += 1) {
      const task = generateMelodyOverChord(seed);
      expect(task.melodyNote).toBeGreaterThan(Math.max(...task.chordNotes));
    }
  });
  it('names which chord tone the melody is sitting on', () => {
    expect(melodyRole(64, 60)).toBe('3rd');
    expect(melodyRole(62, 60)).toBe('9th');
    expect(melodyRole(70, 60)).toBe('♭7th');
  });
  it('sometimes places the melody on a tension rather than a chord tone', () => {
    const roles = new Set(Array.from({ length: 40 }, (_, seed) => generateMelodyOverChord(seed).melodyRole));
    expect(roles.size).toBeGreaterThan(2);
  });
});

describe('harmonization accepts several defensible answers', () => {
  it('accepts every chord that genuinely supports the melody note', () => {
    // C in the key of C is supported by I (root), vi (3rd), IV (5th) and ii7 (as a tension).
    const supported = ['I', 'vi', 'IV', 'ii7'].map(roman => judgeHarmonization(72, 0, roman));
    expect(supported.every(item => item.valid)).toBe(true);
    expect(new Set(supported.map(item => item.reason)).size).toBeGreaterThan(1);
  });
  it('rejects a chord the melody actually clashes with', () => {
    const clash = judgeHarmonization(73, 0, 'I');
    expect(clash.valid).toBe(false);
    expect(clash.reason).toContain('clashes');
  });
  it('explains why each choice was accepted rather than only marking it', () => {
    expect(judgeHarmonization(72, 0, 'I').reason).toContain('root');
    expect(judgeHarmonization(76, 0, 'I').reason).toContain('3rd');
  });
  it('grades a whole melody and reports how many choices held up', () => {
    const task = generateHarmonization(3, 4);
    const chosen = task.melody.map(note => task.options.find(roman => judgeHarmonization(note, task.keyPitchClass, roman).valid)!);
    const grade = gradeHarmonization(task, chosen);
    expect(grade.total).toBe(4);
    expect(grade.allValid).toBe(true);
  });
  it('counts an unanswered slot as unsupported rather than correct', () => {
    const task = generateHarmonization(3, 4);
    expect(gradeHarmonization(task, []).valid).toBe(0);
  });
  it('always leaves at least one defensible option for every melody note', () => {
    for (let seed = 0; seed < 25; seed += 1) {
      const task = generateHarmonization(seed, 4);
      task.melody.forEach(note =>
        expect(task.options.some(roman => judgeHarmonization(note, task.keyPitchClass, roman).valid)).toBe(true));
    }
  });
});

describe('reharmonization', () => {
  it('accepts a substitution on the chord it applies to', () => {
    expect(judgeSubstitution('V7', 'tritone substitution').valid).toBe(true);
    expect(judgeSubstitution('IV', 'modal mixture').valid).toBe(true);
  });
  it('rejects one applied to the wrong chord, and says which chord it wants', () => {
    const verdict = judgeSubstitution('ii7', 'tritone substitution');
    expect(verdict.valid).toBe(false);
    expect(verdict.reason).toContain('V7');
  });
  it('explains the substitution rather than only accepting it', () => {
    expect(judgeSubstitution('V7', 'backdoor dominant').reason).toContain('flat side');
  });
  it('rejects an unknown substitution', () => expect(judgeSubstitution('V7', 'nonsense').valid).toBe(false));
});

describe('comparing harmonizations', () => {
  it('builds the substitute with its own quality, not always a dominant', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 60; seed += 1) {
      const task = generateComparison(seed);
      seen.add(task.answer);
      const changed = task.alteredRomans.findIndex((roman, index) => roman !== task.romans[index]);
      if (changed >= 0) expect(task.altered[changed]).not.toEqual(task.original[changed]);
    }
    expect(seen.size).toBeGreaterThan(1);
  });
  it('offers every substitution plus the no-substitution case', () => {
    const task = generateComparison(1);
    expect(task.options).toEqual([...SUBSTITUTIONS.map(item => item.id), 'voice leading only']);
    expect(task.options).toContain(task.answer);
  });
  it('actually re-voices when the answer is voice leading only, rather than replaying the same audio', () => {
    const untouched = Array.from({ length: 60 }, (_, seed) => generateComparison(seed))
      .filter(task => task.answer === 'voice leading only');
    expect(untouched.length).toBeGreaterThan(0);
    untouched.forEach(task => {
      // Same harmony …
      task.original.forEach((notes, index) =>
        expect(new Set(task.altered[index].map(note => note % 12))).toEqual(new Set(notes.map(note => note % 12))));
      // … but not the same arrangement.
      expect(task.altered).not.toEqual(task.original);
    });
  });
  it('leaves the other chords alone when it does substitute one', () => {
    const substituted = Array.from({ length: 60 }, (_, seed) => generateComparison(seed))
      .filter(task => task.answer !== 'voice leading only');
    expect(substituted.length).toBeGreaterThan(0);
    substituted.forEach(task => task.romans.forEach((roman, index) => {
      if (roman === task.alteredRomans[index]) expect(task.altered[index]).toEqual(task.original[index]);
    }));
  });
  it('builds diatonic chords from the key it is given', () => {
    expect(buildDiatonicChord(0, 'I')[0] % 12).toBe(0);
    expect(buildDiatonicChord(2, 'V7')[0] % 12).toBe((2 + 7) % 12);
  });
});
