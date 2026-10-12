import { A, PLACES } from './anchors';
import { ActName, Ctx, Place, activeEvent, bump, enterK, eventTrack, exitK, seatedK, V } from './ctx';
import * as P from '../ossan/poses';
import { clamp, smooth } from '../core/math';
import { noise1 } from '../core/random';
import { SPOT } from '../world/layout';

// それぞれの行動。ctx に姿勢・小道具・画面・音を書き込む。

export interface ActDef {
  /** 行動を始める場所（歩いて向かう先）。null は部屋の外 */
  place(c: Pick<Ctx, 'step'>): Place | null;
  /** 終わったときに立っている場所（省略時は place と同じ） */
  exit?(c: Pick<Ctx, 'step'>): Place | null;
  sample(c: Ctx): void;
}

const PI = Math.PI;

// ================= 共通 =================

/** 机に座る。座っている度合いを返す */
function deskSit(c: Ctx, opts: { slouch?: number; recline?: number; legs?: 'normal' | 'wide' | 'crossed' | 'tuck' } = {}): number {
  const k = seatedK(c, 1.4, 1.4);
  const p = c.p;
  const seat = A.chairSeat;
  if (k < 0.45) {
    // 椅子の横に立って、座りに行く/立ち上がって離れる
    const from = PLACES.desk.pos;
    p.root.lerpVectors(from, seat.pos.clone().setY(0), k * 1.2);
    p.yaw = seat.yaw + 0.4 * (1 - k * 2);
    P.stand(p, c.realT, 1);
    if (k > 0.05) P.walk(p, c.sec * 7, 0.35);
  } else {
    P.sitChair(p, seat, c.realT, opts);
  }
  c.dyn.chairYaw = seat.yaw;
  return k;
}

/** 座椅子に座る */
function floorSit(c: Ctx, lean = 0.3): number {
  const k = seatedK(c, 1.8, 1.8);
  const p = c.p;
  const seat = A.zaisuSeat;
  const winter = c.env.season === 'winter';
  if (k < 0.45) {
    p.root.lerpVectors(PLACES.zaisu.pos, seat.pos.clone().setY(0), k * 1.5);
    p.yaw = seat.yaw;
    P.stand(p, c.realT, 2);
    P.crouch(p, k * 1.6);
  } else {
    P.sitFloor(p, seat, { lean, legs: winter ? 'out' : 'cross' });
  }
  return k;
}

function lookMonitor(c: Ctx, w = 1): void {
  c.p.lookAt(A.monitor.clone().add(V(0, noise1(c.realT * 0.4, 5) * 0.05, noise1(c.realT * 0.3, 6) * 0.12)), w);
}

function screen(c: Ctx, which: 'monitor' | 'laptop' | 'tv' | 'phone', kind: Ctx['out']['monitor']['kind'], extra: Partial<Ctx['out']['monitor']> = {}): void {
  c.out[which] = { kind, t: c.sec, seed: c.seed, ...extra };
}

/** 座ったまま起こる小さな仕草（共通） */
function deskFidget(c: Ctx, kind: string, k: number): boolean {
  const p = c.p;
  switch (kind) {
    case 'sigh':
      P.sigh(p, k);
      c.once('sigh', 0);
      return false;
    case 'stretch':
      P.stretchUp(p, bump(k, 0.3, 0.7));
      p.add('chest', -0.1 * bump(k), 0, 0);
      c.once('stretch', 0);
      return true;
    case 'scratch': {
      // 頭をかいて、手を見る（抜け毛チェック）
      const up = k < 0.6 ? bump(k / 0.6, 0.25, 0.85) : 0;
      if (k < 0.6) P.scratchHead(p, c.realT, 'R', up);
      else {
        const hand = P.headPos(p).add(P.rotY(V(-0.05, -0.15, 0.3), p.yaw));
        p.reach('R', hand, 1, V(-1, -1, -0.3));
        p.set('handR', 0.9, 0, 0.6);
        p.lookAt(hand, 1);
        p.face.brow = 'sad';
        if (k > 0.8) p.face.mouth = 'frown';
      }
      return true;
    }
    case 'belly':
      p.reach('L', P.local(p, 0.02, p.hips.y + 0.1, p.hips.z + 0.22).add(V(0, Math.sin(c.realT * 12) * 0.02, 0)), bump(k), V(1, -1, -0.5));
      return false;
    case 'yawn':
      p.face.mouth = 'yawn';
      p.face.eyes = 0.2;
      p.add('head', -0.2 * bump(k), 0, 0);
      c.once('yawn', 0);
      return false;
    case 'clock':
      p.lookAt(A.clock, bump(k, 0.2, 0.7));
      return false;
    case 'window':
      p.lookAt(A.window, bump(k, 0.2, 0.7));
      p.face.eyes = 0.8;
      return false;
    case 'lean': {
      // 頭の後ろで手を組んでのけぞる
      const b = bump(k, 0.15, 0.85);
      p.set('armL', -2.3 * b, 0, 0.9 * b + 0.12).set('armR', -2.3 * b, 0, -0.9 * b - 0.12);
      p.set('elbowL', -2.2 * b - 0.7 * (1 - b)).set('elbowR', -2.2 * b - 0.7 * (1 - b));
      p.add('spine', -0.25 * b, 0, 0);
      p.add('head', -0.2 * b, 0, 0);
      p.ik.L.w = 0;
      p.ik.R.w = 0;
      p.lookAt(V(-1.3, 2.4, -0.9), 0.6 * b);
      return true;
    }
    case 'jiggle':
      P.legJiggle(p, c.realT, 'R', 1);
      return false;
  }
  return false;
}

// ================= 寝る・起きる =================

const sleep: ActDef = {
  place: () => PLACES.bed,
  sample(c) {
    const p = c.p;
    const k = enterK(c, 3.0);
    c.out.ceiling = 'off';
    c.out.glasses = false;
    if (k < 1 && !c.step.p.cont) {
      // ベッドに腰掛けて、横になる
      if (k < 0.4) {
        P.sitChair(p, A.bedEdge, c.realT, { slouch: 0.4 });
        p.root.lerp(PLACES.bed.pos, 1 - smooth(k / 0.2));
        p.face.eyes = 0.6;
      } else {
        P.lieBed(p, A.pillow, A.bedDir, SPOT.bed.top, 'back');
        p.face.eyes = 0.3;
      }
      c.dyn.duvetCover = smooth((k - 0.5) / 0.5);
      return;
    }
    c.dyn.duvetCover = 1;
    // 20秒ごとに寝返り
    const phase = Math.floor((c.sec + c.seed % 7) / 22);
    const side = (['back', 'left', 'back', 'right'] as const)[phase % 4];
    P.lieBed(p, A.pillow, A.bedDir, SPOT.bed.top, side);
    p.face.eyes = 0;
    p.face.mouth = phase % 3 === 0 ? 'open' : 'neutral';
    p.breath = 1.8;
    c.out.asleep = true;
    c.loop('snore', 0.6 + 0.4 * Math.sin(c.sec * 0.1));
    c.props.put('phone', A.bedside, 0.3);
  },
};

