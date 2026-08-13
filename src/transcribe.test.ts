import { describe, expect, it } from 'vitest';
import {
  generateTranscription, gradeChordLabels, gradeNotes, HINT_LADDER, hintsFor, normalizeChordLabel,
} from './transcribe';

describe('generated transcription tasks', () => {
  it('replays identically from the same seed', () => {
    expect(generateTranscription(9, { kind: 'melody' })).toEqual(generateTranscription(9, { kind: 'melody' }));
  });
  it('keeps a melody inside a singable register', () => {
    for (let seed = 0; seed < 30; seed += 1) {
      const task = generateTranscription(seed, { kind: 'melody' });
      task.line.forEach(note => { expect(note).toBeGreaterThanOrEqual(60); expect(note).toBeLessThanOrEqual(84); });
    }
  });
  it('gives a bass task the bass line, not the melody', () => {
    const task = generateTranscription(4, { kind: 'bass' });
    expect(task.line).toEqual(task.bassLine);
    expect(Math.max(...task.line)).toBeLessThan(Math.min(...task.chords.flat()) + 12);
  });
  it('keeps an echo inside the two-to-four-note phrase the spec describes', () => {
    for (let seed = 0; seed < 30; seed += 1) {
      const echo = generateTranscription(seed, { kind: 'melody-echo' }).line;
      expect(echo.length).toBeGreaterThanOrEqual(2);
      expect(echo.length).toBeLessThanOrEqual(4);
    }
  });
  it('makes an echo shorter than a full transcription', () => {
    expect(generateTranscription(3, { kind: 'melody-echo' }).line.length)
      .toBeLessThan(generateTranscription(3, { kind: 'melody', bars: 4 }).line.length);
  });
  it('chains templates so longer tasks keep the harmony moving', () => {
    const long = generateTranscription(6, { kind: 'chords', bars: 8 });
    const short = generateTranscription(6, { kind: 'chords', bars: 2 });
    expect(long.chords.length).toBeGreaterThan(short.chords.length);
    expect(long.romans.length).toBe(long.chords.length);
  });
});

describe('note grading', () => {
  it('accepts a line sung or played in another octave by default', () => {
    expect(gradeNotes([60, 62, 64], [72, 74, 76]).correct).toBe(true);
    expect(gradeNotes([60, 62, 64], [72, 74, 76], false).correct).toBe(false);
  });
  it('reports which notes were right rather than only a verdict', () => {
    const grade = gradeNotes([60, 62, 64], [60, 63, 64]);
    expect(grade.perItem).toEqual([true, false, true]);
    expect(grade.matched).toBe(2);
    expect(grade.correct).toBe(false);
  });
  it('counts a short answer as incomplete rather than correct', () => {
    expect(gradeNotes([60, 62, 64], [60, 62]).correct).toBe(false);
  });
});

describe('ambiguity-aware chord grading', () => {
  it('treats equivalent spellings of one harmony as the same answer', () => {
    ['Cmaj7', 'CM7', 'CΔ7', 'Cmajor7'].forEach(label => expect(normalizeChordLabel(label)).toBe(normalizeChordLabel('Cmaj7')));
    ['Am7', 'Amin7', 'A-7'].forEach(label => expect(normalizeChordLabel(label)).toBe(normalizeChordLabel('Am7')));
  });
  it('accepts either enharmonic spelling of a root', () => {
    expect(normalizeChordLabel('C#m7')).toBe(normalizeChordLabel('Dbm7'));
    expect(normalizeChordLabel('F#7')).toBe(normalizeChordLabel('Gb7'));
  });
  it('keeps major and minor apart despite the only difference being letter case', () => {
    expect(normalizeChordLabel('CM7')).not.toBe(normalizeChordLabel('Cm7'));
    expect(normalizeChordLabel('CM9')).not.toBe(normalizeChordLabel('Cm9'));
    expect(normalizeChordLabel('Dm7')).toBe(normalizeChordLabel('Dmin7'));
  });
  it('does not conflate genuinely different harmonies', () => {
    expect(normalizeChordLabel('Cmaj7')).not.toBe(normalizeChordLabel('C7'));
    expect(normalizeChordLabel('Cm7')).not.toBe(normalizeChordLabel('Cm7b5'));
    expect(normalizeChordLabel('C')).not.toBe(normalizeChordLabel('Cm'));
  });
  it('rejects something that is not a chord label at all', () => {
    expect(normalizeChordLabel('hello')).toBeUndefined();
    expect(normalizeChordLabel('')).toBeUndefined();
  });
  it('grades a whole sequence position by position', () => {
    const grade = gradeChordLabels(['Dm7', 'G7', 'Cmaj7'], ['Dmin7', 'G7', 'C7']);
    expect(grade.perItem).toEqual([true, true, false]);
    expect(grade.matched).toBe(2);
  });
  it('ignores whitespace and unicode accidentals', () => {
    expect(gradeChordLabels(['C♯m7'], [' C#m7 ']).correct).toBe(true);
  });
});

describe('guided hints', () => {
  const task = generateTranscription(11, { kind: 'chords' });
  it('reveals nothing until asked', () => expect(hintsFor(task, 0)).toEqual([]));
  it('reveals key first and the answer last', () => {
    expect(hintsFor(task, 1)[0]).toContain('key centre');
    expect(hintsFor(task, HINT_LADDER.length).at(-1)).toContain('answer is');
  });
  it('adds one rung at a time', () => {
    for (let level = 1; level <= HINT_LADDER.length; level += 1) expect(hintsFor(task, level)).toHaveLength(level);
  });
  it('never reveals more than the ladder holds', () => {
    expect(hintsFor(task, 99)).toHaveLength(HINT_LADDER.length);
  });
});
