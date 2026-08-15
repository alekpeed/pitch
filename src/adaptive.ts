import { SECTIONS } from './sections';
import type { Attempt } from './storage';
import type { DrillConfig } from './training';

const DAY_MS = 86_400_000;
// Group keys join fields that may themselves contain spaces ("major 7", "MIDI 40-84"),
// so they are joined on a unit separator that cannot occur in any label.
const KEY_SEP = '\u001f';
const median = (values: number[]) => { if (!values.length) return 0; const ordered = [...values].sort((a, b) => a - b); const middle = Math.floor(ordered.length / 2); return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2; };
const rate = (items: Attempt[]) => items.length ? items.filter(item => item.correct).length / items.length : 0;
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/* ---------------------------------------------------------------- mastery */

export type Mastery = 'Introduced' | 'Developing' | 'Reliable' | 'Automatic' | 'Transferred';
export interface MasteryEvidence { attempts: number; accuracy: number; medianLatencyMs: number }
/** Absent fields do not gate, so a caller with only raw counts still gets the synthetic ladder. */
export interface MasteryContext { retentionPassed?: boolean; distinctConditions?: number; transferAttempts?: number; transferAccuracy?: number }

export function masteryFor(evidence: MasteryEvidence, context: MasteryContext = {}): Mastery {
  const { attempts, accuracy, medianLatencyMs } = evidence;
  const conditions = context.distinctConditions ?? Number.POSITIVE_INFINITY;
  // Automatic sits above Reliable, so it inherits the delayed-retest requirement:
  // fast and accurate under one sitting is not yet evidence of retention.
  const retested = context.retentionPassed ?? true;
  const reliable = attempts >= 12 && accuracy >= .8 && conditions >= 2 && retested;
  const automatic = attempts >= 20 && accuracy >= .9 && medianLatencyMs < 2500 && conditions >= 3 && retested;
  // Transfer is a separate axis: a skill can be Reliable synthetically and still not transfer.
  if ((reliable || automatic) && (context.transferAttempts ?? 0) >= 5 && (context.transferAccuracy ?? 0) >= .8) return 'Transferred';
  if (automatic) return 'Automatic';
  if (reliable) return 'Reliable';
  return attempts >= 4 ? 'Developing' : 'Introduced';
}

/* ------------------------------------------------------------- confusions */

export type ConfusionTrend = 'rising' | 'steady' | 'falling';
export interface WeightedConfusion { exercise: string; expected: string; answered: string; weightedCount: number; recentRate: number; trend: ConfusionTrend; lastSeenAt: string }

const ageWeight = (attempt: Attempt, now: number, halfLifeDays: number) => {
  const stamped = Date.parse(attempt.timestamp);
  if (!Number.isFinite(stamped)) return 1;
  return .5 ** (Math.max(0, now - stamped) / (halfLifeDays * DAY_MS));
};

/**
 * Directional expected -> answered counts with exponential decay, so old errors
 * fade instead of pinning a drill to a confusion the user has already resolved.
 */
export function weightedConfusions(attempts: Attempt[], now = Date.now(), halfLifeDays = 14): WeightedConfusion[] {
  const groups = new Map<string, Attempt[]>();
  // A pair where the answer equals the expectation is inconsistent evidence, not a
  // confusion; ignoring it keeps a malformed record from inventing "major -> major".
  attempts.filter(item => !item.correct && item.response !== item.expected).forEach(item => {
    const key = [item.exercise, item.expected, item.response].join(KEY_SEP);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  });
  const times = attempts.map(item => Date.parse(item.timestamp)).filter(Number.isFinite);
  const midpoint = times.length ? (Math.min(...times) + Math.max(...times)) / 2 : now;
  return [...groups].map(([key, errors]) => {
    const [exercise, expected, answered] = key.split(KEY_SEP);
    const exposure = attempts.filter(item => item.exercise === exercise && item.expected === expected);
    const weightedExposure = exposure.reduce((total, item) => total + ageWeight(item, now, halfLifeDays), 0);
    const weightedCount = errors.reduce((total, item) => total + ageWeight(item, now, halfLifeDays), 0);
    // Trend uses raw counts either side of the observation midpoint; decay already
    // encodes recency, so weighting here too would double-count it.
    const recent = errors.filter(item => Date.parse(item.timestamp) >= midpoint).length;
    const trend: ConfusionTrend = errors.length < 3 ? 'steady' : recent * 2 > errors.length ? 'rising' : recent * 2 < errors.length ? 'falling' : 'steady';
    return {
      exercise, expected, answered, weightedCount, trend,
      recentRate: weightedExposure ? weightedCount / weightedExposure : 0,
      lastSeenAt: errors.map(item => item.timestamp).sort().at(-1) ?? '',
    };
  }).sort((a, b) => b.weightedCount - a.weightedCount);
}

