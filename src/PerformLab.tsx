import { useMemo, useState } from 'react';
import { AudioEngine } from './audio';
import { NoteMap } from './NoteMap';
import {
  FRET_COUNT, fretToMidi, generateCall, generateFunctionalPrompt, gradeCall, GUITAR_TUNING,
  type CallKind,
} from './performance';
import { attemptStore } from './storage';
import { NOTE_NAMES, pitch } from './theory';
import { Screen, ScreenBody, ScreenHead, Tabs } from './ui';

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

  return <Screen>
    <ScreenHead title="Perform" meta={mode === 'call' ? call.label : functional.label}/>
    <ScreenBody>
      <Tabs value={mode} onChange={value => restart({ mode: value })} options={[['call', 'Call and response'], ['functional', 'Functional prompts']]}/>

      <div className="fields" style={{ flex: '0 0 auto' }}>
        {mode === 'call' && <label>Call type<select value={callKind} onChange={event => restart({ callKind: event.target.value as CallKind })}>{CALL_KINDS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>}
        <label>Input<select value={input} onChange={event => restart({ input: event.target.value as Input })}><option value="keyboard">Keyboard</option><option value="fretboard">Guitar fretboard</option></select></label>
      </div>

      <div className="prompt">
        {mode === 'call' && <button className="listen" aria-label="Play the call" onClick={playCall}>▶</button>}
        <h2>{mode === 'call' ? call.instruction : functional.instruction}</h2>
        <p className="hint">{mode === 'call' ? 'Listen, then play it back. Any octave accepted.' : 'No reference is played — this is production from theory.'}</p>
      </div>

      <div className="midi-monitor">
        <b>You played</b>
        <span>{played.length ? played.map(note => `${NOTE_NAMES[note % 12]}${Math.floor(note / 12) - 1}`).join(' · ') : 'Nothing yet.'}</span>
        <button onClick={() => setPlayed([])}>Clear</button>
      </div>

      {/* Once graded the input surface is inert, so it gives its space back to
          the result instead of sitting there disabled. */}
      {!result && (input === 'keyboard'
        ? <div className="keyboard" aria-label="On-screen keyboard">{keys.map(note => <button key={note} aria-label={`Play ${NOTE_NAMES[note % 12]}`} onClick={() => strike(note)}>{NOTE_NAMES[note % 12]}</button>)}</div>
        : <div className="fretboard" aria-label="Guitar fretboard, standard tuning">{[...GUITAR_TUNING].map((open, stringIndex) => <div className="string" key={stringIndex}>
            <span className="open-label">{NOTE_NAMES[open % 12]}</span>
            {Array.from({ length: FRET_COUNT + 1 }, (_, fret) => <button key={fret} aria-label={`String ${stringIndex + 1} fret ${fret}`} onClick={() => strike(fretToMidi(stringIndex, fret))}>{fret === 0 ? '○' : fret}</button>)}
          </div>).reverse()}</div>)}

      {result
        ? <div className={`result ${result.correct ? 'pass' : 'fail'}`}>
          <div>
            <strong>{result.correct ? 'Reproduced' : `${result.matched} of ${result.total}`}</strong>
            <span>{ordered ? 'Graded in order' : 'Graded as a set'} · any octave accepted</span>
          </div>
          <div><NoteMap notes={expected} defining={expected.filter((_, index) => !result.perItem[index])} label="Expected — missed highlighted"/></div>
          <p><button className="primary" onClick={() => restart()}>Next →</button></p>
        </div>
        : <div className="actions end">
          <button className="ghost" onClick={() => restart()}>{mode === 'call' ? 'New call →' : 'New prompt →'}</button>
          <button className="primary" disabled={!played.length} onClick={submit}>Grade performance</button>
        </div>}
    </ScreenBody>
  </Screen>;
}
