import { describe, expect, it } from 'vitest';
import {
  FRET_COUNT, fretPositions, fretToMidi, generateCall, generateFunctionalPrompt, gradeCall,
  GUITAR_TUNING, isPlayableOnGuitar,
} from './performance';
import { generateProduction } from './production';

describe('call and response', () => {
  it('replays identically from the same seed', () => expect(generateCall(4, 'melody')).toEqual(generateCall(4, 'melody')));
  it('grades a melodic call in order and a chord as a set', () => {
    const melody = generateCall(2, 'melody');
    const chordCall = generateCall(2, 'chord');
    expect(melody.ordered).toBe(true);
    expect(chordCall.ordered).toBe(false);
    // The same pitches in a different order: right for a chord, wrong for a melody.
    expect(gradeCall(chordCall, [...chordCall.expected].reverse()).correct).toBe(true);
    expect(gradeCall(melody, [...melody.expected].reverse()).correct).toBe(melody.expected.length === 1);
  });
  it('accepts a reproduction in another octave', () => {
    const call = generateCall(6, 'bass');
    expect(gradeCall(call, call.expected.map(note => note + 12)).correct).toBe(true);
    expect(gradeCall(call, call.expected.map(note => note + 12), false).correct).toBe(false);
  });
  it('reports which notes were right rather than only a verdict', () => {
    const call = generateCall(8, 'melody');
    const played = [...call.expected]; played[1] += 1;
    const result = gradeCall(call, played);
    expect(result.perItem[1]).toBe(false);
    expect(result.matched).toBe(call.expected.length - 1);
  });
  it('plays the bass below the melody for the same progression', () => {
    expect(Math.min(...generateCall(3, 'bass').expected)).toBeLessThan(Math.min(...generateCall(3, 'melody').expected));
  });
  it('asks for a real voicing style when the call is a voicing', () => {
    const call = generateCall(5, 'voicing');
    expect(call.expected.length).toBeGreaterThanOrEqual(3);
    expect(call.label).toMatch(/shell|rootless|drop-2|spread/);
  });
});

describe('fretboard', () => {
  it('uses standard tuning', () => expect([...GUITAR_TUNING]).toEqual([40, 45, 50, 55, 59, 64]));
  it('maps a string and fret to the pitch it sounds', () => {
    expect(fretToMidi(0, 0)).toBe(40);
    expect(fretToMidi(0, 5)).toBe(45);
    expect(fretToMidi(5, 12)).toBe(76);
  });
  it('finds every place a pitch can be played', () => {
    // A3 (57) sits on the low E, A and D strings within twelve frets.
    const positions = fretPositions(57);
    expect(positions.length).toBeGreaterThan(1);
    positions.forEach(position => expect(fretToMidi(position.stringIndex, position.fret)).toBe(57));
  });
  it('knows what the neck cannot reach', () => {
    expect(isPlayableOnGuitar(40)).toBe(true);
    expect(isPlayableOnGuitar(30)).toBe(false);
    expect(isPlayableOnGuitar(GUITAR_TUNING[5] + FRET_COUNT + 1)).toBe(false);
  });
});

describe('functional performance prompts', () => {
  it('replays identically from the same seed', () => expect(generateFunctionalPrompt(7)).toEqual(generateFunctionalPrompt(7)));
  it('asks for both whole voicings and single chord members', () => {
    const prompts = Array.from({ length: 40 }, (_, seed) => generateFunctionalPrompt(seed));
    expect(prompts.some(prompt => prompt.expected.length === 1)).toBe(true);
    expect(prompts.some(prompt => prompt.expected.length > 2)).toBe(true);
  });
  it('always states the key and always has something to play', () => {
    for (let seed = 0; seed < 40; seed += 1) {
      const prompt = generateFunctionalPrompt(seed);
      expect(prompt.instruction.length).toBeGreaterThan(10);
      expect(prompt.expected.length).toBeGreaterThan(0);
    }
  });
});

describe('sung production over harmony', () => {
  it('targets a real member of the sounded chord', () => {
    for (let seed = 0; seed < 30; seed += 1) {
      const prompt = generateProduction(seed, 'chord-tone-production');
      expect(prompt.contextNotes.map(note => note % 12)).toContain(prompt.targetMidi % 12);
      expect(prompt.instruction).toMatch(/Sing the (root|3rd|5th|7th) of this chord\./);
    }
  });
  it('gives guide-tone and root-motion prompts a progression to hear', () => {
    (['guide-tone-production', 'root-motion-production'] as const).forEach(kind => {
      const prompt = generateProduction(3, kind);
      expect(prompt.contextChords!.length).toBeGreaterThan(1);
      expect(prompt.contextChords!.some(notes => notes.includes(prompt.targetMidi))).toBe(true);
    });
  });
  it('asks for the root on a root-motion prompt and a guide tone otherwise', () => {
    expect(generateProduction(3, 'root-motion-production').answer).toContain('root');
    expect(generateProduction(3, 'guide-tone-production').answer).toMatch(/3rd|7th/);
  });
});
