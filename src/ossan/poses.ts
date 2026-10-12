import * as THREE from 'three';
import { Pose, Side } from './pose';
import { noise1 } from '../core/random';
import { clamp, smooth } from '../core/math';

// 姿勢の部品。目標 Pose に書き込む。t は現実の経過秒。

const _v = new THREE.Vector3();

/** キャラのローカル座標 → ワールド */
export function local(p: Pose, x: number, y: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
  const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
  return out.set(p.root.x + x * c + z * s, p.root.y + y, p.root.z - x * s + z * c);
}

/** 立っているときの細かな揺れ（体重移動・ため息まじり） */
export function stand(p: Pose, t: number, seed = 0): void {
  const sway = noise1(t * 0.25, seed) * 0.03;
  p.hips.x = sway;
  p.hips.y = 0.875 + Math.abs(sway) * -0.1;
  p.add('hips', 0, noise1(t * 0.2, seed + 1) * 0.06, sway * 0.6);
  p.add('spine', 0.03, 0, -sway * 0.5);
  p.add('chest', 0.04, 0, -sway * 0.3);
  p.add('head', 0.05 + noise1(t * 0.3, seed + 2) * 0.05, noise1(t * 0.15, seed + 3) * 0.2, 0);
  // 体重が乗っている側の膝が伸び、反対はゆるむ
  p.set('thighL', -0.03, 0, 0.03).set('thighR', -0.03, 0, -0.03);
  p.set('kneeL', 0.05 + Math.max(0, -sway) * 2, 0, 0).set('kneeR', 0.05 + Math.max(0, sway) * 2, 0, 0);
  p.set('footL', -0.02, 0, -0.03).set('footR', -0.02, 0, 0.03);
  // 腕はだらんと、少し前に
  p.set('armL', 0.08, 0, 0.14).set('armR', 0.08, 0, -0.14);
  p.set('elbowL', -0.2).set('elbowR', -0.2);
}

/** 歩き。phase はラジアン（歩いた距離から決まる） */
export function walk(p: Pose, phase: number, amount = 1): void {
  const s = Math.sin(phase), c = Math.cos(phase);
  const a = amount;
  p.hips.y = 0.87 + Math.abs(c) * 0.018 * a - 0.008 * a;
  p.hips.x = s * 0.018 * a; // おっさん特有の左右の揺れ
  p.set('hips', 0, s * 0.1 * a, -s * 0.04 * a);
  p.set('spine', 0.05 * a, -s * 0.08 * a, s * 0.03 * a);
  p.set('chest', 0.03, -s * 0.05 * a, 0);
  p.set('head', 0.06, s * 0.06 * a, 0);
  const swing = 0.42 * a;
  p.set('thighL', -s * swing, 0, 0.02);
  p.set('thighR', s * swing, 0, -0.02);
  // 足を前に出すときに膝が曲がる
  p.set('kneeL', (0.12 + Math.max(0, Math.sin(phase + 0.9)) * 0.75) * a + 0.04);
  p.set('kneeR', (0.12 + Math.max(0, Math.sin(phase + Math.PI + 0.9)) * 0.75) * a + 0.04);
  p.set('footL', Math.sin(phase - 0.6) * 0.25 * a);
  p.set('footR', Math.sin(phase + Math.PI - 0.6) * 0.25 * a);
  p.set('armL', s * 0.32 * a + 0.05, 0, 0.13);
  p.set('armR', -s * 0.32 * a + 0.05, 0, -0.13);
  p.set('elbowL', -0.28 - Math.max(0, s) * 0.25 * a);
  p.set('elbowR', -0.28 - Math.max(0, -s) * 0.25 * a);
}

export interface Seat {
  pos: THREE.Vector3; // 座面中央（床からの高さを含む）
  yaw: number;
}

