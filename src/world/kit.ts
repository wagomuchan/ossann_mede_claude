import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// メッシュ生成の小道具。寸法はすべてメートル、y=0 が床。

export type MatLike = THREE.Material | string | number;

const matCache = new Map<string, THREE.MeshStandardMaterial>();

export function mat(color: string | number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  const key = `${color}|${JSON.stringify(opts)}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...opts });
    matCache.set(key, m);
  }
  return m;
}

function toMat(m: MatLike): THREE.Material {
  return m instanceof THREE.Material ? m : mat(m);
}

const geoCache = new Map<string, THREE.BufferGeometry>();
function geo<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = geoCache.get(key) as T | undefined;
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}

export function shadowed<T extends THREE.Object3D>(o: T, cast = true, receive = true): T {
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      c.castShadow = cast;
      c.receiveShadow = receive;
    }
  });
  return o;
}

/** 角丸の箱。位置は底面中心 */
export function box(w: number, h: number, d: number, m: MatLike, r = 0, seg = 2): THREE.Mesh {
  const rr = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  const g =
    rr > 0
      ? geo(`rb${w},${h},${d},${rr},${seg}`, () => new RoundedBoxGeometry(w, h, d, seg, rr).translate(0, h / 2, 0))
      : geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0));
  const mesh = new THREE.Mesh(g, toMat(m));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** 中心基準の箱 */
export function cbox(w: number, h: number, d: number, m: MatLike, r = 0): THREE.Mesh {
  const rr = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  const g =
    rr > 0
      ? geo(`crb${w},${h},${d},${rr}`, () => new RoundedBoxGeometry(w, h, d, 2, rr))
      : geo(`cb${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
  const mesh = new THREE.Mesh(g, toMat(m));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function cyl(rTop: number, rBot: number, h: number, m: MatLike, seg = 16, bottomOrigin = true): THREE.Mesh {
  const g = geo(`c${rTop},${rBot},${h},${seg},${bottomOrigin}`, () => {
    const gg = new THREE.CylinderGeometry(rTop, rBot, h, seg);
    if (bottomOrigin) gg.translate(0, h / 2, 0);
    return gg;
  });
  const mesh = new THREE.Mesh(g, toMat(m));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function sphere(r: number, m: MatLike, ws = 16, hs = 12): THREE.Mesh {
  const g = geo(`s${r},${ws},${hs}`, () => new THREE.SphereGeometry(r, ws, hs));
  const mesh = new THREE.Mesh(g, toMat(m));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function capsule(r: number, len: number, m: MatLike, cap = 6, rad = 12): THREE.Mesh {
  const g = geo(`cap${r},${len},${cap},${rad}`, () => new THREE.CapsuleGeometry(r, len, cap, rad));
  const mesh = new THREE.Mesh(g, toMat(m));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function plane(w: number, h: number, m: MatLike): THREE.Mesh {
  const g = geo(`p${w},${h}`, () => new THREE.PlaneGeometry(w, h));
  const mesh = new THREE.Mesh(g, toMat(m));
  mesh.receiveShadow = true;
  return mesh;
}

export function at<T extends THREE.Object3D>(o: T, x: number, y: number, z: number, ry = 0): T {
  o.position.set(x, y, z);
  o.rotation.y = ry;
  return o;
}

export function group(...children: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  for (const c of children) g.add(c);
  return g;
}

/** 床に落ちる柔らかい影（家具の接地感を出す） */
let blobTex: THREE.Texture | null = null;
export function blobShadow(w: number, d: number, opacity = 0.35): THREE.Mesh {
  if (!blobTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(64, 64, 10, 64, 64, 64);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    blobTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity, depthWrite: false });
  const mesh = new THREE.Mesh(geo('blob', () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)), m);
  mesh.scale.set(w, 1, d);
  mesh.position.y = 0.003;
  mesh.renderOrder = 1;
  return mesh;
}
