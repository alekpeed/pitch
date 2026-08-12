# Perfect Ear

A local-first, evidence-based musicianship studio. The implemented core includes a responsive application shell, deterministic music-theory generation, multisampled acoustic-piano and Rhodes playback plus modeled tonewheel organ, configurable scale-degree, interval, triad, seventh-chord, and bass-note drills, register and timbre controls, direct curriculum access, adaptive weak-area recommendations, and persistent raw attempt history.

The Progress journal derives automatic session summaries, per-skill mastery and detail, median latency, condition-compatible then-versus-now accuracy, directional confusion pairs, and evidence-backed capability milestones directly from the stored attempts. It deliberately has no XP, streaks, lives, or global score.

Functional Harmony practice adds transposable progression recognition in all 12 keys, with separate Roman-numeral and functional-response modes covering cadences, ii–V–I, secondary dominants, modal mixture, and tritone substitution.

Voicing and Performance practice provides constrained close, open, spread, drop-2, shell, and rootless voicings; Web MIDI and accessible on-screen input; exact or octave-equivalent grading; configurable rolled-chord tolerance; and ii–V–I guide-tone voice-leading exercises.

Singing practice adds configurable intonation tolerance and confidence-aware microphone pitch tracking so silence and detector uncertainty are never treated as user errors.

The Transcription Lab supports local audio import, decoded waveforms, persistent loops, pitch-preserving speed controls, playhead chord-boundary marking, harmonic answer entry, reference-blind submission, and separately stored harmonic and timing grades for real-music transfer.

## Offline instruments

Practice playback is fully offline. Acoustic piano uses 66 locally bundled Salamander Grand Piano recordings (three velocity layers, minor-third zones). Rhodes uses 35 locally bundled jRhodes3d Mark I recordings with three velocity selections where captured, tine-sensitive dynamics, release shaping, saturation, and tremolo. The organ is a modeled tonewheel engine with drawbars, percussion, key click, leakage, saturation, chorus, and Leslie-style rotation. Samples are fetched lazily and decoded once into an in-memory cache; only central piano samples are warmed initially. A compressor and voice-count-aware gain prevent dense chords from clipping.

The piano samples are CC BY 3.0 (Alexander Holm / Salamander Grand Piano). The Rhodes samples are CC BY-NC 4.0 (Jeffrey Learman / jRhodes3d) and this build is distributed noncommercially. Full attribution and license texts are bundled in [`public/audio`](public/audio/ATTRIBUTION.md). The compressed instrument assets add approximately 4 MB to the installed web assets; the signed Android APK is approximately 7 MB.

## Android download

Download the latest installable Android package: **[perfect-ear.apk](https://github.com/alekpeed/pitch/releases/download/apk-latest/perfect-ear.apk)**. Android may ask you to allow installs from your browser or file manager. Every release uses the same protected signing certificate and a monotonically increasing version code, so a new APK installs as an update over the existing app without uninstalling it.

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
