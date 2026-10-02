/**
 * מסך ההמתנה של השחקן.
 *
 * ההמתנה היא הרגע שבו הכי קל לאבד משתתפים, ולכן המסך עונה על שלוש
 * שאלות מיד: הצטרפתי בהצלחה? מי עוד כאן? מה עומד לקרות?
 */

import { motion } from 'framer-motion';
import { CATEGORY_LABELS, DIFFICULTY_LABELS } from '@eifo/shared';

import { Button } from '../../components/ui/Button';
import { AvatarBadge, Card } from '../../components/ui/misc';
import { selectMe, useGameStore } from '../../state/gameStore';
import styles from './PlayerLobby.module.css';

export function PlayerLobby(): JSX.Element {
  const room = useGameStore((store) => store.room)!;
  const me = useGameStore(selectMe);
  const leaveGame = useGameStore((store) => store.leaveGame);

  const seconds = room.settings.roundDurationMs / 1_000;

  return (
    <main className={styles.page}>
      <motion.div
        className={styles.hero}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
      >
        {me ? <AvatarBadge avatar={me.avatar} size={84} /> : null}
        <h1 className={styles.name}>{me?.name}</h1>
        <div className={styles.status}>
          <span className={styles.pulse} aria-hidden="true" />
          מחכים שהמארח יתחיל…
        </div>

        <div className={styles.meta}>
          <span className={styles.metaBadge}>{CATEGORY_LABELS[room.settings.category]}</span>
          <span className={styles.metaBadge}>{DIFFICULTY_LABELS[room.settings.difficulty]}</span>
        </div>
      </motion.div>

      <Card className={styles.rules}>
        <h2 className={styles.rulesTitle}>איך משחקים</h2>
        <ol className={styles.rulesList}>
          <li>
            <span className={styles.step}>1</span>
            מופיעה תמונה של עיר, מונומנט או מקום מפורסם.
          </li>
          <li>
            <span className={styles.step}>2</span>
            יש לכם {seconds} שניות לסמן על המפה איפה זה — וללחוץ "אישור".
          </li>
          <li>
            <span className={styles.step}>3</span>
            ככל שהניחוש קרוב יותר למקום האמיתי — יותר נקודות.
          </li>
        </ol>
        <p className={styles.rulesFoot}>
          {room.totalRounds} סיבובים · אפשר להזיז את הסימון עד שלוחצים "אישור"
        </p>
      </Card>

      <section className={styles.players}>
        <h2 className={styles.playersTitle}>
          כבר הצטרפו
          <span className={`${styles.playersCount} tabular`}>{room.players.length}</span>
        </h2>
        <ul className={styles.playersList}>
          {room.players.map((player) => (
            <motion.li
              key={player.id}
              className={`${styles.playerChip} ${player.id === me?.id ? styles.playerChipMe : ''}`}
              layout
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 340, damping: 26 }}
            >
              <AvatarBadge avatar={player.avatar} size={24} dimmed={!player.connected} />
              {player.name}
            </motion.li>
          ))}
        </ul>
      </section>

      <Button variant="ghost" size="sm" onClick={() => void leaveGame()} className={styles.leave}>
        יציאה מהמשחק
      </Button>
    </main>
  );
}
