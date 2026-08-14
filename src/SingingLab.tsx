import { useEffect, useMemo, useRef, useState } from 'react';
import { AudioEngine } from './audio';
import { estimatePitch, type PitchEstimate } from './pitchDetection';
import { centsFromTarget, generateProduction, gradeProduction, noteLabel, type ProductionKind } from './production';
import { attemptStore } from './storage';
import { NOTE_NAMES, pitch } from './theory';
import { Screen, ScreenBody, ScreenHead } from './ui';

type Mode = 'match' | ProductionKind;
const MODES: { id: Mode; label: string }[] = [
  { id: 'match', label: 'Pitch match' },
  { id: 'scale-degree-production', label: 'Sing a degree' },
  { id: 'interval-production', label: 'Sing an interval' },
  { id: 'chord-tone-production', label: 'Sing a chord tone' },
  { id: 'guide-tone-production', label: 'Sing guide tones' },
  { id: 'root-motion-production', label: 'Sing the root motion' },
];

export function SingingLab({ sessionId, onEvidence }: { sessionId: string; onEvidence: () => void }) {
  const [mode, setMode] = useState<Mode>('match');
  const [seed, setSeed] = useState(() => Date.now());
  const [tolerance, setTolerance] = useState(35);
  const [estimate, setEstimate] = useState<PitchEstimate>();
  const [status, setStatus] = useState<'idle' | 'listening' | 'denied'>('idle');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [result, setResult] = useState<{ correct: boolean | undefined; cents: number | undefined }>();
  const cleanup = useRef<() => void>(() => undefined);
  const started = useRef(Date.now());
  const audio = useMemo(() => new AudioEngine(), []);

  const prompt = useMemo(() => mode === 'match' ? undefined : generateProduction(seed, mode), [seed, mode]);
  const targetMidi = prompt ? prompt.targetMidi : 60;
  const live = estimate ? centsFromTarget(estimate, targetMidi, true) : undefined;
  const grade = gradeProduction(estimate, targetMidi, tolerance, true);

  useEffect(() => () => cleanup.current(), []);

  /** Clears the previous reading so a stale pitch cannot be graded against a new prompt. */
  function restart(changes: { mode?: Mode; seed?: number } = {}) {
    if (changes.mode !== undefined) setMode(changes.mode);
    setSeed(changes.seed ?? (value => value + 1));
    setEstimate(undefined); setResult(undefined); started.current = Date.now();
  }

  async function listen() {
    cleanup.current();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false } });
      const context = new AudioContext(); const source = context.createMediaStreamSource(stream); const analyser = context.createAnalyser();
      analyser.fftSize = 4096; source.connect(analyser); const buffer = new Float32Array(analyser.fftSize); let frame = 0;
      const sample = () => { analyser.getFloatTimeDomainData(buffer); setEstimate(estimatePitch(buffer, context.sampleRate)); frame = requestAnimationFrame(sample); };
      cleanup.current = () => { cancelAnimationFrame(frame); stream.getTracks().forEach(track => track.stop()); void context.close(); setStatus('idle'); };
      setStatus('listening'); sample();
    } catch (error) { console.warn('Microphone unavailable', error); setStatus('denied'); }
  }

  function commit() {
    if (!prompt) return;
    // An unconfident detector reading is recorded as no evidence at all rather
    // than as a wrong answer.
    setResult({ correct: grade, cents: live });
    if (grade === undefined) return;
    attemptStore.add({
      id: crypto.randomUUID(), sessionId, timestamp: new Date().toISOString(), exercise: prompt.kind,
      stimulus: { tonicMidi: prompt.tonicMidi, targetMidi: prompt.targetMidi, instruction: prompt.instruction },
      expected: prompt.answer, response: estimate ? `${noteLabel(estimate.midi)} ${live! >= 0 ? '+' : ''}${live}c` : 'unclear',
      correct: grade, latencyMs: Date.now() - started.current,
      difficulty: { toleranceCents: tolerance, octaveEquivalent: 'yes', vocabulary: 'chromatic' },
      replayCount: 0, transferCategory: 'synthetic',
    });
    onEvidence();
  }

  const playReference = () => {
    if (!prompt) { void audio.play([pitch(60)]); return; }
    // Progression-based prompts need the whole harmonic context, not just one chord.
    if (prompt.contextChords) return void audio.playProgression(prompt.contextChords.map(notes => notes.map(pitch)));
    void audio.playProgression([prompt.contextNotes.map(pitch), prompt.referenceNotes.map(pitch)]);
  };

  const note = result
    ? result.correct === undefined ? 'The detector was not confident enough to grade that — nothing was recorded.'
      : result.correct ? `In tune — ${result.cents! > 0 ? '+' : ''}${result.cents} cents from ${prompt?.answer}.`
      : `That was ${result.cents! > 0 ? '+' : ''}${result.cents} cents from ${prompt?.answer}.`
    : !prompt && estimate
      ? `${grade === undefined ? 'Hold a steadier tone so the detector can grade confidently.' : grade ? 'In tune — hold that center.' : (live ?? 0) < 0 ? 'A little low — gently raise the pitch.' : 'A little high — gently lower the pitch.'} Confidence ${Math.round(estimate.confidence * 100)}%`
      : status === 'denied' ? 'Microphone access is unavailable. No attempt was recorded.'
      : 'Detector failures are never graded as errors.';

  return <Screen>
    <ScreenHead title="Singing" meta={mode === 'match' ? `${NOTE_NAMES[targetMidi % 12]}4` : prompt?.answer}/>
    <ScreenBody>
      {/* Six modes is more than a segmented control can hold legibly, so they use
          the same drop-down the practice screen uses for its drill list. */}
      <div className="drill-top">
        <button className="picker-trigger" aria-label="Choose a different singing drill" onClick={() => setPickerOpen(open => !open)}>
          <span>{MODES.find(item => item.id === mode)!.label}</span><span className="picker-caret">{pickerOpen ? '▲' : '▾'}</span>
        </button>
        {pickerOpen && <div className="kind-picker">{MODES.map(item => <button key={item.id} className={mode === item.id ? 'selected' : ''} onClick={() => { restart({ mode: item.id }); setPickerOpen(false); }}>{item.label}</button>)}</div>}
      </div>

      <div className="prompt">
        <button className="listen" onClick={playReference} aria-label="Play reference pitch">▶</button>
        <h2>{prompt ? prompt.instruction : 'Sing C4'}</h2>
        <p className="hint">{prompt ? `Reference: ${noteLabel(prompt.referenceNotes[0])}. Any octave is accepted.` : 'Hear the reference, sing it back.'}</p>
      </div>

      <div className={`pitch-meter ${grade === true ? 'in-tune' : ''}`}>
        <strong>{estimate ? NOTE_NAMES[estimate.midi % 12] : '—'}</strong>
        <span>{estimate && live !== undefined ? `${live > 0 ? '+' : ''}${live} cents` : 'Waiting for a stable pitch'}</span>
        <div className="bar"><i style={{ left: `${Math.max(0, Math.min(100, 50 + (live ?? 0) / 2))}%` }}/></div>
      </div>

      <p className="detector-note">{note}</p>

      <label className="check" style={{ display: 'flex', alignItems: 'center', gap: '.5rem', fontSize: '.72rem', color: 'var(--muted)' }}>
        Tolerance
        <input type="range" min="10" max="75" value={tolerance} onChange={event => setTolerance(Number(event.target.value))} style={{ flex: '1 1 auto', width: 'auto' }}/>
        <b style={{ color: 'var(--text)' }}>±{tolerance}c</b>
      </label>

      <div className="actions">
        <button className="ghost" onClick={() => status === 'listening' ? cleanup.current() : void listen()}>{status === 'listening' ? 'Stop listening' : 'Start microphone'}</button>
        {prompt && <>
          <button className="primary" disabled={status !== 'listening'} onClick={commit}>Commit this pitch</button>
          <button className="ghost" onClick={() => restart()}>New prompt →</button>
        </>}
      </div>
    </ScreenBody>
  </Screen>;
}
