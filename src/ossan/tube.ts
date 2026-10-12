import * as THREE from 'three';

// 骨に沿った「なめらかな筒」をスキンメッシュで作る（肘や膝で切れ目が出ない）。
// 静止姿勢（直立）の座標で、水平な楕円リングを積み重ねる。

export interface Ring {
  y: number;
  rx: number;
  rz: number;
  /** 中心のずれ */
  x?: number;
  z?: number;
  /** [骨A, 骨B, Bの重み] */
  w: [number, number, number];
}

const SEG = 18;

export function tubeGeometry(rings: Ring[], capTop = true, capBottom = true): THREE.BufferGeometry {
  // 端は半球っぽく丸める（平たいフタにならないように）
  const all: Ring[] = [];
  const CAP = [0.92, 0.7, 0.38];
  if (capTop) {
    const r = rings[0];
    const h = Math.min(r.rx, r.rz) * 0.75;
    for (const c of [...CAP].reverse()) {
      const th = Math.acos(c);
      all.push({ ...r, y: r.y + Math.sin(th) * h, rx: r.rx * c, rz: r.rz * c });
    }
  }
  all.push(...rings);
  if (capBottom) {
    const r = rings[rings.length - 1];
    const h = Math.min(r.rx, r.rz) * 0.8;
    for (const c of CAP) {
      const th = Math.acos(c);
      all.push({ ...r, y: r.y - Math.sin(th) * h, rx: r.rx * c, rz: r.rz * c });
    }
  }
  const pos: number[] = [];
  const skinIdx: number[] = [];
  const skinW: number[] = [];
  const index: number[] = [];
  const pushV = (x: number, y: number, z: number, w: [number, number, number]) => {
    pos.push(x, y, z);
    skinIdx.push(w[0], w[1], 0, 0);
    skinW.push(1 - w[2], w[2], 0, 0);
    return pos.length / 3 - 1;
  };
  const ringStart: number[] = [];
  for (const r of all) {
    ringStart.push(pos.length / 3);
    for (let i = 0; i <= SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      pushV((r.x ?? 0) + Math.sin(a) * r.rx, r.y, (r.z ?? 0) + Math.cos(a) * r.rz, r.w);
    }
  }
  for (let k = 0; k < all.length - 1; k++) {
    const a0 = ringStart[k], b0 = ringStart[k + 1];
    for (let i = 0; i < SEG; i++) {
      const a = a0 + i, b = a0 + i + 1, c = b0 + i, d = b0 + i + 1;
      index.push(a, c, b, b, c, d);
    }
  }
  if (capTop) {
    const r = all[0];
    const top = pushV(r.x ?? 0, r.y + Math.min(r.rx, r.rz) * 0.25, r.z ?? 0, r.w);
    for (let i = 0; i < SEG; i++) index.push(top, ringStart[0] + i, ringStart[0] + i + 1);
  }
  if (capBottom) {
    const r = all[all.length - 1];
    const bot = pushV(r.x ?? 0, r.y - Math.min(r.rx, r.rz) * 0.25, r.z ?? 0, r.w);
    const s0 = ringStart[all.length - 1];
    for (let i = 0; i < SEG; i++) index.push(bot, s0 + i + 1, s0 + i);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIdx, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinW, 4));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** 頂点位置だけ作り直す（体重の変化など） */
export function updateTube(g: THREE.BufferGeometry, rings: Ring[], capTop = true, capBottom = true): void {
  const fresh = tubeGeometry(rings, capTop, capBottom);
  (g.getAttribute('position') as THREE.BufferAttribute).copy(fresh.getAttribute('position') as THREE.BufferAttribute);
  g.getAttribute('position').needsUpdate = true;
  g.computeVertexNormals();
  fresh.dispose();
}
