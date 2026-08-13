import { useMemo, useState } from 'react';
import { MAX_DIFFICULTY_LEVEL } from './adaptive';
import { AudioEngine } from './audio';
import {
  currentProbe, diagnosticComplete, diagnosticEstimate, diagnosticProgress, diagnosticStore,
  recordDiagnostic, startDiagnostic, type DiagnosticState,
} from './diagnostic';
import { attemptStore } from './storage';
import { pitch } from './theory';
import { answersFor, generateStimulus, RECOGNITION_KINDS } from './training';

export function DiagnosticLab({ sessionId, onEvidence }: { sessionId: string; onEvidence: () => void }) {
  const [state, setState] = useState<DiagnosticState>();
  const [seed, setSeed] = useState(() => Date.now());
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const audio = useMemo(() => new AudioEngine(), []);

  const probe = state && !diagnosticComplete(state) ? currentProbe(state) : undefined;
  const stimulus = useMemo(() => probe && generateStimulus(seed, probe.config), [seed, probe]);
  const finished = state ? diagnosticComplete(state) : false;

  function begin() {
    setState(startDiagnostic(RECOGNITION_KINDS, 5));
    setSeed(Date.now()); setStartedAt(Date.now());
  }

  function answer(response: string) {
    if (!state || !probe || !stimulus) return;
    const correct = response === stimulus.answer;
    attemptStore.add({
      id: crypto.randomUUID(), sessionId, timestamp: new Date().toISOString(), exercise: `${probe.exercise}-recognition`,
      stimulus: { ...stimulus, diagnosticLevel: probe.level }, expected: stimulus.answer, response, correct,
      latencyMs: Date.now() - startedAt,
      difficulty: { rootPool: probe.config.rootPool, register: probe.config.register, timbre: probe.config.timbre, inversions: probe.config.inversions, diagnostic: 'yes' },
      replayCount: 0, transferCategory: 'synthetic',
    });
    const next = recordDiagnostic(state, correct);
    setState(next); setSeed(value => value + 1); setStartedAt(Date.now());
    if (diagnosticComplete(next)) diagnosticStore.save(diagnosticEstimate(next));
    onEvidence();
  }

  const progress = state ? diagnosticProgress(state) : undefined;
  const previous = diagnosticStore.latest();

  return <><section className="hero"><div><span className="tag">DIAGNOSTIC</span><h2>Find your envelope</h2><p>A branching assessment that climbs fast where you are strong and probes locally where you slip. It estimates a difficulty envelope per skill, never a single level.</p></div><div className="evidence"><small>Status</small><b>{state ? (finished ? 'Complete' : `${progress!.answered} answered · ${progress!.remaining} skills open`) : previous ? 'Previously taken' : 'Not yet taken'}</b><span>{previous ? `Last run ${new Date(previous.completedAt).toLocaleDateString()}` : 'Results seed the adaptive engine'}</span></div></section>

    {!state && <section className="panel"><h2>Before you start</h2><p>Each skill starts at a moderate difficulty. Answer correctly and it jumps ahead, skipping material you clearly know; miss one and it drops to a nearby level to find exactly where reliability stops. Most skills settle in three to five prompts.</p>{previous && <div className="diagnostic-results">{Object.entries(previous.levels).map(([exercise, level]) => <div key={exercise}><b>{exercise.replaceAll('-', ' ')}</b><span>level {level} / {MAX_DIFFICULTY_LEVEL}</span></div>)}</div>}<button className="submit-performance" onClick={begin}>{previous ? 'Recalibrate' : 'Start diagnostic'}</button></section>}

    {state && probe && stimulus && <section className="drill"><button className="listen" aria-label="Play prompt" onClick={() => { if (stimulus.phrase) void audio.playProgression(stimulus.phrase.map(notes => notes.map(pitch)), probe.config.timbre, stimulus.gapSeconds); else void audio.play(stimulus.notes.map(pitch), stimulus.melodic ? .5 : 1.15, stimulus.melodic ?? false, probe.config.timbre); }}><span>▶</span></button>
      <p className="eyebrow">{probe.exercise.replaceAll('-', ' ')} · level {probe.level} of {MAX_DIFFICULTY_LEVEL}</p>
      <h3>{stimulus.question ?? 'Listen, then choose'}</h3>
      <p className="hint">No feedback until the end — this is measurement, not practice.</p>
      <div className={`answers ${answersFor(probe.config).length > 4 ? 'many' : ''}`}>{answersFor(probe.config).map(option => <button key={option} onClick={() => answer(option)}>{option}</button>)}</div>
    </section>}

    {finished && state && <section className="panel"><h2>Your difficulty envelope</h2><p>Each skill is reported at the hardest level you demonstrated, with the conditions that go with it. Nothing here collapses into one score.</p>
      <div className="diagnostic-results">{diagnosticEstimate(state).map(estimate => <div key={estimate.exercise}><b>{estimate.exercise.replaceAll('-', ' ')}</b><span>level {estimate.level} / {MAX_DIFFICULTY_LEVEL}</span><small>{estimate.ceilingKnown ? `Ceiling found in ${estimate.items} prompt${estimate.items === 1 ? '' : 's'}` : `No ceiling reached in ${estimate.items} prompts`}</small><small className="conditions">{estimate.config.rootPool === 'all' ? 'all roots' : 'natural roots'} · {estimate.config.register} register · {estimate.config.timbre}{estimate.config.inversions ? ' · inversions' : ''}{estimate.config.exposure === 'short' ? ' · short exposure' : ''}{estimate.config.deadline !== 'none' ? ` · ${estimate.config.deadline}s deadline` : ''}</small></div>)}</div>
      <button className="submit-performance" onClick={begin}>Run it again</button></section>}
  </>;
}
