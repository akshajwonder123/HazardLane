import type { AreaGeometry, Coordinate } from '../lib/domain';
export function record(value: unknown): Record<string, unknown> | null { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string,unknown> : null; }
export function coordinate(value: unknown): value is Coordinate {
  return Array.isArray(value) && value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number' &&
    Number.isFinite(value[0]) && Number.isFinite(value[1]) && Math.abs(value[0])<=180 && Math.abs(value[1])<=90;
}
/** Enforce GeoJSON closed rings and bound work before geometric intersections. */
export function areaGeometry(value: unknown): AreaGeometry | null {
  const obj=record(value);if(!obj || !['Polygon','MultiPolygon'].includes(String(obj.type)) || !Array.isArray(obj.coordinates)) return null;
  const polygons=obj.type==='Polygon'?[obj.coordinates]:obj.coordinates;
  let vertices=0;
  if (!polygons.length || polygons.length>500) return null;
  for(const polygon of polygons) {
    if(!Array.isArray(polygon)||!polygon.length||polygon.length>500) return null;
    for(const ring of polygon) {
      if(!Array.isArray(ring)||ring.length<4||!ring.every(coordinate)) return null;
      vertices+=ring.length;if(vertices>100000) return null;
      const first=ring[0],last=ring[ring.length-1];if(first[0]!==last[0]||first[1]!==last[1]) return null;
    }
  }
  return obj as unknown as AreaGeometry;
}
export function safeText(value: unknown, max=500): string { return typeof value==='string' ? value.replace(/[\u0000-\u001f]/g,' ').slice(0,max) : ''; }
export function isoTime(value: unknown): string | null {
  if(typeof value!=='string' || !/T.*(?:Z|[+-]\d\d:\d\d)$/.test(value)) return null;
  const time=Date.parse(value);return Number.isFinite(time)?new Date(time).toISOString():null;
}
