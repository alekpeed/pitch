import type { AudioEngine } from './audio';
import { pitch } from './theory';
import type { DrillConfig, Stimulus } from './training';

/**
 * How a stimulus should sound, decided in one place.
 *
 * This exists because it did not: the Practice screen and the Diagnostic screen
 * each had their own copy of this logic, and the Diagnostic's copy had quietly
 * dropped `contextNotes`. That meant a scale-degree probe played its target note
 * with no reference tonic in front of it, turning a relative-pitch question into
 * one only absolute pitch could answer — a silent, content-level bug that no
 * layout or type check would ever catch. Deciding playback once, as data, keeps
 * every screen honest and makes the decision testable on its own.
 */
export type Playback =
  | { mode: 'progression'; chords: number[][]; gapSeconds?: number }
  | { mode: 'rhythm'; notes: number[]; onsets: number[]; held: number }
  | { mode: 'block-then-arpeggio'; notes: number[]; held: number }
  | { mode: 'single'; notes: number[]; held: number; melodic: boolean };

const SYNCOPATED_ONSETS = [0, .34, .82, 1.1];

export function playbackPlan(stimulus: Stimulus, config: DrillConfig): Playback {
  // A phrase is already a sequence, and context is a reference sounded before
  // the thing being judged. Both are non-negotiable: dropping either changes
  // what the question is asking.
  if (stimulus.phrase) return { mode: 'progression', chords: stimulus.phrase, gapSeconds: stimulus.gapSeconds };
  if (stimulus.contextNotes) return { mode: 'progression', chords: [stimulus.contextNotes, stimulus.notes] };

  const presentation = config.presentation ?? 'both';
  const melodic = stimulus.melodic ?? (presentation === 'arpeggiated' || (config.kind === 'interval' && config.melodic));
  // Short exposure is a difficulty dimension: less time to decide, same chord.
  const held = config.exposure === 'short' ? .28 : config.kind === 'interval' ? .55 : melodic ? .5 : 1.15;

  if (config.rhythm === 'syncopated' && !melodic) return { mode: 'rhythm', notes: stimulus.notes, onsets: SYNCOPATED_ONSETS, held: Math.min(held, .4) };
  // Only a real chord has a quality to spell out; two notes or one are already
  // as separated as they can usefully be.
  if (presentation === 'both' && !melodic && stimulus.notes.length >= 3) return { mode: 'block-then-arpeggio', notes: stimulus.notes, held };
  return { mode: 'single', notes: stimulus.notes, held, melodic };
}

/** Hands a plan to the engine. Kept apart from the decision so that stays pure. */
export function renderPlayback(audio: AudioEngine, plan: Playback, timbre: DrillConfig['timbre']) {
  const voiced = (notes: number[]) => notes.map(pitch);
  if (plan.mode === 'progression') return void audio.playProgression(plan.chords.map(voiced), timbre, plan.gapSeconds);
  if (plan.mode === 'rhythm') return void audio.playRhythm(voiced(plan.notes), plan.onsets, plan.held, timbre);
  if (plan.mode === 'block-then-arpeggio') return void audio.blockThenArpeggio(voiced(plan.notes), plan.held, timbre);
  void audio.play(voiced(plan.notes), plan.held, plan.melodic, timbre);
}
