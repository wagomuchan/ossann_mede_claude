import * as THREE from 'three';
import { JOINTS, Joint } from './pose';
import { buildHair } from './hair';
import { Ring, tubeGeometry, updateTube } from './tube';
import { fabricTexture } from '../world/textures';

// おっさんのモデルと骨組み。すべてコードで生成。
// キャラは +z を向く。+x が本人の左。胴体・腕・脚はスキンメッシュで、関節に切れ目が出ない。

export type Outfit = 'tshirt' | 'shirt';

const HEAD_R = 0.118;
const J = Object.fromEntries(JOINTS.map((j, i) => [j, i])) as Record<Joint, number>;

function m(color: string, opts: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...opts });
}

function mesh(g: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh {
  const me = new THREE.Mesh(g, mat);
  me.castShadow = true;
  me.receiveShadow = true;
  return me;
}

function ellipsoid(rx: number, ry: number, rz: number, mat: THREE.Material, ws = 24, hs = 18): THREE.Mesh {
  const me = mesh(new THREE.SphereGeometry(1, ws, hs), mat);
  me.scale.set(rx, ry, rz);
  return me;
}

// ---------- 静止姿勢のリング定義 ----------

function torsoRings(b: number): Ring[] {
  const H = J.hips, S = J.spine, C = J.chest;
  return [
    { y: 1.352, rx: 0.068, rz: 0.062, z: -0.01, w: [C, C, 0] },
    { y: 1.338, rx: 0.13, rz: 0.092, z: -0.01, w: [C, C, 0] },
    { y: 1.312, rx: 0.188, rz: 0.118, z: -0.01, w: [C, C, 0] },
    { y: 1.255, rx: 0.193, rz: 0.133 + b * 0.005, z: -0.008, w: [C, C, 0] },
    { y: 1.185, rx: 0.192 + b * 0.008, rz: 0.148 + b * 0.012, z: 0.0, w: [S, C, 0.8] },
    { y: 1.11, rx: 0.192 + b * 0.014, rz: 0.163 + b * 0.03, z: 0.022 + b * 0.022, w: [S, C, 0.35] },
    { y: 1.035, rx: 0.194 + b * 0.02, rz: 0.176 + b * 0.05, z: 0.035 + b * 0.04, w: [S, S, 0] },
    { y: 0.965, rx: 0.192 + b * 0.016, rz: 0.172 + b * 0.04, z: 0.03 + b * 0.032, w: [H, S, 0.6] },
    { y: 0.905, rx: 0.188 + b * 0.008, rz: 0.158 + b * 0.016, z: 0.012 + b * 0.012, w: [H, S, 0.25] },
    { y: 0.885, rx: 0.19 + b * 0.008, rz: 0.16 + b * 0.016, z: 0.012 + b * 0.012, w: [H, H, 0] },
  ];
}

function pantsRings(b: number): Ring[] {
  const H = J.hips;
  return [
    { y: 0.93, rx: 0.176 + b * 0.006, rz: 0.148 + b * 0.012, z: 0.008 + b * 0.008, w: [H, H, 0] },
    { y: 0.86, rx: 0.172, rz: 0.142, z: 0.0, w: [H, H, 0] },
    { y: 0.79, rx: 0.155, rz: 0.128, z: -0.005, w: [H, H, 0] },
  ];
}

function armRings(side: 1 | -1, scale = 0, top = 1.35, bottom = 0.8): Ring[] {
  const s = side === 1 ? 'L' : 'R';
  const clav = J[`clav${s}` as Joint], arm = J[`arm${s}` as Joint], elb = J[`elbow${s}` as Joint], hand = J[`hand${s}` as Joint];
  const x = 0.195 * side;
  const all: Ring[] = [
    { y: 1.29, rx: 0.06, rz: 0.058, w: [clav, arm, 0.85] },
    { y: 1.2, rx: 0.058, rz: 0.056, w: [arm, arm, 0] },
    { y: 1.1, rx: 0.051, rz: 0.05, w: [arm, arm, 0] },
    { y: 1.045, rx: 0.047, rz: 0.046, w: [arm, elb, 0.5] },
    { y: 0.995, rx: 0.046, rz: 0.044, w: [arm, elb, 0.92] },
    { y: 0.9, rx: 0.043, rz: 0.04, w: [elb, elb, 0] },
    { y: 0.8, rx: 0.034, rz: 0.03, w: [elb, hand, 0.25] },
  ];
  return all
    .filter((r) => r.y <= top + 1e-6 && r.y >= bottom - 1e-6)
    .map((r) => ({ ...r, x, z: -0.01, rx: r.rx + scale, rz: r.rz + scale }));
}

function legRings(side: 1 | -1, scale = 0): Ring[] {
  const s = side === 1 ? 'L' : 'R';
  const th = J[`thigh${s}` as Joint], kn = J[`knee${s}` as Joint];
  const x = 0.095 * side;
  return [
    { y: 0.9, rx: 0.086, rz: 0.09, w: [J.hips, th, 0.5] },
    { y: 0.8, rx: 0.088, rz: 0.092, w: [J.hips, th, 0.9] },
    { y: 0.64, rx: 0.077, rz: 0.08, w: [th, th, 0] },
    { y: 0.5, rx: 0.066, rz: 0.066, w: [th, th, 0] },
    { y: 0.44, rx: 0.062, rz: 0.064, w: [th, kn, 0.5] },
    { y: 0.38, rx: 0.059, rz: 0.06, w: [th, kn, 0.92] },
    { y: 0.24, rx: 0.054, rz: 0.054, w: [kn, kn, 0] },
    { y: 0.09, rx: 0.048, rz: 0.048, w: [kn, kn, 0] },
  ].map((r) => ({ ...r, x: x + (r.y > 0.7 ? 0 : 0), rx: r.rx + scale, rz: r.rz + scale })) as Ring[];
}

function neckRings(): Ring[] {
  return [
    { y: 1.45, rx: 0.056, rz: 0.058, z: 0.005, w: [J.neck, J.head, 0.8] },
    { y: 1.39, rx: 0.06, rz: 0.062, z: -0.002, w: [J.neck, J.neck, 0] },
    { y: 1.33, rx: 0.066, rz: 0.066, z: -0.01, w: [J.chest, J.neck, 0.3] },
  ];
}

export class OssanRig {
  readonly root = new THREE.Group();
  readonly bones: Record<Joint, THREE.Bone>;
  readonly skeleton: THREE.Skeleton;
  readonly headTop = new THREE.Object3D();
  readonly mats: {
    skin: THREE.MeshStandardMaterial;
    top: THREE.MeshStandardMaterial;
    pants: THREE.MeshStandardMaterial;
    hair: THREE.MeshStandardMaterial;
    hairThin: THREE.MeshStandardMaterial;
    stubble: THREE.MeshStandardMaterial;
    lens: THREE.MeshStandardMaterial;
    socks: THREE.MeshStandardMaterial;
    hanten: THREE.MeshStandardMaterial;
  };
  readonly face: {
    eyeL: THREE.Mesh; eyeR: THREE.Mesh;
    lidL: THREE.Mesh; lidR: THREE.Mesh;
    browL: THREE.Mesh; browR: THREE.Mesh;
    mouth: THREE.Mesh; mouthOpen: THREE.Mesh;
    glasses: THREE.Group;
  };
  readonly hand: Record<'L' | 'R', THREE.Object3D>;
  readonly grip: Record<'L' | 'R', THREE.Object3D>;
  readonly neckTowel: THREE.Mesh;
  private torso: THREE.SkinnedMesh;
  private pants: THREE.SkinnedMesh;
  private hantenBody: THREE.SkinnedMesh;
  private hairMesh: THREE.Mesh;
  private hairLevel = -1;
  private weight = -1;
  private collar: THREE.Group;
  private longSleeves: THREE.Object3D[] = [];
  private shortSleeves: THREE.Object3D[] = [];
  private hantenParts: THREE.Object3D[] = [];
  private tshirtPrint: THREE.Mesh;

  constructor() {
    this.root.name = 'ossan';
    const skin = m('#e0aa86', { roughness: 0.6 });
    const top = new THREE.MeshStandardMaterial({ map: fabricTexture('#6b7280', 61), roughness: 0.92 });
    const pants = new THREE.MeshStandardMaterial({ map: fabricTexture('#3a3d44', 62), roughness: 0.95 });
    const hair = m('#3b3532', { roughness: 0.95, vertexColors: true, transparent: true, depthWrite: false });
    const hairThin = hair;
    const stubble = m('#4a3a32', { roughness: 1, transparent: true, opacity: 0, depthWrite: false });
    const lens = new THREE.MeshStandardMaterial({ color: '#a8c0d8', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.22, emissive: '#000000' });
    const socks = m('#55585e', { roughness: 0.95 });
    const hanten = new THREE.MeshStandardMaterial({ map: fabricTexture('#2f4a6e', 63, true), roughness: 0.95 });
    this.mats = { skin, top, pants, hair, hairThin, stubble, lens, socks, hanten };

    // ---- 骨 ----
    const B = {} as Record<Joint, THREE.Bone>;
    const bone = (name: Joint, parent: THREE.Object3D, x: number, y: number, z: number) => {
      const o = new THREE.Bone();
      o.name = name;
      o.position.set(x, y, z);
      parent.add(o);
      B[name] = o;
      return o;
    };
    const hips = bone('hips', this.root, 0, 0.88, 0);
    const spine = bone('spine', hips, 0, 0.07, 0);
    const chest = bone('chest', spine, 0, 0.2, 0);
    const neck = bone('neck', chest, 0, 0.19, -0.01);
    const head = bone('head', neck, 0, 0.055, 0.015);
    const clavL = bone('clavL', chest, 0.06, 0.15, -0.01);
    const clavR = bone('clavR', chest, -0.06, 0.15, -0.01);
    const armL = bone('armL', clavL, 0.135, 0, 0);
    const armR = bone('armR', clavR, -0.135, 0, 0);
    const elbowL = bone('elbowL', armL, 0, -0.27, 0);
    const elbowR = bone('elbowR', armR, 0, -0.27, 0);
    const handL = bone('handL', elbowL, 0, -0.25, 0);
    const handR = bone('handR', elbowR, 0, -0.25, 0);
    const thighL = bone('thighL', hips, 0.095, -0.03, 0);
    const thighR = bone('thighR', hips, -0.095, -0.03, 0);
    const kneeL = bone('kneeL', thighL, 0, -0.42, 0);
    const kneeR = bone('kneeR', thighR, 0, -0.42, 0);
    const footL = bone('footL', kneeL, 0, -0.39, 0);
    const footR = bone('footR', kneeR, 0, -0.39, 0);
    this.bones = B;
    this.root.updateMatrixWorld(true);
    this.skeleton = new THREE.Skeleton(JOINTS.map((j) => B[j]));

    const skinned = (g: THREE.BufferGeometry, mat: THREE.Material) => {
      const sm = new THREE.SkinnedMesh(g, mat);
      sm.castShadow = true;
      sm.receiveShadow = true;
      sm.frustumCulled = false;
      this.root.add(sm);
      sm.bind(this.skeleton);
      return sm;
    };

    // ---- 胴体（Tシャツ）・ズボン ----
    this.torso = skinned(tubeGeometry(torsoRings(0.5), true, false), top);
    this.pants = skinned(tubeGeometry(pantsRings(0.5), false, true), pants);
    skinned(tubeGeometry(neckRings(), false, false), skin);
    // Tシャツのプリント（架空のゲームのロゴ）
    this.tshirtPrint = mesh(new THREE.CircleGeometry(0.045, 16), m('#d8d2c4', { roughness: 0.9 }));
    this.tshirtPrint.position.set(0, 0.05, 0.142);
    this.tshirtPrint.rotation.x = -0.1;
    this.tshirtPrint.castShadow = false;
    chest.add(this.tshirtPrint);

    // 襟（シャツ用）
    this.collar = new THREE.Group();
    const collarMat = m('#dfe9f5', { roughness: 0.7 });
    for (const s of [-1, 1]) {
      const c = mesh(new THREE.BoxGeometry(0.065, 0.032, 0.008), collarMat);
      c.position.set(s * 0.04, 0.19, 0.075);
      c.rotation.set(-0.6, s * -0.55, s * 0.45);
      this.collar.add(c);
    }
    const band = mesh(new THREE.TorusGeometry(0.06, 0.011, 6, 16), collarMat);
    band.rotation.x = Math.PI / 2 - 0.25;
    band.position.set(0, 0.2, 0.0);
    this.collar.add(band);
    for (let i = 0; i < 3; i++) {
      const b = mesh(new THREE.SphereGeometry(0.005, 6, 4), m('#f4f4f4'));
      b.position.set(0, 0.11 - i * 0.075, 0.137 + (i === 2 ? 0.03 : i * 0.012));
      this.collar.add(b);
    }
    chest.add(this.collar);

    // ---- 頭 ----
    // 頭：ひとつの球を変形して、頬・あご・二重あごまでつなげる（継ぎ目なし）
    const skull = mesh(headGeometry(), skin);
    skull.position.set(0, 0.14, 0);
    head.add(skull);
    const stub = mesh(headGeometry(1.012, true), stubble);
    stub.position.copy(skull.position);
    stub.castShadow = false;
    head.add(stub);
    for (const s of [-1, 1]) {
      const ear = ellipsoid(0.014, 0.034, 0.024, skin, 10, 8);
      ear.position.set(s * 0.117, 0.122, -0.008);
      ear.rotation.y = s * 0.3;
      head.add(ear);
    }
    const nose = ellipsoid(0.021, 0.024, 0.026, m('#d99878', { roughness: 0.55 }), 12, 10);
    nose.position.set(0, 0.11, 0.117);
    head.add(nose);
    const eyeMat = m('#1d1612', { roughness: 0.3 });
    const eyeL = ellipsoid(0.0105, 0.013, 0.006, eyeMat, 10, 8);
    const eyeR = ellipsoid(0.0105, 0.013, 0.006, eyeMat, 10, 8);
    eyeL.position.set(0.04, 0.135, 0.115);
    eyeR.position.set(-0.04, 0.135, 0.115);
    eyeL.castShadow = eyeR.castShadow = false;
    head.add(eyeL, eyeR);
    const lidL = ellipsoid(0.016, 0.01, 0.008, skin, 10, 6);
    const lidR = ellipsoid(0.016, 0.01, 0.008, skin, 10, 6);
    lidL.position.set(0.04, 0.155, 0.116);
    lidR.position.set(-0.04, 0.155, 0.116);
    head.add(lidL, lidR);
    // 目の下のくま
    for (const s of [-1, 1]) {
      const bag = ellipsoid(0.017, 0.006, 0.005, m('#c48f72', { roughness: 0.7 }), 10, 6);
      bag.position.set(s * 0.04, 0.121, 0.116);
      bag.castShadow = false;
      head.add(bag);
    }
    const browMat = m('#2e2824', { roughness: 0.9 });
    const browL = mesh(new THREE.BoxGeometry(0.038, 0.008, 0.008), browMat);
    const browR = mesh(new THREE.BoxGeometry(0.038, 0.008, 0.008), browMat);
    browL.position.set(0.042, 0.168, 0.113);
    browR.position.set(-0.042, 0.168, 0.113);
    head.add(browL, browR);
    const mouth = mesh(new THREE.BoxGeometry(0.036, 0.005, 0.006), m('#7a4238', { roughness: 0.6 }));
    mouth.position.set(0, 0.066, 0.117);
    mouth.castShadow = false;
    const mouthOpen = ellipsoid(0.016, 0.012, 0.006, m('#3a1a16', { roughness: 0.8 }), 12, 8);
    mouthOpen.position.set(0, 0.066, 0.115);
    mouthOpen.visible = false;
    head.add(mouth, mouthOpen);
    // 眼鏡
    const glasses = new THREE.Group();
    const frameMat = m('#1a1a1a', { roughness: 0.35, metalness: 0.3 });
    for (const s of [-1, 1]) {
      const rim = mesh(new THREE.TorusGeometry(0.023, 0.0028, 6, 18), frameMat);
      rim.scale.set(1.18, 0.85, 1);
      rim.position.set(s * 0.041, 0.137, 0.126);
      glasses.add(rim);
      const lensM = new THREE.Mesh(new THREE.CircleGeometry(0.023, 18), lens);
      lensM.scale.set(1.18, 0.85, 1);
      lensM.position.set(s * 0.041, 0.137, 0.1262);
      glasses.add(lensM);
      const temple = mesh(new THREE.BoxGeometry(0.004, 0.004, 0.14), frameMat);
      temple.position.set(s * 0.095, 0.14, 0.06);
      temple.rotation.y = -s * 0.33;
      glasses.add(temple);
    }
    const bridge = mesh(new THREE.BoxGeometry(0.022, 0.004, 0.004), frameMat);
    bridge.position.set(0, 0.142, 0.128);
    glasses.add(bridge);
    head.add(glasses);
    // 髪
    this.hairMesh = new THREE.Mesh(new THREE.BufferGeometry(), hair);
    this.hairMesh.position.copy(skull.position);
    this.hairMesh.scale.set(1, 1.06, 1.02);
    this.hairMesh.renderOrder = 2;
    head.add(this.hairMesh);
    this.headTop.position.set(0, 0.27, -0.02);
    head.add(this.headTop);
    this.face = { eyeL, eyeR, lidL, lidR, browL, browR, mouth, mouthOpen, glasses };

    // ---- 腕 ----
    for (const side of [1, -1] as const) {
      skinned(tubeGeometry(armRings(side)), skin);
      const short = skinned(tubeGeometry(flare(armRings(side, 0.009, 1.35, 1.2), 0.006), true, false), top);
      this.shortSleeves.push(short);
      const long = skinned(tubeGeometry(flare(armRings(side, 0.007, 1.35, 0.8), 0.004), true, false), top);
      long.visible = false;
      this.longSleeves.push(long);
      const hs = skinned(tubeGeometry(flare(armRings(side, 0.024, 1.35, 0.9), 0.02), true, false), hanten);
      hs.visible = false;
      this.hantenParts.push(hs);
    }
    const grips = {} as Record<'L' | 'R', THREE.Object3D>;
    const hands = { L: handL, R: handR } as Record<'L' | 'R', THREE.Object3D>;
    for (const s of ['L', 'R'] as const) {
      const sg = s === 'L' ? 1 : -1;
      const hand = hands[s];
      const palm = mesh(new THREE.BoxGeometry(0.036, 0.095, 0.078, 1, 2, 2), skin);
      roundify(palm.geometry, 0.016);
      palm.position.set(0, -0.05, 0.005);
      hand.add(palm);
      const thumb = mesh(new THREE.CapsuleGeometry(0.012, 0.03, 4, 8), skin);
      thumb.position.set(sg * 0.008, -0.03, 0.04);
      thumb.rotation.set(0.7, 0, sg * 0.3);
      hand.add(thumb);
      const grip = new THREE.Object3D();
      grip.position.set(0, -0.065, 0.012);
      hand.add(grip);
      grips[s] = grip;
    }
    this.grip = grips;
    this.hand = hands;

    // ---- 脚 ----
    for (const side of [1, -1] as const) skinned(tubeGeometry(legRings(side)), pants);
    for (const foot of [footL, footR]) {
      const ft = mesh(new THREE.BoxGeometry(0.09, 0.065, 0.23, 2, 1, 3), socks);
      roundify(ft.geometry, 0.028);
      ft.position.set(0, -0.022, 0.05);
      foot.add(ft);
    }

    // ---- 半纏（冬） ----
    this.hantenBody = skinned(tubeGeometry(hantenRings(0.5), false, false), hanten);
    const hCollar = mesh(new THREE.TorusGeometry(0.085, 0.022, 6, 18), m('#1e2f48', { roughness: 0.9 }));
    hCollar.rotation.x = Math.PI / 2 - 0.35;
    hCollar.position.set(0, 0.19, 0.0);
    chest.add(hCollar);
    this.hantenParts.push(this.hantenBody, hCollar);
    this.hantenParts.forEach((p) => (p.visible = false));

    // 首に掛けるタオル（風呂上がり）
    this.neckTowel = mesh(new THREE.TorusGeometry(0.088, 0.022, 6, 20, Math.PI * 1.3), new THREE.MeshStandardMaterial({ map: fabricTexture('#f0ead8', 64), roughness: 1 }));
    this.neckTowel.rotation.set(Math.PI / 2 - 0.3, 0, Math.PI * 1.35);
    this.neckTowel.position.set(0, 0.2, 0.0);
    this.neckTowel.visible = false;
    chest.add(this.neckTowel);

    this.setHair(0.68);
    this.setWeight(0.5);
    this.setOutfit('tshirt', '#6b7280', true);
  }

  setHair(level: number): void {
    const q = Math.round(level * 100) / 100;
    if (q === this.hairLevel) return;
    this.hairLevel = q;
    this.hairMesh.geometry.dispose();
    this.hairMesh.geometry = buildHair(q, HEAD_R * 1.005);
  }

  /** w: 0=ふつう 1=かなり太め */
  setWeight(w: number): void {
    const q = Math.round(w * 50) / 50;
    if (q === this.weight) return;
    this.weight = q;
    updateTube(this.torso.geometry, torsoRings(q), true, false);
    updateTube(this.pants.geometry, pantsRings(q), false, true);
    updateTube(this.hantenBody.geometry, hantenRings(q), false, false);
  }

  setOutfit(o: Outfit, topColor: string, print: boolean): void {
    const shirt = o === 'shirt';
    this.collar.visible = shirt;
    this.longSleeves.forEach((s) => (s.visible = shirt));
    this.shortSleeves.forEach((s) => (s.visible = !shirt));
    const col = shirt ? '#c9dcf0' : topColor;
    const tex = fabricTexture(col, shirt ? 71 : 61);
    if (this.mats.top.map !== tex) {
      this.mats.top.map = tex;
      this.mats.top.needsUpdate = true;
    }
    this.tshirtPrint.visible = !shirt && print;
  }

  setHanten(on: boolean): void {
    this.hantenParts.forEach((p) => (p.visible = on));
  }

  /** 無精ひげ 0..1 */
  setStubble(v: number): void {
    this.mats.stubble.opacity = v * 0.35;
  }
}

/** 頭の形：単位球を変形（頬とあごが張った中年の輪郭） */
function headGeometry(scale = 1, lowerOnly = false): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(HEAD_R * scale, 40, 30);
  const pos = g.getAttribute('position');
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).divideScalar(HEAD_R * scale);
    let { x, y, z } = v;
    y *= 1.06;
    z *= 1.02;
    // 頬とえら（下半分を横に張る）
    const low = THREE.MathUtils.smoothstep(0.15, -0.55, y);
    x *= 1 + low * 0.1;
    z *= 1 + low * 0.04;
    // あごは前へ、下へ
    if (y < -0.3) {
      const k = THREE.MathUtils.smoothstep(-0.3, -0.95, y);
      z += k * 0.12 * Math.max(0, z + 0.3);
      y -= k * 0.08;
    }
    // 二重あご（前側の下）
    const chin = Math.exp(-Math.pow((y + 0.78) / 0.16, 2)) * Math.max(0, z) * 0.22;
    z += chin;
    y -= chin * 0.3;
    // 後頭部は少し出っ張る
    if (z < 0) z *= 1 + Math.max(0, y + 0.2) * 0.05;
    pos.setXYZ(i, x * HEAD_R * scale, y * HEAD_R * scale, z * HEAD_R * scale);
  }
  if (lowerOnly) {
    // ひげ用：口まわりとあご（前側の下半分）だけ残す
    const idx = g.getIndex()!;
    const keep: number[] = [];
    for (let i = 0; i < idx.count; i += 3) {
      let ok = true;
      for (let k = 0; k < 3; k++) {
        v.fromBufferAttribute(pos, idx.getX(i + k));
        if (v.y > -0.025 || v.z < -0.02) ok = false;
      }
      if (ok) keep.push(idx.getX(i), idx.getX(i + 1), idx.getX(i + 2));
    }
    g.setIndex(keep);
  }
  g.computeVertexNormals();
  return g;
}

