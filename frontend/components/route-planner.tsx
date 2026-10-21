'use client';
import dynamic from 'next/dynamic';
import { useRef, useState } from 'react';
import { ArrowDownUp, ArrowRight, CloudSun, Compass, Info, LoaderCircle, Route, ShieldCheck, TriangleAlert, X } from 'lucide-react';
import { LocationField } from './location-field';
import { Location, RouteAnalysis, miles, duration } from '@/lib/domain';
import { apiUrl } from '@/lib/api-client';

const JourneyMap = dynamic(() => import('./journey-map').then(m => m.JourneyMap), { ssr: false, loading: () => <div className="map-surface map-loading" role="status"><Compass size={28} /><span>Opening the map…</span></div> });
export function RoutePlanner() {
  const [origin, setOrigin] = useState<Location | null>(null);
  const [destination, setDestination] = useState<Location | null>(null);
  const [analysis, setAnalysis] = useState<RouteAnalysis | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [focusedSegment, setFocusedSegment] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const controller = useRef<AbortController | null>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const selected = analysis?.routes.find(r => r.id === selectedId);
  const change = (value: Location | null, from: boolean) => { controller.current?.abort(); setLoading(false); setAnalysis(null); setError(''); from ? setOrigin(value) : setDestination(value); };
  async function analyze() {
    if (!origin || !destination) return;
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    const timeout = setTimeout(() => abort.abort('timeout'), 65000);
    setLoading(true); setError(''); setAnalysis(null);
    try {
      const res = await fetch(apiUrl('/api/analyze'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ origin, destination }), signal: abort.signal });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Route analysis is unavailable. Please try again.');
      if (!abort.signal.aborted) { setAnalysis(data); setSelectedId(data.recommendedId); setTimeout(() => resultHeading.current?.focus(), 0); }
    } catch (e) {
      if (!abort.signal.aborted || abort.signal.reason === 'timeout') setError(abort.signal.reason === 'timeout' ? 'This analysis took too long. Please try again in a moment.' : e instanceof Error ? e.message : 'Could not reach HazardLane. Check your connection and try again.');
    } finally { clearTimeout(timeout); if(controller.current === abort) setLoading(false); }
  }
  return <div className="app-shell">
    <a className="skip-link" href="#route-controls">Skip to route planner</a>
    <header className="app-header"><a className="brand" href="/" aria-label="HazardLane home"><span className="brand-mark"><Route size={22} /></span>Hazard<span>Lane</span></a><div className="header-right"><span className="header-note">A little foresight. A better drive.</span><button className="method-button" onClick={() => dialog.current?.showModal()}><Info size={17} /><span>How it works</span></button></div></header>
    <main className="workspace">
      <aside className="planner-panel" id="route-controls" aria-label="Route planner and results">
        <div className="planner-intro"><p className="eyebrow"><CloudSun size={16} /> WEATHER-AWARE ROUTING</p><h1>Plan your drive.</h1><p>See the conditions ahead. Compare your options.</p></div>
        <form className="route-form" onSubmit={e => { e.preventDefault(); void analyze(); }}>
          <LocationField label="From" value={origin} onChange={v => change(v,true)} />
          <button type="button" className="swap-button" aria-label="Swap origin and destination" onClick={() => {controller.current?.abort(); setLoading(false); setOrigin(destination); setDestination(origin); setAnalysis(null); setError(''); }}><ArrowDownUp size={17} /></button>
          <LocationField label="To" value={destination} onChange={v => change(v,false)} />
          <button className="analyze-button" disabled={!origin || !destination || loading} type="submit">{loading ? <><LoaderCircle size={18} className="spin" /> Analyzing your route…</> : <>Analyze route <ArrowRight size={18} /></>}</button>
          <p className="departure-note">Leaving now <span>·</span> Driving <span>·</span> No live traffic</p>
        </form>
        {error && <div className="error-box" role="alert"><TriangleAlert size={20} /><div><strong>We couldn’t finish this route.</strong><p>{error}</p></div></div>}
        {loading && <div className="analysis-progress" role="status" aria-live="polite"><div className="progress-track"><span /></div><h2>Checking the journey ahead</h2><p>Finding routes, checking forecasts and matching official alerts along the road.</p><div className="skeleton-line" /><div className="skeleton-line short" /><button className="text-button" onClick={() => {controller.current?.abort(); setLoading(false);}}>Cancel analysis</button></div>}
        {!analysis && !loading && <div className="empty-state"><div className="empty-symbol"><Route size={30} /></div><h2>The whole journey, in view.</h2><p>We check weather along the road, then highlight sections that deserve your attention.</p><div className="empty-steps"><span><i>A</i>Choose two locations</span><span><ShieldCheck size={18} />Compare route risks</span></div><button className="example-button" onClick={() => {change({ id:'example-dc', label:'Washington, District of Columbia, United States',lat:38.9072,lon:-77.0369,countryCode:'US'},true);setDestination({ id:'example-baltimore',label:'Baltimore, Maryland, United States',lat:39.2904,lon:-76.6122,countryCode:'US'});}}>Try Washington → Baltimore <ArrowRight size={14} /></button></div>}
        {analysis && <div className="results">
          <div className="section-title"><h2 ref={resultHeading} tabIndex={-1}>Your route options</h2><span>{analysis.routes.length} {analysis.routes.length === 1 ? 'route' : 'routes'}</span></div>
          <p className="recommendation">{analysis.recommendation}</p>
          <div className="route-options">{analysis.routes.map((r, i) => <button key={r.id} className={`route-card ${r.id === selectedId ? 'selected' : ''}`} aria-pressed={r.id === selectedId} onClick={() => {setSelectedId(r.id);setFocusedSegment(null);}}>
            <div className="route-card-top"><span className="route-name">{r.name}</span>{r.id === analysis.recommendedId && <span className="recommended-tag">Recommended</span>}</div>
            <div className="route-card-main"><strong>{duration(r.durationSeconds)}</strong><span>{Math.round(miles(r.distanceKm))} mi</span><span className={`risk-pill ${r.level?.split(' ')[0].toLowerCase() ?? 'unknown'}`}>{r.level ?? 'Risk unavailable'}</span></div>
            <p>{r.summary}</p>
            {i > 0 && <span className="route-delta">{Math.round((r.durationSeconds-analysis.routes[0].durationSeconds)/60) >= 0 ? '+' : ''}{Math.round((r.durationSeconds-analysis.routes[0].durationSeconds)/60)} min · {r.distanceKm >= analysis.routes[0].distanceKm ? '+' : ''}{Math.round(miles(r.distanceKm-analysis.routes[0].distanceKm))} mi{r.score !== null && analysis.routes[0].score !== null ? ` · Risk ${r.score-analysis.routes[0].score > 0 ? '+' : ''}${r.score-analysis.routes[0].score} points` : ''}</span>}
          </button>)}</div>
          {selected && <>
            <div className="journey-facts"><span><strong>{selected.sampleCount}</strong> weather locations</span><span><strong>{selected.highRiskKm ? `${miles(selected.highRiskKm) < .1 ? '<0.1' : miles(selected.highRiskKm).toFixed(1)} mi` : '0 mi'}</strong> detected High Risk</span></div>
            <div className="risk-strip" aria-label="Risk along the route">{selected.segments.map(s => <span key={s.id} className={s.level?.split(' ')[0].toLowerCase() ?? 'unknown'} style={{flex:Math.max(.01,s.endKm-s.startKm)}} title={`${s.level ?? 'Unknown'}: mile ${miles(s.startKm).toFixed(0)}–${miles(s.endKm).toFixed(0)}`} />)}</div><div className="strip-labels"><span>Start</span><span>{Math.round(miles(selected.distanceKm))} miles</span><span>Finish</span></div>
            <section className="hazards"><h3>Along this route</h3>{selected.hazards.length ? selected.hazards.slice(0,8).map((h,i) => <article className="hazard" key={`${h.kind}-${i}`}><TriangleAlert size={18} className={h.score >=60 ? 'high-text' : 'medium-text'} /><div><h4>{h.title}</h4><p>{h.detail}</p><button className="text-button" onClick={() => {const s=selected.segments.find(s=>s.startKm<=h.startKm&&s.endKm>h.startKm);setFocusedSegment(s?.id??null);}}>{h.roadName} · Mile {miles(h.startKm).toFixed(0)}–{miles(h.endKm).toFixed(0)}</button>{h.url && <a className="official-link" href={h.url} target="_blank" rel="noreferrer">Official alert ↗</a>}</div></article>) : <p className="no-hazards"><ShieldCheck size={20} />{selected.knownWeatherPercent >=95 ? 'No significant hazards detected in the available data.' : 'Available data is limited. Undetected hazards may be present.'}</p>}</section>
            <details className="data-details"><summary>Data coverage & details <span>{selected.knownWeatherPercent}% weather</span></summary><dl>{Object.entries(selected.data).map(([key,status])=><div key={key}><dt>{key === 'events' ? 'Road events' : key === 'roads' ? 'Mapped road data' : key === 'alerts' ? 'Official alerts' : 'Forecasts'} <span>{status.state.replace('-',' ')}</span></dt><dd>{status.detail}</dd></div>)}</dl><p>Internal risk: {selected.score ?? 'unknown'}/100. Peak section: {selected.peakScore ?? 'unknown'}/100. These are model indices, not crash probabilities.</p><p>Analyzed {new Date(analysis.analyzedAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}. Forecasts follow estimated arrival times; active alerts describe the current official outlook.</p></details>
          </>}
          {analysis.limitations.length > 0 && <p className="coverage-note"><Info size={16} />{analysis.limitations.join(' ')}</p>}
        </div>}
        <footer className="planner-footer"><ShieldCheck size={17} /><p>Informational guidance. No route is guaranteed safe. Follow official alerts, road closures and local authorities.</p></footer>
      </aside>
      <JourneyMap routes={analysis?.routes ?? []} selectedId={selectedId} focusedSegment={focusedSegment} onSelect={setSelectedId} />
    </main>
    <dialog ref={dialog} className="method-dialog" onClick={e => {if(e.target===dialog.current)dialog.current.close();}}><div className="dialog-heading"><span className="eyebrow">HazardLane method</span><button aria-label="Close methodology" className="icon-button" onClick={()=>dialog.current?.close()}><X size={22} /></button></div><h2>A forecast for your journey.</h2><p>HazardLane follows real road geometry and checks multiple locations at their estimated arrival times. Official US weather alerts are matched geographically, alongside available OpenStreetMap road attributes and fresh regional work-zone feeds.</p><h3>How risk is calculated</h3><p>A deterministic 0–100 model considers precipitation, gusts, visibility, snow and possible ice. Wet, near-freezing conditions carry more weight than temperature alone. Severe intersecting warnings can immediately raise a section to High Risk.</p><p>Low Risk is below 30, Medium Risk is 30–59, and High Risk is 60 or above. Overall risk combines distance-weighted exposure, the 90th percentile and the peak section. A short dangerous section cannot disappear in an average. Risk is an experimental index, not a validated probability of an accident.</p><h3>Choosing an option</h3><p>When conditions are Low Risk, the efficient route normally wins. Alternatives need a material risk reduction and a reasonable detour to be recommended. Incomplete weather data limits comparisons.</p><h3>What the data cannot tell you</h3><p>Forecasts may miss localized changes. Sampling is coarser on long trips. Mapped roads do not describe current pavement or potholes. Work-zone coverage is regional and incomplete; an empty result does not mean no closures. Conditions, alert status and travel time may change after analysis.</p><div className="source-links"><a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a><a href="https://www.weather.gov/" target="_blank" rel="noreferrer">NWS</a><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a><a href="https://openfreemap.org/" target="_blank" rel="noreferrer">OpenFreeMap</a><a href="https://valhalla.github.io/valhalla/" target="_blank" rel="noreferrer">Valhalla</a><a href="https://photon.komoot.io/" target="_blank" rel="noreferrer">Photon</a><a href="https://iowadot.gov/travel-tools/iowa-511/511-data-feeds" target="_blank" rel="noreferrer">Iowa DOT</a></div><p className="privacy-note">Search text and route coordinates are sent to the relevant data providers. No account is required. HazardLane keeps no journey history, but temporarily caches provider responses. Providers may retain requests under their own privacy policies.</p></dialog>
  </div>;
}
