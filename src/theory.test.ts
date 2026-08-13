import { describe, expect, it } from 'vitest';
import {
  ALTERED_QUALITIES, ALTERED_STRUCTURES, chord, EXTENSION_QUALITIES, EXTENSION_STRUCTURES, frequency,
  liftAboveMud, minimumSpacing, pitch, respectsLowIntervalLimit, seededRandom, SEVENTH_QUALITIES,
  seventhChord, TRIAD_QUALITIES, voiceChord,
} from './theory';

describe('music theory model', () => {
  it('represents a sounding pitch independently from its spelling', () => expect(pitch(60)).toEqual({ midiNumber: 60, pitchClass: 0, octave: 4, spelling: 'C' }));
  it('rejects invalid MIDI notes', () => expect(() => pitch(128)).toThrow(RangeError));
  it('generates correctly inverted triads', () => {
    expect(chord(60, 'major', 0).map(note => note.midiNumber)).toEqual([60, 64, 67]);
    expect(chord(60, 'minor', 2).map(note => note.midiNumber)).toEqual([67, 72, 75]);
  });
  it('uses standard equal-tempered tuning', () => expect(frequency(69)).toBe(440));
  it('replays a seed deterministically', () => { const a = seededRandom(42); const b = seededRandom(42); expect([a(), a()]).toEqual([b(), b()]); });
  it('demands wider spacing the lower the voicing sits', () => {
    expect(minimumSpacing(36)).toBeGreaterThan(minimumSpacing(46));
    expect(minimumSpacing(46)).toBeGreaterThan(minimumSpacing(50));
    expect(minimumSpacing(60)).toBe(0);
  });
  it('rejects a triad stacked below the low-interval limit', () => {
    expect(respectsLowIntervalLimit([36, 40, 43])).toBe(false);
    expect(respectsLowIntervalLimit([48, 52, 55])).toBe(true);
  });
  it('lifts a muddy voicing by whole octaves, preserving its intervals', () => {
    const lifted = liftAboveMud([36, 40, 43]);
    expect(lifted).toEqual([48, 52, 55]);
    expect(respectsLowIntervalLimit(lifted)).toBe(true);
  });
  it('leaves an already clean voicing untouched', () => expect(liftAboveMud([60, 64, 67])).toEqual([60, 64, 67]));
  it('never lifts a voicing past the ceiling', () => expect(Math.max(...liftAboveMud([37, 38], 84))).toBeLessThanOrEqual(84));
  it('gives every quality in a tier a distinct pitch set, so no prompt has two right answers', () => {
    const tiers = [
      TRIAD_QUALITIES.map(quality => chord(60, quality).map(note => note.midiNumber).join()),
      SEVENTH_QUALITIES.map(quality => seventhChord(60, quality).map(note => note.midiNumber).join()),
      EXTENSION_QUALITIES.map(quality => EXTENSION_STRUCTURES[quality].join()),
      ALTERED_QUALITIES.map(quality => ALTERED_STRUCTURES[quality].join()),
    ];
    tiers.forEach(tier => expect(new Set(tier).size).toBe(tier.length));
  });
  it('builds the added triad and seventh qualities', () => {
    expect(chord(60, 'sus4').map(note => note.midiNumber)).toEqual([60, 65, 67]);
    expect(chord(60, 'power').map(note => note.midiNumber)).toEqual([60, 67]);
    expect(seventhChord(60, 'diminished 7').map(note => note.midiNumber)).toEqual([60, 63, 66, 69]);
    expect(seventhChord(60, 'minor-major 7').map(note => note.midiNumber)).toEqual([60, 63, 67, 71]);
  });
  it('inverts within the notes a chord actually has', () => {
    expect(chord(60, 'power', 2).map(note => note.midiNumber)).toEqual([67, 72]);
    expect(voiceChord(60, [0, 4, 7, 10, 14], 1).map(note => note.midiNumber)).toEqual([64, 67, 70, 74, 72]);
  });
});
