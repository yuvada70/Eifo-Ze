/**
 * מפת העולם האינטראקטיבית (Leaflet + אריחי OpenStreetMap).
 *
 * הרכיב עוטף את Leaflet באופן אימפרטיבי: המפה נוצרת פעם אחת, ושכבות
 * הסמנים מתעדכנות לפי ה-props. כך React לא מרנדר מחדש על כל גרירה.
 *
 * הגנה מפני rate limiting (הלקח ממפת ישראל):
 *  • גרירה, תזוזה וזום הם מקומיים בלבד — לעולם לא נשלח דבר לשרת
 *    המשחק בזמן תנועת המפה. הניחוש נשלח פעם אחת, בלחיצה על "אישור".
 *  • אריחים נטענים רק כשהמפה נעצרת (updateWhenIdle) ולא בכל פריים
 *    של אנימציית זום, כדי לא להציף את שרתי האריחים של OSM.
 *  • כל מאזין לתזוזת המפה עובר throttle.
 */

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { LatLng, MapView } from '@eifo/shared';

import { throttle } from '../../utils/throttle';
import styles from './WorldMap.module.css';

export interface MapMarker {
  readonly id: string;
  readonly position: LatLng;
  readonly hue?: number;
  /** תווית קצרה (שם השחקן). */
  readonly label?: string;
  readonly emphasized?: boolean;
}

export interface MapConnector {
  readonly id: string;
  readonly from: LatLng;
  readonly to: LatLng;
  readonly hue?: number;
}

export interface WorldMapProps {
  readonly view: MapView;
  /** כשמוגדר — לחיצה על המפה מסמנת נקודה. */
  readonly onPick?: (point: LatLng) => void;
  /** הנקודה שהמשתמש סימן (טרם אישור או לאחריו). */
  readonly selection?: LatLng | null;
  readonly selectionHue?: number;
  readonly markers?: readonly MapMarker[];
  /** המיקום האמיתי (בשלב החשיפה). */
  readonly truth?: LatLng | null;
  readonly connectors?: readonly MapConnector[];
  /** כשהמפתח משתנה — המפה מתמקדת בתוכן (האמת + הסמנים). */
  readonly fitKey?: string | null;
  /** כשהמפתח משתנה — המפה חוזרת לתצוגת הפתיחה. */
  readonly resetKey?: string | number | null;
  /** דיווח (מוגבל-קצב) על מרכז המפה והזום. */
  readonly onViewChange?: (center: LatLng, zoom: number) => void;
  readonly ariaLabel?: string;
  readonly className?: string;
}

/** תצוגות הפתיחה. */
const INITIAL_VIEWS: Record<MapView, { center: L.LatLngExpression; zoom: number; mobileZoom: number }> = {
  israel: { center: [31.45, 35.0], zoom: 7, mobileZoom: 6 },
  world: { center: [28, 15], zoom: 2, mobileZoom: 1 },
};

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

/** מרווח מינימלי בין דיווחי תזוזה. */
const VIEW_CHANGE_THROTTLE_MS = 250;

function isMobileWidth(): boolean {
  return typeof window !== 'undefined' && window.innerWidth < 640;
}

function pinIcon(hue: number, options: { label?: string; emphasized?: boolean } = {}): L.DivIcon {
  const label = options.label
    ? `<span class="${styles.pinLabel}">${escapeHtml(options.label)}</span>`
    : '';
  return L.divIcon({
    className: `${styles.pin} ${options.emphasized ? styles.pinEmphasized : ''}`,
    html: `<span class="${styles.pinHead}" style="--hue:${hue}"></span>${label}`,
    iconSize: [26, 34],
    iconAnchor: [13, 34],
  });
}

const TRUTH_ICON = L.divIcon({
  className: styles.truth,
  html: `<span class="${styles.truthPulse}"></span><span class="${styles.truthHead}">★</span>`,
  iconSize: [40, 40],
  iconAnchor: [20, 20],
});

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/**
 * מתאים את קו האורך של נקודה כך שתהיה ב"עותק" העולם הקרוב לנקודת
 * הייחוס — כדי שקו בין ניחוש למקום לא יחצה את כל המפה בגלל קו התאריך.
 */
function nearestCopy(point: LatLng, reference: LatLng): L.LatLngTuple {
  let lng = point.lng;
  while (lng - reference.lng > 180) lng -= 360;
  while (lng - reference.lng < -180) lng += 360;
  return [point.lat, lng];
}