const wake: ActDef = {
  place: () => PLACES.bed,
  sample(c) {
    const p = c.p;
    const s = c.sec;
    c.out.glasses = s > 9;
    c.out.ceiling = c.env.dayLight > 0.4 ? 'off' : 'on';
    if (s < 4.5) {
      // アラームが鳴る → 手探りで止める
      P.lieBed(p, A.pillow, A.bedDir, SPOT.bed.top, 'back');
      c.dyn.duvetCover = 1;
      p.face.eyes = s < 2 ? 0 : 0.25;
      if (s < 3.2) c.loop('alarm', 1);
      const reach = bump(clamp((s - 1.5) / 2.5));
      p.reach('R', A.bedside.clone().add(V(0, 0.05, 0)), reach, V(-1, 0, -1));
      c.props.put('phone', A.bedside, 0.3);
      screen(c, 'phone', 'alarm');
      p.face.brow = 'angry';
      return;
    }
    if (s < 7.5) {
      // 起き上がってベッドに腰掛ける
      const k = (s - 4.5) / 3;
      c.dyn.duvetCover = 1 - smooth(k * 2);
      P.sitChair(p, A.bedEdge, c.realT, { slouch: 0.7 });
      p.face.eyes = 0.35;
      p.face.mouth = k > 0.4 && k < 0.8 ? 'yawn' : 'neutral';
      if (k > 0.4) c.once('yawn', 4.5 + 3 * 0.4);
      P.holdPhone(p, c.realT, 'R', false, 0.28, 0.32);
      c.props.hold('phone', 'R', [0, 0, 0.02], [-1.3, 0, 0]);
      screen(c, 'phone', 'sns');
      return;
    }
    // 伸び → おなかをかく → 立ち上がる
    c.dyn.duvetCover = 0;
    const k = clamp((s - 7.5) / Math.max(1, c.durSec - 7.5 - 1.2));
    P.sitChair(p, A.bedEdge, c.realT, { slouch: 0.5 });
    if (k < 0.45) P.stretchUp(p, bump(k / 0.45, 0.3, 0.7));
    else deskFidget(c, 'belly', (k - 0.45) / 0.55);
    if (exitK(c, 1.2) > 0) {
      P.stand(p, c.realT);
      p.root.copy(PLACES.bed.pos);
      p.yaw = 0.3;
    }
    p.face.eyes = 0.6;
  },
};

const dress: ActDef = {
  place: () => PLACES.bed,
  sample(c) {
    const p = c.p;
    p.root.copy(PLACES.bed.pos);
    p.yaw = 0.4;
    P.stand(p, c.realT);
    const k = clamp(c.sec / Math.max(2, c.durSec - 1));
    const on = c.step.p.on ?? true;
    // 腕を通す動き
    const b = bump(clamp((k - 0.15) / 0.7), 0.3, 0.7);
    p.set('armL', -1.0 * b, 0, 0.6 * b + 0.12).set('armR', -1.4 * b, 0, -0.5 * b - 0.12);
    p.set('elbowL', -1.6 * b - 0.2).set('elbowR', -1.2 * b - 0.2);
    p.lookAt(P.local(p, 0, 1.0, 0.4), 0.7);
    c.out.outfit = (k > 0.5) === on ? 'shirt' : 'tshirt';
    if (on && c.t.dow === 1) c.once('shave', 0.5);
    c.once('cloth', 1);
  },
};

// ================= 机 =================

const meeting: ActDef = {
  place: () => PLACES.desk,
  sample(c) {
    const p = c.p;
    const offAt = c.durSec - 4; // 終わる直前にカメラOFF → 一瞬で猫背
    const camOn = c.sec > 1.5 && c.sec < offAt;
    const k = deskSit(c, { slouch: camOn ? -0.1 : 0.85, legs: camOn ? 'normal' : 'wide' });
    screen(c, 'monitor', 'meeting', { cam: camOn });
    screen(c, 'laptop', 'work');
    if (k < 0.5) return;
    lookMonitor(c);
    c.loop('meetingVoice', camOn ? 0.6 : 0.3);
    if (!camOn) {
      p.face.eyes = 0.6;
      p.face.mouth = c.sec > offAt + 0.5 ? 'o' : 'neutral';
      if (c.sec > offAt) c.once('sigh', offAt + 0.4);
      return;
    }
    // うなずき、ときどき話す
    const evs = eventTrack(c, [
      { kind: 'nod', w: 5, len: [1.5, 3] },
      { kind: 'talk', w: 3, len: [3, 7] },
      { kind: 'smile', w: 1, len: [1.5, 2.5] },
      { kind: 'note', w: 2, len: [2, 4] },
    ], [0.8, 3]);
    const a = activeEvent(evs, c.sec);
    p.face.brow = 'raised';
    p.face.noBlink = 0.3;
    p.reach('L', A.kbL.clone().add(V(0.05, 0, 0.05)), 0.7);
    p.reach('R', A.mouse.clone().add(V(0, 0.03, 0)), 0.8);
    if (a) {
      if (a.ev.kind === 'nod') p.add('head', Math.max(0, Math.sin(a.k * PI * 4)) * 0.18, 0, 0);
      if (a.ev.kind === 'talk') {
        p.face.mouth = Math.sin(c.realT * 11) > 0 ? 'open' : 'neutral';
        p.ik.L.w = 0;
        p.set('armL', -0.9, 0, 0.3 + Math.sin(c.realT * 2) * 0.15).set('elbowL', -1.5);
        p.set('handL', 0.2, 0, Math.sin(c.realT * 3) * 0.3);
        c.loop('mumble', 0.7);
      }
      if (a.ev.kind === 'smile') p.face.mouth = 'smile';
      if (a.ev.kind === 'note') P.typing(p, c.realT, A.kbL, A.kbR, 0.6);
    }
  },
};

