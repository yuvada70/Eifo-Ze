/**
 * רכיבי ממשק קטנים ומשותפים.
 *
 * מרוכזים בקובץ אחד בכוונה — כל אחד מהם קצר מ-40 שורות, ופיצולם
 * לקבצים נפרדים היה מוסיף רעש בלי להוסיף בהירות.
 */

import type { CSSProperties, ReactNode } from 'react';
import type { Avatar, PlayerPublic } from '@eifo/shared';

import styles from './misc.module.css';

/* ── כרטיס ─────────────────────────────────────────────────── */

export interface CardProps {
  readonly children: ReactNode;
  /** מדגיש את הכרטיס עם מסגרת זוהרת. */
  readonly highlighted?: boolean;
  readonly className?: string;
  readonly style?: CSSProperties;
}

/** משטח מוגבה עם רקע מטושטש — יחידת התוכן הבסיסית בעיצוב. */
export function Card({ children, highlighted = false, className, style }: CardProps): JSX.Element {
  return (
    <div
      className={[styles.card, highlighted ? styles.cardHighlighted : null, className]
        .filter(Boolean)
        .join(' ')}
      style={style}
    >
      {children}
    </div>
  );
}

/* ── אווטאר ────────────────────────────────────────────────── */

export interface AvatarBadgeProps {
  readonly avatar: Avatar;
  readonly size?: number;
  /** מוסיף טבעת עמומה כשהשחקן מנותק. */
  readonly dimmed?: boolean;
}

/** עיגול צבעוני עם אימוג׳י — הזהות החזותית של השחקן. */
export function AvatarBadge({ avatar, size = 40, dimmed = false }: AvatarBadgeProps): JSX.Element {
  return (
    <span
      className={`${styles.avatar} ${dimmed ? styles.avatarDimmed : ''}`}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.52,
        background: `linear-gradient(135deg, hsl(${avatar.hue} 70% 46%), hsl(${avatar.hue} 75% 32%))`,
        boxShadow: `0 0 0 2px hsl(${avatar.hue} 70% 60% / 35%)`,
      }}
      aria-hidden="true"
    >
      {avatar.emoji}
    </span>
  );
}

/* ── שבב שחקן ──────────────────────────────────────────────── */

export interface PlayerChipProps {
  readonly player: PlayerPublic;
  /** מציג ניקוד לצד השם. */
  readonly showScore?: boolean;
  /** פעולה אופציונלית (למשל הרחקה על ידי המנהל). */
  readonly action?: ReactNode;
}

/** כרטיסון שחקן ללובי ולרשימות. */
export function PlayerChip({ player, showScore = false, action }: PlayerChipProps): JSX.Element {
  return (
    <div className={`${styles.chip} ${player.connected ? '' : styles.chipOffline}`}>
      <AvatarBadge avatar={player.avatar} size={36} dimmed={!player.connected} />
      <span className={styles.chipName}>{player.name}</span>
      {showScore ? <span className={`${styles.chipScore} tabular`}>{player.score.toLocaleString('he-IL')}</span> : null}
      {!player.connected ? <span className={styles.chipStatus}>מנותק</span> : null}
      {action}
    </div>
  );
}

/* ── תווית סטטיסטית ────────────────────────────────────────── */

export interface StatProps {
  readonly label: string;
  readonly value: ReactNode;
  readonly tone?: 'default' | 'primary' | 'accent';
}

/** זוג ערך-תווית להצגת נתון בודד. */
export function Stat({ label, value, tone = 'default' }: StatProps): JSX.Element {
  return (
    <div className={styles.stat}>
      <span className={`${styles.statValue} ${styles[`statTone_${tone}`]} tabular`}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}

/* ── מצב ריק ───────────────────────────────────────────────── */

export interface EmptyStateProps {
  readonly icon: string;
  readonly title: string;
  readonly description?: string;
  readonly children?: ReactNode;
}

/** מצב ריק ידידותי — עדיף על מסך לבן. */
export function EmptyState({ icon, title, description, children }: EmptyStateProps): JSX.Element {
  return (
    <div className={styles.empty}>
      <span className={styles.emptyIcon} aria-hidden="true">
        {icon}
      </span>
      <h3 className={styles.emptyTitle}>{title}</h3>
      {description ? <p className={styles.emptyText}>{description}</p> : null}
      {children}
    </div>
  );
}

/* ── מחוון חיבור ───────────────────────────────────────────── */

export interface ConnectionBadgeProps {
  readonly status: 'connecting' | 'online' | 'reconnecting' | 'offline';
}

const CONNECTION_LABELS: Record<ConnectionBadgeProps['status'], string> = {
  connecting: 'מתחבר…',
  online: 'מחובר',
  reconnecting: 'מתחבר מחדש…',
  offline: 'אין חיבור',
};

/** נקודת סטטוס קטנה; מוסתרת כשהכול תקין כדי לא להסיח את הדעת. */
export function ConnectionBadge({ status }: ConnectionBadgeProps): JSX.Element | null {
  if (status === 'online') return null;

  return (
    <div className={`${styles.connection} ${styles[`connection_${status}`]}`} role="status">
      <span className={styles.connectionDot} aria-hidden="true" />
      {CONNECTION_LABELS[status]}
    </div>
  );
}

/* ── טעינה ─────────────────────────────────────────────────── */

/** מסך טעינה למסך מלא. */
export function FullScreenLoader({ message = 'טוען…' }: { message?: string }): JSX.Element {
  return (
    <div className={styles.loader} role="status">
      <span className={styles.loaderRing} aria-hidden="true" />
      <p className={styles.loaderText}>{message}</p>
    </div>
  );
}
