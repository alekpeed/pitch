# Technical Architecture

## 1. Architectural principle
Separate the training model from UI and audio implementation. The same exercise definition should be renderable through different interfaces and audio sources.

## 2. Suggested modules
### Core Domain
Skills, exercise definitions, grading, difficulty model, scheduling, mastery evidence, confusion tracking.

### Audio Engine
Pitch/chord/progression generation, instrument samples/synthesis, tempo, arpeggiation, voicing engine, rendering/playback.

### Music Theory Engine
Pitch classes, note spelling, keys, scales, intervals, chord structures, inversions, extensions, Roman numerals, functional labels, voice-leading constraints.

### Adaptive Engine
Item selection, retention scheduling, confusion targeting, difficulty updates, session assembly.

### Input Engine
Touch/keyboard, MIDI, microphone pitch detection, chord-symbol parser, Roman numeral parser.

### Transcription Engine
Waveform/regions, looping, speed change, boundaries, user annotation, grading/comparison.

### Progress Engine
Attempt aggregation, trend detection, difficulty-envelope estimation, transfer metrics, journal generation, capability milestones.

### Persistence
Local database, audio-file metadata, settings, exports/backups.

### Optional Analysis Services
Chord estimation, beat tracking, source separation, key estimation. These must return confidence/uncertainty and should not be treated as unquestionable ground truth.

## 3. Music representation
Use pitch class + octave internally for sounding notes and a separate spelling layer for notation. Do not conflate C# with Db at the model level when harmonic spelling matters.

Recommended structures:
- `Pitch {midiNumber, pitchClass, octave, spelling}`
- `Interval {semitones, diatonicNumber, quality}`
- `ChordDefinition {root, quality, extensions, alterations, bass}`
- `Voicing {orderedPitches, chordDefinition, style}`
- `KeyContext {tonic, mode}`
- `FunctionalChord {romanNumeral, appliedTarget, borrowedFrom}`

## 4. Voicing generator
Rules should support:
- playable register limits
- minimum/maximum spacing
- inversion selection
- duplication rules
- optional omission of root/5th
- style templates: closed, open, drop-2, shell, rootless, quartal, spread, upper-structure
- smooth voice-leading between successive chords

## 5. Audio strategy
MVP can use multisampled piano plus programmatic MIDI-like playback. Architecture must permit replacing the renderer with higher-quality sample instruments later.

For training validity, preserve deterministic stimulus metadata so an attempt can be regenerated or audited.

## 6. MIDI
- enumerate devices
- select input
- timestamp note-on/off
- normalize sustain-pedal handling
- chord-capture window configurable
- tolerate human timing spread when grading simultaneous voicings
- support exact-note and set-equivalence grading modes

## 7. Microphone
P0 may support monophonic pitch verification for singing. Polyphonic guitar/chord recognition can be a later subsystem. Calibrate latency/noise floor and store confidence.

## 8. Transcription audio
Required:
- sample-accurate or near-sample-accurate seek
- looping without large gaps
- time stretching without pitch shift
- waveform cache
- marker persistence

Optional later:
- beat/downbeat tracking
- source separation
- automatic chord suggestions

## 9. Analytics
Use rolling windows and/or exponential weighting. Store raw attempts permanently. Trend calculations should require minimum sample counts and condition compatibility.

## 10. Journal generation
Generate journal entries from structured metrics, not an LLM requirement. Template-based summaries are sufficient and reproducible. Optional language generation can later improve prose but must never fabricate evidence.

## 11. Test strategy
### Unit tests
- interval/chord spelling
- inversion logic
- Roman numeral conversion
- voicing validity
- grading tolerance
- adaptive scheduling
- trend calculations

### Property tests
- transposition invariance
- generated chord contains required pitch classes
- inversion bass is correct
- difficulty randomization respects constraints

### Golden audio tests
Store deterministic generated stimuli and expected metadata for regression testing.

### Integration tests
- MIDI capture -> grade -> attempt log -> progress update
- transcription submission -> grade -> journal entry
- retention due -> session assembly -> completion -> reschedule

## 12. Performance
Pre-generate or cache the next few synthetic stimuli to eliminate delay between exercises. Audio playback must be more responsive than analytics/background work.

## 13. Extensibility
New exercise types should be added primarily by registering a template/generator/grader rather than modifying central application logic.
