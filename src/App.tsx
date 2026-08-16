import { useEffect, useMemo, useRef, useState } from 'react';
import { AudioEngine } from './audio';
import { calibration, capabilityMilestones, confusionPairs, summarizeSession, summarizeSkills } from './analytics';
import { adjustDrill, assembleSession, challengeSignal, configAtLevel, dashboardBucket, envelopeSummary, rankCatalog, skillStates, type Bucket, type SessionSlot } from './adaptive';
import { expectedHarmonyAnswer, generateHarmony, harmonyAnswers, type HarmonyResponseMode } from './harmony';
import { probeSeed, retentionStore, scheduleProbe } from './retention';
import { attemptStore, sessionStore, type Confidence } from './storage';
import { answersFor, generateStimulus, RECOGNITION_KINDS, recommendKind, type DrillConfig, type ExerciseKind } from './training';
import { NOTE_NAMES, pitch } from './theory';
import { NoteMap } from './NoteMap';
import { playbackPlan, renderPlayback } from './playback';
import { DiagnosticLab } from './DiagnosticLab';
import { buildComparison, contrastCandidates, contrastConfig } from './contrast';
import {
  applyProfile, currentStage, PROFILES, profileConfig, profileFor, profileProgressionIds, profileSpacings,
  profileStore, PRODUCTION_EXERCISES, stageProgress, TRANSFER_EXERCISES, VOICING_EXERCISES, type ProfileId,
} from './curriculum';
import { buildDay, dayFor, dayPlan, placementDay, TOTAL_DAYS } from './path';
import { dayStore, localDate, standing } from './progression';
import { CLEAR_FRACTION, currentSection, SECTIONS, sectionOf, sectionProgress, unlockedExercises } from './sections';
import { dayBriefing, dayReport } from './tutor';
import { TextureLab } from './TextureLab';
import { DataPanel } from './DataPanel';
import { journal, noteStore, renderEntry, type PerceivedDifficulty } from './journal';
import { diagnosticStore } from './diagnostic';
import { transcriptionStore } from './transcription';
import { TranscriptionLab } from './TranscriptionLab';
import { TranscribeLab } from './TranscribeLab';
import { HarmonizeLab } from './HarmonizeLab';
import { PerformLab } from './PerformLab';
import { VoicingLab } from './VoicingLab';
import { SingingLab } from './SingingLab';
import { Pager, Screen, ScreenBody, ScreenHead, Tabs } from './ui';
import { titleCasable } from './display';
import './styles.css';

type Page = 'Today' | 'Daily' | 'Diagnostic' | 'Practice' | 'Curriculum' | 'Harmony' | 'Voicings' | 'Performance' | 'Perform' | 'Harmonize' | 'Transcribe' | 'Transcription' | 'Singing' | 'Explore' | 'Progress' | 'Settings';
const PAGES: Page[] = ['Today', 'Daily', 'Diagnostic', 'Practice', 'Curriculum', 'Harmony', 'Voicings', 'Performance', 'Perform', 'Harmonize', 'Transcribe', 'Transcription', 'Singing', 'Explore', 'Progress', 'Settings'];
const DRILL_KINDS: ExerciseKind[] = [...RECOGNITION_KINDS];
// The voicing drills are recognition work too, so they rank and schedule alongside
// the rest rather than sitting in a lab the engine cannot reach.
const CATALOG = [...DRILL_KINDS.map(kind => `${kind}-recognition`), ...VOICING_EXERCISES.filter(id => id !== 'inner-voice-reproduction')];
const PRODUCTION = [...PRODUCTION_EXERCISES, 'inner-voice-reproduction'];
const TRANSFER: string[] = [...TRANSFER_EXERCISES];
const kindOf = (exercise: string) => DRILL_KINDS.find(kind => `${kind}-recognition` === exercise);
const title = (value: string) => value.replaceAll('-', ' ');

type ProgressTab = 'overview' | 'skills' | 'journal' | 'ledger' | 'note';
type SettingsTab = 'drill' | 'advanced' | 'export' | 'restore';
type CurriculumTab = 'sections' | 'profiles' | 'stages';

/**
 * A drill that is still in the app. Attempts and probes recorded against a
 * retired exercise stay in the journal as history, but must never be scheduled
 * again — there is no screen left to send them to.
 */
const isLive = (exercise: string) => CATALOG.includes(exercise) || PRODUCTION.includes(exercise) || TRANSFER.includes(exercise);

/** One place that decides where an exercise id is practiced. */
function pageFor(exercise: string): Page {
  if ((VOICING_EXERCISES as readonly string[]).includes(exercise)) return 'Voicings';
  if (exercise === 'transcription') return 'Transcription';
  if (exercise.startsWith('harmony-')) return 'Harmony';
  if (exercise.startsWith('transcribe-')) return 'Transcribe';
  if (exercise.startsWith('call-response') || exercise === 'functional-performance') return 'Perform';
  if (exercise.includes('harmoniz')) return 'Harmonize';
  if (exercise.endsWith('-production')) return 'Singing';
  return 'Performance';
}
const initialConfig: DrillConfig = { kind: 'triad', rootPool: 'all', inversions: true, melodic: false, register: 'random', timbre: 'piano' };

