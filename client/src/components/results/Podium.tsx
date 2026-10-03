/**
 * מסך הפודיום.
 *
 * הרגע החשוב ביותר במשחק, ולכן הוא מבוים: העמודות עולות מלמטה
 * בסדר הפוך (שלישי → שני → ראשון), הזוכה מגיע אחרון עם קפיצה,
 * וקונפטי נופל ברקע.
 */

import { motion } from 'framer-motion';
import type { LeaderboardEntry } from '@eifo/shared';

import { AvatarBadge } from '../ui/misc';
import styles from './Podium.module.css';

export interface PodiumProps {
  /** שלושת המקומות הראשונים, לפי הסדר. */
  readonly entries: readonly LeaderboardEntry[];
  readonly highlightPlayerId?: string | null;
}

/** סדר ההצגה על המסך: שני, ראשון, שלישי — כמו פודיום אמיתי. */
const DISPLAY_ORDER = [1, 0, 2] as const;

/**
 * גובה עמודת המקום הראשון בפיקסלים. הגבהים נקבעים במפורש ולא
 * באחוזים: באחוזים הם נמדדים מול גובה העמודה כולה (כולל כרטיס
 * הזוכה שמעליה), ולכן דווקא המקום הראשון — שכרטיסו הגבוה ביותר —
 * היה מקבל את המדרגה הנמוכה ביותר.
 */
const PEDESTAL_HEIGHT_PX = 190;

const PLACE_META = [
  { medal: '🥇', label: 'מקום ראשון', height: 1, delay: 1.05 },
  { medal: '🥈', label: 'מקום שני', height: 0.74, delay: 0.55 },
  { medal: '🥉', label: 'מקום שלישי', height: 0.56, delay: 0.05 },
] as const;

export function Podium({ entries, highlightPlayerId = null }: PodiumProps): JSX.Element {
  const visible = DISPLAY_ORDER.flatMap((index) => {
    const entry = entries[index];
    return entry ? [{ index: index as number, entry }] : [];
  });

  return (
    <div className={styles.podium} aria-label="פודיום המנצחים">
      {visible.map(({ index, entry }) => {
        const meta = PLACE_META[index]!;
        const isWinner = index === 0;

        return (
          <motion.div
            key={entry.player.id}
            className={`${styles.column} ${styles[`place${index + 1}`]}`}
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: meta.delay, duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
          >
            <motion.div
              className={styles.winner}
              initial={isWinner ? { scale: 0.6, rotate: -8 } : false}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: meta.delay + 0.24, type: 'spring', stiffness: 220, damping: 12 }}
            >
              <span className={styles.medal} aria-hidden="true">
                {meta.medal}
              </span>
              <AvatarBadge avatar={entry.player.avatar} size={isWinner ? 76 : 58} />
              <span className={`${styles.name} ${entry.player.id === highlightPlayerId ? styles.me : ''}`}>
                {entry.player.name}
              </span>
              <span className={`${styles.points} tabular`}>
                {entry.totalPoints.toLocaleString('he-IL')}
                <span className={styles.pointsUnit}> נק׳</span>
              </span>
              <span className={styles.detail}>✓ {entry.correctAnswers} תשובות נכונות</span>
            </motion.div>

            <motion.div
              className={styles.block}
              initial={{ height: 0 }}
              animate={{ height: Math.round(meta.height * PEDESTAL_HEIGHT_PX) }}
              transition={{ delay: meta.delay + 0.1, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            >
              <span className={styles.blockRank} aria-hidden="true">
                {index + 1}
              </span>
              <span className="visually-hidden">{meta.label}</span>
            </motion.div>
          </motion.div>
        );
      })}
    </div>
  );
}
