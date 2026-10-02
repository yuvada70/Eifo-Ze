/**
 * כפתור — רכיב הפעולה הבסיסי של המערכת.
 *
 * תומך במצב טעינה מובנה, כי כמעט כל פעולה במשחק היא בקשה לשרת
 * וחשוב שהמשתמש יראה משוב מיידי ולא ילחץ פעמיים.
 */

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  /** תופס את מלוא רוחב ההורה. */
  readonly block?: boolean;
  /** מציג מחוון טעינה ומנטרל את הכפתור. */
  readonly loading?: boolean;
  /** אייקון (אימוג׳י או SVG) לפני הטקסט. */
  readonly icon?: ReactNode;
  readonly children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', block = false, loading = false, icon, children, className, disabled, ...rest },
  ref,
) {
  const classNames = [
    styles.button,
    styles[variant],
    styles[size],
    block ? styles.block : null,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      ref={ref}
      type="button"
      className={classNames}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      <span className={loading ? `${styles.label} ${styles.loadingLabel}` : styles.label}>
        {icon ? <span aria-hidden="true">{icon}</span> : null}
        {children ? <span>{children}</span> : null}
      </span>
      {loading ? <span className={styles.spinner} aria-hidden="true" /> : null}
    </button>
  );
});
