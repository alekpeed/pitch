import { useMemo, useState } from 'react';
import { AudioEngine } from './audio';
import { NoteMap } from './NoteMap';
import { attemptStore } from './storage';
import { NOTE_NAMES, pitch } from './theory';
import {
  generateTranscription, gradeChordLabels, gradeNotes, HINT_LADDER, hintsFor,
  type MixDensity, type SequenceGrade, type TranscriptionTaskKind,
} from './transcribe';
import { Screen, ScreenBody, ScreenHead, Tabs } from './ui';

const KINDS: readonly (readonly [TranscriptionTaskKind, string])[] = [
  ['melody-echo', 'Echo'], ['melody', 'Melody'], ['bass', 'Bass'], ['chords', 'Chords'],
];
const LENGTHS = [2, 4, 8, 16];
const DENSITIES: { id: MixDensity; label: string; noise: number }[] = [
  { id: 'solo', label: 'Solo line', noise: 0 },
  { id: 'accompanied', label: 'With accompaniment', noise: 0 },
  { id: 'dense', label: 'Dense mix', noise: .12 },
];

export function TranscribeLab({ sessionId, onEvidence }: { sessionId: string; onEvidence: () => void }) {
  const [kind, setKind] = useState<TranscriptionTaskKind>('melody-echo');
  const [bars, setBars] = useState(2);
  const [density, setDensity] = useState<MixDensity>('solo');
  const [seed, setSeed] = useState(() => Date.now());
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [entered, setEntered] = useState<number[]>([]);
  const [chordText, setChordText] = useState('');
  const [hints, setHints] = useState(0);
  const [grade, setGrade] = useState<SequenceGrade>();
  const audio = useMemo(() => new AudioEngine(), []);

  const task = useMemo(() => generateTranscription(seed, { kind, bars: kind === 'melody-echo' ? 1 : bars, density }), [seed, kind, bars, density]);
  const chordsOnly = kind === 'chords';
  const expectedChords = task.chords.map(notes => NOTE_NAMES[((Math.min(...notes) % 12) + 12) % 12]);

  function restart(changes: Partial<{ kind: TranscriptionTaskKind; bars: number; density: MixDensity }> = {}) {
    if (changes.kind !== undefined) setKind(changes.kind);
    if (changes.bars !== undefined) setBars(changes.bars);
    if (changes.density !== undefined) setDensity(changes.density);
    setSeed(value => value + 1); setEntered([]); setChordText(''); setHints(0); setGrade(undefined); setStartedAt(Date.now());
  }

  const play = () => {
    const spec = DENSITIES.find(item => item.id === density)!;
    // Solo plays only the line being transcribed; each step up adds a layer.
    void audio.playLayers({
      melody: kind === 'bass' ? undefined : task.line.map(pitch),
      bass: kind === 'bass' || density !== 'solo' ? task.bassLine.map(pitch) : undefined,
      harmony: density === 'solo' && !chordsOnly ? undefined : task.chords.map(notes => notes.map(pitch)),
    }, { noise: spec.noise });
  };

  function submit() {
    const result = chordsOnly
      ? gradeChordLabels(expectedChords, chordText.split(/[\s|,]+/).filter(Boolean))
      : gradeNotes(task.line, entered);
    setGrade(result);
    attemptStore.add({
      id: crypto.randomUUID(), sessionId, timestamp: new Date().toISOString(), exercise: `transcribe-${kind}`,
      stimulus: { key: task.keyPitchClass, template: task.templateName, line: task.line, romans: task.romans },
      expected: chordsOnly ? expectedChords.join(' ') : task.line.join(' '),
      response: chordsOnly ? chordText : entered.join(' '),
      correct: result.correct, latencyMs: Date.now() - startedAt,
      // Hints used and mix density are conditions, so they belong in the envelope.
      difficulty: { bars: chordsOnly || kind !== 'melody-echo' ? bars : 1, density, hintsUsed: hints, task: kind },
      replayCount: 0, transferCategory: density === 'dense' ? 'semi-realistic' : 'synthetic',
    });
    onEvidence();
  }

  const keys = Array.from({ length: 25 }, (_, index) => 60 + index);

  return <Screen>
    <ScreenHead title="Transcribe" meta={`${chordsOnly || kind !== 'melody-echo' ? `${bars} bars` : '1 bar'} · ${DENSITIES.find(item => item.id === density)!.label}`}/>
    <ScreenBody>
      <Tabs value={kind} onChange={value => restart({ kind: value })} options={KINDS}/>

      <div className="fields" style={{ flex: '0 0 auto' }}>
        <label>Length<select value={bars} disabled={kind === 'melody-echo'} onChange={event => restart({ bars: Number(event.target.value) })}>{LENGTHS.map(value => <option key={value} value={value}>{value} bars</option>)}</select></label>
        <label>Mix<select value={density} onChange={event => restart({ density: event.target.value as MixDensity })}>{DENSITIES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      </div>

      <div className="prompt">
        <button className="listen" aria-label="Play excerpt" onClick={play}>▶</button>
        <p className="hint">Generated material with a known answer, so it can be graded note by note — and a hint given only when you ask.</p>
      </div>

      {chordsOnly
        ? <label className="harmony-entry" style={{ flex: '1 1 auto', minHeight: 0 }}>
          Chord symbols
          <textarea value={chordText} disabled={Boolean(grade)} onChange={event => setChordText(event.target.value)} placeholder="Dm7 | G7 | Cmaj7"/>
          <small className="hint">Any equivalent spelling counts — Cmaj7, CM7 and CΔ7 all pass, as do enharmonic roots.</small>
        </label>
        : <>
          <div className="midi-monitor">
            <b>Your line</b>
            <span>{entered.length ? entered.map(note => NOTE_NAMES[note % 12]).join(' · ') : 'Play the notes below.'}</span>
            <button onClick={() => setEntered([])}>Clear</button>
          </div>
          {/* Once graded the keyboard is inert, so it gives its space back to
              the result instead of sitting there disabled. */}
          {!grade && <div className="keyboard" aria-label="Note entry keyboard">{keys.map(note => <button key={note} aria-label={`Enter ${NOTE_NAMES[note % 12]}`} onClick={() => { setEntered(current => [...current, note]); void audio.play([pitch(note)], .4); }}>{NOTE_NAMES[note % 12]}</button>)}</div>}
        </>}

      {hints > 0 && !grade && <div className="hint-list">{hintsFor(task, hints).map(text => <p key={text}>{text}</p>)}</div>}

      {grade
        ? <div className={`result ${grade.correct ? 'pass' : 'fail'}`}>
          <div>
            <strong>{grade.matched}/{grade.total}</strong>
            <span>{chordsOnly ? 'chords' : 'notes'} correct · {task.templateName} in {NOTE_NAMES[task.keyPitchClass]} — {task.romans.join(' – ')}{hints > 0 ? ` · ${hints} hint${hints === 1 ? '' : 's'}` : ''}</span>
          </div>
          {!chordsOnly && <div><NoteMap notes={task.line} defining={task.line.filter((_, index) => !grade.perItem[index])} label="Expected — missed highlighted"/></div>}
          <p><button className="primary" onClick={() => restart()}>Try another →</button></p>
        </div>
        : <div className="actions">
          <button className="primary" disabled={chordsOnly ? !chordText.trim() : !entered.length} onClick={submit}>Submit</button>
          <button className="ghost" disabled={hints >= HINT_LADDER.length} onClick={() => setHints(value => value + 1)}>Hint ({HINT_LADDER.length - hints} left)</button>
          <button className="ghost" onClick={() => restart()}>New excerpt →</button>
        </div>}
    </ScreenBody>
  </Screen>;
}