const WORK_EVENTS = [
  { kind: 'type', w: 6, len: [6, 14] as [number, number] },
  { kind: 'mouse', w: 4, len: [5, 12] as [number, number] },
  { kind: 'sigh', w: 2, len: [3, 3.6] as [number, number] },
  { kind: 'stretch', w: 1.2, len: [3.5, 4.5] as [number, number] },
  { kind: 'scratch', w: 1.5, len: [3.5, 5] as [number, number] },
  { kind: 'phone', w: 2.2, len: [6, 14] as [number, number] },
  { kind: 'drink', w: 1.5, len: [3, 4] as [number, number] },
  { kind: 'lean', w: 1.2, len: [5, 9] as [number, number] },
  { kind: 'yawn', w: 1, len: [2.5, 3.2] as [number, number] },
  { kind: 'slack', w: 1.4, len: [4, 7] as [number, number] },
  { kind: 'clock', w: 1, len: [1.6, 2.4] as [number, number] },
  { kind: 'window', w: 0.8, len: [2.2, 3.5] as [number, number] },
  { kind: 'jiggle', w: 1.2, len: [6, 12] as [number, number] },
  { kind: 'belly', w: 0.7, len: [2, 3] as [number, number] },
];

const work: ActDef = {
  place: () => PLACES.desk,
  sample(c) {
    const p = c.p;
    const afternoon = c.t.hour > 13.5 && c.t.hour < 16;
    const evs = eventTrack(c, afternoon ? [...WORK_EVENTS, { kind: 'doze', w: 2.5, len: [8, 16] }] : WORK_EVENTS, [0.3, 1.5]);
    const a = activeEvent(evs, c.sec);
    const kind = a?.ev.kind ?? 'type';
    const slouch = kind === 'slack' ? 0.05 : kind === 'doze' ? 0.9 : 0.55 + noise1(c.realT * 0.05, 3) * 0.2;
    const k = deskSit(c, { slouch, legs: kind === 'jiggle' ? 'wide' : 'normal' });
    screen(c, 'monitor', 'work', { event: kind === 'slack' ? 'slack' : undefined });
    screen(c, 'laptop', 'work');
    if (k < 0.5) return;
    lookMonitor(c);
    p.face.brow = 'focus';
    const typingDefault = () => {
      P.typing(p, c.realT, A.kbL, A.kbR, 0.8 + noise1(c.realT * 0.5, 9) * 0.4);
      if (Math.sin(c.realT * 0.7) > 0.2) c.loop('typing', 0.8);
    };
    if (!a) {
      typingDefault();
      return;
    }
    const kk = a.k;
    switch (kind) {
      case 'type':
        typingDefault();
        break;
      case 'mouse':
        P.mouseHand(p, c.realT, A.mouse, 0.6);
        p.reach('L', A.deskTop.clone().add(V(0.05, 0, -0.1)), 0.5);
        if (Math.sin(c.realT * 3.1) > 0.85) c.loop('click', 0.6);
        break;
      case 'phone':
        P.holdPhone(p, c.realT, 'R', false, 0.3, 0.28);
        p.add('neck', 0.2, 0, 0);
        c.props.hold('phone', 'R', [0, 0, 0.02], [-1.25, 0, 0]);
        screen(c, 'phone', 'sns');
        p.face.brow = 'neutral';
        if (kk > 0.6 && kk < 0.75) p.face.mouth = 'smile';
        break;
      case 'drink': {
        const sip = bump(kk, 0.3, 0.7);
        P.handToMouth(p, 'R', sip, A.mug);
        c.props.hold('bottle', 'R', [0, 0.02, 0.03], [0, 0, 0]);
        if (sip > 0.9) c.once('gulp', a.ev.at + a.ev.len * 0.5);
        p.lookAt(A.monitor, 0.5);
        p.reach('L', A.kbL.clone().add(V(0, 0.03, 0)), 1);
        break;
      }
      case 'slack':
        // 通知にビクッとして、急いで返信
        if (kk < 0.08) c.once('slack', a.ev.at);
        p.add('spine', -0.08 * bump(kk, 0.05, 0.3), 0, 0);
        p.face.brow = kk < 0.25 ? 'raised' : 'focus';
        p.face.eyes = kk < 0.25 ? 1.2 : 1;
        P.typing(p, c.realT * 1.4, A.kbL, A.kbR, 1.4);
        c.loop('typing', 1);
        break;
      case 'doze': {
        // 居眠り：かくん、と首が落ちて、はっと起きる
        const drop = Math.max(0, Math.sin(kk * PI * 3)) ** 3;
        p.face.eyes = kk > 0.92 ? 1.1 : 0.08;
        p.add('neck', 0.5 * drop + 0.2, 0, 0);
        p.add('head', 0.2 * drop, 0, 0.1);
        p.set('armL', -0.45, 0, 0.12).set('elbowL', -0.8);
        p.reach('R', A.mouse.clone().add(V(0, 0.03, 0)), 0.6);
        if (kk > 0.92) {
          p.face.brow = 'raised';
          c.once('startle', a.ev.at + a.ev.len * 0.92);
        }
        break;
      }
      default:
        if (!deskFidget(c, kind, kk)) typingDefault();
    }
  },
};

const FOOD_PROP = { noodle: 'noodle', bento: 'bento', pizza: 'pizza', delivery: 'bento', konbini: 'bento' } as const;

const deskEat: ActDef = {
  place: () => PLACES.desk,
  sample(c) {
    const p = c.p;
    const k = deskSit(c, { slouch: 0.45 });
    const food = c.step.p.food ?? 'noodle';
    const prop = FOOD_PROP[food];
    const eating = c.sec < c.durSec * 0.75;
    const bowl = A.deskTop.clone().add(V(-0.05, 0, -0.1));
    if (eating) c.props.put(prop, bowl, 0.4);
    screen(c, 'monitor', 'video', { seed: c.seed + 3 });
    if (k < 0.5) return;
    lookMonitor(c, 0.9);
    c.loop('videoAudio', 0.5);
    if (!eating) {
      // 食べ終わって、ぼーっと動画
      P.mouseHand(p, c.realT, A.mouse, 0.15);
      p.face.eyes = 0.75;
      if (Math.sin(c.sec * 0.3) > 0.95) p.face.mouth = 'smile';
      return;
    }
    // すする
    const cyc = (c.sec % 3.2) / 3.2;
    const lift = bump(cyc, 0.25, 0.7);
    P.handToMouth(p, 'R', lift * 0.9, bowl.clone().add(V(0, 0.12, 0)));
    c.props.hold('chopsticks', 'R', [0, 0, 0.02], [0.4, 0, 0]);
    p.reach('L', bowl.clone().add(V(0.05, 0.05, 0.08)), 0.7);
    p.face.mouth = lift > 0.85 ? 'o' : 'chew';
    if (lift > 0.85 && food === 'noodle') c.loop('slurp', 0.8);
    p.add('neck', 0.15, 0, 0);
  },
};

