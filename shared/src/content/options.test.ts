/**
 * בדיקות המסיחים — כולל מעבר על כל המאגר האמיתי (data/places.json),
 * בכל הקטגוריות ובכל הדרגות.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  CONTENT_CATEGORIES,
  DIFFICULTIES,
  OPTION_COUNT,
  buildRoundOptions,
  continentOf,
  displayLabel,
  labelKey,
  selectPlacePool,
  suggestAnswerLabel,
  validatePlacesFile,
  type Place,
} from './places.js';

const raw = JSON.parse(readFileSync(new URL('../../../data/places.json', import.meta.url), 'utf8'));
const { places, errors } = validatePlacesFile(raw);

/** RNG דטרמיניסטי (mulberry32) — כדי שכשל יהיה ניתן לשחזור. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('המאגר', () => {
  it('is valid and every place has an answerLabel', () => {
    assert.deepEqual(errors, []);
    assert.equal(places.length, raw.places.length);
    for (const place of places) assert.ok(place.answerLabel.trim().length > 0, place.id);
  });

  it('uses consistent label formats', () => {
    for (const place of places) {
      if (place.category === 'israel') {
        assert.ok(!place.answerLabel.includes(','), `${place.id}: "${place.answerLabel}"`);
      } else {
        assert.ok(
          place.answerLabel.includes(', ') || ['סינגפור', 'הוותיקן'].includes(place.answerLabel),
          `${place.id}: "${place.answerLabel}"`,
        );
        assert.ok(!place.answerLabel.includes("'"), `${place.id}: גרש ASCII`);
      }
    }
  });

  it('has enough distinct labels for 3 distractors in every pool', () => {
    const israelLabels = new Set(places.filter((p) => p.category === 'israel').map((p) => labelKey(p.answerLabel)));
    assert.ok(israelLabels.size >= OPTION_COUNT * 3);
  });
});

describe('buildRoundOptions — כל המאגר, כל הקטגוריות והדרגות', () => {
  for (const category of CONTENT_CATEGORIES) {
    for (const difficulty of DIFFICULTIES) {
      it(`${category} / ${difficulty}`, () => {
        const pool = selectPlacePool(places, category, difficulty);
        assert.ok(pool.length > 0);
        for (let run = 0; run < 5; run += 1) {
          const random = rng(run * 7919 + pool.length);
          for (const answer of pool) {
            const { options, correctIndex } = buildRoundOptions(answer, places, difficulty, category, random);
            const where = `${category}/${difficulty}/${answer.id}`;
            assert.equal(options.length, OPTION_COUNT, where);
            assert.equal(options[correctIndex], displayLabel(answer, category), where);
            const keys = options.map(labelKey);
            assert.equal(new Set(keys).size, OPTION_COUNT, `${where}: אפשרויות כפולות ${options.join(' | ')}`);
            for (const [i, key] of keys.entries()) {
              if (i !== correctIndex) assert.notEqual(key, labelKey(options[correctIndex]!), `${where}: מסיח זהה לתשובה`);
            }
            if (category === 'israel') {
              for (const option of options) assert.ok(!option.includes('ישראל'), `${where}: ${option}`);
            }
          }
        }
      });
    }
  }
});

describe('buildRoundOptions — כללי הדרגות', () => {
  const byLabel = new Map<string, Place>();
  for (const place of places) byLabel.set(labelKey(displayLabel(place, 'mixed')), place);
  const distractorsOf = (answer: Place, difficulty: 'easy' | 'medium' | 'pro', seed: number) => {
    const { options, correctIndex } = buildRoundOptions(answer, places, difficulty, 'mixed', rng(seed));
    return options.filter((_, i) => i !== correctIndex).map((o) => byLabel.get(labelKey(o))!);
  };
  const world = places.filter((p) => p.category !== 'israel');

  it('easy: all distractors come from other continents', () => {
    for (const [i, answer] of world.entries()) {
      for (const d of distractorsOf(answer, 'easy', i)) assert.notEqual(continentOf(d), continentOf(answer), answer.id);
    }
  });

  it('medium: a mix — at least one same-continent and one other-continent distractor', () => {
    for (const [i, answer] of world.entries()) {
      const ds = distractorsOf(answer, 'medium', i);
      assert.ok(ds.some((d) => continentOf(d) === continentOf(answer)), answer.id);
      assert.ok(ds.some((d) => continentOf(d) !== continentOf(answer)), answer.id);
    }
  });

  it('pro: all distractors from the same country or continent (same country first)', () => {
    for (const [i, answer] of world.entries()) {
      for (const d of distractorsOf(answer, 'pro', i)) {
        assert.ok(d.country === answer.country || continentOf(d) === continentOf(answer), `${answer.id} ← ${d.id}`);
      }
    }
    const paris = places.find((p) => p.id === 'eiffel-tower')!;
    const ds = distractorsOf(paris, 'pro', 1);
    assert.ok(ds.some((d) => d.country === 'צרפת'));
  });

  it('places that share a label are never distractors to each other', () => {
    const eiffel = places.find((p) => p.id === 'eiffel-tower')!;
    for (let seed = 0; seed < 200; seed += 1) {
      for (const difficulty of DIFFICULTIES) {
        const { options } = buildRoundOptions(eiffel, places, difficulty, 'europe', rng(seed));
        assert.equal(options.filter((o) => o === 'פריז, צרפת').length, 1);
      }
    }
  });

  it('israel in mixed games gets ", ישראל" so every option has the same format', () => {
    const kotel = places.find((p) => p.id === 'western-wall')!;
    const { options, correctIndex } = buildRoundOptions(kotel, places, 'easy', 'mixed', rng(3));
    assert.equal(options[correctIndex], 'ירושלים, ישראל');
    for (const option of options) assert.ok(option.includes(','));
  });
});

describe('suggestAnswerLabel', () => {
  it('formats city + short country, Israel without country', () => {
    assert.equal(suggestAnswerLabel('ניו יורק', 'ארצות הברית', 'americas'), 'ניו יורק, ארה״ב');
    assert.equal(suggestAnswerLabel("ג'ונו", 'ארצות הברית', 'americas'), 'ג׳ונו, ארה״ב');
    assert.equal(suggestAnswerLabel('חיפה', 'ישראל', 'israel'), 'חיפה');
    assert.equal(suggestAnswerLabel('סינגפור', 'סינגפור', 'asia'), 'סינגפור');
  });
});
