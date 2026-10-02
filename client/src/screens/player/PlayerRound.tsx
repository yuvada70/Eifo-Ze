/**
 * מסך המשחק של השחקן.
 *
 * בטלפון: התמונה למעלה, המפה למטה, וכפתור "אישור" גדול בתחתית.
 * השחקן מקיש על המפה כדי לסמן (אפשר להקיש שוב כדי להזיז), גורר
 * ומגדיל כרצונו — וכל זה מקומי בלבד. רק הלחיצה על "אישור" שולחת
 * את הניחוש לשרת, פעם אחת בסיבוב.
 *
 * אחרי שהסיבוב נסגר מוצגת החשיפה: המקום האמיתי, הניחושים והמרחקים.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { LatLng } from '@eifo/shared';

import { WorldMap } from '../../components/map/WorldMap';
import { PlacePhoto } from '../../components/place/PlacePhoto';
import { RoundReveal } from '../../components/results/RoundReveal';
import { TimerRing } from '../../components/ui/TimerRing';
import { useCountdown } from '../../hooks/useCountdown';
import { useSound } from '../../hooks/useSound';
import { selectMe, useGameStore } from '../../state/gameStore';
import styles from './PlayerRound.module.css';

export function PlayerRound(): JSX.Element {
  const room = useGameStore((store) => store.room)!;
  const self = useGameStore((store) => store.self);
  const playerId = useGameStore((store) => store.playerId);
  const submitGuess = useGameStore((store) => store.submitGuess);
  const me = useGameStore(selectMe);

  const playSound = useSound();
  const round = room.round;
  const reveal = room.reveal;
  const isPaused = room.phase === 'paused';
  const isQuestion = room.phase === 'question' && round !== null;

  const [pending, setPending] = useState<LatLng | null>(null);
  const [submitting, setSubmitting] = useState(false);
  /** הסיבוב שבו האישור התקבל בשרת — כדי שהמסך לא "יחזור" לכפתור האישור
   *  בחלון הקצר שבין סגירת הסיבוב (אחרי האישור האחרון) לבין מסך החשיפה. */
  const [confirmedRound, setConfirmedRound] = useState<number | null>(null);

  /* איפוס בכל סיבוב חדש. */
  useEffect(() => {
    setPending(null);
    setSubmitting(false);
  }, [round?.index]);

  const answered = (self?.hasAnswered ?? false) || (round !== null && confirmedRound === round.index);
  const canPick = isQuestion && !isPaused && !answered && !submitting;

  const handlePick = useCallback(
    (point: LatLng) => {
      if (!canPick) return;
      setPending(point);
    },
    [canPick],
  );

  /* משוב חושי בסימון הראשון בכל סיבוב. */
  const feedbackRoundRef = useRef<number | null>(null);
  useEffect(() => {
    if (!pending || !round || feedbackRoundRef.current === round.index) return;
    feedbackRoundRef.current = round.index;
    playSound('place');
    navigator.vibrate?.(15);
  }, [pending, playSound, round]);

  /* צליל חשיפה. */
  const revealSoundRef = useRef<number | null>(null);
  useEffect(() => {
    if (!reveal || revealSoundRef.current === reveal.index) return;
    revealSoundRef.current = reveal.index;
    playSound('reveal');
  }, [playSound, reveal]);

  useTickingSound(round?.endsAt ?? 0, isQuestion && !isPaused && !answered);

  const confirm = async () => {
    if (!pending || answered || submitting) return;
    setSubmitting(true);
    const roundIndex = round?.index ?? null;
    const result = await submitGuess(pending);
    setSubmitting(false);
    if (result.ok) {
      setConfirmedRound(roundIndex);
      navigator.vibrate?.([10, 40, 10]);
    }
  };

  const selection = answered ? (self?.currentGuess ?? pending) : pending;
  const roundNumber = (round?.index ?? reveal?.index ?? room.completedRounds) + 1;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <span className={styles.roundLabel}>
          סיבוב <span className="tabular">{Math.min(roundNumber, room.totalRounds)}</span>
          <span className={styles.roundTotal}>/{room.totalRounds}</span>
        </span>

        {isQuestion && round ? (
          <TimerRing startsAt={round.startsAt} endsAt={round.endsAt} size={52} paused={isPaused} />
        ) : (
          <span className={styles.headerSpacer} />
        )}

        <span className={styles.scoreBox}>
          <span className={`${styles.score} tabular`} data-testid="my-score">
            {(me?.score ?? 0).toLocaleString('he-IL')}
          </span>
          <span className={styles.scoreLabel}>
            נקודות{room.settings.showLiveRank && self?.rank ? ` · מקום ${self.rank}/${self.playerCount}` : ''}
          </span>
        </span>
      </header>

      <AnimatePresence mode="wait">
        {room.phase === 'countdown' ? (
          <motion.div key="countdown" className={styles.center} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <BigCountdown endsAt={room.phaseEndsAt ?? 0} />
          </motion.div>
        ) : reveal ? (
          <motion.section
            key={`reveal-${reveal.index}`}
            className={styles.reveal}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <RoundReveal
              round={reveal}
              players={room.players}
              view={room.mapView}
              category={room.settings.category}
              highlightPlayerId={playerId}
              layout="stacked"
            />
            {!isPaused && room.phaseEndsAt ? (
              <NextIn endsAt={room.phaseEndsAt} last={roundNumber >= room.totalRounds} />
            ) : (
              <p className={styles.nextIn}>המשחק מושהה</p>
            )}
          </motion.section>
        ) : round ? (
          <motion.section
            key={`round-${round.index}`}
            className={styles.play}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className={styles.photo}>
              <PlacePhoto image={round.image} />
            </div>

            <div className={styles.mapArea}>
              <WorldMap
                view={room.mapView}
                resetKey={round.index}
                onPick={canPick ? handlePick : undefined}
                selection={selection}
                selectionHue={me?.avatar.hue ?? 165}
                ariaLabel="מפת העולם — הקישו כדי לסמן איפה צולמה התמונה"
              />
              {isPaused ? <div className={styles.veil}>המשחק מושהה</div> : null}
            </div>

            <footer className={styles.footer}>
              {answered ? (
                <div className={styles.done} role="status" data-testid="answered">
                  ✓ הניחוש אושר — ממתינים לשאר השחקנים…
                </div>
              ) : (
                <button
                  className={styles.confirm}
                  disabled={!pending || !isQuestion || isPaused || submitting}
                  onClick={() => void confirm()}
                  data-testid="confirm-guess"
                >
                  {submitting ? 'שולח…' : pending ? 'אישור ✓' : 'הקישו על המפה כדי לסמן'}
                </button>
              )}
            </footer>
          </motion.section>
        ) : (
          <motion.div key="paused" className={styles.center} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <p className={styles.nextIn}>המשחק מושהה</p>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

function NextIn({ endsAt, last }: { endsAt: number; last: boolean }): JSX.Element {
  const { remainingMs } = useCountdown(endsAt - 15_000, endsAt);
  return (
    <p className={styles.nextIn}>
      {last ? 'טבלת הניצחון' : 'הסיבוב הבא'} בעוד <span className="tabular">{Math.ceil(remainingMs / 1000)}</span> שניות
    </p>
  );
}

function BigCountdown({ endsAt }: { endsAt: number }): JSX.Element {
  const { remainingMs } = useCountdown(endsAt - 3_000, endsAt);
  return (
    <div className={styles.countdown}>
      <span>מתחילים בעוד</span>
      <strong className="tabular">{Math.max(1, Math.ceil(remainingMs / 1_000))}</strong>
    </div>
  );
}

/** תקתוק בכל אחת מחמש השניות האחרונות, כל עוד לא אושר ניחוש. */
function useTickingSound(endsAt: number, active: boolean): void {
  const playSound = useSound();
  const { remainingMs } = useCountdown(endsAt - 5_000, endsAt, !active);
  const lastSecondRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      lastSecondRef.current = null;
      return;
    }
    const second = Math.ceil(remainingMs / 1_000);
    if (second > 5 || second <= 0 || lastSecondRef.current === second) return;
    lastSecondRef.current = second;
    playSound('tick');
  }, [active, playSound, remainingMs]);
}
