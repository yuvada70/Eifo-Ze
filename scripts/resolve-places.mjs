#!/usr/bin/env node
/**
 * בונה רשומות מקומות מתוך קובצי "זרע" (scripts/seeds/*.json) בעזרת
 * Wikipedia, Wikidata ו-Wikimedia Commons:
 *
 *   • קואורדינטות — מ-Wikidata (P625) ומהערך בוויקיפדיה. אם שני המקורות
 *     רחוקים זה מזה, הפריט מסומן בהערת אימות (note).
 *   • תמונה — קודם קובץ שנבחר ידנית בזרע (file), אחר כך התמונה הראשית
 *     ב-Wikidata (P18), ואחר כך התמונה הראשית של הערך. כשמבוקשת "זווית
 *     לא שגרתית" (alt: N) — נבחרת התמונה ה-N מקטגוריית Commons של המקום.
 *     נבחרת רק תמונה ברישיון חופשי (PD / CC0 / CC BY / CC BY-SA) ברוחב 800+.
 *   • קרדיט — שם היוצר והרישיון מתוך המטא-דאטה של Commons.
 *
 * זרע לדוגמה:
 *   { "id": "eiffel-tower", "wiki": "Eiffel Tower", "name": "מגדל אייפל",
 *     "city": "פריז", "country": "צרפת", "category": "europe",
 *     "difficulty": "easy", "fact": "…" }
 *   wiki יכול להתחיל ב-"he:" לערך בוויקיפדיה העברית.
 *
 * פלט: scripts/out/places.generated.json + scripts/out/resolve-report.md
 * שימוש: node scripts/resolve-places.mjs [seed-file …]
 */

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { ROOT, chunk, commonsImageInfo, fetchJson, haversine, loadShared, sleep } from './lib.mjs';

const shared = await loadShared();
const SEEDS_DIR = path.join(ROOT, 'scripts', 'seeds');
const OUT_DIR = path.join(ROOT, 'scripts', 'out');
mkdirSync(OUT_DIR, { recursive: true });

const seedFiles = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(SEEDS_DIR).filter((f) => f.endsWith('.json')).sort().map((f) => path.join(SEEDS_DIR, f));

const seeds = seedFiles.flatMap((file) => JSON.parse(readFileSync(file, 'utf8')));
console.log(`${seeds.length} זרעים מ-${seedFiles.length} קבצים`);

const BAD_FILE = /(map|karte|carte|mapa|flag|coat[_ ]of[_ ]arms|wappen|logo|locator|location|seal|emblem|plan\b|diagram|svg$|\.gif$|panorama.*\.tif)/i;
const PHOTO_EXT = /\.(jpe?g|png|webp|tiff?)$/i;

/* ── 1. Wikipedia: קואורדינטות, תמונה ראשית, מזהה Wikidata ───────────── */

function parseWiki(seed) {
  const [maybeLang, ...rest] = seed.wiki.split(':');
  if (rest.length && /^[a-z]{2,3}$/.test(maybeLang)) return { lang: maybeLang, title: rest.join(':') };
  return { lang: 'en', title: seed.wiki };
}

const wikiData = new Map(); // key `${lang}:${title}` → {coord, pageImage, qid}
const byLang = new Map();
for (const seed of seeds) {
  const { lang, title } = parseWiki(seed);
  if (!byLang.has(lang)) byLang.set(lang, new Set());
  byLang.get(lang).add(title);
}

for (const [lang, titles] of byLang) {
  for (const group of chunk([...titles], 50)) {
    const url =
      `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&redirects=1` +
      '&prop=coordinates|pageimages|pageprops&piprop=original&ppprop=wikibase_item|disambiguation&colimit=max' +
      `&titles=${encodeURIComponent(group.join('|'))}`;
    const data = await fetchJson(url);
    const alias = new Map();
    for (const n of data.query?.normalized ?? []) alias.set(n.to, n.from);
    for (const r of data.query?.redirects ?? []) alias.set(r.to, alias.get(r.from) ?? r.from);
    for (const page of data.query?.pages ?? []) {
      const original = alias.get(page.title) ?? page.title;
      const coord = page.coordinates?.find((c) => c.primary !== false) ?? page.coordinates?.[0];
      const source = page.original?.source;
      wikiData.set(`${lang}:${original}`, {
        missing: Boolean(page.missing),
        disambiguation: page.pageprops?.disambiguation !== undefined,
        coord: coord ? { lat: coord.lat, lng: coord.lon } : null,
        pageImage: source ? decodeURIComponent(source.split('/').pop()).replace(/_/g, ' ') : null,
        qid: page.pageprops?.wikibase_item ?? null,
      });
    }
    await sleep(150);
  }
}

/* ── 2. Wikidata: P625, P18, P373 ──────────────────────────────────── */

