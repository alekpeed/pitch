# Perfect Ear

A local-first, evidence-based musicianship studio. The implemented core includes a responsive application shell, deterministic music-theory generation, multi-partial acoustic-piano, Rhodes, and organ playback, configurable scale-degree, interval, triad, seventh-chord, and bass-note drills, register and timbre controls, direct curriculum access, adaptive weak-area recommendations, and persistent raw attempt history.

The Progress journal derives automatic session summaries, per-skill mastery and detail, median latency, condition-compatible then-versus-now accuracy, directional confusion pairs, and evidence-backed capability milestones directly from the stored attempts. It deliberately has no XP, streaks, lives, or global score.

Functional Harmony practice adds transposable progression recognition in all 12 keys, with separate Roman-numeral and functional-response modes covering cadences, ii–V–I, secondary dominants, modal mixture, and tritone substitution.

Voicing and Performance practice provides constrained close, open, spread, drop-2, shell, and rootless voicings; Web MIDI and accessible on-screen input; exact or octave-equivalent grading; configurable rolled-chord tolerance; and ii–V–I guide-tone voice-leading exercises.

Singing practice adds configurable intonation tolerance and confidence-aware microphone pitch tracking so silence and detector uncertainty are never treated as user errors.

The Transcription Lab supports local audio import, decoded waveforms, persistent loops, pitch-preserving speed controls, playhead chord-boundary marking, harmonic answer entry, reference-blind submission, and separately stored harmonic and timing grades for real-music transfer.

## Android download

Download the latest installable Android package: **[perfect-ear.apk](https://github.com/alekpeed/pitch/releases/download/apk-latest/perfect-ear.apk)**. Android may ask you to allow installs from your browser or file manager.

## Run locally

```bash
npm install
npm run dev
```

## Quality checks

```bash
npm run build
npm run lint
npm test
```

Product source materials are preserved in [`docs/spec`](docs/spec/00_README.md). Practice history is stored only in the browser's local storage by default.
