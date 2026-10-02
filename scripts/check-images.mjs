#!/usr/bin/env node
/**
 * בדיקת התמונות במאגר — עוברת על כל המקומות ומוודאת ש:
 *   1. הקובץ קיים ב-Wikimedia Commons.
 *   2. הרישיון שלו ב-Commons חופשי (Public domain / CC0 / CC BY / CC BY-SA).
 *   3. הכתובת שהמשחק משתמש בה (Special:FilePath?width=…) באמת מחזירה תמונה.
 *
 * מדווחת על קישורים שבורים ויוצאת עם קוד שגיאה אם יש כאלה.
 *
 * שימוש:
 *   npm run check:images                 # כל המאגר
 *   npm run check:images -- --json out.json
 *   npm run check:images -- path/to/places.json
 */

import { writeFileSync } from 'node:fs';

import { PLACES_FILE, commonsImageInfo, fetchWithRetry, loadShared, mapLimit, readPlaces } from './lib.mjs';

const args = process.argv.slice(2);
const jsonIndex = args.indexOf('--json');
const jsonOut = jsonIndex >= 0 ? args[jsonIndex + 1] : null;
const file = args.find((arg, index) => !arg.startsWith('--') && index !== jsonIndex + 1) ?? PLACES_FILE;

const shared = await loadShared();
const { places, errors } = shared.validatePlacesFile(readPlaces(file));
for (const error of errors) console.error(`✗ רשומה פגומה: ${error}`);

console.log(`בודק ${places.length} תמונות…`);

const files = places.map((place) => shared.normalizeCommonsFileName(place.image.file));
const info = await commonsImageInfo(files);

const report = await mapLimit(places, 6, async (place) => {
  const name = shared.normalizeCommonsFileName(place.image.file);
  const meta = info.get(name);
  const problems = [];
  const warnings = [];

  if (!meta?.exists) {
    problems.push('הקובץ לא קיים ב-Commons');
  } else {
    if (!shared.isAllowedLicense(meta.license)) problems.push(`רישיון ב-Commons אינו חופשי: "${meta.license}"`);
    if (meta.license && meta.license.toLowerCase() !== place.image.license.toLowerCase()) {
      warnings.push(`הרישיון במאגר ("${place.image.license}") שונה מ-Commons ("${meta.license}")`);
    }
    if (meta.width && meta.width < 640) warnings.push(`רזולוציה נמוכה (${meta.width}px)`);
  }

  const url = shared.commonsImageUrl(name, shared.ROUND_IMAGE_WIDTH);
  try {
    const response = await fetchWithRetry(url, { method: 'GET' }, 4);
    const type = response.headers.get('content-type') ?? '';
    if (!response.ok) problems.push(`הכתובת החזירה HTTP ${response.status}`);
    else if (!type.startsWith('image/')) problems.push(`הכתובת לא החזירה תמונה (${type})`);
    await response.arrayBuffer();
  } catch (error) {
    problems.push(`שגיאת רשת: ${error.message}`);
  }

  return { id: place.id, name: place.name, file: name, url, problems, warnings, commons: meta ?? null };
});

const broken = report.filter((entry) => entry.problems.length > 0);
const warned = report.filter((entry) => entry.warnings.length > 0);

for (const entry of warned) console.warn(`⚠ ${entry.id}: ${entry.warnings.join('; ')}`);
for (const entry of broken) console.error(`✗ ${entry.id} (${entry.file}): ${entry.problems.join('; ')}`);

if (jsonOut) writeFileSync(jsonOut, JSON.stringify(report, null, 2));

console.log(`\n${places.length - broken.length}/${places.length} תמונות תקינות · ${broken.length} שבורות · ${warned.length} אזהרות`);
process.exit(broken.length > 0 || errors.length > 0 ? 1 : 0);
