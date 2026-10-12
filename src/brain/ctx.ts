import * as THREE from 'three';
import type { Pose } from '../ossan/pose';
import type { Props } from '../ossan/props';
import type { WorldDyn } from '../world/world';
import type { BoxTime } from '../core/time';
import type { Env } from '../world/environment';
import type { NodeId } from './nav';
import { Rng } from '../core/random';
import { clamp, smooth } from '../core/math';

export type Genre = 'fps' | 'rpg' | 'fighting' | 'racing' | 'puzzle' | 'retro' | 'mmo' | 'horror' | 'sports';

export type ScreenKind =
  | 'off' | 'desktop' | 'work' | 'meeting' | 'video' | 'game' | 'lock' | 'tv' | 'gacha' | 'sns' | 'alarm';

export interface ScreenMode {
  kind: ScreenKind;
  genre?: Genre;
  /** 画面の中の出来事（勝ち・負けなど） */
  event?: string;
  /** その画面を見始めてからの秒（現実） */
  t: number;
  /** カメラON（会議） */
  cam?: boolean;
  seed: number;
}

export type ActName =
  | 'sleep' | 'wake' | 'dress' | 'meeting' | 'work' | 'deskEat' | 'gamePC' | 'video' | 'gameTV' | 'tableEat'
  | 'phoneFloor' | 'phoneBed' | 'noodle' | 'fridge' | 'mirror' | 'weigh' | 'leave' | 'away' | 'back' | 'delivery'
  | 'laundry' | 'window' | 'exercise' | 'trash';

export interface Step {
  act: ActName;
  /** その日の0時からの箱庭ms */
  start: number;
  p: StepParams;
}

export interface StepParams {
  genre?: Genre;
  /** 前日から続いている（入りの動作を省く） */
  cont?: boolean;
  /** 翌日へ続く（終わりの動作を省く） */
  contEnd?: boolean;
  why?: 'bath' | 'toilet' | 'konbini' | 'trash' | 'wash';
  food?: 'noodle' | 'bento' | 'pizza' | 'delivery' | 'konbini';
  carry?: 'konbiniBag' | 'deliveryBag' | 'noodle' | 'trashBag' | 'laundryBasket';
  dark?: boolean;
  on?: boolean;
  tonic?: boolean;
  mode?: string;
  seed?: number;
}

export interface Place {
  node: NodeId;
  pos: THREE.Vector3;
  yaw: number;
}

export interface FrameOut {
  visible: boolean;
  monitor: ScreenMode;
  laptop: ScreenMode;
  tv: ScreenMode;
  phone: ScreenMode;
  ceiling: 'auto' | 'on' | 'off';
  outfit: 'tshirt' | 'shirt';
  towel: boolean;
  glasses: boolean;
  headset: boolean;
  /** 一回きりの音 */
  sounds: string[];
  /** 鳴らし続ける音と音量 */
  loops: Map<string, number>;
  fridgeLight: number;
  corridor: number;
  /** 寝ている（いびき・照明） */
  asleep: boolean;
}

export interface Ctx {
  p: Pose;
  props: Props;
  dyn: WorldDyn;
  out: FrameOut;
  t: BoxTime;
  env: Env;
  /** 現実の絶対秒（揺れなどの周期用） */
  realT: number;
  /** 行動の開始からの経過（現実秒） */
  sec: number;
  /** 前フレームの sec */
  prevSec: number;
  /** 行動全体の長さ（現実秒） */
  durSec: number;
  step: Step;
  seed: number;
  /** この行動専用の乱数 */
  rng(tag: string | number): Rng;
  /** 一回だけ鳴らす（sec が at を越えた瞬間） */
  once(name: string, at: number): void;
  loop(name: string, vol?: number): void;
}

export function defaultScreen(): ScreenMode {
  return { kind: 'off', t: 0, seed: 0 };
}

export function defaultOut(): FrameOut {
  return {
    visible: true,
    monitor: defaultScreen(),
    laptop: defaultScreen(),
    tv: defaultScreen(),
    phone: defaultScreen(),
    ceiling: 'auto',
    outfit: 'tshirt',
    towel: false,
    glasses: true,
    headset: false,
    sounds: [],
    loops: new Map(),
    fridgeLight: 0,
    corridor: 0,
    asleep: false,
  };
}

export function resetOut(o: FrameOut): void {
  o.visible = true;
  o.monitor = { kind: 'lock', t: 0, seed: 0 };
  o.laptop = { kind: 'off', t: 0, seed: 0 };
  o.tv = { kind: 'off', t: 0, seed: 0 };
  o.phone = { kind: 'off', t: 0, seed: 0 };
  o.ceiling = 'auto';
  o.towel = false;
  o.glasses = true;
  o.headset = false;
  o.sounds.length = 0;
  o.loops.clear();
  o.fridgeLight = 0;
  o.corridor = 0;
  o.asleep = false;
}

// ---------- 出来事のトラック ----------

export interface Ev {
  kind: string;
  at: number; // 開始（現実秒）
  len: number;
}

export interface EvDef {
  kind: string;
  w: number;
  len: [number, number];
}

const trackCache = new Map<string, Ev[]>();

/** 行動中に起こる出来事を決定的に並べる。gap は出来事の間隔（秒） */
export function eventTrack(c: Ctx, defs: EvDef[], gap: [number, number], from = 2, to?: number): Ev[] {
  const key = `${c.t.day}|${c.step.start}|${c.step.act}|${defs.length}`;
  let evs = trackCache.get(key);
  if (evs) return evs;
  evs = [];
  const rng = c.rng('track');
  const end = to ?? c.durSec - 2;
  let tt = from + rng.range(gap[0] * 0.3, gap[1] * 0.6);
  while (tt < end) {
    const d = rng.weighted(defs.map((x) => [x, x.w] as [EvDef, number]));
    const len = rng.range(d.len[0], d.len[1]);
    if (tt + len > end) break;
    evs.push({ kind: d.kind, at: tt, len });
    tt += len + rng.range(gap[0], gap[1]);
  }
  if (trackCache.size > 200) trackCache.clear();
  trackCache.set(key, evs);
  return evs;
}

export function activeEvent(evs: Ev[], sec: number): { ev: Ev; k: number } | null {
  for (const ev of evs) {
    if (sec >= ev.at && sec < ev.at + ev.len) return { ev, k: (sec - ev.at) / ev.len };
    if (ev.at > sec) break;
  }
  return null;
}

/** 入り（座る等）の進み具合 0..1 */
export function enterK(c: Ctx, len: number): number {
  if (c.step.p.cont) return 1;
  return clamp(c.sec / len);
}

/** 終わり（立ち上がる等）の進み具合 0..1 */
export function exitK(c: Ctx, len: number): number {
  if (c.step.p.contEnd) return 0;
  return clamp((c.sec - (c.durSec - len)) / len);
}

/** 座っている度合い：入りで 0→1、終わりで 1→0 */
export function seatedK(c: Ctx, enter = 1.6, exit = 1.6): number {
  return smooth(enterK(c, enter)) * (1 - smooth(exitK(c, exit)));
}

/** 0→1→0 の山 */
export const bump = (k: number, a = 0.2, b = 0.8): number => smooth(k / a) * (1 - smooth((k - b) / (1 - b)));

export const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
