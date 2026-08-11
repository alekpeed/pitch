# Perfect Ear

A local-first, evidence-based musicianship studio. The implemented core includes a responsive application shell, deterministic music-theory generation, Web Audio playback, configurable scale-degree, interval, triad, seventh-chord, and bass-note drills, register and timbre controls, direct curriculum access, adaptive weak-area recommendations, and persistent raw attempt history.

The Progress journal derives automatic session summaries, per-skill mastery and detail, median latency, condition-compatible then-versus-now accuracy, directional confusion pairs, and evidence-backed capability milestones directly from the stored attempts. It deliberately has no XP, streaks, lives, or global score.

Functional Harmony practice adds transposable progression recognition in all 12 keys, with separate Roman-numeral and functional-response modes covering cadences, ii–V–I, secondary dominants, modal mixture, and tritone substitution.

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
