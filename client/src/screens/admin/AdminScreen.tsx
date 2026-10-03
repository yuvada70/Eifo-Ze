/**
 * מסך הניהול (/admin) — הוספה ועריכה של מקומות במאגר.
 *
 * זרימת העבודה:
 *  1. כניסה עם הסיסמה שהוגדרה במשתנה הסביבה ADMIN_PASSWORD.
 *  2. המאגר הנוכחי נטען מהשרת לטיוטה מקומית (localStorage).
 *  3. מוסיפים/עורכים מקומות. הקואורדינטות נבחרות בלחיצה על המפה בלבד,
 *     ותצוגה מקדימה מוודאת שהתמונה באמת נטענת.
 *  4. "ייצוא" מוריד קובץ places.json מלא ומעודכן — מחליפים בו את
 *     data/places.json ב-GitHub, ו-Render פורס מחדש אוטומטית.
 *
 * השרת לא שומר דבר: ב-Render Free ה-filesystem אינו קבוע, ולכן מקור
 * האמת הוא הקובץ ב-repo בלבד.
 */

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  CATEGORY_LABELS,
  CONTENT_CATEGORIES,
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  REGIONS,
  countPools,
  normalizeCommonsFileName,
  placeImage,
  suggestAnswerLabel,
  suggestPlaceId,
  validatePlace,
  validatePlacesFile,
  type Difficulty,
  type LatLng,
  type Place,
  type Region,
} from '@eifo/shared';

import { WorldMap } from '../../components/map/WorldMap';
import { PlacePhoto } from '../../components/place/PlacePhoto';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/misc';
import { useGameStore } from '../../state/gameStore';
import { paths, useRouter } from '../../router';
import { downloadJson } from '../../utils/export';
import styles from './AdminScreen.module.css';

const PASSWORD_KEY = 'eifo:admin-password';
const DRAFT_KEY = 'eifo:admin-draft';

interface Draft {
  /** כל המקומות — המאגר מהשרת + השינויים המקומיים. */
  readonly places: Place[];
  /** מזהי מקומות שנוספו או נערכו מקומית ועדיין לא יוצאו. */
  readonly changed: string[];
  readonly savedAt: number;
}

interface FormState {
  id: string | null;
  name: string;
  city: string;
  country: string;
  /** טקסט התשובה שמוצג באפשרויות הבחירה. */
  answerLabel: string;
  /** האם המשתמש ערך את טקסט התשובה ידנית (ואז לא מחליפים אותו בהצעה). */
  answerLabelEdited: boolean;
  category: Region;
  difficulty: Difficulty;
  file: string;
  author: string;
  license: string;
  fact: string;
  note: string;
  position: LatLng | null;
}

const EMPTY_FORM: FormState = {
  id: null,
  name: '',
  city: '',
  country: '',
  answerLabel: '',
  answerLabelEdited: false,
  category: 'europe',
  difficulty: 'easy',
  file: '',
  author: '',
  license: '',
  fact: '',
  note: '',
  position: null,
};

function readDraft(): Draft | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Draft;
    return Array.isArray(parsed.places) ? parsed : null;
  } catch {
    return null;
  }
}

function writeDraft(draft: Draft | null): void {
  try {
    if (draft) window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    else window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* אחסון חסום — הטיוטה תחיה רק עד רענון */
  }
}

function readPassword(): string {
  try {
    return window.sessionStorage.getItem(PASSWORD_KEY) ?? '';
  } catch {
    return '';
  }
}

async function adminFetch<T>(path: string, password: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  try {
    const response = await fetch(path, {
      ...init,
      headers: { 'x-admin-password': password, ...(init?.headers ?? {}) },
    });
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) return { ok: false, message: body.error ?? `שגיאה ${response.status}` };
    return { ok: true, data: body as T };
  } catch {
    return { ok: false, message: 'השרת לא זמין' };
  }
}

