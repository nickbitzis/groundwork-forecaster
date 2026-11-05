import { useEffect, useId, useState, type ReactNode } from 'react';

type Unit = '$' | '%' | 'x' | 'hrs' | 'mo' | 'yrs' | 'days' | '' | '#';

const prefixUnits: Unit[] = ['$'];

function fmtTypical(v: number, unit: Unit): string {
  if (unit === '$') return `$${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  if (unit === '%') return `${v}%`;
  if (unit === '' || unit === '#') return v.toLocaleString('en-US');
  return `${v} ${unit}`;
}

export function NumberField(props: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  unit?: Unit;
  why?: ReactNode;
  typical?: number;
  benchmark?: string;
  step?: number;
  min?: number;
  max?: number;
  id?: string;
}) {
  const autoId = useId();
  const id = props.id ?? autoId;
  const unit = props.unit ?? '';
  const [text, setText] = useState(String(props.value));
  useEffect(() => {
    if (Number(text) !== props.value) setText(String(props.value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.value]);
  const commit = (s: string) => {
    setText(s);
    const n = Number(s.replace(/[$,%\s]/g, ''));
    if (s.trim() !== '' && Number.isFinite(n)) {
      let v = n;
      if (props.min !== undefined) v = Math.max(props.min, v);
      if (props.max !== undefined) v = Math.min(props.max, v);
      props.onChange(v);
    }
  };
  const showTypical = props.typical !== undefined && props.typical !== props.value;
  return (
    <div className="field">
      <label htmlFor={id}>{props.label}</label>
      <div className="input-wrap">
        {prefixUnits.includes(unit) && <span className="affix">{unit}</span>}
        <input id={id} inputMode="decimal" value={text} step={props.step} onChange={(e) => commit(e.target.value)} onBlur={() => setText(String(props.value))} />
        {!prefixUnits.includes(unit) && unit && <span className="affix">{unit}</span>}
      </div>
      {props.why && <span className="why">{props.why}</span>}
      {(showTypical || props.benchmark) && (
        <span className="typical">
          {props.benchmark && <span>{props.benchmark}.</span>}
          {showTypical && (
            <span>
              Default {fmtTypical(props.typical!, unit)}{' '}
              <button type="button" onClick={() => props.onChange(props.typical!)}>Use default</button>
            </span>
          )}
        </span>
      )}
    </div>
  );
}

export function TextField(props: { label: string; value: string; onChange: (v: string) => void; why?: ReactNode; type?: string; id?: string }) {
  const autoId = useId();
  const id = props.id ?? autoId;
  return (
    <div className="field">
      <label htmlFor={id}>{props.label}</label>
      <div className="input-wrap">
        <input id={id} type={props.type ?? 'text'} value={props.value} onChange={(e) => props.onChange(e.target.value)} />
      </div>
      {props.why && <span className="why">{props.why}</span>}
    </div>
  );
}

export function SelectField<T extends string>(props: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; why?: ReactNode }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{props.label}</label>
      <div className="input-wrap">
        <select id={id} value={props.value} onChange={(e) => props.onChange(e.target.value as T)}>
          {props.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      {props.why && <span className="why">{props.why}</span>}
    </div>
  );
}

export function Segmented<T extends string>(props: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="seg" role="group" aria-label={props.label}>
      {props.options.map((o) => (
        <button key={o.value} type="button" aria-pressed={props.value === o.value} onClick={() => props.onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Toggle(props: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
      {props.label}
    </label>
  );
}

export type Status = 'ok' | 'watch' | 'risk';

/** Status says its meaning in words and shape; color only reinforces it. */
export function Pill({ status, children }: { status: Status; children?: ReactNode }) {
  const icon = status === 'ok'
    ? <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6.5l2.5 2.5L10 3.5" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
    : status === 'watch'
      ? <svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
      : <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1L11.5 11H0.5Z" fill="currentColor" /></svg>;
  const word = children ?? (status === 'ok' ? 'OK' : status === 'watch' ? 'Watch' : 'Risk');
  return <span className={`pill pill-${status}`}>{icon}{word}</span>;
}
