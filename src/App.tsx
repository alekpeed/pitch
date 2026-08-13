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
import { DiagnosticLab } from './DiagnosticLab';
import { buildComparison, contrastCandidates, contrastConfig } from './contrast';
import {
  applyProfile, currentStage, PROFILES, profileConfig, profileFor, profileProgressionIds, profileSpacings,
  profileStore, PRODUCTION_EXERCISES, stageProgress, TRANSFER_EXERCISES, VOICING_EXERCISES, type ProfileId,
} from './curriculum';
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
import './styles.css';

type Page = 'Daily' | 'Diagnostic' | 'Practice' | 'Curriculum' | 'Harmony' | 'Voicings' | 'Performance' | 'Perform' | 'Harmonize' | 'Transcribe' | 'Transcription' | 'Singing' | 'Explore' | 'Progress' | 'Settings';
const DRILL_KINDS: ExerciseKind[] = [...RECOGNITION_KINDS];
// The voicing drills are recognition work too, so they rank and schedule alongside
// the rest rather than sitting in a lab the engine cannot reach.
const CATALOG = [...DRILL_KINDS.map(kind => `${kind}-recognition`), ...VOICING_EXERCISES.filter(id => id !== 'inner-voice-reproduction')];
const PRODUCTION = [...PRODUCTION_EXERCISES, 'inner-voice-reproduction'];
const TRANSFER = [...TRANSFER_EXERCISES];
const kindOf = (exercise: string) => DRILL_KINDS.find(kind => `${kind}-recognition` === exercise);

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
  const [page, setPage] = useState<Page>(() => location.hash === '#performance' ? 'Performance' : location.hash === '#transcription' ? 'Transcription' : 'Practice');
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
  const [draftNote, setDraftNote] = useState('');
  const [draftObservation, setDraftObservation] = useState('');
  const [draftPerceived, setDraftPerceived] = useState<PerceivedDifficulty>();
  const [noteSaved, setNoteSaved] = useState(false);
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
  const retentionDue = retentionStore.due().map(probe => probe.exercise);
  const states = skillStates({ attempts, retentionDue, pinned });
  // The genre steers the order; it never removes anything, so an off-genre
  // weakness is still scheduled at its own evidence-based priority.
  const ranked = applyProfile(rankCatalog({ catalog: CATALOG, states, retentionDue, pinned }), profile);
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

  function startDaily(total = 20) {
    const due = retentionStore.due();
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
      production: PRODUCTION,
      transfer: TRANSFER,
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
    if (nextIndex >= plan.length) { setPlan([]); setPlanIndex(0); setPage('Daily'); return; }
    openSlot(plan[nextIndex], nextIndex);
  }
  function submit(response: string, confidence?: Confidence) {
    if (answer) return;
    setAnswer(response); setPendingAnswer(undefined);
    attemptStore.add({
      id: crypto.randomUUID(), sessionId, timestamp: new Date().toISOString(), exercise: `${config.kind}-recognition`,
      stimulus: { ...stimulus, timbre: config.timbre }, expected: stimulus.answer, response,
      correct: response === stimulus.answer, latencyMs: Date.now() - startedAt,
      // The number of options is part of the difficulty: a genre profile narrows
      // the answer grid, and a four-way choice is not the same task as a seven-way one.
      difficulty: { rootPool: config.rootPool, inversions: config.inversions, register: config.register, timbre: config.timbre, presentation: config.presentation ?? (config.melodic ? 'melodic' : 'harmonic'), vocabulary: config.vocabulary ?? 'diatonic', exposure: config.exposure ?? 'sustained', rhythm: config.rhythm ?? 'steady', memoryDelay: config.memoryDelay ?? 'none', deadline: config.deadline ?? 'none', options: answersFor(config).length }, replayCount: replays,
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
    if (stimulus.phrase) return void audio.playProgression(stimulus.phrase.map(notes => notes.map(pitch)), config.timbre, stimulus.gapSeconds);
    if (stimulus.contextNotes) return void audio.playProgression([stimulus.contextNotes.map(pitch), stimulus.notes.map(pitch)], config.timbre);
    const arpeggiated = config.presentation === 'arpeggiated';
    const melodic = stimulus.melodic ?? (arpeggiated || (config.kind === 'interval' && config.melodic));
    // Short exposure is a difficulty dimension: less time to decide, same chord.
    const held = config.exposure === 'short' ? .28 : config.kind === 'interval' ? .55 : melodic ? .5 : 1.15;
    if (config.rhythm === 'syncopated' && !melodic) return void audio.playRhythm(stimulus.notes.map(pitch), [0, .34, .82, 1.1], Math.min(held, .4), config.timbre);
    void audio.play(stimulus.notes.map(pitch), held, melodic, config.timbre);
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

  const focused = (page === 'Practice' || page === 'Harmony') && !plan.length;
  return <div className={focused ? 'app focused' : 'app'}><aside><div className="brand"><span>PE</span><div>Perfect Ear<small>Musicianship studio</small></div></div><nav>{(['Daily', 'Diagnostic', 'Practice', 'Curriculum', 'Harmony', 'Voicings', 'Performance', 'Perform', 'Harmonize', 'Transcribe', 'Transcription', 'Singing', 'Explore', 'Progress', 'Settings'] as Page[]).map(item => <button className={page === item ? 'active' : ''} onClick={() => { setPage(item); setAnswer(undefined); setPickerOpen(false); }} key={item}>{item}</button>)}</nav><div className="profile"><b>Local profile</b><small>Private · on this device</small></div></aside><main className={!focused ? (answer && (page === 'Practice' || page === 'Harmony') ? 'has-action-bar' : '') : undefined}>{!focused && <header><div><p className="eyebrow">{plan.length ? `DAILY SESSION · ${planIndex + 1} OF ${plan.length}` : page === 'Practice' || page === 'Harmony' || page === 'Performance' || page === 'Transcription' ? 'TARGETED PRACTICE' : 'YOUR STUDIO'}</p><h1>{page}</h1></div><div className="session">{attempts.length} attempts recorded</div></header>}
  {plan.length > 0 && activeSlot && <div className="session-bar"><div><b>{activeSlot.exercise.replaceAll('-', ' ')}</b><span className={`purpose ${activeSlot.purpose}`}>{activeSlot.purpose}</span><small>{activeSlot.reason}</small></div><div className="session-bar-actions"><button onClick={advancePlan}>{planIndex + 1 >= plan.length ? 'Finish session' : 'Skip item'}</button><button className="ghost" onClick={() => { setPlan([]); setPlanIndex(0); setPage('Daily'); }}>End session</button></div></div>}
  {page === 'Daily' && <><section className="hero"><div><span className="tag">TODAY</span><h2>What should I work on now?</h2><p>A session built from retention that is due, current weaknesses, one growth target at raised difficulty, production work, and real-music transfer.{profile && ` Ordering leans toward ${profile.name}, without dropping anything outside it.`}</p></div><div className="evidence"><small>Engine state</small><b>{retentionDue.length} retention probe{retentionDue.length === 1 ? '' : 's'} due</b><span>{states.length} skill{states.length === 1 ? '' : 's'} with evidence{profile ? ` · ${profile.name} stage ${stageNow!.index + 1}` : ''}</span></div></section>
    {plan.length > 0 && <section className="panel"><h2>Session in progress</h2><ol className="plan">{plan.map((slot, index) => <li key={index} className={index === planIndex ? 'current' : index < planIndex ? 'done' : ''}><b>{slot.exercise.replaceAll('-', ' ')}</b><span className={`purpose ${slot.purpose}`}>{slot.purpose}</span><small>{slot.reason}</small></li>)}</ol><button className="submit-performance" onClick={() => openSlot(plan[planIndex], planIndex)}>Resume item {planIndex + 1} →</button><button onClick={() => { setPlan([]); setPlanIndex(0); }}>End session</button></section>}
    {plan.length === 0 && <section className="panel"><h2>Next up</h2><p>Ranked by evidence: weakness, recurring confusions, retention debt, and conditions you have not generalized to yet. Nothing here is locked — you can always practice anything directly.</p><ol className="plan">{ranked.slice(0, 5).map(item => <li key={item.exercise}><b>{item.exercise.replaceAll('-', ' ')}</b><span className="purpose weakness">{item.state ? item.state.mastery : 'new'}</span><small>{item.reason}{item.stage ? ` · ${profile!.name}: ${item.stage}` : ''}</small><button onClick={() => setPinned(current => current.includes(item.exercise) ? current.filter(value => value !== item.exercise) : [...current, item.exercise])} className={pinned.includes(item.exercise) ? 'pinned' : ''}>{pinned.includes(item.exercise) ? 'Pinned' : 'Pin'}</button></li>)}</ol><button className="submit-performance" onClick={() => startDaily()}>Start 20-item session</button><button onClick={() => startDaily(10)}>Short session (10)</button></section>}</>}
  {page === 'Practice' && <div className="focused-drill"><div className="focus-top"><button className="focus-back" aria-label="Choose a different drill" onClick={() => setPickerOpen(value => !value)}><span className="focus-kind">{config.kind.replaceAll('-', ' ')}</span><span className="focus-caret">{pickerOpen ? '▲' : '▾'}</span></button><span className="focus-meta">{attempts.length} attempts</span>{pickerOpen && <div className="kind-picker">{DRILL_KINDS.map(kind => <button key={kind} className={config.kind === kind ? 'selected' : ''} onClick={() => { selectKind(kind); setPickerOpen(false); }}>{kind.replaceAll('-', ' ')}</button>)}</div>}</div>{!answer && <div className="focus-play"><button className="listen" aria-label="Play prompt" onClick={play} disabled={replaysSpent}><span>▶</span></button>{remainingMs !== undefined && <div className="deadline" role="timer"><i style={{ width: `${Math.max(0, Math.min(100, remainingMs / (deadlineMs ?? 1) * 100))}%` }}/><small>{(remainingMs / 1000).toFixed(1)}s to answer</small></div>}<h3>{stimulus.question ?? 'Listen, then choose'}</h3><p className="hint">{replayLimit !== undefined ? `One listen only — ${Math.max(0, replayLimit - replays)} left.` : 'Replay freely. Response time and replays are evidence, never penalties.'}</p>{config.kind === 'interval' && <div className="melodic-toggle"><span>On a small speaker, two notes together can be hard to tell apart.</span><div className="replay-actions"><button className={!config.melodic ? 'selected' : ''} onClick={() => setConfig({ ...config, melodic: false })}>Together</button><button className={config.melodic ? 'selected' : ''} onClick={() => setConfig({ ...config, melodic: true })}>One after another</button></div></div>}</div>}<div className="focus-scroll">{!answer && <div className={`answers ${answersFor(config).length > 4 ? 'many' : ''}`}>{answersFor(config).map(option => <button key={option} onClick={() => config.confidence && !answer ? setPendingAnswer(option) : submit(option)} className={pendingAnswer === option ? 'pending' : ''}>{option}</button>)}</div>}{answer && <div className="picked-summary"><button className="mini-replay" aria-label="Replay the prompt" onClick={play} disabled={replaysSpent}>▶</button><span>You chose</span><b className={answer === stimulus.answer ? 'correct' : 'wrong'}>{answer === 'timed out' ? 'Timed out' : answer}</b>{answer !== stimulus.answer && <><span>·</span><b className="correct">{stimulus.answer}</b></>}</div>}{pendingAnswer && !answer && <div className="confidence-prompt"><p className="eyebrow">HOW SURE ARE YOU?</p><div className="replay-actions">{(['guess', 'unsure', 'sure'] as Confidence[]).map(level => <button key={level} onClick={() => submit(pendingAnswer, level)}>{level === 'guess' ? 'Guessing' : level === 'unsure' ? 'Fairly sure' : 'Certain'}</button>)}</div><small>Recorded only to compare how sure you felt against how right you were.</small></div>}{answer && <div className="feedback"><div><b>{answer === 'timed out' ? `Out of time — this was ${stimulus.answer}.` : answer === stimulus.answer ? 'Correct — well heard.' : `This was ${stimulus.answer}.`}</b>{!config.blind && <span>{stimulus.explanation ?? `${NOTE_NAMES[stimulus.root % 12]} · ${stimulus.quality ?? (stimulus.inversion ? `inversion ${stimulus.inversion}` : 'root position')}`}</span>}{!config.blind && <NoteMap notes={stimulus.phrase ? stimulus.phrase.flat() : stimulus.notes} defining={stimulus.notes} label="What sounded"/>}</div>{comparison && <div className="error-replay"><p className="eyebrow">HEAR THE DIFFERENCE</p><div className="replay-actions"><button onClick={() => playNotes(comparison.heard.notes)}>Replay {stimulus.answer}</button><button onClick={() => playNotes(comparison.alternative.notes)}>Play {answer}</button><button onClick={() => playNotes(comparison.differing, 1.4)}>Isolate the difference</button><button onClick={anotherLikeThis}>Another like this →</button></div>{!config.blind && <NoteMap notes={[...comparison.shared, ...comparison.differing].sort((a, b) => a - b)} defining={comparison.differing} label={`${stimulus.answer} vs ${answer} — differing tones highlighted`}/>}</div>}</div>}</div>{answer && <div className="action-bar"><b>{answer === 'timed out' ? 'Out of time' : answer === stimulus.answer ? 'Correct' : `Was ${stimulus.answer}`}</b><button onClick={() => plan.length ? advancePlan() : next()}>{plan.length ? (planIndex + 1 >= plan.length ? 'Finish session →' : 'Next item →') : 'Next prompt →'}</button></div>}</div>}
  {page === 'Harmony' && <div className="focused-drill"><div className="focus-top"><button className="focus-back" aria-label="Choose a different response mode" onClick={() => setPickerOpen(value => !value)}><span className="focus-kind">{harmonyMode === 'roman' ? 'Roman numerals' : harmonyMode === 'modulation' ? 'Modulation' : harmonyMode === 'pivot' ? 'Pivot chord' : 'Function'}</span><span className="focus-caret">{pickerOpen ? '▲' : '▾'}</span></button><span className="focus-meta">{NOTE_NAMES[harmony.keyPitchClass]} major</span>{pickerOpen && <div className="kind-picker">{([['function', 'Function'], ['roman', 'Roman numerals'], ['modulation', 'Modulation'], ['pivot', 'Pivot chord']] as [HarmonyResponseMode, string][]).map(([mode, label]) => <button key={mode} className={harmonyMode === mode ? 'selected' : ''} onClick={() => { setHarmonyMode(mode); next(); setPickerOpen(false); }}>{label}</button>)}</div>}</div>{!answer && <div className="focus-play"><button className="listen" aria-label="Play progression" onClick={() => { void audio.playProgression(harmony.chords.map(notes => notes.map(pitch))); setReplays(value => value + 1); }}><span>▶</span></button><h3>{harmonyMode === 'roman' ? 'Identify the exact progression' : harmonyMode === 'modulation' ? 'Which key did it land in?' : harmonyMode === 'pivot' ? 'Which chord belonged to both keys?' : 'Identify the harmonic function'}</h3><p className="hint">The displayed tonic establishes key context before you analyze the progression.</p></div>}<div className="focus-scroll">{!answer && <div className="answers harmony-answers">{harmonyAnswers(harmonyMode, harmony).map(option => <button key={option} onClick={() => submitHarmony(option)}>{option}</button>)}</div>}{answer && <div className="picked-summary"><button className="mini-replay" aria-label="Replay the progression" onClick={() => void audio.playProgression(harmony.chords.map(notes => notes.map(pitch)))}>▶</button><span>You chose</span><b className={answer === expectedHarmonyAnswer(harmony, harmonyMode) ? 'correct' : 'wrong'}>{answer}</b>{answer !== expectedHarmonyAnswer(harmony, harmonyMode) && <><span>·</span><b className="correct">{expectedHarmonyAnswer(harmony, harmonyMode)}</b></>}</div>}{answer && <div className="feedback"><div><b>{answer === expectedHarmonyAnswer(harmony, harmonyMode) ? 'Correct — function resolved.' : `This was ${expectedHarmonyAnswer(harmony, harmonyMode)}.`}</b><span>{harmony.name} in {NOTE_NAMES[harmony.keyPitchClass]} major{harmony.destinationKey !== undefined ? ` → ${NOTE_NAMES[harmony.destinationKey]}` : ''}{harmony.pedalNote !== undefined ? ` · pedal on ${NOTE_NAMES[harmony.pedalNote % 12]}` : ''}</span></div></div>}</div>{answer && <div className="action-bar"><b>{answer === expectedHarmonyAnswer(harmony, harmonyMode) ? 'Correct' : `Was ${expectedHarmonyAnswer(harmony, harmonyMode)}`}</b><button onClick={() => next()}>Next progression →</button></div>}</div>}
  {page === 'Voicings' && <TextureLab key={voicingDrill} requested={voicingDrill} sessionId={sessionId} spacings={profileSpacings(profile)} onEvidence={() => setHistoryVersion(value => value + 1)}/>}
  {page === 'Performance' && <VoicingLab sessionId={sessionId} onEvidence={() => setHistoryVersion(value => value + 1)}/>}
  {page === 'Transcription' && <TranscriptionLab sessionId={sessionId}/>}
  {page === 'Perform' && <PerformLab sessionId={sessionId} onEvidence={() => setHistoryVersion(value => value + 1)}/>}
  {page === 'Harmonize' && <HarmonizeLab sessionId={sessionId} onEvidence={() => setHistoryVersion(value => value + 1)}/>}
  {page === 'Transcribe' && <TranscribeLab sessionId={sessionId} onEvidence={() => setHistoryVersion(value => value + 1)}/>}
  {page === 'Diagnostic' && <DiagnosticLab sessionId={sessionId} onEvidence={() => setHistoryVersion(value => value + 1)}/>}
  {page === 'Singing' && <SingingLab sessionId={sessionId} onEvidence={() => setHistoryVersion(value => value + 1)}/>}
  {page === 'Curriculum' && <><section className="hero"><div><span className="tag">GENRE PROFILE</span><h2>What kind of music are you training for?</h2><p>A profile reorders your practice toward the skills a style actually asks for, and sets the default sound, chord vocabulary and progressions to match. It never locks anything: every drill stays reachable, and a weakness outside the genre is still scheduled.</p></div><div className="evidence"><small>Active profile</small><b>{profile ? profile.name : 'None — full catalog'}</b><span>{profile ? `Stage ${stageNow!.index + 1} of ${profile.stages.length}` : 'Ranked purely by evidence'}</span></div></section>
    <section className="panel">
      <div className="profile-grid">
        {PROFILES.map(item => <button key={item.id} className={`profile-card ${profileId === item.id ? 'selected' : ''}`} onClick={() => { const next = profileId === item.id ? undefined : item.id; setProfileId(next); profileStore.set(next); }}>
          <b>{item.name}</b>
          <span>{item.focus}</span>
          <small>{item.repertoire}</small>
          <em>{item.stages.length} stages · {item.timbre} · {item.progressions.length} progressions</em>
          <i>{profileId === item.id ? 'Active — click to clear' : 'Choose this'}</i>
        </button>)}
      </div>
    </section>
    {profile && <section className="panel"><h2>{profile.name} curriculum</h2><p>Stages advance on the same evidence bar as everything else: every skill in a stage has to reach Reliable, which needs a passed delayed retest and more than one set of conditions. Nothing here is a level you unlock — later stages are practiceable now.</p>
      <ol className="stages">{stages.map(status => <li key={status.stage.name} className={status.complete ? 'done' : status.index === stageNow!.index ? 'current' : ''}>
        <div className="stage-head"><b>{status.stage.name}</b><span className="purpose weakness">{status.complete ? 'met' : `${status.met.length} of ${status.stage.exercises.length}`}</span></div>
        <p>{status.stage.goal}</p>
        <div className="stage-skills">{status.stage.exercises.map(exercise => <button key={exercise} className={status.met.includes(exercise) ? 'met' : ''} onClick={() => { const kind = kindOf(exercise); if (kind) return selectKind(kind); openExercise(exercise); }}>{exercise.replaceAll('-', ' ')}</button>)}</div>
      </li>)}</ol></section>}</>}
  {page === 'Explore' && <section className="panel"><h2>Core curriculum</h2><p>Practice any skill directly. Nothing is locked.</p>{DRILL_KINDS.map(kind => <button className="curriculum" onClick={() => selectKind(kind)} key={kind}><b>{kind.replaceAll('-', ' ')}</b><span>Practice now →</span></button>)}<button className="recommend" onClick={() => selectKind(recommendKind(attempts))}>Practice recommended weak area</button></section>}
  {page === 'Progress' && <section className="panel"><h2>Evidence, not points</h2><p>Your current picture is calculated directly from immutable local attempts.</p><div className="stat"><strong>{attempts.length}</strong><span>Total attempts</span></div><div className="stat"><strong>{accuracy ?? '—'}{accuracy !== null && '%'}</strong><span>Accuracy</span></div><div className="session-card"><b>Current session summary</b><span>{sessionSummary.attempts} attempts · {sessionSummary.attempts ? `${Math.round(sessionSummary.accuracy * 100)}% accurate · median ${(sessionSummary.medianLatencyMs / 1000).toFixed(1)}s` : 'No evidence yet'}</span><small>{sessionSummary.focus.length ? `Focus: ${sessionSummary.focus.join(', ')}` : 'Your focus areas will appear here automatically.'}</small></div>
    <div className="note-form">
      <b>Add a note to this session</b>
      <p className="hint">Entirely optional, and factual rather than a diary. Nothing here changes a single measured number — it sits alongside the evidence.</p>
      <label>How did it feel?<div className="replay-actions">{(['easier', 'expected', 'harder'] as PerceivedDifficulty[]).map(level => <button key={level} className={draftPerceived === level ? 'selected' : ''} onClick={() => { setDraftPerceived(draftPerceived === level ? undefined : level); setNoteSaved(false); }}>{level === 'easier' ? 'Easier than expected' : level === 'expected' ? 'About as expected' : 'Harder than expected'}</button>)}</div></label>
      <label>Short note<input value={draftNote} placeholder="e.g. Rhodes felt muddier than piano today" onChange={event => { setDraftNote(event.target.value); setNoteSaved(false); }}/></label>
      <label>Heard something away from the app?<input value={draftObservation} placeholder="e.g. caught the bass inversion in a song on the way home" onChange={event => { setDraftObservation(event.target.value); setNoteSaved(false); }}/></label>
      <div className="replay-actions"><button className="submit-performance" disabled={!draftNote.trim() && !draftObservation.trim() && !draftPerceived} onClick={saveNote}>{noteSaved ? 'Saved' : 'Save note'}</button>{noteStore.for(sessionId) && <button onClick={() => { noteStore.remove(sessionId); setDraftNote(''); setDraftObservation(''); setDraftPerceived(undefined); setNoteSaved(false); setHistoryVersion(value => value + 1); }}>Remove note</button>}</div>
    </div>
    {entries.length > 0 && <><h3>Session journal</h3><p className="hint">Written from what was measured, one entry per session that produced evidence.</p><ol className="journal">{entries.slice(0, 8).map(entry => <li key={entry.sessionId}>{renderEntry(entry)}</li>)}</ol></>}
    {calibrationBands.length > 0 && <><h3>Confidence calibration</h3><p className="hint">Well calibrated means accuracy climbs with confidence. A high-confidence band scoring low is the useful signal.</p><div className="buckets">{calibrationBands.map(band => <div className="bucket" key={band.confidence}><b>{band.confidence === 'guess' ? 'Guessing' : band.confidence === 'unsure' ? 'Fairly sure' : 'Certain'}</b><span>{Math.round(band.accuracy * 100)}% over {band.attempts}</span></div>)}</div></>}
    {Object.keys(buckets).length > 0 && <><h3>Where you stand</h3><div className="buckets">{(['Needs work', 'Improving', 'Stagnant', 'Now reliable'] as Bucket[]).filter(bucket => buckets[bucket]?.length).map(bucket => <div className={`bucket ${bucket.replaceAll(' ', '-').toLowerCase()}`} key={bucket}><b>{bucket}</b>{buckets[bucket]!.map(exercise => <span key={exercise}>{exercise.replaceAll('-', ' ')}</span>)}</div>)}</div></>}
    <h3>Skill evidence</h3>{skills.length ? skills.map(skill => { const state = stateFor(skill.exercise); return <button className="skill-row" onClick={() => setSelectedSkill(skill.exercise)} key={skill.exercise}><div><b>{skill.exercise.replaceAll('-', ' ')}</b><small>{state?.mastery ?? skill.mastery} · {skill.attempts} attempts · median {(skill.medianLatencyMs / 1000).toFixed(1)}s</small>{state && <small className="envelope-line">{envelopeSummary(state)}</small>}</div><div className="comparison"><span>{Math.round(skill.earlierAccuracy * 100)}%</span><i>then → now</i><span>{Math.round(skill.recentAccuracy * 100)}%</span></div></button>; }) : <p className="empty">Complete a few prompts to build your journal.</p>}
    {skillDetail && <div className="skill-detail"><button aria-label="Close skill detail" onClick={() => setSelectedSkill(undefined)}>×</button><p className="eyebrow">SKILL DETAIL</p><h3>{skillDetail.exercise.replaceAll('-', ' ')}</h3><p>{detailState?.mastery ?? skillDetail.mastery} from {skillDetail.attempts} raw attempts at {Math.round(skillDetail.accuracy * 100)}% overall accuracy.</p>
      <b>Compatible Then vs Now</b><p>{Math.round(skillDetail.earlierAccuracy * 100)}% → {Math.round(skillDetail.recentAccuracy * 100)}% across {skillDetail.comparisonEvidence} attempts under the same difficulty conditions.</p>
      {detailState && <><b>Difficulty envelope</b><p className="hint">Reliability is tracked per condition and never averaged into one number.</p><div className="envelope-table">{detailState.envelope.cells.map(cell => <div className={`envelope-cell ${cell.reliable ? 'reliable' : cell.breakdown ? 'breakdown' : ''}`} key={`${cell.dimension}=${cell.value}`}><span className="cond">{cell.dimension} = {cell.value}</span><span className="figure">{Math.round(cell.accuracy * 100)}%</span><span className="figure">{(cell.medianLatencyMs / 1000).toFixed(1)}s</span><span className="figure">n={cell.attempts}</span><span className="verdict">{cell.reliable ? 'reliable' : cell.breakdown ? 'breaks down' : 'gathering'}</span></div>)}</div>
      <b>Generalization</b><div className="generalization">{detailState.generalization.map(item => <span className={item.generalized ? 'yes' : 'no'} key={item.dimension}>{item.dimension}: {item.valuesReliable}/{item.valuesSeen} reliable</span>)}</div>
      <b>Transfer</b><p>{detailState.transferAttempts ? `${Math.round(detailState.transferAccuracy * 100)}% across ${detailState.transferAttempts} real-music attempts, tracked separately from synthetic drills.` : 'No real-music evidence yet, so synthetic success is not yet evidence of transfer.'}</p>
      <b>Retention</b><p>{(() => { const probe = nextProbe(skillDetail.exercise); if (!probe) return 'No probe scheduled yet.'; const due = Date.parse(probe.dueAt); return due <= Date.now() ? `Probe due now, on a ${probe.intervalDays}-day interval.` : `Next probe in ${Math.max(1, Math.ceil((due - Date.now()) / 86400000))} day(s), on a ${probe.intervalDays}-day interval.`; })()}</p>
      {detailState.confusions.length > 0 && <><b>Directional confusions</b><div className="confusions">{detailState.confusions.slice(0, 5).map(item => <span key={`${item.expected}-${item.answered}`}>{item.expected} → {item.answered} <b>{item.weightedCount.toFixed(1)}</b> <i className={`trend ${item.trend}`}>{item.trend}</i></span>)}</div><p className="hint">Weighted counts decay over about two weeks, so a confusion you have fixed stops driving practice.</p></>}</>}
      <details><summary>Difficulty evidence</summary><code>{skillDetail.condition}</code></details></div>}
    {confusions.length > 0 && <><h3>Recent confusions</h3><div className="confusions">{confusions.map(item => <span key={item.pair}>{item.pair} <b>×{item.count}</b></span>)}</div></>}{milestones.length > 0 && <><h3>Capabilities demonstrated</h3>{milestones.map(item => <article className="milestone" key={item.skill}><b>{item.label}</b><span>{item.statement}</span><small>Traceable to {item.evidenceCount} attempts</small></article>)}</>}</section>}
  {page === 'Settings' && <section className="panel settings"><DataPanel onRestored={() => { setHistoryVersion(value => value + 1); setProfileId(profileStore.get()); setPlan([]); setPlanIndex(0); }}/><h2>Custom drill</h2><label>Root pool<select value={config.rootPool} onChange={event => next({ ...config, rootPool: event.target.value as DrillConfig['rootPool'] })}><option value="all">All 12 roots</option><option value="white">Natural-note roots</option></select></label><label>Register<select value={config.register} onChange={event => next({ ...config, register: event.target.value as DrillConfig['register'] })}><option value="random">Random</option><option value="low">Low</option><option value="middle">Middle</option><option value="high">High</option></select></label><label>Timbre<select value={config.timbre} onChange={event => next({ ...config, timbre: event.target.value as DrillConfig['timbre'] })}><option value="piano">Acoustic piano</option><option value="rhodes">Rhodes electric piano</option><option value="organ">Warm organ</option><option value="guitar">Guitar</option><option value="strings">Strings</option><option value="pad">Synth pad</option></select></label><label>Response deadline<select value={config.deadline ?? 'none'} onChange={event => next({ ...config, deadline: event.target.value as DrillConfig['deadline'] })}><option value="none">Untimed</option><option value="8">8 seconds</option><option value="5">5 seconds</option><option value="3">3 seconds</option></select></label><label>Memory delay<select value={config.memoryDelay ?? 'none'} onChange={event => next({ ...config, memoryDelay: event.target.value as DrillConfig['memoryDelay'] })}><option value="none">Adjacent</option><option value="short">Short gap</option><option value="long">Long gap</option></select></label><label><input type="checkbox" checked={config.confidence ?? false} onChange={event => next({ ...config, confidence: event.target.checked })}/> Ask how confident I am — tracks calibration</label><label><input type="checkbox" checked={config.blind ?? false} onChange={event => next({ ...config, blind: event.target.checked })}/> Blind mode — hide note names, spelling and keyboards</label><label>Presentation<select value={config.presentation ?? 'block'} onChange={event => next({ ...config, presentation: event.target.value as DrillConfig['presentation'] })}><option value="block">Block chords</option><option value="arpeggiated">Arpeggiated</option></select></label><label>Exposure<select value={config.exposure ?? 'sustained'} onChange={event => next({ ...config, exposure: event.target.value as DrillConfig['exposure'] })}><option value="sustained">Sustained</option><option value="short">Short (0.28s)</option></select></label><label>Rhythm<select value={config.rhythm ?? 'steady'} onChange={event => next({ ...config, rhythm: event.target.value as DrillConfig['rhythm'] })}><option value="steady">Single hit</option><option value="syncopated">Syncopated pattern</option></select></label>{config.kind === 'scale-degree' && <label>Degree vocabulary<select value={config.vocabulary ?? 'diatonic'} onChange={event => next({ ...config, vocabulary: event.target.value as DrillConfig['vocabulary'] })}><option value="diatonic">Diatonic (7 degrees)</option><option value="chromatic">Chromatic (all 12)</option></select></label>}{(config.kind === 'triad' || config.kind === 'seventh') && <label><input type="checkbox" checked={config.inversions} onChange={event => next({ ...config, inversions: event.target.checked })}/> Include inversions</label>}{config.kind === 'interval' && <label><input type="checkbox" checked={config.melodic} onChange={event => next({ ...config, melodic: event.target.checked })}/> Play notes melodically</label>}<button className="danger" onClick={() => { attemptStore.clear(); sessionStore.clear(); transcriptionStore.clear(); noteStore.clear(); retentionStore.clear(); diagnosticStore.clear(); setPlan([]); setPlanIndex(0); setHistoryVersion(value => value + 1); }}>Clear local history</button><p className="hint">Removes attempts, sessions, notes, retention probes and diagnostic results from this device. Your genre profile is a setting, so it stays. Export first if you want to keep any of it.</p></section>}
  </main></div>;
}