function hantenRings(b: number): Ring[] {
  return torsoRings(b)
    .filter((r) => r.y > 0.86 && r.y < 1.34)
    .map((r) => ({ ...r, rx: r.rx + 0.03, rz: r.rz + 0.03 }));
}

/** 袖口を少し広げる */
function flare(rings: Ring[], amt: number): Ring[] {
  return rings.map((r, i) => (i === rings.length - 1 ? { ...r, rx: r.rx + amt, rz: r.rz + amt } : r));
}

/** 箱の角を丸める */
function roundify(g: THREE.BufferGeometry, r: number): void {
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  const half = new THREE.Vector3().subVectors(bb.max, bb.min).multiplyScalar(0.5);
  const c = new THREE.Vector3().addVectors(bb.max, bb.min).multiplyScalar(0.5);
  const pos = g.getAttribute('position');
  const v = new THREE.Vector3();
  const inner = half.clone().subScalar(r);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).sub(c);
    const cl = new THREE.Vector3(
      Math.max(-inner.x, Math.min(inner.x, v.x)),
      Math.max(-inner.y, Math.min(inner.y, v.y)),
      Math.max(-inner.z, Math.min(inner.z, v.z)),
    );
    const d = v.clone().sub(cl);
    if (d.lengthSq() > 1e-8) d.setLength(r);
    v.copy(cl).add(d).add(c);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
}
