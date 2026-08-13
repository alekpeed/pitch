import { useRef, useState } from 'react';
import {
  backupFilename, buildBackup, mergeBackup, parseBackup, PERIOD_LABELS, toCsv, toJson, toReport,
  type ReportPeriod,
} from './backup';
import { currentData, applyBackup } from './persistence';

type Format = 'json' | 'csv' | 'report';
const FORMATS: { id: Format; label: string; extension: string; mime: string; blurb: string }[] = [
  { id: 'json', label: 'JSON backup', extension: 'json', mime: 'application/json', blurb: 'Everything, in the format restore reads. This is the one to keep.' },
  { id: 'csv', label: 'CSV of attempts', extension: 'csv', mime: 'text/csv', blurb: 'One row per graded attempt, for a spreadsheet.' },
  { id: 'report', label: 'Readable report', extension: 'md', mime: 'text/markdown', blurb: 'Skill profile, weaknesses, transfer, session chronology and your notes.' },
];
const PERIODS: ReportPeriod[] = ['week', 'month', 'quarter', 'year', 'all'];

export function DataPanel({ onRestored }: { onRestored: () => void }) {
  const [format, setFormat] = useState<Format>('json');
  const [period, setPeriod] = useState<ReportPeriod>('all');
  const [copied, setCopied] = useState(false);
  const [pasted, setPasted] = useState('');
  const [status, setStatus] = useState<{ tone: 'ok' | 'no'; message: string }>();
  // The exact text a replace has been armed for. Keyed on the source rather than
  // on anything inside it, because a backup need not carry a stable identifier.
  const [pendingReplace, setPendingReplace] = useState<string>();
  const fileRef = useRef<HTMLInputElement>(null);

  // Read straight from the stores on render, as the rest of the app does — the
  // whole point of this panel is to show what is on the device right now.
  const data = currentData();
  const backup = buildBackup(data);
  const chosen = FORMATS.find(item => item.id === format)!;
  const text = format === 'json' ? toJson(backup) : format === 'csv' ? toCsv(backup.attempts) : toReport(backup, period);

  /**
   * A blob download is the normal path, but an Android WebView can refuse it — so
   * copy and the raw preview below are always offered too, and the data can never
   * be trapped inside the app.
   */
  function download() {
    const url = URL.createObjectURL(new Blob([text], { type: chosen.mime }));
    const link = document.createElement('a');
    link.href = url; link.download = backupFilename(chosen.extension);
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function copy() {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setStatus({ tone: 'no', message: 'Clipboard unavailable — select the text below instead.' }); }
  }

  function restore(source: string, mode: 'merge' | 'replace') {
    const parsed = parseBackup(source);
    if (!parsed.ok) return setStatus({ tone: 'no', message: parsed.error });
    if (mode === 'replace' && pendingReplace !== source) {
      setPendingReplace(source);
      return setStatus({ tone: 'no', message: `Replacing discards ${data.attempts.length} attempt${data.attempts.length === 1 ? '' : 's'} already on this device. Press replace again to confirm.` });
    }
    const next = mode === 'merge' ? mergeBackup(data, parsed.backup) : parsed.backup;
    applyBackup(next);
    setPendingReplace(undefined); setPasted('');
    setStatus({ tone: 'ok', message: `Restored — ${next.attempts.length} attempts and ${next.sessions.length} sessions now on this device.` });
    onRestored();
  }

  const readFile = (mode: 'merge' | 'replace') => {
    const file = fileRef.current?.files?.[0];
    if (!file) return setStatus({ tone: 'no', message: 'Choose a backup file first.' });
    void file.text().then(contents => restore(contents, mode));
  };

  return <>
    <h2>Export your history</h2>
    <p>Everything is recorded on this device and nothing is sent anywhere. These are the ways to get it out.</p>

    <div className="mode-tabs">{FORMATS.map(item => <button key={item.id} className={format === item.id ? 'selected' : ''} onClick={() => setFormat(item.id)}>{item.label}</button>)}</div>
    <p className="hint">{chosen.blurb}</p>

    {format === 'report' && <label>Period<select value={period} onChange={event => setPeriod(event.target.value as ReportPeriod)}>{PERIODS.map(item => <option key={item} value={item}>{PERIOD_LABELS[item]}</option>)}</select></label>}

    <div className="replay-actions">
      <button className="submit-performance" onClick={download}>Download {backupFilename(chosen.extension)}</button>
      <button onClick={() => void copy()}>{copied ? 'Copied' : 'Copy to clipboard'}</button>
    </div>
    <p className="hint">{data.attempts.length} attempt{data.attempts.length === 1 ? '' : 's'} · {data.sessions.length} session{data.sessions.length === 1 ? '' : 's'} · {data.notes.length} note{data.notes.length === 1 ? '' : 's'} · {text.length.toLocaleString()} characters.</p>
    <details className="raw-preview"><summary>Show the raw {chosen.extension.toUpperCase()}</summary><pre>{text}</pre></details>

    <h2>Restore from a backup</h2>
    <p>Merging keeps what is already here and adds anything missing; an attempt present in both is kept once. Replacing discards this device's history entirely, so it asks twice.</p>
    <input ref={fileRef} type="file" accept=".json,application/json" aria-label="Backup file"/>
    <div className="replay-actions">
      <button className="submit-performance" onClick={() => readFile('merge')}>Merge from file</button>
      <button className="danger" onClick={() => readFile('replace')}>Replace from file</button>
    </div>
    <label>Or paste a backup<textarea value={pasted} rows={4} placeholder='{"app":"perfect-ear", …}' onChange={event => { setPasted(event.target.value); setStatus(undefined); }}/></label>
    <div className="replay-actions">
      <button disabled={!pasted.trim()} onClick={() => restore(pasted, 'merge')}>Merge pasted</button>
      <button className="danger" disabled={!pasted.trim()} onClick={() => restore(pasted, 'replace')}>Replace with pasted</button>
    </div>
    {status && <p className={`restore-status ${status.tone}`}>{status.message}</p>}
  </>;
}
