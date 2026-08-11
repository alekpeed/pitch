import { useEffect, useMemo, useRef, useState } from 'react';
import { AudioEngine } from './audio';
import { capabilityMilestones, confusionPairs, summarizeSession, summarizeSkills } from './analytics';
import { generateHarmony, harmonyAnswers, type HarmonyResponseMode } from './harmony';
import { attemptStore, sessionStore } from './storage';
import { ANSWERS, generateStimulus, recommendKind, type DrillConfig, type ExerciseKind } from './training';
import { NOTE_NAMES, pitch } from './theory';
import { VoicingLab } from './VoicingLab';
import './styles.css';

type Page = 'Practice' | 'Harmony' | 'Performance' | 'Explore' | 'Progress' | 'Settings';
const initialConfig: DrillConfig = { kind: 'triad', rootPool: 'all', inversions: true, melodic: false, register: 'random', timbre: 'triangle' };

export default function App() {
  const [page, setPage] = useState<Page>(() => location.hash === '#performance' ? 'Performance' : 'Practice');
  const [config, setConfig] = useState(initialConfig);
  const [seed, setSeed] = useState(() => Date.now());
  const [answer, setAnswer] = useState<string>();
  const [replays, setReplays] = useState(0);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [harmonyMode, setHarmonyMode] = useState<HarmonyResponseMode>('function');
  const [sessionId] = useState(() => crypto.randomUUID());
  const [selectedSkill, setSelectedSkill] = useState<string>();
  const started = useRef(Date.now());
  const audio = useMemo(() => new AudioEngine(), []);
  const stimulus = useMemo(() => generateStimulus(seed, config), [seed, config]);
  const harmony = useMemo(() => generateHarmony(seed), [seed]);
  void historyVersion;
  const attempts = attemptStore.all();
  useEffect(() => { sessionStore.add({ id: sessionId, startedAt: new Date().toISOString(), mode: 'mixed' }); return () => sessionStore.finish(sessionId, new Date().toISOString()); }, [sessionId]);

  function next(nextConfig = config) {
    setConfig(nextConfig); setSeed(value => value + 1); setAnswer(undefined); setReplays(0); started.current = Date.now();
  }
  function selectKind(kind: ExerciseKind) { next({ ...config, kind, melodic: kind === 'interval' ? config.melodic : false }); setPage('Practice'); }
  function submit(response: string) {
    if (answer) return;
    setAnswer(response);
    attemptStore.add({
      id: crypto.randomUUID(), sessionId, timestamp: new Date().toISOString(), exercise: `${config.kind}-recognition`,
      stimulus: { ...stimulus, timbre: config.timbre }, expected: stimulus.answer, response,
      correct: response === stimulus.answer, latencyMs: Date.now() - started.current,
      difficulty: { rootPool: config.rootPool, inversions: config.inversions, register: config.register, timbre: config.timbre, presentation: config.melodic ? 'melodic' : 'harmonic' }, replayCount: replays
    });
    setHistoryVersion(value => value + 1);
  }
  function submitHarmony(response: string) {
    if (answer) return;
    const expected = harmonyMode === 'roman' ? harmony.roman : harmony.function;
    setAnswer(response);
    attemptStore.add({ id: crypto.randomUUID(), sessionId, timestamp: new Date().toISOString(), exercise: `harmony-${harmonyMode}`, stimulus: { ...harmony, timbre: 'triangle-piano' }, expected, response, correct: response === expected, latencyMs: Date.now() - started.current, difficulty: { keys: 'all-12', responseMode: harmonyMode, progression: harmony.templateId }, replayCount: replays });
    setHistoryVersion(value => value + 1);
  }
  const play = () => { if (stimulus.contextNotes) void audio.playProgression([stimulus.contextNotes.map(pitch), stimulus.notes.map(pitch)], config.timbre); else void audio.play(stimulus.notes.map(pitch), config.kind === 'interval' ? .55 : 1.15, config.kind === 'interval' && config.melodic, config.timbre); setReplays(value => value + 1); };
  const accuracy = attempts.length ? Math.round(attempts.filter(item => item.correct).length / attempts.length * 100) : null;
  const skills = summarizeSkills(attempts);
  const confusions = confusionPairs(attempts).slice(0, 3);
  const sessionSummary = summarizeSession(attempts, sessionId);
  const milestones = capabilityMilestones(attempts);
  const skillDetail = skills.find(skill => skill.exercise === selectedSkill);

  return <div className="app"><aside><div className="brand"><span>PE</span><div>Perfect Ear<small>Musicianship studio</small></div></div><nav>{(['Practice', 'Harmony', 'Performance', 'Explore', 'Progress', 'Settings'] as Page[]).map(item => <button className={page === item ? 'active' : ''} onClick={() => { setPage(item); setAnswer(undefined); }} key={item}>{item}</button>)}</nav><div className="profile"><b>Local profile</b><small>Private · on this device</small></div></aside><main><header><div><p className="eyebrow">{page === 'Practice' || page === 'Harmony' || page === 'Performance' ? 'TARGETED PRACTICE' : 'YOUR STUDIO'}</p><h1>{page}</h1></div><div className="session">{attempts.length} attempts recorded</div></header>
  {page === 'Practice' && <><section className="hero"><div><span className="tag">CORE EAR TRAINING</span><h2>{config.kind.split('-').map(word => word[0].toUpperCase() + word.slice(1)).join(' ')} recognition</h2><p>Identify what you hear. Every prompt varies its root, register, and tone.</p></div><div className="evidence"><small>Current conditions</small><b>{config.rootPool === 'all' ? 'All 12 roots' : 'Natural roots'} · {config.register} register</b><span>Synthetic · {config.timbre} tone</span></div></section><div className="mode-tabs">{(['scale-degree', 'interval', 'triad', 'seventh', 'bass'] as ExerciseKind[]).map(kind => <button className={config.kind === kind ? 'selected' : ''} onClick={() => selectKind(kind)} key={kind}>{kind}</button>)}</div><section className="drill"><button className="listen" aria-label="Play prompt" onClick={play}><span>▶</span></button><h3>Listen, then choose</h3><p className="hint">Replay freely. Response time and replays are evidence, never penalties.</p><div className={`answers ${ANSWERS[config.kind].length > 4 ? 'many' : ''}`}>{ANSWERS[config.kind].map(option => <button key={option} onClick={() => submit(option)} className={answer ? (option === stimulus.answer ? 'correct' : option === answer ? 'wrong' : '') : ''}>{option}</button>)}</div>{answer && <div className="feedback"><div><b>{answer === stimulus.answer ? 'Correct — well heard.' : `This was ${stimulus.answer}.`}</b><span>{NOTE_NAMES[stimulus.root % 12]} · {stimulus.quality ?? (stimulus.inversion ? `inversion ${stimulus.inversion}` : 'root position')}</span></div><button onClick={() => next()}>Next prompt →</button></div>}</section></>}
  {page === 'Harmony' && <><section className="hero"><div><span className="tag">FUNCTIONAL HARMONY</span><h2>Progressions in key</h2><p>Hear common cadences, borrowed harmony, applied dominants, and substitutions in every key.</p></div><div className="evidence"><small>Established key</small><b>{NOTE_NAMES[harmony.keyPitchClass]} major</b><span>All 12 keys · Close voicing</span></div></section><div className="mode-tabs"><button className={harmonyMode === 'function' ? 'selected' : ''} onClick={() => { setHarmonyMode('function'); next(); }}>Function</button><button className={harmonyMode === 'roman' ? 'selected' : ''} onClick={() => { setHarmonyMode('roman'); next(); }}>Roman numerals</button></div><section className="drill"><button className="listen" aria-label="Play progression" onClick={() => { void audio.playProgression(harmony.chords.map(notes => notes.map(pitch))); setReplays(value => value + 1); }}><span>▶</span></button><h3>{harmonyMode === 'roman' ? 'Identify the exact progression' : 'Identify the harmonic function'}</h3><p className="hint">The displayed tonic establishes key context before you analyze the progression.</p><div className="answers harmony-answers">{harmonyAnswers(harmonyMode).map(option => { const expected = harmonyMode === 'roman' ? harmony.roman : harmony.function; return <button key={option} onClick={() => submitHarmony(option)} className={answer ? (option === expected ? 'correct' : option === answer ? 'wrong' : '') : ''}>{option}</button>; })}</div>{answer && <div className="feedback"><div><b>{answer === (harmonyMode === 'roman' ? harmony.roman : harmony.function) ? 'Correct — function resolved.' : `This was ${harmonyMode === 'roman' ? harmony.roman : harmony.function}.`}</b><span>{harmony.name} in {NOTE_NAMES[harmony.keyPitchClass]} major</span></div><button onClick={() => next()}>Next progression →</button></div>}</section></>}
  {page === 'Performance' && <VoicingLab sessionId={sessionId} onEvidence={() => setHistoryVersion(value => value + 1)}/>}
  {page === 'Explore' && <section className="panel"><h2>Core curriculum</h2><p>Practice any skill directly. Nothing is locked.</p>{(['scale-degree', 'interval', 'triad', 'seventh', 'bass'] as ExerciseKind[]).map(kind => <button className="curriculum" onClick={() => selectKind(kind)} key={kind}><b>{kind.replace('-', ' ')}</b><span>Practice now →</span></button>)}<button className="recommend" onClick={() => selectKind(recommendKind(attempts))}>Practice recommended weak area</button></section>}
  {page === 'Progress' && <section className="panel"><h2>Evidence, not points</h2><p>Your current picture is calculated directly from immutable local attempts.</p><div className="stat"><strong>{attempts.length}</strong><span>Total attempts</span></div><div className="stat"><strong>{accuracy ?? '—'}{accuracy !== null && '%'}</strong><span>Accuracy</span></div><div className="session-card"><b>Current session summary</b><span>{sessionSummary.attempts} attempts · {sessionSummary.attempts ? `${Math.round(sessionSummary.accuracy * 100)}% accurate · median ${(sessionSummary.medianLatencyMs / 1000).toFixed(1)}s` : 'No evidence yet'}</span><small>{sessionSummary.focus.length ? `Focus: ${sessionSummary.focus.join(', ')}` : 'Your focus areas will appear here automatically.'}</small></div><h3>Skill evidence</h3>{skills.length ? skills.map(skill => <button className="skill-row" onClick={() => setSelectedSkill(skill.exercise)} key={skill.exercise}><div><b>{skill.exercise.replaceAll('-', ' ')}</b><small>{skill.mastery} · {skill.attempts} attempts · median {(skill.medianLatencyMs / 1000).toFixed(1)}s</small></div><div className="comparison"><span>{Math.round(skill.earlierAccuracy * 100)}%</span><i>then → now</i><span>{Math.round(skill.recentAccuracy * 100)}%</span></div></button>) : <p className="empty">Complete a few prompts to build your journal.</p>}{skillDetail && <div className="skill-detail"><button aria-label="Close skill detail" onClick={() => setSelectedSkill(undefined)}>×</button><p className="eyebrow">SKILL DETAIL</p><h3>{skillDetail.exercise.replaceAll('-', ' ')}</h3><p>{skillDetail.mastery} from {skillDetail.attempts} raw attempts at {Math.round(skillDetail.accuracy * 100)}% overall accuracy.</p><b>Compatible Then vs Now</b><p>{Math.round(skillDetail.earlierAccuracy * 100)}% → {Math.round(skillDetail.recentAccuracy * 100)}% across {skillDetail.comparisonEvidence} attempts under the same difficulty conditions.</p><details><summary>Difficulty evidence</summary><code>{skillDetail.condition}</code></details></div>}{confusions.length > 0 && <><h3>Recent confusions</h3><div className="confusions">{confusions.map(item => <span key={item.pair}>{item.pair} <b>×{item.count}</b></span>)}</div></>}{milestones.length > 0 && <><h3>Capabilities demonstrated</h3>{milestones.map(item => <article className="milestone" key={item.skill}><b>{item.label}</b><span>{item.statement}</span><small>Traceable to {item.evidenceCount} attempts</small></article>)}</>}</section>}
  {page === 'Settings' && <section className="panel settings"><h2>Custom drill</h2><label>Root pool<select value={config.rootPool} onChange={event => next({ ...config, rootPool: event.target.value as DrillConfig['rootPool'] })}><option value="all">All 12 roots</option><option value="white">Natural-note roots</option></select></label><label>Register<select value={config.register} onChange={event => next({ ...config, register: event.target.value as DrillConfig['register'] })}><option value="random">Random</option><option value="low">Low</option><option value="middle">Middle</option><option value="high">High</option></select></label><label>Timbre<select value={config.timbre} onChange={event => next({ ...config, timbre: event.target.value as DrillConfig['timbre'] })}><option value="triangle">Triangle</option><option value="sine">Sine</option><option value="sawtooth">Sawtooth</option></select></label>{(config.kind === 'triad' || config.kind === 'seventh') && <label><input type="checkbox" checked={config.inversions} onChange={event => next({ ...config, inversions: event.target.checked })}/> Include inversions</label>}{config.kind === 'interval' && <label><input type="checkbox" checked={config.melodic} onChange={event => next({ ...config, melodic: event.target.checked })}/> Play notes melodically</label>}<button className="danger" onClick={() => { attemptStore.clear(); sessionStore.clear(); setHistoryVersion(value => value + 1); }}>Clear local history</button></section>}
  </main></div>;
}
