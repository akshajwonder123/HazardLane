'use client';
import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { LocateFixed, Map as MapIcon } from 'lucide-react';
import { AssessedRoute, riskColor, RiskSegment, miles } from '@/lib/domain';

export function JourneyMap({ routes, selectedId, focusedSegment, onSelect }: { routes: AssessedRoute[]; selectedId: string; focusedSegment: string | null; onSelect: (id: string) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const popup = useRef<maplibregl.Popup | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const selectRef = useRef(onSelect); selectRef.current = onSelect;
  const fit = () => {
    const m = map.current; const route = routes.find(r => r.id === selectedId);
    if (!m || !route?.coordinates.length) return;
    const bounds = new maplibregl.LngLatBounds(); route.coordinates.forEach(c => bounds.extend(c));
    m.fitBounds(bounds, { padding: 60, maxZoom: 13, duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 700 });
  };
  useEffect(() => {
    if (!container.current) return;
    maplibregl.setWorkerUrl('/vendor/maplibre/maplibre-gl-worker.mjs');
    let m: maplibregl.Map;
    try { m = new maplibregl.Map({ container: container.current, style: 'https://tiles.openfreemap.org/styles/liberty', center: [-77.04, 39.05], zoom: 7.1, attributionControl: false, pitchWithRotate: false }); }
    catch { setError('The interactive map needs WebGL. Route details are still available below.'); return; }
    map.current = m;
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    m.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    m.on('load', () => {
      for (const layer of m.getStyle().layers ?? []) if (/poi|building|housenumber/i.test(layer.id)) m.setLayoutProperty(layer.id, 'visibility', 'none');
      m.addSource('routes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      m.addLayer({ id: 'route-outline', type: 'line', source: 'routes', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': ['case', ['get', 'selected'], 10, 7], 'line-opacity': 0.92 } });
      m.addLayer({ id: 'route-lines', type: 'line', source: 'routes', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': ['case', ['get', 'selected'], 6, 4], 'line-opacity': ['case', ['get', 'selected'], 1, 0.65] } });
      m.addLayer({ id: 'route-hit', type: 'line', source: 'routes', paint: { 'line-width': 22, 'line-opacity': 0 } });
      m.on('click', 'route-hit', e => {
        const p = e.features?.[0]?.properties;
        if (!p) return;
        selectRef.current(String(p.routeId));
        popup.current?.remove();
        const content = document.createElement('div');
        const title = document.createElement('strong'); title.textContent = String(p.level);
        const detail = document.createElement('p'); detail.textContent = `${p.roadName} · Mile ${Number(p.mile).toFixed(0)}`;
        content.append(title, detail);
        popup.current = new maplibregl.Popup({ closeButton: true, maxWidth: '260px' }).setLngLat(e.lngLat).setDOMContent(content).addTo(m);
      });
      m.on('mouseenter', 'route-hit', () => { m.getCanvas().style.cursor = 'pointer'; });
      m.on('mouseleave', 'route-hit', () => { m.getCanvas().style.cursor = ''; });
      setLoaded(true);
    });
    m.on('error', e => { if (!m.isStyleLoaded() && e.error) setError('Map tiles are temporarily unavailable. You can still analyze and compare routes.'); });
    const observer = new ResizeObserver(() => m.resize()); observer.observe(container.current);
    return () => { observer.disconnect(); popup.current?.remove(); markers.current.forEach(marker => marker.remove()); m.remove(); map.current = null; };
  }, []);
  useEffect(() => {
    const m = map.current; if (!m || !loaded) return;
    const sorted = [...routes].sort((a,b) => Number(a.id === selectedId) - Number(b.id === selectedId));
    (m.getSource('routes') as maplibregl.GeoJSONSource).setData({ type: 'FeatureCollection', features: sorted.flatMap(r => r.segments.map(s => ({ type: 'Feature' as const, geometry: { type: 'LineString' as const, coordinates: s.coordinates }, properties: { routeId: r.id, selected: r.id === selectedId, color: r.id === selectedId ? riskColor(s.level) : '#718093', level: s.level ?? 'Weather unavailable', roadName: s.roadName, mile: miles(s.startKm) } }))) });
    markers.current.forEach(marker => marker.remove()); markers.current = [];
    const r = routes.find(r => r.id === selectedId);
    if (r) [r.coordinates[0], r.coordinates.at(-1)!].forEach((coordinate, i) => {
      const el = document.createElement('div'); el.className = `map-marker ${i ? 'end' : ''}`; el.textContent = i ? 'B' : 'A'; el.setAttribute('aria-label', i ? 'Destination' : 'Origin');
      markers.current.push(new maplibregl.Marker({ element: el }).setLngLat(coordinate).addTo(m));
    });
    fit();
  }, [routes, selectedId, loaded]);
  useEffect(() => {
    if (!focusedSegment || !map.current) return;
    const s = routes.find(r => r.id === selectedId)?.segments.find(s => s.id === focusedSegment);
    if (s) map.current.fitBounds(new maplibregl.LngLatBounds(s.coordinates[0], s.coordinates.at(-1)!), { padding: 90, maxZoom: 12, duration: 600 });
  }, [focusedSegment]);
  return <section className="map-surface" aria-label="Interactive driving route map">
    <div ref={container} className="map-canvas" />
    <div className="map-top-label"><span className="live-dot" /> Weather along your drive</div>
    {error && <div className="map-error" role="status"><MapIcon size={20} />{error}</div>}
    {!!routes.length && <button className="fit-map" onClick={fit}><LocateFixed size={17} /> Fit route</button>}
    <div className="map-legend" aria-label="Route risk legend"><span className="legend-label">ROUTE RISK</span>{(['Low Risk','Medium Risk','High Risk'] as const).map(l => <span key={l}><i style={{ background: riskColor(l) }} />{l.replace(' Risk','')}</span>)}<span><i className="unknown-line" />Unknown</span></div>
  </section>;
}