/** Total decayed error pressure on one skill, normalised to roughly 0..1. */
export function confusionPressure(confusions: WeightedConfusion[], exercise: string) {
  return clamp01(confusions.filter(item => item.exercise === exercise).reduce((total, item) => total + item.recentRate, 0));
}

/* ------------------------------------------------------- difficulty envelope */

export interface EnvelopeCell { dimension: string; value: string; attempts: number; accuracy: number; medianLatencyMs: number; reliable: boolean; breakdown: boolean }
export interface SkillEnvelope { exercise: string; cells: EnvelopeCell[]; reliable: string[]; breakdown: string[] }

/**
 * Per-dimension, per-value reliability. Deliberately never collapsed into one
 * number — the spec's envelope is the set of conditions, not an average.
 */
export function difficultyEnvelope(attempts: Attempt[], exercise: string, minEvidence = 6): SkillEnvelope {
  const evidence = attempts.filter(item => item.exercise === exercise);
  const cells = new Map<string, Attempt[]>();
  evidence.forEach(item => Object.entries(item.difficulty).forEach(([dimension, value]) => {
    const key = [dimension, String(value)].join(KEY_SEP);
    cells.set(key, [...(cells.get(key) ?? []), item]);
  }));
  // "Breaks down at X" is a comparative claim: with only one value observed on a
  // dimension it cannot separate a hard condition from a weak skill, so it is
  // withheld. Reliability under a condition stands on its own and is not.
  const observed = new Map<string, number>();
  [...cells.keys()].forEach(key => { const dimension = key.split(KEY_SEP)[0]; observed.set(dimension, (observed.get(dimension) ?? 0) + 1); });
  const built = [...cells].map(([key, items]): EnvelopeCell => {
    const [dimension, value] = key.split(KEY_SEP);
    const accuracy = rate(items);
    return {
      dimension, value, attempts: items.length, accuracy,
      medianLatencyMs: median(items.map(item => item.latencyMs)),
      reliable: items.length >= minEvidence && accuracy >= .85,
      breakdown: items.length >= minEvidence && accuracy < .7 && (observed.get(dimension) ?? 0) >= 2,
    };
  }).sort((a, b) => a.dimension.localeCompare(b.dimension) || a.value.localeCompare(b.value));
  const label = (cell: EnvelopeCell) => `${cell.dimension}=${cell.value}`;
  return { exercise, cells: built, reliable: built.filter(cell => cell.reliable).map(label), breakdown: built.filter(cell => cell.breakdown).map(label) };
}

export interface GeneralizationState { dimension: string; valuesSeen: number; valuesReliable: number; generalized: boolean }

export function generalization(envelope: SkillEnvelope): GeneralizationState[] {
  const dimensions = [...new Set(envelope.cells.map(cell => cell.dimension))].sort();
  return dimensions.map(dimension => {
    const cells = envelope.cells.filter(cell => cell.dimension === dimension);
    const valuesReliable = cells.filter(cell => cell.reliable).length;
    return { dimension, valuesSeen: cells.length, valuesReliable, generalized: valuesReliable >= 2 };
  });
}

/** 0 = generalized everywhere, 1 = generalized nowhere. */
export function generalizationGap(states: GeneralizationState[]) {
  if (!states.length) return 1;
  return 1 - states.filter(state => state.generalized).length / states.length;
}

/* ------------------------------------------------------------- priorities */

export interface PriorityFactors {
  accuracy: number; evidenceCount: number; confusionPressure: number; retentionDue: boolean;
  generalizationGap: number; transferGap: number; pinned: boolean; recentRun: number; automatic: boolean;
}

/**
 * Implements the increase/decrease rules in the engine spec §4. Higher wins.
 * Weights are deliberately coarse — the ordering matters, not the scale.
 */
/** A pin is a user instruction, not a hint, so it outranks every heuristic below. */
const PIN_BOOST = 1000;

