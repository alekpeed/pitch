import type { RankedExercise, SkillState } from './adaptive';
import { PROGRESSIONS } from './harmony';
import { SPACINGS, type Spacing } from './texture';
import type { DrillConfig, ExerciseKind, Timbre } from './training';
import { RECOGNITION_KINDS } from './training';
import type { VoicingStyle } from './voicing';

/* --------------------------------------------------------- exercise ids */

export const HARMONY_EXERCISES = ['harmony-function', 'harmony-roman', 'harmony-modulation', 'harmony-pivot'] as const;
export const PRODUCTION_EXERCISES = [
  'exact-voicing-copy', 'guide-tone-voice-leading', 'scale-degree-production', 'interval-production',
  'harmonization', 'reharmonization', 'chord-tone-production', 'guide-tone-production', 'root-motion-production',
  'call-response-melody', 'call-response-chord', 'functional-performance',
] as const;
export const TRANSFER_EXERCISES = ['transcribe-melody', 'transcribe-chords', 'transcription'] as const;
/** Hearing inside a chord rather than naming it — spacing, colour, and moving voices. */
export const VOICING_EXERCISES = [
  'voicing-spacing', 'upper-structure', 'voice-motion', 'inner-voice-melody',
  'inner-voice-reproduction', 'voicing-change',
] as const;

/** Every exercise id the app can schedule. A curriculum may only name these. */
export const ALL_EXERCISES: readonly string[] = [
  ...RECOGNITION_KINDS.map(kind => `${kind}-recognition`),
  ...HARMONY_EXERCISES, ...PRODUCTION_EXERCISES, ...TRANSFER_EXERCISES, ...VOICING_EXERCISES,
];

/* ------------------------------------------------------------- profiles */

export type ProfileId = 'jazz' | 'pop' | 'rnb' | 'rock' | 'classical';

export interface CurriculumStage {
  name: string;
  /** What the stage should leave you able to hear, in plain language. */
  goal: string;
  exercises: readonly string[];
}

export interface GenreProfile {
  id: ProfileId;
  name: string;
  focus: string;
  repertoire: string;
  stages: readonly CurriculumStage[];
  /** Progression templates characteristic of the genre, by template id. */
  progressions: readonly string[];
  voicings: readonly VoicingStyle[];
  timbre: Timbre;
  /**
   * Answer sets narrowed to the vocabulary the genre actually uses. A default,
   * never a lock: the drill settings still reach the full list.
   */
  vocabulary: Partial<Record<ExerciseKind, readonly string[]>>;
}

