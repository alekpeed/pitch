import { useMemo, useState } from 'react';
import { AudioEngine } from './audio';
import { NoteMap } from './NoteMap';
import { gradeAgainst } from './performance';
import { attemptStore } from './storage';
import {
  generateInnerMelody, generateSpacing, generateUpperStructure, generateVoiceMotion,
  generateVoicingChange, SPACINGS, UPPER_STRUCTURES, VOICES, VOICING_CHANGES, type Spacing,
} from './texture';
import { NOTE_NAMES, pitch } from './theory';
import { Screen, ScreenBody, ScreenHead, Tabs } from './ui';
import { titleCasable } from './display';

type Mode = 'spacing' | 'upper' | 'motion' | 'inner' | 'changed';
// Short labels: the segmented control has to hold five of them on a phone.
const MODES: readonly (readonly [Mode, string])[] = [
  ['spacing', 'Spacing'], ['upper', 'Upper'], ['motion', 'Motion'], ['inner', 'Inner'], ['changed', 'Changed'],
];
const HEADINGS: Record<Mode, { title: string; blurb: string }> = {
  spacing: { title: 'How is this chord spaced?', blurb: 'The chord itself is held constant across every option, so the only thing left to hear is how its notes are arranged.' },
  upper: { title: 'Which triad is on top?', blurb: 'A stack of alterations is far easier to hear as one familiar major triad than as four separate tensions.' },
  motion: { title: 'Which voice moved?', blurb: 'Two voicings, one voice apart. Everything else is a common tone.' },
  inner: { title: 'Where is the line?', blurb: 'One voice carries a melody while the other three hold their pitches exactly. Find it, then play it back.' },
  changed: { title: 'What changed between them?', blurb: 'Two near-identical voicings. An inversion keeps the same notes; a bass change brings in one the chord did not have.' },
};

/** Which drill each schedulable exercise id corresponds to. */
const MODE_FOR: Record<string, Mode> = {
  'voicing-spacing': 'spacing', 'upper-structure': 'upper', 'voice-motion': 'motion',
  'inner-voice-melody': 'inner', 'inner-voice-reproduction': 'inner', 'voicing-change': 'changed',
};