export function skillPriority(factors: PriorityFactors): number {
  const unpracticed = factors.evidenceCount === 0;
  let score = unpracticed ? 30 : (1 - clamp01(factors.accuracy)) * 40;
  score += clamp01(factors.confusionPressure) * 25;
  if (factors.retentionDue) score += 30;
  score += clamp01(factors.generalizationGap) * 15;
  score += clamp01(factors.transferGap) * 12;
  if (factors.pinned) score += PIN_BOOST;
  if (factors.automatic) score -= 25;
  score -= Math.min(factors.recentRun, 5) * 6;
  return Math.max(0, score);
}

/* ---------------------------------------------------------- challenge zone */

export type DifficultyStep = 'raise' | 'hold' | 'lower';

/** Usually correct but still making informative errors. */
export function challengeSignal(accuracy: number, evidenceCount: number, band = { lower: .65, upper: .9 }): DifficultyStep {
  if (evidenceCount < 5) return 'hold';
  if (accuracy > band.upper) return 'raise';
  if (accuracy < band.lower) return 'lower';
  return 'hold';
}

type LadderKey = 'rootPool' | 'register' | 'inversions' | 'timbre' | 'melodic' | 'vocabulary' | 'presentation' | 'exposure' | 'rhythm' | 'memoryDelay' | 'deadline';
/** Each ladder runs easiest -> hardest. Order of keys is the tie-break when raising. */
const ladders: { key: LadderKey; values: readonly unknown[] }[] = [
  { key: 'rootPool', values: ['white', 'all'] },
  { key: 'inversions', values: [false, true] },
  { key: 'presentation', values: ['both', 'block', 'arpeggiated'] },
  { key: 'register', values: ['middle', 'high', 'low', 'random'] },
  { key: 'timbre', values: ['piano', 'rhodes', 'guitar', 'strings', 'organ', 'pad'] },
  // Widening the answer grid from seven degrees to twelve is a jump in kind,
  // not just in conditions — it changes what is being asked rather than how it
  // sounds. Ordered after the condition ladders so it cannot land on the third
  // rung, which is where a cold diagnostic opens.
  { key: 'vocabulary', values: ['diatonic', 'chromatic'] },
  { key: 'rhythm', values: ['steady', 'syncopated'] },
  { key: 'exposure', values: ['sustained', 'short'] },
  { key: 'memoryDelay', values: ['none', 'short', 'long'] },
  // Shortening the deadline is the automaticity dimension: same accuracy, less time.
  { key: 'deadline', values: ['none', '8', '5', '3'] },
  { key: 'melodic', values: [true, false] },
];

/** Total raises available across every ladder: the top of the difficulty scale. */
export const MAX_DIFFICULTY_LEVEL = ladders.reduce((total, ladder) => total + ladder.values.length - 1, 0);
/** The bottom of every ladder, used as the origin for a levelled difficulty scale. */
export const EASIEST_DRILL: Omit<DrillConfig, 'kind'> = {
  rootPool: 'white', inversions: false, melodic: true, register: 'middle', timbre: 'piano',
  vocabulary: 'diatonic', presentation: 'both', exposure: 'sustained', rhythm: 'steady',
  memoryDelay: 'none', deadline: 'none',
};

/**
 * Turns the one-dimension-at-a-time ladders into a single monotone scale, so a
 * staircase search has something ordered to search over.
 */
export function configAtLevel(kind: DrillConfig['kind'], level: number): DrillConfig {
  let config: DrillConfig = { ...EASIEST_DRILL, kind };
  for (let step = 0; step < Math.max(0, Math.min(level, MAX_DIFFICULTY_LEVEL)); step += 1) config = adjustDrill(config, 'raise');
  return config;
}

const rungOf = (config: DrillConfig, key: LadderKey) => {
  const ladder = ladders.find(item => item.key === key)!;
  const index = ladder.values.indexOf(config[key] as unknown);
  return index < 0 ? 0 : index;
};

/**
 * Steps exactly one dimension. Raising prefers the dimension the user has
 * generalized least, so difficulty broadens before it deepens.
 */
