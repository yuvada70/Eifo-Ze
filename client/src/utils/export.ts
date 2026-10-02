/**
 * הורדת קבצים מהדפדפן — משמש את כפתור "ייצוא" במסך הניהול.
 */

/** מוריד קובץ שנוצר בדפדפן. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // שחרור הזיכרון לאחר שהדפדפן הספיק להתחיל את ההורדה.
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/** מוריד אובייקט כקובץ JSON מעוצב (UTF-8, הזחה של 2 רווחים). */
export function downloadJson(value: unknown, fileName: string): void {
  downloadBlob(new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: 'application/json;charset=utf-8' }), fileName);
}
