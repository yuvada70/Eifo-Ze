/**
 * חשיפת סיבוב: המקום האמיתי על המפה, הניחושים של כל השחקנים, המרחק
 * של כל אחד בק"מ, ופרטי המקום — שם, עיר, מדינה ושורת מידע.
 *
 * משמש גם את מסך המארח (מוקרן) וגם את מסך השחקן (טלפון). בטלפון
 * הפריסה אנכית: כותרת → מפה → רשימה.
 */

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  ACCURACY_LABELS,
  accuracyTier,
  formatDistance,
  placePosition,
  scoringForCategory,
  type ContentCategory,
  type MapView,
  type PlayerPublic,
  type RoundResult,
} from '@eifo/shared';

import { WorldMap, type MapConnector, type MapMarker } from '../map/WorldMap';
import { PlacePhoto } from '../place/PlacePhoto';
import { AvatarBadge } from '../ui/misc';
import styles from './RoundReveal.module.css';

export interface RoundRevealProps {
  readonly round: RoundResult;
  readonly players: readonly PlayerPublic[];
  readonly view: MapView;
  readonly category: ContentCategory;
  readonly highlightPlayerId?: string | null;
  /** האם להציג גם את התמונה (במסך המארח). */
  readonly showPhoto?: boolean;
  readonly layout?: 'wide' | 'stacked';
}

export function RoundReveal({
  round,
  players,
  view,
  category,
  highlightPlayerId = null,
  showPhoto = false,
  layout = 'wide',
}: RoundRevealProps): JSX.Element {
  const playersById = useMemo(() => new Map(players.map((player) => [player.id, player])), [players]);
  const scoring = scoringForCategory(category);
  const truth = placePosition(round.place);

  const sorted = useMemo(
    () =>
      [...round.guesses].sort(
        (a, b) => (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY),
      ),
    [round.guesses],
  );

  const markers: MapMarker[] = useMemo(
    () =>
      sorted
        .filter((guess) => guess.guess !== null)
        .map((guess) => {
          const player = playersById.get(guess.playerId);
          return {
            id: guess.playerId,
            position: guess.guess!,
            hue: player?.avatar.hue,
            label: player?.name,
            emphasized: guess.playerId === highlightPlayerId,
          };
        }),
    [highlightPlayerId, playersById, sorted],
  );

  const connectors: MapConnector[] = useMemo(
    () =>
      sorted
        .filter((guess) => guess.guess !== null)
        .map((guess) => ({
          id: `line-${guess.playerId}`,
          from: guess.guess!,
          to: truth,
          hue: playersById.get(guess.playerId)?.avatar.hue,
        })),
    [playersById, sorted, truth],
  );

  const mine = highlightPlayerId ? round.guesses.find((guess) => guess.playerId === highlightPlayerId) : undefined;

  return (
    <div className={`${styles.reveal} ${layout === 'stacked' ? styles.stacked : styles.wide}`}>
      <motion.header
        className={styles.header}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <span className={styles.badge}>התשובה</span>
        <h2 className={styles.name} data-testid="reveal-name">
          {round.place.name}
        </h2>
        <p className={styles.where}>
          📍 {round.place.city}, {round.place.country}
        </p>
        <p className={styles.fact}>💡 {round.place.fact}</p>

        {mine ? (
          <div className={styles.mine}>
            {mine.distanceKm === null ? (
              <span>לא אישרת ניחוש בסיבוב הזה</span>
            ) : (
              <>
                <span className={`${styles.tier} ${styles[`tier_${accuracyTier(mine.distanceKm, scoring)}`]}`}>
                  {ACCURACY_LABELS[accuracyTier(mine.distanceKm, scoring)]}
                </span>
                <span className="tabular">{formatDistance(mine.distanceKm)}</span>
                <strong className={`${styles.minePoints} tabular`}>+{mine.points.toLocaleString('he-IL')}</strong>
              </>
            )}
          </div>
        ) : null}
      </motion.header>

      {showPhoto ? (
        <div className={styles.photo}>
          <PlacePhoto image={round.image} alt={round.place.name} />
        </div>
      ) : null}

      <div className={styles.mapPane}>
        <WorldMap
          view={view}
          truth={truth}
          markers={markers}
          connectors={connectors}
          fitKey={`reveal-${round.index}-${round.place.id}`}
          ariaLabel={`מפת התוצאות: ${round.place.name}`}
        />
      </div>

      <ul className={styles.list} aria-label="מרחקי השחקנים">
        {sorted.map((guess, index) => {
          const player = playersById.get(guess.playerId);
          const tier = guess.distanceKm === null ? 'none' : accuracyTier(guess.distanceKm, scoring);
          return (
            <motion.li
              key={guess.playerId}
              className={`${styles.row} ${guess.playerId === highlightPlayerId ? styles.rowMe : ''}`}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 + index * 0.06 }}
            >
              <span className={`${styles.position} tabular`}>{guess.distanceKm === null ? '—' : index + 1}</span>
              {player ? <AvatarBadge avatar={player.avatar} size={26} /> : null}
              <span className={styles.rowName}>{player?.name ?? 'שחקן'}</span>
              <span className={`${styles.tier} ${styles[`tier_${tier}`]}`}>{ACCURACY_LABELS[tier]}</span>
              <span className={`${styles.distance} tabular`}>
                {guess.distanceKm === null ? '—' : formatDistance(guess.distanceKm)}
              </span>
              <span className={`${styles.points} tabular`}>+{guess.points.toLocaleString('he-IL')}</span>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}