/** 椅子に座る。recline: 0=ふつう 1=のけぞる, slouch: 猫背 */
export function sitChair(p: Pose, seat: Seat, _t: number, opts: { recline?: number; slouch?: number; legs?: 'normal' | 'wide' | 'crossed' | 'tuck' } = {}): void {
  const rc = opts.recline ?? 0, sl = opts.slouch ?? 0;
  p.root.copy(seat.pos).setY(0);
  p.yaw = seat.yaw;
  p.hips.set(0, seat.pos.y + 0.1 - sl * 0.02, -0.06 + sl * 0.05 + rc * 0.06);
  p.set('hips', -0.08 - rc * 0.35 - sl * 0.15, 0, 0);
  p.set('spine', 0.06 + sl * 0.3 + rc * 0.05, 0, 0);
  p.set('chest', 0.05 + sl * 0.25, 0, 0);
  p.set('neck', -0.05 - sl * 0.25 + rc * 0.15, 0, 0);
  p.set('head', 0.05 - sl * 0.1 + rc * 0.15, 0, 0);
  const legs = opts.legs ?? 'normal';
  const hipComp = 0.08 + rc * 0.35 + sl * 0.15;
  if (legs === 'crossed') {
    p.set('thighL', -1.45 + hipComp, 0.1, 0.05).set('kneeL', 1.45);
    p.set('thighR', -1.75 + hipComp, -0.15, 0.25).set('kneeR', 1.3);
    p.set('footL', 0.0).set('footR', 0.3);
  } else if (legs === 'tuck') {
    p.set('thighL', -1.35 + hipComp, 0, 0.08).set('kneeL', 2.0).set('footL', 0.3);
    p.set('thighR', -1.35 + hipComp, 0, -0.08).set('kneeR', 2.0).set('footR', 0.3);
  } else {
    const wide = legs === 'wide' ? 0.28 : 0.12;
    const jiggle = 0;
    p.set('thighL', -1.4 + hipComp, 0, wide).set('kneeL', 1.35 + jiggle).set('footL', 0.05);
    p.set('thighR', -1.4 + hipComp, 0, -wide).set('kneeR', 1.35).set('footR', 0.05);
  }
  // 腕はひざの上
  p.set('armL', -0.5, 0, 0.12).set('elbowL', -0.7);
  p.set('armR', -0.5, 0, -0.12).set('elbowR', -0.7);
}

/** 貧乏ゆすり */
export function legJiggle(p: Pose, t: number, side: Side = 'R', amt = 1): void {
  const j = Math.sin(t * 22) * 0.06 * amt;
  p.add(side === 'L' ? 'kneeL' : 'kneeR', j, 0, 0);
  p.add(side === 'L' ? 'thighL' : 'thighR', -j * 0.5, 0, 0);
}

/** キーボードを打つ */
export function typing(p: Pose, t: number, kbL: THREE.Vector3, kbR: THREE.Vector3, intensity = 1): void {
  const l = _v.copy(kbL);
  const ty = (side: number) => Math.max(0, Math.sin(t * (13 + side * 3) + side * 2 + noise1(t * 2, side) * 3)) * 0.018 * intensity;
  p.reach('L', l.clone().add(new THREE.Vector3(0, 0.03 + ty(0), 0)), 1, new THREE.Vector3(1, -1, -0.5));
  p.reach('R', kbR.clone().add(new THREE.Vector3(0, 0.03 + ty(1), 0)), 1, new THREE.Vector3(-1, -1, -0.5));
  p.set('handL', 0.1, 0, 0.0).set('handR', 0.1, 0, 0.0);
}

/** 右手をマウスに */
export function mouseHand(p: Pose, t: number, mouse: THREE.Vector3, activity = 0.5): void {
  const jx = noise1(t * 1.5 * (1 + activity * 3), 11) * 0.03 * activity;
  const jz = noise1(t * 1.3 * (1 + activity * 3), 12) * 0.03 * activity;
  p.reach('R', mouse.clone().add(new THREE.Vector3(jx, 0.04, jz)), 1, new THREE.Vector3(-1, -0.8, -0.6));
  p.set('handR', 0.15, 0, 0);
}

/** コントローラーを両手で持つ（胸の前） */
export function holdController(p: Pose, t: number, intensity = 1, height = 0): void {
  const k = intensity;
  const jitter = noise1(t * 3, 21) * 0.015 * k;
  const c = local(p, 0, p.hips.y + 0.18 + height, 0.32 + p.hips.z);
  p.reach('L', c.clone().add(rotY(new THREE.Vector3(0.07, jitter, 0), p.yaw)), 1, new THREE.Vector3(1.2, -1, -0.2));
  p.reach('R', c.clone().add(rotY(new THREE.Vector3(-0.07, -jitter, 0), p.yaw)), 1, new THREE.Vector3(-1.2, -1, -0.2));
  p.set('handL', 0.3, 0, -0.5).set('handR', 0.3, 0, 0.5);
}