/* חיפוש חלופי לערכים חסרים או עמודי פירושונים: הערך הראשון בתוצאות. */
for (const seed of seeds) {
  const { lang, title } = parseWiki(seed);
  const entry = wikiData.get(`${lang}:${title}`);
  if (entry && !entry.missing && !entry.disambiguation && (entry.coord || entry.qid)) continue;
  const query = seed.search ?? title;
  const search = await fetchJson(
    `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&list=search&srlimit=1&srsearch=${encodeURIComponent(query)}`,
  );
  const found = search.query?.search?.[0]?.title;
  if (!found || found === title) continue;
  const data = await fetchJson(
    `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&redirects=1` +
      '&prop=coordinates|pageimages|pageprops&piprop=original&ppprop=wikibase_item|disambiguation&colimit=max' +
      `&titles=${encodeURIComponent(found)}`,
  );
  const page = data.query?.pages?.[0];
  if (!page || page.missing) continue;
  const coord = page.coordinates?.find((c) => c.primary !== false) ?? page.coordinates?.[0];
  const source = page.original?.source;
  wikiData.set(`${lang}:${title}`, {
    missing: false,
    resolvedTitle: page.title,
    coord: coord ? { lat: coord.lat, lng: coord.lon } : null,
    pageImage: source ? decodeURIComponent(source.split('/').pop()).replace(/_/g, ' ') : null,
    qid: page.pageprops?.wikibase_item ?? null,
  });
  console.log(`🔎 ${seed.id}: "${title}" → "${page.title}"`);
  await sleep(150);
}

