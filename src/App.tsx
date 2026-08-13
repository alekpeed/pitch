import { useEffect, useMemo, useRef, useState } from 'react';
import { AudioEngine } from './audio';
import { capabilityMilestones, confusionPairs, summarizeSession, summarizeSkills } from './analytics';
import { adjustDrill, assembleSession, challengeSignal, configAtLevel, dashboardBucket, envelopeSummary, rankCatalog, skillStates, type Bucket, type SessionSlot } from './adaptive';
import { generateHarmony, harmonyAnswers, type HarmonyResponseMode } from './harmony';
import { probeSeed, retentionStore, scheduleProbe } from './retention';
import { attemptStore, sessionStore } from './storage';
import { answersFor, generateStimulus, RECOGNITION_KINDS, recommendKind, type DrillConfig, type ExerciseKind } from './training';
import { NOTE_NAMES, pitch } from './theory';
import { NoteMap } from './NoteMap';
import { DiagnosticLab } from './DiagnosticLab';
import { diagnosticStore } from './diagnostic';
import { transcriptionStore } from './transcription';
import { TranscriptionLab } from './TranscriptionLab';
import { VoicingLab } from './VoicingLab';
import { SingingLab } from './SingingLab';
import './styles.css';

type Page = 'Daily' | 'Diagnostic' | 'Practice' | 'Harmony' | 'Performance' | 'Transcription' | 'Singing' | 'Explore' | 'Progress' | 'Settings';
const DRILL_KINDS: ExerciseKind[] = [...RECOGNITION_KINDS];
const CATALOG = DRILL_KINDS.map(kind => `${kind}-recognition`);
const PRODUCTION = ['exact-voicing-copy', 'guide-tone-voice-leading', 'scale-degree-production', 'interval-production'];
const kindOf = (exercise: string) => DRILL_KINDS.find(kind => `${kind}-recognition` === exercise);
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
  // The prompt's start time is state, not a ref, because the countdown reads it
  // during render and refs must not be read there.
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const audio = useMemo(() => new AudioEngine(), []);
  const stimulus = useMemo(() => generateStimulus(seed, config), [seed, config]);
  const harmony = useMemo(() => generateHarmony(seed), [seed]);
  void historyVersion;
  const attempts = attemptStore.all();
  useEffect(() => { sessionStore.add({ id: sessionId, startedAt: new Date().toISOString(), mode: 'mixed' }); return () => sessionStore.finish(sessionId, new Date().toISOString()); }, [sessionId]);

  function next(nextConfig = config) {
    setConfig(nextConfig); setSeed(value => value + 1); setAnswer(undefined); setReplays(0); setStartedAt(Date.now());
  }
  function selectKind(kind: ExerciseKind) { next({ ...config, kind, melodic: kind === 'interval' ? config.melodic : false }); setPage('Practice'); }

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
  const ranked = rankCatalog({ catalog: CATALOG, states, retentionDue, pinned });

  /** Difficulty for one exercise, stepped toward the challenge zone. */
  function tunedConfig(exercise: string, base = config): DrillConfig {
    const kind = kindOf(exercise) ?? base.kind;
    const state = states.find(item => item.exercise === exercise);
    const seated = { ...base, kind, melodic: kind === 'interval' ? base.melodic : false };
    if (!state) {
      // No attempts yet: start from the diagnosed level rather than from scratch.
      const diagnosed = diagnosticStore.latest()?.levels[kind];
      return diagnosed === undefined ? seated : { ...configAtLevel(kind, diagnosed), kind };
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
      ranked: ranked.map(item => ({ exercise: item.exercise, config: tunedConfig(item.exercise), reason: item.reason })),
      growth: growthTarget ? { exercise: growthTarget, config: adjustDrill(tunedConfig(growthTarget), 'raise'), reason: 'Targeted growth at raised difficulty' } : undefined,
      production: PRODUCTION,
      transfer: ['transcription'],
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
    } else if (slot.exercise === 'transcription') setPage('Transcription');
    else setPage('Performance');
  }

  function advancePlan() {
    const nextIndex = planIndex + 1;
    if (nextIndex >= plan.length) { setPlan([]); setPlanIndex(0); setPage('Daily'); return; }
    openSlot(plan[nextIndex], nextIndex);
  }
  function submit(response: string) {
    if (answer) return;
    setAnswer(response);
    attemptStore.add({
      id: crypto.randomUUID(), sessionId, timestamp: new Date().toISOString(), exercise: `${config.kind}-recognition`,
      stimulus: { ...stimulus, timbre: config.timbre }, expected: stimulus.answer, response,
      correct: response === stimulus.answer, latencyMs: Date.now() - startedAt,
      difficulty: { rootPool: config.rootPool, inversions: config.inversions, register: config.register, timbre: config.timbre, presentation: config.presentation ?? (config.melodic ? 'melodic' : 'harmonic'), vocabulary: config.vocabulary ?? 'diatonic', exposure: config.exposure ?? 'sustained', rhythm: config.rhythm ?? 'steady', memoryDelay: config.memoryDelay ?? 'none', deadline: config.deadline ?? 'none' }, replayCount: replays,
      transferCategory: 'synthetic', retentionProbeId: activeSlot?.probeId
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
    const expected = harmonyMode === 'roman' ? harmony.roman : harmony.function;
    setAnswer(response);
    attemptStore.add({ id: crypto.randomUUID(), sessionId, timestamp: new Date().toISOString(), exercise: `harmony-${harmonyMode}`, stimulus: { ...harmony, timbre: 'piano' }, expected, response, correct: response === expected, latencyMs: Date.now() - startedAt, difficulty: { keys: 'all-12', responseMode: harmonyMode, progression: harmony.templateId }, replayCount: replays });
    setHistoryVersion(value => value + 1);
  }
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
  const nextProbe = (exercise: string) => probes.filter(probe => probe.exercise === exercise && !probe.completedAt).sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt))[0];
  const buckets = skills.reduce((groups, summary) => {
    const state = stateFor(summary.exercise);
    const bucket = state && dashboardBucket(state, summary);
    if (bucket) groups[bucket] = [...(groups[bucket] ?? []), summary.exercise];
    return groups;
  }, {} as Partial<Record<Bucket, string[]>>);

  return <div className="app"><aside><div className="brand"><span>PE</span><div>Perfect Ear<small>Musicianship studio</small></div></div><nav>{(['Daily', 'Diagnostic', 'Practice', 'Harmony', 'Performance', 'Transcription', 'Singing', 'Explore', 'Progress', 'Settings'] as Page[]).map(item => <button className={page === item ? 'active' : ''} onClick={() => { setPage(item); setAnswer(undefined); }} key={item}>{item}</button>)}</nav><div className="profile"><b>Local profile</b><small>Private · on this device</small></div></aside><main><header><div><p className="eyebrow">{plan.length ? `DAILY SESSION · ${planIndex + 1} OF ${plan.length}` : page === 'Practice' || page === 'Harmony' || page === 'Performance' || page === 'Transcription' ? 'TARGETED PRACTICE' : 'YOUR STUDIO'}</p><h1>{page}</h1></div><div className="session">{attempts.length} attempts recorded</div></header>
  {plan.length > 0 && activeSlot && <div className="session-bar"><div><b>{activeSlot.exercise.replaceAll('-', ' ')}</b><span className={`purpose ${activeSlot.purpose}`}>{activeSlot.purpose}</span><small>{activeSlot.reason}</small></div><div className="session-bar-actions"><button onClick={advancePlan}>{planIndex + 1 >= plan.length ? 'Finish session' : 'Skip item'}</button><button className="ghost" onClick={() => { setPlan([]); setPlanIndex(0); setPage('Daily'); }}>End session</button></div></div>}
  {page === 'Daily' && <><section className="hero"><div><span className="tag">TODAY</span><h2>What should I work on now?</h2><p>A session built from retention that is due, current weaknesses, one growth target at raised difficulty, production work, and real-music transfer.</p></div><div className="evidence"><small>Engine state</small><b>{retentionDue.length} retention probe{retentionDue.length === 1 ? '' : 's'} due</b><span>{states.length} skill{states.length === 1 ? '' : 's'} with evidence</span></div></section>
    {plan.length > 0 && <section className="panel"><h2>Session in progress</h2><ol className="plan">{plan.map((slot, index) => <li key={index} className={index === planIndex ? 'current' : index < planIndex ? 'done' : ''}><b>{slot.exercise.replaceAll('-', ' ')}</b><span className={`purpose ${slot.purpose}`}>{slot.purpose}</span><small>{slot.reason}</small></li>)}</ol><button className="submit-performance" onClick={() => openSlot(plan[planIndex], planIndex)}>Resume item {planIndex + 1} →</button><button onClick={() => { setPlan([]); setPlanIndex(0); }}>End session</button></section>}
    {plan.length === 0 && <section className="panel"><h2>Next up</h2><p>Ranked by evidence: weakness, recurring confusions, retention debt, and conditions you have not generalized to yet. Nothing here is locked — you can always practice anything directly.</p><ol className="plan">{ranked.slice(0, 5).map(item => <li key={item.exercise}><b>{item.exercise.replaceAll('-', ' ')}</b><span className="purpose weakness">{item.state ? item.state.mastery : 'new'}</span><small>{item.reason}</small><button onClick={() => setPinned(current => current.includes(item.exercise) ? current.filter(value => value !== item.exercise) : [...current, item.exercise])} className={pinned.includes(item.exercise) ? 'pinned' : ''}>{pinned.includes(item.exercise) ? 'Pinned' : 'Pin'}</button></li>)}</ol><button className="submit-performance" onClick={() => startDaily()}>Start 20-item session</button><button onClick={() => startDaily(10)}>Short session (10)</button></section>}</>}
  {page === 'Practice' && <><section className="hero"><div><span className="tag">CORE EAR TRAINING</span><h2>{config.kind.split('-').map(word => word[0].toUpperCase() + word.slice(1)).join(' ')} recognition</h2><p>Identify what you hear. Every prompt varies its root, register, and tone.</p></div><div className="evidence"><small>Current conditions</small><b>{config.rootPool === 'all' ? 'All 12 roots' : 'Natural roots'} · {config.register} register</b><label className="sound-picker">Keyboard sound<select aria-label="Keyboard sound" value={config.timbre} onChange={event => next({ ...config, timbre: event.target.value as DrillConfig['timbre'] })}><option value="piano">Acoustic piano</option><option value="rhodes">Rhodes</option><option value="organ">Warm organ</option><option value="guitar">Guitar</option><option value="strings">Strings</option><option value="pad">Synth pad</option></select></label></div></section><div className="mode-tabs">{DRILL_KINDS.map(kind => <button className={config.kind === kind ? 'selected' : ''} onClick={() => selectKind(kind)} key={kind}>{kind.replaceAll('-', ' ')}</button>)}</div><section className="drill"><button className="listen" aria-label="Play prompt" onClick={play} disabled={replaysSpent}><span>▶</span></button>{remainingMs !== undefined && <div className="deadline" role="timer"><i style={{ width: `${Math.max(0, Math.min(100, remainingMs / (deadlineMs ?? 1) * 100))}%` }}/><small>{(remainingMs / 1000).toFixed(1)}s to answer</small></div>}<h3>{stimulus.question ?? 'Listen, then choose'}</h3><p className="hint">{replayLimit !== undefined ? `One listen only — ${Math.max(0, replayLimit - replays)} left.` : 'Replay freely. Response time and replays are evidence, never penalties.'}</p><div className={`answers ${answersFor(config).length > 4 ? 'many' : ''}`}>{answersFor(config).map(option => <button key={option} onClick={() => submit(option)} className={answer ? (option === stimulus.answer ? 'correct' : option === answer ? 'wrong' : '') : ''}>{option}</button>)}</div>{answer && <div className="feedback"><div><b>{answer === 'timed out' ? `Out of time — this was ${stimulus.answer}.` : answer === stimulus.answer ? 'Correct — well heard.' : `This was ${stimulus.answer}.`}</b>{!config.blind && <span>{stimulus.explanation ?? `${NOTE_NAMES[stimulus.root % 12]} · ${stimulus.quality ?? (stimulus.inversion ? `inversion ${stimulus.inversion}` : 'root position')}`}</span>}{!config.blind && <NoteMap notes={stimulus.phrase ? stimulus.phrase.flat() : stimulus.notes} defining={stimulus.notes} label="What sounded"/>}</div><button onClick={() => plan.length ? advancePlan() : next()}>{plan.length ? (planIndex + 1 >= plan.length ? 'Finish session →' : 'Next item →') : 'Next prompt →'}</button></div>}</section></>}
  {page === 'Harmony' && <><section className="hero"><div><span className="tag">FUNCTIONAL HARMONY</span><h2>Progressions in key</h2><p>Hear common cadences, borrowed harmony, applied dominants, and substitutions in every key.</p></div><div className="evidence"><small>Established key</small><b>{NOTE_NAMES[harmony.keyPitchClass]} major</b><span>All 12 keys · Close voicing</span></div></section><div className="mode-tabs"><button className={harmonyMode === 'function' ? 'selected' : ''} onClick={() => { setHarmonyMode('function'); next(); }}>Function</button><button className={harmonyMode === 'roman' ? 'selected' : ''} onClick={() => { setHarmonyMode('roman'); next(); }}>Roman numerals</button></div><section className="drill"><button className="listen" aria-label="Play progression" onClick={() => { void audio.playProgression(harmony.chords.map(notes => notes.map(pitch))); setReplays(value => value + 1); }}><span>▶</span></button><h3>{harmonyMode === 'roman' ? 'Identify the exact progression' : 'Identify the harmonic function'}</h3><p className="hint">The displayed tonic establishes key context before you analyze the progression.</p><div className="answers harmony-answers">{harmonyAnswers(harmonyMode).map(option => { const expected = harmonyMode === 'roman' ? harmony.roman : harmony.function; return <button key={option} onClick={() => submitHarmony(option)} className={answer ? (option === expected ? 'correct' : option === answer ? 'wrong' : '') : ''}>{option}</button>; })}</div>{answer && <div className="feedback"><div><b>{answer === (harmonyMode === 'roman' ? harmony.roman : harmony.function) ? 'Correct — function resolved.' : `This was ${harmonyMode === 'roman' ? harmony.roman : harmony.function}.`}</b><span>{harmony.name} in {NOTE_NAMES[harmony.keyPitchClass]} major</span></div><button onClick={() => next()}>Next progression →</button></div>}</section></>}
  {page === 'Performance' && <VoicingLab sessionId={sessionId} onEvidence={() => setHistoryVersion(value => value + 1)}/>}
  {page === 'Transcription' && <TranscriptionLab sessionId={sessionId}/>}
  {page === 'Diagnostic' && <DiagnosticLab sessionId={sessionId} onEvidence={() => setHistoryVersion(value => value + 1)}/>}
  {page === 'Singing' && <SingingLab sessionId={sessionId} onEvidence={() => setHistoryVersion(value => value + 1)}/>}
  {page === 'Explore' && <section className="panel"><h2>Core curriculum</h2><p>Practice any skill directly. Nothing is locked.</p>{DRILL_KINDS.map(kind => <button className="curriculum" onClick={() => selectKind(kind)} key={kind}><b>{kind.replaceAll('-', ' ')}</b><span>Practice now →</span></button>)}<button className="recommend" onClick={() => selectKind(recommendKind(attempts))}>Practice recommended weak area</button></section>}
  {page === 'Progress' && <section className="panel"><h2>Evidence, not points</h2><p>Your current picture is calculated directly from immutable local attempts.</p><div className="stat"><strong>{attempts.length}</strong><span>Total attempts</span></div><div className="stat"><strong>{accuracy ?? '—'}{accuracy !== null && '%'}</strong><span>Accuracy</span></div><div className="session-card"><b>Current session summary</b><span>{sessionSummary.attempts} attempts · {sessionSummary.attempts ? `${Math.round(sessionSummary.accuracy * 100)}% accurate · median ${(sessionSummary.medianLatencyMs / 1000).toFixed(1)}s` : 'No evidence yet'}</span><small>{sessionSummary.focus.length ? `Focus: ${sessionSummary.focus.join(', ')}` : 'Your focus areas will appear here automatically.'}</small></div>
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
  {page === 'Settings' && <section className="panel settings"><h2>Custom drill</h2><label>Root pool<select value={config.rootPool} onChange={event => next({ ...config, rootPool: event.target.value as DrillConfig['rootPool'] })}><option value="all">All 12 roots</option><option value="white">Natural-note roots</option></select></label><label>Register<select value={config.register} onChange={event => next({ ...config, register: event.target.value as DrillConfig['register'] })}><option value="random">Random</option><option value="low">Low</option><option value="middle">Middle</option><option value="high">High</option></select></label><label>Timbre<select value={config.timbre} onChange={event => next({ ...config, timbre: event.target.value as DrillConfig['timbre'] })}><option value="piano">Acoustic piano</option><option value="rhodes">Rhodes electric piano</option><option value="organ">Warm organ</option><option value="guitar">Guitar</option><option value="strings">Strings</option><option value="pad">Synth pad</option></select></label><label>Response deadline<select value={config.deadline ?? 'none'} onChange={event => next({ ...config, deadline: event.target.value as DrillConfig['deadline'] })}><option value="none">Untimed</option><option value="8">8 seconds</option><option value="5">5 seconds</option><option value="3">3 seconds</option></select></label><label>Memory delay<select value={config.memoryDelay ?? 'none'} onChange={event => next({ ...config, memoryDelay: event.target.value as DrillConfig['memoryDelay'] })}><option value="none">Adjacent</option><option value="short">Short gap</option><option value="long">Long gap</option></select></label><label><input type="checkbox" checked={config.blind ?? false} onChange={event => next({ ...config, blind: event.target.checked })}/> Blind mode — hide note names, spelling and keyboards</label><label>Presentation<select value={config.presentation ?? 'block'} onChange={event => next({ ...config, presentation: event.target.value as DrillConfig['presentation'] })}><option value="block">Block chords</option><option value="arpeggiated">Arpeggiated</option></select></label><label>Exposure<select value={config.exposure ?? 'sustained'} onChange={event => next({ ...config, exposure: event.target.value as DrillConfig['exposure'] })}><option value="sustained">Sustained</option><option value="short">Short (0.28s)</option></select></label><label>Rhythm<select value={config.rhythm ?? 'steady'} onChange={event => next({ ...config, rhythm: event.target.value as DrillConfig['rhythm'] })}><option value="steady">Single hit</option><option value="syncopated">Syncopated pattern</option></select></label>{config.kind === 'scale-degree' && <label>Degree vocabulary<select value={config.vocabulary ?? 'diatonic'} onChange={event => next({ ...config, vocabulary: event.target.value as DrillConfig['vocabulary'] })}><option value="diatonic">Diatonic (7 degrees)</option><option value="chromatic">Chromatic (all 12)</option></select></label>}{(config.kind === 'triad' || config.kind === 'seventh') && <label><input type="checkbox" checked={config.inversions} onChange={event => next({ ...config, inversions: event.target.checked })}/> Include inversions</label>}{config.kind === 'interval' && <label><input type="checkbox" checked={config.melodic} onChange={event => next({ ...config, melodic: event.target.checked })}/> Play notes melodically</label>}<button className="danger" onClick={() => { attemptStore.clear(); sessionStore.clear(); transcriptionStore.clear(); setHistoryVersion(value => value + 1); }}>Clear local history</button></section>}
  </main></div>;
}
