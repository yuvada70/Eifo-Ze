import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DEFAULT_SCORING, scoreAnswer } from './scoring.js';
import { commonsImageUrl, commonsPageUrl, normalizeCommonsFileName, validatePlacesFile } from '../content/places.js';

describe('scoring (כמו מי הזמר)', () => {
  it('gives 0 for a wrong answer and max..min for correct ones by speed', () => {
    assert.equal(scoreAnswer(false, 0, 30_000).points, 0);
    assert.equal(scoreAnswer(true, 0, 30_000).points, DEFAULT_SCORING.maxScore);
    assert.equal(scoreAnswer(true, 30_000, 30_000).points, DEFAULT_SCORING.minScore);
    assert.equal(scoreAnswer(true, 15_000, 30_000).points, 700);
    assert.ok(scoreAnswer(true, 5_000, 30_000).points > scoreAnswer(true, 10_000, 30_000).points);
  });
});

describe('places', () => {
  it('builds Special:FilePath URLs', () => {
    assert.equal(
      commonsImageUrl('Tour Eiffel Wikimedia Commons.jpg', 800),
      'https://commons.wikimedia.org/wiki/Special:FilePath/Tour_Eiffel_Wikimedia_Commons.jpg?width=800',
    );
    assert.equal(commonsPageUrl('File:A b.jpg'), 'https://commons.wikimedia.org/wiki/File:A_b.jpg');
    assert.equal(normalizeCommonsFileName('https://commons.wikimedia.org/wiki/File:A_b%C3%A9.jpg'), 'A bé.jpg');
  });

  it('rejects non-free licenses, duplicate ids and bad answer labels', () => {
    const base = {
      id: 'x',
      name: 'א',
      city: 'ב',
      country: 'ג',
      answerLabel: 'ב, ג',
      category: 'europe',
      difficulty: 'easy',
      lat: 1,
      lng: 2,
      image: { file: 'x.jpg', author: 'me', license: 'CC BY-NC 2.0' },
      fact: 'ד',
    };
    const result = validatePlacesFile({ version: 1, places: [base, { ...base, image: { ...base.image, license: 'CC BY-SA 4.0' } }] });
    assert.equal(result.ok, false);
    assert.equal(result.errors.length, 2);

    const ok = { ...base, id: 'y', image: { ...base.image, license: 'CC BY-SA 4.0' } };
    assert.equal(validatePlacesFile({ places: [ok] }).ok, true);
    assert.equal(validatePlacesFile({ places: [{ ...ok, answerLabel: '' }] }).ok, false);
    assert.equal(validatePlacesFile({ places: [{ ...ok, answerLabel: 'פריז' }] }).ok, false);
    assert.equal(validatePlacesFile({ places: [{ ...ok, category: 'israel', answerLabel: 'חיפה, ישראל' }] }).ok, false);
    assert.equal(validatePlacesFile({ places: [{ ...ok, category: 'israel', answerLabel: 'חיפה' }] }).ok, true);
  });
});