export function WorldMap({
  view,
  onPick,
  selection = null,
  selectionHue = 165,
  markers = [],
  truth = null,
  connectors = [],
  fitKey = null,
  resetKey = null,
  onViewChange,
  ariaLabel = 'מפת עולם',
  className,
}: WorldMapProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const onPickRef = useRef(onPick);
  const onViewChangeRef = useRef(onViewChange);
  onPickRef.current = onPick;
  onViewChangeRef.current = onViewChange;

  /* יצירת המפה — פעם אחת. */
  useEffect(() => {
    if (!containerRef.current) return;
    const initial = INITIAL_VIEWS[view];

    const map = L.map(containerRef.current, {
      center: initial.center,
      zoom: isMobileWidth() ? initial.mobileZoom : initial.zoom,
      minZoom: 1,
      maxZoom: 17,
      worldCopyJump: true,
      maxBounds: [
        [-85, -540],
        [85, 540],
      ],
      maxBoundsViscosity: 1,
      zoomControl: true,
      attributionControl: true,
      zoomSnap: 0.5,
      // מונע זום מקרי בגלילה של הדף בדסקטופ — רק עם Ctrl/גלגלת על המפה.
      scrollWheelZoom: true,
      tapTolerance: 12,
    });
    map.attributionControl.setPrefix(false);

    L.tileLayer(TILE_URL, {
      attribution: ATTRIBUTION,
      maxZoom: 19,
      // טעינת אריחים רק כשהמפה נעצרת — מונע הצפת בקשות בזמן גרירה/זום.
      updateWhenIdle: true,
      updateWhenZooming: false,
      keepBuffer: 2,
      crossOrigin: true,
    }).addTo(map);

    layerRef.current = L.layerGroup().addTo(map);

    map.on('click', (event: L.LeafletMouseEvent) => {
      const wrapped = event.latlng.wrap();
      onPickRef.current?.({ lat: wrapped.lat, lng: wrapped.lng });
    });

    const reportView = throttle(() => {
      const center = map.getCenter().wrap();
      onViewChangeRef.current?.({ lat: center.lat, lng: center.lng }, map.getZoom());
    }, VIEW_CHANGE_THROTTLE_MS);
    map.on('move zoom', reportView);

    // המכל משנה גודל (סיבוב טלפון, פתיחת מקלדת) — Leaflet צריך לדעת.
    const resize = throttle(() => map.invalidateSize(), 150);
    const observer = new ResizeObserver(() => resize());
    observer.observe(containerRef.current);

    mapRef.current = map;
    return () => {
      reportView.cancel();
      resize.cancel();
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* מעבר בין תצוגת ישראל לעולם, או איפוס לתחילת סיבוב. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const initial = INITIAL_VIEWS[view];
    map.setView(initial.center, isMobileWidth() ? initial.mobileZoom : initial.zoom, { animate: false });
  }, [view, resetKey]);

  /* סמני המפה. */
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();

    const reference = truth ?? selection ?? null;
    const place = (point: LatLng): L.LatLngTuple =>
      reference ? nearestCopy(point, reference) : [point.lat, point.lng];

    for (const connector of connectors) {
      L.polyline([place(connector.from), place(connector.to)], {
        color: `hsl(${connector.hue ?? 200} 80% 45%)`,
        weight: 3,
        opacity: 0.85,
        dashArray: '6 6',
        interactive: false,
      }).addTo(layer);
    }

    for (const marker of markers) {
      L.marker(place(marker.position), {
        icon: pinIcon(marker.hue ?? 200, { label: marker.label, emphasized: marker.emphasized }),
        interactive: false,
        keyboard: false,
        zIndexOffset: marker.emphasized ? 500 : 0,
      }).addTo(layer);
    }

    if (selection) {
      L.marker(place(selection), {
        icon: pinIcon(selectionHue, { emphasized: true }),
        interactive: false,
        keyboard: false,
        zIndexOffset: 800,
      }).addTo(layer);
    }

    if (truth) {
      L.marker([truth.lat, truth.lng], { icon: TRUTH_ICON, interactive: false, keyboard: false, zIndexOffset: 1000 }).addTo(
        layer,
      );
    }
  }, [connectors, markers, selection, selectionHue, truth]);

  /* התמקדות בתוצאות. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || fitKey === null || !truth) return;

    const points: L.LatLngTuple[] = [[truth.lat, truth.lng]];
    for (const marker of markers) points.push(nearestCopy(marker.position, truth));
    if (selection) points.push(nearestCopy(selection, truth));

    const timer = window.setTimeout(() => {
      map.invalidateSize();
      if (points.length === 1) {
        map.setView(points[0]!, view === 'israel' ? 10 : 6, { animate: true });
      } else {
        map.fitBounds(L.latLngBounds(points), {
          padding: [36, 36],
          maxZoom: view === 'israel' ? 11 : 8,
          animate: true,
        });
      }
    }, 60);
    return () => window.clearTimeout(timer);
    // רק כשהמפתח משתנה — לא בכל עדכון של הסמנים.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  return (
    <div
      ref={containerRef}
      className={[styles.map, onPick ? styles.pickable : null, className].filter(Boolean).join(' ')}
      role="application"
      aria-label={ariaLabel}
      dir="ltr"
    />
  );
}
