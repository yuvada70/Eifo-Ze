#!/usr/bin/env node
/**
 * אימות מבני של data/places.json (ללא רשת):
 * שדות חובה, רישיון מותר, קואורדינטות תקינות, מזהים ייחודיים,
 * כפילויות של אותו מקום, וכמות מקומות לכל שילוב קטגוריה × דרגה.
 *
 * שימוש: npm run validate:places
 */

import { PLACES_FILE, loadShared, readPlaces } from './lib.mjs';

const MIN_PER_POOL = 25;

const shared = await loadShared();
const raw = readPlaces(process.argv[2] ?? PLACES_FILE);
const result = shared.validatePlacesFile(raw);

let failed = false;
for (const error of result.errors) {
  console.error(`✗ ${error}`);
  failed = true;
}

// אותו קובץ תמונה פעמיים, או שני מקומות כמעט באותה נקודה.
const byFile = new Map();
for (const place of result.places) {
  const key = shared.normalizeCommonsFileName(place.image.file);
  if (byFile.has(key)) {
    console.error(`✗ אותה תמונה פעמיים: ${byFile.get(key)} ו-${place.id}`);
    failed = true;
  }
  byFile.set(key, place.id);
}
for (let i = 0; i < result.places.length; i += 1) {
  for (let j = i + 1; j < result.places.length; j += 1) {
    const a = result.places[i];
    const b = result.places[j];
    const km = shared.haversineDistanceKm(a, b);
    if (km < 0.05) console.warn(`⚠ ${a.id} ו-${b.id} במרחק ${Math.round(km * 1000)} מ׳ זה מזה — כפילות?`);
  }
}

const counts = shared.countPools(result.places);
console.log('\nכמות מקומות לכל שילוב:');
console.log(['קטגוריה'.padEnd(18), ...shared.DIFFICULTIES.map((d) => shared.DIFFICULTY_LABELS[d].padStart(9))].join(''));
for (const category of shared.CONTENT_CATEGORIES) {
  const row = shared.DIFFICULTIES.map((d) => {
    const n = counts[category][d];
    const low = category !== 'mixed' && n < MIN_PER_POOL;
    return `${low ? '⚠' : ' '}${String(n).padStart(8)}`;
  });
  console.log([shared.CATEGORY_LABELS[category].padEnd(18), ...row].join(''));
}

const doubtful = result.places.filter((place) => place.note);
console.log(`\nסה"כ ${result.places.length} מקומות תקינים · ${doubtful.length} מסומנים לאימות ידני (שדה note).`);

if (failed) {
  console.error('\nנמצאו שגיאות.');
  process.exit(1);
}
console.log('✓ המאגר תקין.');
