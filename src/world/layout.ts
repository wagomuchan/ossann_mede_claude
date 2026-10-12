// 部屋のレイアウト定数。室内は x∈[-1.8,1.8], z∈[-1.5,1.5], 床 y=0。
// 奥の壁(z=-1.5)と左の壁(x=-1.8)だけがあり、手前と右は断面。

export const ROOM = {
  minX: -1.8,
  maxX: 1.8,
  minZ: -1.5,
  maxZ: 1.5,
  height: 2.4,
  wallT: 0.12,
  floorT: 0.16,
};

export const WINDOW = { x0: 0.3, x1: 1.4, y0: 0.9, y1: 2.05 };
export const DOOR = { z0: 0.72, z1: 1.45, h: 2.0 };

export const SPOT = {
  desk: { x: -1.5, z: -0.95 },
  chair: { x: -0.98, z: -0.95 },
  bed: { x: 0.85, z: -1.03, x0: -0.1, x1: 1.8, z0: -1.5, z1: -0.56, top: 0.42 },
  mirror: { x: -0.3, z: -1.47 },
  clock: { x: -0.5, y: 1.98, z: -1.5 },
  shelf: { x: -0.72, z: -1.35 },
  fridge: { x: -1.53, z: 0.12 },
  table: { x: 0.45, z: 0.35 },
  zaisu: { x: -0.2, z: 0.35 },
  tv: { x: 1.62, z: 0.35 },
  trash: { x: -1.07, z: -1.36 },
  boxes: { x: 1.52, z: -0.35 },
  laundry: { x: 1.42, z: 1.24 },
  fan: { x: 0.2, z: 1.32 },
  scale: { x: -0.3, z: -1.1 },
  humidifier: { x: 1.6, z: 1.08 },
  coil: { x: 1.68, z: 1.0 },
};
