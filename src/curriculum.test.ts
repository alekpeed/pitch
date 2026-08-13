import { describe, expect, it } from 'vitest';
import { skillStates, type RankedExercise, type SkillState } from './adaptive';
import { generateHarmony, PROGRESSIONS } from './harmony';
import {
  ALL_EXERCISES, applyProfile, currentStage, emphasisFor, PROFILES, profileConfig, profileFor,
  profileProgressionIds, stageProgress,
} from './curriculum';
import type { Attempt } from './storage';
import { answersFor, ANSWERS } from './training';

const attempt = (exercise: string, correct: boolean, index: number): Attempt => ({
  id: `${exercise}-${index}`, timestamp: new Date(Date.now() - index * 60_000).toISOString(), exercise,
  stimulus: {}, expected: 'x', response: correct ? 'x' : 'y', correct, latencyMs: 1200,
  difficulty: { register: index % 2 ? 'low' : 'high', timbre: index % 3 ? 'piano' : 'rhodes' }, replayCount: 0,
});
const reliableIn = (exercise: string) => Array.from({ length: 14 }, (_, index) => attempt(exercise, index > 0, index));

describe('genre profiles', () => {
  it('covers the five profiles the catalog names', () => {
    expect(PROFILES.map(profile => profile.id)).toEqual(['jazz', 'pop', 'rnb', 'rock', 'classical']);
  });

  it('only ever names exercises the app can actually schedule', () => {
    PROFILES.forEach(profile => profile.stages.forEach(stage => stage.exercises.forEach(exercise => {
      expect(ALL_EXERCISES, `${profile.id} / ${stage.name}`).toContain(exercise);
    })));
  });

  it('only ever names progressions that exist', () => {
    const ids = PROGRESSIONS.map(template => template.id);
    PROFILES.forEach(profile => profile.progressions.forEach(id => expect(ids, profile.id).toContain(id)));
  });

  it('narrows answer grids to labels the drill really offers', () => {
    PROFILES.forEach(profile => Object.entries(profile.vocabulary).forEach(([kind, labels]) => {
      const full = ANSWERS[kind as keyof typeof ANSWERS];
      labels.forEach(label => expect(full, `${profile.id} / ${kind}`).toContain(label));
    }));
  });

  it('gives every stage more than a name', () => {
    PROFILES.forEach(profile => profile.stages.forEach(stage => {
      expect(stage.exercises.length).toBeGreaterThan(0);
      expect(stage.goal.length).toBeGreaterThan(20);
    }));
  });
});

describe('emphasis', () => {
  it('weighs earlier stages above later ones', () => {
    const jazz = profileFor('jazz')!;
    const first = jazz.stages[0].exercises[0];
    const last = jazz.stages[jazz.stages.length - 1].exercises[0];
    expect(emphasisFor(jazz, first)).toBeGreaterThan(emphasisFor(jazz, last));
  });

  it('is zero for an exercise the profile never names', () => {
    expect(emphasisFor(profileFor('rock')!, 'harmony-pivot')).toBe(0);
  });

  it('steers the ranking without silencing an off-genre weakness', () => {
    const ranked: RankedExercise[] = [
      { exercise: 'harmony-pivot', priority: 40, reason: '40% accurate' },
      { exercise: 'triad-recognition', priority: 34, reason: '70% accurate' },
    ];
    const rock = applyProfile(ranked, profileFor('rock'));
    // The genre's opening skill overtakes a slightly weaker off-genre one...
    expect(rock[0].exercise).toBe('triad-recognition');
    // ...but the off-genre weakness is still scheduled, at its own priority.
    expect(rock.find(item => item.exercise === 'harmony-pivot')).toMatchObject({ priority: 40, emphasis: 0 });
  });

  it('cannot outrank a pinned skill', () => {
    const ranked: RankedExercise[] = [
      { exercise: 'harmony-pivot', priority: 1030, reason: 'Pinned by you' },
      { exercise: 'triad-recognition', priority: 30, reason: 'Not practiced yet' },
    ];
    expect(applyProfile(ranked, profileFor('rock'))[0].exercise).toBe('harmony-pivot');
  });

  it('leaves the ranking untouched when no profile is chosen', () => {
    const ranked: RankedExercise[] = [{ exercise: 'triad-recognition', priority: 12, reason: 'x' }];
    expect(applyProfile(ranked, undefined)[0].priority).toBe(12);
  });

  it('labels which stage a boosted exercise came from', () => {
    const boosted = applyProfile([{ exercise: 'seventh-recognition', priority: 10, reason: 'x' }], profileFor('jazz'));
    expect(boosted[0].stage).toBe('Sevenths and the ii–V–I');
  });
});

