import { Rng } from '../core/random';
import { dowOf, hm, MINUTE } from '../core/time';
import type { ActName, Genre, Step, StepParams } from './ctx';

// 箱庭の1日の予定を決める。日番号から決定的に作るので、誰が見ても同じ。
// 各予定は次の予定の開始まで続く。場所が変わるときは、予定の頭で歩く。

const PC_GENRES: Genre[] = ['fps', 'mmo', 'rpg', 'puzzle', 'retro', 'horror'];
const TV_GENRES: Genre[] = ['rpg', 'fighting', 'racing', 'sports', 'retro', 'horror'];

type NightMode = { act: 'gamePC' | 'gameTV'; genre: Genre };

/** その日の0時をまたぐ夜のゲーム */
export function midnightMode(day: number): NightMode {
  const r = Rng.of('midnight', day);
  return r.chance(0.55) ? { act: 'gamePC', genre: r.pick(PC_GENRES) } : { act: 'gameTV', genre: r.pick(TV_GENRES) };
}

class Builder {
  steps: Step[] = [];
  constructor(readonly rng: Rng) {}
  add(minute: number, act: ActName, p: StepParams = {}): this {
    const start = Math.round(minute) * MINUTE;
    // 時刻が重なったら後ろへずらす
    const last = this.steps[this.steps.length - 1];
    const s = last && start <= last.start ? last.start + 2 * MINUTE : start;
    this.steps.push({ act, start: s, p: { seed: Math.floor(this.rng.next() * 1e9), ...p } });
    return this;
  }
  get lastMin(): number {
    const l = this.steps[this.steps.length - 1];
    return l ? l.start / MINUTE : 0;
  }
  game(minute: number, dark = false): this {
    const r = this.rng;
    if (r.chance(0.5)) return this.add(minute, 'gamePC', { genre: r.pick(PC_GENRES), dark });
    return this.add(minute, 'gameTV', { genre: r.pick(TV_GENRES), dark });
  }
  /** 部屋の外へ行って戻ってくる */
  out(minute: number, why: NonNullable<StepParams['why']>, awayMin: number, carry?: StepParams['carry']): this {
    this.add(minute, 'leave', { why, carry });
    this.add(minute + 4, 'away', { why });
    this.add(minute + 4 + awayMin, 'back', { why });
    return this;
  }
}

const M = (h: number, m = 0) => h * 60 + m;

