# Working agreement

- NEVER make any change, take any action, or do anything beyond answering the question asked, without explicit, prior, per-action OK from the user. This includes (but is not limited to): editing or creating files, running commands that modify state, committing, pushing, or any other action with side effects.
- If the user asks a question, answer the question. Do not also implement a fix, change, or "improvement" unless they explicitly ask for it.
- When in doubt about whether something counts as an action requiring approval, ask first. Do not act first and explain after.

# Product rules

## No absolute pitch, anywhere

The user does not have absolute pitch, and the app must never require it. Nothing
may ask for a bare letter name (C, F♯, …) as an answer, and no prompt may be
answerable only by someone who can identify a pitch with no reference sounding.

Every answer vocabulary must be **relative**: an interval, a scale degree, a
chord member, a chord quality, a spacing, a direction. If a drill needs a
reference, it must actually play one — a tonic chord, the parent chord, the
phrase that sets the key — before the note being asked about.

This applies to every screen, including the Diagnostic. A drill that plays its
reference on the Practice page but drops it elsewhere is the same bug as asking
for a letter name outright.