export function adjustDrill(config: DrillConfig, step: DifficultyStep, prefer: string[] = []): DrillConfig {
  if (step === 'hold') return config;
  const ranked = [...ladders].sort((a, b) => {
    const preference = Number(prefer.includes(b.key)) - Number(prefer.includes(a.key));
    return preference || rungOf(config, a.key) - rungOf(config, b.key);
  });
  if (step === 'raise') {
    const target = ranked.find(item => rungOf(config, item.key) < item.values.length - 1);
    return target ? { ...config, [target.key]: target.values[rungOf(config, target.key) + 1] } : config;
  }
  const target = [...ladders].sort((a, b) => rungOf(config, b.key) - rungOf(config, a.key)).find(item => rungOf(config, item.key) > 0);
  return target ? { ...config, [target.key]: target.values[rungOf(config, target.key) - 1] } : config;
}

/* ------------------------------------------------------- session assembly */

export type SlotPurpose = 'retention' | 'weakness' | 'growth' | 'production' | 'transfer';
export const DEFAULT_MIX: Record<SlotPurpose, number> = { retention: .2, weakness: .35, growth: .2, production: .15, transfer: .1 };
const PURPOSES: SlotPurpose[] = ['retention', 'weakness', 'growth', 'production', 'transfer'];

/** Largest-remainder apportionment so the parts always sum to the whole. */
export function slotCounts(total: number, mix: Record<SlotPurpose, number> = DEFAULT_MIX): Record<SlotPurpose, number> {
  const exact = PURPOSES.map(purpose => ({ purpose, value: total * mix[purpose] }));
  const counts = Object.fromEntries(exact.map(item => [item.purpose, Math.floor(item.value)])) as Record<SlotPurpose, number>;
  let remaining = total - PURPOSES.reduce((sum, purpose) => sum + counts[purpose], 0);
  exact.sort((a, b) => (b.value % 1) - (a.value % 1) || PURPOSES.indexOf(a.purpose) - PURPOSES.indexOf(b.purpose))
    .forEach(item => { if (remaining > 0) { counts[item.purpose] += 1; remaining -= 1; } });
  return counts;
}

export interface SessionSlot { purpose: SlotPurpose; exercise: string; reason: string; config?: DrillConfig; probeId?: string }
export interface AssemblyInput {
  total: number;
  dueRetention?: { exercise: string; probeId: string }[];
  ranked?: { exercise: string; config?: DrillConfig; reason?: string }[];
  growth?: { exercise: string; config?: DrillConfig; reason?: string };
  production?: string[];
  transfer?: string[];
  mix?: Record<SlotPurpose, number>;
}

/**
 * Fills the spec's default mix, spilling any purpose it cannot fill into
 * weakness work rather than shortening the session.
 */
export function assembleSession(input: AssemblyInput): SessionSlot[] {
  const { total, dueRetention = [], ranked = [], growth, production = [], transfer = [], mix } = input;
  if (total <= 0 || !ranked.length) return [];
  const counts = slotCounts(total, mix);
  const slots: SessionSlot[] = [];
  const pick = <T,>(pool: T[], index: number) => pool[index % pool.length];

  for (let index = 0; index < counts.retention; index += 1) {
    const probe = dueRetention[index];
    if (!probe) break;
    slots.push({ purpose: 'retention', exercise: probe.exercise, probeId: probe.probeId, reason: 'Retention probe due' });
  }
  for (let index = 0; index < counts.production; index += 1) {
    if (!production.length) break;
    slots.push({ purpose: 'production', exercise: pick(production, index), reason: 'Production and performance' });
  }
  for (let index = 0; index < counts.transfer; index += 1) {
    if (!transfer.length) break;
    slots.push({ purpose: 'transfer', exercise: pick(transfer, index), reason: 'Real-music transfer' });
  }
  for (let index = 0; index < counts.growth; index += 1) {
    if (!growth) break;
    slots.push({ purpose: 'growth', exercise: growth.exercise, config: growth.config, reason: growth.reason ?? 'Targeted growth at raised difficulty' });
  }
  while (slots.length < total) {
    const source = pick(ranked, slots.length);
    slots.push({ purpose: 'weakness', exercise: source.exercise, config: source.config, reason: source.reason ?? 'Current weakness' });
  }
  return interleave(slots);
}

/**
 * Orders a session by section, then varies purpose inside each one.
 *
 * Ordering purely by purpose produced a session that jumped between unrelated
 * exercise types on every item — and because different types live on different
 * screens, that read as the app flickering between pages rather than as useful
 * variety. Grouping by section keeps a run of work on one screen and in one
 * frame of mind, while the interleaving within each section still stops the
 * next prompt from being predictable.
 *
 * The section order is the curriculum's, not a second list kept in step by hand.
 */