/** スマホを見る（片手 or 両手） */
export function holdPhone(p: Pose, t: number, side: Side, both = false, dist = 0.3, height = 0.38): void {
  const c = local(p, side === 'L' ? 0.03 : -0.03, p.hips.y + height, p.hips.z + dist);
  const thumb = noise1(t * 4, 31) * 0.005;
  p.reach(side, c.clone().add(new THREE.Vector3(0, thumb, 0)), 1, new THREE.Vector3(side === 'L' ? 1 : -1, -1.2, -0.3));
  p.set(side === 'L' ? 'handL' : 'handR', 0.6, 0, side === 'L' ? -0.4 : 0.4);
  if (both) {
    const o: Side = side === 'L' ? 'R' : 'L';
    p.reach(o, c.clone().add(rotY(new THREE.Vector3(o === 'L' ? 0.05 : -0.05, -0.01, 0), p.yaw)), 1, new THREE.Vector3(o === 'L' ? 1 : -1, -1.2, -0.3));
    p.set(o === 'L' ? 'handL' : 'handR', 0.6, 0, o === 'L' ? -0.6 : 0.6);
  }
  p.lookAt(c, 0.9);
}

/** 手を口元へ（食べる・飲む）。k=0..1 */
export function handToMouth(p: Pose, side: Side, k: number, from: THREE.Vector3): void {
  const mouth = local(p, 0, 0, 0);
  // 頭のおおよその位置
  mouth.copy(headPos(p)).add(rotY(new THREE.Vector3(side === 'L' ? 0.02 : -0.02, -0.05, 0.12), p.yaw));
  const target = from.clone().lerp(mouth, smooth(k));
  p.reach(side, target, 1, new THREE.Vector3(side === 'L' ? 1 : -1, -1, -0.2));
  p.set(side === 'L' ? 'handL' : 'handR', 0.3 + k * 0.6, 0, 0);
}

/** 頭をかく。k=0..1（腕の上がり具合） */
export function scratchHead(p: Pose, t: number, side: Side, k: number): void {
  const top = headPos(p).add(rotY(new THREE.Vector3(side === 'L' ? 0.06 : -0.06, 0.15, -0.02), p.yaw));
  const rest = local(p, side === 'L' ? 0.2 : -0.2, p.hips.y, p.hips.z + 0.1);
  const scr = new THREE.Vector3(Math.sin(t * 14) * 0.015, Math.cos(t * 14) * 0.01, 0);
  const target = rest.lerp(top.add(scr.multiplyScalar(k)), smooth(k));
  p.reach(side, target, 1, new THREE.Vector3(side === 'L' ? 1.5 : -1.5, 0.3, -0.5));
  p.set(side === 'L' ? 'handL' : 'handR', 0.8, 0, 0);
}

/** 両腕を上げて伸び。k=0..1 */
export function stretchUp(p: Pose, k: number): void {
  const e = smooth(k);
  p.set('armL', -2.6 * e, 0, 0.25 * e + 0.1 * (1 - e)).set('armR', -2.6 * e, 0, -0.25 * e - 0.1 * (1 - e));
  p.set('elbowL', -0.3 * (1 - e) - 0.25 * e).set('elbowR', -0.3 * (1 - e) - 0.25 * e);
  p.add('spine', -0.15 * e, 0, 0);
  p.add('chest', -0.1 * e, 0, 0);
  p.add('head', -0.3 * e, 0, 0);
  p.ik.L.w = 0;
  p.ik.R.w = 0;
  p.face.eyes = 1 - e * 0.85;
  if (e > 0.5) p.face.mouth = 'yawn';
}

/** ベッドに寝る。pillow=頭の位置、dir=頭→足の向き */
export function lieBed(p: Pose, pillow: THREE.Vector3, dir: THREE.Vector3, top: number, side: 'back' | 'left' | 'right'): void {
  const d = dir.clone().setY(0).normalize();
  const hip = pillow.clone().addScaledVector(d, 0.66);
  p.root.set(hip.x, 0, hip.z);
  // 腰を -90° 倒すと体の上方向がローカル -z になる → ローカル +z を足の方へ
  p.yaw = Math.atan2(d.x, d.z);
  p.hips.set(0, top + 0.1, 0);
  // 体を横倒し：腰を前に90°倒す → 腹が上を向くには -90°
  if (side === 'back') {
    p.set('hips', -Math.PI / 2, 0, 0);
    p.set('armL', 0.05, 0, 0.25).set('armR', 0.05, 0, -0.25);
    p.set('elbowL', -0.5).set('elbowR', -0.3);
    p.set('thighL', 0, 0, 0.08).set('thighR', 0.1, 0, -0.06).set('kneeR', 0.25);
    p.set('footL', 0.6).set('footR', 0.5);
    p.set('neck', 0.25).set('head', 0.15, 0.25, 0);
  } else {
    const sg = side === 'left' ? 1 : -1;
    p.set('hips', -Math.PI / 2, 0, 0);
    p.add('hips', 0, 0, sg * (Math.PI / 2));
    p.hips.y = top + 0.15;
    p.set('thighL', -0.6, 0, 0.05).set('kneeL', 0.9);
    p.set('thighR', -0.4, 0, -0.05).set('kneeR', 0.7);
    p.set('armL', -1.2, 0, 0.1).set('elbowL', -1.0);
    p.set('armR', -1.0, 0, -0.1).set('elbowR', -1.3);
    p.set('neck', 0.2, 0, sg * -0.25).set('head', 0.1, 0, sg * -0.2);
    p.set('spine', 0.15).set('chest', 0.1);
  }
  p.breath = 1.6;
}

