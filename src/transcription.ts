export interface LoopRegion { assetId: string; startSeconds: number; endSeconds: number; playbackRate: number }
export interface TranscriptionReference { harmony: string[]; boundariesSeconds: number[] }
export interface TranscriptionAnswer { harmony: string[]; boundariesSeconds: number[] }
export interface TranscriptionGrade { harmonyAccuracy: number; boundaryAccuracy: number; matchedHarmony: number; matchedBoundaries: number; harmonicCorrect: boolean; boundariesCorrect: boolean }
export interface TranscriptionSubmission { id: string; sessionId: string; assetId: string; submittedAt: string; answer: TranscriptionAnswer; reference?: TranscriptionReference; grade?: TranscriptionGrade; transferCategory: 'real-music'; submittedBeforeReference: boolean }
const normalize = (value: string) => value.trim().toLowerCase().replaceAll('♭', 'b').replaceAll('♯', '#').replace(/\s+/g, ' ');
export const parseHarmony = (value: string) => value.split(/\s*(?:\||,|–|—|->)\s*/).map(item => item.trim()).filter(Boolean);
export const parseBoundaries = (value: string) => value.split(',').map(Number).filter(item => Number.isFinite(item) && item >= 0).sort((a, b) => a - b);

export function gradeTranscription(answer: TranscriptionAnswer, reference: TranscriptionReference, toleranceSeconds = .2): TranscriptionGrade {
  const expectedHarmony = reference.harmony.map(normalize); const actualHarmony = answer.harmony.map(normalize);
  const matchedHarmony = expectedHarmony.reduce((count, chord, index) => count + Number(actualHarmony[index] === chord), 0);
  const used = new Set<number>(); let matchedBoundaries = 0;
  reference.boundariesSeconds.forEach(expected => { const candidate = answer.boundariesSeconds.map((actual, index) => ({ index, distance: Math.abs(actual - expected) })).filter(item => !used.has(item.index) && item.distance <= toleranceSeconds).sort((a, b) => a.distance - b.distance)[0]; if (candidate) { used.add(candidate.index); matchedBoundaries += 1; } });
  const harmonyDenominator = Math.max(expectedHarmony.length, actualHarmony.length, 1); const boundaryDenominator = Math.max(reference.boundariesSeconds.length, answer.boundariesSeconds.length, 1);
  const harmonyAccuracy = matchedHarmony / harmonyDenominator; const boundaryAccuracy = matchedBoundaries / boundaryDenominator;
  return { harmonyAccuracy, boundaryAccuracy, matchedHarmony, matchedBoundaries, harmonicCorrect: harmonyAccuracy === 1, boundariesCorrect: boundaryAccuracy === 1 };
}

function read<T>(key: string): T[] { try { const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? '[]'); return Array.isArray(parsed) ? parsed as T[] : []; } catch { return []; } }
const LOOP_KEY = 'perfect-ear-transcription-loops-v1'; const REFERENCE_KEY = 'perfect-ear-transcription-references-v1'; const SUBMISSION_KEY = 'perfect-ear-transcription-submissions-v1';
export const transcriptionStore = {
  loops: () => read<LoopRegion>(LOOP_KEY),
  saveLoop(loop: LoopRegion) { localStorage.setItem(LOOP_KEY, JSON.stringify([...this.loops().filter(item => item.assetId !== loop.assetId), loop])); },
  reference(assetId: string) { return read<{ assetId: string; reference: TranscriptionReference }>(REFERENCE_KEY).find(item => item.assetId === assetId)?.reference; },
  saveReference(assetId: string, reference: TranscriptionReference) { const items = read<{ assetId: string; reference: TranscriptionReference }>(REFERENCE_KEY); localStorage.setItem(REFERENCE_KEY, JSON.stringify([...items.filter(item => item.assetId !== assetId), { assetId, reference }])); },
  submissions: () => read<TranscriptionSubmission>(SUBMISSION_KEY),
  addSubmission(submission: TranscriptionSubmission) { localStorage.setItem(SUBMISSION_KEY, JSON.stringify([...this.submissions(), submission])); },
  clear() { [LOOP_KEY, REFERENCE_KEY, SUBMISSION_KEY].forEach(key => localStorage.removeItem(key)); }
};
