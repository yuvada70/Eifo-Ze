/**
 * מנגנון הניקוד — כמו ב"מי הזמר":
 *  • תשובה שגויה, או היעדר תשובה, שווה תמיד 0 נקודות.
 *  • תשובה נכונה מזכה בין minScore ל-maxScore לפי המהירות: תשובה מיידית
 *    מזכה במקסימום, ותשובה ברגע האחרון עדיין במינימום — כך שנכונות תמיד
 *    שווה יותר ממהירות, אבל בין שתי תשובות נכונות המהירה מנצחת.
 *
 * הניקוד זהה בכל הקטגוריות ובכל דרגות הקושי.
 */

export interface ScoringConfig {
  /** ניקוד לתשובה נכונה מיידית. */
  readonly maxScore: number;
  /** ניקוד לתשובה נכונה ברגע האחרון. */
  readonly minScore: number;
}

export const DEFAULT_SCORING: ScoringConfig = {
  maxScore: 1000,
  minScore: 400,
};

export interface AnswerScore {
  readonly correct: boolean;
  readonly points: number;
}

export const NO_ANSWER_SCORE: AnswerScore = { correct: false, points: 0 };

/**
 * @param isCorrect       האם האפשרות שנבחרה נכונה.
 * @param elapsedMs       הזמן מתחילת הסיבוב ועד הבחירה.
 * @param roundDurationMs משך הסיבוב.
 */
export function scoreAnswer(
  isCorrect: boolean,
  elapsedMs: number,
  roundDurationMs: number,
  config: ScoringConfig = DEFAULT_SCORING,
): AnswerScore {
  if (!isCorrect) return NO_ANSWER_SCORE;
  const remaining = 1 - Math.min(1, Math.max(0, elapsedMs / Math.max(1, roundDurationMs)));
  return { correct: true, points: Math.round(config.minScore + (config.maxScore - config.minScore) * remaining) };
}

/** זמן תגובה בשניות, לתצוגה ("3.4 שנ׳"). */
export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} שנ׳`;
}
