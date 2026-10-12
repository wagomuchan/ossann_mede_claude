import * as THREE from 'three';
import { ROOM, SPOT, WINDOW } from './layout';
import { at, box, blobShadow, cbox, cyl, group, mat, sphere, shadowed } from './kit';
import { bookSpinesTexture, fabricTexture, posterTexture, rugTexture, shippingLabelTexture } from './textures';

export interface Furniture {
  root: THREE.Group;
  monitorScreen: THREE.MeshStandardMaterial;
  laptopScreen: THREE.MeshStandardMaterial;
  tvScreen: THREE.MeshStandardMaterial;
  chair: THREE.Group;
  chairSeat: THREE.Group;
  pcGlow: THREE.MeshStandardMaterial;
  fridgeDoor: THREE.Group;
  microwaveWindow: THREE.MeshStandardMaterial;
  clockHour: THREE.Object3D;
  clockMinute: THREE.Object3D;
  clockSecond: THREE.Object3D;
  duvet: THREE.Mesh;
  pillow: THREE.Mesh;
  table: THREE.Group;
  kotatsu: THREE.Group;
  kotatsuGlow: THREE.PointLight;
  acLed: THREE.MeshStandardMaterial;
  acFlap: THREE.Object3D;
  seasonal: Record<'spring' | 'summer' | 'autumn' | 'winter', THREE.Group>;
  fanHead: THREE.Object3D;
  fanBlades: THREE.Object3D;
  windChime: THREE.Object3D;
  humidifierSteam: THREE.Points;
  laundry: THREE.Group;
  trashBags: THREE.Object3D[];
  cans: THREE.Object3D[];
  snackBags: THREE.Object3D[];
  zaisu: THREE.Group;
  scale: THREE.Group;
  scaleDisplay: THREE.MeshStandardMaterial;
  kettleLed: THREE.MeshStandardMaterial;
  ceilingLamp: THREE.MeshStandardMaterial;
}

const black = mat('#1c1c1f', { roughness: 0.5 });
const darkPlastic = mat('#2a2a2e', { roughness: 0.45 });
const whitePlastic = mat('#eceae4', { roughness: 0.45 });
const oak = mat('#c89b6a', { roughness: 0.6 });
const steel = mat('#9aa0a6', { roughness: 0.35, metalness: 0.7 });

function screenMat(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: '#000000', emissive: '#ffffff', emissiveIntensity: 1, roughness: 0.25, metalness: 0 });
}