export function TextureLab({ sessionId, spacings, requested, onEvidence }: { sessionId: string; spacings?: readonly Spacing[]; requested?: string; onEvidence: () => void }) {
  // Opening a scheduled item has to land on the drill that was scheduled, not on
  // whatever this page happens to show first.
  const [mode, setMode] = useState<Mode>(() => (requested && MODE_FOR[requested]) || 'spacing');
  const [seed, setSeed] = useState(() => Date.now());
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [answer, setAnswer] = useState<string>();
  const [played, setPlayed] = useState<number[]>([]);
  const [reproduction, setReproduction] = useState<ReturnType<typeof gradeAgainst>>();
  const audio = useMemo(() => new AudioEngine(), []);

  const spacingPool = spacings?.length ? spacings : SPACINGS;
  const spacing = useMemo(() => generateSpacing(seed, spacingPool), [seed, spacingPool]);
  const upper = useMemo(() => generateUpperStructure(seed), [seed]);
  const motion = useMemo(() => generateVoiceMotion(seed), [seed]);
  const inner = useMemo(() => generateInnerMelody(seed), [seed]);
  const changed = useMemo(() => generateVoicingChange(seed), [seed]);

  function restart(next?: Mode) {
    if (next) setMode(next);
    setSeed(value => value + 1); setAnswer(undefined); setPlayed([]); setReproduction(undefined); setStartedAt(Date.now());
  }

  const exercise: Record<Mode, string> = {
    spacing: 'voicing-spacing', upper: 'upper-structure', motion: 'voice-motion',
    inner: 'inner-voice-melody', changed: 'voicing-change',
  };
  const expected =
    mode === 'spacing' ? spacing.answer
    : mode === 'upper' ? upper.answer
    : mode === 'motion' ? motion.answer
    : mode === 'inner' ? inner.answer
    : changed.answer;
  const options: readonly string[] =
    mode === 'spacing' ? spacingPool
    : mode === 'upper' ? UPPER_STRUCTURES.map(item => item.label)
    : mode === 'motion' || mode === 'inner' ? [...VOICES].reverse()
    : VOICING_CHANGES;
  const explanation =
    mode === 'spacing' ? spacing.explanation
    : mode === 'upper' ? upper.explanation
    : mode === 'motion' ? motion.explanation
    : mode === 'inner' ? inner.explanation
    : changed.explanation;
  const sounded =
    mode === 'spacing' ? spacing.notes
    : mode === 'upper' ? upper.notes
    : mode === 'motion' ? [...motion.first, ...motion.second]
    : mode === 'inner' ? inner.chords.flat()
    : [...changed.first, ...changed.second];
  const defining =
    mode === 'upper' ? upper.upper
    : mode === 'motion' ? [motion.second[VOICES.indexOf(motion.answer)]]
    : mode === 'inner' ? inner.melody
    : sounded;

  const play = () => {
    if (mode === 'spacing') return void audio.play(spacing.notes.map(pitch), 1.7);
    if (mode === 'upper') return void audio.play(upper.notes.map(pitch), 1.9);
    if (mode === 'motion') return void audio.playProgression([motion.first, motion.second].map(notes => notes.map(pitch)), 'piano', 1.5);
    if (mode === 'inner') return void audio.playProgression(inner.chords.map(notes => notes.map(pitch)), 'piano', 1.1);
    void audio.playProgression([changed.first, changed.second].map(notes => notes.map(pitch)), 'piano', 1.6);
  };

  function record(response: string) {
    if (answer) return;
    setAnswer(response);
    attemptStore.add({
      id: crypto.randomUUID(), sessionId, timestamp: new Date().toISOString(), exercise: exercise[mode],
      stimulus: { notes: sounded, label: mode === 'spacing' ? spacing.label : mode === 'upper' ? upper.label : changed.label },
      expected, response, correct: response === expected, latencyMs: Date.now() - startedAt,
      difficulty: { voices: mode === 'inner' ? inner.chords[0].length : 4, options: options.length, mode },
      replayCount: 0, transferCategory: 'synthetic',
    });
    onEvidence();
  }

  /** The reproduction half of inner-voice melody: naming the voice is only half the skill. */
  function submitReproduction() {
    const graded = gradeAgainst(inner.melody, played, true);
    setReproduction(graded);
    attemptStore.add({
      id: crypto.randomUUID(), sessionId, timestamp: new Date().toISOString(), exercise: 'inner-voice-reproduction',
      stimulus: { melody: inner.melody, voice: inner.answer }, expected: inner.melody.join(' '), response: played.join(' '),
      correct: graded.correct, latencyMs: Date.now() - startedAt,
      difficulty: { notes: inner.melody.length, octaveEquivalent: 'yes', voice: inner.answer },
      replayCount: 0, transferCategory: 'synthetic',
    });
    onEvidence();
  }

  const keys = Array.from({ length: 25 }, (_, index) => 48 + index);

  return <Screen>
    <ScreenHead title="Voicings" meta={mode === 'upper' ? upper.label : mode === 'spacing' ? spacing.label : mode === 'changed' ? changed.label : `${VOICES.length} voices`}/>
    <ScreenBody>
      <Tabs value={mode} onChange={value => restart(value)} options={MODES}/>
      <div className={`drill ${titleCasable(options) ? 'caps' : ''}`}>
        {!answer ? <>
          <div className="prompt">
            <button className="listen" aria-label="Play the example" onClick={play}>▶</button>
            <h2>{HEADINGS[mode].title}</h2>
            <p className="hint">{HEADINGS[mode].blurb}</p>
            {mode === 'upper' && <div className="replay-actions">
              <button onClick={() => void audio.play(upper.lower.map(pitch), 1.5)}>Hear the dominant alone</button>
              <button onClick={() => void audio.play(upper.upper.map(pitch), 1.5)}>Hear the triad alone</button>
            </div>}
          </div>
          <div className={`answers ${options.length > 10 ? 'dense' : ''}`}>{options.map(option => <button key={option} onClick={() => record(option)}>{option}</button>)}</div>
        </> : <>
          <div className="verdict">
            <button className="mini-replay" aria-label="Replay the example" onClick={play}>▶</button>
            <span>You chose</span>
            <b className={answer === expected ? 'correct' : 'wrong'}>{answer}</b>
            {answer !== expected && <><span>·</span><b className="correct">{expected}</b></>}
          </div>
          <div className="feedback">
            <div>
              <b>{answer === expected ? 'Correct.' : `This was ${expected}.`}</b>
              <span>{explanation}</span>
              <NoteMap notes={[...new Set(sounded)].sort((a, b) => a - b)} defining={defining} label="What sounded"/>
            </div>
            {mode === 'inner' && <div className="error-replay">
              <span className="eyebrow">Now play the line back</span>
              <div className="midi-monitor">
                <b>You played</b>
                <span>{played.length ? played.map(note => NOTE_NAMES[note % 12]).join(' · ') : 'Nothing yet.'}</span>
                <button onClick={() => { setPlayed([]); setReproduction(undefined); }}>Clear</button>
              </div>
              <div className="keyboard" aria-label="On-screen keyboard">{keys.map(note => <button key={note} disabled={Boolean(reproduction)} aria-label={`Play ${NOTE_NAMES[note % 12]}`} onClick={() => { setPlayed(current => [...current, note]); void audio.play([pitch(note)], .45); }}>{NOTE_NAMES[note % 12]}</button>)}</div>
              <div className="replay-actions">
                <button disabled={!played.length || Boolean(reproduction)} onClick={submitReproduction}>Grade the line</button>
              </div>
              {reproduction && <p className="detector-note">{reproduction.correct ? 'Reproduced in order.' : `${reproduction.matched} of ${reproduction.total} notes right.`} Graded in order, any octave accepted.</p>}
            </div>}
          </div>
          <div className="action-bar">
            <b>{answer === expected ? 'Correct' : `Was ${expected}`}</b>
            <button onClick={() => restart()}>Next →</button>
          </div>
        </>}
      </div>
    </ScreenBody>
  </Screen>;
}
