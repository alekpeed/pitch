import { useMemo, useState } from 'react';
import { AudioEngine } from './audio';
import { NoteMap } from './NoteMap';
import {
  FRET_COUNT, fretToMidi, generateCall, generateFunctionalPrompt, gradeCall, GUITAR_TUNING,
  type CallKind,
} from './performance';
import { attemptStore } from './storage';
import { NOTE_NAMES, pitch } from './theory';

type Mode = 'call' | 'functional';
type Input = 'keyboard' | 'fretboard';
const CALL_KINDS: { id: CallKind; label: string }[] = [
  { id: 'melody', label: 'Melody' }, { id: 'bass', label: 'Bass phrase' },
  { id: 'chord', label: 'Chord' }, { id: 'voicing', label: 'Voicing' },
];

export function PerformLab({ sessionId, onEvidence }: { sessionId: string; onEvidence: () => void }) {
  const [mode, setMode] = useState<Mode>('call');
  const [callKind, setCallKind] = useState<CallKind>('melody');
  const [input, setInput] = useState<Input>('keyboard');
  const [seed, setSeed] = useState(() => Date.now());
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [played, setPlayed] = useState<number[]>([]);
  const [result, setResult] = useState<ReturnType<typeof gradeCall>>();
  const audio = useMemo(() => new AudioEngine(), []);

  const call = useMemo(() => generateCall(seed, callKind), [seed, callKind]);
  const functional = useMemo(() => generateFunctionalPrompt(seed), [seed]);
  const expected = mode === 'call' ? call.expected : functional.expected;
  const ordered = mode === 'call' ? call.ordered : false;

  function restart(changes: Partial<{ mode: Mode; callKind: CallKind; input: Input }> = {}) {
    if (changes.mode) setMode(changes.mode);
    if (changes.callKind) setCallKind(changes.callKind);
    if (changes.input) setInput(changes.input);
    setSeed(value => value + 1); setPlayed([]); setResult(undefined); setStartedAt(Date.now());
  }

  const strike = (note: number) => { setPlayed(current => [...current, note]); void audio.play([pitch(note)], .45); };

  const playCall = () => {
    if (mode !== 'call') return;
    if (call.ordered) return void audio.playLayers({ melody: call.expected.map(pitch) }, { gap: 1 });
    void audio.play(call.expected.map(pitch), 1.4);
  };

  function submit() {
    const graded = gradeCall({ ...call, expected, ordered }, played);
    setResult(graded);
    attemptStore.add({
      id: crypto.randomUUID(), sessionId, timestamp: new Date().toISOString(),
      exercise: mode === 'call' ? `call-response-${callKind}` : 'functional-performance',
      stimulus: mode === 'call' ? { label: call.label, expected } : { instruction: functional.instruction, expected },
      expected: expected.join(' '), response: played.join(' '), correct: graded.correct,
      latencyMs: Date.now() - startedAt,
      difficulty: { input, ordered, octaveEquivalent: 'yes', notes: expected.length },
      replayCount: 0, transferCategory: 'synthetic',
    });
    onEvidence();
  }

  const keys = Array.from({ length: 37 }, (_, index) => 48 + index);

  return <><section className="hero"><div><span className="tag">PERFORMANCE</span><h2>{mode === 'call' ? 'Call and response' : 'Play it by function'}</h2><p>{mode === 'call' ? 'The app plays; you reproduce it. Melodic calls are graded in order, simultaneous ones as a set, because a chord has no inherent note order.' : 'Instructions are given functionally rather than as note names, so the theory has to be turned into sound.'}</p></div><div className="evidence"><small>{mode === 'call' ? 'Call' : 'Prompt'}</small><b>{mode === 'call' ? call.label : functional.label}</b><span>Any octave accepted</span></div></section>

    <div className="mode-tabs">
      <button className={mode === 'call' ? 'selected' : ''} onClick={() => restart({ mode: 'call' })}>Call and response</button>
      <button className={mode === 'functional' ? 'selected' : ''} onClick={() => restart({ mode: 'functional' })}>Functional prompts</button>
    </div>

    <section className="panel performance-panel">
      <div className="performance-controls">
        {mode === 'call' && <label>Call type<select value={callKind} onChange={event => restart({ callKind: event.target.value as CallKind })}>{CALL_KINDS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>}
        <label>Input<select value={input} onChange={event => restart({ input: event.target.value as Input })}><option value="keyboard">Keyboard</option><option value="fretboard">Guitar fretboard</option></select></label>
      </div>

      {mode === 'call'
        ? <><button className="listen" aria-label="Play the call" onClick={playCall}><span>▶</span></button><h3>{call.instruction}</h3></>
        : <h3>{functional.instruction}</h3>}
      <p className="hint">{mode === 'call' ? 'Listen, then play it back.' : 'No reference is played — this is production from theory.'}</p>

      <div className="midi-monitor"><b>You played</b><span>{played.length ? played.map(note => `${NOTE_NAMES[note % 12]}${Math.floor(note / 12) - 1}`).join(' · ') : 'Nothing yet.'}</span><button onClick={() => setPlayed([])}>Clear</button></div>

      {input === 'keyboard'
        ? <div className="keyboard" aria-label="On-screen keyboard">{keys.map(note => <button key={note} disabled={Boolean(result)} aria-label={`Play ${NOTE_NAMES[note % 12]}`} onClick={() => strike(note)}>{NOTE_NAMES[note % 12]}</button>)}</div>
        : <div className="fretboard" aria-label="Guitar fretboard, standard tuning">{[...GUITAR_TUNING].map((open, stringIndex) => <div className="string" key={stringIndex}>
            <span className="open-label">{NOTE_NAMES[open % 12]}</span>
            {Array.from({ length: FRET_COUNT + 1 }, (_, fret) => <button key={fret} disabled={Boolean(result)} aria-label={`String ${stringIndex + 1} fret ${fret}`} onClick={() => strike(fretToMidi(stringIndex, fret))}>{fret === 0 ? '○' : fret}</button>)}
          </div>).reverse()}</div>}

      <div className="replay-actions">
        <button className="submit-performance" disabled={!played.length || Boolean(result)} onClick={submit}>Grade performance</button>
        <button onClick={() => restart()}>{mode === 'call' ? 'New call →' : 'New prompt →'}</button>
      </div>

      {result && <div className={`performance-result ${result.correct ? 'pass' : 'fail'}`}>
        <b>{result.correct ? 'Reproduced.' : `${result.matched} of ${result.total} right.`}</b>
        <span>{ordered ? 'Graded in order' : 'Graded as a set'} · any octave accepted</span>
        <NoteMap notes={expected} defining={expected.filter((note, index) => !result.perItem[index])} label="Expected — missed notes highlighted"/>
        <button onClick={() => restart()}>Next →</button>
      </div>}
    </section></>;
}
