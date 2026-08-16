import { assembleSession, type SessionSlot, type SkillState } from './adaptive';
import { SECTIONS, sectionProgress, type Section } from './sections';
import type { DrillConfig } from './training';

/**
 * The pathway: a numbered, dated sequence of days.
 *
 * The app used to hand over its whole catalogue and let the ranking engine
 * decide what mattered, which meant practice never started anywhere and never
 * finished anything. A day fixes both ends — it is a defined, finite piece of
 * work that can be completed — while the engine keeps deciding *within* it what
 * you most need.
 *
 * Days are derived from the section spine rather than written out one by one,
 * so the ladder cannot drift out of step with the material it teaches.
 */

/** Days spent on a section before its work is considered laid down. */
const DAYS_PER_SECTION = 6;
/** Prompts in a day. Short enough to finish, long enough to be evidence. */
export const DAY_LENGTH = 15;
/**
 * Share of a day spent revisiting sections already passed. Review is the whole
 * reason the ladder is dated: without it, earlier work quietly rots while later
 * work is being learned.
 */
const REVIEW_SHARE = .3;

export interface PathDay {
  /** 1-based, and the number the user actually sees. */
  day: number;
  section: Section;
  /** Position within this section's run of days, 1-based. */
  dayInSection: number;
  /** Earlier sections this day revisits. Empty on the very first section. */
  reviews: Section[];
  focus: string;
}

export const TOTAL_DAYS = SECTIONS.length * DAYS_PER_SECTION;

/** Which section a numbered day belongs to, and what it revisits alongside it. */
export function dayPlan(day: number): PathDay {
  const clamped = Math.max(1, Math.min(day, TOTAL_DAYS));
  const index = Math.min(SECTIONS.length - 1, Math.floor((clamped - 1) / DAYS_PER_SECTION));
  const dayInSection = clamped - index * DAYS_PER_SECTION;
  const section = SECTIONS[index];
  // Review rotates through earlier sections rather than always revisiting the
  // most recent one, so nothing drops out of rotation as the ladder gets longer.
  const earlier = SECTIONS.slice(0, index);
  const reviews = earlier.length ? [earlier[(clamped - 1) % earlier.length]] : [];
  return {
    day: clamped, section, dayInSection, reviews,
    focus: dayInSection === 1 ? `New: ${section.name}` : `${section.name}, day ${dayInSection} of ${DAYS_PER_SECTION}`,
  };
}

/** The day a learner is on: one past their last completed day, capped at the end. */
export const dayFor = (completedDays: number) => Math.min(TOTAL_DAYS, completedDays + 1);

/**
 * Where the ladder should start, given evidence that already exists. Someone who
 * has been using the app — or who has just taken the diagnostic — should not be
 * sent back to "is the second note higher or lower".
 *
 * Only a leading run of cleared sections counts. Clearing something late while
 * an earlier section is still open does not skip the gap: the ladder is a
 * sequence, and starting past a hole would leave it permanently unfilled.
 */
export function placementDay(states: readonly SkillState[], diagnostic?: Record<string, number>): number {
  const progress = sectionProgress(states, diagnostic);
  const firstOpen = progress.findIndex(status => !status.cleared);
  const cleared = firstOpen < 0 ? progress.length : firstOpen;
  return Math.min(TOTAL_DAYS, cleared * DAYS_PER_SECTION + 1);
}

export interface DayBuild {
  total?: number;
  configFor: (_exercise: string) => DrillConfig | undefined;
  reasonFor?: (_exercise: string) => string | undefined;
  dueRetention?: { exercise: string; probeId: string }[];
}

/**
 * The day's actual work: its section's drills, plus review of an earlier one.
 *
 * Retention probes that are due are honoured first — a probe is the app's own
 * promise to re-test something on a schedule, and a fixed day plan must not
 * quietly break it.
 */
export function buildDay(day: number, build: DayBuild): SessionSlot[] {
  const plan = dayPlan(day);
  const total = build.total ?? DAY_LENGTH;
  const reviewCount = plan.reviews.length ? Math.round(total * REVIEW_SHARE) : 0;
  const focusExercises = [...plan.section.exercises];
  const reviewExercises = plan.reviews.flatMap(section => [...section.exercises]);
  const ranked = [
    ...focusExercises.map(exercise => ({ exercise, config: build.configFor(exercise), reason: build.reasonFor?.(exercise) ?? plan.focus })),
    ...reviewExercises.map(exercise => ({ exercise, config: build.configFor(exercise), reason: `Review: ${plan.reviews[0].name}` })),
  ];
  if (!ranked.length) return [];
  // The session assembler already knows how to mix purposes and order by
  // section; it is given only this day's material to choose from.
  return assembleSession({
    total,
    ranked,
    dueRetention: build.dueRetention?.filter(probe => focusExercises.includes(probe.exercise) || reviewExercises.includes(probe.exercise)),
    mix: reviewCount
      ? { retention: .2, weakness: .5, growth: .3, production: 0, transfer: 0 }
      : { retention: .1, weakness: .6, growth: .3, production: 0, transfer: 0 },
  });
}
