import { describe, expect, it } from 'vitest';
import { centsFromTarget, generateProduction, gradeProduction, noteLabel } from './production';
import type { PitchEstimate } from './pitchDetection';

const heard = (midi: number, cents = 0, confidence = .95): PitchEstimate => ({ frequency: 0, midi, cents, confidence });

describe('production prompts', () => {
  it('replays identically from the same seed', () => {
    expect(generateProduction(7, 'scale-degree-production')).toEqual(generateProduction(7, 'scale-degree-production'));
  });
  it('never asks for the tonic itself as a scale degree', () => {
    for (let seed = 0; seed < 40; seed += 1) {
      const prompt = generateProduction(seed, 'scale-degree-production');
      expect(prompt.targetMidi).not.toBe(prompt.tonicMidi);
    }
  });
  it('establishes a tonic chord before asking for a degree', () => {
    expect(generateProduction(3, 'scale-degree-production').contextNotes.length).toBeGreaterThan(1);
  });
  it('asks for intervals in both directions', () => {
    const answers = Array.from({ length: 40 }, (_, seed) => generateProduction(seed, 'interval-production').answer);
    expect(answers.some(answer => answer.includes('above'))).toBe(true);
    expect(answers.some(answer => answer.includes('below'))).toBe(true);
  });
  it('places the interval target the named distance from the reference', () => {
    for (let seed = 0; seed < 40; seed += 1) {
      const prompt = generateProduction(seed, 'interval-production');
      const distance = Math.abs(prompt.targetMidi - prompt.referenceNotes[0]);
      expect(distance).toBeGreaterThanOrEqual(1);
      expect(distance).toBeLessThanOrEqual(12);
    }
  });
});

describe('production grading', () => {
  it('accepts a pitch sung in a different octave', () => {
    expect(gradeProduction(heard(72), 60, 35)).toBe(true);
    expect(gradeProduction(heard(48), 60, 35)).toBe(true);
  });
  it('can require the exact octave when asked', () => {
    expect(gradeProduction(heard(72), 60, 35, false)).toBe(false);
  });
  it('honours the tolerance band', () => {
    expect(gradeProduction(heard(60, 30), 60, 35)).toBe(true);
    expect(gradeProduction(heard(60, 45), 60, 35)).toBe(false);
  });
  it('returns no verdict when the detector is unsure, so it is never a user error', () => {
    expect(gradeProduction(heard(60, 0, .5), 60, 35)).toBeUndefined();
    expect(gradeProduction(undefined, 60, 35)).toBeUndefined();
  });
  it('signs the deviation so feedback can say sharp or flat', () => {
    expect(centsFromTarget(heard(60, 20), 60)).toBe(20);
    expect(centsFromTarget(heard(59, -80), 60)).toBe(-180 + 0);
  });
  it('folds to the nearest octave rather than reporting a huge error', () => {
    expect(Math.abs(centsFromTarget(heard(71, 0), 60))).toBeLessThanOrEqual(100);
  });
  it('labels notes with their octave', () => expect(noteLabel(60)).toBe('C4'));
});
