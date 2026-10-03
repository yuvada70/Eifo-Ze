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
  correctAnswers: number;
  correctTimeSum: number;
  answeredRounds: number;
  bestRoundIndex: number | null;
  bestRoundPoints: number;
}

/**
 * מחשב את טבלת הדירוג הסופית.
 *
 * סדר המיון:
 *  1. ניקוד כולל (יורד).
 *  2. מספר תשובות נכונות (יורד).
 *  3. זמן ממוצע לתשובה נכונה (עולה).
 *  4. שם (א״ב) — כדי שהתוצאה תהיה דטרמיניסטית לחלוטין.
 *
 * שחקנים בעלי ניקוד זהה מקבלים את אותו מספר דירוג.
 */
export function buildLeaderboard(players: readonly PlayerPublic[], rounds: readonly RoundResult[]): LeaderboardEntry[] {
  const tallies = new Map<string, PlayerTally>();
  for (const player of players) {
    tallies.set(player.id, {
      totalPoints: 0,
      correctAnswers: 0,
      correctTimeSum: 0,
      answeredRounds: 0,
      bestRoundIndex: null,
      bestRoundPoints: 0,
    });
  }

  for (const round of rounds) {
    for (const answer of round.answers) {
      const tally = tallies.get(answer.playerId);
      if (!tally) continue;

      tally.totalPoints += answer.points;
      if (answer.choice !== null) tally.answeredRounds += 1;
      if (answer.correct) {
        tally.correctAnswers += 1;
        tally.correctTimeSum += answer.elapsedMs ?? 0;
      }
      if (answer.points > tally.bestRoundPoints) {
        tally.bestRoundPoints = answer.points;
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
        correctAnswers: tally.correctAnswers,
        answeredRounds: tally.answeredRounds,
        averageCorrectMs: tally.correctAnswers > 0 ? tally.correctTimeSum / tally.correctAnswers : null,
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

function compareEntries(a: Omit<LeaderboardEntry, 'rank'>, b: Omit<LeaderboardEntry, 'rank'>): number {
  if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
  if (b.correctAnswers !== a.correctAnswers) return b.correctAnswers - a.correctAnswers;
  const aTime = a.averageCorrectMs ?? Number.POSITIVE_INFINITY;
  const bTime = b.averageCorrectMs ?? Number.POSITIVE_INFINITY;
  if (aTime !== bTime) return aTime - bTime;
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