export function buildFurniture(): Furniture {
  const root = new THREE.Group();
  root.name = 'furniture';

  // ================= デスク =================
  const desk = new THREE.Group();
  const { x: dx, z: dz } = SPOT.desk;
  const deskW = 0.62, deskL = 1.2, deskH = 0.72;
  desk.add(at(box(deskW, 0.03, deskL, oak, 0.008), 0, deskH - 0.03, 0));
  for (const sz of [-1, 1]) {
    desk.add(at(box(0.04, deskH - 0.03, 0.04, black), deskW / 2 - 0.05, 0, sz * (deskL / 2 - 0.05)));
    desk.add(at(box(0.04, deskH - 0.03, 0.04, black), -deskW / 2 + 0.05, 0, sz * (deskL / 2 - 0.05)));
    desk.add(at(box(deskW - 0.1, 0.03, 0.03, black), 0, 0.08, sz * (deskL / 2 - 0.05)));
  }
  desk.add(at(box(0.03, 0.05, deskL - 0.1, black), -deskW / 2 + 0.05, deskH - 0.08, 0));
  // マウスパッド（大判）
  desk.add(at(box(0.36, 0.004, 0.85, mat('#1e2229', { roughness: 0.9 }), 0.002), 0.08, deskH, 0.02));
  // モニター
  const monitor = new THREE.Group();
  const scrW = 0.62, scrH = 0.36;
  monitor.add(at(box(0.18, 0.012, 0.24, darkPlastic, 0.004), 0, 0, 0));
  monitor.add(at(box(0.03, 0.26, 0.05, darkPlastic, 0.006), -0.03, 0.01, 0));
  const panel = cbox(0.025, scrH + 0.02, scrW + 0.02, black, 0.006);
  panel.position.set(0, 0.19 + scrH / 2, 0);
  monitor.add(panel);
  const monitorScreen = screenMat();
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(scrW, scrH), monitorScreen);
  scr.rotation.y = Math.PI / 2;
  scr.position.set(0.0135, 0.19 + scrH / 2, 0);
  monitor.add(scr);
  // Webカメラ
  monitor.add(at(box(0.03, 0.025, 0.08, black, 0.008), 0.0, 0.19 + scrH + 0.01, 0));
  monitor.position.set(-0.2, deskH, 0.02);
  desk.add(monitor);
  // キーボード
  const kb = group(at(box(0.14, 0.022, 0.44, darkPlastic, 0.006), 0, 0, 0));
  for (let r = 0; r < 5; r++) {
    kb.add(at(box(0.022, 0.008, 0.4, mat('#34353b', { roughness: 0.6 }), 0.002), -0.05 + r * 0.025, 0.022, 0));
  }
  kb.position.set(0.1, deskH + 0.004, 0.02);
  desk.add(kb);
  // マウス
  desk.add(at(box(0.1, 0.03, 0.06, darkPlastic, 0.02), 0.13, deskH + 0.004, -0.34));
  // 会社のノートPC（スタンドの上）
  const laptop = new THREE.Group();
  laptop.add(at(box(0.22, 0.012, 0.32, steel, 0.005), 0, 0, 0));
  const lid = new THREE.Group();
  lid.add(at(box(0.008, 0.21, 0.32, steel, 0.003), 0, 0, 0));
  const laptopScreen = screenMat();
  const ls = new THREE.Mesh(new THREE.PlaneGeometry(0.29, 0.18), laptopScreen);
  ls.rotation.y = Math.PI / 2;
  ls.position.set(0.0045, 0.105, 0);
  lid.add(ls);
  lid.position.set(-0.1, 0.012, 0);
  lid.rotation.z = -0.25;
  laptop.add(lid);
  laptop.add(at(box(0.2, 0.08, 0.04, steel), 0.0, -0.08, 0.0));
  laptop.position.set(-0.1, deskH + 0.08, 0.42);
  laptop.rotation.y = -0.35;
  desk.add(laptop);
  // ヘッドホンスタンド
  const hp = group(
    at(cyl(0.04, 0.05, 0.01, darkPlastic, 12), 0, 0, 0),
    at(cyl(0.008, 0.008, 0.26, steel, 8), 0, 0.01, 0),
  );
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.012, 8, 20, Math.PI), black);
  band.rotation.y = Math.PI / 2;
  band.position.set(0, 0.25, 0);
  band.castShadow = true;
  hp.add(band);
  for (const s of [-1, 1]) hp.add(at(cbox(0.035, 0.08, 0.06, black, 0.015), 0, 0.22, s * 0.075));
  hp.position.set(-0.2, deskH, -0.44);
  desk.add(hp);
  // マグカップ
  const mug = group(at(cyl(0.035, 0.032, 0.09, mat('#f1efe9', { roughness: 0.3 }), 14), 0, 0, 0));
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.007, 6, 12), mat('#f1efe9', { roughness: 0.3 }));
  handle.position.set(0, 0.045, 0.04);
  handle.rotation.y = Math.PI / 2;
  mug.add(handle);
  mug.position.set(0.17, deskH, -0.52);
  desk.add(mug);
  // エナドリの缶（週の後半ほど増える）
  const cans: THREE.Object3D[] = [];
  const canCols = ['#1b5fd1', '#111111', '#d6d63a', '#1b5fd1', '#e8e8e8', '#111111', '#2fbf4a'];
  for (let i = 0; i < 7; i++) {
    const can = cyl(0.026, 0.026, 0.12, mat(canCols[i], { metalness: 0.6, roughness: 0.3 }), 12);
    can.position.set(-0.03 - (i % 2) * 0.07, deskH, -0.5 + Math.floor(i / 2) * 0.06 + (i % 2) * 0.02);
    if (i >= 5) {
      // 倒れてる
      can.rotation.x = Math.PI / 2;
      can.rotation.z = 0.4 * (i - 5);
      can.position.set(-0.05 + (i - 5) * 0.05, deskH + 0.026, 0.28);
    }
    cans.push(can);
    desk.add(can);
  }
  // PC本体（デスク下、RGBが光る）
  const pc = new THREE.Group();
  pc.add(at(box(0.42, 0.46, 0.2, mat('#141418', { roughness: 0.4 }), 0.01), 0, 0, 0));
  const pcGlow = new THREE.MeshStandardMaterial({ color: '#000', emissive: '#7a3cff', emissiveIntensity: 1.5 });
  const glassSide = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.4), new THREE.MeshPhysicalMaterial({ color: '#202030', roughness: 0.1, transparent: true, opacity: 0.55 }));
  glassSide.position.set(0, 0.23, 0.101);
  pc.add(glassSide);
  for (let i = 0; i < 3; i++) {
    const fan = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.006, 6, 20), pcGlow);
    fan.position.set(0.13, 0.36 - i * 0.12, 0.095);
    pc.add(fan);
  }
  pc.add(at(box(0.3, 0.008, 0.005, pcGlow), -0.03, 0.06, 0.098));
  pc.position.set(-0.05, 0, 0.42);
  pc.rotation.y = 0;
  desk.add(pc);

  desk.position.set(dx, 0, dz);
  desk.add(blobShadow(0.9, 1.4, 0.3));
  root.add(desk);

  // ================= ゲーミングチェア =================
  const chair = new THREE.Group();
  const chairSeat = new THREE.Group();
  const red = mat('#8e1f26', { roughness: 0.55 });
  const pu = mat('#1f1f22', { roughness: 0.5 });
  // 五本脚
  for (let i = 0; i < 5; i++) {
    const leg = box(0.3, 0.03, 0.04, darkPlastic, 0.01);
    leg.geometry = leg.geometry.clone().translate(0.15, 0, 0);
    leg.position.y = 0.06;
    leg.rotation.y = (i / 5) * Math.PI * 2;
    chair.add(leg);
    const wheel = sphere(0.028, black, 8, 6);
    wheel.position.set(Math.cos((i / 5) * Math.PI * 2) * 0.29, 0.028, -Math.sin((i / 5) * Math.PI * 2) * 0.29);
    chair.add(wheel);
  }
  chair.add(at(cyl(0.025, 0.025, 0.3, steel, 10), 0, 0.06, 0));
  // 座面（回転する部分）
  chairSeat.add(at(box(0.52, 0.09, 0.5, pu, 0.035), 0, 0, 0));
  chairSeat.add(at(box(0.2, 0.091, 0.5, red, 0.03), 0, 0.001, 0));
  // 背もたれ（前が +z。チェアは後で回転させる）
  const back = new THREE.Group();
  back.add(at(box(0.5, 0.78, 0.1, pu, 0.05), 0, 0, 0));
  back.add(at(box(0.22, 0.6, 0.101, red, 0.04), 0, 0.08, 0.001));
  back.add(at(box(0.22, 0.12, 0.1, pu, 0.04), 0, 0.62, 0.04));
  back.position.set(0, 0.06, -0.24);
  back.rotation.x = -0.12;
  chairSeat.add(back);
  // ひじ掛け
  for (const s of [-1, 1]) {
    chairSeat.add(at(box(0.04, 0.2, 0.04, darkPlastic), s * 0.27, -0.02, -0.02));
    chairSeat.add(at(box(0.08, 0.03, 0.26, pu, 0.012), s * 0.27, 0.18, 0.0));
  }
  chairSeat.position.y = 0.38;
  chair.add(chairSeat);
  chair.add(blobShadow(0.7, 0.7, 0.35));
  chair.position.set(SPOT.chair.x, 0, SPOT.chair.z);
  chair.rotation.y = -Math.PI / 2;
  root.add(shadowed(chair));

  // ================= ベッド =================
  const bedG = new THREE.Group();
  const { x0, x1, z0, z1 } = SPOT.bed;
  const bw = x1 - x0, bd = z1 - z0;
  const bedFrame = mat('#7a5a3e', { roughness: 0.6 });
  bedG.add(at(box(bw, 0.2, bd, bedFrame, 0.01), 0, 0.04, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bedG.add(at(box(0.05, 0.05, 0.05, bedFrame), sx * (bw / 2 - 0.04), 0, sz * (bd / 2 - 0.04)));
  bedG.add(at(box(0.05, 0.42, bd, bedFrame, 0.01), bw / 2 - 0.025, 0.04, 0));
  const sheet = new THREE.MeshStandardMaterial({ map: fabricTexture('#dfe3e6', 3), roughness: 0.95 });
  bedG.add(at(box(bw - 0.07, 0.17, bd - 0.03, sheet, 0.05), -0.02, 0.24, 0));
  const pillow = cbox(0.34, 0.1, 0.55, new THREE.MeshStandardMaterial({ map: fabricTexture('#f2f2ee', 4), roughness: 0.95 }), 0.05);
  pillow.position.set(bw / 2 - 0.26, 0.46, 0.02);
  pillow.rotation.y = 0.05;
  bedG.add(pillow);
  const duvet = makeDuvet(bw - 0.36, bd + 0.06);
  duvet.position.set(-0.17, 0.41, 0);
  bedG.add(duvet);
  bedG.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
  bedG.add(blobShadow(bw + 0.2, bd + 0.2, 0.35));
  root.add(bedG);
  const pillowWorld = pillow;

  // ================= ローテーブル / こたつ =================
  const table = new THREE.Group();
  table.add(at(box(0.8, 0.03, 0.6, oak, 0.01), 0, 0.33, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) table.add(at(box(0.04, 0.33, 0.04, oak), sx * 0.35, 0, sz * 0.25));
  table.add(blobShadow(1.0, 0.8, 0.25));
  table.position.set(SPOT.table.x, 0, SPOT.table.z);
  root.add(table);

  const kotatsu = new THREE.Group();
  const futonMat = new THREE.MeshStandardMaterial({ map: fabricTexture('#9b4a3b', 7, true), roughness: 0.95 });
  kotatsu.add(makeKotatsuFuton(futonMat));
  kotatsu.add(at(box(0.84, 0.025, 0.84, mat('#a77a4f', { roughness: 0.4 }), 0.01), 0, 0.39, 0));
  const kotatsuGlow = new THREE.PointLight('#ff5a2a', 0, 1.0, 2);
  kotatsuGlow.position.set(0, 0.15, 0);
  kotatsu.add(kotatsuGlow);
  // みかん
  const basket = group(at(cyl(0.11, 0.08, 0.06, mat('#c9a46a', { roughness: 0.8 }), 14), 0, 0, 0));
  const orange = mat('#f08a1c', { roughness: 0.6 });
  [[0, 0.07, 0], [0.05, 0.065, 0.03], [-0.05, 0.065, -0.02], [0.01, 0.11, -0.02], [-0.02, 0.065, 0.05]].forEach(([x, y, z]) => {
    const o = sphere(0.035, orange, 10, 8);
    o.scale.y = 0.85;
    o.position.set(x, y, z);
    basket.add(o);
  });
  basket.position.set(0.1, 0.415, -0.1);
  kotatsu.add(basket);
  kotatsu.add(blobShadow(1.3, 1.3, 0.3));
  kotatsu.position.set(SPOT.table.x, 0, SPOT.table.z);
  root.add(kotatsu);

  // ラグ
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.35), new THREE.MeshStandardMaterial({ map: rugTexture(), roughness: 1 }));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(SPOT.table.x - 0.15, 0.004, SPOT.table.z);
  rug.receiveShadow = true;
  root.add(rug);

  // ================= 座椅子 =================
  const zaisu = new THREE.Group();
  const zfab = new THREE.MeshStandardMaterial({ map: fabricTexture('#5a4e44', 9), roughness: 0.95 });
  zaisu.add(at(box(0.48, 0.08, 0.5, zfab, 0.035), 0, 0.01, 0));
  const zback = new THREE.Group();
  zback.add(at(box(0.48, 0.55, 0.08, zfab, 0.035), 0, 0, 0));
  zback.position.set(0, 0.06, -0.24);
  zback.rotation.x = -0.45;
  zaisu.add(zback);
  zaisu.add(blobShadow(0.6, 0.7, 0.3));
  zaisu.position.set(SPOT.zaisu.x, 0, SPOT.zaisu.z);
  zaisu.rotation.y = Math.PI / 2; // +x（TV）を向く
  root.add(shadowed(zaisu));

  // ================= TV台とTV =================
  const tvG = new THREE.Group();
  const tvStand = mat('#3b3631', { roughness: 0.55 });
  tvG.add(at(box(0.36, 0.36, 1.1, tvStand, 0.01), 0, 0, 0));
  tvG.add(at(box(0.3, 0.12, 1.02, mat('#24211e')), 0.031, 0.12, 0));
  const tv = new THREE.Group();
  tv.add(at(box(0.16, 0.012, 0.3, darkPlastic, 0.004), 0, 0, 0));
  tv.add(at(box(0.04, 0.08, 0.06, darkPlastic), 0.02, 0.01, 0));
  const tvPanel = cbox(0.035, 0.52, 0.92, black, 0.006);
  tvPanel.position.set(0, 0.08 + 0.26, 0);
  tv.add(tvPanel);
  const tvScreen = screenMat();
  const tvs = new THREE.Mesh(new THREE.PlaneGeometry(0.89, 0.49), tvScreen);
  tvs.rotation.y = -Math.PI / 2;
  tvs.position.set(-0.0185, 0.34, 0);
  tv.add(tvs);
  tv.position.set(0.03, 0.36, 0);
  tvG.add(tv);
  // ゲーム機（縦置き）
  tvG.add(at(box(0.2, 0.32, 0.08, whitePlastic, 0.02), 0, 0.36, 0.45));
  tvG.add(at(box(0.18, 0.005, 0.01, mat('#000', { emissive: '#3aa0ff', emissiveIntensity: 2 })), -0.01, 0.6, 0.41));
  // ソフトのケース
  for (let i = 0; i < 6; i++) {
    tvG.add(at(box(0.13, 0.17, 0.014, mat(['#1450a0', '#c41e1e', '#222', '#1d7a3a', '#5a2a8a', '#e0e0e0'][i], { roughness: 0.4 })), -0.05, 0.13, -0.4 + i * 0.016));
  }
  tvG.position.set(SPOT.tv.x, 0, SPOT.tv.z);
  tvG.add(blobShadow(0.6, 1.3, 0.3));
  root.add(shadowed(tvG));

  // ================= 冷蔵庫・電子レンジ・ケトル =================
  const fr = new THREE.Group();
  const frW = 0.48, frD = 0.5, frH = 0.86;
  fr.add(at(box(frD, frH, frW, mat('#d9d6cf', { roughness: 0.35 }), 0.02), 0, 0.02, 0));
  const fridgeDoor = new THREE.Group();
  fridgeDoor.add(at(box(0.03, frH - 0.04, frW, mat('#e6e3dc', { roughness: 0.3 }), 0.012), 0.015, 0, -frW / 2));
  fridgeDoor.add(at(box(0.02, 0.25, 0.02, mat('#b9b5ad')), 0.04, frH * 0.4, -frW + 0.04));
  // 冷凍室との境目、マグネットとメモ
  fridgeDoor.add(at(box(0.032, 0.006, frW - 0.01, mat('#bdb9b0')), 0.016, frH * 0.62, -frW / 2));
  fridgeDoor.add(at(box(0.02, 0.12, 0.02, mat('#b9b5ad')), 0.04, frH * 0.68, -frW + 0.04));
  const memo = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.09), mat('#f7e98a', { roughness: 0.9 }));
  memo.rotation.y = Math.PI / 2;
  memo.rotation.x = 0.08;
  memo.position.set(0.033, frH * 0.42, -frW * 0.45);
  fridgeDoor.add(memo);
  for (const [y, z, c] of [[0.48, -0.3, '#d63a2f'], [0.7, -0.15, '#2f6ad6'], [0.35, -0.12, '#4ab86a']] as const) {
    fridgeDoor.add(at(box(0.012, 0.025, 0.025, mat(c, { roughness: 0.4 }), 0.005), 0.036, frH * y, z));
  }
  fridgeDoor.position.set(frD / 2, 0.04, frW / 2);
  fr.add(fridgeDoor);
  // 中身（ドアを開けると見える）
  fr.add(at(box(frD - 0.05, frH - 0.1, frW - 0.04, mat('#f4f4f2', { emissive: '#fffbe8', emissiveIntensity: 0.0 })), -0.01, 0.06, 0));
  const beerCol = mat('#d4b13a', { metalness: 0.6, roughness: 0.3 });
  for (let i = 0; i < 4; i++) fr.add(at(cyl(0.03, 0.03, 0.12, beerCol, 10), 0.15, 0.5, -0.15 + i * 0.07));
  fr.add(at(cyl(0.04, 0.04, 0.25, mat('#e9eef2', { transparent: true, opacity: 0.8 }), 10), 0.12, 0.08, 0.1));
  // 電子レンジ
  const mw = new THREE.Group();
  mw.add(at(box(0.36, 0.26, 0.46, mat('#2b2b2b', { roughness: 0.4 }), 0.015), 0, 0, 0));
  const microwaveWindow = new THREE.MeshStandardMaterial({ color: '#111', emissive: '#ffc46b', emissiveIntensity: 0, roughness: 0.2 });
  const mwin = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.16), microwaveWindow);
  mwin.rotation.y = Math.PI / 2;
  mwin.position.set(0.181, 0.14, -0.04);
  mw.add(mwin);
  mw.position.set(0, frH + 0.02, 0);
  fr.add(mw);
  // ケトル
  const kettle = new THREE.Group();
  kettle.add(at(cyl(0.065, 0.075, 0.02, darkPlastic, 14), 0, 0, 0));
  kettle.add(at(cyl(0.06, 0.07, 0.16, whitePlastic, 14), 0, 0.02, 0));
  kettle.add(at(box(0.03, 0.12, 0.03, whitePlastic, 0.01), -0.08, 0.04, 0));
  const kettleLed = new THREE.MeshStandardMaterial({ color: '#111', emissive: '#ff3a1a', emissiveIntensity: 0 });
  kettle.add(at(box(0.01, 0.01, 0.01, kettleLed), 0.07, 0.008, 0));
  kettle.position.set(0.02, frH + 0.28, -0.12);
  fr.add(kettle);
  // カップ麺の在庫
  const noodleCols = ['#d63a2f', '#f2c230', '#d63a2f', '#2f6ad6'];
  for (let i = 0; i < 4; i++) {
    fr.add(at(cyl(0.05, 0.04, 0.1, mat(noodleCols[i], { roughness: 0.5 }), 12), 0.05, frH + 0.28 + Math.floor(i / 2) * 0.1, 0.06 + (i % 2) * 0.1));
  }
  fr.position.set(SPOT.fridge.x, 0, SPOT.fridge.z);
  fr.add(blobShadow(0.7, 0.7, 0.35));
  root.add(shadowed(fr));

  // ================= 本棚（カラーボックス） =================
  const sh = new THREE.Group();
  const shW = 0.42, shD = 0.29, shH = 0.88;
  const shMat = mat('#efe9df', { roughness: 0.6 });
  sh.add(at(box(0.015, shH, shD, shMat), -shW / 2 + 0.0075, 0, 0));
  sh.add(at(box(0.015, shH, shD, shMat), shW / 2 - 0.0075, 0, 0));
  for (let i = 0; i < 4; i++) sh.add(at(box(shW, 0.015, shD, shMat), 0, i * ((shH - 0.015) / 3), 0));
  sh.add(at(box(shW, shH, 0.005, shMat), 0, 0, -shD / 2));
  for (let i = 0; i < 3; i++) {
    const books = new THREE.Mesh(new THREE.PlaneGeometry(shW - 0.04, 0.26), new THREE.MeshStandardMaterial({ map: bookSpinesTexture(40 + i), roughness: 0.8 }));
    books.position.set(0, 0.015 + i * 0.288 + 0.13, 0.05);
    sh.add(books);
    sh.add(at(box(shW - 0.04, 0.24, 0.2, mat('#3a2f28')), 0, 0.015 + i * 0.288, -0.05));
  }
  // 上にフィギュアと枯れかけの観葉植物
  const fig = group(
    at(cyl(0.03, 0.03, 0.01, black, 10), 0, 0, 0),
    at(cyl(0.012, 0.018, 0.08, mat('#3a6fd0'), 8), 0, 0.01, 0),
    at(sphere(0.02, mat('#f1d3b0'), 10, 8), 0, 0.105, 0),
  );
  fig.children[2].scale.set(1, 1.1, 1);
  fig.position.set(-0.12, shH, 0.02);
  sh.add(fig);
  const plant = new THREE.Group();
  plant.add(at(cyl(0.06, 0.045, 0.1, mat('#b5653c', { roughness: 0.8 }), 12), 0, 0, 0));
  const leafMat = mat('#8a8a3e', { roughness: 0.8 });
  for (let i = 0; i < 6; i++) {
    const leaf = box(0.012, 0.16, 0.04, leafMat, 0.005);
    leaf.position.set(0, 0.09, 0);
    leaf.rotation.set(0.5 + (i % 2) * 0.6, (i / 6) * Math.PI * 2, 0);
    plant.add(leaf);
  }
  const deadLeaf = box(0.012, 0.12, 0.04, mat('#7a5a2a'), 0.005);
  deadLeaf.position.set(0.04, 0.09, 0.02);
  deadLeaf.rotation.set(1.6, 0.4, 0);
  plant.add(deadLeaf);
  plant.position.set(0.1, shH, 0.0);
  sh.add(plant);
  sh.position.set(SPOT.shelf.x, 0, SPOT.shelf.z);
  root.add(shadowed(sh));

  // ================= 姿見 =================
  const mirror = new THREE.Group();
  mirror.add(at(box(0.38, 1.42, 0.03, mat('#5a4636', { roughness: 0.5 }), 0.01), 0, 0, 0));
  const mirrorGlass = new THREE.Mesh(
    new THREE.PlaneGeometry(0.32, 1.34),
    new THREE.MeshStandardMaterial({ color: '#b6c3cc', roughness: 0.04, metalness: 1 }),
  );
  mirrorGlass.position.set(0, 0.71, 0.016);
  mirror.add(mirrorGlass);
  mirror.position.set(SPOT.mirror.x, 0, SPOT.mirror.z + 0.13);
  mirror.rotation.x = -0.09;
  root.add(shadowed(mirror));

  // ================= 体重計 =================
  const scale = new THREE.Group();
  scale.add(at(box(0.3, 0.025, 0.3, mat('#f4f4f4', { roughness: 0.25 }), 0.012), 0, 0, 0));
  const scaleDisplay = new THREE.MeshStandardMaterial({ color: '#223', emissive: '#6af0ff', emissiveIntensity: 0 });
  scale.add(at(box(0.09, 0.002, 0.035, scaleDisplay), 0, 0.025, -0.09));
  scale.position.set(SPOT.scale.x, 0, SPOT.scale.z);
  root.add(scale);

  // ================= 壁掛け時計 =================
  const clock = new THREE.Group();
  const face = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.03, 40), [
    mat('#3a3a3a', { roughness: 0.4 }),
    new THREE.MeshStandardMaterial({ map: clockFaceTexture(), roughness: 0.5 }),
    mat('#3a3a3a'),
  ]);
  face.rotation.x = Math.PI / 2;
  face.rotation.y = Math.PI / 2;
  face.castShadow = true;
  clock.add(face);
  // ガラスの縁
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.012, 8, 40), mat('#2a2a2a', { roughness: 0.3, metalness: 0.4 }));
  rim.position.z = 0.015;
  clock.add(rim);
  const hand = (len: number, w: number, color: string, z: number) => {
    const pivot = new THREE.Object3D();
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, 0.004).translate(0, len / 2 - 0.015, 0), mat(color, { roughness: 0.4 }));
    m.castShadow = true;
    pivot.add(m);
    pivot.position.z = z;
    clock.add(pivot);
    return pivot;
  };
  const clockHour = hand(0.075, 0.011, '#1a1a1a', 0.018);
  const clockMinute = hand(0.11, 0.007, '#1a1a1a', 0.022);
  const clockSecond = hand(0.12, 0.002, '#c0281e', 0.026);
  clock.add(at(cyl(0.008, 0.008, 0.012, mat('#c0281e'), 10, false), 0, 0, 0.028));
  (clock.children[clock.children.length - 1] as THREE.Mesh).rotation.x = Math.PI / 2;
  clock.position.set(SPOT.clock.x, SPOT.clock.y, SPOT.clock.z + 0.02);
  root.add(clock);

  // ================= エアコン =================
  const ac = new THREE.Group();
  ac.add(at(box(0.24, 0.28, 0.82, whitePlastic, 0.04), 0, 0, 0));
  const acFlap = new THREE.Object3D();
  acFlap.add(at(box(0.04, 0.01, 0.7, mat('#e2e0da')), 0.02, 0, 0));
  acFlap.position.set(0.1, 0.03, 0);
  ac.add(acFlap);
  const acLed = new THREE.MeshStandardMaterial({ color: '#111', emissive: '#4cff7a', emissiveIntensity: 0 });
  ac.add(at(box(0.004, 0.008, 0.008, acLed), 0.121, 0.08, 0.3));
  ac.position.set(ROOM.minX + 0.12, 2.04, -0.85);
  root.add(shadowed(ac));

  // ================= ポスター =================
  const poster = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.59), new THREE.MeshStandardMaterial({ map: posterTexture(), roughness: 0.6 }));
  poster.rotation.y = Math.PI / 2;
  poster.position.set(ROOM.minX + 0.005, 1.55, 0.05);
  poster.rotation.z = 0.02;
  root.add(poster);

  // ================= 天井灯（光源は lighting 側。ここでは見えない傘の発光だけ） =================
  const ceilingLamp = new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#fff4e0', emissiveIntensity: 0 });

  // ================= ゴミ箱とゴミ袋 =================
  const trash = new THREE.Group();
  trash.add(at(cyl(0.13, 0.11, 0.32, mat('#7d8a8f', { roughness: 0.5 }), 16), 0, 0, 0));
  const crumple = mat('#f2f2ee', { roughness: 0.9 });
  for (let i = 0; i < 3; i++) {
    const p = sphere(0.035, crumple, 6, 5);
    p.position.set(-0.04 + i * 0.04, 0.33, (i % 2) * 0.03);
    trash.add(p);
  }
  trash.position.set(SPOT.trash.x, 0, SPOT.trash.z);
  root.add(shadowed(trash));
  const trashBags: THREE.Object3D[] = [];
  for (let i = 0; i < 3; i++) {
    const bag = makeTrashBag(i);
    bag.position.set([-1.6, -1.47, -1.64][i], 0, [0.52, 0.6, 0.66][i]);
    bag.rotation.y = i;
    trashBags.push(bag);
    root.add(bag);
  }

  // ================= 段ボール =================
  const boxes = new THREE.Group();
  const card = mat('#b88b57', { roughness: 0.85 });
  const b1 = box(0.42, 0.26, 0.32, card, 0.004);
  const b2 = box(0.32, 0.2, 0.26, card, 0.004);
  b2.position.set(0.02, 0.26, 0.01);
  b2.rotation.y = 0.15;
  boxes.add(b1, b2);
  const tape = mat('#c9a876', { roughness: 0.5 });
  boxes.add(at(box(0.42, 0.003, 0.05, tape), 0, 0.26, 0));
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.09), new THREE.MeshStandardMaterial({ map: shippingLabelTexture(), roughness: 0.7 }));
  label.position.set(-0.212, 0.13, 0.03);
  label.rotation.y = -Math.PI / 2;
  boxes.add(label);
  boxes.position.set(SPOT.boxes.x, 0, SPOT.boxes.z);
  boxes.rotation.y = Math.PI / 2;
  root.add(shadowed(boxes));

  // ================= スナック菓子の袋 =================
  const snackBags: THREE.Object3D[] = [];
  const snack1 = box(0.16, 0.012, 0.22, mat('#e8a21e', { roughness: 0.35, metalness: 0.3 }), 0.006);
  snack1.position.set(SPOT.table.x + 0.15, 0.36, SPOT.table.z + 0.1);
  snack1.rotation.y = 0.6;
  snackBags.push(snack1);
  root.add(snack1);

  // ================= 洗濯物（休日） =================
  const laundry = new THREE.Group();
  const rack = mat('#c8ccd2', { roughness: 0.3, metalness: 0.6 });
  for (const s of [-1, 1]) {
    const leg = box(0.02, 1.25, 0.02, rack);
    leg.position.set(s * 0.35, 0, 0);
    laundry.add(leg);
    laundry.add(at(box(0.02, 0.02, 0.4, rack), s * 0.35, 0.01, 0));
  }
  const bar = cyl(0.01, 0.01, 0.72, rack, 8, false);
  bar.rotation.z = Math.PI / 2;
  bar.position.y = 1.24;
  laundry.add(bar);
  const clothes = [['#4a5a7a', 0.34, 0.5], ['#e8e8e4', 0.3, 0.42], ['#7a7a7a', 0.22, 0.55], ['#2b2b2b', 0.16, 0.22], ['#e8e8e4', 0.16, 0.22]] as const;
  let cx = -0.28;
  for (const [col, w, h] of clothes) {
    const cl = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 2, 2), new THREE.MeshStandardMaterial({ map: fabricTexture(col, 13), side: THREE.DoubleSide, roughness: 0.95 }));
    cl.position.set(cx + w / 2, 1.24 - h / 2, 0);
    cl.castShadow = true;
    laundry.add(cl);
    cx += w * 0.8;
  }
  laundry.position.set(SPOT.laundry.x, 0, SPOT.laundry.z);
  laundry.rotation.y = -0.45;
  root.add(laundry);

  // ================= 季節の小物 =================
  const seasonal = {
    spring: new THREE.Group(),
    summer: new THREE.Group(),
    autumn: new THREE.Group(),
    winter: new THREE.Group(),
  };
  // 春：花粉症セット（ティッシュ箱とゴミ、マスク）
  const tissue = () => {
    const t = group(at(box(0.24, 0.08, 0.12, mat('#f3f0e8', { roughness: 0.6 }), 0.008), 0, 0, 0));
    const puff = cbox(0.06, 0.05, 0.05, mat('#ffffff', { roughness: 0.9 }), 0.02);
    puff.position.set(0, 0.1, 0);
    t.add(puff);
    return t;
  };
  seasonal.spring.add(at(tissue(), SPOT.desk.x + 0.15, 0.72, SPOT.desk.z - 0.42, 0.3));
  seasonal.spring.add(at(tissue(), SPOT.table.x - 0.2, 0.36, SPOT.table.z - 0.1, 1.2));
  for (let i = 0; i < 7; i++) {
    const p = sphere(0.03, mat('#fafafa', { roughness: 0.95 }), 6, 5);
    p.position.set(SPOT.trash.x + 0.15 + (i % 3) * 0.06, 0.03, SPOT.trash.z + 0.18 + Math.floor(i / 3) * 0.05);
    seasonal.spring.add(p);
  }
  seasonal.spring.add(at(box(0.15, 0.01, 0.09, mat('#f4f7fa', { roughness: 0.9 }), 0.004), SPOT.table.x + 0.2, 0.36, SPOT.table.z - 0.15, 0.4));

  // 夏：扇風機、風鈴、蚊取り線香
  const fan = new THREE.Group();
  fan.add(at(cyl(0.14, 0.15, 0.03, whitePlastic, 18), 0, 0, 0));
  fan.add(at(cyl(0.015, 0.015, 0.75, whitePlastic, 8), 0, 0.03, 0));
  const fanHead = new THREE.Object3D();
  fanHead.position.y = 0.8;
  const motor = cbox(0.12, 0.12, 0.14, whitePlastic, 0.05);
  motor.position.z = -0.06;
  fanHead.add(motor);
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.006, 6, 32), whitePlastic);
  guard.position.z = 0.04;
  fanHead.add(guard);
  const guardBack = guard.clone();
  guardBack.position.z = 0.0;
  fanHead.add(guardBack);
  const fanBlades = new THREE.Object3D();
  for (let i = 0; i < 5; i++) {
    const blade = new THREE.Mesh(new THREE.CircleGeometry(0.075, 10, 0, 1.0), new THREE.MeshStandardMaterial({ color: '#9fd6ff', transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
    blade.rotation.z = (i / 5) * Math.PI * 2;
    blade.position.z = 0.0;
    fanBlades.add(blade);
  }
  fanBlades.position.z = 0.02;
  fanHead.add(fanBlades);
  fan.add(fanHead);
  fan.position.set(SPOT.fan.x, 0, SPOT.fan.z);
  fan.rotation.y = Math.PI * 0.9;
  seasonal.summer.add(shadowed(fan));
  const windChime = new THREE.Object3D();
  windChime.add(at(sphere(0.035, new THREE.MeshPhysicalMaterial({ color: '#dff4ff', transparent: true, opacity: 0.6, roughness: 0.05 }), 12, 8), 0, -0.05, 0));
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.12), new THREE.MeshStandardMaterial({ color: '#f2f2e8', side: THREE.DoubleSide }));
  strip.position.y = -0.15;
  windChime.add(strip);
  windChime.position.set((WINDOW.x0 + WINDOW.x1) / 2 + 0.2, WINDOW.y1 - 0.02, ROOM.minZ + 0.06);
  seasonal.summer.add(windChime);
  const coil = group(at(cyl(0.06, 0.06, 0.02, mat('#4b7a3a'), 16), 0, 0, 0), at(cyl(0.07, 0.07, 0.01, steel, 16), 0, -0.01, 0));
  coil.position.set(SPOT.coil.x, 0.01, SPOT.coil.z);
  seasonal.summer.add(coil);
  // アイスの棒
  seasonal.summer.add(at(box(0.08, 0.003, 0.012, mat('#d9b98a')), SPOT.desk.x + 0.2, 0.72, SPOT.desk.z - 0.25, 0.4));

  // 秋：焼き芋の袋と柿
  const kaki = mat('#e86a1a', { roughness: 0.5 });
  for (let i = 0; i < 3; i++) {
    const k = sphere(0.04, kaki, 10, 8);
    k.scale.y = 0.75;
    k.position.set(SPOT.fridge.x + 0.05, 0.86 + 0.3, SPOT.fridge.z + 0.12 + i * 0.07);
    seasonal.autumn.add(k);
  }
  seasonal.autumn.add(at(box(0.18, 0.08, 0.12, mat('#c9b48a', { roughness: 0.9 }), 0.02), SPOT.table.x - 0.18, 0.36, SPOT.table.z + 0.12, 0.5));

  // 冬：加湿器（湯気）
  const hum = group(at(cyl(0.09, 0.1, 0.26, whitePlastic, 18), 0, 0, 0), at(cyl(0.03, 0.03, 0.02, darkPlastic, 10), 0, 0.26, 0));
  hum.position.set(SPOT.humidifier.x, 0, SPOT.humidifier.z);
  seasonal.winter.add(shadowed(hum));
  const steamGeo = new THREE.BufferGeometry();
  const STEAM = 40;
  steamGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(STEAM * 3), 3));
  const humidifierSteam = new THREE.Points(
    steamGeo,
    new THREE.PointsMaterial({ color: '#ffffff', size: 0.05, transparent: true, opacity: 0.25, depthWrite: false, sizeAttenuation: true }),
  );
  humidifierSteam.position.set(SPOT.humidifier.x, 0.28, SPOT.humidifier.z);
  humidifierSteam.frustumCulled = false;
  seasonal.winter.add(humidifierSteam);

  for (const g of Object.values(seasonal)) root.add(g);

  return {
    root,
    monitorScreen,
    laptopScreen,
    tvScreen,
    chair,
    chairSeat,
    pcGlow,
    fridgeDoor,
    microwaveWindow,
    clockHour,
    clockMinute,
    clockSecond,
    duvet,
    pillow: pillowWorld,
    table,
    kotatsu,
    kotatsuGlow,
    acLed,
    acFlap,
    seasonal,
    fanHead,
    fanBlades,
    windChime,
    humidifierSteam,
    laundry,
    trashBags,
    cans,
    snackBags,
    zaisu,
    scale,
    scaleDisplay,
    kettleLed,
    ceilingLamp,
  };
}

