import { describe, expect, it } from 'vitest';
import { chord, frequency, pitch, seededRandom } from './theory';

describe('music theory model', () => {
  it('represents a sounding pitch independently from its spelling', () => expect(pitch(60)).toEqual({ midiNumber: 60, pitchClass: 0, octave: 4, spelling: 'C' }));
  it('rejects invalid MIDI notes', () => expect(() => pitch(128)).toThrow(RangeError));
  it('generates correctly inverted triads', () => {
    expect(chord(60, 'major', 0).map(note => note.midiNumber)).toEqual([60, 64, 67]);
    expect(chord(60, 'minor', 2).map(note => note.midiNumber)).toEqual([67, 72, 75]);
  });
  it('uses standard equal-tempered tuning', () => expect(frequency(69)).toBe(440));
  it('replays a seed deterministically', () => { const a = seededRandom(42); const b = seededRandom(42); expect([a(), a()]).toEqual([b(), b()]); });
});
