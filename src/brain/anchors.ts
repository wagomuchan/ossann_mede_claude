import * as THREE from 'three';
import { NODES } from './nav';
import type { Place } from './ctx';
import type { Seat } from '../ossan/poses';

// 行動で使う部屋の中の目印（ワールド座標）。

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const PI = Math.PI;

export const A = {
  chairSeat: { pos: V(-0.98, 0.47, -0.95), yaw: -PI / 2 } as Seat,
  kbL: V(-1.385, 0.765, -0.85),
  kbR: V(-1.385, 0.765, -1.01),
  wasd: V(-1.38, 0.765, -0.79),
  mouse: V(-1.37, 0.765, -1.29),
  monitor: V(-1.69, 1.09, -0.93),
  laptop: V(-1.58, 0.92, -0.52),
  mug: V(-1.33, 0.8, -1.47),
  deskTop: V(-1.3, 0.735, -0.62),
  zaisuSeat: { pos: V(-0.2, 0.09, 0.35), yaw: PI / 2 } as Seat,
  tv: V(1.6, 0.7, 0.35),
  tableNear: V(0.2, 0.36, 0.38),
  kotatsuNear: V(0.15, 0.42, 0.38),
  bedEdge: { pos: V(0.55, 0.42, -0.74), yaw: 0 } as Seat,
  pillow: V(1.52, 0.5, -1.02),
  bedDir: V(-1, 0, 0),
  bedside: V(1.66, 0.45, -0.62),
  clock: V(-0.5, 1.98, -1.48),
  window: V(0.85, 1.45, -1.6),
  fridgeHandle: V(-1.24, 0.5, -0.04),
  fridgeInside: V(-1.36, 0.55, 0.12),
  kettle: V(-1.5, 1.2, 0.0),
  microwave: V(-1.33, 1.0, 0.1),
  doorKnob: V(-1.75, 0.95, 0.83),
  mirrorFace: V(-0.3, 1.5, -1.33),
  scale: V(-0.3, 0.025, -1.08),
  laundryBar: V(1.42, 1.24, 1.24),
  bags: V(-1.56, 0.2, 0.58),
};

export const PLACES = {
  desk: { node: 'desk', pos: NODES.desk.clone(), yaw: -PI / 2 } as Place,
  zaisu: { node: 'zaisu', pos: NODES.zaisu.clone(), yaw: PI / 2 } as Place,
  bed: { node: 'bedSide', pos: NODES.bedSide.clone(), yaw: PI } as Place,
  fridge: { node: 'fridge', pos: NODES.fridge.clone(), yaw: -PI / 2 } as Place,
  mirror: { node: 'mirror', pos: NODES.mirror.clone(), yaw: PI } as Place,
  door: { node: 'door', pos: NODES.door.clone(), yaw: -PI / 2 } as Place,
  outside: { node: 'outside', pos: NODES.outside.clone(), yaw: PI / 2 } as Place,
  laundry: { node: 'laundry', pos: NODES.laundry.clone(), yaw: 0.83 } as Place,
  center: { node: 'center', pos: NODES.center.clone(), yaw: 0.5 } as Place,
  bags: { node: 'leftMid', pos: V(-1.12, 0, 0.5), yaw: -PI / 2 } as Place,
};
