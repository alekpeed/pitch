# Progress Journal and Measurement System

## 1. Philosophy
The journal is a factual longitudinal log, not a diary and not a game score. It should answer:
- What can I do now?
- What is improving?
- What is stagnant?
- What consistently causes errors?
- Does drill performance transfer to actual music?
- How is recognition becoming faster or more robust?

## 2. Primary progress dimensions
For each skill track:
1. **Accuracy** - rolling and session-specific.
2. **Latency** - median and distribution, evaluated alongside accuracy.
3. **Difficulty envelope** - conditions under which performance remains reliable.
4. **Retention** - delayed probe performance.
5. **Generalization** - performance across keys, roots, timbres, registers, inversions, voicings and contexts.
6. **Transfer** - unfamiliar real-music performance.
7. **Confusions** - directional error pairs and their trend.
8. **Exposure** - enough attempts to know whether an apparent trend is meaningful.

## 3. Rolling metrics
Default to recent evidence such as last 50-100 relevant attempts plus exponentially decayed history. Lifetime averages should remain available but should not dominate current-state displays.

## 4. Journal entry generation
At the end of every meaningful session, automatically create an entry containing:
- date/time and duration
- skills practiced
- number of graded attempts
- difficulty conditions reached
- strongest evidence of improvement
- recurring confusions/errors
- retention results
- transfer task result, if any
- recommended next target
- optional user note

Example:
> Aug 10 - 24 min. m7 vs maj7 stable at 94% across piano/Rhodes, median 1.8 s. First-inversion accuracy 68%, mostly errors when the 3rd is in the bass. ii-V-I transcription 79% over 16 examples, up from 61% three weeks ago. Full-mix chord identification unchanged at 63%. Next: first-inversion bass-note contrast and 8-bar full-mix transcription.

## 5. Skill detail page
Show:
- current state label
- rolling accuracy
- median latency
- current difficulty envelope
- retention history
- real-music transfer result
- top confusions
- timeline chart
- recent session excerpts involving the skill
- first/most recent capability milestones

## 6. Dashboard
Keep the top-level dashboard sparse:
- **Improving**: statistically meaningful recent gains.
- **Needs work**: high-value weaknesses or recurrent confusion.
- **Stagnant**: sufficient practice but little recent change.
- **Now reliable**: newly demonstrated capabilities.
- **Transfer check**: latest performance on real music.

No overall score is required.

## 7. Then vs Now
Allow date comparisons: 1 week, 1 month, 3 months, 1 year, custom. Compare equivalent conditions where possible. Example: "dominant vs maj7, piano, all roots, no inversion restriction."

## 8. Milestones
Milestones must be evidence-based and descriptive, e.g.:
- "First retained identification of all seventh-chord qualities at >=90% after a 14-day delay."
- "First 8-bar unfamiliar pop progression transcribed with >=85% chord-boundary and harmonic accuracy."
- "Rootless ii-V-I voicing reproduced correctly in all 12 keys."

## 9. Self-report
Optional factual fields only:
- perceived difficulty: easier / expected / harder
- confidence in answers: optional per attempt or session
- short note (free text)
- external observation: e.g. "heard bass inversion correctly in song X"

Self-report never overwrites measured evidence.

## 10. Progress trend logic
Do not label improvement from tiny samples. Require minimum evidence and compare equivalent conditions. A rise in difficulty accompanied by stable accuracy should count as improvement even if raw accuracy is unchanged.

## 11. Capability ledger
Maintain a human-readable history of newly demonstrated abilities. This is the closest thing to an achievement system, but it is not gamified and has no points.

## 12. Export
Export progress as JSON/CSV and a readable report containing:
- current skill profile
- changes over selected period
- active weaknesses
- transfer benchmarks
- session chronology
- user notes
