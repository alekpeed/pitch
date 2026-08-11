import { useMemo, useRef, useState } from 'react';
import { AudioEngine } from './audio';
import { confusionPairs, summarizeSkills } from './analytics';
import { attemptStore } from './storage';
import { ANSWERS, generateStimulus, recommendKind, type DrillConfig, type ExerciseKind } from './training';
import { NOTE_NAMES, pitch } from './theory';
import './styles.css';

type Page = 'Practice' | 'Explore' | 'Progress' | 'Settings';
const initialConfig: DrillConfig = { kind: 'triad', rootPool: 'all', inversions: true, melodic: false };

export default function App() {
  const [page, setPage] = useState<Page>('Practice');
  const [config, setConfig] = useState(initialConfig);
  const [seed, setSeed] = useState(() => Date.now());
  const [answer, setAnswer] = useState<string>();
  const [replays, setReplays] = useState(0);
  const [historyVersion, setHistoryVersion] = useState(0);
  const started = useRef(Date.now());
  const audio = useMemo(() => new AudioEngine(), []);
  const stimulus = useMemo(() => generateStimulus(seed, config), [seed, config]);
  void historyVersion;
  const attempts = attemptStore.all();

  function next(nextConfig = config) {
    setConfig(nextConfig); setSeed(value => value + 1); setAnswer(undefined); setReplays(0); started.current = Date.now();
  }
  function selectKind(kind: ExerciseKind) { next({ ...config, kind, melodic: kind === 'interval' ? config.melodic : false }); setPage('Practice'); }
  function submit(response: string) {
    if (answer) return;
    setAnswer(response);
    attemptStore.add({
      id: crypto.randomUUID(), timestamp: new Date().toISOString(), exercise: `${config.kind}-recognition`,
      stimulus: { ...stimulus, timbre: 'triangle-piano' }, expected: stimulus.answer, response,
      correct: response === stimulus.answer, latencyMs: Date.now() - started.current,
      difficulty: { rootPool: config.rootPool, inversions: config.inversions, presentation: config.melodic ? 'melodic' : 'harmonic' }, replayCount: replays
    });
    setHistoryVersion(value => value + 1);
  }
  const play = () => { void audio.play(stimulus.notes.map(pitch), config.kind === 'interval' ? .55 : 1.15, config.kind === 'interval' && config.melodic); setReplays(value => value + 1); };
  const accuracy = attempts.length ? Math.round(attempts.filter(item => item.correct).length / attempts.length * 100) : null;
  const skills = summarizeSkills(attempts);
  const confusions = confusionPairs(attempts).slice(0, 3);

  return <div className="app"><aside><div className="brand"><span>PE</span><div>Perfect Ear<small>Musicianship studio</small></div></div><nav>{(['Practice', 'Explore', 'Progress', 'Settings'] as Page[]).map(item => <button className={page === item ? 'active' : ''} onClick={() => setPage(item)} key={item}>{item}</button>)}</nav><div className="profile"><b>Local profile</b><small>Private · on this device</small></div></aside><main><header><div><p className="eyebrow">{page === 'Practice' ? 'TARGETED PRACTICE' : 'YOUR STUDIO'}</p><h1>{page}</h1></div><div className="session">{attempts.length} attempts recorded</div></header>
  {page === 'Practice' && <><section className="hero"><div><span className="tag">CORE EAR TRAINING</span><h2>{config.kind === 'seventh' ? 'Seventh chords' : `${config.kind[0].toUpperCase()}${config.kind.slice(1)} recognition`}</h2><p>Identify what you hear. Every prompt varies its root and register.</p></div><div className="evidence"><small>Current conditions</small><b>{config.rootPool === 'all' ? 'All 12 roots' : 'Natural roots'} · {config.inversions ? 'All inversions' : 'Root position'}</b><span>Synthetic · Piano tone</span></div></section><div className="mode-tabs">{(['interval', 'triad', 'seventh'] as ExerciseKind[]).map(kind => <button className={config.kind === kind ? 'selected' : ''} onClick={() => selectKind(kind)} key={kind}>{kind}</button>)}</div><section className="drill"><button className="listen" aria-label="Play prompt" onClick={play}><span>▶</span></button><h3>Listen, then choose</h3><p className="hint">Replay freely. Response time and replays are evidence, never penalties.</p><div className={`answers ${config.kind === 'interval' ? 'many' : ''}`}>{ANSWERS[config.kind].map(option => <button key={option} onClick={() => submit(option)} className={answer ? (option === stimulus.answer ? 'correct' : option === answer ? 'wrong' : '') : ''}>{option}</button>)}</div>{answer && <div className="feedback"><div><b>{answer === stimulus.answer ? 'Correct — well heard.' : `This was ${stimulus.answer}.`}</b><span>{NOTE_NAMES[stimulus.root % 12]} · {stimulus.inversion ? `inversion ${stimulus.inversion}` : 'root position'}</span></div><button onClick={() => next()}>Next prompt →</button></div>}</section></>}
  {page === 'Explore' && <section className="panel"><h2>Core curriculum</h2><p>Practice any skill directly. Nothing is locked.</p>{(['interval', 'triad', 'seventh'] as ExerciseKind[]).map(kind => <button className="curriculum" onClick={() => selectKind(kind)} key={kind}><b>{kind === 'seventh' ? 'Seventh chords' : `${kind}s`}</b><span>Practice now →</span></button>)}<button className="recommend" onClick={() => selectKind(recommendKind(attempts))}>Practice recommended weak area</button></section>}
  {page === 'Progress' && <section className="panel"><h2>Evidence, not points</h2><p>Your current picture is calculated directly from immutable local attempts.</p><div className="stat"><strong>{attempts.length}</strong><span>Total attempts</span></div><div className="stat"><strong>{accuracy ?? '—'}{accuracy !== null && '%'}</strong><span>Accuracy</span></div><h3>Skill evidence</h3>{skills.length ? skills.map(skill => <article className="skill-row" key={skill.exercise}><div><b>{skill.exercise.replace('-', ' ')}</b><small>{skill.mastery} · {skill.attempts} attempts · median {(skill.medianLatencyMs / 1000).toFixed(1)}s</small></div><div className="comparison"><span>{Math.round(skill.earlierAccuracy * 100)}%</span><i>then → now</i><span>{Math.round(skill.recentAccuracy * 100)}%</span></div></article>) : <p className="empty">Complete a few prompts to build your journal.</p>}{confusions.length > 0 && <><h3>Recent confusions</h3><div className="confusions">{confusions.map(item => <span key={item.pair}>{item.pair} <b>×{item.count}</b></span>)}</div></>}</section>}
  {page === 'Settings' && <section className="panel settings"><h2>Custom drill</h2><label>Root pool<select value={config.rootPool} onChange={event => next({ ...config, rootPool: event.target.value as DrillConfig['rootPool'] })}><option value="all">All 12 roots</option><option value="white">Natural-note roots</option></select></label>{config.kind !== 'interval' && <label><input type="checkbox" checked={config.inversions} onChange={event => next({ ...config, inversions: event.target.checked })}/> Include inversions</label>}{config.kind === 'interval' && <label><input type="checkbox" checked={config.melodic} onChange={event => next({ ...config, melodic: event.target.checked })}/> Play notes melodically</label>}<button className="danger" onClick={() => { attemptStore.clear(); setHistoryVersion(value => value + 1); }}>Clear local history</button></section>}
  </main></div>;
}
