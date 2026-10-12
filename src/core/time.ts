// 箱庭時間。現実時間 × SPEED で進む。現実の時刻から純粋に計算するので、
// いつ誰が開いても同じ瞬間が見える（開発用パラメータで上書き可能）。

export const DEFAULT_SPEED = 30;
export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
const JST_OFFSET = 9 * HOUR;

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export interface BoxTime {
  /** 箱庭の絶対時刻（ms, JST基準） */
  ms: number;
  /** 箱庭の日番号 */
  day: number;
  /** その日の0時からの経過ms */
  dayMs: number;
  /** 0〜24の小数時間 */
  hour: number;
  /** 曜日 0=日曜 */
  dow: number;
  /** 現実の時刻 (ms) */
  realMs: number;
}

export interface DebugParams {
  at?: number; // dayMs
  dow?: number;
  season?: Season;
  speed?: number;
  hair?: number;
  weight?: number;
  weather?: string;
  quality?: string;
  cam?: number[];
}

export function readDebugParams(): DebugParams {
  const p = new URLSearchParams(location.search);
  const out: DebugParams = {};
  const at = p.get('at');
  if (at) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(at);
    if (m) out.at = (+m[1] * 60 + +m[2]) * MINUTE;
  }
  const dow = p.get('dow');
  if (dow !== null && /^[0-6]$/.test(dow)) out.dow = +dow;
  const season = p.get('season');
  if (season === 'spring' || season === 'summer' || season === 'autumn' || season === 'winter') out.season = season;
  const speed = p.get('speed');
  if (speed && !isNaN(+speed)) out.speed = +speed;
  const hair = p.get('hair');
  if (hair && !isNaN(+hair)) out.hair = +hair;
  const weight = p.get('weight');
  if (weight && !isNaN(+weight)) out.weight = +weight;
  const weather = p.get('weather');
  if (weather) out.weather = weather;
  const quality = p.get('quality');
  if (quality) out.quality = quality;
  const cam = p.get('cam');
  if (cam) out.cam = cam.split(',').map(Number);
  return out;
}

export class Clock {
  private readonly speed: number;
  private readonly baseBox: number;
  private readonly baseReal: number;

  constructor(debug: DebugParams) {
    this.speed = debug.speed ?? DEFAULT_SPEED;
    const realNow = Date.now();
    let box = realNow * DEFAULT_SPEED + JST_OFFSET;
    if (debug.at !== undefined || debug.dow !== undefined) {
      let day = Math.floor(box / DAY);
      if (debug.dow !== undefined) {
        const cur = dowOf(day);
        day += (debug.dow - cur + 7) % 7;
      }
      const dayMs = debug.at ?? box - Math.floor(box / DAY) * DAY;
      box = day * DAY + dayMs;
    }
    this.baseBox = box;
    this.baseReal = realNow;
  }

  now(realMs = Date.now()): BoxTime {
    const ms = this.baseBox + (realMs - this.baseReal) * this.speed;
    return boxTimeOf(ms, realMs);
  }

  /** 現実1秒あたりの箱庭ms */
  get boxPerReal(): number {
    return this.speed;
  }
}

export function boxTimeOf(ms: number, realMs = 0): BoxTime {
  const day = Math.floor(ms / DAY);
  const dayMs = ms - day * DAY;
  return { ms, day, dayMs, hour: dayMs / HOUR, dow: dowOf(day), realMs };
}

/** 1970-01-01 は木曜 */
export function dowOf(day: number): number {
  return (((day + 4) % 7) + 7) % 7;
}

export function isWeekend(day: number): boolean {
  const d = dowOf(day);
  return d === 0 || d === 6;
}

/** 現実の日付から季節を決める */
export function seasonOf(realMs: number, debug?: DebugParams): Season {
  if (debug?.season) return debug.season;
  const m = new Date(realMs + JST_OFFSET).getUTCMonth() + 1;
  if (m >= 3 && m <= 5) return 'spring';
  if (m >= 6 && m <= 9) return 'summer';
  if (m >= 10 && m <= 11) return 'autumn';
  return 'winter';
}

/** 現実の年内日数 0..365 */
export function dayOfYear(realMs: number, debug?: DebugParams): number {
  if (debug?.season) {
    return { spring: 105, summer: 200, autumn: 300, winter: 20 }[debug.season];
  }
  const d = new Date(realMs + JST_OFFSET);
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  return (d.getTime() - start) / DAY;
}

/** 東京あたりの日の出・日の入り（時） */
export function sunTimes(doy: number): { rise: number; set: number } {
  // 夏至(172日目)で最も長い
  const c = Math.cos(((doy - 172) / 365) * Math.PI * 2);
  return { rise: 5.6 - 1.2 * c, set: 17.6 + 1.4 * c };
}

export function fmtHM(dayMs: number): string {
  const m = Math.floor(dayMs / MINUTE);
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export const hm = (h: number, m = 0): number => (h * 60 + m) * MINUTE;
