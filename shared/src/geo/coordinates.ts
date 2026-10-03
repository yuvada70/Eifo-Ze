/**
 * טיפוסים ופעולות בסיסיות על קואורדינטות גיאוגרפיות (WGS84).
 */

/** נקודה גיאוגרפית: קו רוחב (lat) וקו אורך (lng) במעלות עשרוניות. */
export interface LatLng {
  readonly lat: number;
  readonly lng: number;
}

/** רדיוס כדור הארץ הממוצע בקילומטרים. */
export const EARTH_RADIUS_KM = 6371.0088;

const DEG_TO_RAD = Math.PI / 180;

/**
 * מרחק גיאודזי בין שתי נקודות בקילומטרים (Haversine). משמש לבחירת
 * מסיחים קרובים בדרגת "מקצוענים" ולזיהוי כפילויות במאגר.
 */
export function haversineDistanceKm(a: LatLng, b: LatLng): number {
  const dLat = (b.lat - a.lat) * DEG_TO_RAD;
  const dLng = (b.lng - a.lng) * DEG_TO_RAD;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(a.lat * DEG_TO_RAD) * Math.cos(b.lat * DEG_TO_RAD) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** בדיקה שהערך הוא נקודה גיאוגרפית תקינה. */
export function isValidLatLng(value: unknown): value is LatLng {
  if (typeof value !== 'object' || value === null) return false;
  const { lat, lng } = value as Record<string, unknown>;
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}
