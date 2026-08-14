import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { gradeTranscription, parseBoundaries, parseHarmony, transcriptionStore, type LoopRegion, type TranscriptionAnswer, type TranscriptionGrade, type TranscriptionReference } from './transcription';
import { Screen, ScreenBody, ScreenHead, Tabs } from './ui';

interface AudioAsset { id: string; name: string; url: string; duration: number }
const emptyLoop = (assetId: string): LoopRegion => ({ assetId, startSeconds: 0, endSeconds: 0, playbackRate: 1 });
type Tab = 'audio' | 'answer' | 'reference';

export function TranscriptionLab({ sessionId }: { sessionId: string }) {
  const [asset, setAsset] = useState<AudioAsset>(); const [loop, setLoop] = useState<LoopRegion>(); const [loopEnabled, setLoopEnabled] = useState(true);
  const [harmony, setHarmony] = useState(''); const [boundaries, setBoundaries] = useState<number[]>([]); const [result, setResult] = useState<TranscriptionGrade>();
  const [submitted, setSubmitted] = useState(false); const [referenceHarmony, setReferenceHarmony] = useState(''); const [referenceBoundaries, setReferenceBoundaries] = useState('');
  const [tab, setTab] = useState<Tab>('audio');
  const audioRef = useRef<HTMLAudioElement>(null); const canvasRef = useRef<HTMLCanvasElement>(null); const fileRef = useRef<File | undefined>(undefined);

  useEffect(() => () => { if (asset) URL.revokeObjectURL(asset.url); }, [asset]);
  useEffect(() => {
    const file = fileRef.current; const canvas = canvasRef.current; if (!file || !canvas) return;
    let cancelled = false; const context = new AudioContext();
    void file.arrayBuffer().then(buffer => context.decodeAudioData(buffer)).then(decoded => {
      if (cancelled) return; const channel = decoded.getChannelData(0); const drawing = canvas.getContext('2d'); if (!drawing) return;
      const width = canvas.width; const height = canvas.height; const step = Math.max(1, Math.floor(channel.length / width)); drawing.clearRect(0, 0, width, height); drawing.fillStyle = '#12151d'; drawing.fillRect(0, 0, width, height); drawing.strokeStyle = '#9b8cfa'; drawing.beginPath();
      for (let x = 0; x < width; x += 1) { let min = 1; let max = -1; for (let index = 0; index < step; index += 1) { const value = channel[x * step + index] ?? 0; min = Math.min(min, value); max = Math.max(max, value); } drawing.moveTo(x, (1 + min) * height / 2); drawing.lineTo(x, (1 + max) * height / 2); } drawing.stroke();
    }).catch(() => undefined).finally(() => void context.close());
    return () => { cancelled = true; void context.close(); };
  }, [asset, tab]);

  function importAudio(file?: File) {
    if (!file) return; if (asset) URL.revokeObjectURL(asset.url); fileRef.current = file;
    const id = `${file.name}:${file.size}:${file.lastModified}`; const saved = transcriptionStore.loops().find(item => item.assetId === id); const url = URL.createObjectURL(file);
    setAsset({ id, name: file.name, url, duration: 0 }); setLoop(saved ?? emptyLoop(id)); setHarmony(''); setBoundaries([]); setResult(undefined); setSubmitted(false);
  }
  function updateLoop(changes: Partial<LoopRegion>) { if (!loop) return; const updated = { ...loop, ...changes }; setLoop(updated); if (updated.endSeconds > updated.startSeconds) transcriptionStore.saveLoop(updated); if (audioRef.current) { audioRef.current.playbackRate = updated.playbackRate; audioRef.current.preservesPitch = true; } }
  function markBoundary() { const time = audioRef.current?.currentTime; if (time === undefined) return; setBoundaries(items => [...items, Number(time.toFixed(2))].sort((a, b) => a - b)); }
  function answer(): TranscriptionAnswer { return { harmony: parseHarmony(harmony), boundariesSeconds: boundaries }; }
  function saveSubmission(reference?: TranscriptionReference, grade?: TranscriptionGrade) { if (!asset) return; transcriptionStore.addSubmission({ id: crypto.randomUUID(), sessionId, assetId: asset.id, submittedAt: new Date().toISOString(), answer: answer(), reference, grade, transferCategory: 'real-music', submittedBeforeReference: true }); }
  function submit() { if (!asset || !harmony.trim()) return; const reference = transcriptionStore.reference(asset.id); setSubmitted(true); if (reference) { const grade = gradeTranscription(answer(), reference); setResult(grade); setReferenceHarmony(reference.harmony.join(' | ')); setReferenceBoundaries(reference.boundariesSeconds.join(', ')); saveSubmission(reference, grade); } else saveSubmission(); setTab('reference'); }
  function establishReference() { if (!asset) return; const reference = { harmony: parseHarmony(referenceHarmony), boundariesSeconds: parseBoundaries(referenceBoundaries) }; if (!reference.harmony.length) return; transcriptionStore.saveReference(asset.id, reference); const grade = gradeTranscription(answer(), reference); setResult(grade); saveSubmission(reference, grade); }
  function seekFromWaveform(event: MouseEvent<HTMLCanvasElement>) { if (!audioRef.current || !asset?.duration) return; const bounds = event.currentTarget.getBoundingClientRect(); audioRef.current.currentTime = (event.clientX - bounds.left) / bounds.width * asset.duration; }

  return <Screen>
    <ScreenHead title="Transcription" meta={`${transcriptionStore.submissions().length} submissions`}/>
    <ScreenBody className="transcription-panel">
      <label className="audio-import">
        <input type="file" accept="audio/*" onChange={event => importAudio(event.target.files?.[0])} aria-label="Choose an audio excerpt"/>
        <b>{asset ? asset.name : 'Choose an audio excerpt'}</b>
      </label>

      {!asset && <div className="pager"><div className="pager-empty">Import a short excerpt, loop the difficult moments, slow it down without changing pitch, and commit an analysis before viewing the reference. Real-music evidence is stored separately from synthetic drills.</div></div>}

      {asset && loop && <>
        <Tabs value={tab} onChange={setTab} options={[['audio', 'Audio'], ['answer', 'Answer'], ['reference', 'Reference']]}/>

        {/* The player stays mounted across tabs so a loop keeps running while the
            analysis is typed on another tab. */}
        <audio ref={audioRef} src={asset.url} controls style={{ display: tab === 'audio' ? 'block' : 'none' }}
          onLoadedMetadata={event => { const duration = event.currentTarget.duration; setAsset(value => value && ({ ...value, duration })); if (!loop.endSeconds) updateLoop({ endSeconds: Number(Math.min(duration, 8).toFixed(2)) }); }}
          onTimeUpdate={event => { if (loopEnabled && loop.endSeconds > loop.startSeconds && event.currentTarget.currentTime >= loop.endSeconds) { event.currentTarget.currentTime = loop.startSeconds; void event.currentTarget.play(); } }}/>

        {tab === 'audio' && <>
          <canvas className="waveform" ref={canvasRef} width="1000" height="150" onClick={seekFromWaveform} aria-label="Audio waveform; click to seek"/>
          <div className="fields" style={{ flex: '0 0 auto' }}>
            <label className="check"><input type="checkbox" checked={loopEnabled} onChange={event => setLoopEnabled(event.target.checked)}/> Loop</label>
            <label>Start<input type="number" step=".1" min="0" max={asset.duration} value={loop.startSeconds} onChange={event => updateLoop({ startSeconds: Number(event.target.value) })}/></label>
            <label>End<input type="number" step=".1" min="0" max={asset.duration} value={loop.endSeconds} onChange={event => updateLoop({ endSeconds: Number(event.target.value) })}/></label>
            <label>Speed<select value={loop.playbackRate} onChange={event => updateLoop({ playbackRate: Number(event.target.value) })}><option value="0.5">50%</option><option value="0.75">75%</option><option value="0.9">90%</option><option value="1">100%</option></select></label>
          </div>
          <div className="boundary-list">
            <b>Boundaries</b>
            {boundaries.length ? boundaries.map(time => <button key={time} onClick={() => setBoundaries(items => items.filter(item => item !== time))}>{time.toFixed(2)}s ×</button>) : <span>None marked yet.</span>}
          </div>
          <div className="actions end"><button className="ghost" onClick={markBoundary}>Mark boundary at playhead</button></div>
        </>}

        {tab === 'answer' && <>
          <label className="harmony-entry" style={{ flex: '1 1 auto', minHeight: 0 }}>
            Harmonic answer
            <textarea value={harmony} disabled={submitted} onChange={event => setHarmony(event.target.value)} placeholder="Dm7 | G7 | Cmaj7"/>
            <small className="hint">Separate chords with |, commas, arrows, or dashes.</small>
          </label>
          <div className="actions end"><button className="primary" disabled={!harmony.trim() || submitted} onClick={submit}>{submitted ? 'Submitted' : 'Submit before revealing reference'}</button></div>
        </>}

        {tab === 'reference' && (result
          ? <>
            <div className="result">
              <div><strong>{Math.round(result.harmonyAccuracy * 100)}%</strong><span>Harmonic accuracy</span></div>
              <div><strong>{Math.round(result.boundaryAccuracy * 100)}%</strong><span>Boundary accuracy</span></div>
              <p>Reference: {referenceHarmony || '—'} · Boundaries: {referenceBoundaries || 'none'}</p>
            </div>
            <div className="actions end"><button className="ghost" onClick={() => { setSubmitted(false); setResult(undefined); setHarmony(''); setBoundaries([]); setTab('answer'); }}>Try another pass</button></div>
          </>
          : submitted
            ? <>
              <p className="lede">Submission locked. The answer was stored before this reference became visible, so future attempts on the same file grade immediately.</p>
              <div className="fields" style={{ flex: '0 0 auto' }}>
                <label>Reference harmony<input type="text" value={referenceHarmony} onChange={event => setReferenceHarmony(event.target.value)} placeholder="Dm7 | G7 | Cmaj7"/></label>
                <label>Reference boundaries<input type="text" value={referenceBoundaries} onChange={event => setReferenceBoundaries(event.target.value)} placeholder="2.0, 4.0"/></label>
              </div>
              <div className="actions end"><button className="primary" onClick={establishReference}>Save reference and grade</button></div>
            </>
            : <div className="pager"><div className="pager-empty">Commit an answer first — the reference stays hidden until you do.</div></div>)}
      </>}
    </ScreenBody>
  </Screen>;
}
