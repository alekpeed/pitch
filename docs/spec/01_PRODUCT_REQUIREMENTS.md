# Product Requirements

## 1. Product objective
Create a complete ear-training and practical musicianship application that develops auditory recognition, functional hearing, transcription, harmonic understanding, and reproduction on piano/guitar. It should adapt to the user's actual weaknesses and maintain a longitudinal record of capability.

## 2. Success definition
The product succeeds when improvement inside the app predicts improvement outside it. Examples:
- Faster and more accurate recognition of chord quality and function.
- Better identification of bass movement, inversions, extensions, and voicings.
- More accurate transcription of unfamiliar real music.
- Ability to reproduce heard intervals, melodies, chords, and voicings on voice or instrument.
- Reduced dependence on visual/theory clues during listening.

## 3. Explicit non-goals
- Gamification for retention.
- Social network, public profiles, competitions, streaks, or rewards.
- Simplifying advanced harmony to preserve beginner friendliness.
- Treating one global score as musicianship.
- Claiming one chord label is uniquely correct when the audio is harmonically ambiguous.

## 4. Core modes
### Daily Practice
Automatic 10-20 minute session composed from retention needs, current weaknesses, one growth target, and one transfer task.

### Targeted Practice
User selects any skill and controls difficulty dimensions.

### Diagnostic
Broad assessment used to initialize or periodically recalibrate the user model.

### Transcription Lab
Short generated examples through full-song excerpts. Supports looping, slowing, optional stems, waveform/beat grid, answer entry, and progressive hints.

### Performance Lab
User reproduces requested material by voice, MIDI keyboard, guitar/microphone, or on-screen input.

### Progress Journal
Automatic longitudinal record of sessions, skills, weaknesses, milestones, and real-music benchmarks.

### Curriculum Explorer
Tree/grid of skills and prerequisites. It is navigational, not a game path.

## 5. Required input methods
- Touch/mouse multiple choice.
- Piano keyboard input.
- Guitar fretboard input where useful.
- Text/chord-symbol entry.
- Roman numeral entry.
- MIDI input.
- Microphone pitch input for singing exercises.
- Audio file import for transcription.

## 6. Required output/audio capabilities
- High-quality piano baseline.
- Additional timbres: Rhodes/electric piano, acoustic/electric guitar, organ, synth pad, strings, bass.
- Block chords and arpeggiations.
- Multiple registers, inversions, open/closed voicings.
- Tempo and rhythm variation.
- Generated progressions with metrical timing.
- Optional full-mix examples with bass, drums, melody, vocals/stems where assets permit.

## 7. Skill domains
- Pitch/scale-degree hearing.
- Intervals.
- Chord quality.
- Seventh chords.
- Extensions and alterations.
- Inversions and bass notes.
- Voicings and voice leading.
- Functional harmony/Roman numerals.
- Progressions and cadences.
- Chromatic harmony and modulation.
- Scales/modes.
- Melody and bass transcription.
- Chord/progression transcription.
- Singing/production.
- Piano/guitar reproduction.
- Real-music transfer.

## 8. Difficulty dimensions
Each exercise type declares which dimensions it supports:
- vocabulary complexity
- number of answer choices
- key/root variety
- register
- inversion
- spacing/voicing
- timbre
- playback duration
- tempo
- rhythmic complexity
- harmonic context
- number of simultaneous instruments
- masking/noise/full-mix density
- memory delay
- phrase length
- response deadline
- hints/references allowed

Difficulty should be multidimensional, not a single integer level.

## 9. Progress evidence
For every relevant skill store:
- rolling accuracy
- median response latency
- attempt count
- current supported difficulty envelope
- retention performance after delays
- generalization across key/register/timbre/voicing
- confusion pairs
- confidence calibration if provided
- real-music transfer performance
- last practiced and last benchmarked dates

## 10. Personalization
The system should infer weaknesses from performance and preferentially schedule exercises that are neither trivial nor hopeless. User can override or pin priorities at any time.

## 11. Offline/local-first behavior
Core generated training, history, analytics, and MIDI should function without network access. Cloud sync is optional architecture, not a dependency for basic operation.

## 12. Privacy
Raw microphone/audio imports should remain local by default. Analytics should be local unless explicit sync/backup is enabled.

## 13. Accessibility/usability
- Dark and light appearance support.
- Large touch targets.
- Keyboard navigation on desktop/tablet where applicable.
- Audio-first/blind mode.
- Adjustable replay count and playback level.
- No unnecessary animation during listening tasks.

## 14. Prioritization
P0: generated audio engine, skill model, adaptive drills, chord/interval/function training, progress journal, MIDI, basic transcription.
P1: advanced voicings, singing verification, richer timbres, stems/full-mix training, harmonization/re-harmonization.
P2: automatic song analysis, advanced source separation, sophisticated ambiguity analysis, optional sync.