export const PROFILES: readonly GenreProfile[] = [
  {
    id: 'jazz',
    name: 'Jazz',
    focus: 'ii–V–I, guide tones, rootless voicings, extensions and substitution.',
    repertoire: 'Standards and blowing changes — hearing a chart move rather than naming isolated chords.',
    timbre: 'rhodes',
    voicings: ['shell', 'rootless', 'drop-2', 'drop-3', 'quartal'],
    progressions: ['two-five-one', 'circle-fifths', 'rhythm-changes', 'blues', 'tritone-sub', 'backdoor', 'half-dim-two', 'dim-passing'],
    vocabulary: {
      seventh: ['major 7', 'dominant 7', 'minor 7', 'half-diminished 7', 'diminished 7', 'minor-major 7'],
      triad: ['major', 'minor', 'diminished', 'augmented'],
    },
    stages: [
      { name: 'Sevenths and the ii–V–I', goal: 'Hear the four common seventh qualities and recognise a ii–V–I as one shape rather than three chords.', exercises: ['seventh-recognition', 'harmony-function', 'decomposition-recognition'] },
      { name: 'Guide tones', goal: 'Follow the 3rd and 7th through changes, which is the line that makes the harmony audible.', exercises: ['guide-tone-production', 'guide-tone-voice-leading', 'root-motion-production'] },
      { name: 'Rootless voicings and extensions', goal: 'Hear a chord whose root is not being played, and name the colour tone on top.', exercises: ['exact-voicing-copy', 'extension-recognition', 'bass-recognition', 'voicing-spacing'] },
      { name: 'Alterations and substitution', goal: 'Tell an altered dominant from a plain one, and hear a tritone sub as a substitute rather than a wrong chord.', exercises: ['altered-recognition', 'upper-structure', 'harmony-roman', 'reharmonization', 'transcribe-chords'] },
    ],
  },
  {
    id: 'pop',
    name: 'Modern pop / K-pop',
    focus: 'Inversions, slash chords, modal mixture, sus and add9 colour, pedals and deceptive motion.',
    repertoire: 'Four-chord loops and the chromatic turns that make them stop sounding like four chords.',
    timbre: 'piano',
    voicings: ['close', 'open'],
    progressions: ['axis', 'one-six-two-five', 'deceptive', 'modal-mixture', 'flat-six', 'flat-seven', 'chromatic-mediant', 'tonic-pedal'],
    vocabulary: {
      triad: ['major', 'minor', 'sus2', 'sus4'],
      extension: ['6', 'add9', '6/9', 'major 9', 'minor 9'],
      mode: ['Ionian', 'Aeolian', 'Dorian', 'Mixolydian', 'Lydian'],
    },
    stages: [
      { name: 'Triads and the loop', goal: 'Hear major and minor instantly, and recognise the common four-chord loops by their motion.', exercises: ['triad-recognition', 'harmony-function', 'tonal-center-recognition'] },
      { name: 'Inversions and slash chords', goal: 'Hear the bass separately from the chord above it, which is what a slash chord asks of you.', exercises: ['bass-recognition', 'slash-chord-recognition', 'voicing-change'] },
      { name: 'Sus, add9 and borrowed colour', goal: 'Name the added tone, and hear a borrowed chord as brightness or shadow rather than a mistake.', exercises: ['extension-recognition', 'harmony-roman', 'mode-recognition'] },
      { name: 'Pedals and chromatic turns', goal: 'Hold a bass note in your ear while the harmony moves over it, and catch a chromatic mediant when it lands.', exercises: ['multibar-memory-recognition', 'transcribe-chords', 'harmonization'] },
    ],
  },
  {
    id: 'rnb',
    name: 'R&B / neo-soul',
    focus: 'Extended chords, upper structures, chromatic voice leading, dense voicings.',
    repertoire: 'Chords too dense to spell at speed — heard by their top note and their motion instead.',
    timbre: 'rhodes',
    voicings: ['rootless', 'drop-2', 'spread', 'quartal'],
    progressions: ['two-five-one', 'half-dim-two', 'dim-passing', 'backdoor', 'chromatic-mediant', 'flat-seven', 'tonic-pedal'],
    vocabulary: {
      seventh: ['major 7', 'minor 7', 'dominant 7', 'half-diminished 7', 'minor-major 7'],
      extension: ['major 9', 'minor 9', 'minor 11', 'dominant 13', '6/9', 'add9', 'dominant 11'],
    },
    stages: [
      { name: 'Sevenths and ninths', goal: 'Hear the 9th as colour on top of a chord you already know, not as a new chord.', exercises: ['seventh-recognition', 'extension-recognition'] },
      { name: 'Inside dense voicings', goal: 'Pull a named member out of a chord with five or six notes in it.', exercises: ['decomposition-recognition', 'exact-voicing-copy', 'chord-tone-production', 'voicing-spacing'] },
      { name: 'Chromatic voice leading', goal: 'Follow one voice moving by half step while the rest of the chord stays put.', exercises: ['guide-tone-voice-leading', 'voice-motion', 'harmony-roman', 'guide-tone-production'] },
      { name: 'Hearing the top of the chord', goal: 'Identify the highest sounding tone, which is what carries the sound of this harmony.', exercises: ['altered-recognition', 'upper-structure', 'transcribe-chords', 'reharmonization'] },
    ],
  },
  {
    id: 'rock',
    name: 'Rock / guitar',
    focus: 'Power chords, riffs, pedal tones, modal harmony, guitar voicings.',
    repertoire: 'Riff-driven music where the interesting information is in the bass and the mode.',
    timbre: 'guitar',
    voicings: ['open', 'spread'],
    progressions: ['plagal', 'flat-seven', 'flat-six', 'axis', 'blues', 'dominant-pedal', 'tonic-pedal', 'secondary-dominant'],
    vocabulary: {
      triad: ['power', 'major', 'minor', 'sus4', 'sus2'],
      mode: ['Ionian', 'Dorian', 'Mixolydian', 'Aeolian'],
    },
    stages: [
      { name: 'Power chords and triads', goal: 'Tell a bare fifth from a full triad, and hear which third a chord has when it has one.', exercises: ['triad-recognition', 'interval-recognition'] },
      { name: 'Riffs and modal colour', goal: 'Recognise Mixolydian and Dorian by their flat 7th and natural 6th rather than by feel.', exercises: ['mode-recognition', 'scale-degree-recognition'] },
      { name: 'Pedal tones and progressions', goal: 'Hear a held bass under moving harmony, and follow a progression built on ♭VII and ♭VI.', exercises: ['harmony-function', 'bass-recognition', 'voicing-spacing', 'multibar-memory-recognition'] },
      { name: 'Playing it back on the neck', goal: 'Reproduce a riff and a bass line on the fretboard from hearing alone.', exercises: ['call-response-melody', 'functional-performance', 'transcribe-melody'] },
    ],
  },
  {
    id: 'classical',
    name: 'Classical / tonal',
    focus: 'Functional cadences, sequences, inversions, modulation, part tracking.',
    repertoire: 'Tonal repertoire, where the question is usually what the harmony is doing rather than what it is called.',
    timbre: 'strings',
    voicings: ['close', 'open', 'drop-3'],
    progressions: ['authentic', 'half', 'plagal', 'deceptive', 'secondary-dominant', 'circle-fifths', 'dim-passing', 'modulate-dominant', 'modulate-relative'],
    vocabulary: {
      triad: ['major', 'minor', 'diminished', 'augmented'],
      seventh: ['major 7', 'dominant 7', 'minor 7', 'half-diminished 7', 'diminished 7'],
      mode: ['Ionian', 'Aeolian'],
    },
    stages: [
      { name: 'Cadence types', goal: 'Tell an authentic cadence from a half or deceptive one by where it lands, not by how it feels.', exercises: ['harmony-function', 'triad-recognition'] },
      { name: 'Inversions and the bass', goal: 'Hear which chord member is in the bass, which is the whole of figured bass.', exercises: ['bass-recognition', 'seventh-recognition'] },
      { name: 'Sequences and modulation', goal: 'Notice the moment a key changes, and hear which chord belonged to both keys.', exercises: ['harmony-modulation', 'harmony-pivot', 'tonal-center-recognition'] },
      { name: 'Following the parts', goal: 'Track an individual voice through a texture instead of hearing chords as blocks.', exercises: ['guide-tone-voice-leading', 'inner-voice-melody', 'voice-motion', 'transcribe-melody', 'interval-production'] },
    ],
  },
];

