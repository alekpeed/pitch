# Perfect Ear

A local-first, evidence-based musicianship studio. The implemented core includes a responsive application shell, deterministic music-theory generation, Web Audio playback, configurable interval, triad, and seventh-chord drills, direct curriculum access, adaptive weak-area recommendations, and persistent raw attempt history.

The Progress journal derives per-skill mastery, median latency, compatible then-versus-now accuracy, and directional confusion pairs directly from the stored attempts. It deliberately has no XP, streaks, lives, or global score.

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