export default function App() {
  // The pathway is the front door. Landing on a bare drill was what made the app
  // feel like a pile of exercises rather than a course.
  const [page, setPage] = useState<Page>(() => location.hash === '#performance' ? 'Performance' : location.hash === '#transcription' ? 'Transcription' : 'Today');
  const [config, setConfig] = useState(initialConfig);
  const [seed, setSeed] = useState(() => Date.now());
  const [answer, setAnswer] = useState<string>();
  const [replays, setReplays] = useState(0);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [harmonyMode, setHarmonyMode] = useState<HarmonyResponseMode>('function');
  const [sessionId] = useState(() => crypto.randomUUID());
  const [selectedSkill, setSelectedSkill] = useState<string>();
  const [plan, setPlan] = useState<SessionSlot[]>([]);
  const [planIndex, setPlanIndex] = useState(0);
  const [pinned, setPinned] = useState<string[]>([]);
  const [clockMs, setClockMs] = useState(() => Date.now());
  const [pendingAnswer, setPendingAnswer] = useState<string>();
  // The prompt's start time is state, not a ref, because the countdown reads it
  // during render and refs must not be read there.
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [profileId, setProfileId] = useState<ProfileId | undefined>(() => profileStore.get());
  const [voicingDrill, setVoicingDrill] = useState<string>();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [progressTab, setProgressTab] = useState<ProgressTab>('overview');
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('drill');
  const [curriculumTab, setCurriculumTab] = useState<CurriculumTab>('sections');
  const [draftNote, setDraftNote] = useState('');
  const [draftObservation, setDraftObservation] = useState('');
  const [draftPerceived, setDraftPerceived] = useState<PerceivedDifficulty>();
  const [noteSaved, setNoteSaved] = useState(false);
  // Attempt ids belonging to the day in progress, so the end-of-day report reads
  // this session's work rather than the whole history.
  const [dayAttemptIds, setDayAttemptIds] = useState<string[]>([]);
  const [dayNumber, setDayNumber] = useState<number>();
  const [dayFinished, setDayFinished] = useState(false);
  const profile = profileFor(profileId);
  const audio = useMemo(() => new AudioEngine(), []);
  const stimulus = useMemo(() => generateStimulus(seed, config), [seed, config]);
  const genreProgressions = useMemo(() => profileProgressionIds(profile), [profile]);
  const harmony = useMemo(() => generateHarmony(seed, harmonyMode, genreProgressions), [seed, harmonyMode, genreProgressions]);
  void historyVersion;
  const attempts = attemptStore.all();
  useEffect(() => { sessionStore.add({ id: sessionId, startedAt: new Date().toISOString(), mode: 'mixed' }); return () => sessionStore.finish(sessionId, new Date().toISOString()); }, [sessionId]);

  function next(nextConfig = config) {
    setConfig(nextConfig); setSeed(value => value + 1); setAnswer(undefined); setReplays(0); setStartedAt(Date.now()); setPendingAnswer(undefined);
  }
  function selectKind(kind: ExerciseKind) { next(profileConfig({ ...config, kind, melodic: kind === 'interval' ? config.melodic : false }, profile)); setPage('Practice'); }
  function goTo(destination: Page) { setPage(destination); setAnswer(undefined); setPickerOpen(false); setNavOpen(false); }

  const deadlineMs = config.deadline && config.deadline !== 'none' ? Number(config.deadline) * 1000 : undefined;
  const timerActive = Boolean(deadlineMs) && !answer && page === 'Practice';
  const remainingMs = timerActive ? Math.max(0, startedAt + deadlineMs! - clockMs) : undefined;
  const submitRef = useRef<(_response: string) => void>(() => undefined);
  useEffect(() => { submitRef.current = submit; });

  // A response deadline trains automaticity. Running out is a real failure to
  // recognise in time, so it is graded, never silently discarded.
  useEffect(() => {
    if (!timerActive || !deadlineMs) return;
    const expires = startedAt + deadlineMs;
    const tick = setInterval(() => {
      setClockMs(Date.now());
      if (Date.now() >= expires) submitRef.current('timed out');
    }, 100);
    return () => clearInterval(tick);
  }, [timerActive, deadlineMs, startedAt]);

  const activeSlot = plan[planIndex];
  /**
   * The session controls belong to the screen the current item is actually on.
   * A plan outlives navigation on purpose — Daily offers to resume it — but
   * leaving mid-session used to carry the "3 of 20 · Voice Motion" bar onto
   * whatever page you went to, so an unrelated screen looked like it was part
   * of the session and its prompts looked like session items.
   */
  const slotPage = activeSlot && (kindOf(activeSlot.exercise) ? 'Practice' : pageFor(activeSlot.exercise));
  const inSession = plan.length > 0 && Boolean(activeSlot) && page === slotPage;
  const retentionDue = retentionStore.due().filter(probe => isLive(probe.exercise)).map(probe => probe.exercise);
  const states = skillStates({ attempts, retentionDue, pinned });
  // The section spine gates what may be scheduled at all: the section being
  // worked on, plus everything already cleared. Without this the engine ranks
  // the whole catalogue and practice becomes a free-for-all across material the
  // foundations have not been laid for yet.
  // A completed diagnostic is credit toward sections practice has not reached
  // yet, so an existing ear does not have to be re-earned from the ground up.
  const diagnosedLevels = diagnosticStore.latest()?.levels;
  const sections = sectionProgress(states, diagnosedLevels);
  const sectionNow = currentSection(states, diagnosedLevels);
  const unlocked = unlockedExercises(states, diagnosedLevels);
  const availableKinds = DRILL_KINDS.filter(kind => unlocked.includes(`${kind}-recognition`));
  // The genre steers the order within what is unlocked; it never removes
  // anything, so an off-genre weakness is still scheduled at its own priority.
  const ranked = applyProfile(rankCatalog({ catalog: CATALOG.filter(exercise => unlocked.includes(exercise)), states, retentionDue, pinned }), profile);
  const stages = profile ? stageProgress(profile, states) : [];
  const stageNow = profile ? currentStage(profile, states) : undefined;
  const contrastPairs = contrastCandidates(states.flatMap(state => state.confusions));

  /** Difficulty for one exercise, stepped toward the challenge zone. */
  function tunedConfig(exercise: string, base = config): DrillConfig {
    const kind = kindOf(exercise) ?? base.kind;
    const state = states.find(item => item.exercise === exercise);
    // The genre supplies the default sound and answer vocabulary; the difficulty
    // ladders then step from there as usual.
    const seated = profileConfig({ ...base, kind, melodic: kind === 'interval' ? base.melodic : false }, profile);
    if (!state) {
      // No attempts yet: start from the diagnosed level rather than from scratch.
      const diagnosed = diagnosticStore.latest()?.levels[kind];
      return diagnosed === undefined ? seated : profileConfig({ ...configAtLevel(kind, diagnosed), kind }, profile);
    }
    const step = challengeSignal(state.accuracy, state.attempts);
    const weakest = state.generalization.filter(item => !item.generalized).map(item => item.dimension);
    return adjustDrill(seated, step, weakest);
  }

  /**
   * The day's defined work. Placement means someone with existing evidence — or
   * a fresh diagnostic — is not sent back to "did the second note go up".
   */
  const dayRecords = dayStore.all();
  const standingNow = standing(dayRecords);
  const placed = Math.max(placementDay(states, diagnosedLevels), dayFor(standingNow.completedDays));
  /** Sections skipped on diagnostic credit, which review has yet to confirm. */
  const provisional = sections.filter(status => status.provisional);
  const todayDay = dayNumber ?? placed;
  const todayPlan = dayPlan(todayDay);
  const briefing = dayBriefing(todayDay, dayRecords);
  const report = dayFinished ? dayReport({ day: todayDay, attempts, todayIds: new Set(dayAttemptIds) }) : undefined;

  function startDay(day = placed) {
    const due = retentionStore.due().filter(probe => isLive(probe.exercise));
    const slots = buildDay(day, {
      configFor: exercise => kindOf(exercise) ? tunedConfig(exercise) : undefined,
      reasonFor: exercise => ranked.find(item => item.exercise === exercise)?.reason,
      dueRetention: due.map(probe => ({ exercise: probe.exercise, probeId: probe.id })),
    });
    setDayNumber(day); setDayAttemptIds([]); setDayFinished(false);
    setPlan(slots); setPlanIndex(0);
    if (slots.length) openSlot(slots[0], 0);
  }

  /** Writes the day into the dated record, which is what a streak is built from. */
  function finishDay() {
    const done = attempts.filter(attempt => dayAttemptIds.includes(attempt.id));
    const latencies = done.map(attempt => attempt.latencyMs).sort((a, b) => a - b);
    dayStore.complete({
      day: todayDay, date: localDate(),
      correct: done.filter(attempt => attempt.correct).length, total: done.length,
      medianLatencyMs: latencies.length ? latencies[Math.floor(latencies.length / 2)] : 0,
    });
    setPlan([]); setPlanIndex(0); setDayFinished(true); setPage('Today');
    setHistoryVersion(value => value + 1);
  }

  function startDaily(total = 20) {
    const due = retentionStore.due().filter(probe => isLive(probe.exercise));
    const growthTarget = ranked[0]?.exercise;
    const slots = assembleSession({
      total,
      dueRetention: due.map(probe => ({ exercise: probe.exercise, probeId: probe.id })),
      ranked: ranked.map(item => {
        // A confusion above threshold escalates from "practise this skill" to a
        // clean A/B contrast between exactly the two labels being mixed up.
        const pair = contrastPairs.find(candidate => candidate.exercise === item.exercise);
        const tuned = tunedConfig(item.exercise);
        return pair
          ? { exercise: item.exercise, config: contrastConfig(tuned, pair), reason: `Contrast: ${pair.a} vs ${pair.b}` }
          : { exercise: item.exercise, config: tuned, reason: item.reason };
      }),
      growth: growthTarget ? { exercise: growthTarget, config: adjustDrill(tunedConfig(growthTarget), 'raise'), reason: 'Targeted growth at raised difficulty' } : undefined,
      // Production and transfer are sections in their own right, so they only
      // appear in a session once the spine has reached them.
      production: PRODUCTION.filter(exercise => unlocked.includes(exercise)),
      transfer: TRANSFER.filter(exercise => unlocked.includes(exercise)),
    });
    setPlan(slots); setPlanIndex(0);
    if (slots.length) openSlot(slots[0], 0);
  }

  function openSlot(slot: SessionSlot, index: number) {
    setPlanIndex(index); setAnswer(undefined); setReplays(0); setStartedAt(Date.now());
    const kind = kindOf(slot.exercise);
    if (kind) {
      setConfig(slot.config ? { ...slot.config, kind } : { ...config, kind });
      // Retention probes must be altered examples, never exact repeats.
      setSeed(slot.probeId ? probeSeed({ id: slot.probeId, exercise: slot.exercise, dueAt: new Date().toISOString(), intervalDays: 1 }) : value => value + 1);
      setPage('Practice');
    } else openExercise(slot.exercise);
  }

  /** Sends a non-drill exercise to the page that hosts it, on the drill it names. */
  function openExercise(exercise: string) {
    if ((VOICING_EXERCISES as readonly string[]).includes(exercise)) setVoicingDrill(exercise);
    if (exercise.startsWith('harmony-')) setHarmonyMode(exercise.slice(8) as HarmonyResponseMode);
    setPage(pageFor(exercise));
  }

  function advancePlan() {
    const nextIndex = planIndex + 1;
    if (nextIndex >= plan.length) {
      // A pathway day ends by being recorded; a free session just ends.
      if (dayNumber !== undefined) return finishDay();
      setPlan([]); setPlanIndex(0); setPage('Daily'); return;
    }
    openSlot(plan[nextIndex], nextIndex);
  }
  function submit(response: string, confidence?: Confidence) {
    if (answer) return;
    setAnswer(response); setPendingAnswer(undefined);
    const attemptId = crypto.randomUUID();
    if (dayNumber !== undefined && plan.length) setDayAttemptIds(current => [...current, attemptId]);
    attemptStore.add({
      id: attemptId, sessionId, timestamp: new Date().toISOString(), exercise: `${config.kind}-recognition`,
      stimulus: { ...stimulus, timbre: config.timbre }, expected: stimulus.answer, response,
      correct: response === stimulus.answer, latencyMs: Date.now() - startedAt,
      // The number of options is part of the difficulty: a genre profile narrows
      // the answer grid, and a four-way choice is not the same task as a seven-way one.
      difficulty: { rootPool: config.rootPool, inversions: config.inversions, register: config.register, timbre: config.timbre, presentation: config.presentation ?? 'both', vocabulary: config.vocabulary ?? 'diatonic', exposure: config.exposure ?? 'sustained', rhythm: config.rhythm ?? 'steady', memoryDelay: config.memoryDelay ?? 'none', deadline: config.deadline ?? 'none', options: answersFor(config).length }, replayCount: replays,
      transferCategory: 'synthetic', retentionProbeId: activeSlot?.probeId, confidence
    });
    const correct = response === stimulus.answer;
    const exercise = `${config.kind}-recognition`;
    // A due probe resolves here; success lengthens its interval, failure shortens it.
    if (activeSlot?.probeId) retentionStore.complete(activeSlot.probeId, correct);
    else if (!retentionStore.all().some(probe => probe.exercise === exercise && !probe.completedAt)) {
      retentionStore.upsert(scheduleProbe(exercise, { id: `${exercise}:${Date.now()}`, sourceSeed: seed }));
    }
    setHistoryVersion(value => value + 1);
  }
  function submitHarmony(response: string) {
    if (answer) return;
    const expected = expectedHarmonyAnswer(harmony, harmonyMode);
    setAnswer(response);
    attemptStore.add({ id: crypto.randomUUID(), sessionId, timestamp: new Date().toISOString(), exercise: `harmony-${harmonyMode}`, stimulus: { ...harmony, timbre: 'piano' }, expected, response, correct: response === expected, latencyMs: Date.now() - startedAt, difficulty: { keys: 'all-12', responseMode: harmonyMode, progression: harmony.templateId, voicing: 'voice-led' }, replayCount: replays });
    setHistoryVersion(value => value + 1);
  }
  const comparison = answer && answer !== stimulus.answer && answer !== 'timed out'
    ? buildComparison(seed, config, stimulus.answer, answer)
    : undefined;
  const playNotes = (notes: number[], duration = 1.15) => void audio.play(notes.map(pitch), duration, false, config.timbre);
  /** Same distinction, fresh example — the immediate near-transfer retest. */
  const anotherLikeThis = () => next({ ...config, only: [stimulus.answer, answer!] });

  const replayLimit = stimulus.replayLimit;
  const replaysSpent = replayLimit !== undefined && replays >= replayLimit;
  const play = () => {
    if (replaysSpent) return;
    setReplays(value => value + 1);
    renderPlayback(audio, playbackPlan(stimulus, config), config.timbre);
  };
  const accuracy = attempts.length ? Math.round(attempts.filter(item => item.correct).length / attempts.length * 100) : null;
  const skills = summarizeSkills(attempts);
  const confusions = confusionPairs(attempts).slice(0, 3);
  const sessionSummary = summarizeSession(attempts, sessionId);
  const milestones = capabilityMilestones(attempts);
  const skillDetail = skills.find(skill => skill.exercise === selectedSkill);
  const stateFor = (exercise: string) => states.find(item => item.exercise === exercise);
  const detailState = selectedSkill ? stateFor(selectedSkill) : undefined;
  const probes = retentionStore.all();
  const calibrationBands = calibration(attempts);
  const nextProbe = (exercise: string) => probes.filter(probe => probe.exercise === exercise && !probe.completedAt).sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt))[0];
  const notes = noteStore.all();
  const entries = journal({ attempts, sessions: sessionStore.all(), notes, probes, nextTarget: ranked[0]?.exercise });

  /** Self-report is stored beside the evidence and never folded into it. */
  function saveNote() {
    const note = draftNote.trim(); const observation = draftObservation.trim();
    if (!note && !observation && !draftPerceived) return;
    noteStore.save({ sessionId, savedAt: new Date().toISOString(), note: note || undefined, observation: observation || undefined, perceived: draftPerceived });
    setNoteSaved(true); setHistoryVersion(value => value + 1);
  }
  const buckets = skills.reduce((groups, summary) => {
    const state = stateFor(summary.exercise);
    const bucket = state && dashboardBucket(state, summary);
    if (bucket) groups[bucket] = [...(groups[bucket] ?? []), summary.exercise];
    return groups;
  }, {} as Partial<Record<Bucket, string[]>>);

  const options = answersFor(config);
  const harmonyOptions = harmonyAnswers(harmonyMode, harmony);
  const harmonyExpected = expectedHarmonyAnswer(harmony, harmonyMode);
  const harmonyLabel = harmonyMode === 'roman' ? 'Roman numerals' : harmonyMode === 'modulation' ? 'Modulation' : harmonyMode === 'pivot' ? 'Pivot chord' : 'Function';

  return <div className="app">
    <aside className="rail">
      <div className="brand"><i>PE</i><b>Perfect Ear</b></div>
      <nav>{PAGES.map(item => <button className={page === item ? 'active' : ''} onClick={() => goTo(item)} key={item}>{item}</button>)}</nav>
      <div className="rail-foot">Local only · {attempts.length} attempts</div>
    </aside>

    {navOpen && <div className="nav-sheet">
      <div className="sheet-head"><b>Go to</b><button onClick={() => setNavOpen(false)}>Close</button></div>
      <div className="destinations">{PAGES.map(item => <button className={page === item ? 'active' : ''} onClick={() => goTo(item)} key={item}>{item}</button>)}</div>
    </div>}

    <main>
      <div className="topbar">
        <b>{inSession ? `${planIndex + 1} of ${plan.length} · ${page}` : page}</b>
        <button className="menu" onClick={() => setNavOpen(true)}>Menu ▾</button>
      </div>

      {inSession && <div className="topbar">
        <b>{title(activeSlot!.exercise)}</b>
        <button className="menu" onClick={advancePlan}>{planIndex + 1 >= plan.length ? 'Finish' : 'Skip'}</button>
        <button className="menu" onClick={() => { setPlan([]); setPlanIndex(0); setPage('Daily'); }}>End</button>
      </div>}

      {page === 'Today' && <Screen>
        <ScreenHead
          title={`Day ${todayDay}`}
          meta={`${todayPlan.section.name} · ${standingNow.streak} day streak`}
        />
        <ScreenBody>
          {report ? <>
            {/* The graded report is the point of a day ending: it says what
                happened, in terms specific enough to act on. */}
            <div className="day-result">
              <b className={`grade grade-${report.grade}`}>{report.grade}</b>
              <div>
                <strong>{report.headline}</strong>
                <span>{report.next}</span>
              </div>
            </div>
            <Pager items={report.notes} label="notes" empty="Not enough in this day to draw anything from." row={(note, index) => <div className="row" key={index}><small>{note}</small></div>}/>
            <div className="actions">
              <button className="primary" onClick={() => { setDayFinished(false); setDayNumber(undefined); }}>Done</button>
              <button className="ghost" onClick={() => startDay(todayDay)}>Repeat day {todayDay}</button>
            </div>
          </> : plan.length > 0 && dayNumber !== undefined ? <>
            <p className="lede">Day {todayDay} in progress — {planIndex} of {plan.length} answered.</p>
            <Pager items={plan} label="items" row={(slot, index) => <div key={index} className={`row ${index === planIndex ? 'current' : index < planIndex ? 'done' : ''}`}>
              <b>{title(slot.exercise)}</b>
              <span className={`pill ${slot.purpose}`}>{slot.purpose}</span>
              <small>{slot.reason}</small>
            </div>}/>
            <div className="actions">
              <button className="primary" onClick={() => openSlot(plan[planIndex], planIndex)}>Resume →</button>
              <button className="ghost" onClick={() => { setPlan([]); setPlanIndex(0); setDayNumber(undefined); }}>Put it down</button>
            </div>
          </> : <>
            <p className="lede">{briefing}</p>
            <div className="stats">
              <div className="stat"><strong>{todayDay}</strong><span>of {TOTAL_DAYS} days</span></div>
              <div className="stat"><strong>{standingNow.streak}</strong><span>day streak</span></div>
              <div className="stat"><strong>{standingNow.recentDaysWorked}</strong><span>of last 14</span></div>
              <div className="stat"><strong>{standingNow.lastGrade ?? '—'}</strong><span>last grade</span></div>
            </div>
            <Pager items={todayPlan.section.exercises} label="drills" className="grid" row={exercise => <div className="profile-card" key={exercise}>
              <b style={{ textTransform: 'capitalize' }}>{title(exercise.replace('-recognition', ''))}</b>
              <span>{stateFor(exercise)?.mastery ?? 'new'}</span>
            </div>}/>
            <div className="actions">
              {standingNow.doneToday
                ? <button className="primary" onClick={() => startDay(placed)}>Extra day {placed} →</button>
                : <button className="primary" onClick={() => startDay(placed)}>Start day {placed} →</button>}
              <button className="ghost" onClick={() => goTo('Explore')}>Practice something else</button>
            </div>
            {provisional.length > 0
              ? <p className="hint">Your diagnostic placed you past {provisional.map(status => status.section.name).join(', ')} — those come back as review, and if practice disagrees you will be moved back to them.</p>
              : standingNow.doneToday && <p className="hint">Today’s work is already recorded. Anything more is extra — it still counts as practice, and nothing is capped.</p>}
          </>}
        </ScreenBody>
      </Screen>}

      {page === 'Daily' && <Screen>
        <ScreenHead title="Daily" meta={`Section ${sectionNow.index + 1} of ${SECTIONS.length} · ${retentionDue.length} probe${retentionDue.length === 1 ? '' : 's'} due`}/>
        <ScreenBody>
          {plan.length > 0 ? <>
            <p className="lede">Session in progress — {plan.length} items, built from retention that is due, current weaknesses, one growth target, production work and real-music transfer.</p>
            <Pager items={plan} label="items" row={(slot, index) => <div key={index} className={`row ${index === planIndex ? 'current' : index < planIndex ? 'done' : ''}`}>
              <b>{title(slot.exercise)}</b>
              <span className={`pill ${slot.purpose}`}>{slot.purpose}</span>
              <small>{slot.reason}</small>
            </div>}/>
            <div className="actions">
              <button className="primary" onClick={() => openSlot(plan[planIndex], planIndex)}>Resume item {planIndex + 1} →</button>
              <button className="ghost" onClick={() => { setPlan([]); setPlanIndex(0); }}>End session</button>
            </div>
          </> : <>
            <p className="lede"><b>{sectionNow.section.name}</b> — {sectionNow.section.goal} {sectionNow.met.length} of {sectionNow.section.exercises.length} reliable; the next section opens at {Math.ceil(sectionNow.section.exercises.length * CLEAR_FRACTION)}.{profile && ` Ordering leans toward ${profile.name}.`}</p>
            <Pager items={ranked} label="skills" empty="Practice anything to start building evidence." row={item => <div className="row" key={item.exercise}>
              <b>{title(item.exercise)}</b>
              <button className={pinned.includes(item.exercise) ? 'pinned' : ''} onClick={() => setPinned(current => current.includes(item.exercise) ? current.filter(value => value !== item.exercise) : [...current, item.exercise])}>{pinned.includes(item.exercise) ? 'Pinned' : 'Pin'}</button>
              <small>{item.state ? item.state.mastery : 'new'} · {item.reason}{item.stage ? ` · ${profile!.name}: ${item.stage}` : ''}</small>
            </div>}/>
            <div className="actions">
              <button className="primary" onClick={() => startDaily()}>Start 20-item session</button>
              <button className="ghost" onClick={() => startDaily(10)}>Short session (10)</button>
            </div>
          </>}
        </ScreenBody>
      </Screen>}

      {page === 'Practice' && <Screen>
        <div className={`drill ${titleCasable(options) ? 'caps' : ''}`}>
          <div className="drill-top">
            <button className="picker-trigger" aria-label="Choose a different drill" onClick={() => setPickerOpen(value => !value)}>
              <span>{title(config.kind)}</span><span className="picker-caret">{pickerOpen ? '▲' : '▾'}</span>
            </button>
            <span className="screen-meta">{attempts.length} attempts</span>
            {pickerOpen && <div className="kind-picker">{availableKinds.map(kind => <button key={kind} className={config.kind === kind ? 'selected' : ''} onClick={() => { selectKind(kind); setPickerOpen(false); }}>{title(kind)}</button>)}</div>}
          </div>

          {!answer ? <>
            <div className="prompt">
              <button className="listen" aria-label="Play prompt" onClick={play} disabled={replaysSpent}>▶</button>
              {remainingMs !== undefined && <div className="deadline" role="timer">
                <i style={{ width: `${Math.max(0, Math.min(100, remainingMs / (deadlineMs ?? 1) * 100))}%` }}/>
                <small>{(remainingMs / 1000).toFixed(1)}s to answer</small>
              </div>}
              <h2>{stimulus.question ?? 'Listen, then choose'}</h2>
              <p className="hint">{replayLimit !== undefined ? `One listen only — ${Math.max(0, replayLimit - replays)} left.` : 'Replay freely. Response time and replays are evidence, never penalties.'}</p>
              {config.kind === 'interval' && <div className="toggle">
                <button className={!config.melodic ? 'selected' : ''} onClick={() => setConfig({ ...config, melodic: false })}>Together</button>
                <button className={config.melodic ? 'selected' : ''} onClick={() => setConfig({ ...config, melodic: true })}>One after another</button>
              </div>}
            </div>
            <div className={`answers ${options.length > 10 ? 'dense' : ''}`}>{options.map(option => <button key={option} onClick={() => config.confidence && !answer ? setPendingAnswer(option) : submit(option)} className={pendingAnswer === option ? 'pending' : ''}>{option}</button>)}</div>
            {pendingAnswer && <div className="confidence-prompt">
              <span className="eyebrow">How sure are you?</span>
              <div className="replay-actions">{(['guess', 'unsure', 'sure'] as Confidence[]).map(level => <button key={level} onClick={() => submit(pendingAnswer, level)}>{level === 'guess' ? 'Guessing' : level === 'unsure' ? 'Fairly sure' : 'Certain'}</button>)}</div>
              <small>Recorded only to compare how sure you felt against how right you were.</small>
            </div>}
          </> : <>
            <div className="verdict">
              <button className="mini-replay" aria-label="Replay the prompt" onClick={play} disabled={replaysSpent}>▶</button>
              <span>You chose</span>
              <b className={answer === stimulus.answer ? 'correct' : 'wrong'}>{answer === 'timed out' ? 'Timed out' : answer}</b>
              {answer !== stimulus.answer && <><span>·</span><b className="correct">{stimulus.answer}</b></>}
            </div>
            <div className="feedback">
              <div>
                <b>{answer === 'timed out' ? `Out of time — this was ${stimulus.answer}.` : answer === stimulus.answer ? 'Correct — well heard.' : `This was ${stimulus.answer}.`}</b>
                {!config.blind && <span>{stimulus.explanation ?? `${NOTE_NAMES[stimulus.root % 12]} · ${stimulus.quality ?? (stimulus.inversion ? `inversion ${stimulus.inversion}` : 'root position')}`}</span>}
                {!config.blind && <NoteMap notes={stimulus.phrase ? stimulus.phrase.flat() : stimulus.notes} defining={stimulus.notes} label="What sounded"/>}
              </div>
              {comparison && <div className="error-replay">
                <span className="eyebrow">Hear the difference</span>
                <div className="replay-actions">
                  <button onClick={() => playNotes(comparison.heard.notes)}>Replay {stimulus.answer}</button>
                  <button onClick={() => playNotes(comparison.alternative.notes)}>Play {answer}</button>
                  <button onClick={() => playNotes(comparison.differing, 1.4)}>Isolate the difference</button>
                  <button onClick={anotherLikeThis}>Another like this →</button>
                </div>
              </div>}
            </div>
            <div className="action-bar">
              <b>{answer === 'timed out' ? 'Out of time' : answer === stimulus.answer ? 'Correct' : `Was ${stimulus.answer}`}</b>
              <button onClick={() => inSession ? advancePlan() : next()}>{inSession ? (planIndex + 1 >= plan.length ? 'Finish session →' : 'Next item →') : 'Next prompt →'}</button>
            </div>
          </>}
        </div>
      </Screen>}

      {page === 'Harmony' && <Screen>
        <div className={`drill ${titleCasable(harmonyOptions) ? 'caps' : ''}`}>
          <div className="drill-top">
            <button className="picker-trigger" aria-label="Choose a different response mode" onClick={() => setPickerOpen(value => !value)}>
              <span>{harmonyLabel}</span><span className="picker-caret">{pickerOpen ? '▲' : '▾'}</span>
            </button>
            <span className="screen-meta">{NOTE_NAMES[harmony.keyPitchClass]} major</span>
            {pickerOpen && <div className="kind-picker">{([['function', 'Function'], ['roman', 'Roman numerals'], ['modulation', 'Modulation'], ['pivot', 'Pivot chord']] as [HarmonyResponseMode, string][]).map(([mode, label]) => <button key={mode} className={harmonyMode === mode ? 'selected' : ''} onClick={() => { setHarmonyMode(mode); next(); setPickerOpen(false); }}>{label}</button>)}</div>}
          </div>

          {!answer ? <>
            <div className="prompt">
              <button className="listen" aria-label="Play progression" onClick={() => { void audio.playProgression(harmony.chords.map(notes => notes.map(pitch))); setReplays(value => value + 1); }}>▶</button>
              <h2>{harmonyMode === 'roman' ? 'Identify the exact progression' : harmonyMode === 'modulation' ? 'Which key did it land in?' : harmonyMode === 'pivot' ? 'Which chord belonged to both keys?' : 'Identify the harmonic function'}</h2>
              <p className="hint">The displayed tonic establishes key context before you analyze the progression.</p>
            </div>
            <div className={`answers ${harmonyOptions.length > 10 ? 'dense' : 'wide'}`}>{harmonyOptions.map(option => <button key={option} onClick={() => submitHarmony(option)}>{option}</button>)}</div>
          </> : <>
            <div className="verdict">
              <button className="mini-replay" aria-label="Replay the progression" onClick={() => void audio.playProgression(harmony.chords.map(notes => notes.map(pitch)))}>▶</button>
              <span>You chose</span>
              <b className={answer === harmonyExpected ? 'correct' : 'wrong'}>{answer}</b>
              {answer !== harmonyExpected && <><span>·</span><b className="correct">{harmonyExpected}</b></>}
            </div>
            <div className="feedback"><div>
              <b>{answer === harmonyExpected ? 'Correct — function resolved.' : `This was ${harmonyExpected}.`}</b>
              <span>{harmony.name} in {NOTE_NAMES[harmony.keyPitchClass]} major{harmony.destinationKey !== undefined ? ` → ${NOTE_NAMES[harmony.destinationKey]}` : ''}{harmony.pedalNote !== undefined ? ` · pedal on ${NOTE_NAMES[harmony.pedalNote % 12]}` : ''}</span>
            </div></div>
            <div className="action-bar">
              <b>{answer === harmonyExpected ? 'Correct' : `Was ${harmonyExpected}`}</b>
              <button onClick={() => next()}>Next progression →</button>
            </div>
          </>}
        </div>
      </Screen>}

      {page === 'Voicings' && <TextureLab key={voicingDrill} requested={voicingDrill} sessionId={sessionId} spacings={profileSpacings(profile)} onEvidence={() => setHistoryVersion(value => value + 1)}/>}
      {page === 'Performance' && <VoicingLab sessionId={sessionId} onEvidence={() => setHistoryVersion(value => value + 1)}/>}
      {page === 'Transcription' && <TranscriptionLab sessionId={sessionId}/>}
      {page === 'Perform' && <PerformLab sessionId={sessionId} onEvidence={() => setHistoryVersion(value => value + 1)}/>}
      {page === 'Harmonize' && <HarmonizeLab sessionId={sessionId} onEvidence={() => setHistoryVersion(value => value + 1)}/>}
      {page === 'Transcribe' && <TranscribeLab sessionId={sessionId} onEvidence={() => setHistoryVersion(value => value + 1)}/>}
      {page === 'Diagnostic' && <DiagnosticLab sessionId={sessionId} onEvidence={() => setHistoryVersion(value => value + 1)}/>}
      {page === 'Singing' && <SingingLab sessionId={sessionId} onEvidence={() => setHistoryVersion(value => value + 1)}/>}

      {page === 'Curriculum' && <Screen>
        <ScreenHead title="Curriculum" meta={`Section ${sectionNow.index + 1} of ${SECTIONS.length}`}/>
        <ScreenBody>
          <Tabs value={curriculumTab} onChange={setCurriculumTab} options={[['sections', 'Sections'], ['profiles', 'Profiles'], ['stages', 'Stages']]}/>
          {curriculumTab === 'sections' && <>
            <p className="lede">The order material opens in. A section clears once {Math.round(CLEAR_FRACTION * 100)}% of its drills are reliable — measured, not self-reported — and clearing it opens the next. Earlier sections stay open for review.</p>
            <Pager items={sections} label="sections" row={status => <div key={status.section.id} className={`row ${status.cleared ? 'done' : status.current ? 'current' : ''}`}>
              <div className="stage-head"><b>{status.index + 1}. {status.section.name}</b></div>
              <span className={`pill ${status.cleared ? 'growth' : status.unlocked ? 'weakness' : 'retention'}`}>{status.provisional ? 'placed' : status.cleared ? 'cleared' : status.unlocked ? `${status.met.length}/${status.section.exercises.length}` : 'locked'}</span>
              <small>{status.section.goal}</small>
              <div className="stage-skills" style={{ gridColumn: '1 / -1' }}>{status.section.exercises.map(exercise => <button key={exercise} className={status.met.includes(exercise) ? 'met' : ''} disabled={!status.unlocked} onClick={() => { const kind = kindOf(exercise); if (kind) return selectKind(kind); openExercise(exercise); }}>{title(exercise)}</button>)}</div>
            </div>}/>
          </>}
          {curriculumTab === 'profiles' && <>
            <p className="lede">A profile reorders practice toward the skills a style asks for, and sets the default sound, chord vocabulary and progressions. It never locks anything.</p>
            <Pager items={PROFILES} label="profiles" className="grid" row={item => <button key={item.id} className={`profile-card ${profileId === item.id ? 'selected' : ''}`} onClick={() => { const chosen = profileId === item.id ? undefined : item.id; setProfileId(chosen); profileStore.set(chosen); }}>
              <b>{item.name}</b>
              <span>{item.focus}</span>
              <em>{item.stages.length} stages · {item.timbre}</em>
            </button>}/>
          </> }
          {curriculumTab === 'stages' && (profile
            ? <Pager items={stages} label="stages" row={status => <div key={status.stage.name} className={`row ${status.complete ? 'done' : status.index === stageNow!.index ? 'current' : ''}`}>
              <div className="stage-head"><b>{status.index + 1}. {status.stage.name}</b></div>
              <span className="pill weakness">{status.complete ? 'met' : `${status.met.length}/${status.stage.exercises.length}`}</span>
              <small>{status.stage.goal}</small>
              <div className="stage-skills" style={{ gridColumn: '1 / -1' }}>{status.stage.exercises.map(exercise => <button key={exercise} className={status.met.includes(exercise) ? 'met' : ''} onClick={() => { const kind = kindOf(exercise); if (kind) return selectKind(kind); openExercise(exercise); }}>{title(exercise)}</button>)}</div>
            </div>}/>
            : <div className="pager"><div className="pager-empty">Choose a profile to see its stages.</div></div>)}
        </ScreenBody>
      </Screen>}

      {page === 'Explore' && <Screen>
        <ScreenHead title="Explore" meta={`${availableKinds.length} of ${DRILL_KINDS.length} drills open`}/>
        <ScreenBody>
          <p className="lede">Everything your sections have opened, in any order you like. Locked drills are not hidden — they are listed so you can see what is coming, and they open as you clear the sections that lead to them.</p>
          <Pager items={DRILL_KINDS} label="drills" className="grid" row={kind => {
            const open = availableKinds.includes(kind);
            return <button className={`profile-card ${open ? '' : 'locked'}`} disabled={!open} onClick={() => selectKind(kind)} key={kind}>
              <b style={{ textTransform: 'capitalize' }}>{title(kind)}</b>
              <span>{open ? 'Practice now →' : `Opens in ${sectionOf(`${kind}-recognition`)?.name ?? 'a later section'}`}</span>
            </button>;
          }}/>
          <div className="actions"><button className="primary" disabled={!availableKinds.length} onClick={() => selectKind(recommendKind(attempts, availableKinds))}>Practice recommended weak area</button></div>
        </ScreenBody>
      </Screen>}

      {page === 'Progress' && <Screen>
        <ScreenHead title="Progress" meta={`${attempts.length} attempts`}/>
        <ScreenBody>
          <Tabs value={progressTab} onChange={value => { setProgressTab(value); setSelectedSkill(undefined); }} options={[['overview', 'Overview'], ['skills', 'Skills'], ['journal', 'Journal'], ['ledger', 'Ledger'], ['note', 'Note']]}/>

          {progressTab === 'overview' && <>
            <div className="stats">
              <div className="stat"><strong>{attempts.length}</strong><span>Attempts</span></div>
              <div className="stat"><strong>{accuracy ?? '—'}{accuracy !== null && '%'}</strong><span>Accuracy</span></div>
              <div className="stat"><strong>{sessionSummary.attempts}</strong><span>This session</span></div>
              <div className="stat"><strong>{sessionSummary.attempts ? `${(sessionSummary.medianLatencyMs / 1000).toFixed(1)}s` : '—'}</strong><span>Median</span></div>
            </div>
            {calibrationBands.length > 0 && <div className="stats">{calibrationBands.map(band => <div className="stat" key={band.confidence}>
              <strong>{Math.round(band.accuracy * 100)}%</strong>
              <span>{band.confidence === 'guess' ? 'Guessing' : band.confidence === 'unsure' ? 'Fairly sure' : 'Certain'} · {band.attempts}</span>
            </div>)}</div>}
            {/* The paged group is last, so the region that stretches is the one
                with more to show rather than a gap above the fixed rows. */}
            {Object.keys(buckets).length > 0
              ? <Pager items={(['Needs work', 'Improving', 'Stagnant', 'Now reliable'] as Bucket[]).filter(bucket => buckets[bucket]?.length)} label="groups" className="grid" row={bucket => <div className={`bucket ${bucket.replaceAll(' ', '-').toLowerCase()}`} key={bucket}>
                <b>{bucket}</b>
                {buckets[bucket]!.slice(0, 3).map(exercise => <span key={exercise}>{title(exercise)}</span>)}
              </div>}/>
              : <div className="pager"><div className="pager-empty">Complete a few prompts and your standing appears here.</div></div>}
          </>}

          {progressTab === 'skills' && (skillDetail
            ? <>
              <div className="verdict">
                <button className="mini-replay" aria-label="Back to the skill list" onClick={() => setSelectedSkill(undefined)}>‹</button>
                <b>{title(skillDetail.exercise)}</b>
                <span>{detailState?.mastery ?? skillDetail.mastery} · {skillDetail.attempts} attempts · {Math.round(skillDetail.earlierAccuracy * 100)}% → {Math.round(skillDetail.recentAccuracy * 100)}%</span>
              </div>
              {detailState
                ? <Pager items={detailState.envelope.cells} label="conditions" row={cell => <div className={`envelope-cell ${cell.reliable ? 'reliable' : cell.breakdown ? 'breakdown' : ''}`} key={`${cell.dimension}=${cell.value}`}>
                  <span className="cond">{cell.dimension} = {cell.value}</span>
                  <span className="figure">{Math.round(cell.accuracy * 100)}%</span>
                  <span className="figure">{(cell.medianLatencyMs / 1000).toFixed(1)}s</span>
                  <span className="figure">n={cell.attempts}</span>
                  <span className="verdict">{cell.reliable ? 'reliable' : cell.breakdown ? 'breaks down' : 'gathering'}{cell.dimension === detailState.envelope.cells[0].dimension ? '' : ''}</span>
                </div>}/>
                : <div className="pager"><div className="pager-empty">No condition evidence yet.</div></div>}
              <p className="hint">{detailState?.transferAttempts ? `${Math.round(detailState.transferAccuracy * 100)}% across ${detailState.transferAttempts} real-music attempts.` : 'No real-music evidence yet.'} {(() => { const probe = nextProbe(skillDetail.exercise); if (!probe) return 'No probe scheduled.'; const due = Date.parse(probe.dueAt); return due <= Date.now() ? `Probe due now (${probe.intervalDays}-day interval).` : `Next probe in ${Math.max(1, Math.ceil((due - Date.now()) / 86400000))} day(s).`; })()}</p>
            </>
            : <Pager items={skills} label="skills" empty="Complete a few prompts to build your journal." row={skill => {
              const state = stateFor(skill.exercise);
              return <button className="row skill-row" onClick={() => setSelectedSkill(skill.exercise)} key={skill.exercise}>
                <b>{title(skill.exercise)}</b>
                <div className="comparison"><span>{Math.round(skill.earlierAccuracy * 100)}%</span><i>→</i><span>{Math.round(skill.recentAccuracy * 100)}%</span></div>
                <small>{state?.mastery ?? skill.mastery} · {skill.attempts} attempts · median {(skill.medianLatencyMs / 1000).toFixed(1)}s{state ? ` · ${envelopeSummary(state)}` : ''}</small>
              </button>;
            }}/>)}

          {progressTab === 'journal' && <Pager items={entries} label="entries" empty="Entries are written from what was measured, one per session that produced evidence." row={entry => <div className="journal-entry" key={entry.sessionId}>{renderEntry(entry)}</div>}/>}

          {progressTab === 'ledger' && <>
            {confusions.length > 0 && <div className="confusions">{confusions.map(item => <span key={item.pair}>{item.pair} ×{item.count}</span>)}</div>}
            <Pager items={milestones} label="capabilities" empty="Capabilities appear here once the evidence supports them." row={item => <div className="milestone" key={item.skill}>
              <b>{item.label}</b>
              <span>{item.statement}</span>
              <small>Traceable to {item.evidenceCount} attempts</small>
            </div>}/>
          </>}

          {progressTab === 'note' && <>
            <p className="lede">Optional and factual rather than a diary. Nothing here changes a measured number — it sits alongside the evidence.</p>
            <div className="fields">
              <label className="check" style={{ gridColumn: '1 / -1', display: 'grid', gap: '.25rem' }}>
                <span style={{ fontSize: '.7rem', color: 'var(--muted)' }}>How did it feel?</span>
                <div className="replay-actions">{(['easier', 'expected', 'harder'] as PerceivedDifficulty[]).map(level => <button key={level} className={draftPerceived === level ? 'selected' : ''} onClick={() => { setDraftPerceived(draftPerceived === level ? undefined : level); setNoteSaved(false); }}>{level === 'easier' ? 'Easier' : level === 'expected' ? 'As expected' : 'Harder'}</button>)}</div>
              </label>
              <label>Short note<input type="text" value={draftNote} placeholder="e.g. Rhodes felt muddier today" onChange={event => { setDraftNote(event.target.value); setNoteSaved(false); }}/></label>
              <label>Heard something away from the app?<input type="text" value={draftObservation} placeholder="e.g. caught the bass inversion in a song" onChange={event => { setDraftObservation(event.target.value); setNoteSaved(false); }}/></label>
            </div>
            <div className="actions">
              <button className="primary" disabled={!draftNote.trim() && !draftObservation.trim() && !draftPerceived} onClick={saveNote}>{noteSaved ? 'Saved' : 'Save note'}</button>
              {noteStore.for(sessionId) && <button className="ghost" onClick={() => { noteStore.remove(sessionId); setDraftNote(''); setDraftObservation(''); setDraftPerceived(undefined); setNoteSaved(false); setHistoryVersion(value => value + 1); }}>Remove note</button>}
            </div>
          </>}
        </ScreenBody>
      </Screen>}

      {page === 'Settings' && <Screen>
        <ScreenHead title="Settings" meta="Private · on this device"/>
        <ScreenBody>
          <Tabs value={settingsTab} onChange={setSettingsTab} options={[['drill', 'Drill'], ['advanced', 'Advanced'], ['export', 'Export'], ['restore', 'Restore']]}/>

          {settingsTab === 'drill' && <>
            <div className="fields">
              <label>Root pool<select value={config.rootPool} onChange={event => next({ ...config, rootPool: event.target.value as DrillConfig['rootPool'] })}><option value="all">All 12 roots</option><option value="white">Natural-note roots</option></select></label>
              <label>Register<select value={config.register} onChange={event => next({ ...config, register: event.target.value as DrillConfig['register'] })}><option value="random">Random</option><option value="low">Low</option><option value="middle">Middle</option><option value="high">High</option></select></label>
              <label>Timbre<select value={config.timbre} onChange={event => next({ ...config, timbre: event.target.value as DrillConfig['timbre'] })}><option value="piano">Acoustic piano</option><option value="rhodes">Rhodes</option><option value="organ">Warm organ</option><option value="guitar">Guitar</option><option value="strings">Strings</option><option value="pad">Synth pad</option></select></label>
              <label>Presentation<select value={config.presentation ?? 'both'} onChange={event => next({ ...config, presentation: event.target.value as DrillConfig['presentation'] })}><option value="both">Chord, then arpeggio</option><option value="block">Block chord only</option><option value="arpeggiated">Arpeggiated only</option></select></label>
              {config.kind === 'scale-degree' && <label>Degree vocabulary<select value={config.vocabulary ?? 'diatonic'} onChange={event => next({ ...config, vocabulary: event.target.value as DrillConfig['vocabulary'] })}><option value="diatonic">Diatonic (7)</option><option value="chromatic">Chromatic (12)</option></select></label>}
              {(config.kind === 'triad' || config.kind === 'seventh') && <label className="check"><input type="checkbox" checked={config.inversions} onChange={event => next({ ...config, inversions: event.target.checked })}/> Include inversions</label>}
              {config.kind === 'interval' && <label className="check"><input type="checkbox" checked={config.melodic} onChange={event => next({ ...config, melodic: event.target.checked })}/> Play notes melodically</label>}
            </div>
            <p className="hint">These apply to the current drill: {title(config.kind)}.</p>
          </>}

          {settingsTab === 'advanced' && <>
            <div className="fields">
              <label>Response deadline<select value={config.deadline ?? 'none'} onChange={event => next({ ...config, deadline: event.target.value as DrillConfig['deadline'] })}><option value="none">Untimed</option><option value="8">8 seconds</option><option value="5">5 seconds</option><option value="3">3 seconds</option></select></label>
              <label>Memory delay<select value={config.memoryDelay ?? 'none'} onChange={event => next({ ...config, memoryDelay: event.target.value as DrillConfig['memoryDelay'] })}><option value="none">Adjacent</option><option value="short">Short gap</option><option value="long">Long gap</option></select></label>
              <label>Exposure<select value={config.exposure ?? 'sustained'} onChange={event => next({ ...config, exposure: event.target.value as DrillConfig['exposure'] })}><option value="sustained">Sustained</option><option value="short">Short (0.28s)</option></select></label>
              <label>Rhythm<select value={config.rhythm ?? 'steady'} onChange={event => next({ ...config, rhythm: event.target.value as DrillConfig['rhythm'] })}><option value="steady">Single hit</option><option value="syncopated">Syncopated</option></select></label>
              <label className="check"><input type="checkbox" checked={config.confidence ?? false} onChange={event => next({ ...config, confidence: event.target.checked })}/> Ask how confident I am</label>
              <label className="check"><input type="checkbox" checked={config.blind ?? false} onChange={event => next({ ...config, blind: event.target.checked })}/> Blind mode — hide note names</label>
            </div>
            <div className="actions">
              <button className="danger" onClick={() => { attemptStore.clear(); sessionStore.clear(); transcriptionStore.clear(); noteStore.clear(); retentionStore.clear(); diagnosticStore.clear(); setPlan([]); setPlanIndex(0); setSelectedSkill(undefined); setHistoryVersion(value => value + 1); }}>Clear local history</button>
            </div>
            <p className="hint">Clearing removes attempts, sessions, notes, retention probes and diagnostic results from this device. Your genre profile is a setting, so it stays. Export first if you want to keep any of it.</p>
          </>}

          {(settingsTab === 'export' || settingsTab === 'restore') && <DataPanel section={settingsTab} onRestored={() => { setHistoryVersion(value => value + 1); setProfileId(profileStore.get()); setPlan([]); setPlanIndex(0); }}/>}
        </ScreenBody>
      </Screen>}
    </main>
  </div>;
}