export function interleave(slots: SessionSlot[]): SessionSlot[] {
  const groups = new Map<number, SessionSlot[]>();
  slots.forEach(slot => {
    // Anything outside the spine sorts last rather than being dropped.
    const at = SECTIONS.findIndex(section => section.exercises.includes(slot.exercise));
    const key = at < 0 ? SECTIONS.length : at;
    groups.set(key, [...(groups.get(key) ?? []), slot]);
  });
  return [...groups.keys()].sort((a, b) => a - b).flatMap(key => varyPurpose(groups.get(key)!));
}

/** Spreads purposes within one section, avoiding back-to-back repeats of an exercise. */
function varyPurpose(slots: SessionSlot[]): SessionSlot[] {
  const groups = new Map<SlotPurpose, SessionSlot[]>();
  slots.forEach(slot => groups.set(slot.purpose, [...(groups.get(slot.purpose) ?? []), slot]));
  const ordered: SessionSlot[] = [];
  while (ordered.length < slots.length) {
    const previous = ordered.at(-1);
    // Draining the largest group first spreads purposes evenly instead of
    // front-loading every production and transfer item.
    const candidates = [...groups.values()].filter(items => items.length).sort((a, b) => b.length - a.length);
    const group = candidates.find(items => items[0].purpose !== previous?.purpose) ?? candidates[0];
    // Within the chosen purpose, still avoid repeating the previous exercise.
    const index = Math.max(0, group.findIndex(item => item.exercise !== previous?.exercise));
    ordered.push(...group.splice(index, 1));
  }
  return ordered;
}

/* --------------------------------------------------------- full skill state */

export interface SkillState {
  exercise: string; mastery: Mastery; attempts: number; accuracy: number; medianLatencyMs: number;
  envelope: SkillEnvelope; generalization: GeneralizationState[]; generalizationGap: number;
  confusions: WeightedConfusion[]; priority: number; transferAttempts: number; transferAccuracy: number; transferGap: number;
}
export interface SkillStateInput { attempts: Attempt[]; now?: number; retentionDue?: string[]; retentionPassed?: string[]; pinned?: string[]; recentRun?: Record<string, number> }

export function skillStates(input: SkillStateInput): SkillState[] {
  const { attempts, now = Date.now(), retentionDue = [], retentionPassed = [], pinned = [], recentRun = {} } = input;
  const confusions = weightedConfusions(attempts, now);
  return [...new Set(attempts.map(item => item.exercise))].map(exercise => {
    const evidence = attempts.filter(item => item.exercise === exercise);
    const synthetic = evidence.filter(item => (item.transferCategory ?? 'synthetic') === 'synthetic');
    const transferred = evidence.filter(item => item.transferCategory === 'real-music');
    const envelope = difficultyEnvelope(attempts, exercise);
    const spread = generalization(envelope);
    const gap = generalizationGap(spread);
    const accuracy = rate(evidence);
    const transferAccuracy = rate(transferred);
    const distinctConditions = new Set(evidence.map(item => JSON.stringify(Object.entries(item.difficulty).sort(([a], [b]) => a.localeCompare(b))))).size;
    const mastery = masteryFor(
      { attempts: evidence.length, accuracy, medianLatencyMs: median(evidence.map(item => item.latencyMs)) },
      { retentionPassed: retentionPassed.includes(exercise) || !retentionDue.includes(exercise), distinctConditions, transferAttempts: transferred.length, transferAccuracy },
    );
    const pressure = confusionPressure(confusions, exercise);
    // Transfer only counts as lagging once there is real-music evidence to compare.
    const transferGap = transferred.length ? clamp01(rate(synthetic) - transferAccuracy) : 0;
    return {
      exercise, mastery, attempts: evidence.length, accuracy, medianLatencyMs: median(evidence.map(item => item.latencyMs)),
      envelope, generalization: spread, generalizationGap: gap, confusions: confusions.filter(item => item.exercise === exercise),
      transferAttempts: transferred.length, transferAccuracy, transferGap,
      priority: skillPriority({
        accuracy, evidenceCount: evidence.length, confusionPressure: pressure, retentionDue: retentionDue.includes(exercise),
        generalizationGap: gap, transferGap, pinned: pinned.includes(exercise), recentRun: recentRun[exercise] ?? 0,
        automatic: mastery === 'Automatic' || mastery === 'Transferred',
      }),
    };
  }).sort((a, b) => b.priority - a.priority);
}

