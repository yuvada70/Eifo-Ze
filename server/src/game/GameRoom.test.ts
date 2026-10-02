import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Place } from '@eifo/shared';

import { inMemoryPlaces } from '../content/placesStore.js';
import { GameError, GameRoom, normalizeSettings, pickRounds, type RoomListeners, type Scheduler } from './GameRoom.js';

/** שעון מדומה עם תור טיימרים. */
function fakeScheduler() {
  let now = 1_000_000;
  let timers: { at: number; handler: () => void; id: number }[] = [];
  let seq = 0;
  const scheduler: Scheduler = {
    now: () => now,
    setTimeout: (handler, ms) => {
      seq += 1;
      timers.push({ at: now + ms, handler, id: seq });
      return seq;
    },
    clearTimeout: (handle) => {
      timers = timers.filter((timer) => timer.id !== handle);
    },
  };
  const advance = (ms: number) => {
    const target = now + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const next = timers[0];
      if (!next || next.at > target) break;
      timers.shift();
      now = next.at;
      next.handler();
    }
    now = target;
  };
  return { scheduler, advance };
}

function place(id: string, category: Place['category'], difficulty: Place['difficulty'], lat: number, lng: number): Place {
  return {
    id,
    name: id,
    city: 'עיר',
    country: 'מדינה',
    category,
    difficulty,
    lat,
    lng,
    image: { file: `${id}.jpg`, author: 'צלם', license: 'CC BY-SA 4.0' },
    fact: 'עובדה',
  };
}

const PLACES = [
  place('eiffel', 'europe', 'easy', 48.8583, 2.2945),
  place('colosseum', 'europe', 'easy', 41.8902, 12.4922),
  place('big-ben', 'europe', 'easy', 51.5007, -0.1246),
  place('kotel', 'israel', 'easy', 31.7767, 35.2345),
  place('masada', 'israel', 'easy', 31.3156, 35.3536),
  place('taj', 'asia', 'medium', 27.1751, 78.0421),
];

const noopListeners: RoomListeners = {
  onStateChanged() {},
  onResults() {},
  onPlayerStateChanged() {},
};

function setup(settings: Parameters<typeof normalizeSettings>[0] = {}) {
  const clock = fakeScheduler();
  const notices: string[] = [];
  const room = new GameRoom('ABCDE', settings, { ...noopListeners, onNotice: (_r, message) => notices.push(message) }, inMemoryPlaces(PLACES), clock.scheduler);
  return { room, clock, notices };
}

describe('normalizeSettings', () => {
  it('uses the requested defaults: mixed · easy · 10 rounds', () => {
    const settings = normalizeSettings({});
    assert.equal(settings.category, 'mixed');
    assert.equal(settings.difficulty, 'easy');
    assert.equal(settings.roundCount, 10);
  });

  it('rejects unknown categories and clamps numbers', () => {
    const settings = normalizeSettings({ category: 'mars' as never, roundCount: 999, roundDurationMs: 1 });
    assert.equal(settings.category, 'mixed');
    assert.equal(settings.roundCount, 20);
    assert.equal(settings.roundDurationMs, 10_000);
  });
});

describe('GameRoom', () => {
  it('plays a full game: question → reveal → … → finished, without repeating places', () => {
    const { room, clock, notices } = setup({ category: 'europe', difficulty: 'easy', roundCount: 10 });
    const alice = room.addPlayer('אליס', 's1');
    const bob = room.addPlayer('בוב', 's2');

    room.start();
    // רק 3 מקומות באירופה/קל — המשחק מקוצר והודעה נשלחת.
    assert.equal(room.getPublicState().totalRounds, 3);
    assert.equal(notices.length, 1);

    clock.advance(3_000);
    const seen = new Set<string>();
    for (let index = 0; index < 3; index += 1) {
      const state = room.getPublicState();
      assert.equal(state.phase, 'question');
      assert.ok(state.round);
      // בזמן סיבוב לא נחשף שום פרט על המקום מלבד התמונה.
      assert.equal(JSON.stringify(state).includes('"lat"'), false);

      room.submitGuess(alice.id, index, { lat: 48.85, lng: 2.29 });
      assert.throws(() => room.submitGuess(alice.id, index, { lat: 0, lng: 0 }), (error: GameError) => error.code === 'ALREADY_ANSWERED');
      room.submitGuess(bob.id, index, { lat: 0, lng: 0 });

      // כולם אישרו → הסיבוב נסגר מיד ועובר לחשיפה.
      const reveal = room.getPublicState();
      assert.equal(reveal.phase, 'reveal');
      assert.ok(reveal.reveal);
      seen.add(reveal.reveal.place.id);
      const aliceGuess = reveal.reveal.guesses.find((guess) => guess.playerId === alice.id)!;
      assert.ok(aliceGuess.distanceKm !== null && aliceGuess.points > 0);

      clock.advance(15_000);
    }

    assert.equal(seen.size, 3);
    assert.equal(room.getPublicState().phase, 'finished');
    const results = room.getResults()!;
    assert.equal(results.rounds.length, 3);
    assert.equal(results.leaderboard[0]!.player.id, alice.id);
  });

  it('closes the round on timeout and gives 0 to players who did not confirm', () => {
    const { room, clock } = setup({ category: 'israel', roundCount: 1, countdownMs: 0 });
    const alice = room.addPlayer('אליס', 's1');
    room.addPlayer('בוב', 's2');
    room.start();
    room.submitGuess(alice.id, 0, { lat: 31.77, lng: 35.23 });
    assert.equal(room.getPublicState().phase, 'question');

    clock.advance(30_000);
    const state = room.getPublicState();
    assert.equal(state.phase, 'reveal');
    assert.equal(state.mapView, 'israel');
    const bob = state.reveal!.guesses.find((guess) => guess.playerId !== alice.id)!;
    assert.equal(bob.points, 0);
    assert.equal(bob.distanceKm, null);
  });

  it('host skip advances from reveal to the next round', () => {
    const { room } = setup({ category: 'europe', roundCount: 3, countdownMs: 0 });
    room.addPlayer('אליס', 's1');
    room.start();
    room.skip();
    assert.equal(room.getPublicState().phase, 'reveal');
    room.skip();
    assert.equal(room.getPublicState().phase, 'question');
    assert.equal(room.getPublicState().round!.index, 1);
  });

  it('refuses to start when the pool is empty', () => {
    const { room } = setup({ category: 'americas', difficulty: 'pro' });
    room.addPlayer('אליס', 's1');
    assert.throws(() => room.start(), (error: GameError) => error.code === 'NO_PLACES');
  });
});

describe('pickRounds', () => {
  it('balances regions in mixed games and never repeats a place', () => {
    const pool = [
      ...Array.from({ length: 30 }, (_, i) => place(`il-${i}`, 'israel', 'easy', 31, 35)),
      ...Array.from({ length: 5 }, (_, i) => place(`eu-${i}`, 'europe', 'easy', 48, 2)),
      ...Array.from({ length: 5 }, (_, i) => place(`as-${i}`, 'asia', 'easy', 27, 78)),
    ];
    for (let run = 0; run < 50; run += 1) {
      const picked = pickRounds(pool, 9, true);
      assert.equal(picked.length, 9);
      assert.equal(new Set(picked.map((p) => p.id)).size, 9);
      assert.equal(picked.filter((p) => p.category === 'israel').length, 3);
    }
    const all = pickRounds(pool, 100, true);
    assert.equal(all.length, 40);
  });
});