const GAME_PC_EVENTS = [
  { kind: 'play', w: 6, len: [8, 20] as [number, number] },
  { kind: 'focus', w: 3, len: [5, 10] as [number, number] },
  { kind: 'win', w: 1.3, len: [2.5, 3.5] as [number, number] },
  { kind: 'lose', w: 1.8, len: [3, 4.5] as [number, number] },
  { kind: 'snack', w: 1.5, len: [4, 7] as [number, number] },
  { kind: 'drink', w: 1.2, len: [3, 4] as [number, number] },
  { kind: 'loading', w: 1.2, len: [5, 9] as [number, number] },
  { kind: 'stretch', w: 0.6, len: [3.5, 4.5] as [number, number] },
  { kind: 'scratch', w: 0.6, len: [3.5, 5] as [number, number] },
  { kind: 'clock', w: 0.7, len: [1.6, 2.4] as [number, number] },
  { kind: 'window', w: 0.5, len: [2.2, 3.5] as [number, number] },
];

const gamePC: ActDef = {
  place: () => PLACES.desk,
  sample(c) {
    const p = c.p;
    const genre = c.step.p.genre ?? 'fps';
    const evs = eventTrack(c, GAME_PC_EVENTS, [0.2, 1.2]);
    const a = activeEvent(evs, c.sec);
    const kind = a?.ev.kind ?? 'play';
    const focus = kind === 'focus' ? 1 : kind === 'play' ? 0.5 : 0;
    const k = deskSit(c, { slouch: 0.35 - focus * 0.25, recline: kind === 'lose' || kind === 'loading' ? 0.5 : 0, legs: 'wide' });
    const ev = kind === 'win' ? 'win' : kind === 'lose' ? 'lose' : kind === 'loading' ? 'loading' : undefined;
    screen(c, 'monitor', 'game', { genre, event: ev, seed: c.seed });
    if (c.step.p.dark) c.out.ceiling = 'off';
    if (k < 0.5) return;
    c.out.headset = genre === 'fps' || genre === 'mmo';
    lookMonitor(c);
    c.loop('gamePC', 0.4);
    const playHands = (inten: number) => {
      p.reach('L', A.wasd.clone().add(V(0, 0.03 + Math.max(0, Math.sin(c.realT * 9)) * 0.012 * inten, noise1(c.realT * 2, 4) * 0.02)), 1, V(1, -1, -0.5));
      p.set('handL', 0.1, 0, 0);
      P.mouseHand(p, c.realT, A.mouse, inten);
      if (inten > 0.3) c.loop('clicky', 0.5 * inten);
    };
    p.face.brow = 'focus';
    p.face.noBlink = focus;
    if (!a) {
      playHands(0.8);
      return;
    }
    const kk = a.k;
    switch (kind) {
      case 'play':
        playHands(0.8);
        break;
      case 'focus':
        playHands(1.2);
        p.add('neck', -0.1, 0, 0);
        p.face.eyes = 0.85;
        p.face.mouth = kk > 0.5 ? 'grit' : 'neutral';
        break;
      case 'win':
        // 小さくガッツポーズ
        p.face.mouth = 'smile';
        p.face.brow = 'raised';
        p.set('armR', -1.2 * bump(kk), 0, -0.25).set('elbowR', -2.2 * bump(kk) - 0.4);
        p.set('handR', 0, 0, 0);
        p.reach('L', A.wasd.clone().add(V(0, 0.03, 0)), 1);
        c.once('win', a.ev.at + 0.3);
        break;
      case 'lose':
        // 天井を仰ぐ
        p.face.mouth = kk < 0.3 ? 'open' : 'frown';
        p.face.brow = 'sad';
        p.set('armL', -2.6 * bump(kk), 0, 0.5).set('elbowL', -2.4 * bump(kk) - 0.4);
        p.set('armR', -2.6 * bump(kk), 0, -0.5).set('elbowR', -2.4 * bump(kk) - 0.4);
        p.add('head', -0.4 * bump(kk), 0, 0);
        p.lookAt(V(-1.0, 2.6, -0.9), bump(kk));
        c.once('lose', a.ev.at + 0.2);
        break;
      case 'snack': {
        const cyc = (c.sec % 2.4) / 2.4;
        const bag = A.deskTop.clone().add(V(0.02, 0.05, 0.12));
        c.props.put('snack', bag, 0.6);
        P.handToMouth(p, 'L', bump(cyc, 0.3, 0.6), bag.clone().add(V(0, 0.06, 0)));
        P.mouseHand(p, c.realT, A.mouse, 0.4);
        p.face.mouth = 'chew';
        c.loop('crunch', 0.6);
        break;
      }
      case 'drink': {
        const sip = bump(kk, 0.3, 0.7);
        P.handToMouth(p, 'L', sip, A.deskTop.clone().add(V(-0.1, 0.06, 0.15)));
        c.props.hold('can', 'L', [0, 0.0, 0.03], [0, 0, 0]);
        P.mouseHand(p, c.realT, A.mouse, 0.2);
        if (sip > 0.9) c.once('gulp', a.ev.at + a.ev.len * 0.5);
        break;
      }
      case 'loading':
        P.holdPhone(p, c.realT, 'R', false, 0.3, 0.25);
        c.props.hold('phone', 'R', [0, 0, 0.02], [-1.25, 0, 0]);
        screen(c, 'phone', 'sns');
        break;
      default:
        if (!deskFidget(c, kind, kk)) playHands(0.5);
    }
  },
};

const video: ActDef = {
  place: () => PLACES.desk,
  sample(c) {
    const p = c.p;
    const k = deskSit(c, { recline: 0.6, legs: 'crossed' });
    screen(c, 'monitor', 'video', { seed: c.seed + 7 });
    if (k < 0.5) return;
    lookMonitor(c, 0.8);
    c.loop('videoAudio', 0.6);
    p.face.eyes = 0.8;
    P.mouseHand(p, c.realT, A.mouse, 0.1);
    const evs = eventTrack(c, [
      { kind: 'laugh', w: 2, len: [1.5, 2.5] },
      { kind: 'snack', w: 2, len: [4, 6] },
      { kind: 'scratch', w: 1, len: [3.5, 4.5] },
      { kind: 'belly', w: 1, len: [2, 3] },
    ], [3, 8]);
    const a = activeEvent(evs, c.sec);
    if (a?.ev.kind === 'laugh') {
      p.face.mouth = 'open';
      p.add('spine', Math.sin(c.realT * 18) * 0.03, 0, 0);
      c.once('laugh', a.ev.at);
    } else if (a?.ev.kind === 'snack') {
      const bag = A.deskTop.clone().add(V(0.02, 0.05, 0.12));
      c.props.put('snack', bag, 0.6);
      P.handToMouth(p, 'L', bump((c.sec % 2.4) / 2.4, 0.3, 0.6), bag.clone().add(V(0, 0.06, 0)));
      p.face.mouth = 'chew';
      c.loop('crunch', 0.5);
    } else if (a) deskFidget(c, a.ev.kind, a.k);
  },
};