/** שולף את שם הצלם והרישיון מ-Commons (API ציבורי עם CORS). */
async function fetchCommonsCredit(file: string): Promise<{ author: string; license: string } | null> {
  const title = `File:${normalizeCommonsFileName(file)}`;
  const url =
    'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&prop=imageinfo&iiprop=extmetadata&titles=' +
    encodeURIComponent(title);
  try {
    const response = await fetch(url);
    const data = (await response.json()) as {
      query?: { pages?: Record<string, { imageinfo?: { extmetadata?: Record<string, { value?: string }> }[] }> };
    };
    const page = Object.values(data.query?.pages ?? {})[0];
    const meta = page?.imageinfo?.[0]?.extmetadata;
    if (!meta) return null;
    const strip = (html = '') => {
      const element = document.createElement('div');
      element.innerHTML = html;
      return (element.textContent ?? '').replace(/\s+/g, ' ').trim();
    };
    return {
      author: strip(meta['Artist']?.value).slice(0, 120),
      license: strip(meta['LicenseShortName']?.value),
    };
  } catch {
    return null;
  }
}

export function AdminScreen(): JSX.Element {
  const { navigate } = useRouter();
  const pushToast = useGameStore((store) => store.pushToast);

  const [password, setPassword] = useState(readPassword);
  const [authorized, setAuthorized] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [serverCount, setServerCount] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [imageStatus, setImageStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [search, setSearch] = useState('');
  const importRef = useRef<HTMLInputElement>(null);

  /* כניסה אוטומטית אם הסיסמה כבר שמורה בלשונית. */
  useEffect(() => {
    if (password) void login(password);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function login(candidate: string) {
    setBusy(true);
    setLoginError(null);
    const result = await adminFetch<{ ok: true }>('/api/admin/login', candidate, { method: 'POST' });
    if (!result.ok) {
      setBusy(false);
      setLoginError(result.message);
      return;
    }
    try {
      window.sessionStorage.setItem(PASSWORD_KEY, candidate);
    } catch {
      /* מתעלמים */
    }
    setAuthorized(true);
    await loadFromServer(candidate, false);
    setBusy(false);
  }

  async function loadFromServer(secret: string, replaceDraft: boolean) {
    const result = await adminFetch<unknown>('/api/admin/places', secret);
    if (!result.ok) {
      pushToast('error', result.message);
      return;
    }
    const validation = validatePlacesFile(result.data);
    setServerCount(validation.places.length);
    const existing = readDraft();
    if (existing && !replaceDraft) {
      setDraft(existing);
    } else {
      const fresh: Draft = { places: validation.places, changed: [], savedAt: Date.now() };
      setDraft(fresh);
      writeDraft(fresh);
    }
  }

  const persist = (next: Draft) => {
    setDraft(next);
    writeDraft(next);
  };

  const counts = useMemo(() => countPools(draft?.places ?? []), [draft]);
  const existingIds = useMemo(() => new Set((draft?.places ?? []).map((place) => place.id)), [draft]);

  const filtered = useMemo(() => {
    const list = draft?.places ?? [];
    const query = search.trim().toLowerCase();
    const changed = new Set(draft?.changed ?? []);
    const matches = query
      ? list.filter((place) =>
          [place.name, place.city, place.country, place.id].some((value) => value.toLowerCase().includes(query)),
        )
      : list;
    // שינויים מקומיים קודם, ואחריהם האחרונים במאגר.
    return [...matches].reverse().sort((a, b) => Number(changed.has(b.id)) - Number(changed.has(a.id)));
  }, [draft, search]);

  /** עדכון שדה. עיר, מדינה וקטגוריה מעדכנות גם את ההצעה לטקסט התשובה. */
  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (!next.answerLabelEdited && (key === 'city' || key === 'country' || key === 'category')) {
        next.answerLabel = suggestAnswerLabel(next.city, next.country, next.category);
      }
      return next;
    });
  const suggestedLabel = suggestAnswerLabel(form.city, form.country, form.category);

  const normalizedFile = normalizeCommonsFileName(form.file);
  const preview = normalizedFile
    ? placeImage({
        id: 'preview',
        name: '',
        city: '',
        country: '',
        answerLabel: '',
        category: form.category,
        difficulty: form.difficulty,
        lat: 0,
        lng: 0,
        fact: '',
        image: { file: normalizedFile, author: form.author || '—', license: form.license || '—' },
      }, 960)
    : null;

  /* בדיקת טעינת התמונה (נפרדת מהתצוגה, כדי לחסום שמירה של קישור שבור). */
  useEffect(() => {
    if (!preview) {
      setImageStatus('idle');
      return;
    }
    setImageStatus('loading');
    const image = new Image();
    image.referrerPolicy = 'no-referrer';
    image.onload = () => setImageStatus('ok');
    image.onerror = () => setImageStatus('error');
    image.src = preview.url;
    return () => {
      image.onload = null;
      image.onerror = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview?.url]);

  const buildPlace = (): Place => {
    const id =
      form.id ??
      suggestPlaceId(normalizedFile.replace(/\.[a-z]+$/i, '') || form.city || 'place', existingIds);
    const place: Place = {
      id,
      name: form.name.trim(),
      city: form.city.trim(),
      country: form.country.trim(),
      answerLabel: form.answerLabel.trim(),
      category: form.category,
      difficulty: form.difficulty,
      lat: form.position ? Math.round(form.position.lat * 1e5) / 1e5 : Number.NaN,
      lng: form.position ? Math.round(form.position.lng * 1e5) / 1e5 : Number.NaN,
      image: { file: normalizedFile, author: form.author.trim(), license: form.license.trim() },
      fact: form.fact.trim(),
      ...(form.note.trim() ? { note: form.note.trim() } : {}),
    };
    return place;
  };

  const savePlace = (event: FormEvent) => {
    event.preventDefault();
    if (!draft) return;

    const place = buildPlace();
    const problems = validatePlace(place);
    if (!form.position) problems.unshift('בחרו את המיקום בלחיצה על המפה');
    if (imageStatus === 'error') problems.push('התמונה לא נטענת — בדקו את שם הקובץ');
    if (imageStatus === 'loading') problems.push('התמונה עדיין בטעינה — המתינו רגע');
    setFormErrors(problems);
    if (problems.length > 0) return;

    const places = form.id
      ? draft.places.map((existing) => (existing.id === form.id ? place : existing))
      : [...draft.places, place];
    const changed = Array.from(new Set([...draft.changed, place.id]));
    persist({ places, changed, savedAt: Date.now() });
    pushToast('success', form.id ? `"${place.name}" עודכן בטיוטה` : `"${place.name}" נוסף לטיוטה`);
    setForm({ ...EMPTY_FORM, category: form.category, difficulty: form.difficulty });
  };

  const editPlace = (place: Place) => {
    setForm({
      id: place.id,
      name: place.name,
      city: place.city,
      country: place.country,
      answerLabel: place.answerLabel,
      answerLabelEdited: place.answerLabel !== suggestAnswerLabel(place.city, place.country, place.category),
      category: place.category,
      difficulty: place.difficulty,
      file: place.image.file,
      author: place.image.author,
      license: place.image.license,
      fact: place.fact,
      note: place.note ?? '',
      position: { lat: place.lat, lng: place.lng },
    });
    setFormErrors([]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deletePlace = (place: Place) => {
    if (!draft || !window.confirm(`למחוק את "${place.name}" מהטיוטה?`)) return;
    persist({
      places: draft.places.filter((existing) => existing.id !== place.id),
      changed: Array.from(new Set([...draft.changed, place.id])),
      savedAt: Date.now(),
    });
  };

  const exportFile = () => {
    if (!draft) return;
    const validation = validatePlacesFile({ version: 1, places: draft.places });
    if (!validation.ok) {
      pushToast('error', `יש ${validation.errors.length} רשומות פגומות — תקנו לפני הייצוא`);
      return;
    }
    downloadJson({ version: 1, places: draft.places }, 'places.json');
    pushToast('success', 'הקובץ places.json הורד — החליפו בו את data/places.json ב-GitHub');
  };

  const importFile = async (file: File) => {
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const validation = validatePlacesFile(parsed);
      if (!validation.ok) {
        pushToast('error', `הקובץ לא תקין: ${validation.errors.slice(0, 3).join(' | ')}`);
        return;
      }
      persist({ places: validation.places, changed: [], savedAt: Date.now() });
      pushToast('success', `נטענו ${validation.places.length} מקומות מהקובץ`);
    } catch {
      pushToast('error', 'לא ניתן לקרוא את הקובץ — האם זה JSON?');
    }
  };

  const autoCredit = async () => {
    if (!normalizedFile) return;
    const credit = await fetchCommonsCredit(normalizedFile);
    if (!credit) {
      pushToast('warn', 'לא הצלחנו לשלוף את הקרדיט מ-Commons — מלאו ידנית');
      return;
    }
    setForm((current) => ({ ...current, author: credit.author || current.author, license: credit.license || current.license }));
  };

  /* ───────────────────────────── מסך כניסה ───────────────────────────── */

  if (!authorized) {
    return (
      <main className={styles.loginPage}>
        <Card className={styles.loginCard}>
          <h1 className={styles.title}>🔐 מסך ניהול</h1>
          <p className={styles.muted}>הזינו את סיסמת הניהול (משתנה הסביבה ADMIN_PASSWORD).</p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void login(password);
            }}
            className={styles.loginForm}
          >
            <input
              type="password"
              className={styles.input}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="סיסמה"
              autoComplete="current-password"
              data-testid="admin-password"
            />
            {loginError ? <p className={styles.error}>{loginError}</p> : null}
            <Button type="submit" loading={busy} block data-testid="admin-login">
              כניסה
            </Button>
          </form>
          <button className={styles.link} onClick={() => navigate(paths.landing())}>
            → חזרה למשחק
          </button>
        </Card>
      </main>
    );
  }

  const changedCount = draft?.changed.length ?? 0;

  /* ───────────────────────────── מסך עבודה ───────────────────────────── */

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>ניהול מאגר המקומות</h1>
          <p className={styles.muted}>
            בשרת: {serverCount ?? '…'} מקומות · בטיוטה: {draft?.places.length ?? 0}
            {changedCount > 0 ? <strong className={styles.unsaved}> · {changedCount} שינויים שטרם יוצאו</strong> : null}
          </p>
        </div>
        <div className={styles.headerActions}>
          <Button icon="⬇️" onClick={exportFile} data-testid="admin-export">
            ייצוא
          </Button>
          <Button variant="secondary" icon="⬆️" onClick={() => importRef.current?.click()}>
            טעינת קובץ
          </Button>
          <input
            ref={importRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importFile(file);
              event.target.value = '';
            }}
            data-testid="admin-import"
          />
          <Button
            variant="ghost"
            onClick={() => {
              if (window.confirm('לזרוק את הטיוטה ולטעון מחדש את המאגר מהשרת?')) void loadFromServer(password, true);
            }}
          >
            איפוס מהשרת
          </Button>
        </div>
      </header>

      <p className={styles.howto}>
        💡 השינויים נשמרים זמנית בדפדפן הזה בלבד. כשסיימתם — לחצו <b>ייצוא</b>, והעלו את הקובץ שהורד במקום{' '}
        <code dir="ltr">data/places.json</code> ב-GitHub. Render יפרוס מחדש אוטומטית.
      </p>

      <section className={styles.editor}>
        <Card className={styles.formCard}>
          <h2 className={styles.sectionTitle}>{form.id ? `עריכה: ${form.name}` : 'הוספת מקום חדש'}</h2>
          <form className={styles.form} onSubmit={savePlace} noValidate>
            <div className={styles.row2}>
              <Field label="שם המקום">
                <input className={styles.input} value={form.name} onChange={(e) => update('name', e.target.value)} data-testid="f-name" />
              </Field>
              <Field label="עיר">
                <input className={styles.input} value={form.city} onChange={(e) => update('city', e.target.value)} data-testid="f-city" />
              </Field>
            </div>
            <div className={styles.row3}>
              <Field label="מדינה">
                <input className={styles.input} value={form.country} onChange={(e) => update('country', e.target.value)} data-testid="f-country" />
              </Field>
              <Field label="קטגוריה">
                <select className={styles.input} value={form.category} onChange={(e) => update('category', e.target.value as Region)} data-testid="f-category">
                  {REGIONS.map((region) => (
                    <option key={region} value={region}>
                      {CATEGORY_LABELS[region]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="דרגה">
                <select className={styles.input} value={form.difficulty} onChange={(e) => update('difficulty', e.target.value as Difficulty)} data-testid="f-difficulty">
                  {DIFFICULTIES.map((difficulty) => (
                    <option key={difficulty} value={difficulty}>
                      {DIFFICULTY_LABELS[difficulty]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field
              label={
                form.category === 'israel'
                  ? 'טקסט התשובה באפשרויות — שם היישוב או האזור, בלי "ישראל"'
                  : 'טקסט התשובה באפשרויות — "עיר, מדינה" או "אזור, מדינה"'
              }
            >
              <div className={styles.inline}>
                <input
                  className={styles.input}
                  value={form.answerLabel}
                  onChange={(e) => setForm((current) => ({ ...current, answerLabel: e.target.value, answerLabelEdited: true }))}
                  placeholder={suggestedLabel || 'פריז, צרפת'}
                  data-testid="f-answer-label"
                />
                {form.answerLabelEdited && suggestedLabel && suggestedLabel !== form.answerLabel ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setForm((current) => ({ ...current, answerLabel: suggestedLabel, answerLabelEdited: false }))}
                  >
                    הצעה: {suggestedLabel}
                  </Button>
                ) : null}
              </div>
            </Field>

            <Field label="שם הקובץ ב-Wikimedia Commons (או הקישור לדף הקובץ)">
              <div className={styles.inline}>
                <input
                  className={styles.input}
                  value={form.file}
                  onChange={(e) => update('file', e.target.value)}
                  placeholder="Tour Eiffel Wikimedia Commons.jpg"
                  dir="ltr"
                  data-testid="f-file"
                />
                <Button variant="secondary" size="sm" onClick={() => void autoCredit()} disabled={!normalizedFile}>
                  שליפת קרדיט
                </Button>
              </div>
            </Field>
            <div className={styles.row2}>
              <Field label="צלם / יוצר">
                <input className={styles.input} value={form.author} onChange={(e) => update('author', e.target.value)} dir="auto" data-testid="f-author" />
              </Field>
              <Field label="רישיון (Public domain / CC0 / CC BY / CC BY-SA)">
                <input className={styles.input} value={form.license} onChange={(e) => update('license', e.target.value)} placeholder="CC BY-SA 4.0" dir="ltr" data-testid="f-license" />
              </Field>
            </div>
            <Field label="שורת מידע קצרה ומעניינת">
              <textarea className={styles.input} rows={2} value={form.fact} onChange={(e) => update('fact', e.target.value)} data-testid="f-fact" />
            </Field>
            <Field label="הערת אימות (רשות)">
              <input className={styles.input} value={form.note} onChange={(e) => update('note', e.target.value)} />
            </Field>

            <div className={styles.coords} data-testid="f-coords">
              📍{' '}
              {form.position ? (
                <span dir="ltr" className="tabular">
                  {form.position.lat.toFixed(5)}, {form.position.lng.toFixed(5)}
                </span>
              ) : (
                'לחצו על המפה כדי לבחור את המיקום המדויק (אפשר להגדיל ולגרור)'
              )}
            </div>

            {formErrors.length > 0 ? (
              <ul className={styles.errors} role="alert">
                {formErrors.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            ) : null}

            <div className={styles.inline}>
              <Button type="submit" icon={form.id ? '💾' : '➕'} data-testid="f-save">
                {form.id ? 'שמירת השינויים' : 'הוספה לטיוטה'}
              </Button>
              {form.id || form.name || form.file ? (
                <Button variant="ghost" onClick={() => { setForm(EMPTY_FORM); setFormErrors([]); }}>
                  ניקוי הטופס
                </Button>
              ) : null}
            </div>
          </form>
        </Card>

        <div className={styles.side}>
          <div className={styles.mapBox}>
            <WorldMap
              view={form.category === 'israel' ? 'israel' : 'world'}
              onPick={(point) => update('position', point)}
              selection={form.position}
              focusKey={form.id}
              ariaLabel="בחירת מיקום המקום על המפה"
            />
          </div>
          <div className={styles.previewBox}>
            {preview ? (
              <>
                <PlacePhoto image={preview} zoomable />
                <p className={`${styles.imageStatus} ${styles[`image_${imageStatus}`]}`} data-testid="f-image-status">
                  {imageStatus === 'ok' ? '✓ התמונה נטענת' : imageStatus === 'error' ? '✗ התמונה לא נטענת' : 'בודקים את התמונה…'}
                </p>
              </>
            ) : (
              <p className={styles.muted}>תצוגה מקדימה של התמונה תופיע כאן</p>
            )}
          </div>
        </div>
      </section>

      <section>
        <h2 className={styles.sectionTitle}>כמות מקומות לכל שילוב</h2>
        <table className={styles.counts}>
          <thead>
            <tr>
              <th />
              {DIFFICULTIES.map((difficulty) => (
                <th key={difficulty}>{DIFFICULTY_LABELS[difficulty]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CONTENT_CATEGORIES.map((category) => (
              <tr key={category}>
                <th>{CATEGORY_LABELS[category]}</th>
                {DIFFICULTIES.map((difficulty) => (
                  <td key={difficulty} className={counts[category][difficulty] < 25 && category !== 'mixed' ? styles.low : ''}>
                    {counts[category][difficulty]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <div className={styles.listHeader}>
          <h2 className={styles.sectionTitle}>המקומות בטיוטה</h2>
          <input className={styles.input} placeholder="חיפוש…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <ul className={styles.list}>
          {filtered.slice(0, 200).map((place) => (
            <li key={place.id} className={`${styles.item} ${draft?.changed.includes(place.id) ? styles.itemChanged : ''}`}>
              <img src={placeImage(place, 250).url} alt="" loading="lazy" className={styles.thumb} referrerPolicy="no-referrer" />
              <div className={styles.itemText}>
                <strong>{place.name}</strong>
                <span className={styles.muted}>
                  🎯 {place.answerLabel} · {CATEGORY_LABELS[place.category]} · {DIFFICULTY_LABELS[place.difficulty]}
                </span>
                {place.note ? <span className={styles.note}>⚠️ {place.note}</span> : null}
              </div>
              <div className={styles.itemActions}>
                <Button size="sm" variant="secondary" onClick={() => editPlace(place)}>
                  עריכה
                </Button>
                <Button size="sm" variant="ghost" onClick={() => deletePlace(place)}>
                  מחיקה
                </Button>
              </div>
            </li>
          ))}
        </ul>
        {filtered.length > 200 ? <p className={styles.muted}>מוצגים 200 ראשונים — השתמשו בחיפוש.</p> : null}
      </section>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      {children}
    </label>
  );
}
