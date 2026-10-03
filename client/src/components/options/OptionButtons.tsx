/**
 * ארבע האפשרויות של סיבוב.
 *
 * אותו רכיב משמש שלושה מסכים:
 *  • השחקן בזמן סיבוב — כפתורים גדולים; לחיצה בוחרת ונועלת מיד.
 *  • המארח בזמן סיבוב — תצוגה בלבד (onChoose לא מוגדר).
 *  • החשיפה — התשובה הנכונה בירוק, בחירות שגויות באדום, ומי בחר מה.
 */

import type { PlayerPublic } from '@eifo/shared';

import { AvatarBadge } from '../ui/misc';
import styles from './OptionButtons.module.css';

const LETTERS = ['א', 'ב', 'ג', 'ד'] as const;

export interface OptionButtonsProps {
  readonly options: readonly string[];
  /** כשמוגדר — הכפתורים לחיצים. */
  readonly onChoose?: (index: number) => void;
  /** הבחירה של השחקן הנוכחי (נעולה). */
  readonly chosen?: number | null;
  /** בחשיפה — האינדקס הנכון. */
  readonly correctIndex?: number | null;
  /** בחשיפה — מי מהשחקנים בחר כל אפשרות. */
  readonly pickedBy?: ReadonlyMap<number, readonly PlayerPublic[]>;
  readonly disabled?: boolean;
  readonly size?: 'lg' | 'md';
  /** קידומת ל-data-testid (לבדיקות). */
  readonly testIdPrefix?: string;
}

export function OptionButtons({
  options,
  onChoose,
  chosen = null,
  correctIndex = null,
  pickedBy,
  disabled = false,
  size = 'lg',
  testIdPrefix = 'option',
}: OptionButtonsProps): JSX.Element {
  const revealed = correctIndex !== null;
  const locked = chosen !== null || disabled || !onChoose;

  return (
    <div className={`${styles.grid} ${styles[size]}`} role="group" aria-label="אפשרויות התשובה">
      {options.map((option, index) => {
        const isCorrect = revealed && index === correctIndex;
        const pickers = pickedBy?.get(index) ?? [];
        const isWrongPick = revealed && !isCorrect && (pickers.length > 0 || chosen === index);
        const state = isCorrect
          ? styles.correct
          : isWrongPick
            ? styles.wrong
            : revealed
              ? styles.faded
              : chosen === index
                ? styles.selected
                : chosen !== null
                  ? styles.faded
                  : '';

        return (
          <button
            key={`${index}-${option}`}
            type="button"
            className={`${styles.option} ${state}`}
            onClick={() => !locked && onChoose?.(index)}
            disabled={locked && !revealed && chosen !== index}
            aria-pressed={chosen === index}
            data-testid={`${testIdPrefix}-${index}`}
            data-state={isCorrect ? 'correct' : isWrongPick ? 'wrong' : chosen === index ? 'selected' : 'idle'}
          >
            <span className={styles.letter} aria-hidden="true">
              {isCorrect ? '✓' : isWrongPick ? '✗' : LETTERS[index]}
            </span>
            <span className={styles.label}>{option}</span>
            {pickers.length > 0 ? (
              <span className={styles.pickers} aria-label={`בחרו: ${pickers.map((p) => p.name).join(', ')}`}>
                {pickers.slice(0, 6).map((player) => (
                  <span key={player.id} className={styles.picker} title={player.name}>
                    <AvatarBadge avatar={player.avatar} size={22} />
                    <span className={styles.pickerName}>{player.name}</span>
                  </span>
                ))}
                {pickers.length > 6 ? <span className={styles.more}>+{pickers.length - 6}</span> : null}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
