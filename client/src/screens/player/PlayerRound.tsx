/**
 * מסך המשחק של השחקן.
 *
 * בטלפון: התמונה בחלק העליון, ומתחתיה ארבעה כפתורים גדולים. לחיצה על
 * אפשרות בוחרת ונועלת אותה מיד — אין כפתור "אישור" נפרד. ככל שעונים
 * מהר יותר (ונכון), מקבלים יותר נקודות.
 *
 * אחרי שהסיבוב נסגר מוצגת החשיפה: התשובה הנכונה, מי בחר מה, ומפה קטנה.
 */

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import { OptionButtons } from '../../components/options/OptionButtons';
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
  const submitAnswer = useGameStore((store) => store.submitAnswer);
  const me = useGameStore(selectMe);

  const playSound = useSound();
  const round = room.round;
  const reveal = room.reveal;
  const isPaused = room.phase === 'paused';
  const isQuestion = room.phase === 'question' && round !== null;

  /**
   * הבחירה המקומית בסיבוב הנוכחי. נשמרת גם אחרי שהשרת סוגר את הסיבוב
   * (כשהשחקן האחרון ענה), כדי שהכפתורים לא "יתאפסו" לרגע לפני החשיפה.
   */
  const [localChoice, setLocalChoice] = useState<{ round: number; choice: number } | null>(null);

  const choice =
    round && localChoice?.round === round.index ? localChoice.choice : self?.hasAnswered ? (self.choice ?? null) : null;
  const answered = choice !== null;

  const choose = async (index: number) => {
    if (!round || answered || !isQuestion || isPaused) return;
    setLocalChoice({ round: round.index, choice: index });
    playSound('place');
    navigator.vibrate?.(15);
    const result = await submitAnswer(index);
    if (!result.ok) setLocalChoice(null);
  };

  /* צליל חשיפה. */
  const revealSoundRef = useRef<number | null>(null);
  useEffect(() => {
    if (!reveal || revealSoundRef.current === reveal.index) return;
    revealSoundRef.current = reveal.index;
    playSound('reveal');
  }, [playSound, reveal]);

  useTickingSound(round?.endsAt ?? 0, isQuestion && !isPaused && !answered);

  const roundNumber = (round?.index ?? reveal?.index ?? room.completedRounds) + 1;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <span className={styles.roundLabel}>
          סיבוב <span className="tabular">{Math.min(roundNumber, room.totalRounds)}</span>
          <span className={styles.roundTotal}>/{room.totalRounds}</span>
        </span>

        {isQuestion && round ? (
          <TimerRing startsAt={round.startsAt} endsAt={round.endsAt} size={48} paused={isPaused} />
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

            <p className={styles.question}>איפה צולמה התמונה?</p>

            <div className={styles.options}>
              <OptionButtons
                options={round.options}
                onChoose={(index) => void choose(index)}
                chosen={choice}
                disabled={!isQuestion || isPaused}
              />
            </div>

            <p className={`${styles.status} ${answered ? styles.statusDone : ''}`} role="status" data-testid={answered ? 'answered' : undefined}>
              {isPaused ? 'המשחק מושהה' : answered ? '🔒 הבחירה ננעלה — ממתינים לשאר השחקנים…' : 'מהר יותר = יותר נקודות ⚡'}
            </p>
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

/** תקתוק בכל אחת מחמש השניות האחרונות, כל עוד לא נבחרה תשובה. */
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
