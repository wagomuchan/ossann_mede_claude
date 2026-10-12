import * as THREE from 'three';
import { JOINTS, Pose, Side } from './pose';
import { OssanRig } from './rig';
import { clamp, damp, dampAngle } from '../core/math';

// 目標の姿勢へなめらかに追従させ、IK・視線・呼吸・まばたき・表情を重ねる。

const UPPER = 0.27;
const LOWER = 0.31;

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const AXIS_X = new THREE.Vector3(1, 0, 0);

export class Animator {
  readonly cur = new Pose();
  private snapped = false;
  private ikW: Record<Side, number> = { L: 0, R: 0 };
  private ikT: Record<Side, THREE.Vector3> = { L: new THREE.Vector3(), R: new THREE.Vector3() };
  private ikPole: Record<Side, THREE.Vector3> = { L: new THREE.Vector3(1, -1, -1), R: new THREE.Vector3(-1, -1, -1) };
  private lookYaw = 0;
  private lookPitch = 0;
  private lookW = 0;
  private blinkAt = 2;
  private blink = 0;
  private eyes = 1;
  private browL = 0;
  private browR = 0;
  private browY = 0;
  private mouthOpen = 0;
  private mouthW = 1;
  private mouthY = 0;
  /** ジョイントごとの追従の速さ */
  lambda = 9;

  constructor(private rig: OssanRig) {}

  /** 次のフレームで目標姿勢へ瞬間移動 */
  snap(): void {
    this.snapped = false;
  }

  update(target: Pose, dt: number, t: number): void {
    const rig = this.rig;
    const c = this.cur;
    const first = !this.snapped;
    this.snapped = true;
    const k = first ? 1 : 1 - Math.exp(-this.lambda * dt);

    // ルート
    if (first || c.root.distanceTo(target.root) > 1.2) {
      c.root.copy(target.root);
      c.yaw = target.yaw;
    } else {
      c.root.lerp(target.root, 1 - Math.exp(-16 * dt));
      c.yaw = dampAngle(c.yaw, target.yaw, 12, dt);
    }
    rig.root.position.copy(c.root);
    rig.root.rotation.y = c.yaw;

    // 関節
    for (const j of JOINTS) {
      c.q[j].slerp(target.q[j], k);
      rig.bones[j].quaternion.copy(c.q[j]);
    }
    c.hips.lerp(target.hips, k);
    rig.bones.hips.position.copy(c.hips);

    // 呼吸（胸がふくらみ、肩が少し上下）
    const br = Math.sin(t * 1.35) * 0.5 + 0.5;
    const depth = target.breath;
    _q.setFromAxisAngle(AXIS_X, -0.025 * br * depth);
    rig.bones.chest.quaternion.multiply(_q);
    rig.bones.clavL.position.y = 0.15 + br * 0.006 * depth;
    rig.bones.clavR.position.y = 0.15 + br * 0.006 * depth;
    rig.bones.spine.scale.set(1 + br * 0.012 * depth, 1, 1 + br * 0.02 * depth);

    rig.root.updateMatrixWorld(true);

    // 視線（首と頭で分担）
    let wantYaw = 0, wantPitch = 0;
    if (target.look && target.lookW > 0) {
      const chest = rig.bones.neck;
      chest.getWorldQuaternion(_q).invert();
      rig.bones.head.getWorldPosition(_v);
      _v2.copy(target.look).sub(_v).applyQuaternion(_q);
      wantYaw = clamp(Math.atan2(_v2.x, _v2.z), -1.25, 1.25);
      wantPitch = clamp(-Math.atan2(_v2.y, Math.hypot(_v2.x, _v2.z)), -0.7, 0.8);
    }
    const lw = target.look ? target.lookW : 0;
    this.lookW = first ? lw : damp(this.lookW, lw, 4, dt);
    this.lookYaw = first ? wantYaw : damp(this.lookYaw, wantYaw, 6, dt);
    this.lookPitch = first ? wantPitch : damp(this.lookPitch, wantPitch, 6, dt);
    if (this.lookW > 0.001) {
      const y = this.lookYaw * this.lookW, p = this.lookPitch * this.lookW;
      _q.setFromEuler(new THREE.Euler(p * 0.4, y * 0.45, 0, 'YXZ'));
      rig.bones.neck.quaternion.multiply(_q);
      _q.setFromEuler(new THREE.Euler(p * 0.6, y * 0.55, 0, 'YXZ'));
      rig.bones.head.quaternion.multiply(_q);
      rig.bones.neck.updateMatrixWorld(true);
    }

    // 腕のIK
    for (const s of ['L', 'R'] as const) {
      const ik = target.ik[s];
      const was = this.ikW[s];
      this.ikW[s] = first ? ik.w : damp(was, ik.w, 7, dt);
      if (was < 0.001 || first) {
        this.ikT[s].copy(ik.target);
        this.ikPole[s].copy(ik.pole);
      } else {
        this.ikT[s].lerp(ik.target, 1 - Math.exp(-14 * dt));
        this.ikPole[s].lerp(ik.pole, 1 - Math.exp(-6 * dt));
      }
      if (this.ikW[s] > 0.001) this.solveArm(s, this.ikT[s], this.ikPole[s], this.ikW[s]);
    }

    this.updateFace(target, dt, t, first);
  }