export const profileFor = (id: ProfileId | undefined) => PROFILES.find(profile => profile.id === id);

/* ----------------------------------------------------------- emphasis */

/**
 * Emphasis is derived from stage position rather than listed separately, so the
 * curriculum order is the single source of truth: earlier stages weigh more.
 */
export function emphasisFor(profile: GenreProfile, exercise: string): number {
  const index = profile.stages.findIndex(stage => stage.exercises.includes(exercise));
  return index < 0 ? 0 : 1 - index / profile.stages.length;
}

/** Deliberately smaller than any single evidence signal: a genre steers, it does not override. */
const PROFILE_BOOST = 18;

export interface ProfiledExercise extends RankedExercise { emphasis: number; stage?: string }

/**
 * Reorders an evidence-ranked list toward the genre, without removing anything.
 * Off-profile skills keep their own priority, so a real weakness still surfaces
 * even when it belongs to no stage of the chosen curriculum.
 */
export function applyProfile(ranked: readonly RankedExercise[], profile?: GenreProfile): ProfiledExercise[] {
  if (!profile) return ranked.map(item => ({ ...item, emphasis: 0 }));
  return ranked.map(item => {
    const emphasis = emphasisFor(profile, item.exercise);
    const stage = profile.stages.find(item2 => item2.exercises.includes(item.exercise))?.name;
    return { ...item, emphasis, stage, priority: item.priority + emphasis * PROFILE_BOOST };
  }).sort((a, b) => b.priority - a.priority);
}

