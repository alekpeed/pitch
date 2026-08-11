import { useEffect, useMemo, useState } from 'react';
import { AudioEngine } from './audio';
import { attemptStore } from './storage';
import { NOTE_NAMES, pitch } from './theory';
import { generateVoicing, gradeMidiPerformance, guideToneVoicings, type GradingPolicy, type MidiNoteEvent, type VoicingStyle } from './voicing';

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
  const [result, setResult] = useState<ReturnType<typeof gradeMidiPerformance>>();
  const [midiStatus, setMidiStatus] = useState(() => 'requestMIDIAccess' in navigator ? 'Checking Web MIDI…' : 'Web MIDI unavailable · use the on-screen keyboard');
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
    void navigator.requestMIDIAccess().then(current => { if (!disposed) { connect(current); current.onstatechange = () => connect(current); } }).catch(() => setMidiStatus('MIDI permission unavailable · use the on-screen keyboard'));
    return () => { disposed = true; if (access) { access.onstatechange = null; access.inputs.forEach(input => { input.onmidimessage = null; }); } };
  }, []);

  function reset(nextRoot = root) { setEvents([]); setResult(undefined); setRoot(nextRoot); }
  function recordOnScreen(note: number) { setEvents(items => items.some(item => item.note === note) ? items : [...items, { note, velocity: 90, timeMs: items[0]?.timeMs ?? performance.now() }]); }
  function submit() {
    const grade = gradeMidiPerformance(events, expected, policy, tolerance); setResult(grade);
    attemptStore.add({ id: crypto.randomUUID(), sessionId, timestamp: new Date().toISOString(), exercise: mode === 'copy' ? 'exact-voicing-copy' : 'guide-tone-voice-leading', stimulus: { root, quality, style, expected, guideStep }, expected: expected.join(','), response: [...new Set(events.map(item => item.note))].join(','), correct: grade.correct, latencyMs: events.length ? Math.max(...events.map(item => item.timeMs)) - Math.min(...events.map(item => item.timeMs)) : 0, difficulty: { gradingPolicy: policy, timingToleranceMs: tolerance, range: 'MIDI 40–84', style }, replayCount: 0 }); onEvidence();
  }
  function next() { if (mode === 'guide' && guideStep < 2) setGuideStep(step => step + 1); else { setGuideStep(0); setRoot(value => (value + 5) % 12); } setEvents([]); setResult(undefined); }

  return <><section className="hero"><div><span className="tag">VOICING & PERFORMANCE</span><h2>{mode === 'copy' ? 'Exact voicing copy' : 'Guide-tone voice leading'}</h2><p>Hear the voicing, then reproduce it with MIDI or the accessible on-screen keyboard.</p></div><div className="evidence"><small>Input status</small><b>{midiStatus}</b><span>{policy} grading · {tolerance}ms roll tolerance</span></div></section><div className="mode-tabs"><button className={mode === 'copy' ? 'selected' : ''} onClick={() => { setMode('copy'); setGuideStep(0); reset(); }}>Voicing copy</button><button className={mode === 'guide' ? 'selected' : ''} onClick={() => { setMode('guide'); setGuideStep(0); reset(); }}>Guide tones</button></div><section className="panel performance-panel"><div className="performance-controls"><label>Style<select value={style} disabled={mode === 'guide'} onChange={event => { setStyle(event.target.value as VoicingStyle); reset(); }}>{styles.map(item => <option key={item}>{item}</option>)}</select></label><label>Chord<select value={quality} disabled={mode === 'guide'} onChange={event => { setQuality(event.target.value as typeof quality); reset(); }}>{qualities.map(item => <option key={item}>{item}</option>)}</select></label><label>Grading<select value={policy} onChange={event => { setPolicy(event.target.value as GradingPolicy); reset(); }}><option value="exact">Exact notes</option><option value="equivalent">Octave-equivalent</option></select></label><label>Roll tolerance<input type="number" min="30" max="3000" value={tolerance} onChange={event => setTolerance(Number(event.target.value))}/> ms</label></div><div className="performance-prompt"><span className="tag">{NOTE_NAMES[root]} {mode === 'guide' ? `major · ii–V–I · chord ${guideStep + 1}/3` : quality}</span><button className="listen compact" onClick={() => void audio.play(expected.map(pitch), 1.1)} aria-label="Play expected voicing"><span>▶</span></button><p>{mode === 'guide' ? 'Track the third and seventh with the smallest possible motion.' : `Copy the ${style} voicing exactly, or use octave equivalence when selected.`}</p></div><div className="midi-monitor"><b>Played notes</b><span>{events.length ? [...new Set(events.map(item => NOTE_NAMES[item.note % 12] + (Math.floor(item.note / 12) - 1)))].join(' · ') : 'Waiting for input…'}</span><button onClick={() => reset()}>Clear input</button></div><div className="keyboard" aria-label="On-screen MIDI keyboard">{Array.from({ length: 49 }, (_, index) => 36 + index).map(note => <button className={events.some(item => item.note === note) ? 'pressed' : ''} aria-label={`Play ${NOTE_NAMES[note % 12]} ${Math.floor(note / 12) - 1}`} onClick={() => recordOnScreen(note)} key={note}>{NOTE_NAMES[note % 12]}</button>)}</div><button className="submit-performance" disabled={!events.length || Boolean(result)} onClick={submit}>Grade performance</button>{result && <div className={`performance-result ${result.correct ? 'pass' : 'fail'}`}><b>{result.correct ? 'Voicing accepted.' : result.pitchCorrect ? 'Notes match, but the attack was too spread.' : 'Pitch content needs another pass.'}</b><span>Attack spread: {Math.round(result.timingSpreadMs)}ms / {tolerance}ms · Missing: {result.missing.join(', ') || 'none'} · Extra: {result.extra.join(', ') || 'none'}</span><button onClick={next}>{mode === 'guide' && guideStep < 2 ? 'Next chord →' : 'Next exercise →'}</button></div>}</section></>;
}