  private solveArm(s: Side, targetW: THREE.Vector3, poleLocal: THREE.Vector3, w: number): void {
    const rig = this.rig;
    const arm = rig.bones[s === 'L' ? 'armL' : 'armR'];
    const elbow = rig.bones[s === 'L' ? 'elbowL' : 'elbowR'];
    const parent = arm.parent!;
    parent.updateMatrixWorld(true);
    const shoulder = arm.getWorldPosition(new THREE.Vector3());
    const pq = parent.getWorldQuaternion(new THREE.Quaternion()).invert();
    const d = targetW.clone().sub(shoulder).applyQuaternion(pq);
    // pole はキャラのローカル → ワールド → 親のローカル
    const pole = poleLocal.clone().applyAxisAngle(AXIS_Y, rig.root.rotation.y).applyQuaternion(pq).normalize();
    const L = clamp(d.length(), 0.08, UPPER + LOWER - 0.003);
    const dn = d.normalize();
    const cosA = clamp((UPPER * UPPER + L * L - LOWER * LOWER) / (2 * UPPER * L), -1, 1);
    const alpha = Math.acos(cosA);
    const n = new THREE.Vector3().crossVectors(dn, pole);
    if (n.lengthSq() < 1e-6) n.set(1, 0, 0);
    n.normalize();
    const u = dn.clone().applyAxisAngle(n, alpha);
    const elbowPos = u.clone().multiplyScalar(UPPER);
    const f = dn.clone().multiplyScalar(L).sub(elbowPos).normalize();
    const yAxis = u.clone().negate();
    const zAxis = f.clone().sub(u.clone().multiplyScalar(f.dot(u)));
    if (zAxis.lengthSq() < 1e-6) zAxis.copy(pole).sub(u.clone().multiplyScalar(pole.dot(u)));
    zAxis.normalize();
    const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis).normalize();
    _m.makeBasis(xAxis, yAxis, zAxis);
    _q.setFromRotationMatrix(_m);
    const bend = Math.acos(clamp(u.dot(f), -1, 1));
    _q2.setFromAxisAngle(AXIS_X, -bend);
    arm.quaternion.slerp(_q, w);
    elbow.quaternion.slerp(_q2, w);
    arm.updateMatrixWorld(true);
  }

  private updateFace(target: Pose, dt: number, t: number, first: boolean): void {
    const f = this.rig.face;
    const tf = target.face;
    // まばたき
    if (t > this.blinkAt) {
      this.blink = 1;
      this.blinkAt = t + 1.8 + Math.random() * 4.5 + tf.noBlink * 4;
      if (Math.random() < 0.15) this.blinkAt = t + 0.25; // 二度まばたき
    }
    this.blink = Math.max(0, this.blink - dt * 7);
    const blinkClose = Math.sin(Math.min(1, this.blink) * Math.PI);
    this.eyes = first ? tf.eyes : damp(this.eyes, tf.eyes, 6, dt);
    const open = clamp(this.eyes * (1 - blinkClose));
    for (const [eye, lid] of [[f.eyeL, f.lidL], [f.eyeR, f.lidR]] as const) {
      eye.scale.y = 0.013 * (0.15 + 0.85 * open);
      lid.position.y = 0.155 - (1 - open) * 0.017;
      lid.position.z = 0.116;
      lid.scale.y = 0.01 + (1 - open) * 0.006;
    }
    // 眉
    let bl = -0.08, by = 0;
    switch (tf.brow) {
      case 'sad': bl = -0.38; by = 0.003; break;
      case 'angry': bl = 0.35; by = -0.004; break;
      case 'raised': bl = -0.05; by = 0.01; break;
      case 'focus': bl = 0.18; by = -0.003; break;
    }
    this.browL = damp(this.browL, bl, 8, dt);
    this.browR = damp(this.browR, -bl, 8, dt);
    this.browY = damp(this.browY, by, 8, dt);
    f.browL.rotation.z = this.browL;
    f.browR.rotation.z = this.browR;
    f.browL.position.y = 0.168 + this.browY;
    f.browR.position.y = 0.168 + this.browY;
    // 口
    let mo = 0, mw = 1, my = 0;
    switch (tf.mouth) {
      case 'open': mo = 0.6; break;
      case 'o': mo = 0.7; mw = 0.55; break;
      case 'yawn': mo = 1.6; mw = 0.9; break;
      case 'chew': mo = Math.max(0, Math.sin(t * 9)) * 0.45; break;
      case 'frown': mw = 0.8; my = -0.003; break;
      case 'smile': mw = 1.2; my = 0.002; break;
      case 'grit': mw = 1.3; break;
    }
    this.mouthOpen = damp(this.mouthOpen, mo, 14, dt);
    this.mouthW = damp(this.mouthW, mw, 10, dt);
    this.mouthY = damp(this.mouthY, my, 10, dt);
    f.mouthOpen.visible = this.mouthOpen > 0.05;
    f.mouthOpen.scale.set(0.016 * this.mouthW, 0.012 * this.mouthOpen, 0.006);
    f.mouth.visible = this.mouthOpen < 0.25;
    f.mouth.scale.x = this.mouthW;
    f.mouth.position.y = 0.066 + this.mouthY;
  }
}
