/**
 * טבלת הדירוג המלאה.
 *
 * מוצגת בסיום המשחק ומכילה את כל הנתונים שהוסתרו בזמן המשחק:
 * ניקוד, מספר תשובות נכונות וזמן ממוצע לתשובה נכונה. השורות מופיעות בזו אחר זו
 * מלמטה למעלה — אפקט שמייצר ציפייה לקראת המקום הראשון.
 */

import { motion } from 'framer-motion';
import { formatSeconds, medalFor, type LeaderboardEntry } from '@eifo/shared';

import { AvatarBadge } from '../ui/misc';
import styles from './Leaderboard.module.css';

export interface LeaderboardProps {
  readonly entries: readonly LeaderboardEntry[];
  /** מזהה השחקן שיש להדגיש (המשתמש הנוכחי). */
  readonly highlightPlayerId?: string | null;
  /** האם להריץ אנימציית הופעה מדורגת. */
  readonly animate?: boolean;
  /** גרסה דחוסה למסכים קטנים או לסרגל צד. */
  readonly compact?: boolean;
}

export function Leaderboard({
  entries,
  highlightPlayerId = null,
  animate = true,
  compact = false,
}: LeaderboardProps): JSX.Element {
  return (
    <div className={`${styles.table} ${compact ? styles.compact : ''}`} role="table" aria-label="טבלת דירוג">
      {!compact ? (
        <div className={`${styles.row} ${styles.head}`} role="row">
          <span role="columnheader">#</span>
          <span role="columnheader">שחקן</span>
          <span role="columnheader" className={styles.numeric}>
            נקודות
          </span>
          <span role="columnheader" className={styles.numeric}>
            נכונות
          </span>
          <span role="columnheader" className={styles.numeric}>
            זמן ממוצע
          </span>
        </div>
      ) : null}

      {entries.map((entry, index) => {
        const medal = medalFor(entry.rank);
        const isMe = entry.player.id === highlightPlayerId;

        return (
          <motion.div
            key={entry.player.id}
            className={[
              styles.row,
              isMe ? styles.me : null,
              entry.rank <= 3 ? styles[`podium${entry.rank}`] : null,
            ]
              .filter(Boolean)
              .join(' ')}
            role="row"
            initial={animate ? { opacity: 0, x: -24 } : false}
            animate={{ opacity: 1, x: 0 }}
            transition={{
              // השורות האחרונות מופיעות ראשונות — מתח לקראת הצמרת.
              delay: animate ? Math.max(0, (entries.length - index - 1) * 0.07) : 0,
              duration: 0.34,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            <span className={`${styles.rank} tabular`} role="cell">
              {medal ?? entry.rank}
            </span>

            <span className={styles.player} role="cell">
              <AvatarBadge avatar={entry.player.avatar} size={compact ? 26 : 34} />
              <span className={styles.name}>{entry.player.name}</span>
              {isMe ? <span className={styles.youTag}>את/ה</span> : null}
            </span>

            <span className={`${styles.points} ${styles.numeric} tabular`} role="cell">
              {entry.totalPoints.toLocaleString('he-IL')}
            </span>

            {!compact ? (
              <>
                <span className={`${styles.muted} ${styles.numeric} tabular`} role="cell">
                  {entry.correctAnswers > 0 ? `✓ ${entry.correctAnswers}` : '—'}
                </span>
                <span className={`${styles.muted} ${styles.numeric} tabular`} role="cell">
                  {entry.averageCorrectMs === null ? '—' : formatSeconds(entry.averageCorrectMs)}
                </span>
              </>
            ) : null}
          </motion.div>
        );
      })}
    </div>
  );
}