export function planDay(day: number): Step[] {
  const r = Rng.of('plan', day);
  const b = new Builder(r);
  const dow = dowOf(day);
  const weekend = dow === 0 || dow === 6;
  const today = midnightMode(day);
  const tomorrow = midnightMode(day + 1);

  // 0時：前日からの続き
  b.add(0, today.act, { genre: today.genre, cont: true });

  // 深夜：風呂 → 冷蔵庫 → 鏡（育毛剤）
  const bath = M(1, r.int(0, 80));
  b.out(bath, 'bath', r.int(22, 32));
  b.add(b.lastMin + 4, 'fridge');
  b.add(b.lastMin + 4, 'mirror', { tonic: true });
  const dark = r.chance(0.5);
  b.game(b.lastMin + 6, dark);
  // トイレ
  b.out(b.lastMin + r.int(40, 70), 'toilet', r.int(3, 5));
  b.game(b.lastMin + 3, dark);
  if (r.chance(0.35)) b.add(b.lastMin + r.int(30, 60), 'fridge');
  if (b.steps[b.steps.length - 1].act === 'fridge') b.game(b.lastMin + 4, dark);
  if (r.chance(0.4)) {
    b.add(b.lastMin + r.int(20, 50), 'phoneBed');
    b.game(b.lastMin + r.int(25, 40));
  }

  if (!weekend) {
    const wake = M(8, 50);
    const sleepAt = wake - 60;
    // 夜明け：窓の外が白んで罪悪感
    if (r.chance(0.6) && b.lastMin < M(5, 0)) {
      b.add(Math.max(b.lastMin + 10, M(5, r.int(10, 50))), 'window');
      b.game(b.lastMin + 3);
    }
    // ゴミの日（火・金）は寝る前に出す
    if (dow === 2 || dow === 5) {
      b.add(sleepAt - 20, 'trash');
      b.out(sleepAt - 18, 'trash', 3, 'trashBag');
    }
    b.add(sleepAt - 4, 'fridge');
    b.add(sleepAt, 'sleep');
    b.add(wake, 'wake');
    b.add(wake + 4, 'dress', { on: true });
    b.add(M(8, 57), 'meeting');
    b.add(M(9, r.int(18, 28)), 'work', { on: true });
    // 午前のトイレ・飲み物
    b.out(M(10, r.int(15, 50)), 'toilet', r.int(3, 6));
    b.add(b.lastMin + 3, 'work', { on: true });
    if (r.chance(0.5)) {
      b.add(M(11, r.int(0, 30)), 'fridge');
      b.add(b.lastMin + 3, 'work', { on: true });
    }
    // 昼
    const lunch = r.weighted<'noodle' | 'delivery' | 'konbini'>([['noodle', 5], ['delivery', 2], ['konbini', 3]]);
    if (lunch === 'noodle') {
      b.add(M(12, r.int(0, 4)), 'noodle');
      b.add(b.lastMin + 4, 'deskEat', { food: 'noodle', carry: 'noodle', on: true });
    } else if (lunch === 'delivery') {
      b.add(M(12, r.int(5, 20)), 'delivery');
      b.add(b.lastMin + 3, 'tableEat', { food: 'delivery', carry: 'deliveryBag' });
    } else {
      b.out(M(12, r.int(0, 5)), 'konbini', r.int(12, 20));
      b.add(b.lastMin + 3, 'deskEat', { food: 'konbini', carry: 'konbiniBag', on: true });
    }
    b.add(M(12, 55), 'work', { on: true });
    // 午後の会議（たまに）
    if (r.chance(0.45)) {
      const mt = M(r.pick([14, 15, 16]), 0);
      b.add(mt - 3, 'meeting');
      b.add(mt + r.int(25, 45), 'work', { on: true });
    }
    b.out(M(15, r.int(10, 40)), 'toilet', r.int(3, 6));
    b.add(b.lastMin + 3, 'work', { on: true });
    // 終業
    b.add(M(18, r.int(0, 6)), 'dress', { on: false });
    b.game(b.lastMin + 3);
    // 夕飯
    const dinner = r.weighted<'delivery' | 'noodle' | 'konbini'>([['delivery', 4], ['noodle', 3], ['konbini', 3]]);
    const dt = M(19, r.int(10, 50));
    if (dinner === 'delivery') {
      b.add(dt, 'delivery');
      b.add(dt + 4, 'tableEat', { food: r.chance(0.3) ? 'pizza' : 'delivery', carry: 'deliveryBag' });
    } else if (dinner === 'noodle') {
      b.add(dt, 'noodle');
      b.add(dt + 4, 'tableEat', { food: 'noodle', carry: 'noodle' });
    } else {
      b.out(dt, 'konbini', r.int(12, 20));
      b.add(b.lastMin + 3, 'tableEat', { food: 'konbini', carry: 'konbiniBag' });
    }
    b.game(dt + r.int(35, 50));
    if (r.chance(0.45)) {
      b.add(M(21, r.int(10, 50)), 'weigh');
      if (r.chance(0.3)) {
        b.add(b.lastMin + 3, 'exercise');
        b.add(b.lastMin + 2, 'mirror', { tonic: false });
      } else b.add(b.lastMin + 3, 'mirror', { tonic: false });
      b.game(b.lastMin + 3);
    }
    if (r.chance(0.6)) b.out(M(22, r.int(10, 40)), 'toilet', r.int(3, 5));
    else b.add(M(22, r.int(10, 40)), 'fridge');
    b.game(b.lastMin + 4);
    if (r.chance(0.3)) {
      b.add(M(23, r.int(0, 20)), 'video');
    }
  } else {
    // 休日：寝る時間がバラバラ
    const sleepAt = M(r.int(7, 10), r.int(0, 50));
    if (r.chance(0.5)) {
      b.add(Math.max(b.lastMin + 10, sleepAt - r.int(40, 80)), 'video');
    }
    b.add(sleepAt - 4, 'fridge');
    b.add(sleepAt, 'sleep');
    const wake = sleepAt + 60;
    b.add(wake, 'wake');
    b.add(wake + 6, 'phoneBed');
    // ブランチはコンビニ
    b.out(wake + r.int(25, 40), 'konbini', r.int(15, 25));
    b.add(b.lastMin + 3, 'tableEat', { food: 'konbini', carry: 'konbiniBag' });
    // 洗濯（干す）
    b.add(b.lastMin + r.int(35, 50), 'laundry', { mode: 'hang' });
    b.game(b.lastMin + 12);
    b.out(b.lastMin + r.int(60, 100), 'toilet', r.int(3, 6));
    b.game(b.lastMin + 3);
    if (r.chance(0.5)) {
      b.add(b.lastMin + r.int(50, 90), 'phoneFloor');
      b.game(b.lastMin + r.int(30, 50));
    }
    if (r.chance(0.5)) {
      b.add(b.lastMin + r.int(40, 70), 'noodle');
      b.add(b.lastMin + 4, 'deskEat', { food: 'noodle', carry: 'noodle' });
      b.game(b.lastMin + 25);
    }
    // 夕方：洗濯物を取り込む
    b.add(Math.max(b.lastMin + 20, M(18, r.int(0, 30))), 'laundry', { mode: 'take' });
    b.game(b.lastMin + 8);
    // 夕飯は出前（ピザ多め）
    const dt = Math.max(b.lastMin + 30, M(19, r.int(10, 50)));
    b.add(dt, 'delivery');
    b.add(dt + 4, 'tableEat', { food: r.chance(0.6) ? 'pizza' : 'delivery', carry: 'deliveryBag' });
    b.game(dt + 45);
    if (r.chance(0.5)) {
      b.add(M(21, r.int(30, 59)), 'weigh');
      b.add(b.lastMin + 3, 'mirror', { tonic: false });
      b.game(b.lastMin + 3);
    }
    if (r.chance(0.5)) {
      b.out(M(22, r.int(30, 59)), 'toilet', r.int(3, 5));
      b.game(b.lastMin + 3);
    }
  }

  // 最後は翌日の0時へ続くゲーム
  const lastStart = Math.min(Math.max(b.lastMin + 10, M(23, 30)), M(23, 45));
  b.add(lastStart, tomorrow.act, { genre: tomorrow.genre, contEnd: true });

  // 並び順の保証と、詰まりすぎの解消
  let steps = b.steps.sort((a, c) => a.start - c.start);
  steps = insertBreaks(steps, r);
  for (let i = 1; i < steps.length; i++) {
    if (steps[i].start <= steps[i - 1].start) steps[i].start = steps[i - 1].start + MINUTE;
  }
  return steps.filter((s) => s.start < hm(24));
}