/* ------------------------------------------------------------ ranked plan */

export interface RankedExercise { exercise: string; priority: number; reason: string; state?: SkillState }
export interface RankInput { catalog: string[]; states: SkillState[]; retentionDue?: string[]; pinned?: string[]; recentRun?: Record<string, number> }

/** Plain-language answer to "why is this next?", drawn from the strongest signal. */
export function reasonFor(state: SkillState, retentionDue = false, pinned = false): string {
  if (pinned) return 'Pinned by you';
  if (retentionDue) return 'Retention probe due';
  const confusion = state.confusions[0];
  if (confusion && confusion.recentRate > .15) return `Recurring ${confusion.expected} \u2192 ${confusion.answered}`;
  if (state.transferAttempts >= 3 && state.transferGap > .15) return 'Real-music transfer lags synthetic';
  if (state.envelope.breakdown.length) return `Breaks down at ${state.envelope.breakdown[0]}`;
  if (state.generalizationGap >= .5) return 'Not yet generalized across conditions';
  if (state.accuracy < .8) return `${Math.round(state.accuracy * 100)}% accurate`;
  return `${state.mastery} \u00b7 ${Math.round(state.accuracy * 100)}%`;
}

/**
 * Ranks the whole catalog, not just what has been practiced, so an untouched
 * skill can still be scheduled instead of being invisible to the engine.
 */
export function rankCatalog(input: RankInput): RankedExercise[] {
  const { catalog, states, retentionDue = [], pinned = [], recentRun = {} } = input;
  return catalog.map(exercise => {
    const state = states.find(item => item.exercise === exercise);
    if (state) return { exercise, priority: state.priority, reason: reasonFor(state, retentionDue.includes(exercise), pinned.includes(exercise)), state };
    return {
      exercise,
      priority: skillPriority({
        accuracy: 0, evidenceCount: 0, confusionPressure: 0, retentionDue: retentionDue.includes(exercise),
        generalizationGap: 1, transferGap: 0, pinned: pinned.includes(exercise), recentRun: recentRun[exercise] ?? 0, automatic: false,
      }),
      reason: 'Not practiced yet',
    };
  }).sort((a, b) => b.priority - a.priority);
}

/* ------------------------------------------------------------- dashboard */

export type Bucket = 'Needs work' | 'Now reliable' | 'Improving' | 'Stagnant';
export interface TrendEvidence { earlierAccuracy: number; recentAccuracy: number; comparisonEvidence: number }

/**
 * The four dashboard states from the progress-journal spec. Returns undefined
 * rather than guessing when there is not yet enough evidence to place a skill.
 */
export function dashboardBucket(state: SkillState, trend: TrendEvidence): Bucket | undefined {
  const pressure = confusionPressure(state.confusions, state.exercise);
  if (state.attempts >= 4 && (state.accuracy < .7 || pressure > .3)) return 'Needs work';
  if (state.mastery !== 'Introduced' && state.mastery !== 'Developing') return 'Now reliable';
  const change = trend.recentAccuracy - trend.earlierAccuracy;
  if (trend.comparisonEvidence >= 8 && change >= .1) return 'Improving';
  if (trend.comparisonEvidence >= 12 && Math.abs(change) < .05 && state.accuracy < .85) return 'Stagnant';
  return undefined;
}

/**
 * One sentence in the shape the spec uses for a difficulty envelope: accuracy and
 * latency, the conditions that hold, the conditions that break, and transfer kept
 * separate from synthetic.
 */
export function envelopeSummary(state: SkillState): string {
  const parts = [`${Math.round(state.accuracy * 100)}% at ${(state.medianLatencyMs / 1000).toFixed(1)}s`];
  if (state.envelope.reliable.length) parts.push(`reliable across ${state.envelope.reliable.join(', ')}`);
  if (state.envelope.breakdown.length) parts.push(`breaks down at ${state.envelope.breakdown.join(', ')}`);
  if (state.transferAttempts) parts.push(`${Math.round(state.transferAccuracy * 100)}% in real music over ${state.transferAttempts}`);
  return parts.join('; ');
}