// ================= 床・TV =================

const GAME_TV_EVENTS = [
  { kind: 'play', w: 6, len: [8, 20] as [number, number] },
  { kind: 'lean', w: 3, len: [4, 9] as [number, number] },
  { kind: 'win', w: 1.3, len: [2.5, 3.5] as [number, number] },
  { kind: 'lose', w: 1.8, len: [3, 4.5] as [number, number] },
  { kind: 'drink', w: 1.2, len: [3, 4] as [number, number] },
  { kind: 'snack', w: 1.2, len: [4, 6] as [number, number] },
  { kind: 'loading', w: 1, len: [5, 9] as [number, number] },
  { kind: 'stretch', w: 0.6, len: [3.5, 4.5] as [number, number] },
];

const gameTV: ActDef = {
  place: () => PLACES.zaisu,
  sample(c) {
    const p = c.p;
    const genre = c.step.p.genre ?? 'rpg';
    const evs = eventTrack(c, GAME_TV_EVENTS, [0.2, 1.2]);
    const a = activeEvent(evs, c.sec);
    const kind = a?.ev.kind ?? 'play';
    const lean = kind === 'lean' ? 0.0 : kind === 'lose' || kind === 'loading' ? 0.9 : 0.4;
    const k = floorSit(c, lean);
    const ev = kind === 'win' ? 'win' : kind === 'lose' ? 'lose' : kind === 'loading' ? 'loading' : undefined;
    screen(c, 'tv', 'game', { genre, event: ev });
    if (c.step.p.dark) c.out.ceiling = 'off';
    if (k < 0.5) {
      if (k > 0.2) c.props.put('controller', A.tableNear.clone().add(V(0.05, 0.02, 0)), 0);
      return;
    }
    c.loop('gameTV', 0.45);
    p.lookAt(A.tv, 1);
    p.face.brow = 'focus';
    const ctl = () => {
      P.holdController(p, c.realT, 1, kind === 'lean' ? 0.04 : 0);
      c.props.hold('controller', 'L', [-0.065, -0.01, 0.02], [0.2, 0, 0]);
    };
    if (genre === 'racing') p.add('chest', 0, 0, Math.sin(c.realT * 0.9) * 0.15);
    if (!a) return ctl();
    const kk = a.k;
    switch (kind) {
      case 'play':
        ctl();
        break;
      case 'lean':
        ctl();
        p.add('spine', 0.25, 0, 0);
        p.face.noBlink = 1;
        p.face.mouth = kk > 0.6 ? 'grit' : 'neutral';
        break;
      case 'win':
        ctl();
        p.face.mouth = 'smile';
        p.face.brow = 'raised';
        p.add('chest', -0.1 * bump(kk), 0, 0);
        p.ik.L.target.y += 0.1 * bump(kk);
        p.ik.R.target.y += 0.1 * bump(kk);
        c.once('win', a.ev.at + 0.3);
        break;
      case 'lose':
        // コントローラーを置いて天井を仰ぐ
        c.props.put('controller', A.tableNear.clone().add(V(0.05, 0.02, 0)), 0.5);
        p.set('armL', -0.2, 0, 0.5).set('armR', -0.2, 0, -0.5);
        p.set('elbowL', -0.3).set('elbowR', -0.3);
        p.add('spine', -0.2 * bump(kk), 0, 0);
        p.add('head', -0.5 * bump(kk), 0, 0);
        p.lookAt(V(0.5, 2.6, 0.3), bump(kk));
        p.face.mouth = kk < 0.3 ? 'open' : 'frown';
        p.face.brow = 'sad';
        c.once('lose', a.ev.at + 0.2);
        break;
      case 'drink': {
        const sip = bump(kk, 0.3, 0.7);
        P.handToMouth(p, 'R', sip, A.tableNear.clone().add(V(0.05, 0.06, -0.12)));
        c.props.hold('can', 'R', [0, 0, 0.03], [0, 0, 0]);
        c.props.put('controller', A.tableNear.clone().add(V(0.05, 0.02, 0.05)), 0);
        if (sip > 0.9) c.once('gulp', a.ev.at + a.ev.len * 0.5);
        break;
      }
      case 'snack': {
        const near = c.env.season === 'winter' ? A.kotatsuNear : A.tableNear;
        const prop = c.env.season === 'winter' ? 'mikan' : 'snack';
        const cyc = (c.sec % 2.6) / 2.6;
        if (prop === 'snack') c.props.put('snack', near.clone().add(V(0.05, 0.02, 0.1)), 0.5);
        P.handToMouth(p, 'R', bump(cyc, 0.3, 0.6), near.clone().add(V(0.05, 0.06, 0.1)));
        if (prop === 'mikan') c.props.hold('mikan', 'R', [0, -0.01, 0.03]);
        p.face.mouth = 'chew';
        c.props.put('controller', near.clone().add(V(0.05, 0.02, -0.05)), 0);
        if (prop === 'snack') c.loop('crunch', 0.5);
        break;
      }
      case 'loading':
        P.holdPhone(p, c.realT, 'R', false, 0.3, 0.28);
        c.props.hold('phone', 'R', [0, 0, 0.02], [-1.25, 0, 0]);
        c.props.put('controller', A.tableNear.clone().add(V(0.05, 0.02, 0)), 0);
        screen(c, 'phone', 'sns');
        break;
      case 'stretch':
        P.stretchUp(p, bump(kk, 0.3, 0.7));
        c.props.put('controller', A.tableNear.clone().add(V(0.05, 0.02, 0)), 0);
        break;
    }
  },
};

