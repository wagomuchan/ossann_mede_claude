export const clamp = (v: number, a = 0, b = 1): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number): number => clamp((v - a) / (b - a));
export const smooth = (t: number): number => {
  t = clamp(t);
  return t * t * (3 - 2 * t);
};
export const smoother = (t: number): number => {
  t = clamp(t);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
/** a..b の区間で 0→1、c..d の区間で 1→0 になる台形 */
export const window4 = (v: number, a: number, b: number, c: number, d: number): number =>
  smooth(invLerp(a, b, v)) * (1 - smooth(invLerp(c, d, v)));
/** 指数減衰で目標に近づける（フレームレート非依存） */
export const damp = (cur: number, target: number, lambda: number, dt: number): number =>
  lerp(cur, target, 1 - Math.exp(-lambda * dt));
export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

/** 角度の差を -PI..PI に */
export const angleDiff = (a: number, b: number): number => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};
export const dampAngle = (cur: number, target: number, lambda: number, dt: number): number =>
  cur + angleDiff(cur, target) * (1 - Math.exp(-lambda * dt));

/** 0..1 を往復するパルス（周期 period 秒） */
export const pingpong = (t: number, period: number): number => {
  const x = (t / period) % 1;
  return x < 0.5 ? x * 2 : 2 - x * 2;
};
