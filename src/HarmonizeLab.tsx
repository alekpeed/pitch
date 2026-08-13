import { useMemo, useState } from 'react';
import { AudioEngine } from './audio';
import {
  buildDiatonicChord, generateComparison, generateHarmonization, generateMelodyOverChord,
  gradeHarmonization, judgeSubstitution, SUBSTITUTIONS,
} from './harmonize';
import { attemptStore } from './storage';
import { NOTE_NAMES, pitch } from './theory';

type Mode = 'melody-over-chord' | 'harmonize' | 'reharmonize' | 'compare';
const MODES: { id: Mode; label: string }[] = [
  { id: 'melody-over-chord', label: 'Harmony under a melody' },
  { id: 'harmonize', label: 'Harmonize a melody' },
  { id: 'reharmonize', label: 'Reharmonize' },
  { id: 'compare', label: 'Compare versions' },
];

export function HarmonizeLab({ sessionId, onEvidence }: { sessionId: string; onEvidence: () => void }) {
  const [mode, setMode] = useState<Mode>('melody-over-chord');
  const [seed, setSeed] = useState(() => Date.now());
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [chosen, setChosen] = useState<string[]>([]);
  const [answer, setAnswer] = useState<string>();
  const audio = useMemo(() => new AudioEngine(), []);

  const overChord = useMemo(() => generateMelodyOverChord(seed), [seed]);
  const harmonization = useMemo(() => generateHarmonization(seed, 4), [seed]);
  const comparison = useMemo(() => generateComparison(seed), [seed]);
  // Reharmonization works on the same ii–V–I the comparison uses.
  const reharmRomans = comparison.romans;

  function restart(next?: Mode) {
    if (next) setMode(next);
    setSeed(value => value + 1); setChosen([]); setAnswer(undefined); setStartedAt(Date.now());
  }

  function record(exercise: string, expected: string, response: string, correct: boolean, difficulty: Record<string, unknown>) {
    attemptStore.add({
      id: crypto.randomUUID(), sessionId, timestamp: new Date().toISOString(), exercise,
      stimulus: { key: NOTE_NAMES[overChord.keyPitchClass], mode }, expected, response, correct,
      latencyMs: Date.now() - startedAt, difficulty, replayCount: 0, transferCategory: 'synthetic',
    });
    onEvidence();
  }

  const grade = mode === 'harmonize' ? gradeHarmonization(harmonization, chosen) : undefined;

  return <><section className="hero"><div><span className="tag">HARMONIZATION</span><h2>Hear and choose harmony</h2><p>More than one harmonisation of a melody can be defensible, so these are graded on whether a choice genuinely works — not on matching a single expected answer.</p></div><div className="evidence"><small>Key</small><b>{NOTE_NAMES[mode === 'compare' || mode === 'reharmonize' ? comparison.keyPitchClass : mode === 'harmonize' ? harmonization.keyPitchClass : overChord.keyPitchClass]} major</b><span>Multiple correct solutions accepted</span></div></section>

    <div className="mode-tabs">{MODES.map(item => <button key={item.id} className={mode === item.id ? 'selected' : ''} onClick={() => restart(item.id)}>{item.label}</button>)}</div>

    <section className="panel harmonize-panel">
      {mode === 'melody-over-chord' && <>
        <button className="listen" aria-label="Play melody over harmony" onClick={() => void audio.playLayers({ harmony: [overChord.chordNotes.map(pitch)], melody: [pitch(overChord.melodyNote)] }, { gap: 1.6 })}><span>▶</span></button>
        <h3>Which harmony is under that melody note?</h3>
        <p className="hint">The melody is often a tension rather than a chord tone, so listen underneath it.</p>
        <div className="answers many">{overChord.options.map(option => <button key={option} disabled={Boolean(answer)} className={answer ? (option === overChord.answer ? 'correct' : option === answer ? 'wrong' : '') : ''} onClick={() => { setAnswer(option); record('melody-over-chord', overChord.answer, option, option === overChord.answer, { melodyRole: overChord.melodyRole }); }}>{option}</button>)}</div>
        {answer && <div className="feedback"><div><b>{answer === overChord.answer ? 'Correct.' : `This was ${overChord.answer}.`}</b><span>The melody was the {overChord.melodyRole} of that chord.</span></div><button onClick={() => restart()}>Next →</button></div>}
      </>}

      {mode === 'harmonize' && <>
        <button className="listen" aria-label="Play the melody" onClick={() => void audio.playLayers({ melody: harmonization.melody.map(pitch) }, { gap: 1.1 })}><span>▶</span></button>
        <h3>Choose a chord under each melody note</h3>
        <p className="hint">Several chords support each note. Anything that genuinely works is accepted.</p>
        <div className="harmonize-grid">{harmonization.melody.map((note, index) => <div key={index} className="harmonize-slot">
          <b>{NOTE_NAMES[note % 12]}</b>
          <select value={chosen[index] ?? ''} onChange={event => setChosen(current => { const next = [...current]; next[index] = event.target.value; return next; })}>
            <option value="">choose…</option>
            {harmonization.options.map(roman => <option key={roman} value={roman}>{roman}</option>)}
          </select>
          {grade && chosen[index] && <small className={grade.judgements[index].valid ? 'ok' : 'no'}>{grade.judgements[index].reason}</small>}
        </div>)}</div>
        <div className="replay-actions">
          <button className="submit-performance" disabled={chosen.filter(Boolean).length !== harmonization.melody.length || Boolean(answer)} onClick={() => { const result = gradeHarmonization(harmonization, chosen); setAnswer('graded'); record('harmonization', 'any defensible harmonisation', chosen.join(' '), result.allValid, { melodyLength: harmonization.melody.length }); }}>Submit harmonisation</button>
          <button onClick={() => void audio.playLayers({ melody: harmonization.melody.map(pitch), harmony: chosen.filter(Boolean).map(roman => buildDiatonicChord(harmonization.keyPitchClass, roman).map(pitch)) }, { gap: 1.1 })} disabled={chosen.filter(Boolean).length === 0}>Hear my version</button>
          <button onClick={() => restart()}>New melody →</button>
        </div>
        {answer && grade && <p className="detector-note">{grade.valid} of {grade.total} choices hold up. {grade.allValid ? 'Every one is defensible.' : 'The reasons above say why.'}</p>}
      </>}

      {mode === 'reharmonize' && <>
        <button className="listen" aria-label="Play the progression" onClick={() => void audio.playProgression(comparison.original.map(notes => notes.map(pitch)))}><span>▶</span></button>
        <h3>Apply a substitution to {reharmRomans.join(' – ')}</h3>
        <p className="hint">Each substitution only works on the chord it belongs to.</p>
        <div className="harmonize-grid">{reharmRomans.map((roman, index) => <div key={index} className="harmonize-slot">
          <b>{roman}</b>
          <select value={chosen[index] ?? ''} onChange={event => setChosen(current => { const next = [...current]; next[index] = event.target.value; return next; })}>
            <option value="">leave as is</option>
            {SUBSTITUTIONS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
          {answer && chosen[index] && <small className={judgeSubstitution(roman, chosen[index]).valid ? 'ok' : 'no'}>{judgeSubstitution(roman, chosen[index]).reason}</small>}
        </div>)}</div>
        <div className="replay-actions">
          <button className="submit-performance" disabled={!chosen.some(Boolean) || Boolean(answer)} onClick={() => { const verdicts = reharmRomans.map((roman, index) => chosen[index] ? judgeSubstitution(roman, chosen[index]).valid : true); setAnswer('graded'); record('reharmonization', 'a valid substitution', chosen.filter(Boolean).join(' '), verdicts.every(Boolean), { substitutions: chosen.filter(Boolean).length }); }}>Check my reharmonisation</button>
          <button onClick={() => restart()}>New progression →</button>
        </div>
      </>}

      {mode === 'compare' && <>
        <div className="replay-actions">
          <button onClick={() => void audio.playProgression(comparison.original.map(notes => notes.map(pitch)))}>Play original</button>
          <button onClick={() => void audio.playProgression(comparison.altered.map(notes => notes.map(pitch)))}>Play alternative</button>
        </div>
        <h3>What changed between the two?</h3>
        <p className="hint">If the chords are the same, only the voice leading moved.</p>
        <div className="answers many">{comparison.options.map(option => <button key={option} disabled={Boolean(answer)} className={answer ? (option === comparison.answer ? 'correct' : option === answer ? 'wrong' : '') : ''} onClick={() => { setAnswer(option); record('compare-harmonizations', comparison.answer, option, option === comparison.answer, { template: comparison.templateName }); }}>{option}</button>)}</div>
        {answer && <div className="feedback"><div><b>{answer === comparison.answer ? 'Correct.' : `This was ${comparison.answer}.`}</b><span>{comparison.romans.join(' – ')} → {comparison.alteredRomans.join(' – ')}</span></div><button onClick={() => restart()}>Next →</button></div>}
      </>}
    </section></>;
}
