/**
 * חדר משחק — מכונת המצבים המלאה של משחק יחיד.
 *
 * החדר הוא מקור האמת היחיד: הוא מחזיק את השחקנים, את סדר השאלות,
 * את הניחושים ואת התוצאות, והוא היחיד שמודד זמן. הלקוחות מציגים
 * בלבד. גישה כזו מונעת רמאות (הזמן והמיקום האמיתי לעולם לא נמצאים
 * בצד הלקוח לפני הסיום) ומבטיחה שכל המשתתפים רואים אותו מצב.
 *
 * החדר אינו יודע דבר על Socket.IO או על HTTP — הוא מדווח על שינויים
 * דרך callbacks. כך ניתן לבדוק אותו ביחידות ולהחליף את שכבת התקשורת.
 */

import { randomUUID } from 'node:crypto';

import {
  CONTENT_CATEGORIES,
  DEFAULT_SETTINGS,
  DIFFICULTIES,
  MAX_PLAYERS_PER_ROOM,
  NO_ANSWER_SCORE,
  SETTINGS_LIMITS,
  buildLeaderboard,
  createAvatar,
  isValidLatLng,
  mapViewForCategory,
  normalizeNameForComparison,
  placeImage,
  placePosition,
  roundLatLng,
  sanitizePlayerName,
  scoreGuess,
  scoringForCategory,
  selectPlacePool,
  type ContentCategory,
  type Difficulty,
  type ErrorCode,
  type GameResults,
  type GameSettings,
  type LatLng,
  type Place,
  type PlayerPrivateState,
  type PlayerPublic,
  type PublicGameState,
  type RoundResult,
  type ScoringConfig,
} from '@eifo/shared';

import type { PlacesStore } from '../content/placesStore.js';

/** רשומת שחקן פנימית — מכילה גם מידע סודי שאינו משודר. */
export interface PlayerRecord {
  readonly id: string;
  /** אסימון חיבור מחדש; לעולם אינו נשלח לשחקנים אחרים. */
  readonly token: string;
  name: string;
  readonly avatar: { emoji: string; hue: number };
  readonly joinedAt: number;
  score: number;
  connected: boolean;
  /** מזהה החיבור הפעיל, אם קיים. */
  socketId: string | null;
}

/** ניחוש שנקלט בסיבוב פעיל. */
interface PendingGuess {
  point: LatLng;
  /** הזמן שחלף מפתיחת הסיבוב, במילישניות. */
  elapsedMs: number;
}

/** שגיאה עסקית עם קוד יציב שהשרת מתרגם לתשובת Ack. */
export class GameError extends Error {
  constructor(readonly code: ErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'GameError';
  }
}

/** התראות שהחדר מפיץ החוצה. */
export interface RoomListeners {
  /** נקרא בכל שינוי במצב הציבורי. */
  onStateChanged(room: GameRoom): void;
  /** נקרא כשהמשחק מסתיים והתוצאות מוכנות. */
  onResults(room: GameRoom, results: GameResults): void;
  /** נקרא כשמצבו הפרטי של שחקן מסוים השתנה. */
  onPlayerStateChanged(room: GameRoom, playerId: string): void;
  /** הודעה קצרה לכל החדר (למשל: אין מספיק מקומות). */
  onNotice?(room: GameRoom, message: string): void;
}

