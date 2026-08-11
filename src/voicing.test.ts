import { describe, expect, it } from 'vitest';
import { generateVoicing, gradeMidiPerformance, guideToneVoicings, voiceLeadingMotion, type VoicingStyle } from './voicing';

describe('voicing and MIDI performance', () => {
  it('keeps every style inside its configured range with unique notes', () => {
    const styles: VoicingStyle[] = ['close', 'open', 'spread', 'drop-2', 'shell', 'rootless'];
    for (const style of styles) for (let rootPitchClass = 0; rootPitchClass < 12; rootPitchClass += 1) {
      const notes = generateVoicing({ rootPitchClass, quality: 'dominant 7', style, low: 40, high: 84 });
      expect(notes).toEqual([...notes].sort((a, b) => a - b)); expect(new Set(notes).size).toBe(notes.length); expect(Math.min(...notes)).toBeGreaterThanOrEqual(40); expect(Math.max(...notes)).toBeLessThanOrEqual(84);
    }
  });
  it('omits the root from rootless voicings', () => expect(generateVoicing({ rootPitchClass: 0, quality: 'dominant 7', style: 'rootless' }).map(note => note % 12)).not.toContain(0));
  it('accepts a human rolled chord within tolerance', () => expect(gradeMidiPerformance([{ note: 60, timeMs: 0, velocity: 80 }, { note: 64, timeMs: 45, velocity: 80 }, { note: 67, timeMs: 105, velocity: 80 }], [60, 64, 67], 'exact', 120)).toMatchObject({ correct: true, timingAccepted: true, timingSpreadMs: 105 }));
  it('supports exact and octave-equivalent grading', () => { const events = [60, 64, 67].map(note => ({ note: note + 12, timeMs: 0, velocity: 90 })); expect(gradeMidiPerformance(events, [60, 64, 67], 'exact').pitchCorrect).toBe(false); expect(gradeMidiPerformance(events, [60, 64, 67], 'equivalent').pitchCorrect).toBe(true); });
  it('creates economical ii-V-I guide-tone motion', () => expect(voiceLeadingMotion(guideToneVoicings(0)).flat().every(distance => distance <= 2)).toBe(true));
});
