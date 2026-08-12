import { useEffect, useMemo, useRef, useState } from 'react';
import { AudioEngine } from './audio';
import { estimatePitch, isPitchCorrect, type PitchEstimate } from './pitchDetection';
import { NOTE_NAMES, pitch } from './theory';

export function SingingLab() {
  const targetMidi = 60; const [tolerance, setTolerance] = useState(35); const [estimate, setEstimate] = useState<PitchEstimate>();
  const [status, setStatus] = useState<'idle' | 'listening' | 'denied'>('idle'); const cleanup = useRef<() => void>(() => undefined); const audio = useMemo(() => new AudioEngine(), []);
  const grade = isPitchCorrect(estimate, targetMidi, tolerance);
  useEffect(() => () => cleanup.current(), []);
  async function listen() {
    cleanup.current();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false } });
      const context = new AudioContext(); const source = context.createMediaStreamSource(stream); const analyser = context.createAnalyser();
      analyser.fftSize = 4096; source.connect(analyser); const buffer = new Float32Array(analyser.fftSize); let frame = 0;
      const sample = () => { analyser.getFloatTimeDomainData(buffer); setEstimate(estimatePitch(buffer, context.sampleRate)); frame = requestAnimationFrame(sample); };
      cleanup.current = () => { cancelAnimationFrame(frame); stream.getTracks().forEach(track => track.stop()); void context.close(); setStatus('idle'); };
      setStatus('listening'); sample();
    } catch { setStatus('denied'); }
  }
  return <><section className="hero"><div><span className="tag">SINGING &amp; INTONATION</span><h2>Match the pitch</h2><p>Hear the reference, sing it back, and receive confidence-aware feedback from your microphone.</p></div><div className="evidence"><small>Target</small><b>{NOTE_NAMES[targetMidi % 12]}4 · MIDI {targetMidi}</b><span>Detector failures are never graded as errors</span></div></section><section className="panel singing-panel"><button className="listen compact" onClick={() => void audio.play([pitch(targetMidi)])} aria-label="Play reference pitch"><span>▶</span></button><h3>Sing C4</h3><div className={`pitch-meter ${grade === true ? 'in-tune' : grade === false ? 'out-of-tune' : ''}`}><strong>{estimate ? NOTE_NAMES[estimate.midi % 12] : '—'}</strong><span>{estimate ? `${estimate.cents > 0 ? '+' : ''}${estimate.cents} cents` : 'Waiting for a stable pitch'}</span><div><i style={{ left: `${Math.max(0, Math.min(100, 50 + (estimate?.cents ?? 0) / 2))}%` }}/></div></div><button className="submit-performance" onClick={() => status === 'listening' ? cleanup.current() : void listen()}>{status === 'listening' ? 'Stop listening' : 'Start microphone'}</button>{status === 'denied' && <p className="detector-note">Microphone access is unavailable. No attempt was recorded.</p>}<label className="tolerance">Pitch tolerance <input type="range" min="10" max="75" value={tolerance} onChange={event => setTolerance(Number(event.target.value))}/><b>±{tolerance} cents</b></label>{estimate && <p className="detector-note">{grade === undefined ? 'Hold a steadier tone so the detector can grade confidently.' : grade ? 'In tune — hold that center.' : estimate.midi < targetMidi || (estimate.midi === targetMidi && estimate.cents < 0) ? 'A little low — gently raise the pitch.' : 'A little high — gently lower the pitch.'} Confidence {Math.round(estimate.confidence * 100)}%</p>}</section></>;
}
