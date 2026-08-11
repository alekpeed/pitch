# Training Engine Specification

## 1. Core model
Do not model ability as one score. Maintain a user-state vector by skill and condition. An exercise attempt is evidence about one or more skill components under a known set of difficulty conditions.

## 2. Exercise definition
Each exercise template should declare:
- `skill_ids`
- prerequisite skills
- prompt generator
- audio generator/source
- response type
- exact or probabilistic grading rules
- allowed ambiguity
- supported difficulty dimensions
- hint ladder
- error-feedback strategy
- transfer category: synthetic / semi-realistic / real-music

## 3. Attempt record
Each attempt logs:
- timestamp/session
- skill(s)
- generated stimulus parameters
- expected answer(s)
- submitted answer
- correctness/partial-credit
- response latency
- replay count
- hints used
- user confidence if enabled
- difficulty vector
- source type/timbre/context
- error classification/confusion pair

## 4. Adaptive scheduling
Target an approximate challenge zone in which the user is usually correct but still makes informative errors. Avoid rigid percentages; tune by skill and response type.

Priority for the next item should increase when:
- a skill is weak
- a known confusion is recurring
- retention is due
- the skill has not generalized across conditions
- real-music transfer lags synthetic performance
- the user explicitly pins the skill

Priority should decrease when:
- the current condition is clearly automatic
- many nearly identical examples have just been completed
- fatigue/error escalation suggests the session has ceased being informative

## 5. Confusion model
Maintain directional confusion counts: expected A -> answered B. Use exponentially weighted or rolling windows so old errors decay in influence.

When a confusion exceeds threshold:
1. create clean A/B contrast drills
2. isolate defining pitch or voice-leading difference
3. reintroduce varied roots/registers
4. reintroduce context
5. retest in a real-music or dense-mix condition

## 6. Difficulty envelope
For each skill, estimate the hardest conditions currently demonstrated reliably. Example:
`m7_vs_maj7: 94% at 1.8s, random root, piano/Rhodes, all inversions; 71% in full mix.`

Do not collapse these into one number.

## 7. Mastery states
Recommended labels:
- **Introduced**: concept explained/exposed.
- **Developing**: correct under constrained conditions.
- **Reliable**: sustained accuracy across variation and delayed retest.
- **Automatic**: correct rapidly without hints across broad variation.
- **Transferred**: performance demonstrated in unfamiliar real music.

A skill may be Reliable synthetically but not Transferred.

## 8. Spaced retention
After initial learning, schedule probes after increasing delays. Failure shortens the next interval; success lengthens it. Retention tests must use altered examples, not exact repeats.

## 9. Interleaving rules
Blocked practice is acceptable while introducing a distinction. Once stable, interleave it with neighboring concepts. The user should not always know whether the next task is an interval, chord, function, or inversion question.

## 10. Error feedback
A wrong response should produce useful acoustic information:
- replay original
- play expected vs chosen answer A/B
- isolate defining tones if applicable
- concise explanation
- immediately generate a new example testing the same distinction

Avoid simply displaying "wrong" and moving on.

## 11. Response-time interpretation
Latency is evidence only when accuracy is stable. Never reward faster guessing. Automaticity improves when accuracy remains high while median latency falls across varied examples.

## 12. Real-music transfer
Maintain separate synthetic and transfer statistics. Generated success does not imply transfer. Periodically inject unseen excerpts appropriate to the user's skill envelope.

## 13. Diagnostic logic
The diagnostic should rapidly branch. Strong performance increases complexity quickly; errors trigger local probes. It should estimate skill envelopes, not produce a single placement level.

## 14. Session assembly
A default daily session can be composed approximately as:
- 20% retention probes
- 35% current weakness
- 20% targeted growth/new difficulty
- 15% production/performance
- 10% real-music transfer

These percentages are configurable and should adapt to evidence.

## 15. Manual control
Adaptive recommendations must never lock the user out. User may select any available skill, force a difficulty, or create a custom drill.

## 16. Audio randomization constraints
Randomization must remain musically valid. Avoid impossible/unidiomatic voicings unless the exercise explicitly studies them. Use register-aware spacing rules, instrument-specific playable ranges where relevant, and musically plausible voice leading for progression exercises.
