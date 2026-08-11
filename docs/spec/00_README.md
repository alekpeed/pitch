# Perfect Ear Training App - Coder Handoff Pack

## Purpose
Build a personal, non-gamified musicianship system whose objective is measurable improvement in hearing, harmonic understanding, transcription, and instrument execution. The app is not optimized for streaks, points, social competition, or mass-market onboarding.

## Product principle
Every exercise should ultimately improve a real musical behavior. Artificial drills are scaffolding; the endpoint is reliable perception and reproduction in actual recordings and on an instrument.

## Primary user profile
An adult musician with strong music-theory knowledge, guitar experience, rapidly developing piano skills, and specific interest in jazz, modern pop/K-pop, chord voicings, harmonization, transcription, and harmonic analysis.

## Documents
1. `01_PRODUCT_REQUIREMENTS.md` - vision, scope, requirements, priorities.
2. `02_FEATURE_CATALOG.md` - complete training feature inventory and methods.
3. `03_TRAINING_ENGINE.md` - adaptive engine, exercise generation, grading, progression.
4. `04_PROGRESS_JOURNAL.md` - longitudinal skill log and progress measurement.
5. `05_UX_INFORMATION_ARCHITECTURE.md` - screens, flows, interaction model.
6. `06_DATA_MODEL.md` - entities, fields, relationships, event logging.
7. `07_TECHNICAL_ARCHITECTURE.md` - implementation architecture and subsystem boundaries.
8. `08_ACCEPTANCE_TESTS_AND_MILESTONES.md` - phased build and acceptance criteria.
9. `09_SEED_CURRICULUM.json` - starter skill taxonomy for implementation.

## Non-negotiables
- No streak system, XP, leaderboards, lives, coins, or artificial engagement penalties.
- Progress is represented as evidence: accuracy, latency, difficulty, retention, generalization, and real-music transfer.
- User can always practice a specific skill directly.
- Advanced users are not forced through beginner lessons.
- Exercises must randomize root, register, inversion, voicing, timbre, and context where applicable to prevent memorization of fixed examples.
- Real-music transfer is tested separately from synthetic-drill performance.
- Session history is automatically logged without requiring journaling prose.
- Manual self-report is optional and factual: difficulty, confidence, observed capability, or short notes.
