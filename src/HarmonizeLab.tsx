import { useMemo, useState } from 'react';
import { AudioEngine } from './audio';
import {
  buildDiatonicChord, generateComparison, generateHarmonization, generateMelodyOverChord,
  gradeHarmonization, judgeSubstitution, SUBSTITUTIONS,
} from './harmonize';
import { attemptStore } from './storage';
import { NOTE_NAMES, pitch } from './theory';
import { Screen, ScreenBody, ScreenHead, Tabs } from './ui';
import { titleCasable } from './display';

type Mode = 'melody-over-chord' | 'harmonize' | 'reharmonize' | 'compare';
const MODES: readonly (readonly [Mode, string])[] = [
  ['melody-over-chord', 'Under melody'], ['harmonize', 'Harmonize'], ['reharmonize', 'Reharmonize'], ['compare', 'Compare'],
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
      stimulus: { mode, seed }, expected, response, correct,
      latencyMs: Date.now() - startedAt, difficulty, replayCount: 0, transferCategory: 'synthetic',
    });
    onEvidence();
  }

  const grade = mode === 'harmonize' ? gradeHarmonization(harmonization, chosen) : undefined;
  const keyOf = mode === 'compare' || mode === 'reharmonize' ? comparison.keyPitchClass : mode === 'harmonize' ? harmonization.keyPitchClass : overChord.keyPitchClass;

  return <Screen>
    <ScreenHead title="Harmonize" meta={`${NOTE_NAMES[keyOf]} major`}/>
    <ScreenBody>
      <Tabs value={mode} onChange={value => restart(value)} options={MODES}/>

      {mode === 'melody-over-chord' && <div className={`drill ${titleCasable(overChord.options) ? 'caps' : ''}`}>
        {!answer ? <>
          <div className="prompt">
            <button className="listen" aria-label="Play melody over harmony" onClick={() => void audio.playLayers({ harmony: [overChord.chordNotes.map(pitch)], melody: [pitch(overChord.melodyNote)] }, { gap: 1.6 })}>▶</button>
            <h2>Which harmony is under that melody note?</h2>
            <p className="hint">The melody is often a tension rather than a chord tone, so listen underneath it.</p>
          </div>
          <div className={`answers ${overChord.options.length > 10 ? 'dense' : 'wide'}`}>{overChord.options.map(option => <button key={option} onClick={() => { setAnswer(option); record('melody-over-chord', overChord.answer, option, option === overChord.answer, { melodyRole: overChord.melodyRole }); }}>{option}</button>)}</div>
        </> : <>
          <div className="verdict">
            <span>You chose</span>
            <b className={answer === overChord.answer ? 'correct' : 'wrong'}>{answer}</b>
            {answer !== overChord.answer && <><span>·</span><b className="correct">{overChord.answer}</b></>}
          </div>
          <div className="feedback"><div>
            <b>{answer === overChord.answer ? 'Correct.' : `This was ${overChord.answer}.`}</b>
            <span>The melody was the {overChord.melodyRole} of that chord.</span>
          </div></div>
          <div className="action-bar"><b>{answer === overChord.answer ? 'Correct' : `Was ${overChord.answer}`}</b><button onClick={() => restart()}>Next →</button></div>
        </>}
      </div>}

      {mode === 'harmonize' && <div className="drill">
        <div className="prompt">
          <button className="listen" aria-label="Play the melody" onClick={() => void audio.playLayers({ melody: harmonization.melody.map(pitch) }, { gap: 1.1 })}>▶</button>
          <h2>Choose a chord under each note</h2>
          <p className="hint">Several chords support each note. Anything that genuinely works is accepted.</p>
        </div>
        <div className="harmonize-grid">{harmonization.melody.map((note, index) => <div key={index} className="harmonize-slot">
          <b>{NOTE_NAMES[note % 12]}</b>
          <select value={chosen[index] ?? ''} aria-label={`Chord under ${NOTE_NAMES[note % 12]}`} onChange={event => setChosen(current => { const next = [...current]; next[index] = event.target.value; return next; })}>
            <option value="">choose…</option>
            {harmonization.options.map(roman => <option key={roman} value={roman}>{roman}</option>)}
          </select>
          {grade && chosen[index] && <small className={grade.judgements[index].valid ? 'ok' : 'no'}>{grade.judgements[index].reason}</small>}
        </div>)}</div>
        {answer && grade && <p className="detector-note">{grade.valid} of {grade.total} choices hold up. {grade.allValid ? 'Every one is defensible.' : 'The reasons above say why.'}</p>}
        <div className="actions">
          <button className="primary" disabled={chosen.filter(Boolean).length !== harmonization.melody.length || Boolean(answer)} onClick={() => { const result = gradeHarmonization(harmonization, chosen); setAnswer('graded'); record('harmonization', 'any defensible harmonisation', chosen.join(' '), result.allValid, { melodyLength: harmonization.melody.length }); }}>Submit</button>
          <button className="ghost" disabled={chosen.filter(Boolean).length === 0} onClick={() => void audio.playLayers({ melody: harmonization.melody.map(pitch), harmony: chosen.filter(Boolean).map(roman => buildDiatonicChord(harmonization.keyPitchClass, roman).map(pitch)) }, { gap: 1.1 })}>Hear my version</button>
          <button className="ghost" onClick={() => restart()}>New melody →</button>
        </div>
      </div>}

      {mode === 'reharmonize' && <div className="drill">
        <div className="prompt">
          <button className="listen" aria-label="Play the progression" onClick={() => void audio.playProgression(comparison.original.map(notes => notes.map(pitch)))}>▶</button>
          <h2>Apply a substitution to {reharmRomans.join(' – ')}</h2>
          <p className="hint">Each substitution only works on the chord it belongs to.</p>
        </div>
        <div className="harmonize-grid">{reharmRomans.map((roman, index) => <div key={index} className="harmonize-slot">
          <b>{roman}</b>
          <select value={chosen[index] ?? ''} aria-label={`Substitution for ${roman}`} onChange={event => setChosen(current => { const next = [...current]; next[index] = event.target.value; return next; })}>
            <option value="">leave as is</option>
            {SUBSTITUTIONS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
          {answer && chosen[index] && <small className={judgeSubstitution(roman, chosen[index]).valid ? 'ok' : 'no'}>{judgeSubstitution(roman, chosen[index]).reason}</small>}
        </div>)}</div>
        <div className="actions">
          <button className="primary" disabled={!chosen.some(Boolean) || Boolean(answer)} onClick={() => { const verdicts = reharmRomans.map((roman, index) => chosen[index] ? judgeSubstitution(roman, chosen[index]).valid : true); setAnswer('graded'); record('reharmonization', 'a valid substitution', chosen.filter(Boolean).join(' '), verdicts.every(Boolean), { substitutions: chosen.filter(Boolean).length }); }}>Check it</button>
          <button className="ghost" onClick={() => restart()}>New progression →</button>
        </div>
      </div>}

      {mode === 'compare' && <div className={`drill ${titleCasable(comparison.options) ? 'caps' : ''}`}>
        {!answer ? <>
          <div className="prompt">
            <h2>What changed between the two?</h2>
            <p className="hint">If the chords are the same, only the voice leading moved.</p>
            <div className="replay-actions">
              <button onClick={() => void audio.playProgression(comparison.original.map(notes => notes.map(pitch)))}>Play original</button>
              <button onClick={() => void audio.playProgression(comparison.altered.map(notes => notes.map(pitch)))}>Play alternative</button>
            </div>
          </div>
          <div className={`answers ${comparison.options.length > 10 ? 'dense' : 'wide'}`}>{comparison.options.map(option => <button key={option} onClick={() => { setAnswer(option); record('compare-harmonizations', comparison.answer, option, option === comparison.answer, { template: comparison.templateName }); }}>{option}</button>)}</div>
        </> : <>
          <div className="verdict">
            <span>You chose</span>
            <b className={answer === comparison.answer ? 'correct' : 'wrong'}>{answer}</b>
            {answer !== comparison.answer && <><span>·</span><b className="correct">{comparison.answer}</b></>}
          </div>
          <div className="feedback"><div>
            <b>{answer === comparison.answer ? 'Correct.' : `This was ${comparison.answer}.`}</b>
            <span>{comparison.romans.join(' – ')} → {comparison.alteredRomans.join(' – ')}</span>
          </div></div>
          <div className="action-bar"><b>{answer === comparison.answer ? 'Correct' : `Was ${comparison.answer}`}</b><button onClick={() => restart()}>Next →</button></div>
        </>}
      </div>}
    </ScreenBody>
  </Screen>;
}