/** 口を結んだ半透明のゴミ袋（中身がうっすら見える） */
export function makeTrashBag(seed: number): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.SphereGeometry(0.16, 18, 14);
  const pos = geo.getAttribute('position');
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = v.clone().normalize();
    // 中身のごつごつ感と、上に向かってすぼまる形
    const bump = 1 + Math.sin(n.x * 9 + seed) * Math.sin(n.z * 7 + seed * 2) * 0.07 + Math.sin(n.y * 11 + seed) * 0.04;
    const taper = 1 - Math.max(0, n.y) * 0.35;
    v.set(v.x * bump * taper, v.y * 1.05, v.z * bump * taper);
    if (v.y < -0.12) v.y = -0.12 - (v.y + 0.12) * 0.15;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const film = new THREE.MeshPhysicalMaterial({ color: '#eef2ec', roughness: 0.35, transparent: true, opacity: 0.78, depthWrite: false });
  const body = new THREE.Mesh(geo, film);
  body.position.y = 0.135;
  body.castShadow = true;
  g.add(body);
  // 中身
  const stuff = ['#d63a2f', '#f2c230', '#e8e8e8', '#2f6ad6', '#b88b57'];
  for (let k = 0; k < 5; k++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.05), mat(stuff[(k + seed) % 5], { roughness: 0.6 }));
    m.position.set(Math.sin(k * 2.1 + seed) * 0.07, 0.07 + (k % 3) * 0.05, Math.cos(k * 1.7 + seed) * 0.06);
    m.rotation.set(k, k * 2, 0);
    g.add(m);
  }
  // 結び目
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.07, 6), film);
    ear.position.set(s * 0.025, 0.31, 0);
    ear.rotation.z = -s * 0.6;
    g.add(ear);
  }
  g.rotation.y = seed * 1.3;
  return g;
}