describe('stage progress', () => {
  const jazz = profileFor('jazz')!;

  it('starts on the first stage with no evidence at all', () => {
    expect(currentStage(jazz, []).index).toBe(0);
  });

  it('advances only once every exercise in a stage is reliable', () => {
    const partial = skillStates({ attempts: reliableIn('seventh-recognition') });
    expect(currentStage(jazz, partial).index).toBe(0);
    const whole = skillStates({ attempts: jazz.stages[0].exercises.flatMap(reliableIn) });
    expect(stageProgress(jazz, whole)[0].complete).toBe(true);
    expect(currentStage(jazz, whole).index).toBe(1);
  });

  it('names what is still outstanding in the current stage', () => {
    const states = skillStates({ attempts: reliableIn('seventh-recognition') });
    const stage = currentStage(jazz, states);
    expect(stage.met).toEqual(['seventh-recognition']);
    expect(stage.outstanding).toContain('harmony-function');
  });

  it('holds on the last stage rather than running off the end', () => {
    const states = skillStates({ attempts: jazz.stages.flatMap(stage => stage.exercises.flatMap(reliableIn)) });
    expect(currentStage(jazz, states).index).toBe(jazz.stages.length - 1);
    expect(stageProgress(jazz, states).every(status => status.complete)).toBe(true);
  });

  it('does not count a struggling skill as met', () => {
    const failing: SkillState[] = [];
    expect(stageProgress(jazz, failing)[0].met).toEqual([]);
  });
});

describe('applying a profile to drills', () => {
  it('offers power chords in a rock triad drill and not augmented ones', () => {
    const config = profileConfig({ kind: 'triad', rootPool: 'all', inversions: false, melodic: false, register: 'middle', timbre: 'piano' }, profileFor('rock'));
    const answers = answersFor(config);
    expect(answers).toContain('power');
    expect(answers).not.toContain('augmented');
    expect(config.timbre).toBe('guitar');
  });

  it('leaves a drill the genre says nothing about at its full answer set', () => {
    const config = profileConfig({ kind: 'interval', rootPool: 'all', inversions: false, melodic: true, register: 'middle', timbre: 'piano' }, profileFor('rock'));
    expect(answersFor(config)).toEqual(ANSWERS.interval);
  });

  it('keeps the drill as it was when there is no profile', () => {
    const base = { kind: 'triad', rootPool: 'all', inversions: true, melodic: false, register: 'low', timbre: 'organ' } as const;
    expect(profileConfig({ ...base }, undefined)).toEqual(base);
  });

  it('clears a narrowing the previous profile applied', () => {
    const narrowed = profileConfig({ kind: 'triad', rootPool: 'all', inversions: false, melodic: false, register: 'middle', timbre: 'piano' }, profileFor('rock'));
    // Without this, clearing the genre would leave its answer grid behind forever.
    expect(answersFor(profileConfig(narrowed, undefined))).toEqual(ANSWERS.triad);
  });
});

describe('applying a profile to progressions', () => {
  it('draws only from the genre pool when one is given', () => {
    const jazzIds = profileProgressionIds(profileFor('jazz'))!;
    for (let seed = 0; seed < 30; seed += 1) {
      expect(jazzIds).toContain(generateHarmony(seed, 'function', jazzIds).templateId);
    }
  });

  it('still produces a modulation when the genre lists none', () => {
    // Rock names no modulating template; asking for one must not return nothing.
    const rockIds = profileProgressionIds(profileFor('rock'))!;
    const stimulus = generateHarmony(3, 'modulation', rockIds);
    expect(stimulus.destinationKey).toBeDefined();
  });

  it('uses the whole catalog when no profile is chosen', () => {
    expect(profileProgressionIds(undefined)).toBeUndefined();
  });
});
