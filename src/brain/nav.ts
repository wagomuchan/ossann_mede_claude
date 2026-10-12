import * as THREE from 'three';

// 部屋の中を歩くための経路グラフ。家具を避けるように手で置いた点をつなぐ。

export const NODES = {
  desk: new THREE.Vector3(-0.6, 0, -0.68),
  hub: new THREE.Vector3(-0.5, 0, -0.22),
  mirror: new THREE.Vector3(-0.3, 0, -0.84),
  center: new THREE.Vector3(0.3, 0, -0.28),
  bedSide: new THREE.Vector3(0.62, 0, -0.33),
  rightMid: new THREE.Vector3(1.08, 0, -0.2),
  frontRight: new THREE.Vector3(1.0, 0, 0.98),
  laundry: new THREE.Vector3(0.95, 0, 0.82),
  frontMid: new THREE.Vector3(-0.35, 0, 1.02),
  leftMid: new THREE.Vector3(-0.78, 0, 0.3),
  fridge: new THREE.Vector3(-0.98, 0, 0.12),
  zaisu: new THREE.Vector3(-0.2, 0, -0.12),
  door: new THREE.Vector3(-1.35, 0, 1.08),
  outside: new THREE.Vector3(-2.3, 0, 1.08),
} as const;

export type NodeId = keyof typeof NODES;

const EDGES: [NodeId, NodeId][] = [
  ['desk', 'hub'],
  ['hub', 'mirror'],
  ['desk', 'mirror'],
  ['hub', 'center'],
  ['center', 'bedSide'],
  ['bedSide', 'rightMid'],
  ['center', 'rightMid'],
  ['rightMid', 'frontRight'],
  ['frontRight', 'laundry'],
  ['frontRight', 'frontMid'],
  ['frontMid', 'door'],
  ['frontMid', 'leftMid'],
  ['leftMid', 'hub'],
  ['leftMid', 'fridge'],
  ['leftMid', 'zaisu'],
  ['leftMid', 'door'],
  ['fridge', 'hub'],
  ['fridge', 'door'],
  ['zaisu', 'hub'],
  ['zaisu', 'center'],
  ['door', 'outside'],
  ['mirror', 'center'],
];

const ADJ = new Map<NodeId, NodeId[]>();
for (const [a, b] of EDGES) {
  if (!ADJ.has(a)) ADJ.set(a, []);
  if (!ADJ.has(b)) ADJ.set(b, []);
  ADJ.get(a)!.push(b);
  ADJ.get(b)!.push(a);
}

function shortest(from: NodeId, to: NodeId): NodeId[] {
  if (from === to) return [from];
  const dist = new Map<NodeId, number>([[from, 0]]);
  const prev = new Map<NodeId, NodeId>();
  const open = new Set<NodeId>([from]);
  while (open.size) {
    let cur: NodeId | null = null;
    for (const n of open) if (cur === null || dist.get(n)! < dist.get(cur)!) cur = n;
    open.delete(cur!);
    if (cur === to) break;
    for (const nb of ADJ.get(cur!) ?? []) {
      const d = dist.get(cur!)! + NODES[cur!].distanceTo(NODES[nb]);
      if (d < (dist.get(nb) ?? Infinity)) {
        dist.set(nb, d);
        prev.set(nb, cur!);
        open.add(nb);
      }
    }
  }
  const out: NodeId[] = [to];
  let c: NodeId = to;
  while (c !== from) {
    const p = prev.get(c);
    if (!p) return [from, to];
    out.push(p);
    c = p;
  }
  return out.reverse();
}

export interface Path {
  pts: THREE.Vector3[];
  /** 区間ごとの累積距離 */
  cum: number[];
  length: number;
}

const pathCache = new Map<string, Path>();

/** ノード a の近くの点 from から、ノード b の近くの点 to へ */
export function findPath(fromNode: NodeId, from: THREE.Vector3, toNode: NodeId, to: THREE.Vector3): Path {
  const key = `${fromNode}|${toNode}|${from.x.toFixed(2)},${from.z.toFixed(2)}|${to.x.toFixed(2)},${to.z.toFixed(2)}`;
  const hit = pathCache.get(key);
  if (hit) return hit;
  const nodes = shortest(fromNode, toNode);
  const raw: THREE.Vector3[] = [from.clone().setY(0)];
  for (const n of nodes) {
    const p = NODES[n];
    if (raw[raw.length - 1].distanceTo(p) > 0.12) raw.push(p.clone());
  }
  if (raw[raw.length - 1].distanceTo(to) > 0.02) raw.push(to.clone().setY(0));
  // 角を少し丸める
  const pts: THREE.Vector3[] = [raw[0]];
  for (let i = 1; i < raw.length - 1; i++) {
    const a = raw[i - 1], b = raw[i], c = raw[i + 1];
    const r = Math.min(0.18, a.distanceTo(b) * 0.4, b.distanceTo(c) * 0.4);
    const p0 = b.clone().add(a.clone().sub(b).setLength(r));
    const p2 = b.clone().add(c.clone().sub(b).setLength(r));
    for (let k = 0; k <= 4; k++) {
      const t = k / 4;
      const q = new THREE.Vector3()
        .addScaledVector(p0, (1 - t) * (1 - t))
        .addScaledVector(b, 2 * t * (1 - t))
        .addScaledVector(p2, t * t);
      pts.push(q);
    }
  }
  if (raw.length > 1) pts.push(raw[raw.length - 1]);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const path = { pts, cum, length: cum[cum.length - 1] };
  if (pathCache.size > 400) pathCache.clear();
  pathCache.set(key, path);
  return path;
}

/** 経路上の距離 d の位置と進行方向 */
export function samplePath(path: Path, d: number): { pos: THREE.Vector3; yaw: number } {
  const { pts, cum } = path;
  if (pts.length < 2) return { pos: pts[0].clone(), yaw: 0 };
  d = Math.max(0, Math.min(path.length, d));
  let i = 1;
  while (i < cum.length - 1 && cum[i] < d) i++;
  const seg = cum[i] - cum[i - 1] || 1e-6;
  const t = (d - cum[i - 1]) / seg;
  const pos = pts[i - 1].clone().lerp(pts[i], t);
  // 少し先を見て向きを決める（なめらかに曲がる）
  const ahead = Math.min(path.length, d + 0.25);
  let j = 1;
  while (j < cum.length - 1 && cum[j] < ahead) j++;
  const tj = (ahead - cum[j - 1]) / (cum[j] - cum[j - 1] || 1e-6);
  const pa = pts[j - 1].clone().lerp(pts[j], Math.min(1, tj));
  const dir = pa.sub(pos);
  if (dir.lengthSq() < 1e-6) dir.copy(pts[i]).sub(pts[i - 1]);
  return { pos, yaw: Math.atan2(dir.x, dir.z) };
}
