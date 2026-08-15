import { describe, expect, it } from 'vitest';
import { playbackPlan } from './playback';
import { generateStimulus, RECOGNITION_KINDS, type DrillConfig } from './training';

const config = (overrides: Partial<DrillConfig> = {}): DrillConfig => ({ kind: 'seventh', rootPool: 'all', inversions: true, melodic: false, register: 'middle', timbre: 'piano', ...overrides });

describe('playback planning', () => {
  it('always sounds the reference before the note it is asked about', () => {
    // The regression this guards: a screen that plays the target on its own turns
    // a relative-pitch question into an absolute-pitch one.
    RECOGNITION_KINDS.forEach(kind => {
      for (let seed = 0; seed < 12; seed += 1) {
        const stimulus = generateStimulus(seed, config({ kind }));
        if (!stimulus.contextNotes) continue;
        const plan = playbackPlan(stimulus, config({ kind }));
        expect(plan.mode).toBe('progression');
        expect(plan).toMatchObject({ chords: [stimulus.contextNotes, stimulus.notes] });
      }
    });
  });
  it('plays a phrase as a sequence, carrying its gap', () => {
    const stimulus = generateStimulus(3, config({ kind: 'delayed-comparison', memoryDelay: 'long' }));
    expect(playbackPlan(stimulus, config({ kind: 'delayed-comparison' }))).toMatchObject({ mode: 'progression', chords: stimulus.phrase, gapSeconds: stimulus.gapSeconds });
  });
  it('spells a chord out after sounding it whole by default', () => {
    const stimulus = generateStimulus(4, config());
    expect(playbackPlan(stimulus, config())).toMatchObject({ mode: 'block-then-arpeggio', held: 1.15 });
  });
  it('keeps a two-note interval as one gesture rather than spelling it', () => {
    const plan = playbackPlan(generateStimulus(4, config({ kind: 'interval' })), config({ kind: 'interval' }));
    expect(plan).toMatchObject({ mode: 'single', melodic: false, held: .55 });
  });
  it('honours the difficulty dimensions that change how it sounds', () => {
    expect(playbackPlan(generateStimulus(4, config()), config({ exposure: 'short' }))).toMatchObject({ held: .28 });
    expect(playbackPlan(generateStimulus(4, config()), config({ rhythm: 'syncopated' }))).toMatchObject({ mode: 'rhythm' });
    expect(playbackPlan(generateStimulus(4, config()), config({ presentation: 'arpeggiated' }))).toMatchObject({ mode: 'single', melodic: true });
    expect(playbackPlan(generateStimulus(4, config()), config({ presentation: 'block' }))).toMatchObject({ mode: 'single', melodic: false });
  });
  it('lets a stimulus that names its own shape override the drill setting', () => {
    // A mode is a scale: it is melodic whatever the presentation says.
    expect(playbackPlan(generateStimulus(4, config({ kind: 'mode' })), config({ kind: 'mode', presentation: 'block' }))).toMatchObject({ melodic: true });
  });
});
