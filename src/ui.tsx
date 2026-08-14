import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Layout primitives for an app where nothing scrolls.
 *
 * The rule the whole interface is built on: every screen is exactly as tall as
 * the area it is given, and content that does not fit is paged, never scrolled
 * and never clipped. Clipping is the failure mode to fear here — an overflow
 * that is hidden looks identical to content that does not exist — so anything
 * of unknown length goes through <Pager/>, which measures the space it actually
 * has and slices the list to match.
 */

/** A full-height screen: a fixed head, and a body that takes exactly what's left. */
export function Screen({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`screen ${className}`.trim()}>{children}</div>;
}

/** The one-line title row every screen carries, with optional trailing detail. */
export function ScreenHead({ title, meta, children }: { title: ReactNode; meta?: ReactNode; children?: ReactNode }) {
  return <div className="screen-head">
    <h1>{title}</h1>
    {meta !== undefined && <span className="screen-meta">{meta}</span>}
    {children}
  </div>;
}

/** Body region: flexes to the remaining height and refuses to grow past it. */
export function ScreenBody({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`screen-body ${className}`.trim()}>{children}</div>;
}

/** A segmented control for switching sections inside one screen. */
export function Tabs<T extends string>({ value, onChange, options }: {
  value: T;
  onChange: (_value: T) => void;
  options: readonly (readonly [T, string])[];
}) {
  return <div className="tabs" role="tablist">
    {options.map(([id, label]) => <button
      key={id}
      role="tab"
      aria-selected={value === id}
      className={value === id ? 'selected' : ''}
      onClick={() => onChange(id)}
    >{label}</button>)}
  </div>;
}

/**
 * Shows as many items as genuinely fit, and pages through the rest.
 *
 * The count is measured rather than assumed because the same list has to work on
 * a short phone and a tall desktop window. Measurement runs against a render of
 * the whole list, so the tallest row is known before anything is dropped; the
 * container's own height never depends on its children (it is a flex item with
 * a fixed share), so measuring cannot feed back into itself.
 */
export function Pager<T>({ items, row, className = '', empty, label = 'items' }: {
  items: readonly T[];
  row: (_item: T, _index: number) => ReactNode;
  className?: string;
  empty?: ReactNode;
  label?: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [perPage, setPerPage] = useState(items.length || 1);
  const [measuring, setMeasuring] = useState(true);
  const [page, setPage] = useState(0);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    // A resize invalidates the count: re-render the full list so the next
    // measurement sees every row again rather than only the ones that survived
    // the previous slice.
    const observer = new ResizeObserver(() => setMeasuring(true));
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (!measuring) return;
    const box = boxRef.current;
    if (!box || !box.firstElementChild) return;
    const gap = parseFloat(getComputedStyle(box).rowGap) || 0;
    // The tallest row, not the first: a list with a two-line entry among
    // one-line entries would otherwise be told it fits one row too many.
    const tallest = Math.max(...Array.from(box.children, child => (child as HTMLElement).offsetHeight));
    if (tallest <= 0) return;
    const fits = Math.max(1, Math.floor((box.clientHeight + gap) / (tallest + gap)));
    setPerPage(fits);
    setMeasuring(false);
  }, [measuring, items.length]);

  const pages = Math.max(1, Math.ceil(items.length / perPage));
  const current = Math.min(page, pages - 1);
  const shown = measuring ? items : items.slice(current * perPage, current * perPage + perPage);

  if (!items.length && empty) return <div className="pager"><div className="pager-empty">{empty}</div></div>;

  return <div className="pager">
    <div className={`pager-box ${className}`.trim()} ref={boxRef}>{shown.map(row)}</div>
    {pages > 1 && <div className="pager-nav">
      <button aria-label={`Previous ${label}`} disabled={current === 0} onClick={() => setPage(current - 1)}>‹</button>
      <small>{current * perPage + 1}–{Math.min(items.length, (current + 1) * perPage)} of {items.length}</small>
      <button aria-label={`More ${label}`} disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>›</button>
    </div>}
  </div>;
}