const qids = [...new Set([...wikiData.values()].map((w) => w.qid).filter(Boolean))];
const entities = new Map();
for (const group of chunk(qids, 50)) {
  const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims&ids=${group.join('|')}`;
  const data = await fetchJson(url);
  for (const [qid, entity] of Object.entries(data.entities ?? {})) entities.set(qid, entity);
  await sleep(150);
}

function claimValues(entity, property) {
  const claims = entity?.claims?.[property] ?? [];
  const preferred = claims.filter((c) => c.rank === 'preferred');
  const ordered = [...preferred, ...claims.filter((c) => c.rank === 'normal')];
  return ordered.map((c) => c.mainsnak?.datavalue?.value).filter((v) => v !== undefined);
}

/* ── 3. מועמדות לתמונה ─────────────────────────────────────────────── */

async function categoryFiles(category) {
  const url =
    'https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2&list=categorymembers' +
    `&cmtype=file&cmlimit=200&cmtitle=${encodeURIComponent(`Category:${category}`)}`;
  const data = await fetchJson(url);
  return (data.query?.categorymembers ?? []).map((m) => m.title.replace(/^File:/, ''));
}

const prepared = [];
for (const seed of seeds) {
  const { lang, title } = parseWiki(seed);
  const wiki = wikiData.get(`${lang}:${title}`);
  const entity = wiki?.qid ? entities.get(wiki.qid) : null;
  const wdCoord = claimValues(entity, 'P625')[0];
  const wdImages = claimValues(entity, 'P18');
  const commonsCategory = claimValues(entity, 'P373')[0] ?? null;

  let candidates = [];
  if (seed.file) candidates.push(seed.file);
  if (seed.alt && commonsCategory) {
    const files = (await categoryFiles(commonsCategory)).filter((f) => PHOTO_EXT.test(f) && !BAD_FILE.test(f) && !wdImages.includes(f));
    // מדלגים על הראשונים (בדרך כלל הצילומים הסטנדרטיים) ולוקחים כמה מאמצע הרשימה.
    const start = Math.min(files.length - 1, Math.max(0, Number(seed.alt) * 7));
    candidates.push(...files.slice(start), ...files.slice(0, start));
    await sleep(100);
  }
  candidates.push(...wdImages);
  if (wiki?.pageImage) candidates.push(wiki.pageImage);
  candidates = [...new Set(candidates.map((f) => shared.normalizeCommonsFileName(f)))].filter(
    (f) => PHOTO_EXT.test(f) && (seed.file === f || !BAD_FILE.test(f)),
  );

  prepared.push({ seed, wiki, wdCoord, candidates: candidates.slice(0, 25), commonsCategory, wdImages });
}

let info = await commonsImageInfo(prepared.flatMap((p) => p.candidates));

function passes(file, seed) {
  const meta = info.get(file);
  if (!meta?.exists) return 'missing';
  if (!shared.isAllowedLicense(meta.license)) return `license "${meta.license}"`;
  if (!/^image\/(jpeg|png|webp|tiff)/.test(meta.mime)) return `mime ${meta.mime}`;
  if (meta.width < 800 && file !== seed.file) return `width ${meta.width}`;
  return null;
}

/* אף מועמדת לא עברה — מנסים קבצים מקטגוריית Commons של המקום. */
const extra = [];
for (const item of prepared) {
  if (item.candidates.some((file) => passes(file, item.seed) === null) || !item.commonsCategory) continue;
  const files = (await categoryFiles(item.commonsCategory)).filter((f) => PHOTO_EXT.test(f) && !BAD_FILE.test(f));
  item.candidates.push(...files.slice(0, 30).map((f) => shared.normalizeCommonsFileName(f)));
  extra.push(...item.candidates);
  await sleep(100);
}
if (extra.length) {
  const more = await commonsImageInfo(extra);
  info = new Map([...info, ...more]);
}

/* ── 4. הרכבת הרשומות ──────────────────────────────────────────────── */

const placeNotesPrefix = new Map();
const places = [];
const failures = [];
const notes = [];

for (const { seed, wiki, wdCoord, candidates } of prepared) {
  if (wiki?.resolvedTitle) placeNotesPrefix.set(seed.id, `ערך הוויקיפדיה נמצא בחיפוש: ${wiki.resolvedTitle}`);
  const problems = [];
  const placeNotes = seed.note ? [seed.note] : [];
  if (placeNotesPrefix.has(seed.id)) placeNotes.push(placeNotesPrefix.get(seed.id));

  if (!wiki || wiki.missing) problems.push(`ערך ויקיפדיה לא נמצא: ${seed.wiki}`);

  const wpCoord = wiki?.coord ?? null;
  const wd = wdCoord ? { lat: wdCoord.latitude, lng: wdCoord.longitude } : null;
  let coord = null;
  if (seed.lat !== undefined && seed.lng !== undefined) {
    coord = { lat: seed.lat, lng: seed.lng };
    const reference = wd ?? wpCoord;
    if (reference) {
      const gap = haversine(coord, reference);
      if (gap > 2) placeNotes.push(`קואורדינטות הוזנו ידנית ורחוקות ${gap.toFixed(1)} ק"מ מ-Wikidata/Wikipedia`);
    } else {
      placeNotes.push('קואורדינטות הוזנו ידנית — אין מקור לאימות');
    }
  } else if (wd || wpCoord) {
    coord = wd ?? wpCoord;
    if (wd && wpCoord) {
      const gap = haversine(wd, wpCoord);
      const tolerance = seed.category === 'israel' ? 0.5 : 1.5;
      if (gap > tolerance) placeNotes.push(`פער של ${gap.toFixed(1)} ק"מ בין Wikidata לוויקיפדיה — נבחר Wikidata`);
    }
  } else {
    problems.push('לא נמצאו קואורדינטות');
  }

  let chosen = null;
  const rejected = [];
  for (const file of candidates) {
    const reason = passes(file, seed);
    if (reason) {
      rejected.push(`${file} (${reason})`);
      continue;
    }
    chosen = { file, meta: info.get(file) };
    break;
  }
  if (seed.file && chosen?.file !== shared.normalizeCommonsFileName(seed.file)) {
    placeNotes.push(`הקובץ שנבחר ידנית (${seed.file}) לא עבר בדיקה — נבחרה תמונה חלופית`);
  }
  if (!chosen) problems.push(`לא נמצאה תמונה ברישיון חופשי (נבדקו ${candidates.length}: ${rejected.slice(0, 4).join(', ')})`);

  if (problems.length) {
    failures.push({ id: seed.id, wiki: seed.wiki, problems });
    continue;
  }

  let author = chosen.meta.artist || chosen.meta.credit || 'Unknown author';
  author = author.replace(/\s*\(talk\)\s*/gi, ' ').replace(/\s+/g, ' ').trim();
  if (author.length > 90) author = `${author.slice(0, 87)}…`;

  const place = {
    id: seed.id,
    name: seed.name,
    city: seed.city,
    country: seed.country,
    category: seed.category,
    difficulty: seed.difficulty,
    lat: Math.round(coord.lat * 1e5) / 1e5,
    lng: Math.round(coord.lng * 1e5) / 1e5,
    image: { file: chosen.file, author, license: chosen.meta.license },
    fact: seed.fact,
    ...(placeNotes.length ? { note: placeNotes.join(' | ') } : {}),
  };
  const validation = shared.validatePlace(place);
  if (validation.length) {
    failures.push({ id: seed.id, wiki: seed.wiki, problems: validation });
    continue;
  }
  if (place.note) notes.push(place);
  places.push(place);
}

writeFileSync(path.join(OUT_DIR, 'places.generated.json'), `${JSON.stringify({ version: 1, places }, null, 2)}\n`);

const lines = [
  `# דוח בניית מאגר`,
  '',
  `- זרעים: ${seeds.length}`,
  `- נבנו בהצלחה: ${places.length}`,
  `- נכשלו: ${failures.length}`,
  `- מסומנים לאימות: ${notes.length}`,
  '',
  '## כשלונות',
  ...failures.map((f) => `- \`${f.id}\` (${f.wiki}): ${f.problems.join('; ')}`),
  '',
  '## הערות אימות',
  ...notes.map((p) => `- \`${p.id}\`: ${p.note}`),
];
writeFileSync(path.join(OUT_DIR, 'resolve-report.md'), `${lines.join('\n')}\n`);
console.log(lines.slice(0, 7).join('\n'));
for (const f of failures) console.log(`✗ ${f.id}: ${f.problems.join('; ')}`);
