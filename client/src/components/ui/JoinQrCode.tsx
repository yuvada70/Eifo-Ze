/**
 * קוד QR להצטרפות.
 *
 * נוצר בצד הלקוח בלבד (ללא שירות חיצוני), מה שאומר שהוא עובד גם
 * ברשת מקומית מנותקת מהאינטרנט — תרחיש נפוץ בכיתות ובאולמות.
 * רמת תיקון השגיאות גבוהה כדי שהסריקה תצליח גם ממרחק וגם ממקרן.
 */

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';

import styles from './JoinQrCode.module.css';

export interface JoinQrCodeProps {
  /** הכתובת המלאה שאליה יגיע הסורק. */
  readonly url: string;
  /** גודל הקוד בפיקסלים. */
  readonly size?: number;
  readonly className?: string;
}

export function JoinQrCode({ url, size = 220, className }: JoinQrCodeProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !url) return;

    let cancelled = false;
    void QRCode.toCanvas(canvas, url, {
      width: size,
      margin: 1,
      errorCorrectionLevel: 'H',
      color: { dark: '#08101f', light: '#ffffff' },
    })
      .then(() => {
        if (!cancelled) setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [size, url]);

  return (
    <div className={[styles.frame, className].filter(Boolean).join(' ')} style={{ width: size + 24 }}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        width={size}
        height={size}
        aria-label={`קוד QR להצטרפות למשחק בכתובת ${url}`}
        role="img"
      />
      {failed ? <p className={styles.fallback}>לא הצלחנו ליצור קוד QR — השתמשו בקישור או בקוד המשחק.</p> : null}
    </div>
  );
}
