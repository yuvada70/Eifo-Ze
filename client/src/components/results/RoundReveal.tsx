/**
 * חשיפת סיבוב: התשובה הנכונה בירוק, הבחירות השגויות באדום, מי מהשחקנים
 * בחר מה, שם המקום ושורת מידע — ומפה קטנה עם סמן על המיקום האמיתי
 * (לתצוגה בלבד).
 *
 * משמש גם את מסך המארח (מוקרן) וגם את מסך השחקן (טלפון).
 */

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  formatSeconds,
  mapViewForCategory,
  placePosition,
  type ContentCategory,
  type PlayerPublic,
  type RoundResult,
} from '@eifo/shared';

import { WorldMap } from '../map/WorldMap';
import { OptionButtons } from '../options/OptionButtons';
import { PlacePhoto } from '../place/PlacePhoto';
import styles from './RoundReveal.module.css';

export interface RoundRevealProps {
  readonly round: RoundResult;
  readonly players: readonly PlayerPublic[];
  readonly category: ContentCategory;
  readonly highlightPlayerId?: string | null;
  /** האם להציג גם את התמונה (במסך המארח). */
  readonly showPhoto?: boolean;
  readonly layout?: 'wide' | 'stacked';
}

export function RoundReveal({
  round,
  players,
  category,
  highlightPlayerId = null,
  showPhoto = false,
  layout = 'wide',
}: RoundRevealProps): JSX.Element {
  const playersById = useMemo(() => new Map(players.map((player) => [player.id, player])), [players]);

  const pickedBy = useMemo(() => {
    const map = new Map<number, PlayerPublic[]>();
    for (const answer of round.answers) {
      const player = playersById.get(answer.playerId);
      if (answer.choice === null || !player) continue;
      map.set(answer.choice, [...(map.get(answer.choice) ?? []), player]);
    }
    return map;
  }, [playersById, round.answers]);

  const mine = highlightPlayerId ? round.answers.find((answer) => answer.playerId === highlightPlayerId) : undefined;
  const correctCount = round.answers.filter((answer) => answer.correct).length;
  const fastest = round.answers
    .filter((answer) => answer.correct && answer.elapsedMs !== null)
    .sort((a, b) => a.elapsedMs! - b.elapsedMs!)[0];
  const silent = round.answers.filter((answer) => answer.choice === null).map((a) => playersById.get(a.playerId)?.name).filter(Boolean);

  return (
    <div className={`${styles.reveal} ${layout === 'stacked' ? styles.stacked : styles.wide}`}>
      <motion.header
        className={styles.header}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        {mine ? (
          <div className={`${styles.verdict} ${mine.correct ? styles.verdictOk : styles.verdictBad}`} data-testid="my-verdict">
            {mine.correct
              ? `✓ נכון! +${mine.points.toLocaleString('he-IL')}`
              : mine.choice === null
                ? 'לא בחרת תשובה בסיבוב הזה'
                : '✗ לא הפעם'}
          </div>
        ) : null}
        <h2 className={styles.name} data-testid="reveal-name">
          {round.place.name}
        </h2>
        <p className={styles.where}>
          📍 {round.place.city}, {round.place.country}
        </p>
        <p className={styles.fact}>💡 {round.place.fact}</p>
      </motion.header>

      <div className={styles.options}>
        <OptionButtons
          options={round.options}
          correctIndex={round.correctIndex}
          pickedBy={pickedBy}
          size="md"
          testIdPrefix="reveal-option"
        />
        <p className={styles.summary}>
          {correctCount} מתוך {round.answers.length} צדקו
          {fastest ? ` · הכי מהיר/ה: ${playersById.get(fastest.playerId)?.name ?? 'שחקן'} (${formatSeconds(fastest.elapsedMs!)})` : ''}
          {silent.length > 0 ? ` · לא ענו: ${silent.join(', ')}` : ''}
        </p>
      </div>

      {showPhoto ? (
        <div className={styles.photo}>
          <PlacePhoto image={round.image} alt={round.place.name} />
        </div>
      ) : null}

      <div className={styles.mapPane}>
        <WorldMap
          view={mapViewForCategory(category)}
          truth={placePosition(round.place)}
          focusKey={`reveal-${round.index}-${round.place.id}`}
          ariaLabel={`המיקום של ${round.place.name} על המפה`}
        />
      </div>
    </div>
  );
}
