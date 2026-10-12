import * as THREE from 'three';
import { noise1 } from '../core/random';

// 薄毛の進行度に応じて髪のメッシュを作り直す。
// level: 1 = ふさふさ, 0 = つるつる。おっさんは 0.5 前後から少しずつ減っていく。

/** 方向 d（頭の中心から見た単位ベクトル、+z が顔）での毛の密度 0..1 */
function density(d: THREE.Vector3, level: number): number {
  const recede = 1 - level; // 0..1
  const ax = Math.abs(d.x);
  // 下限：耳より上、後ろは襟足まで
  const lower = d.z < 0 ? -0.55 + Math.max(0, d.z + 0.2) * 0.4 : -0.15 + d.z * 0.9;
  if (d.y < lower) return 0;
  // 耳の周りは刈り上げ
  if (ax > 0.82 && d.y < 0.05 && d.z > -0.35) return 0;
  // 前髪の生え際（M字に後退）
  const temple = Math.exp(-Math.pow((ax - 0.42) / 0.2, 2));
  const hairline = 0.42 + recede * 0.42 + temple * recede * 0.32 - (1 - recede) * 0.1;
  if (d.z > 0.2 && ax < 0.78) {
    const jitter = noise1(d.x * 9, 7) * 0.04;
    // 横に行くほど生え際は下がる（もみあげへ）
    const side = Math.pow(Math.max(0, ax - 0.5) / 0.28, 1.5) * 0.7;
    if (d.y < hairline + jitter + (d.z - 0.2) * 0.5 - side) return 0;
  }
  if (d.z > 0.45 && ax >= 0.78) return 0;
  // 頭頂部（つむじ）の薄さ
  const crown = new THREE.Vector3(0, 0.82, -0.57).normalize();
  const cd = d.distanceTo(crown);
  const crownR = 0.05 + recede * 0.55;
  if (cd < crownR) return 0;
  // 頭頂〜前にかけては薄い（地肌が透ける）
  const top = Math.max(0, d.y - 0.55) / 0.45;
  let dens = 1 - top * (0.25 + recede * 0.9);
  dens -= Math.max(0, 1 - (cd - crownR) / 0.18) * 0.6;
  return Math.max(0, Math.min(1, dens));
}

/** 髪のメッシュ。頂点アルファで密度を表し、生え際はふわっとぼける */
export function buildHair(level: number, radius: number): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(radius, 64, 44);
  const pos = g.getAttribute('position');
  const idx = g.getIndex()!;
  const dens = new Float32Array(pos.count);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    dens[i] = density(v, level);
  }
  const keep: number[] = [];
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i), b = idx.getX(i + 1), c = idx.getX(i + 2);
    if (Math.max(dens[a], dens[b], dens[c]) > 0.02) keep.push(a, b, c);
  }
  const col = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = v.clone().normalize();
    const d = dens[i];
    const puff = 1 + 0.02 * d + (n.y > 0.3 ? 0.005 : 0);
    pos.setXYZ(i, v.x * puff, v.y * puff, v.z * puff);
    // こめかみは白髪まじり
    const grey = Math.max(0, Math.abs(n.x) - 0.6) * 0.9 * (n.y < 0.4 ? 1 : 0.3);
    col[i * 4] = 1 + grey;
    col[i * 4 + 1] = 1 + grey;
    col[i * 4 + 2] = 1 + grey * 1.1;
    const a = Math.min(1, Math.max(0, (d - 0.02) / 0.55));
    col[i * 4 + 3] = a * a * (3 - 2 * a) * 0.96;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 4));
  g.setIndex(keep);
  g.computeVertexNormals();
  return g;
}
