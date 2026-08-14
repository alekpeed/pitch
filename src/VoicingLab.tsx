import { useEffect, useMemo, useState } from 'react';
import { AudioEngine } from './audio';
import { attemptStore } from './storage';
import { NOTE_NAMES, pitch } from './theory';
import { generateVoicing, gradeMidiPerformance, guideToneVoicings, type GradingPolicy, type MidiNoteEvent, type VoicingStyle } from './voicing';
import { Screen, ScreenBody, ScreenHead, Tabs } from './ui';

const styles: VoicingStyle[] = ['close', 'open', 'spread', 'drop-2', 'shell', 'rootless'];
const qualities = ['major 7', 'dominant 7', 'minor 7'] as const;

export function VoicingLab({ sessionId, onEvidence }: { sessionId: string; onEvidence: () => void }) {
  const [mode, setMode] = useState<'copy' | 'guide'>('copy');
  const [style, setStyle] = useState<VoicingStyle>('drop-2');
  const [quality, setQuality] = useState<(typeof qualities)[number]>('dominant 7');
  const [policy, setPolicy] = useState<GradingPolicy>('exact');
  const [tolerance, setTolerance] = useState(120);
  const [root, setRoot] = useState(0);
  const [guideStep, setGuideStep] = useState(0);
  const [events, setEvents] = useState<MidiNoteEvent[]>([]);
  const [setupOpen, setSetupOpen] = useState(false);
  const [result, setResult] = useState<ReturnType<typeof gradeMidiPerformance>>();
  const [midiStatus, setMidiStatus] = useState(() => 'requestMIDIAccess' in navigator ? 'Checking Web MIDI…' : 'No Web MIDI · use the keyboard');
  const audio = useMemo(() => new AudioEngine(), []);
  const guideVoicings = useMemo(() => guideToneVoicings(root), [root]);
  const expected = mode === 'copy' ? generateVoicing({ rootPitchClass: root, quality, style }) : guideVoicings[guideStep];

  useEffect(() => {
    let access: MIDIAccess | undefined; let disposed = false;
    const connect = (current: MIDIAccess) => {
      access = current; const inputs = [...current.inputs.values()]; setMidiStatus(inputs.length ? `Connected: ${inputs.map(input => input.name ?? 'MIDI input').join(', ')}` : 'MIDI ready · no input detected');
      inputs.forEach(input => { input.onmidimessage = event => { if (!event.data) return; const [status, note, velocity] = event.data; if ((status & 0xf0) === 0x90 && velocity > 0) setEvents(items => [...items, { note, velocity, timeMs: performance.now() }]); }; });
    };
    if (!('requestMIDIAccess' in navigator)) return;
    void navigator.requestMIDIAccess().then(current => { if (!disposed) { connect(current); current.onstatechange = () => connect(current); } }).catch(() => setMidiStatus('MIDI permission unavailable · use the keyboard'));
    return () => { disposed = true; if (access) { access.onstatechange = null; access.inputs.forEach(input => { input.onmidimessage = null; }); } };
  }, []);

  function reset(nextRoot = root) { setEvents([]); setResult(undefined); setRoot(nextRoot); }
  function recordOnScreen(note: number) { setEvents(items => items.some(item => item.note === note) ? items : [...items, { note, velocity: 90, timeMs: items[0]?.timeMs ?? performance.now() }]); }
  function submit() {
    const grade = gradeMidiPerformance(events, expected, policy, tolerance); setResult(grade);
    attemptStore.add({ id: crypto.randomUUID(), sessionId, timestamp: new Date().toISOString(), exercise: mode === 'copy' ? 'exact-voicing-copy' : 'guide-tone-voice-leading', stimulus: { root, quality, style, expected, guideStep }, expected: expected.join(','), response: [...new Set(events.map(item => item.note))].join(','), correct: grade.correct, latencyMs: events.length ? Math.max(...events.map(item => item.timeMs)) - Math.min(...events.map(item => item.timeMs)) : 0, difficulty: { gradingPolicy: policy, timingToleranceMs: tolerance, range: 'MIDI 40–84', style }, replayCount: 0 }); onEvidence();
  }
  function next() { if (mode === 'guide' && guideStep < 2) setGuideStep(step => step + 1); else { setGuideStep(0); setRoot(value => (value + 5) % 12); } setEvents([]); setResult(undefined); }

  return <Screen>
    <ScreenHead title="Performance" meta={midiStatus}/>
    <ScreenBody>
      <Tabs value={mode} onChange={value => { setMode(value); setGuideStep(0); reset(); }} options={[['copy', 'Voicing copy'], ['guide', 'Guide tones']]}/>

      {/* Grading settings are set once and then left alone, so they stay folded
          away rather than taking permanent height from the keyboard. */}
      <div className="actions">
        <button className="ghost" onClick={() => setSetupOpen(open => !open)}>Setup {setupOpen ? '▲' : '▾'}</button>
        <span className="screen-meta">{policy} grading · {tolerance}ms · {mode === 'copy' ? style : 'ii–V–I'}</span>
      </div>
      {setupOpen && <div className="fields" style={{ flex: '0 0 auto' }}>
        <label>Style<select value={style} disabled={mode === 'guide'} onChange={event => { setStyle(event.target.value as VoicingStyle); reset(); }}>{styles.map(item => <option key={item}>{item}</option>)}</select></label>
        <label>Chord<select value={quality} disabled={mode === 'guide'} onChange={event => { setQuality(event.target.value as typeof quality); reset(); }}>{qualities.map(item => <option key={item}>{item}</option>)}</select></label>
        <label>Grading<select value={policy} onChange={event => { setPolicy(event.target.value as GradingPolicy); reset(); }}><option value="exact">Exact notes</option><option value="equivalent">Octave-equivalent</option></select></label>
        <label>Roll tolerance (ms)<input type="number" min="30" max="3000" value={tolerance} onChange={event => setTolerance(Number(event.target.value))}/></label>
      </div>}

      <div className="prompt">
        <button className="listen" onClick={() => void audio.play(expected.map(pitch), 1.1)} aria-label="Play expected voicing">▶</button>
        <h2>{NOTE_NAMES[root]} {mode === 'guide' ? `· ii–V–I · chord ${guideStep + 1}/3` : quality}</h2>
        <p className="hint">{mode === 'guide' ? 'Track the third and seventh with the smallest possible motion.' : `Copy the ${style} voicing exactly, or use octave equivalence when selected.`}</p>
      </div>

      <div className="midi-monitor">
        <b>Played</b>
        <span>{events.length ? [...new Set(events.map(item => NOTE_NAMES[item.note % 12] + (Math.floor(item.note / 12) - 1)))].join(' · ') : 'Waiting for input…'}</span>
        <button onClick={() => reset()}>Clear</button>
      </div>

      {/* Once graded the keyboard is inert, so it gives its space back to the
          result instead of sitting there disabled. */}
      {!result && <div className="keyboard" aria-label="On-screen MIDI keyboard">{Array.from({ length: 49 }, (_, index) => 36 + index).map(note => <button className={events.some(item => item.note === note) ? 'pressed' : ''} aria-label={`Play ${NOTE_NAMES[note % 12]} ${Math.floor(note / 12) - 1}`} onClick={() => recordOnScreen(note)} key={note}>{NOTE_NAMES[note % 12]}</button>)}</div>}

      {result
        ? <div className={`result ${result.correct ? 'pass' : 'fail'}`}>
          <div>
            <strong>{result.correct ? 'Accepted' : result.pitchCorrect ? 'Too spread' : 'Wrong notes'}</strong>
            <span>Attack spread {Math.round(result.timingSpreadMs)}ms / {tolerance}ms · Missing: {result.missing.join(', ') || 'none'} · Extra: {result.extra.join(', ') || 'none'}</span>
          </div>
          <p><button className="primary" onClick={next}>{mode === 'guide' && guideStep < 2 ? 'Next chord →' : 'Next exercise →'}</button></p>
        </div>
        : <div className="actions end"><button className="primary" disabled={!events.length} onClick={submit}>Grade performance</button></div>}
    </ScreenBody>
  </Screen>;
}
