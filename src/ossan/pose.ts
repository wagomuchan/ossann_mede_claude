import * as THREE from 'three';

// 姿勢データ。キャラは +z を向き、+x が本人の左。
// 回転の目安：前屈=+x、うなずき=+x、腕を前に=-x、肘を曲げる=-x、太ももを前に=-x、膝を曲げる=+x、
// 左腕を横に上げる=+z、右腕=-z。

export const JOINTS = [
  'hips', 'spine', 'chest', 'neck', 'head',
  'clavL', 'clavR', 'armL', 'armR', 'elbowL', 'elbowR', 'handL', 'handR',
  'thighL', 'thighR', 'kneeL', 'kneeR', 'footL', 'footR',
] as const;
export type Joint = (typeof JOINTS)[number];

export type Side = 'L' | 'R';

export interface ArmIK {
  /** 0..1 IKの効き具合 */
  w: number;
  /** 目標位置（ワールド座標） */
  target: THREE.Vector3;
  /** 肘を向けたい方向（キャラのローカル座標） */
  pole: THREE.Vector3;
}

export type Brow = 'neutral' | 'sad' | 'angry' | 'raised' | 'focus';
export type Mouth = 'neutral' | 'open' | 'frown' | 'smile' | 'chew' | 'o' | 'yawn' | 'grit';

export interface Face {
  brow: Brow;
  mouth: Mouth;
  /** 目の開き 0..1（1=普通） */
  eyes: number;
  /** 0..1 まばたきを止める（集中） */
  noBlink: number;
}

const _e = new THREE.Euler();

export class Pose {
  readonly q: Record<Joint, THREE.Quaternion>;
  /** 腰の位置（ルートからのローカル） */
  readonly hips = new THREE.Vector3(0, 0.88, 0);
  /** ルートのワールド位置と向き */
  readonly root = new THREE.Vector3();
  yaw = 0;
  readonly ik: Record<Side, ArmIK> = {
    L: { w: 0, target: new THREE.Vector3(), pole: new THREE.Vector3(1, -1, -1) },
    R: { w: 0, target: new THREE.Vector3(), pole: new THREE.Vector3(-1, -1, -1) },
  };
  /** 視線の先（ワールド）。null なら正面 */
  look: THREE.Vector3 | null = null;
  lookW = 0;
  readonly face: Face = { brow: 'neutral', mouth: 'neutral', eyes: 1, noBlink: 0 };
  /** 呼吸の深さ（1=普通） */
  breath = 1;

  constructor() {
    this.q = {} as Record<Joint, THREE.Quaternion>;
    for (const j of JOINTS) this.q[j] = new THREE.Quaternion();
  }

  /** 立ち姿勢に戻す（ルート位置は保持） */
  reset(): this {
    for (const j of JOINTS) this.q[j].identity();
    this.hips.set(0, 0.88, 0);
    this.set('armL', 0.05, 0, 0.12).set('armR', 0.05, 0, -0.12);
    this.set('elbowL', -0.15, 0, 0).set('elbowR', -0.15, 0, 0);
    this.ik.L.w = 0;
    this.ik.R.w = 0;
    this.look = null;
    this.lookW = 0;
    this.face.brow = 'neutral';
    this.face.mouth = 'neutral';
    this.face.eyes = 1;
    this.face.noBlink = 0;
    this.breath = 1;
    return this;
  }

  set(j: Joint, x: number, y = 0, z = 0): this {
    this.q[j].setFromEuler(_e.set(x, y, z, 'YXZ'));
    return this;
  }

  /** 既存の回転に重ねる */
  add(j: Joint, x: number, y = 0, z = 0): this {
    const d = new THREE.Quaternion().setFromEuler(_e.set(x, y, z, 'YXZ'));
    this.q[j].multiply(d);
    return this;
  }

  copy(o: Pose): this {
    for (const j of JOINTS) this.q[j].copy(o.q[j]);
    this.hips.copy(o.hips);
    this.root.copy(o.root);
    this.yaw = o.yaw;
    for (const s of ['L', 'R'] as const) {
      this.ik[s].w = o.ik[s].w;
      this.ik[s].target.copy(o.ik[s].target);
      this.ik[s].pole.copy(o.ik[s].pole);
    }
    this.look = o.look ? o.look.clone() : null;
    this.lookW = o.lookW;
    Object.assign(this.face, o.face);
    this.breath = o.breath;
    return this;
  }

  reach(side: Side, target: THREE.Vector3, w = 1, pole?: THREE.Vector3): this {
    const ik = this.ik[side];
    ik.w = w;
    ik.target.copy(target);
    if (pole) ik.pole.copy(pole);
    else ik.pole.set(side === 'L' ? 1 : -1, -1, -1.2);
    return this;
  }

  lookAt(p: THREE.Vector3, w = 1): this {
    this.look = p.clone();
    this.lookW = w;
    return this;
  }
}
