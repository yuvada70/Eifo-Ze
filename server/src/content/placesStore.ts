/**
 * טעינת מאגר המקומות מהקובץ data/places.json.
 *
 * הקובץ ב-repo הוא מקור האמת. הוא נקרא פעם אחת בעליית השרת ועובר
 * אימות מלא; רשומה פגומה נרשמת ביומן ומדולגת, כדי שטעות בפריט אחד
 * לא תפיל את כל המשחק.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { validatePlacesFile, type Place } from '@eifo/shared';

import { logger } from '../logger.js';

export interface PlacesStore {
  all(): readonly Place[];
  /** תוכן הקובץ המקורי (לייצוא במסך הניהול). */
  raw(): unknown;
}

export function loadPlaces(filePath: string): PlacesStore {
  const resolved = path.resolve(process.cwd(), filePath);
  const raw: unknown = JSON.parse(readFileSync(resolved, 'utf8'));
  const result = validatePlacesFile(raw);

  for (const error of result.errors) logger.warn('places.invalid_entry', { error });
  logger.info('places.loaded', { file: resolved, count: result.places.length, invalid: result.errors.length });

  if (result.places.length === 0) throw new Error(`מאגר המקומות ריק או פגום: ${resolved}`);

  const places = result.places;
  return { all: () => places, raw: () => raw };
}

/** מאגר בזיכרון — לבדיקות. */
export function inMemoryPlaces(places: readonly Place[]): PlacesStore {
  return { all: () => places, raw: () => ({ version: 1, places }) };
}
