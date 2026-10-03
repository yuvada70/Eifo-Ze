/**
 * מפת Leaflet עם אריחי OpenStreetMap.
 *
 * משמשת בשני מקומות:
 *  • מפת החשיפה אחרי כל סיבוב — סמן על המיקום האמיתי, לתצוגה בלבד.
 *  • מסך הניהול — בחירת הקואורדינטות של מקום חדש בלחיצה על המפה.
 *
 * הגנה מפני rate limiting (הלקח ממפת ישראל): אריחים נטענים רק כשהמפה
 * נעצרת (updateWhenIdle) ולא בכל פריים של גרירה או זום, ושינויי גודל
 * של המכל עוברים throttle. שום דבר לא נשלח לשרת המשחק מתוך המפה.
 */

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { LatLng, MapView } from '@eifo/shared';

import { throttle } from '../../utils/throttle';
import styles from './WorldMap.module.css';

export interface WorldMapProps {
  /** תצוגת הפתיחה (ממוקדת ישראל / עולם). */
  readonly view: MapView;
  /** כשמוגדר — לחיצה על המפה בוחרת נקודה (מסך הניהול). */
  readonly onPick?: (point: LatLng) => void;
  /** הנקודה שנבחרה (מסך הניהול). */
  readonly selection?: LatLng | null;
  /** המיקום האמיתי (מפת החשיפה). */
  readonly truth?: LatLng | null;
  /** כשהמפתח משתנה — המפה מתמקדת בנקודה (האמת או הבחירה). */
  readonly focusKey?: string | null;
  readonly ariaLabel?: string;
  readonly className?: string;
}

/** תצוגות הפתיחה. */
const INITIAL_VIEWS: Record<MapView, { center: L.LatLngExpression; zoom: number; mobileZoom: number }> = {
  israel: { center: [31.45, 35.0], zoom: 7, mobileZoom: 6 },
  world: { center: [28, 15], zoom: 2, mobileZoom: 1 },
};

/** זום ההתמקדות בנקודה. */
const FOCUS_ZOOM: Record<MapView, number> = { israel: 9, world: 5 };

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

function isMobileWidth(): boolean {
  return typeof window !== 'undefined' && window.innerWidth < 640;
}

const SELECTION_ICON = L.divIcon({
  className: styles.pin,
  html: `<span class="${styles.pinHead}"></span>`,
  iconSize: [26, 34],
  iconAnchor: [13, 34],
});

const TRUTH_ICON = L.divIcon({
  className: styles.truth,
  html: `<span class="${styles.truthPulse}"></span><span class="${styles.truthHead}">★</span>`,
  iconSize: [40, 40],
  iconAnchor: [20, 20],
});

export function WorldMap({
  view,
  onPick,
  selection = null,
  truth = null,
  focusKey = null,
  ariaLabel = 'מפת עולם',
  className,
}: WorldMapProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

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
      zoomSnap: 0.5,
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

    // המכל משנה גודל (סיבוב טלפון, פתיחת מקלדת) — Leaflet צריך לדעת.
    const resize = throttle(() => map.invalidateSize(), 150);
    const observer = new ResizeObserver(() => resize());
    observer.observe(containerRef.current);

    mapRef.current = map;
    return () => {
      resize.cancel();
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* מעבר בין תצוגת ישראל לעולם. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || focusKey) return;
    const initial = INITIAL_VIEWS[view];
    map.setView(initial.center, isMobileWidth() ? initial.mobileZoom : initial.zoom, { animate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  /* סמנים. */
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();

    if (selection) {
      L.marker([selection.lat, selection.lng], { icon: SELECTION_ICON, interactive: false, keyboard: false }).addTo(layer);
    }
    if (truth) {
      L.marker([truth.lat, truth.lng], { icon: TRUTH_ICON, interactive: false, keyboard: false, zIndexOffset: 1000 }).addTo(
        layer,
      );
    }
  }, [selection, truth]);

  /* התמקדות בנקודה. */
  useEffect(() => {
    const map = mapRef.current;
    const target = truth ?? selection;
    if (!map || focusKey === null || !target) return;

    const timer = window.setTimeout(() => {
      map.invalidateSize();
      map.setView([target.lat, target.lng], FOCUS_ZOOM[view], { animate: false });
    }, 60);
    return () => window.clearTimeout(timer);
    // רק כשהמפתח משתנה — לא בכל עדכון.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);

  return (
    <div
      ref={containerRef}
      className={[styles.map, onPick ? styles.pickable : null, className].filter(Boolean).join(' ')}
      role={onPick ? 'application' : 'img'}
      aria-label={ariaLabel}
      dir="ltr"
    />
  );
}
