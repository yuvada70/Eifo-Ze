/**
 * תמונת המקום + קרדיט.
 *
 * כל תמונה מגיעה מ-Wikimedia Commons ברישיון חופשי, ולכן מתחתיה תמיד
 * מוצג קרדיט: שם הצלם והרישיון, עם קישור לדף הקובץ. לחיצה על התמונה
 * פותחת אותה במסך מלא — שימושי במיוחד בטלפון.
 */

import { useEffect, useState } from 'react';
import type { PlaceImage } from '@eifo/shared';

import styles from './PlacePhoto.module.css';

export interface PlacePhotoProps {
  readonly image: PlaceImage;
  /** טקסט חלופי — בזמן סיבוב אסור שיחשוף את שם המקום. */
  readonly alt?: string;
  readonly className?: string;
  /** האם לאפשר הגדלה למסך מלא. */
  readonly zoomable?: boolean;
}

export function PlacePhoto({ image, alt = 'תמונת המקום', className, zoomable = true }: PlacePhotoProps): JSX.Element {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setStatus('loading');
    setAttempt(0);
    setExpanded(false);
  }, [image.url]);

  const src = attempt === 0 ? image.url : `${image.url}&retry=${attempt}`;

  return (
    <figure className={[styles.figure, className].filter(Boolean).join(' ')}>
      <div className={styles.frame}>
        {status !== 'error' ? (
          <img
            key={src}
            src={src}
            alt={alt}
            className={`${styles.image} ${status === 'loaded' ? styles.imageLoaded : ''}`}
            onLoad={() => setStatus('loaded')}
            onError={() => setStatus('error')}
            onClick={() => zoomable && status === 'loaded' && setExpanded(true)}
            referrerPolicy="no-referrer"
            decoding="async"
            draggable={false}
          />
        ) : null}

        {status === 'loading' ? <span className={styles.spinner} aria-label="טוען תמונה" /> : null}

        {status === 'error' ? (
          <div className={styles.error}>
            <span aria-hidden="true">🖼️</span>
            <p>התמונה לא נטענה</p>
            <button
              className={styles.retry}
              onClick={() => {
                setAttempt((value) => value + 1);
                setStatus('loading');
              }}
            >
              נסו שוב
            </button>
          </div>
        ) : null}

        {zoomable && status === 'loaded' ? (
          <button className={styles.zoomHint} onClick={() => setExpanded(true)} aria-label="הגדלת התמונה">
            ⤢
          </button>
        ) : null}
      </div>

      <figcaption className={styles.credit}>
        <span aria-hidden="true">📷</span>{' '}
        <a href={image.pageUrl} target="_blank" rel="noopener noreferrer">
          <bdi>{image.author}</bdi> · <bdi>{image.license}</bdi>
        </a>{' '}
        <span className={styles.via}>· Wikimedia Commons</span>
      </figcaption>

      {expanded ? (
        <div className={styles.lightbox} role="dialog" aria-label="התמונה במסך מלא" onClick={() => setExpanded(false)}>
          <img src={src} alt={alt} className={styles.lightboxImage} referrerPolicy="no-referrer" />
          <button className={styles.close} aria-label="סגירה">
            ✕
          </button>
        </div>
      ) : null}
    </figure>
  );
}
