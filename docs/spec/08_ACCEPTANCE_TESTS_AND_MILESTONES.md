# Milestones and Acceptance Criteria

## Milestone 0 - Foundation
Deliver:
- app shell/navigation
- local database
- theory model
- audio playback abstraction
- attempt/event logging
- settings

Acceptance:
- deterministic generation and playback of named notes/intervals/triads
- attempts persist across restart
- no gamification UI exists

## Milestone 1 - Core Ear Training
Deliver:
- scale-degree recognition
- melodic/harmonic intervals
- triads and seventh chords
- inversions/bass notes
- custom drill
- basic adaptive selection

Acceptance:
- roots/register/inversions/timbre parameters randomize correctly
- each attempt records latency, difficulty and exact stimulus
- user can directly practice any implemented skill

## Milestone 2 - Progress Journal
Deliver:
- SkillState aggregation
- session auto-summary
- Progress overview
- Skill Detail
- confusion pairs
- Then vs Now
- capability milestones

Acceptance:
- no global score is required or shown by default
- progress can distinguish increased difficulty with stable accuracy from stagnation
- current metrics are traceable to raw attempts

## Milestone 3 - Functional Harmony
Deliver:
- key context
- Roman numerals
- function classification
- common progressions/cadences
- secondary dominants/modal mixture/tritone substitution

Acceptance:
- progression generation transposes correctly through all 12 keys
- function labels remain valid after transposition
- exercises support exact chord and functional-response modes

## Milestone 4 - Voicing/Performance
Deliver:
- voicing generator
- shell/rootless/drop/open/spread styles
- MIDI capture/grading
- exact voicing copy
- guide-tone and voice-leading exercises

Acceptance:
- MIDI timing tolerance handles rolled/human chord attacks
- exact and equivalent grading policies are selectable per exercise
- generated voicings obey range/spacing constraints

## Milestone 5 - Transcription Lab
Deliver:
- audio import
- waveform
- looping
- time stretch
- chord boundaries
- harmonic answer entry
- graded short transcription tasks

Acceptance:
- loop points persist
- user can submit before seeing reference answer
- harmonic/boundary accuracy stored separately
- real-music transfer metrics are separate from synthetic drill metrics

## Milestone 6 - Singing and Production
Deliver:
- microphone pitch tracking
- interval/scale-degree/chord-tone singing
- call-and-response

Acceptance:
- calibration handles input device and latency
- pitch tolerance is configurable
- confidence/failure states from detector are not silently graded as user errors

## Milestone 7 - Dense Mix and Advanced Curriculum
Deliver:
- multiple timbres
- backing arrangements
- stems/noise ladder
- jazz curriculum
- modern pop/K-pop curriculum
- advanced extensions/alterations

Acceptance:
- same underlying skill can be tested from clean synthetic to dense contextual conditions
- difficulty envelope records the context where reliability breaks down

## Milestone 8 - Smart Analysis (Optional)
Deliver:
- beat/key/chord estimation and/or source separation as assistive systems
- disagreement comparison against user transcription

Acceptance:
- machine analysis carries confidence
- user is not marked wrong solely because an uncertain automatic detector disagrees
- manual/reference answer can override analysis

# Cross-cutting acceptance criteria
1. No streaks, XP, lives, coins, leaderboards, or punitive daily mechanics.
2. All important progress measures are evidence-based and longitudinal.
3. Synthetic success and real-music transfer are reported separately.
4. Raw attempt data is preserved.
5. User can bypass recommendations and configure practice directly.
6. Exercises generalize across roots/keys/registers/timbres instead of relying on fixed audio examples.
7. Wrong-answer feedback provides an acoustic contrast or explanation where technically possible.
8. The app remains useful from basic interval work through advanced jazz voicing/transcription without requiring a separate product.
