'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { Check, LoaderCircle, MapPin, X } from 'lucide-react';
import type { Location } from '@/lib/domain';
import { apiUrl } from '@/lib/api-client';

export function LocationField({ label, value, onChange }: { label: string; value: Location | null; onChange: (value: Location | null) => void }) {
  const id = useId();
  const [query, setQuery] = useState(value?.label ?? '');
  const [results, setResults] = useState<Location[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const wrapper = useRef<HTMLDivElement>(null);
  const editing = useRef(false);
  useEffect(() => { if (editing.current) { editing.current = false; return; } setQuery(value?.label ?? ''); setResults([]); setOpen(false); }, [value]);
  useEffect(() => {
    if (value || query.trim().length < 3) { setResults([]); setLoading(false); return; }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true); setError('');
      try {
        const response = await fetch(apiUrl(`/api/search?q=${encodeURIComponent(query.trim())}`), { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? 'Location search is unavailable. Try again.');
        if (!controller.signal.aborted) { setResults(data.locations); setActive(-1); setOpen(true); }
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Location search is unavailable.'); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, 400);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, value]);
  const select = (location: Location) => { onChange(location); setQuery(location.label); setOpen(false); };
  return <div className="location-field" ref={wrapper} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
    <label htmlFor={id}>{label}</label>
    <div className={`location-input ${value ? 'is-selected' : ''}`}>
      <span aria-hidden="true" className={`location-dot ${label === 'To' ? 'destination-dot' : ''}`} />
      <input id={id} role="combobox" aria-autocomplete="list" aria-expanded={open && results.length > 0} aria-controls={`${id}-options`}
        aria-activedescendant={open && active >= 0 ? `${id}-option-${active}` : undefined}
        aria-describedby={`${id}-help`} autoComplete="off" maxLength={160} placeholder={label === 'From' ? 'City or starting address' : 'Where are you heading?'} value={query}
        onFocus={() => { if (results.length) setOpen(true); }} onChange={e => { if(value) { editing.current = true; onChange(null); } setQuery(e.target.value); setResults([]); setOpen(false); setError(''); }}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(i => Math.min(i + 1, results.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)); }
          if (e.key === 'Escape') setOpen(false);
          if (e.key === 'Enter' && open && results[active]) { e.preventDefault(); select(results[active]); }
        }} />
      {loading ? <LoaderCircle className="spin" size={17} aria-label="Searching" /> : value ? <Check size={17} className="selected-check" aria-label="Location selected" /> : null}
      {query && <button type="button" className="clear-input" aria-label={`Clear ${label.toLowerCase()}`} onClick={() => { onChange(null); setQuery(''); setResults([]); wrapper.current?.querySelector('input')?.focus(); }}><X size={15} /></button>}
    </div>
    <span id={`${id}-help`} className={error ? 'field-error' : 'sr-only'} role={error ? 'status' : undefined}>{error || 'Type at least three characters, then choose a location. Use arrow keys and Enter to select.'}</span>
    {open && results.length > 0 && <ul id={`${id}-options`} role="listbox" className="suggestions" aria-label={`${label} suggestions`}>
      {results.map((location, i) => <li key={location.id} id={`${id}-option-${i}`} role="option" aria-selected={i === active} className={i === active ? 'active' : ''}
        onMouseDown={e => e.preventDefault()} onMouseEnter={() => setActive(i)} onClick={() => select(location)}><MapPin size={17} /><span>{location.label}</span></li>)}
    </ul>}
    {open && !loading && !error && !value && query.length >= 3 && results.length === 0 && <p className="field-error" role="status">No matches. Add a city, state, or postal code.</p>}
  </div>;
}
