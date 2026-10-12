import * as THREE from 'three';
import { DEG } from '../core/math';

// 固定カメラ。画面の縦横比に合わせて距離と注視点だけ調整する。

const AZIMUTH = 36 * DEG; // +z から +x 側へ
const ELEVATION = 29 * DEG;
const TARGET = new THREE.Vector3(-0.05, 0.75, 0.0);

const CORNERS: THREE.Vector3[] = [];
for (const x of [-1.95, 1.85]) for (const y of [-0.22, 2.42]) for (const z of [-1.65, 1.55]) CORNERS.push(new THREE.Vector3(x, y, z));

export function createCamera(): THREE.PerspectiveCamera {
  return new THREE.PerspectiveCamera(22, 1, 0.5, 60);
}

export function fitCamera(cam: THREE.PerspectiveCamera, aspect: number, debugCam?: number[]): void {
  cam.aspect = aspect;
  if (debugCam && debugCam.length >= 4) {
    // 開発用：注視点と距離を指定
    cam.fov = 22;
    cam.updateProjectionMatrix();
    const [x, y, z, d, az = 36, el = 20] = debugCam;
    const dir = new THREE.Vector3(Math.sin(az * DEG) * Math.cos(el * DEG), Math.sin(el * DEG), Math.cos(az * DEG) * Math.cos(el * DEG));
    cam.position.set(x, y, z).addScaledVector(dir, d);
    cam.lookAt(x, y, z);
    cam.updateMatrixWorld(true);
    return;
  }
  // 縦長の画面では少し画角を広げ、端は多少切れてもよしとする
  const portrait = aspect < 1;
  cam.fov = portrait ? 30 : 22;
  cam.updateProjectionMatrix();
  const dir = new THREE.Vector3(Math.sin(AZIMUTH) * Math.cos(ELEVATION), Math.sin(ELEVATION), Math.cos(AZIMUTH) * Math.cos(ELEVATION));
  const target = TARGET.clone();
  if (portrait) target.add(new THREE.Vector3(-0.08, -0.05, 0.05));
  const margin = portrait ? 1.12 : 0.99;
  let dist = 12;
  const v = new THREE.Vector3();
  for (let i = 0; i < 4; i++) {
    cam.position.copy(target).addScaledVector(dir, dist);
    cam.lookAt(target);
    cam.updateMatrixWorld(true);
    let mx = 0, my = 0;
    for (const c of CORNERS) {
      v.copy(c).project(cam);
      mx = Math.max(mx, Math.abs(v.x));
      my = Math.max(my, Math.abs(v.y));
    }
    const need = Math.max(mx / margin, my / 0.95);
    dist *= 0.35 + 0.65 * need;
  }
  cam.position.copy(target).addScaledVector(dir, dist);
  cam.lookAt(target);
  cam.updateMatrixWorld(true);
}
