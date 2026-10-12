import * as THREE from 'three';
import { ROOM, WINDOW, DOOR } from './layout';
import { box, mat, at, cyl, group, shadowed } from './kit';
import { wallpaperTexture, woodFloorTexture } from './textures';

export interface RoomShell {
  root: THREE.Group;
  door: THREE.Group;
  windowGlass: THREE.Mesh[];
  curtainL: THREE.Mesh;
  curtainR: THREE.Mesh;
  corridorLight: THREE.PointLight;
}

const CUT = '#3a3532';

/** ワールド座標に基づくUVを振る（壁紙の縮尺を揃える） */
function worldUV(mesh: THREE.Mesh, scale = 0.9): void {
  mesh.updateMatrixWorld(true);
  const g = mesh.geometry.clone();
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  const uv = new Float32Array(pos.count * 2);
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
    n.fromBufferAttribute(nor, i);
    const ax = Math.abs(n.x), ay = Math.abs(n.y);
    if (ax > 0.5) {
      uv[i * 2] = v.z / scale;
      uv[i * 2 + 1] = v.y / scale;
    } else if (ay > 0.5) {
      uv[i * 2] = v.x / scale;
      uv[i * 2 + 1] = v.z / scale;
    } else {
      uv[i * 2] = v.x / scale;
      uv[i * 2 + 1] = v.y / scale;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  mesh.geometry = g;
}

function wallPiece(
  x0: number, x1: number, y0: number, y1: number, z0: number, z1: number,
  faces: { px?: boolean; nx?: boolean; py?: boolean; ny?: boolean; pz?: boolean; nz?: boolean },
): THREE.Mesh {
  const wall = new THREE.MeshStandardMaterial({ map: wallpaperTexture(), roughness: 0.92 });
  const cut = mat(CUT, { roughness: 0.95 });
  const pick = (isCut?: boolean) => (isCut ? cut : wall);
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  const m = new THREE.Mesh(g, [pick(faces.px), pick(faces.nx), pick(faces.py), pick(faces.ny), pick(faces.pz), pick(faces.nz)]);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  m.castShadow = true;
  m.receiveShadow = true;
  worldUV(m);
  return m;
}

export function buildRoom(): RoomShell {
  const root = new THREE.Group();
  root.name = 'room';
  const { minX, maxX, minZ, maxZ, height: H, wallT: T, floorT } = ROOM;

  // ---- 床 ----
  const wood = woodFloorTexture();
  wood.repeat.set((maxX - minX + T) / 1.25, (maxZ - minZ + T) / 1.25);
  const floorMat = new THREE.MeshStandardMaterial({ map: wood, roughness: 0.55, metalness: 0 });
  const cutMat = mat(CUT, { roughness: 0.95 });
  const floor = new THREE.Mesh(new THREE.BoxGeometry(maxX - minX + T, floorT, maxZ - minZ + T), [
    cutMat, cutMat, floorMat, cutMat, cutMat, cutMat,
  ]);
  floor.position.set((minX - T + maxX) / 2, -floorT / 2, (minZ - T + maxZ) / 2);
  floor.receiveShadow = true;
  root.add(floor);

  // 床下の台座（模型っぽさ）
  const plinth = box(maxX - minX + T + 0.08, 0.06, maxZ - minZ + T + 0.08, mat('#2a2624', { roughness: 0.6 }), 0.02);
  plinth.position.set(floor.position.x, -floorT - 0.06, floor.position.z);
  root.add(plinth);

  // ---- 奥の壁（窓穴あり） ----
  const bz0 = minZ - T, bz1 = minZ;
  const bx0 = minX - T, bx1 = maxX;
  root.add(wallPiece(bx0, WINDOW.x0, 0, H, bz0, bz1, { py: true, nz: true }));
  root.add(wallPiece(WINDOW.x1, bx1, 0, H, bz0, bz1, { py: true, px: true, nz: true }));
  root.add(wallPiece(WINDOW.x0, WINDOW.x1, 0, WINDOW.y0, bz0, bz1, { nz: true }));
  root.add(wallPiece(WINDOW.x0, WINDOW.x1, WINDOW.y1, H, bz0, bz1, { py: true, nz: true }));

  // ---- 左の壁（ドア穴あり） ----
  const lx0 = minX - T, lx1 = minX;
  root.add(wallPiece(lx0, lx1, 0, H, minZ, DOOR.z0, { py: true, nx: true }));
  root.add(wallPiece(lx0, lx1, 0, H, DOOR.z1, maxZ, { py: true, nx: true, pz: true }));
  root.add(wallPiece(lx0, lx1, DOOR.h, H, DOOR.z0, DOOR.z1, { py: true, nx: true }));

  // ---- 巾木 ----
  const bb = mat('#efe9df', { roughness: 0.6 });
  root.add(at(box(maxX - minX, 0.07, 0.012, bb), (minX + maxX) / 2, 0, minZ + 0.006));
  root.add(at(box(0.012, 0.07, DOOR.z0 - minZ, bb), minX + 0.006, 0, (minZ + DOOR.z0) / 2));
  root.add(at(box(0.012, 0.07, maxZ - DOOR.z1, bb), minX + 0.006, 0, (DOOR.z1 + maxZ) / 2));

  // ---- 窓 ----
  const alu = mat('#c9ccd0', { roughness: 0.35, metalness: 0.6 });
  const wx = (WINDOW.x0 + WINDOW.x1) / 2;
  const ww = WINDOW.x1 - WINDOW.x0;
  const wh = WINDOW.y1 - WINDOW.y0;
  const wz = minZ - T / 2;
  const frame = group(
    at(box(ww, 0.04, T, alu), wx, WINDOW.y0, wz),
    at(box(ww, 0.04, T, alu), wx, WINDOW.y1 - 0.04, wz),
    at(box(0.04, wh, T, alu), WINDOW.x0 + 0.02, WINDOW.y0, wz),
    at(box(0.04, wh, T, alu), WINDOW.x1 - 0.02, WINDOW.y0, wz),
  );
  // 引き違いの2枚
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: '#dfefff', roughness: 0.05, metalness: 0, transparent: true, opacity: 0.12, depthWrite: false,
  });
  const windowGlass: THREE.Mesh[] = [];
  for (let i = 0; i < 2; i++) {
    const px = WINDOW.x0 + ww * (i === 0 ? 0.27 : 0.73);
    const pz = wz + (i === 0 ? -0.02 : 0.02);
    const sash = group(
      at(box(ww / 2 + 0.02, 0.03, 0.03, alu), 0, 0.02, 0),
      at(box(ww / 2 + 0.02, 0.03, 0.03, alu), 0, wh - 0.09, 0),
      at(box(0.03, wh - 0.06, 0.03, alu), -ww / 4, 0.02, 0),
      at(box(0.03, wh - 0.06, 0.03, alu), ww / 4, 0.02, 0),
    );
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(ww / 2 - 0.02, wh - 0.1), glassMat);
    glass.position.set(0, wh / 2 - 0.03, 0);
    glass.castShadow = false;
    sash.add(glass);
    windowGlass.push(glass);
    sash.position.set(px, WINDOW.y0 + 0.02, pz);
    frame.add(sash);
  }
  // 内側の窓台
  frame.add(at(box(ww + 0.08, 0.025, 0.1, mat('#f3efe8', { roughness: 0.5 })), wx, WINDOW.y0 - 0.025, minZ + 0.03));
  root.add(shadowed(frame, true, true));

  // ---- カーテン ----
  const rod = cyl(0.012, 0.012, ww + 0.5, alu, 8, false);
  rod.rotation.z = Math.PI / 2;
  rod.position.set(wx, WINDOW.y1 + 0.12, minZ + 0.08);
  root.add(rod);
  const curtainMat = new THREE.MeshStandardMaterial({ color: '#3d4f6b', roughness: 0.95, side: THREE.DoubleSide });
  const curtainL = makeCurtain(0.32, WINDOW.y1 + 0.12 - 0.35, curtainMat);
  const curtainR = makeCurtain(0.32, WINDOW.y1 + 0.12 - 0.35, curtainMat);
  curtainL.position.set(WINDOW.x0 - 0.06, 0.35, minZ + 0.09);
  curtainR.position.set(WINDOW.x1 + 0.06, 0.35, minZ + 0.09);
  curtainR.scale.x = -1;
  root.add(curtainL, curtainR);

  // ---- ドア ----
  const doorW = DOOR.z1 - DOOR.z0;
  const casing = mat('#e9e2d6', { roughness: 0.55 });
  root.add(at(box(0.02, DOOR.h + 0.05, 0.05, casing), minX + 0.01, 0, DOOR.z0 - 0.02));
  root.add(at(box(0.02, DOOR.h + 0.05, 0.05, casing), minX + 0.01, 0, DOOR.z1 + 0.02));
  root.add(at(box(0.02, 0.05, doorW + 0.09, casing), minX + 0.01, DOOR.h, (DOOR.z0 + DOOR.z1) / 2));
  const door = new THREE.Group();
  door.position.set(minX + 0.02, 0, DOOR.z1 - 0.01);
  const slab = box(0.035, DOOR.h - 0.01, doorW - 0.02, mat('#d8cbb6', { roughness: 0.5 }), 0.005);
  slab.position.set(0, 0, -(doorW - 0.02) / 2);
  door.add(slab);
  // 装飾のスリットガラス
  const slit = box(0.037, DOOR.h * 0.5, 0.08, mat('#a9b4b8', { roughness: 0.2, metalness: 0.1 }));
  slit.position.set(0, 0.6, -doorW * 0.5);
  door.add(slit);
  const knob = group(
    at(cyl(0.022, 0.022, 0.06, mat('#b8b2a6', { metalness: 0.8, roughness: 0.3 }), 12, false), 0.04, 0, 0),
    at(cyl(0.022, 0.022, 0.06, mat('#b8b2a6', { metalness: 0.8, roughness: 0.3 }), 12, false), -0.04, 0, 0),
  );
  knob.children.forEach((c) => (c.rotation.z = Math.PI / 2));
  knob.position.set(0, 0.95, -(doorW - 0.1));
  door.add(knob);
  root.add(door);

  // ドアの向こうの廊下：壁の外側に薄い板を貼り、ドア越しにだけ薄暗い廊下が見える
  const hall = document.createElement('canvas');
  hall.width = 128;
  hall.height = 256;
  const hctx = hall.getContext('2d')!;
  const hg = hctx.createRadialGradient(64, 60, 10, 64, 120, 200);
  hg.addColorStop(0, '#6d6458');
  hg.addColorStop(1, '#1d1a17');
  hctx.fillStyle = hg;
  hctx.fillRect(0, 0, 128, 256);
  hctx.fillStyle = 'rgba(0,0,0,0.35)';
  hctx.fillRect(0, 200, 128, 56);
  const hallTex = new THREE.CanvasTexture(hall);
  hallTex.colorSpace = THREE.SRGBColorSpace;
  const hallMat = new THREE.MeshStandardMaterial({ map: hallTex, roughness: 1, emissive: '#ffffff', emissiveMap: hallTex, emissiveIntensity: 0.05 });
  const backing = new THREE.Mesh(new THREE.BoxGeometry(0.03, H, maxZ - DOOR.z0 + 0.06), [cutMat, hallMat, cutMat, cutMat, cutMat, cutMat]);
  backing.position.set(minX - T - 0.015, H / 2, (DOOR.z0 - 0.06 + maxZ) / 2);
  root.add(backing);
  const hallFloor = box(T + 0.01, 0.01, DOOR.z1 - DOOR.z0, mat('#8a7a68', { roughness: 0.6 }));
  hallFloor.position.set(minX - T / 2, 0, (DOOR.z0 + DOOR.z1) / 2);
  root.add(hallFloor);
  const corridorLight = new THREE.PointLight('#ffd9a8', 0, 3, 2);
  corridorLight.position.set(minX - 0.05, 1.9, (DOOR.z0 + DOOR.z1) / 2);
  root.add(corridorLight);

  // ---- 影だけ落とす見えない天井と、手前・右の見えない壁 ----
  const ghost = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(maxX - minX + 0.4, 0.05, maxZ - minZ + 0.4), ghost);
  ceiling.position.set((minX + maxX) / 2, H + 0.03, (minZ + maxZ) / 2);
  ceiling.castShadow = true;
  const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.05, H, maxZ - minZ + 0.4), ghost);
  rightWall.position.set(maxX + 0.12, H / 2, 0);
  rightWall.castShadow = true;
  const frontWall = new THREE.Mesh(new THREE.BoxGeometry(maxX - minX + 0.4, H, 0.05), ghost);
  frontWall.position.set(0, H / 2, maxZ + 0.12);
  frontWall.castShadow = true;
  root.add(ceiling, rightWall, frontWall);

  return { root, door, windowGlass, curtainL, curtainR, corridorLight };
}

/** ひだのあるカーテン。原点は左下 */
function makeCurtain(w: number, h: number, m: THREE.Material): THREE.Mesh {
  const g = new THREE.PlaneGeometry(w, h, 24, 6);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const t = (x + w / 2) / w;
    const folds = Math.sin(t * Math.PI * 9) * 0.03;
    // 下に行くほど少し広がる
    const flare = (1 - (y + h / 2) / h) * 0.04;
    pos.setX(i, x + w / 2 + (t - 0.5) * flare);
    pos.setY(i, y + h / 2);
    pos.setZ(i, folds + 0.02);
  }
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, m);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