/** 長すぎるゲームの途中に、冷蔵庫やトイレの休憩をはさむ */
function insertBreaks(steps: Step[], r: Rng): Step[] {
  const out: Step[] = [];
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const end = i + 1 < steps.length ? steps[i + 1].start : hm(24);
    const len = (end - s.start) / MINUTE;
    out.push(s);
    if ((s.act !== 'gamePC' && s.act !== 'gameTV') || len < 150 || s.p.contEnd) continue;
    const mid = s.start / MINUTE + len * r.range(0.4, 0.6);
    const seed = () => Math.floor(r.next() * 1e9);
    if (r.chance(0.5)) {
      out.push({ act: 'fridge', start: Math.round(mid) * MINUTE, p: { seed: seed() } });
      out.push({ ...s, start: Math.round(mid + 4) * MINUTE, p: { ...s.p, cont: false, seed: seed() } });
    } else {
      out.push({ act: 'leave', start: Math.round(mid) * MINUTE, p: { why: 'toilet', seed: seed() } });
      out.push({ act: 'away', start: Math.round(mid + 4) * MINUTE, p: { why: 'toilet', seed: seed() } });
      out.push({ act: 'back', start: Math.round(mid + 8) * MINUTE, p: { why: 'toilet', seed: seed() } });
      out.push({ ...s, start: Math.round(mid + 11) * MINUTE, p: { ...s.p, cont: false, seed: seed() } });
    }
  }
  return out;
}

const cache = new Map<number, Step[]>();
export function getPlan(day: number): Step[] {
  let p = cache.get(day);
  if (!p) {
    p = planDay(day);
    if (cache.size > 6) cache.clear();
    cache.set(day, p);
  }
  return p;
}