const tableEat: ActDef = {
  place: () => PLACES.zaisu,
  sample(c) {
    const p = c.p;
    const k = floorSit(c, 0.2);
    const food = c.step.p.food ?? 'delivery';
    const prop = FOOD_PROP[food];
    const near = c.env.season === 'winter' ? A.kotatsuNear : A.tableNear;
    const eating = c.sec < c.durSec * 0.7;
    const plate = near.clone().add(V(0.1, 0.0, 0));
    if (eating || k < 0.9) c.props.put(prop, plate, PI / 2);
    screen(c, 'tv', 'tv', { seed: c.seed });
    c.loop('tvShow', 0.5);
    if (k < 0.5) return;
    p.lookAt(A.tv, 0.8);
    if (!eating) {
      p.face.eyes = 0.7;
      P.holdPhone(p, c.realT, 'R', false, 0.3, 0.25);
      c.props.hold('phone', 'R', [0, 0, 0.02], [-1.25, 0, 0]);
      screen(c, 'phone', 'sns');
      return;
    }
    const cyc = (c.sec % 3) / 3;
    const lift = bump(cyc, 0.25, 0.65);
    P.handToMouth(p, 'R', lift * 0.9, plate.clone().add(V(0, 0.1, 0)));
    if (food !== 'pizza') c.props.hold('chopsticks', 'R', [0, 0, 0.02], [0.4, 0, 0]);
    p.face.mouth = 'chew';
    p.add('spine', 0.15, 0, 0);
    if (Math.sin(c.sec * 0.5) > 0.9) {
      p.face.mouth = 'open';
      c.once('laugh', Math.floor(c.sec));
    }
  },
};

const phoneFloor: ActDef = {
  place: () => PLACES.zaisu,
  sample(c) {
    const p = c.p;
    const k = floorSit(c, 0.9);
    if (k < 0.5) return;
    P.holdPhone(p, c.realT, 'R', true, 0.28, 0.3);
    c.props.hold('phone', 'R', [0, 0, 0.02], [-1.2, 0, 0]);
    gacha(c);
  },
};

const phoneBed: ActDef = {
  place: () => PLACES.bed,
  sample(c) {
    const p = c.p;
    const k = seatedK(c, 2.5, 2);
    if (k < 0.5) {
      P.sitChair(p, A.bedEdge, c.realT, { slouch: 0.5 });
      if (k < 0.15) {
        p.root.copy(PLACES.bed.pos);
        P.stand(p, c.realT);
      }
      return;
    }
    P.lieBed(p, A.pillow, A.bedDir, SPOT.bed.top, 'back');
    p.ik.L.w = 0;
    // スマホを顔の上に掲げる
    const face = P.headPos(p);
    const ph = face.clone().add(V(-0.25, 0.3, 0));
    p.reach('R', ph, 1, V(-1, 0, 0));
    p.reach('L', ph.clone().add(V(0, 0, 0.06)), 1, V(1, 0, 0));
    p.lookAt(ph, 1);
    c.props.hold('phone', 'R', [0, 0, 0.02], [-0.6, 0, 0]);
    gacha(c);
  },
};

/** ガチャを回す（だいたい爆死） */
function gacha(c: Ctx): void {
  const p = c.p;
  const evs = eventTrack(c, [
    { kind: 'tap', w: 5, len: [5, 10] },
    { kind: 'fail', w: 3, len: [3, 4] },
    { kind: 'win', w: 0.4, len: [3, 4] },
    { kind: 'scroll', w: 3, len: [5, 10] },
  ], [0.5, 2]);
  const a = activeEvent(evs, c.sec);
  const kind = a?.ev.kind ?? 'scroll';
  screen(c, 'phone', kind === 'scroll' ? 'sns' : 'gacha', { event: kind });
  p.face.eyes = 0.85;
  if (kind === 'fail' && a) {
    p.face.brow = 'sad';
    p.face.mouth = 'frown';
    p.add('neck', 0.25 * bump(a.k), 0, 0);
    c.once('sigh', a.ev.at + 0.5);
  } else if (kind === 'win' && a) {
    p.face.brow = 'raised';
    p.face.mouth = 'open';
    p.face.eyes = 1.2;
    c.once('win', a.ev.at + 0.4);
  } else if (kind === 'tap') {
    c.loop('tap', 0.4);
  }
}

// ================= 台所まわり =================

const noodle: ActDef = {
  place: () => PLACES.fridge,
  sample(c) {
    const p = c.p;
    p.root.copy(PLACES.fridge.pos);
    p.yaw = -PI / 2;
    P.stand(p, c.realT);
    const s = c.sec;
    const pour = c.durSec - 3;
    if (s < 1.6) {
      // ケトルのスイッチを入れる
      p.reach('R', A.kettle.clone().add(V(0.05, -0.08, 0)), bump(s / 1.6));
      p.add('spine', 0.15, 0, 0);
      c.once('click', 0.8);
    } else if (s < pour) {
      // お湯が沸くまでスマホ
      c.dyn.kettle = 1;
      c.loop('kettle', clamp((s - 1.6) / 5));
      P.holdPhone(p, c.realT, 'R', false, 0.28, 0.3);
      c.props.hold('phone', 'R', [0, 0, 0.02], [-1.25, 0, 0]);
      screen(c, 'phone', 'sns');
    } else {
      // 注ぐ
      const k = (s - pour) / 3;
      c.props.put('noodle', A.kettle.clone().add(V(0.12, -0.12, 0.12)), 0);
      p.reach('R', A.kettle.clone().add(V(0.08, -0.03 + bump(k) * 0.05, 0)), 1);
      p.add('spine', 0.15, 0, 0);
      p.lookAt(A.kettle.clone().add(V(0.12, -0.12, 0.12)), 1);
      c.loop('pour', bump(k));
    }
    p.lookAt(A.kettle, s < 1.6 || s >= pour ? 1 : 0);
  },
};

const fridge: ActDef = {
  place: () => PLACES.fridge,
  sample(c) {
    const p = c.p;
    p.root.copy(PLACES.fridge.pos);
    p.yaw = -PI / 2;
    P.stand(p, c.realT);
    const s = c.sec;
    if (s < 3.2) {
      // しゃがんで開けて、取り出す
      const k = bump(s / 3.2, 0.25, 0.8);
      P.crouch(p, k * 0.7);
      p.add('spine', 0.3 * k, 0, 0);
      c.dyn.fridge = s > 0.6 && s < 2.8 ? 1 : 0;
      c.out.fridgeLight = c.dyn.fridge;
      p.reach('R', s < 0.8 ? A.fridgeHandle : A.fridgeInside, k);
      p.lookAt(A.fridgeInside, 1);
      if (s > 0.6) c.once('fridgeOpen', 0.6);
      if (s > 2.8) c.once('fridgeClose', 2.8);
      if (s > 1.6) c.props.hold('can', 'R', [0, 0, 0.03], [0, 0, 0]);
      return;
    }
    // その場で飲む
    c.props.hold('can', 'R', [0, 0, 0.03], [0, 0, 0]);
    if (s > 3.4) c.once('canOpen', 3.5);
    const sipK = clamp((s - 4) / Math.max(1, c.durSec - 5.5));
    const sip = sipK < 0.5 ? bump(sipK / 0.5, 0.3, 0.7) : bump((sipK - 0.5) / 0.5, 0.3, 0.7);
    P.handToMouth(p, 'R', sip, P.local(p, -0.2, 0.95, 0.25));
    p.add('head', -0.35 * sip, 0, 0);
    if (sip > 0.9) c.once('gulp', Math.floor(s));
    if (sipK > 0.95) {
      p.face.mouth = 'open';
      p.face.eyes = 0.3;
      c.once('ahh', c.durSec - 1.4);
    }
  },
};