/** מנשק מתזמן — מוזרק כדי לאפשר בדיקות עם שעון מדומה. */
export interface Scheduler {
  setTimeout(handler: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  now(): number;
}

/** מתזמן ברירת המחדל, מעל שעון המערכת. */
export const systemScheduler: Scheduler = {
  setTimeout: (handler, ms) => setTimeout(handler, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
};

/** מרווח חסד לקליטת תשובות שיצאו לפני תום הזמן והתעכבו ברשת. */
const NETWORK_GRACE_MS = 750;

/**
 * חדר משחק יחיד.
 */
export class GameRoom {
  readonly code: string;
  readonly hostToken: string;
  readonly createdAt: number;

  private settings: GameSettings;
  private phase: PublicGameState['phase'] = 'lobby';
  private readonly players = new Map<string, PlayerRecord>();

  /** המקומות שנבחרו לסיבובי המשחק, לפי הסדר. */
  private questions: readonly Place[] = [];
  private currentRoundIndex = -1;
  private roundStartsAt = 0;
  private roundEndsAt = 0;
  /** מתי מסתיים השלב הנוכחי (ספירה לאחור / הפוגה). */
  private phaseEndsAt: number | null = null;
  /** הזמן שנותר בסיבוב שהוקפא, כדי לחדשו במדויק. */
  private pausedRemainingMs: number | null = null;
  private phaseBeforePause: PublicGameState['phase'] | null = null;

  private readonly guesses = new Map<string, PendingGuess>();
  private completedRounds: RoundResult[] = [];
  private results: GameResults | null = null;

  private timerHandle: unknown = null;
  private hostSocketId: string | null = null;
  /** חותמת הפעילות האחרונה — משמשת לניקוי חדרים נטושים. */
  lastActivityAt: number;

  constructor(
    code: string,
    settings: Partial<GameSettings>,
    private readonly listeners: RoomListeners,
    private readonly places: PlacesStore,
    private readonly scheduler: Scheduler = systemScheduler,
  ) {
    this.code = code;
    this.hostToken = randomUUID();
    this.createdAt = scheduler.now();
    this.lastActivityAt = this.createdAt;
    this.settings = normalizeSettings(settings);
  }

  // ────────────────────────────────────────────────────────────
  //  קריאה
  // ────────────────────────────────────────────────────────────

  /** מצב ציבורי — ללא מיקומים אמיתיים, מרחקים או ניחושים. */
  getPublicState(): PublicGameState {
    const pausedFrom = this.phase === 'paused' ? this.phaseBeforePause : this.phase;
    return {
      code: this.code,
      phase: this.phase,
      settings: this.settings,
      mapView: mapViewForCategory(this.settings.category),
      round: pausedFrom === 'question' ? this.currentPrompt() : null,
      reveal: pausedFrom === 'reveal' ? (this.completedRounds.at(-1) ?? null) : null,
      players: this.listPlayers(),
      answeredCount: this.guesses.size,
      completedRounds: this.completedRounds.length,
      totalRounds: this.questions.length > 0 ? this.questions.length : Math.min(this.settings.roundCount, this.poolSize()),
      poolSize: this.poolSize(),
      phaseEndsAt: this.phaseEndsAt,
      hostConnected: this.hostSocketId !== null,
    };
  }

  /** גודל המאגר לשילוב הקטגוריה והדרגה הנוכחי. */
  poolSize(): number {
    return selectPlacePool(this.places.all(), this.settings.category, this.settings.difficulty).length;
  }

  /** מצב פרטי של שחקן בודד. */
  getPlayerState(playerId: string): PlayerPrivateState | null {
    const player = this.players.get(playerId);
    if (!player) return null;

    const guess = this.guesses.get(playerId);
    return {
      playerId,
      score: player.score,
      rank: this.settings.showLiveRank ? this.rankOf(playerId) : null,
      playerCount: this.players.size,
      hasAnswered: guess !== undefined,
      currentGuess: guess?.point ?? null,
    };
  }

  /** התוצאות המלאות, אם המשחק הסתיים. */
  getResults(): GameResults | null {
    return this.results;
  }

  /** מספר השחקנים בחדר. */
  get playerCount(): number {
    return this.players.size;
  }

  /** האם החדר ריק לגמרי (אין מנהל מחובר ואין שחקנים מחוברים). */
  get isDormant(): boolean {
    if (this.hostSocketId !== null) return false;
    for (const player of this.players.values()) {
      if (player.connected) return false;
    }
    return true;
  }

  /** מאמת שהאסימון שייך למנהל החדר. */
  verifyHostToken(token: string): boolean {
    return timingSafeEquals(token, this.hostToken);
  }

  /** מאתר שחקן לפי אסימון חיבור מחדש. */
  findPlayerByToken(token: string): PlayerRecord | null {
    for (const player of this.players.values()) {
      if (timingSafeEquals(token, player.token)) return player;
    }
    return null;
  }

  // ────────────────────────────────────────────────────────────
  //  ניהול חיבורים
  // ────────────────────────────────────────────────────────────

  /** רושם את חיבור המנהל. */
  attachHost(socketId: string): void {
    this.hostSocketId = socketId;
    this.touch();
    this.emitState();
  }

  /** מנתק את המנהל (החדר נשמר עד לפקיעת התוקף). */
  detachHost(socketId: string): void {
    if (this.hostSocketId !== socketId) return;
    this.hostSocketId = null;
    this.touch();
    this.emitState();
  }

  /** מזהה החיבור של המנהל, אם מחובר. */
  get hostSocket(): string | null {
    return this.hostSocketId;
  }

  /**
   * מצרף שחקן חדש.
   * @throws {GameError} כשהשם אינו תקין, תפוס, או שהחדר מלא.
   */
  addPlayer(rawName: string, socketId: string): PlayerRecord {
    const name = sanitizePlayerName(rawName);
    if (name.length < 2) throw new GameError('INVALID_NAME');
    if (this.players.size >= MAX_PLAYERS_PER_ROOM) throw new GameError('ROOM_FULL');

    const normalized = normalizeNameForComparison(name);
    for (const existing of this.players.values()) {
      if (normalizeNameForComparison(existing.name) === normalized) {
        throw new GameError('NAME_TAKEN');
      }
    }

    const id = randomUUID();
    const player: PlayerRecord = {
      id,
      token: randomUUID(),
      name,
      avatar: createAvatar(id),
      joinedAt: this.scheduler.now(),
      score: 0,
      connected: true,
      socketId,
    };

    this.players.set(id, player);
    this.touch();
    this.emitState();
    return player;
  }

  /** מחבר מחדש שחקן קיים לאחר רענון או ניתוק. */
  reattachPlayer(playerId: string, socketId: string): PlayerRecord {
    const player = this.players.get(playerId);
    if (!player) throw new GameError('NOT_AUTHORIZED');

    player.socketId = socketId;
    player.connected = true;
    this.touch();
    this.emitState();
    return player;
  }

  /** מסמן שחקן כמנותק, אך שומר את ניקודו לחיבור מחדש. */
  markPlayerDisconnected(socketId: string): void {
    for (const player of this.players.values()) {
      if (player.socketId === socketId) {
        player.socketId = null;
        player.connected = false;
        this.touch();
        this.emitState();
        this.closeRoundIfEveryoneAnswered();
        return;
      }
    }
  }

  /** מסיר שחקן לצמיתות (יציאה יזומה או הרחקה על ידי המנהל). */
  removePlayer(playerId: string): PlayerRecord | null {
    const player = this.players.get(playerId);
    if (!player) return null;

    this.players.delete(playerId);
    this.guesses.delete(playerId);
    this.touch();
    this.emitState();
    this.closeRoundIfEveryoneAnswered();
    return player;
  }

  // ────────────────────────────────────────────────────────────
  //  פקודות המנהל
  // ────────────────────────────────────────────────────────────

  /** מעדכן הגדרות. מותר בלובי בלבד. */
  updateSettings(partial: Partial<GameSettings>): void {
    if (this.phase !== 'lobby') throw new GameError('GAME_ALREADY_STARTED');
    this.settings = normalizeSettings({ ...this.settings, ...partial });
    this.touch();
    this.emitState();
  }

  /** מתחיל את המשחק: בוחר שאלות, מאפס ניקוד ומפעיל ספירה לאחור. */
  start(): void {
    if (this.phase !== 'lobby') throw new GameError('GAME_ALREADY_STARTED');
    if (this.players.size === 0) throw new GameError('NOT_ENOUGH_PLAYERS');

    const pool = selectPlacePool(this.places.all(), this.settings.category, this.settings.difficulty);
    if (pool.length === 0) throw new GameError('NO_PLACES');
    this.questions = shuffle(pool).slice(0, this.settings.roundCount);
    if (this.questions.length < this.settings.roundCount) {
      this.listeners.onNotice?.(
        this,
        `במאגר יש רק ${this.questions.length} מקומות לשילוב שנבחר — המשחק יכלול ${this.questions.length} סיבובים`,
      );
    }
    this.completedRounds = [];
    this.results = null;
    this.currentRoundIndex = -1;
    this.guesses.clear();
    for (const player of this.players.values()) player.score = 0;

    this.touch();

    if (this.settings.countdownMs > 0) {
      this.phase = 'countdown';
      this.phaseEndsAt = this.scheduler.now() + this.settings.countdownMs;
      this.emitState();
      this.scheduleIn(this.settings.countdownMs, () => this.beginRound(0));
    } else {
      this.beginRound(0);
    }
  }

  /** מקפיא את המשחק ושומר את יתרת הזמן במדויק. */
  pause(): void {
    if (this.phase !== 'question' && this.phase !== 'reveal' && this.phase !== 'countdown') {
      throw new GameError('NOT_AUTHORIZED');
    }

    this.clearTimer();
    const target = this.phase === 'question' ? this.roundEndsAt : (this.phaseEndsAt ?? 0);
    this.pausedRemainingMs = Math.max(0, target - this.scheduler.now());
    this.phaseBeforePause = this.phase;
    this.phase = 'paused';
    this.phaseEndsAt = null;
    this.touch();
    this.emitState();
  }

  /** מחדש משחק שהוקפא מאותה נקודה בדיוק. */
  resume(): void {
    if (this.phase !== 'paused' || this.phaseBeforePause === null) {
      throw new GameError('NOT_AUTHORIZED');
    }

    const remaining = this.pausedRemainingMs ?? 0;
    const previousPhase = this.phaseBeforePause;
    this.phase = previousPhase;
    this.pausedRemainingMs = null;
    this.phaseBeforePause = null;
    this.touch();

    if (previousPhase === 'question') {
      // שומרים על משך הסיבוב שנותר, ומזיזים גם את נקודת ההתחלה
      // כדי שחישוב זמני התגובה יישאר עקבי.
      const now = this.scheduler.now();
      const elapsed = this.roundEndsAt - this.roundStartsAt - remaining;
      this.roundStartsAt = now - elapsed;
      this.roundEndsAt = now + remaining;
      this.emitState();
      this.scheduleIn(remaining, () => this.closeRound(true));
    } else if (previousPhase === 'countdown') {
      this.phaseEndsAt = this.scheduler.now() + remaining;
      this.emitState();
      this.scheduleIn(remaining, () => this.beginRound(0));
    } else {
      this.phaseEndsAt = this.scheduler.now() + remaining;
      this.emitState();
      this.scheduleIn(remaining, () => this.advanceFromReveal());
    }
  }

  /** מדלג לסיבוב הבא מיד, בלי להמתין לטיימר. */
  skip(): void {
    if (this.phase === 'question') {
      this.clearTimer();
      this.closeRound(true);
      return;
    }
    if (this.phase === 'countdown') {
      this.clearTimer();
      this.beginRound(0);
      return;
    }
    if (this.phase === 'reveal') {
      this.clearTimer();
      this.advanceFromReveal();
      return;
    }
    throw new GameError('NOT_AUTHORIZED');
  }

  /** עוצר את המשחק ועובר מיד לתוצאות. */
  stop(): void {
    if (this.phase === 'lobby' || this.phase === 'finished') {
      throw new GameError('NOT_AUTHORIZED');
    }

    this.clearTimer();
    if (this.phase === 'question' || (this.phase === 'paused' && this.phaseBeforePause === 'question')) {
      // הסיבוב הפעיל עדיין נספר — התשובות שכבר נקלטו לא הולכות לאיבוד.
      this.closeRound(false);
    }
    this.finish(true);
  }

  /** מאפס את החדר למשחק חדש עם אותם שחקנים. */
  restart(): void {
    this.clearTimer();
    this.phase = 'lobby';
    this.phaseEndsAt = null;
    this.pausedRemainingMs = null;
    this.phaseBeforePause = null;
    this.currentRoundIndex = -1;
    this.questions = [];
    this.completedRounds = [];
    this.results = null;
    this.guesses.clear();
    for (const player of this.players.values()) player.score = 0;

    this.touch();
    this.emitState();
    for (const id of this.players.keys()) this.listeners.onPlayerStateChanged(this, id);
  }

  // ────────────────────────────────────────────────────────────
  //  פעולות שחקן
  // ────────────────────────────────────────────────────────────

  /**
   * קולט סימון של שחקן. ניתן לעדכן את הסימון כל עוד הסיבוב פתוח;
   * לאחר תום הזמן הסימון נדחה.
   *
   * @throws {GameError} כשהסיבוב סגור או הקלט אינו תקין.
   */
  submitGuess(playerId: string, roundIndex: number, point: unknown): void {
    if (this.phase !== 'question') throw new GameError('ROUND_CLOSED');
    if (roundIndex !== this.currentRoundIndex) throw new GameError('ROUND_CLOSED');
    if (!this.players.has(playerId)) throw new GameError('NOT_AUTHORIZED');
    if (!isValidLatLng(point)) throw new GameError('INVALID_INPUT');
    if (this.guesses.has(playerId)) throw new GameError('ALREADY_ANSWERED');

    const now = this.scheduler.now();
    if (now > this.roundEndsAt + NETWORK_GRACE_MS) throw new GameError('ROUND_CLOSED');

    this.guesses.set(playerId, {
      point: roundLatLng(point),
      elapsedMs: Math.max(0, Math.min(now - this.roundStartsAt, this.settings.roundDurationMs)),
    });

    this.touch();
    this.emitState();
    this.listeners.onPlayerStateChanged(this, playerId);

    this.closeRoundIfEveryoneAnswered();
  }

  /** כל השחקנים המחוברים אישרו — אין טעם לחכות לטיימר. */
  private closeRoundIfEveryoneAnswered(): void {
    if (this.phase !== 'question' || !this.allConnectedAnswered()) return;
    this.clearTimer();
    this.closeRound(true);
  }

  private allConnectedAnswered(): boolean {
    let connected = 0;
    for (const player of this.players.values()) {
      if (!player.connected) continue;
      connected += 1;
      if (!this.guesses.has(player.id)) return false;
    }
    return connected > 0;
  }

  // ────────────────────────────────────────────────────────────
  //  מכונת המצבים הפנימית
  // ────────────────────────────────────────────────────────────

  /** פותח סיבוב חדש, או מסיים את המשחק אם נגמרו השאלות. */
  private beginRound(index: number): void {
    if (index >= this.questions.length) {
      this.finish(false);
      return;
    }

    this.currentRoundIndex = index;
    this.guesses.clear();
    this.phase = 'question';
    this.roundStartsAt = this.scheduler.now();
    this.roundEndsAt = this.roundStartsAt + this.settings.roundDurationMs;
    this.phaseEndsAt = this.roundEndsAt;

    this.emitState();
    for (const id of this.players.keys()) this.listeners.onPlayerStateChanged(this, id);

    this.scheduleIn(this.settings.roundDurationMs, () => this.closeRound(true));
  }

  /**
   * סוגר את הסיבוב הפעיל: מחשב ניקוד, מעדכן צבירה ומקדם את המשחק.
   * @param advance האם להמשיך אוטומטית לסיבוב הבא.
   */
  private closeRound(advance: boolean): void {
    const place = this.questions[this.currentRoundIndex];
    if (!place) return;

    const scoring = this.scoringConfig();
    const target = placePosition(place);
    const guesses = [...this.players.values()].map((player) => {
      const guess = this.guesses.get(player.id);
      if (!guess) {
        return { playerId: player.id, guess: null, distanceKm: null, points: NO_ANSWER_SCORE.points, elapsedMs: null };
      }

      const score = scoreGuess(guess.point, target, { config: scoring });
      player.score += score.points;
      return {
        playerId: player.id,
        guess: guess.point,
        distanceKm: Math.round(score.distanceKm * 100) / 100,
        points: score.points,
        elapsedMs: guess.elapsedMs,
      };
    });

    this.completedRounds.push({ index: this.currentRoundIndex, place, image: placeImage(place), guesses });
    this.guesses.clear();

    if (!advance) return;

    this.phase = 'reveal';
    this.phaseEndsAt = this.scheduler.now() + this.settings.revealMs;
    this.emitState();
    for (const id of this.players.keys()) this.listeners.onPlayerStateChanged(this, id);

    this.scheduleIn(this.settings.revealMs, () => this.advanceFromReveal());
  }

  /** מעבר ממסך החשיפה לסיבוב הבא, או לסיום אם זה היה האחרון. */
  private advanceFromReveal(): void {
    if (this.currentRoundIndex + 1 >= this.questions.length) {
      this.finish(false);
      return;
    }
    this.beginRound(this.currentRoundIndex + 1);
  }

  /** מסיים את המשחק ובונה את התוצאות. */
  private finish(endedEarly: boolean): void {
    this.clearTimer();
    this.phase = 'finished';
    this.phaseEndsAt = null;
    this.pausedRemainingMs = null;
    this.phaseBeforePause = null;

    const players = this.listPlayers();
    this.results = {
      code: this.code,
      finishedAt: this.scheduler.now(),
      settings: this.settings,
      rounds: this.completedRounds,
      leaderboard: buildLeaderboard(players, this.completedRounds, this.scoringConfig().perfectRadiusKm),
      endedEarly,
    };

    this.touch();
    this.emitState();
    this.listeners.onResults(this, this.results);
  }

  // ────────────────────────────────────────────────────────────
  //  עזר
  // ────────────────────────────────────────────────────────────

  private currentPrompt(): PublicGameState['round'] {
    const place = this.questions[this.currentRoundIndex];
    if (!place) return null;

    return {
      index: this.currentRoundIndex,
      total: this.questions.length,
      image: placeImage(place),
      startsAt: this.roundStartsAt,
      endsAt: this.roundEndsAt,
    };
  }

  private listPlayers(): PlayerPublic[] {
    return [...this.players.values()]
      .map(({ id, name, avatar, connected, score, joinedAt }) => ({
        id,
        name,
        avatar,
        connected,
        score,
        joinedAt,
      }))
      .sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt);
  }

  /** דירוג נוכחי של שחקן (1 = ראשון), עם דירוג זהה לניקוד זהה. */
  private rankOf(playerId: string): number | null {
    const player = this.players.get(playerId);
    if (!player) return null;

    let higher = 0;
    for (const other of this.players.values()) {
      if (other.score > player.score) higher += 1;
    }
    return higher + 1;
  }

  private scoringConfig(): ScoringConfig {
    return scoringForCategory(this.settings.category);
  }

  private scheduleIn(ms: number, handler: () => void): void {
    this.clearTimer();
    this.timerHandle = this.scheduler.setTimeout(() => {
      this.timerHandle = null;
      handler();
    }, Math.max(0, ms));
  }

  private clearTimer(): void {
    if (this.timerHandle !== null) {
      this.scheduler.clearTimeout(this.timerHandle);
      this.timerHandle = null;
    }
  }

  private emitState(): void {
    this.listeners.onStateChanged(this);
  }

  private touch(): void {
    this.lastActivityAt = this.scheduler.now();
  }

  /** משחרר משאבים בעת סגירת החדר. */
  dispose(): void {
    this.clearTimer();
    this.players.clear();
    this.guesses.clear();
  }
}

/** מגביל ערך לטווח מותר. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * מנרמל הגדרות שהגיעו מהלקוח: משלים ערכי ברירת מחדל ומגביל לטווחים
 * המותרים. שכבת ההגנה הזו הכרחית — הלקוח אינו מהימן.
 */
export function normalizeSettings(partial: Partial<GameSettings>): GameSettings {
  const category = isValidCategory(partial.category) ? partial.category : DEFAULT_SETTINGS.category;
  const difficulty = isValidDifficulty(partial.difficulty) ? partial.difficulty : DEFAULT_SETTINGS.difficulty;

  const numberOr = (value: unknown, fallback: number) => {
    const parsed = Math.round(Number(value ?? fallback));
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  return {
    category,
    difficulty,
    roundCount: clamp(
      numberOr(partial.roundCount, DEFAULT_SETTINGS.roundCount),
      SETTINGS_LIMITS.roundCount.min,
      SETTINGS_LIMITS.roundCount.max,
    ),
    roundDurationMs: clamp(
      numberOr(partial.roundDurationMs, DEFAULT_SETTINGS.roundDurationMs),
      SETTINGS_LIMITS.roundDurationMs.min,
      SETTINGS_LIMITS.roundDurationMs.max,
    ),
    revealMs: clamp(
      numberOr(partial.revealMs, DEFAULT_SETTINGS.revealMs),
      SETTINGS_LIMITS.revealMs.min,
      SETTINGS_LIMITS.revealMs.max,
    ),
    countdownMs: clamp(
      numberOr(partial.countdownMs, DEFAULT_SETTINGS.countdownMs),
      SETTINGS_LIMITS.countdownMs.min,
      SETTINGS_LIMITS.countdownMs.max,
    ),
    showLiveRank: typeof partial.showLiveRank === 'boolean' ? partial.showLiveRank : DEFAULT_SETTINGS.showLiveRank,
  };
}

function isValidCategory(value: unknown): value is ContentCategory {
  return typeof value === 'string' && (CONTENT_CATEGORIES as readonly string[]).includes(value);
}

function isValidDifficulty(value: unknown): value is Difficulty {
  return typeof value === 'string' && (DIFFICULTIES as readonly string[]).includes(value);
}

/** ערבוב Fisher–Yates — ללא חזרות, כל מקום מופיע לכל היותר פעם אחת. */
export function shuffle<T>(items: readonly T[]): T[] {
  const all = [...items];
  for (let i = all.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = all[i]!;
    all[i] = all[j]!;
    all[j] = a;
  }
  return all;
}

/**
 * השוואת מחרוזות בזמן קבוע — מונעת דליפת מידע דרך מדידת זמן
 * בעת אימות אסימונים.
 */
function timingSafeEquals(a: string, b: string): boolean {
  if (typeof a !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
