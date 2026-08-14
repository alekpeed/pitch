import { useRef, useState } from 'react';
import {
  backupFilename, buildBackup, mergeBackup, parseBackup, PERIOD_LABELS, toCsv, toJson, toReport,
  type ReportPeriod,
} from './backup';
import { currentData, applyBackup } from './persistence';
import { Tabs } from './ui';

type Format = 'json' | 'csv' | 'report';
const FORMATS: { id: Format; label: string; extension: string; mime: string; blurb: string }[] = [
  { id: 'json', label: 'JSON', extension: 'json', mime: 'application/json', blurb: 'Everything, in the format restore reads. This is the one to keep.' },
  { id: 'csv', label: 'CSV', extension: 'csv', mime: 'text/csv', blurb: 'One row per graded attempt, for a spreadsheet.' },
  { id: 'report', label: 'Report', extension: 'md', mime: 'text/markdown', blurb: 'Skill profile, weaknesses, transfer, session chronology and your notes.' },
];
const PERIODS: ReportPeriod[] = ['week', 'month', 'quarter', 'year', 'all'];

export function DataPanel({ section, onRestored }: { section: 'export' | 'restore'; onRestored: () => void }) {
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
   * copy and the raw text below are always offered too, and the data can never
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

  if (section === 'export') return <>
    <Tabs value={format} onChange={setFormat} options={FORMATS.map(item => [item.id, item.label] as const)}/>
    <p className="hint">{chosen.blurb} · {data.attempts.length} attempt{data.attempts.length === 1 ? '' : 's'} · {text.length.toLocaleString()} characters.</p>
    {format === 'report' && <div className="fields" style={{ flex: '0 0 auto' }}>
      <label>Period<select value={period} onChange={event => setPeriod(event.target.value as ReportPeriod)}>{PERIODS.map(item => <option key={item} value={item}>{PERIOD_LABELS[item]}</option>)}</select></label>
    </div>}
    <div className="actions">
      <button className="primary" onClick={download}>Download {chosen.extension.toUpperCase()}</button>
      <button className="ghost" onClick={() => void copy()}>{copied ? 'Copied' : 'Copy to clipboard'}</button>
    </div>
    {/* The raw text is a form field, not page content: a WebView that blocks the
        download and a clipboard that is unavailable would otherwise leave no way
        to get the data off the device at all. */}
    <label className="harmony-entry" style={{ flex: '1 1 auto', minHeight: 0 }}>
      Raw {chosen.extension.toUpperCase()} — select and copy
      <textarea readOnly value={text} onFocus={event => event.currentTarget.select()}/>
    </label>
    {status && <p className={`restore-status ${status.tone}`}>{status.message}</p>}
  </>;

  return <>
    <p className="lede">Merging keeps what is already here and adds anything missing; an attempt present in both is kept once. Replacing discards this device's history entirely, so it asks twice.</p>
    <div className="fields" style={{ flex: '0 0 auto' }}>
      <label>Backup file<input ref={fileRef} type="file" accept=".json,application/json" aria-label="Backup file"/></label>
    </div>
    <div className="actions">
      <button className="primary" onClick={() => readFile('merge')}>Merge from file</button>
      <button className="danger" onClick={() => readFile('replace')}>Replace from file</button>
    </div>
    <label className="harmony-entry" style={{ flex: '1 1 auto', minHeight: 0 }}>
      Or paste a backup
      <textarea value={pasted} placeholder='{"app":"perfect-ear", …}' onChange={event => { setPasted(event.target.value); setStatus(undefined); }}/>
    </label>
    <div className="actions">
      <button className="ghost" disabled={!pasted.trim()} onClick={() => restore(pasted, 'merge')}>Merge pasted</button>
      <button className="danger" disabled={!pasted.trim()} onClick={() => restore(pasted, 'replace')}>Replace with pasted</button>
    </div>
    {status && <p className={`restore-status ${status.tone}`}>{status.message}</p>}
  </>;
}
