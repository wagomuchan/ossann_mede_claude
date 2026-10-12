import { Rng } from '../core/random';
import { BoxTime, DebugParams, Season, dayOfYear, seasonOf, sunTimes } from '../core/time';
import { clamp, smooth, invLerp } from '../core/math';

export type Weather = 'clear' | 'cloudy' | 'rain' | 'snow';

export interface Env {
  season: Season;
  weather: Weather;
  /** 0..1 屋外の明るさ */
  dayLight: number;
  /** 朝焼け・夕焼け 0..1 */
  twilight: number;
  night: number;
  sunRise: number;
  sunSet: number;
  /** 太陽の方位（-1=朝/左, 1=夕/右）と高度 0..1 */
  sunAz: number;
  sunEl: number;
  /** 向かいの窓の点灯率 */
  windowLights: number;
}

const WEATHER_WEIGHTS: Record<Season, [Weather, number][]> = {
  spring: [['clear', 5], ['cloudy', 3], ['rain', 2]],
  summer: [['clear', 6], ['cloudy', 2], ['rain', 2]],
  autumn: [['clear', 5], ['cloudy', 3], ['rain', 2]],
  winter: [['clear', 5], ['cloudy', 3], ['rain', 1], ['snow', 1.2]],
};

/** 箱庭の日を8時間ずつに分けて天気を決める（前の区画を引き継ぎやすい） */
export function weatherAt(t: BoxTime, season: Season, debug?: DebugParams): Weather {
  if (debug?.weather === 'clear' || debug?.weather === 'cloudy' || debug?.weather === 'rain' || debug?.weather === 'snow') {
    return debug.weather;
  }
  const block = t.day * 3 + Math.floor(t.hour / 8);
  const base = Rng.of('weather-day', t.day).weighted(WEATHER_WEIGHTS[season]);
  const r = Rng.of('weather-block', block);
  if (r.chance(0.7)) return base;
  return r.weighted(WEATHER_WEIGHTS[season]);
}

export function computeEnv(t: BoxTime, debug?: DebugParams): Env {
  const season = seasonOf(t.realMs, debug);
  const doy = dayOfYear(t.realMs, debug);
  const { rise, set } = sunTimes(doy);
  const h = t.hour;
  const dayLight = smooth(invLerp(rise - 0.5, rise + 0.7, h)) * (1 - smooth(invLerp(set - 0.7, set + 0.5, h)));
  const twilight = Math.max(
    Math.exp(-Math.pow((h - rise - 0.2) / 0.55, 2)),
    Math.exp(-Math.pow((h - set + 0.1) / 0.6, 2)),
  );
  const night = 1 - smooth(invLerp(rise - 1.2, rise, h)) * (1 - smooth(invLerp(set, set + 1.2, h)));
  const p = clamp((h - rise) / (set - rise), -0.2, 1.2);
  const sunAz = p * 2 - 1;
  const sunEl = Math.max(0, Math.sin(clamp(p) * Math.PI)) * (season === 'summer' ? 1 : season === 'winter' ? 0.6 : 0.8);
  // 窓の明かり：夕方から増えて深夜に減る
  let windowLights: number;
  if (h >= 17 && h < 24) windowLights = 0.25 + 0.6 * smooth(invLerp(17, 21, h)) - 0.3 * smooth(invLerp(22, 24, h));
  else if (h < 6) windowLights = 0.55 * (1 - smooth(invLerp(0, 3, h))) + 0.05;
  else windowLights = 0.1;
  return {
    season,
    weather: weatherAt(t, season, debug),
    dayLight,
    twilight: twilight * (1 - night * 0.5),
    night,
    sunRise: rise,
    sunSet: set,
    sunAz,
    sunEl,
    windowLights: clamp(windowLights),
  };
}