/** 床（座椅子）に座る */
export function sitFloor(p: Pose, seat: Seat, opts: { lean?: number; legs?: 'cross' | 'out' } = {}): void {
  const lean = opts.lean ?? 0.3;
  p.root.copy(seat.pos).setY(0);
  p.yaw = seat.yaw;
  p.hips.set(0, seat.pos.y + 0.12, -0.08);
  p.set('hips', -0.25 - lean * 0.3, 0, 0);
  p.set('spine', 0.12 + lean * 0.1, 0, 0);
  p.set('chest', 0.12, 0, 0);
  p.set('neck', -0.05);
  p.set('head', 0.05);
  if ((opts.legs ?? 'cross') === 'cross') {
    // あぐら
    p.set('thighL', -1.25, 0.9, 0.35).set('kneeL', 2.3).set('footL', 0.2, 0, 0.6);
    p.set('thighR', -1.25, -0.9, -0.35).set('kneeR', 2.3).set('footR', 0.2, 0, -0.6);
  } else {
    p.set('thighL', -1.25, 0, 0.12).set('kneeL', 0.25).set('footL', 0.4);
    p.set('thighR', -1.25, 0, -0.12).set('kneeR', 0.4).set('footR', 0.4);
  }
  p.set('armL', -0.3, 0, 0.2).set('elbowL', -0.8);
  p.set('armR', -0.3, 0, -0.2).set('elbowR', -0.8);
}

/** しゃがむ（冷蔵庫など） */
export function crouch(p: Pose, k: number): void {
  const e = smooth(k);
  p.hips.y = 0.875 - e * 0.45;
  p.hips.z = -e * 0.1;
  p.add('hips', -e * 0.2, 0, 0);
  p.add('spine', e * 0.45, 0, 0);
  p.set('thighL', -e * 1.7, 0, 0.15 * e).set('thighR', -e * 1.7, 0, -0.15 * e);
  p.set('kneeL', e * 2.2).set('kneeR', e * 2.2);
  p.set('footL', -e * 0.5).set('footR', -e * 0.5);
}

/** ため息（k=0..1 の間に吸って吐く） */
export function sigh(p: Pose, k: number): void {
  const inhale = Math.sin(clamp(k / 0.4) * Math.PI * 0.5);
  const exhale = clamp((k - 0.4) / 0.6);
  const v = inhale * (1 - exhale) - exhale * (1 - exhale) * 0.8;
  p.add('chest', -v * 0.08, 0, 0);
  p.add('neck', -v * 0.1 + exhale * (1 - exhale) * 0.3, 0, 0);
  p.add('clavL', 0, 0, v * 0.08).add('clavR', 0, 0, -v * 0.08);
  if (k > 0.35 && k < 0.85) p.face.mouth = 'o';
  p.face.eyes = 1 - exhale * (1 - exhale) * 2;
  p.face.brow = 'sad';
}

export function rotY(v: THREE.Vector3, yaw: number): THREE.Vector3 {
  return v.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
}

/** 頭のおおよそのワールド位置（姿勢目標から見積もる） */
export function headPos(p: Pose): THREE.Vector3 {
  const hipsW = local(p, p.hips.x, p.hips.y, p.hips.z);
  // 腰の回転を考慮して胴体の上方向を求める
  const up = new THREE.Vector3(0, 1, 0)
    .applyQuaternion(p.q.spine)
    .applyQuaternion(p.q.hips)
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw);
  return hipsW.addScaledVector(up, 0.6);
}
