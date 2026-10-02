/**
 * טיימר טבעתי.
 *
 * מקבל את חותמות הזמן של השרת (ולא משך יחסי), ולכן כל המסכים —
 * מקרן, מחשב וטלפון — מציגים בדיוק את אותה שנייה, גם אם שעון המכשיר
 * אינו מדויק. הצביעה משתנה בשלוש השניות האחרונות כדי ליצור מתח.
 */

import { memo } from 'react';

import { useCountdown } from '../../hooks/useCountdown';
import styles from './TimerRing.module.css';

export interface TimerRingProps {
  /** חותמת זמן שרת שבה השלב התחיל. */
  readonly startsAt: number;
  /** חותמת זמן שרת שבה השלב מסתיים. */
  readonly endsAt: number;
  /** קוטר הטבעת בפיקסלים. */
  readonly size?: number;
  /** האם הטיימר מוקפא. */
  readonly paused?: boolean;
  /** תווית מתחת למספר. */
  readonly label?: string;
}

const STROKE_RATIO = 0.09;

export const TimerRing = memo(function TimerRing({
  startsAt,
  endsAt,
  size = 120,
  paused = false,
  label,
}: TimerRingProps) {
  const { remainingMs, progress } = useCountdown(startsAt, endsAt, paused);

  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const isUrgent = remainingMs <= 3_000 && remainingMs > 0 && !paused;

  const strokeWidth = size * STROKE_RATIO;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div
      className={`${styles.wrapper} ${isUrgent ? styles.urgent : ''}`}
      style={{ width: size, height: size }}
      role="timer"
      aria-live="off"
      aria-label={`נותרו ${seconds} שניות`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          className={styles.track}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
        />
        <circle
          className={styles.progress}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
          // מסובבים כדי שהטבעת תתרוקן מלמעלה ובכיוון השעון.
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>

      <div className={styles.center}>
        <span className={`${styles.seconds} tabular`} style={{ fontSize: size * 0.38 }}>
          {paused ? '⏸' : seconds}
        </span>
        {label ? <span className={styles.label}>{label}</span> : null}
      </div>
    </div>
  );
});
