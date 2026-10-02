/**
 * בניית טבלת הדירוג מתוך תוצאות הסיבובים.
 *
 * הפונקציות כאן טהורות (pure) — אותו קלט תמיד מחזיר אותו פלט — ולכן
 * הן משמשות גם את השרת (חישוב סופי) וגם את הלקוח (ייצוא לקובץ,
 * חישובים מקומיים) בלי להכפיל לוגיקה.
 */

import type { LeaderboardEntry, PlayerPublic, RoundResult } from './types.js';

/** סטטיסטיקה מצטברת של שחקן יחיד. */
interface PlayerTally {
  totalPoints: number;
  distanceSum: number;
  answeredRounds: number;
  bullseyes: number;
  bestRoundIndex: number | null;
  bestRoundPoints: number;
}

/**
 * מחשב את טבלת הדירוג הסופית.
 *
 * סדר המיון:
 *  1. ניקוד כולל (יורד).
 *  2. מרחק ממוצע (עולה) — שובר שוויון הוגן שמתגמל עקביות.
 *  3. מספר "בולי פגיעה" (יורד).
 *  4. שם (א״ב) — כדי שהתוצאה תהיה דטרמיניסטית לחלוטין.
 *
 * שחקנים בעלי ניקוד זהה מקבלים את אותו מספר דירוג (דירוג תחרותי סטנדרטי).
 *
 * @param players השחקנים שהשתתפו.
 * @param rounds  תוצאות הסיבובים שהושלמו.
 * @param bullseyeRadiusKm רדיוס שמעליו סימון אינו נחשב "בול פגיעה".
 */
export function buildLeaderboard(
  players: readonly PlayerPublic[],
  rounds: readonly RoundResult[],
  bullseyeRadiusKm: number,
): LeaderboardEntry[] {
  const tallies = new Map<string, PlayerTally>();
  for (const player of players) {
    tallies.set(player.id, {
      totalPoints: 0,
      distanceSum: 0,
      answeredRounds: 0,
      bullseyes: 0,
      bestRoundIndex: null,
      bestRoundPoints: -1,
    });
  }

  for (const round of rounds) {
    for (const guess of round.guesses) {
      const tally = tallies.get(guess.playerId);
      if (!tally) continue;

      tally.totalPoints += guess.points;
      if (guess.distanceKm !== null) {
        tally.distanceSum += guess.distanceKm;
        tally.answeredRounds += 1;
        if (guess.distanceKm <= bullseyeRadiusKm) tally.bullseyes += 1;
      }
      if (guess.points > tally.bestRoundPoints) {
        tally.bestRoundPoints = guess.points;
        tally.bestRoundIndex = round.index;
      }
    }
  }

  const rows = players
    .map((player) => {
      const tally = tallies.get(player.id)!;
      return {
        player,
        totalPoints: tally.totalPoints,
        averageDistanceKm:
          tally.answeredRounds > 0 ? tally.distanceSum / tally.answeredRounds : null,
        bullseyes: tally.bullseyes,
        answeredRounds: tally.answeredRounds,
        bestRoundIndex: tally.bestRoundIndex,
      };
    })
    .sort(compareEntries);

  // דירוג תחרותי: שוויון מלא בניקוד → אותו מקום.
  let previousPoints = Number.NaN;
  let previousRank = 0;
  return rows.map((row, index) => {
    const rank = row.totalPoints === previousPoints ? previousRank : index + 1;
    previousPoints = row.totalPoints;
    previousRank = rank;
    return { rank, ...row } satisfies LeaderboardEntry;
  });
}

/** השוואה בין שתי שורות דירוג לפי סדר המיון המתועד למעלה. */
function compareEntries(
  a: Omit<LeaderboardEntry, 'rank'>,
  b: Omit<LeaderboardEntry, 'rank'>,
): number {
  if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;

  const aDistance = a.averageDistanceKm ?? Number.POSITIVE_INFINITY;
  const bDistance = b.averageDistanceKm ?? Number.POSITIVE_INFINITY;
  if (aDistance !== bDistance) return aDistance - bDistance;

  if (b.bullseyes !== a.bullseyes) return b.bullseyes - a.bullseyes;
  return a.player.name.localeCompare(b.player.name, 'he');
}

/** שלושת המקומות הראשונים, לפי הסדר, לצורך מסך הפודיום. */
export function topThree(leaderboard: readonly LeaderboardEntry[]): readonly LeaderboardEntry[] {
  return leaderboard.slice(0, 3);
}

/** מדליה לפי דירוג, או null מהמקום הרביעי ומטה. */
export function medalFor(rank: number): string | null {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return null;
}
