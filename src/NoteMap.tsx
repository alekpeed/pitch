import { NOTE_NAMES } from './theory';

const BLACK = new Set([1, 3, 6, 8, 10]);

/**
 * Post-answer visualisation: the notes that actually sounded, with any defining
 * tones emphasised. Shown only after judgment, and suppressed entirely in blind
 * mode, so it can never act as a hint before the user has committed.
 */
export function NoteMap({ notes, defining = [], label }: { notes: number[]; defining?: number[]; label?: string }) {
  if (!notes.length) return null;
  const sounded = new Set(notes);
  const emphasised = new Set(defining);
  const low = Math.min(...notes); const high = Math.max(...notes);
  // Pad to whole octaves so the shape of the voicing stays readable.
  const from = Math.floor(low / 12) * 12;
  const to = Math.ceil((high + 1) / 12) * 12;
  const keys = Array.from({ length: to - from }, (_, index) => from + index);
  return <div className="note-map">
    {label && <small>{label}</small>}
    <div className="keys" role="img" aria-label={`Sounding notes: ${notes.map(note => `${NOTE_NAMES[note % 12]}${Math.floor(note / 12) - 1}`).join(', ')}`}>
      {keys.map(note => {
        const state = emphasised.has(note) ? 'defining' : sounded.has(note) ? 'sounded' : '';
        return <span key={note} className={`key ${BLACK.has(note % 12) ? 'black' : 'white'} ${state}`}>
          {sounded.has(note) && <b>{NOTE_NAMES[note % 12]}</b>}
        </span>;
      })}
    </div>
  </div>;
}
