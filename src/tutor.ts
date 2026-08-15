import { weightedConfusions, type SkillState } from './adaptive';
import { gradeFor, type DayRecord, type Grade } from './progression';
import { dayPlan, TOTAL_DAYS } from './path';
import type { Attempt } from './storage';

/**
 * What a tutor would say at the end of a session, drawn only from what was
 * measured. Nothing here is encouragement for its own sake: every line names a
 * specific thing that happened, because praise that is not tied to evidence
 * stops meaning anything by the third day.
 */

const title = (exercise: string) => exercise.replace(/-recognition$/, '').replaceAll('-', ' ');
const pct = (value: number) => `${Math.round(value * 100)}%`;

export interface DayReport {
  day: number;
  grade: Grade;
  correct: number;
  total: number;
  accuracy: number;
  headline: string;
  /** Specific, evidence-backed observations. May be empty on a very short day. */
  notes: string[];
  /** What the next day will do about it. */
  next: string;
}

export interface ReportInput {
  day: number;
  attempts: readonly Attempt[];
  /** Attempt ids belonging to this day, so history is not counted twice. */
  todayIds: ReadonlySet<string>;
  states?: readonly SkillState[];
  now?: number;
}

export function dayReport(input: ReportInput): DayReport {
  const today = input.attempts.filter(attempt => input.todayIds.has(attempt.id));
  const total = today.length;
  const correct = today.filter(attempt => attempt.correct).length;
  const accuracy = total ? correct / total : 0;
  const grade = gradeFor(accuracy);
  const plan = dayPlan(input.day);

  const byExercise = new Map<string, Attempt[]>();
  today.forEach(attempt => byExercise.set(attempt.exercise, [...(byExercise.get(attempt.exercise) ?? []), attempt]));
  const scored = [...byExercise].map(([exercise, items]) => ({
    exercise, items,
    accuracy: items.filter(item => item.correct).length / items.length,
  })).sort((a, b) => a.accuracy - b.accuracy);

  const notes: string[] = [];
  const weakest = scored[0];
  const strongest = scored.at(-1);
  // Only worth naming a strongest and weakest when they are actually different,
  // and when there is enough of each to mean anything.
  if (weakest && weakest.items.length >= 3 && weakest.accuracy < .7) {
    notes.push(`${title(weakest.exercise)} is where it slipped — ${pct(weakest.accuracy)} across ${weakest.items.length}.`);
  }
  if (strongest && strongest !== weakest && strongest.items.length >= 3 && strongest.accuracy >= .85) {
    notes.push(`${title(strongest.exercise)} is holding at ${pct(strongest.accuracy)}.`);
  }

  // A confusion is more useful than an accuracy figure: it says what was
  // mistaken for what, which is something you can actually listen for.
  const confusion = weightedConfusions([...today], input.now ?? Date.now())[0];
  if (confusion && confusion.weightedCount >= 2) {
    notes.push(`You heard ${confusion.expected} as ${confusion.answered} more than once — that pair is worth isolating.`);
  }

  const replayed = today.filter(attempt => attempt.replayCount >= 3).length;
  if (replayed >= 3) notes.push(`${replayed} prompts needed three or more listens; the sound is there but not yet immediate.`);

  const headline =
    total === 0 ? 'Nothing recorded for this day yet.'
    : grade === 'A' ? `Day ${input.day} cleared cleanly — ${correct} of ${total}.`
    : grade === 'B' ? `Day ${input.day} done — ${correct} of ${total}, with a few to tighten.`
    : grade === 'C' ? `Day ${input.day} done — ${correct} of ${total}. This sat at the hard edge.`
    : `Day ${input.day} was a grind — ${correct} of ${total}. Worth repeating before moving on.`;

  const next =
    input.day >= TOTAL_DAYS ? 'That is the end of the pathway. From here it is review and free practice.'
    : grade === 'D' ? `Tomorrow repeats ${plan.section.name} rather than adding to it.`
    : weakest && weakest.accuracy < .7 ? `Tomorrow leans on ${title(weakest.exercise)}.`
    : `Tomorrow continues ${dayPlan(input.day + 1).section.name}.`;

  return { day: input.day, grade, correct, total, accuracy, headline, notes, next };
}

/** One line for the Today screen before any work is done. */
export function dayBriefing(day: number, records: readonly DayRecord[]): string {
  const plan = dayPlan(day);
  const previous = records.find(record => record.day === day - 1);
  if (day === 1) return `Starting at the beginning: ${plan.section.goal}`;
  if (previous && previous.total && previous.correct / previous.total < .6) {
    return `Yesterday was rough, so today stays on ${plan.section.name}. ${plan.section.goal}`;
  }
  if (plan.dayInSection === 1) return `New ground today — ${plan.section.name}. ${plan.section.goal}`;
  if (plan.reviews.length) return `${plan.section.name}, with ${plan.reviews[0].name} folded back in.`;
  return plan.section.goal;
}
