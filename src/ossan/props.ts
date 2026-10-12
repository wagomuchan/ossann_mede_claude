import * as THREE from 'three';
import { OssanRig } from './rig';
import { fabricTexture } from '../world/textures';
import { makeTrashBag } from '../world/furniture';

// 手に持つ小道具。毎フレーム activity が「どこにあるか」を指定する。

export type PropName =
  | 'phone' | 'controller' | 'noodle' | 'chopsticks' | 'can' | 'bottle' | 'konbiniBag' | 'deliveryBag'
  | 'trashBag' | 'snack' | 'tonic' | 'bento' | 'pizza' | 'laundryBasket' | 'tissue' | 'popsicle' | 'mikan';

type Placement =
  | { kind: 'hold'; side: 'L' | 'R'; pos: THREE.Vector3; rot: THREE.Euler }
  | { kind: 'world'; pos: THREE.Vector3; rotY: number };

function sm(color: string, opts: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...opts });
}
function mk(g: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export class Props {
  readonly items: Record<PropName, THREE.Object3D>;
  readonly phoneScreen: THREE.MeshStandardMaterial;
  private place = new Map<PropName, Placement>();
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene, private rig: OssanRig) {
    this.scene = scene;
    const I = {} as Record<PropName, THREE.Object3D>;
    const g = (name: PropName, ...children: THREE.Object3D[]) => {
      const o = new THREE.Group();
      o.name = name;
      children.forEach((c) => o.add(c));
      o.visible = false;
      scene.add(o);
      I[name] = o;
      return o;
    };
    // スマホ（画面は手のひら側＝+z、持つと顔へ向く）
    this.phoneScreen = new THREE.MeshStandardMaterial({ color: '#000', emissive: '#cfe0ff', emissiveIntensity: 1.2 });
    const phoneBody = mk(new THREE.BoxGeometry(0.072, 0.15, 0.009), sm('#1b1b1e', { roughness: 0.3, metalness: 0.4 }));
    const phoneScr = mk(new THREE.PlaneGeometry(0.064, 0.138), this.phoneScreen, 0, 0, 0.0047);
    phoneScr.castShadow = false;
    g('phone', phoneBody, phoneScr);
    // コントローラー
    const ctl = sm('#2a2b30', { roughness: 0.4 });
    const ctlBody = mk(new THREE.BoxGeometry(0.15, 0.025, 0.065), ctl);
    const gripL = mk(new THREE.CapsuleGeometry(0.019, 0.05, 4, 8), ctl, 0.055, -0.012, -0.03);
    gripL.rotation.x = 1.2;
    const gripR = gripL.clone();
    gripR.position.x = -0.055;
    const lightBar = mk(new THREE.BoxGeometry(0.06, 0.004, 0.004), sm('#000', { emissive: '#3a8aff', emissiveIntensity: 2 }), 0, 0.012, 0.033);
    g('controller', ctlBody, gripL, gripR, lightBar);
    // カップ麺
    const cup = mk(new THREE.CylinderGeometry(0.052, 0.04, 0.1, 16).translate(0, 0.05, 0), sm('#d63a2f', { roughness: 0.5 }));
    const lid = mk(new THREE.CylinderGeometry(0.054, 0.054, 0.004, 16).translate(0, 0.102, 0), sm('#efe6d2', { roughness: 0.4, metalness: 0.3 }));
    lid.name = 'lid';
    const soup = mk(new THREE.CircleGeometry(0.048, 16).rotateX(-Math.PI / 2).translate(0, 0.09, 0), sm('#b5803a', { roughness: 0.3 }));
    g('noodle', cup, lid, soup);
    // 箸
    const wood = sm('#c9a46a');
    g('chopsticks', mk(new THREE.BoxGeometry(0.005, 0.2, 0.005), wood, 0.004, -0.05, 0), mk(new THREE.BoxGeometry(0.005, 0.2, 0.005), wood, -0.004, -0.05, 0.004));
    // 缶（チューハイ）
    g('can', mk(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 14), sm('#c8d4e0', { metalness: 0.7, roughness: 0.25 })), mk(new THREE.CylinderGeometry(0.0305, 0.0305, 0.05, 14), sm('#e04a6a', { metalness: 0.4, roughness: 0.3 }), 0, -0.01, 0));
    // ペットボトル
    g('bottle', mk(new THREE.CylinderGeometry(0.032, 0.032, 0.18, 14), new THREE.MeshPhysicalMaterial({ color: '#e8f3ef', roughness: 0.05, transparent: true, opacity: 0.6 })), mk(new THREE.CylinderGeometry(0.015, 0.015, 0.02, 10), sm('#2a6a3a'), 0, 0.1, 0), mk(new THREE.CylinderGeometry(0.033, 0.033, 0.05, 14), sm('#3a8a4a'), 0, 0, 0));
    // コンビニ袋
    const bagMat = new THREE.MeshPhysicalMaterial({ color: '#f4f4f0', roughness: 0.5, transparent: true, opacity: 0.88 });
    const bag = mk(new THREE.SphereGeometry(0.13, 12, 10), bagMat, 0, -0.16, 0);
    bag.scale.set(1, 1.1, 0.75);
    const handle = mk(new THREE.TorusGeometry(0.035, 0.008, 6, 12, Math.PI), bagMat, 0, -0.03, 0);
    g('konbiniBag', bag, handle);
    // 出前の袋
    g('deliveryBag', mk(new THREE.BoxGeometry(0.26, 0.2, 0.16).translate(0, -0.12, 0), sm('#c9a271', { roughness: 0.9 })), mk(new THREE.BoxGeometry(0.1, 0.03, 0.01), sm('#c9a271'), 0, -0.01, 0));
    // ゴミ袋
    // 結び目を持ってぶら下げる
    const tb = makeTrashBag(5);
    tb.position.set(0, -0.32, 0);
    g('trashBag', tb);
    // スナック菓子
    g('snack', mk(new THREE.BoxGeometry(0.15, 0.2, 0.04), sm('#e8a21e', { roughness: 0.35, metalness: 0.3 }), 0, -0.06, 0));
    // 育毛剤
    g('tonic', mk(new THREE.CylinderGeometry(0.022, 0.025, 0.13, 12), sm('#1d2b4a', { roughness: 0.25, metalness: 0.3 })), mk(new THREE.CylinderGeometry(0.01, 0.014, 0.03, 10), sm('#e6e6e6'), 0, 0.078, 0));
    // 弁当
    g('bento', mk(new THREE.BoxGeometry(0.2, 0.04, 0.15), sm('#1a1a1a', { roughness: 0.4 })), mk(new THREE.BoxGeometry(0.19, 0.005, 0.14), new THREE.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, roughness: 0.05 }), 0, 0.022, 0), mk(new THREE.BoxGeometry(0.08, 0.02, 0.12), sm('#f4efe2'), -0.04, 0.02, 0), mk(new THREE.BoxGeometry(0.07, 0.025, 0.06), sm('#a8562a'), 0.05, 0.02, -0.03));
    // ピザ
    const pz = mk(new THREE.BoxGeometry(0.34, 0.04, 0.34), sm('#e9dfcc', { roughness: 0.9 }));
    const pzIn = mk(new THREE.CylinderGeometry(0.15, 0.15, 0.01, 18), sm('#d8862e'), 0, 0.025, 0);
    g('pizza', pz, pzIn);
    // 洗濯かご
    const basket = mk(new THREE.CylinderGeometry(0.2, 0.17, 0.2, 14, 1, true).translate(0, -0.12, 0), sm('#5ba4c8', { side: THREE.DoubleSide }));
    const clothes = mk(new THREE.SphereGeometry(0.17, 10, 8), new THREE.MeshStandardMaterial({ map: fabricTexture('#7a8a9a', 81), roughness: 1 }), 0, -0.06, 0);
    clothes.scale.y = 0.4;
    g('laundryBasket', basket, clothes);
    // ティッシュ
    g('tissue', mk(new THREE.SphereGeometry(0.025, 6, 5), sm('#ffffff', { roughness: 1 })));
    // アイス
    g('popsicle', mk(new THREE.BoxGeometry(0.045, 0.07, 0.018).translate(0, 0.05, 0), sm('#8fd0ff', { roughness: 0.3 })), mk(new THREE.BoxGeometry(0.008, 0.05, 0.003), sm('#d9b98a'), 0, -0.005, 0));
    // みかん
    g('mikan', mk(new THREE.SphereGeometry(0.035, 10, 8), sm('#f08a1c')));
    this.items = I;
  }

  /** 毎フレームの最初に呼ぶ */
  clear(): void {
    this.place.clear();
  }

  hold(name: PropName, side: 'L' | 'R', pos: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0]): void {
    this.place.set(name, { kind: 'hold', side, pos: new THREE.Vector3(...pos), rot: new THREE.Euler(...rot) });
  }

  put(name: PropName, pos: THREE.Vector3, rotY = 0): void {
    this.place.set(name, { kind: 'world', pos: pos.clone(), rotY });
  }

  apply(): void {
    for (const [name, obj] of Object.entries(this.items) as [PropName, THREE.Object3D][]) {
      const p = this.place.get(name);
      if (!p) {
        obj.visible = false;
        continue;
      }
      obj.visible = true;
      if (p.kind === 'hold') {
        const grip = this.rig.grip[p.side];
        if (obj.parent !== grip) grip.add(obj);
        obj.position.copy(p.pos);
        obj.rotation.copy(p.rot);
      } else {
        if (obj.parent !== this.scene) this.scene.add(obj);
        obj.position.copy(p.pos);
        obj.rotation.set(0, p.rotY, 0);
      }
    }
  }
}
