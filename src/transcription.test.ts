import { beforeEach, describe, expect, it } from 'vitest';
import { gradeTranscription, parseBoundaries, parseHarmony, transcriptionStore } from './transcription';

describe('transcription lab domain', () => {
  beforeEach(() => localStorage.clear());
  it('grades harmony and boundaries independently', () => expect(gradeTranscription({ harmony: ['Dm7', 'G7', 'Cmaj7'], boundariesSeconds: [2.08, 4.5] }, { harmony: ['Dm7', 'G7', 'Cmaj7'], boundariesSeconds: [2, 4] }, .15)).toMatchObject({ harmonyAccuracy: 1, boundaryAccuracy: .5, harmonicCorrect: true, boundariesCorrect: false }));
  it('penalizes extra chords and boundaries', () => expect(gradeTranscription({ harmony: ['C', 'F'], boundariesSeconds: [1, 2] }, { harmony: ['C'], boundariesSeconds: [1] })).toMatchObject({ harmonyAccuracy: .5, boundaryAccuracy: .5 }));
  it('parses common harmonic and time entry formats', () => { expect(parseHarmony('ii7 | V7 – Imaj7')).toEqual(['ii7', 'V7', 'Imaj7']); expect(parseBoundaries('4, 2.5, nope')).toEqual([2.5, 4]); });
  it('persists one loop and reference per audio asset', () => { transcriptionStore.saveLoop({ assetId: 'song', startSeconds: 2, endSeconds: 6, playbackRate: .75 }); transcriptionStore.saveLoop({ assetId: 'song', startSeconds: 3, endSeconds: 7, playbackRate: 1 }); transcriptionStore.saveReference('song', { harmony: ['I'], boundariesSeconds: [] }); expect(transcriptionStore.loops()).toEqual([{ assetId: 'song', startSeconds: 3, endSeconds: 7, playbackRate: 1 }]); expect(transcriptionStore.reference('song')?.harmony).toEqual(['I']); });
});
