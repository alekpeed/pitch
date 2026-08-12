import { describe, expect, it } from 'vitest';
import { chord, frequency, liftAboveMud, minimumSpacing, pitch, respectsLowIntervalLimit, seededRandom } from './theory';

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
});
