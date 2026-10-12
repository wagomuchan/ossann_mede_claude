import * as THREE from 'three';
import { OssanRig } from './rig';
import { Animator } from './animator';
import { Pose } from './pose';
import { Props } from './props';

export class Ossan {
  readonly rig = new OssanRig();
  readonly anim: Animator;
  readonly pose = new Pose();
  readonly props: Props;

  constructor(scene: THREE.Scene) {
    scene.add(this.rig.root);
    this.anim = new Animator(this.rig);
    this.props = new Props(scene, this.rig);
  }

  /** フレームの最初：目標姿勢を初期化 */
  begin(): Pose {
    this.pose.reset();
    this.props.clear();
    return this.pose;
  }

  end(dt: number, t: number): void {
    this.anim.update(this.pose, dt, t);
    this.props.apply();
  }

  set visible(v: boolean) {
    this.rig.root.visible = v;
  }
}
