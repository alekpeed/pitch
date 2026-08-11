# UX and Information Architecture

## 1. Primary navigation
Recommended top-level sections:
- Home
- Practice
- Transcription
- Performance
- Skills
- Progress
- Library/Audio
- Settings

## 2. Home
Purpose: answer "what should I work on now?" without gamification.
Components:
- Continue recommended session
- Current priority skills
- Latest capability change
- Upcoming retention checks
- Latest real-music benchmark
- Direct shortcut to custom practice

Do not show streaks, points, league status, reward animations, daily-loss warnings, or artificial urgency.

## 3. Practice
Tabs/filters:
- Recommended
- Targeted skill
- Custom drill
- Diagnostic

Custom drill configuration exposes only dimensions relevant to the selected exercise.

## 4. Exercise screen
Minimal audio-first layout:
- prompt
- play/replay control
- response surface
- optional confidence control
- submit
- after submission: concise feedback, defining-tone playback, visual explanation if enabled, next item

Visual information that reveals the answer must not appear before submission unless explicitly enabled as a training aid.

## 5. Transcription Lab
Required controls:
- audio waveform
- beat/bar grid when known
- loop selection
- play/pause
- speed without pitch change
- optional stem selection
- marker/chord-boundary placement
- chord/Roman numeral entry
- hint ladder
- submit/check
- comparison against reference/analysis

## 6. Performance Lab
Choose task -> hear prompt -> reproduce via MIDI/mic/on-screen instrument -> grade -> compare expected and actual notes/voicing.

## 7. Skills
Hierarchical explorer rather than a linear game path. Each node shows:
- prerequisite relationships
- current evidence state
- last practiced
- current limitations
- open targeted practice

## 8. Progress
### Overview
Improving / Needs Work / Stagnant / Now Reliable / Transfer.

### Journal
Chronological auto-generated entries with filtering by skill and date.

### Skill Detail
Full longitudinal view for one skill.

### Confusions
Ranked matrix of recurring substitutions and trends.

### Then vs Now
Condition-matched comparison between two periods.

### Capability Ledger
Chronological list of evidence-based newly acquired abilities.

## 9. Library/Audio
- imported tracks
- generated benchmark sets
- saved loops
- user-created transcription exercises
- metadata: title, artist/source if manually supplied, key/BPM if known

## 10. Settings
- audio device/timbre defaults
- MIDI device/channel
- microphone calibration
- notation preference: note names, flats/sharps, solfege, Roman numerals
- transposing-instrument setting
- practice session duration
- hint/replay defaults
- appearance/accessibility
- backup/export
- privacy/local storage

## 11. First-run flow
Do not force a long beginner tutorial. Offer:
1. Quick diagnostic.
2. Start from fundamentals.
3. Configure manually.

For an advanced theory user, diagnostic should skip rapidly through trivial material.

## 12. Interaction principle
The app should expose depth on demand. The default surface remains simple while advanced exercise configuration and analytics remain directly accessible, not hidden behind progression locks.
