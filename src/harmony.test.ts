import { describe, expect, it } from 'vitest';
import { buildProgression, PROGRESSIONS } from './harmony';

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
});