function clockFaceTexture(): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#f7f5ef';
  ctx.fillRect(0, 0, S, S);
  ctx.translate(S / 2, S / 2);
  for (let i = 0; i < 60; i++) {
    ctx.save();
    ctx.rotate((i / 60) * Math.PI * 2);
    ctx.fillStyle = '#222';
    if (i % 5 === 0) ctx.fillRect(-3, -S / 2 + 10, 6, 20);
    else ctx.fillRect(-1, -S / 2 + 10, 2, 8);
    ctx.restore();
  }
  ctx.fillStyle = '#222';
  ctx.font = 'bold 26px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 1; i <= 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.fillText(String(i), Math.sin(a) * 80, -Math.cos(a) * 80);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  // シリンダー上面のUVに合わせて回転
  t.center.set(0.5, 0.5);
  return t;
}

/** 掛け布団。morph[0] = 寝ている人を覆う形、ベース = くしゃっと寄せた形 */
function makeDuvet(w: number, d: number): THREE.Mesh {
  const g = new THREE.BoxGeometry(w, 0.07, d, 28, 2, 14);
  const pos = g.getAttribute('position');
  const base = new Float32Array(pos.array.length);
  const cover = new Float32Array(pos.array.length);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const u = (x + w / 2) / w; // 0=足元 1=頭側
    const v = (z + d / 2) / d;
    // 寝ている形：体のふくらみ＋端が垂れる
    const edge = Math.max(0, Math.abs(v - 0.5) * 2 - 0.7) / 0.3;
    const body = Math.exp(-Math.pow((v - 0.5) / 0.22, 2)) * (0.12 + 0.06 * Math.exp(-Math.pow((u - 0.55) / 0.2, 2)));
    let cy = y + body - edge * edge * 0.18;
    let cz = z * (1 - edge * 0.06);
    // 頭側は少し折り返し
    if (u > 0.92) cy += 0.03;
    cover[i * 3] = x;
    cover[i * 3 + 1] = cy + 0.035;
    cover[i * 3 + 2] = cz;
    // 寄せた形：足元側にくしゃっと
    const fold = Math.sin(u * Math.PI * 5 + v * 3) * 0.04 + Math.sin(v * 9) * 0.02;
    const bx = -w / 2 + u * w * 0.45;
    const by = y + 0.04 + fold + Math.max(0, 0.45 - u) * 0.12 * Math.sin(v * Math.PI);
    base[i * 3] = bx;
    base[i * 3 + 1] = by;
    base[i * 3 + 2] = z * (0.95 + 0.05 * Math.sin(u * 7));
  }
  pos.array.set(base);
  g.morphAttributes.position = [new THREE.BufferAttribute(cover, 3)];
  g.morphTargetsRelative = false;
  g.computeVertexNormals();
  const m = new THREE.MeshStandardMaterial({ map: fabricTexture('#7f97b0', 5), roughness: 0.95 });
  const mesh = new THREE.Mesh(g, m);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.morphTargetInfluences = [0];
  return mesh;
}

/** こたつ布団（四角い掛け布団が垂れ下がる） */
function makeKotatsuFuton(m: THREE.Material): THREE.Mesh {
  const S = 1.3;
  const g = new THREE.PlaneGeometry(S, S, 26, 26);
  g.rotateX(-Math.PI / 2);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const ax = Math.abs(x), az = Math.abs(z);
    const top = 0.42;
    const r = Math.max(ax, az);
    let y = 0.385;
    if (r > top) {
      const drop = (r - top) / (S / 2 - top);
      y = 0.385 - drop * 0.37 - Math.sin((ax > az ? z : x) * 14) * 0.012 * drop;
      // 角はさらに垂れる
      const corner = Math.min(ax, az) / (S / 2);
      y -= corner * corner * 0.05;
      const k = (top + (r - top) * 0.35) / r;
      pos.setX(i, x * k);
      pos.setZ(i, z * k);
    }
    pos.setY(i, Math.max(0.01, y));
  }
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, m);
  (m as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
