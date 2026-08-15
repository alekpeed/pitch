import { useMemo, useState } from 'react';
import { MAX_DIFFICULTY_LEVEL } from './adaptive';
import { AudioEngine } from './audio';
import {
  currentProbe, diagnosticComplete, diagnosticEstimate, diagnosticProgress, diagnosticStore,
  recordDiagnostic, startDiagnostic, type DiagnosticState,
} from './diagnostic';
import { playbackPlan, renderPlayback } from './playback';
import { attemptStore } from './storage';
import { answersFor, generateStimulus, RECOGNITION_KINDS } from './training';
import { Pager, Screen, ScreenBody, ScreenHead } from './ui';
import { titleCasable } from './display';

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

  /** The same decision the Practice screen makes — see playback.ts for why it is shared. */
  function play() {
    if (!probe || !stimulus) return;
    renderPlayback(audio, playbackPlan(stimulus, probe.config), probe.config.timbre);
  }

  const progress = state ? diagnosticProgress(state) : undefined;
  const previous = diagnosticStore.latest();
  const estimates = finished && state ? diagnosticEstimate(state) : [];

  return <Screen>
    <ScreenHead
      title="Diagnostic"
      meta={state ? (finished ? 'Complete' : `${progress!.answered} answered · ${progress!.remaining} open`) : previous ? `Last run ${new Date(previous.completedAt).toLocaleDateString()}` : 'Not yet taken'}
    />
    <ScreenBody>
      {!state && <>
        <p className="lede">A branching assessment that climbs fast where you are strong and probes locally where you slip. Each skill starts at a moderate difficulty; answer correctly and it skips ahead, miss one and it drops to find exactly where reliability stops. It estimates a difficulty envelope per skill, never a single level.</p>
        {previous
          ? <Pager items={Object.entries(previous.levels)} label="skills" className="grid" row={([exercise, level]) => <div className="stat" key={exercise}>
            <strong>{level}</strong>
            <span>{exercise.replaceAll('-', ' ')} of {MAX_DIFFICULTY_LEVEL}</span>
          </div>}/>
          : <div className="pager"><div className="pager-empty">Most skills settle in three to five prompts.</div></div>}
        <div className="actions"><button className="primary" onClick={begin}>{previous ? 'Recalibrate' : 'Start diagnostic'}</button></div>
      </>}

      {state && probe && stimulus && <div className={`drill ${titleCasable(answersFor(probe.config)) ? 'caps' : ''}`}>
        <div className="prompt">
          <button className="listen" aria-label="Play prompt" onClick={play}>▶</button>
          <span className="eyebrow">{probe.exercise.replaceAll('-', ' ')} · level {probe.level} of {MAX_DIFFICULTY_LEVEL}</span>
          <h2>{stimulus.question ?? 'Listen, then choose'}</h2>
          <p className="hint">No feedback until the end — this is measurement, not practice.</p>
        </div>
        <div className={`answers ${answersFor(probe.config).length > 10 ? 'dense' : ''}`}>{answersFor(probe.config).map(option => <button key={option} onClick={() => answer(option)}>{option}</button>)}</div>
      </div>}

      {finished && state && <>
        <p className="lede">Each skill is reported at the hardest level you demonstrated, with the conditions that go with it. Nothing here collapses into one score.</p>
        <Pager items={estimates} label="skills" row={estimate => <div className="row" key={estimate.exercise}>
          <b>{estimate.exercise.replaceAll('-', ' ')}</b>
          <span className="pill growth">level {estimate.level}/{MAX_DIFFICULTY_LEVEL}</span>
          <small>{estimate.ceilingKnown ? `Ceiling found in ${estimate.items} prompt${estimate.items === 1 ? '' : 's'}` : `No ceiling reached in ${estimate.items} prompts`} · {estimate.config.rootPool === 'all' ? 'all roots' : 'natural roots'} · {estimate.config.register} register · {estimate.config.timbre}{estimate.config.inversions ? ' · inversions' : ''}{estimate.config.exposure === 'short' ? ' · short exposure' : ''}{estimate.config.deadline !== 'none' ? ` · ${estimate.config.deadline}s deadline` : ''}</small>
        </div>}/>
        <div className="actions"><button className="primary" onClick={begin}>Run it again</button></div>
      </>}
    </ScreenBody>
  </Screen>;
}
