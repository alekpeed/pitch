import { describe, expect, it } from 'vitest';
import { buildProgression, harmonyAnswers, leadVoicing, PROGRESSIONS } from './harmony';
import { chord, respectsLowIntervalLimit, seventhChord } from './theory';

describe('functional harmony', () => {
  it('transposes every progression through all twelve keys', () => {
    for (const template of PROGRESSIONS) for (let key = 0; key < 12; key += 1) {
      const current = buildProgression(key, template); const inC = buildProgression(0, template);
      expect(current.chords.flat().map((note, index) => note - inC.chords.flat()[index])).toEqual(Array(current.notes.length).fill(key));
    }
  });
  it('keeps functional and Roman labels invariant after transposition', () => {
    for (const template of PROGRESSIONS) expect(buildProgression(11, template)).toMatchObject({ function: buildProgression(0, template).function, roman: buildProgression(0, template).roman });
  });
  it('includes advanced chromatic functions', () => expect(PROGRESSIONS.map(item => item.function)).toEqual(expect.arrayContaining(['secondary dominant', 'modal mixture', 'tritone substitution'])));
  it('moves voices less than returning to root position every chord', () => {
    const motion = (chords: number[][]) => chords.slice(1).reduce((total, notes, index) =>
      total + notes.reduce((sum, note) => sum + Math.min(...chords[index].map(previous => Math.abs(note - previous))), 0), 0);
    for (const template of PROGRESSIONS.filter(item => item.chords.length >= 3 && item.pedal === undefined)) {
      const led = buildProgression(0, template).chords;
      // Baseline: the same chords, each stacked from its own root with no leading.
      const rooted = template.chords.map(item => {
        const root = 52 + item.offset;
        return (item.quality.includes('7') ? seventhChord(root, item.quality as never) : chord(root, item.quality as never)).map(note => note.midiNumber);
      });
      expect(motion(led)).toBeLessThanOrEqual(motion(rooted));
    }
  });
  it('keeps every progression clear of the low-interval limit', () => {
    for (const template of PROGRESSIONS)
      for (let key = 0; key < 12; key += 1)
        buildProgression(key, template).chords.forEach(notes => expect(respectsLowIntervalLimit(notes)).toBe(true));
  });
  it('puts the pedal on the scale degree it names, in every key', () => {
    for (const template of PROGRESSIONS.filter(item => item.pedal !== undefined))
      for (let key = 0; key < 12; key += 1) {
        const stimulus = buildProgression(key, template);
        expect(stimulus.pedalNote! % 12).toBe((key + template.pedal!) % 12);
      }
  });
  it('holds the pedal note under every chord of a pedal progression', () => {
    const pedal = PROGRESSIONS.find(template => template.pedal !== undefined)!;
    const stimulus = buildProgression(3, pedal);
    expect(stimulus.pedalNote).toBeDefined();
    stimulus.chords.forEach(notes => expect(Math.min(...notes)).toBe(stimulus.pedalNote));
  });
  it('names a destination key and a pivot chord for modulating progressions', () => {
    const modulating = PROGRESSIONS.filter(template => template.modulatesTo !== undefined);
    expect(modulating.length).toBeGreaterThan(0);
    modulating.forEach(template => {
      const stimulus = buildProgression(2, template);
      expect(stimulus.destinationKey).toBe((2 + template.modulatesTo!) % 12);
      expect(stimulus.pivotRoman).toBe(template.chords[template.pivotIndex!].roman);
    });
  });
  it('offers twelve destination keys and stimulus-specific pivot options', () => {
    expect(harmonyAnswers('modulation')).toHaveLength(12);
    const stimulus = buildProgression(0, PROGRESSIONS.find(template => template.pivotIndex !== undefined)!);
    expect(harmonyAnswers('pivot', stimulus)).toEqual(stimulus.roman.split(' – '));
  });
  it('covers every functional category the catalog asks for', () => {
    expect([...new Set(PROGRESSIONS.map(item => item.function))]).toEqual(expect.arrayContaining([
      'half cadence', 'backdoor dominant', 'diminished passing', 'chromatic mediant',
      'pedal point', 'modulation', 'circle progression', 'blues', 'rhythm changes',
    ]));
  });
  it('places a chord near the previous one rather than at its own root', () => {
    const led = leadVoicing([60, 64, 67], [65, 69, 72]);
    expect(Math.max(...led.map((note, index) => Math.abs(note - [60, 64, 67][index])))).toBeLessThanOrEqual(5);
  });
  it('never collapses two voices onto the same pitch', () => {
    const led = leadVoicing([60, 64, 67], [60, 63, 67]);
    expect(new Set(led).size).toBe(led.length);
  });
});
