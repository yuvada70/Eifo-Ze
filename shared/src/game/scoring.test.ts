import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ISRAEL_SCORING, WORLD_SCORING, scoreGuess, scoringForCategory } from './scoring.js';
import { validatePlacesFile, commonsImageUrl, commonsPageUrl, normalizeCommonsFileName } from '../content/places.js';

describe('scoring', () => {
  it('gives max points for a very close guess and decays with distance', () => {
    const target = { lat: 48.8583, lng: 2.2945 };
    assert.equal(scoreGuess(target, target, { config: WORLD_SCORING }).points, 1000);
    const near = scoreGuess({ lat: 48.0, lng: 2.3 }, target, { config: WORLD_SCORING }).points;
    const far = scoreGuess({ lat: 40.4, lng: -3.7 }, target, { config: WORLD_SCORING }).points;
    assert.ok(near > far && far > 0);
  });

  it('uses a tighter scale for Israel', () => {
    assert.equal(scoringForCategory('israel'), ISRAEL_SCORING);
    assert.equal(scoringForCategory('mixed'), WORLD_SCORING);
    const jerusalem = { lat: 31.7767, lng: 35.2345 };
    const telAviv = { lat: 32.0853, lng: 34.7818 };
    const israel = scoreGuess(telAviv, jerusalem, { config: ISRAEL_SCORING }).points;
    const world = scoreGuess(telAviv, jerusalem, { config: WORLD_SCORING }).points;
    assert.ok(israel < 200, `~54 ק"מ בישראל צריך להיות ניקוד נמוך, התקבל ${israel}`);
    assert.ok(world > 900);
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

  it('rejects non-free licenses and duplicate ids', () => {
    const base = {
      id: 'x',
      name: 'א',
      city: 'ב',
      country: 'ג',
      category: 'europe',
      difficulty: 'easy',
      lat: 1,
      lng: 2,
      image: { file: 'x.jpg', author: 'me', license: 'CC BY-NC 2.0' },
      fact: 'ד',
    };
    const result = validatePlacesFile({ version: 1, places: [base, { ...base, image: { ...base.image, license: 'CC BY-SA 4.0' } }] });
    assert.equal(result.ok, false);
    assert.equal(result.places.length, 0);
    assert.equal(result.errors.length, 2);
  });
});