// ================= 鏡・体重計 =================

const mirror: ActDef = {
  place: () => PLACES.mirror,
  sample(c) {
    const p = c.p;
    p.root.copy(PLACES.mirror.pos);
    p.yaw = PI;
    P.stand(p, c.realT);
    const s = c.sec;
    const tonic = c.step.p.tonic;
    // 鏡に顔を近づけ、頭頂部を確認
    p.add('spine', 0.25, 0, 0);
    p.add('chest', 0.1, 0, 0);
    p.hips.z = 0.05;
    p.lookAt(A.mirrorFace, 1);
    p.add('head', 0.35, 0, 0);
    const seg = c.durSec;
    if (!tonic || s < seg * 0.35) {
      // 前髪をかき上げて、生え際をチェック
      const k = clamp(s / (seg * (tonic ? 0.35 : 0.8)));
      P.scratchHead(p, c.realT * 0.3, 'R', bump(k, 0.15, 0.7));
      p.ik.R.target.add(P.rotY(V(0, -0.03, 0.08), p.yaw));
      p.face.brow = 'sad';
      p.face.eyes = 1.1;
      if (k > 0.75) {
        P.sigh(p, (k - 0.75) / 0.25);
        c.once('sigh', seg * 0.7);
      }
    } else {
      // 育毛剤をつけて、マッサージ
      const k = (s - seg * 0.35) / (seg * 0.65);
      const top = P.headPos(p).add(P.rotY(V(0, 0.2, -0.02), p.yaw));
      if (k < 0.4) {
        c.props.hold('tonic', 'R', [0, -0.02, 0.03], [PI, 0, 0]);
        p.reach('R', top.clone().add(V(0, 0.05, 0)), 1, V(-1.5, 0.5, -0.3));
        if (Math.floor(k * 20) % 4 === 0) c.loop('spray', 0.6);
      } else {
        // 両手の指でもみもみ
        const m = Math.sin(c.realT * 9) * 0.015;
        p.reach('R', top.clone().add(P.rotY(V(-0.05, m, 0), p.yaw)), 1, V(-1.5, 0.5, -0.3));
        p.reach('L', top.clone().add(P.rotY(V(0.05, -m, 0), p.yaw)), 1, V(1.5, 0.5, -0.3));
        p.face.eyes = 0.2;
        p.face.mouth = 'frown';
        c.props.put('tonic', V(SPOT.shelf.x + 0.1, 0.88, SPOT.shelf.z), 0);
      }
    }
  },
};

const weigh: ActDef = {
  place: () => PLACES.mirror,
  sample(c) {
    const p = c.p;
    const s = c.sec;
    const on = smooth(clamp((s - 0.5) / 1.2)) * (1 - smooth(clamp((s - (c.durSec - 2)) / 1.0)));
    p.root.lerpVectors(PLACES.mirror.pos, A.scale.clone().setY(0), on);
    p.yaw = PI;
    P.stand(p, c.realT);
    p.root.y = A.scale.y * on;
    if (on > 0.5) {
      // 下を見る → 固まる
      p.lookAt(A.scale.clone().add(P.rotY(V(0, 0, 0.12), p.yaw)), 1);
      p.add('spine', 0.15, 0, 0);
      c.dyn.scaleDisplay = 1;
      const k = clamp((s - 1.7) / Math.max(1, c.durSec - 4));
      const heavier = (c.seed % 3) !== 0;
      if (k > 0.3) {
        p.face.eyes = heavier ? 1.15 : 1;
        p.face.brow = heavier ? 'sad' : 'raised';
        p.face.mouth = heavier ? 'o' : 'smile';
        if (heavier && k > 0.6) P.sigh(p, (k - 0.6) / 0.4);
      }
      c.once('beep', 1.8);
    }
  },
};

// ================= 出入り =================

/** ドアから出ていく */
const leave: ActDef = {
  place: () => PLACES.door,
  exit: () => PLACES.outside,
  sample(c) {
    const p = c.p;
    const s = c.sec;
    const carry = c.step.p.carry;
    const why = c.step.p.why;
    if (carry) c.props.hold(carry, 'R', [0, 0, 0.02]);
    // ドアを開けて、出て、閉める
    const k = clamp((s - 0.8) / 2.2);
    p.root.lerpVectors(PLACES.door.pos, PLACES.outside.pos, smooth(k));
    p.yaw = -PI / 2;
    if (k > 0 && k < 1) P.walk(p, s * 7.5, 0.9);
    else P.stand(p, c.realT);
    if (s < 1.2) p.reach('L', A.doorKnob, bump(s / 1.2, 0.4, 0.9));
    c.dyn.door = s > 0.6 && s < 3.6 ? 1 : 0;
    if (s > 0.6) c.once('doorOpen', 0.6);
    if (s > 3.6) c.once('doorClose', 3.6);
    c.out.visible = k < 0.85;
    c.out.corridor = c.dyn.door;
    if (why === 'konbini' || why === 'trash') c.out.ceiling = s > 0.4 ? 'off' : 'auto';
  },
};

const away: ActDef = {
  place: () => null,
  sample(c) {
    c.out.visible = false;
    const why = c.step.p.why;
    if (why === 'konbini' || why === 'trash') c.out.ceiling = 'off';
    // 風呂場から聞こえる音
    if (why === 'bath') c.loop('shower', 0.35);
    if (why === 'toilet' && c.sec > c.durSec - 3) c.once('flush', c.durSec - 3);
  },
};

const back: ActDef = {
  place: () => PLACES.outside,
  exit: () => PLACES.door,
  sample(c) {
    const p = c.p;
    const s = c.sec;
    const why = c.step.p.why;
    const k = clamp((s - 0.6) / 2.2);
    p.root.lerpVectors(PLACES.outside.pos, PLACES.door.pos, smooth(k));
    p.yaw = PI / 2;
    if (k > 0 && k < 1) P.walk(p, s * 7.5, 0.9);
    else {
      P.stand(p, c.realT);
      p.yaw = PI / 2 + (k >= 1 ? 0.6 : 0);
    }
    c.dyn.door = s > 0.3 && s < 3.4 ? 1 : 0;
    if (s > 0.3) c.once('doorOpen', 0.3);
    if (s > 3.4) c.once('doorClose', 3.4);
    c.out.visible = k > 0.1;
    c.out.corridor = c.dyn.door;
    if (why === 'bath') {
      c.out.towel = true;
      c.out.glasses = s > 2.5;
    }
    if (why === 'konbini') c.props.hold('konbiniBag', 'R', [0, 0.02, 0.02]);
  },
};