/* -------------------------------------------------------- stage progress */

export interface StageStatus {
  stage: CurriculumStage; index: number; met: string[]; outstanding: string[]; complete: boolean;
}

const MET: ReadonlySet<string> = new Set(['Reliable', 'Automatic', 'Transferred']);

/**
 * A stage is met when every exercise in it has reached Reliable — the same
 * evidence bar the rest of the app uses, not a separate genre-only score.
 */
export function stageProgress(profile: GenreProfile, states: readonly SkillState[]): StageStatus[] {
  return profile.stages.map((stage, index) => {
    const met = stage.exercises.filter(exercise => MET.has(states.find(state => state.exercise === exercise)?.mastery ?? ''));
    return {
      stage, index, met: [...met],
      outstanding: stage.exercises.filter(exercise => !met.includes(exercise)),
      complete: met.length === stage.exercises.length,
    };
  });
}

/** The first stage not yet met, or the last one once the curriculum is finished. */
export function currentStage(profile: GenreProfile, states: readonly SkillState[]): StageStatus {
  const progress = stageProgress(profile, states);
  return progress.find(status => !status.complete) ?? progress[progress.length - 1];
}

/* ------------------------------------------------------- applying to drills */

/**
 * Seeds a drill with the genre's default sound and vocabulary. `only` narrows the
 * answer grid, which is what makes a rock triad drill offer power chords and sus
 * chords rather than augmented ones.
 *
 * It always owns `only`, including when there is no profile — otherwise the
 * narrowing a cleared genre applied would silently outlive it.
 */
export function profileConfig(config: DrillConfig, profile?: GenreProfile): DrillConfig {
  const vocabulary = profile?.vocabulary[config.kind];
  return {
    ...config,
    timbre: profile?.timbre ?? config.timbre,
    only: vocabulary ? [...vocabulary] : undefined,
  };
}

/**
 * The genre's voicing styles, narrowed to the ones that are a spacing of a whole
 * chord — shell and rootless describe which notes are present, not how they sit.
 */
export function profileSpacings(profile?: GenreProfile): Spacing[] | undefined {
  const spacings = profile?.voicings.filter((style): style is Spacing => (SPACINGS as readonly string[]).includes(style));
  return spacings?.length ? spacings : undefined;
}

/** The genre's progression templates, falling back to the full set if none match. */
export function profileProgressionIds(profile?: GenreProfile): string[] | undefined {
  if (!profile) return undefined;
  const ids = PROGRESSIONS.filter(template => profile.progressions.includes(template.id)).map(template => template.id);
  return ids.length ? ids : undefined;
}

/* ------------------------------------------------------------- storage */

const PROFILE_KEY = 'perfect-ear-profile-v1';
export const profileStore = {
  get(): ProfileId | undefined {
    try {
      const stored = localStorage.getItem(PROFILE_KEY);
      return PROFILES.some(profile => profile.id === stored) ? stored as ProfileId : undefined;
    } catch { return undefined; }
  },
  set(id: ProfileId | undefined) {
    if (id) localStorage.setItem(PROFILE_KEY, id); else localStorage.removeItem(PROFILE_KEY);
  },
};