const delivery: ActDef = {
  place: () => PLACES.door,
  sample(c) {
    const p = c.p;
    const s = c.sec;
    p.root.copy(PLACES.door.pos).add(V(-0.12, 0, 0));
    p.yaw = -PI / 2;
    P.stand(p, c.realT);
    c.dyn.door = s > 0.6 && s < c.durSec - 1 ? 0.55 : 0;
    c.out.corridor = c.dyn.door;
    if (s > 0.6) c.once('doorOpen', 0.6);
    if (s > c.durSec - 1) c.once('doorClose', c.durSec - 1);
    if (s < 1.2) p.reach('L', A.doorKnob, bump(s / 1.2, 0.4, 0.9));
    // ぺこぺこ
    const mid = c.durSec * 0.5;
    p.add('spine', 0.25 * bump(clamp((s - 1.2) / 1.5)) + 0.3 * bump(clamp((s - mid) / 1.2)), 0, 0);
    if (s > mid) {
      c.props.hold('deliveryBag', 'R', [0, 0, 0.02]);
      c.once('thanks', mid);
    } else {
      p.reach('R', P.local(p, -0.1, 1.0, 0.35), bump(clamp((s - mid + 1.5) / 1.5), 0.5, 1));
    }
    p.face.mouth = s > 1.4 && s < mid + 1 && Math.sin(c.realT * 10) > 0 ? 'open' : 'smile';
  },
};

const trash: ActDef = {
  place: () => PLACES.bags,
  sample(c) {
    const p = c.p;
    const s = c.sec;
    p.root.copy(PLACES.bags.pos);
    p.yaw = -PI / 2 - 0.3;
    P.stand(p, c.realT);
    const k = bump(clamp(s / 2.5), 0.4, 0.8);
    P.crouch(p, k * 0.8);
    p.add('spine', k * 0.4, 0, 0);
    p.reach('R', A.bags, k);
    if (s > 1.4) {
      c.props.hold('trashBag', 'R', [0, 0, 0.02]);
      c.dyn.trashBags = 0;
      c.once('bag', 1.4);
    }
  },
};

// ================= 休日 =================

const laundry: ActDef = {
  place: () => PLACES.laundry,
  sample(c) {
    const p = c.p;
    const s = c.sec;
    p.root.copy(PLACES.laundry.pos);
    p.yaw = 0.83;
    P.stand(p, c.realT);
    const take = c.step.p.mode === 'take';
    const basket = P.local(p, -0.25, 0.0, 0.15);
    c.props.put('laundryBasket', basket.clone().setY(0.2), 0.3);
    // かごから取って干す、を繰り返す
    const cyc = (s % 4) / 4;
    const down = bump(cyc / 0.4, 0.3, 0.7);
    const up = bump((cyc - 0.4) / 0.6, 0.3, 0.7);
    if (cyc < 0.4) {
      P.crouch(p, down * 0.6);
      p.add('spine', down * 0.4, 0, 0);
      p.reach('R', basket.clone().setY(0.25), down);
    } else {
      p.reach('R', A.laundryBar.clone().add(V(-0.1 + Math.sin(s) * 0.15, -0.05, 0)), up, V(-1, -0.5, -0.5));
      p.reach('L', A.laundryBar.clone().add(V(0.05 + Math.sin(s) * 0.15, -0.05, 0)), up, V(1, -0.5, -0.5));
      p.lookAt(A.laundryBar, up);
    }
    c.dyn.laundry = take ? s < c.durSec * 0.6 : s > c.durSec * 0.3;
    if (cyc > 0.7) c.loop('cloth', 0.4);
  },
};

const windowLook: ActDef = {
  place: () => PLACES.bed,
  sample(c) {
    const p = c.p;
    p.root.copy(PLACES.bed.pos).add(V(0.15, 0, -0.05));
    p.yaw = PI + 0.15;
    P.stand(p, c.realT);
    p.lookAt(A.window, 1);
    // 腰に手を当てて、外を眺める
    p.reach('L', P.local(p, 0.2, 0.95, -0.02), 1, V(1.5, 0, 0));
    p.reach('R', P.local(p, -0.2, 0.95, -0.02), 1, V(-1.5, 0, 0));
    p.face.eyes = 0.75;
    const k = c.sec / c.durSec;
    if (k > 0.6 && k < 0.85) P.sigh(p, (k - 0.6) / 0.25);
    if (k > 0.6) c.once('sigh', c.durSec * 0.62);
  },
};

const exercise: ActDef = {
  place: () => PLACES.center,
  sample(c) {
    const p = c.p;
    p.root.copy(PLACES.center.pos);
    p.yaw = 0.5;
    P.stand(p, c.realT);
    const s = c.sec;
    // スクワット3回で力尽きる
    if (s < 9) {
      const n = Math.floor(s / 3);
      const k = (s % 3) / 3;
      const depth = bump(k, 0.45, 0.55) * (n === 2 ? 0.5 : 0.75);
      P.crouch(p, depth);
      p.set('armL', -1.4 * depth - 0.2, 0, 0.1).set('armR', -1.4 * depth - 0.2, 0, -0.1);
      p.face.mouth = depth > 0.3 ? 'grit' : 'o';
      p.face.brow = n === 2 ? 'sad' : 'focus';
      c.once('huff', n * 3 + 1.4);
    } else {
      // 膝に手をついてぜえぜえ
      P.crouch(p, 0.15);
      p.add('spine', 0.6, 0, 0);
      p.reach('L', P.local(p, 0.12, 0.5, 0.25), 1);
      p.reach('R', P.local(p, -0.12, 0.5, 0.25), 1);
      p.breath = 3;
      p.face.mouth = 'open';
      p.face.eyes = 0.5;
      p.face.brow = 'sad';
      c.loop('pant', 0.7);
    }
  },
};

export const ACTS: Record<ActName, ActDef> = {
  sleep, wake, dress, meeting, work, deskEat, gamePC, video, gameTV, tableEat,
  phoneFloor, phoneBed, noodle, fridge, mirror, weigh, leave, away, back, delivery,
  laundry, window: windowLook, exercise, trash,
};
