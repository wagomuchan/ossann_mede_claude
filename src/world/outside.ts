import * as THREE from 'three';
import { ROOM } from './layout';
import { Rng } from '../core/random';
import type { Season } from '../core/time';
import type { Weather } from './environment';

// 窓の外の景色。カメラから見て窓越しにしか見えない位置に置いた背景板。

export interface OutsideState {
  dayLight: number; // 0..1
  twilight: number; // 朝夕の焼け具合 0..1
  sunX: number; // -1..1（窓の中での太陽の左右）
  sunY: number; // -1..1
  night: number; // 0..1
  weather: Weather;
  season: Season;
  t: number; // 経過秒（現実）
  windowLights: number; // 向かいの建物の窓の点灯率
}

const BACK_Z = ROOM.minZ - ROOM.wallT - 0.42;
/** 背景板の範囲（カメラから窓越しに見える部分だけ） */
const BD = { x0: -0.25, x1: 1.45, y0: 0.42, y1: 1.98 };

const skyVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const skyFrag = /* glsl */ `
varying vec2 vUv;
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uSunColor;
uniform vec2 uSun;
uniform float uSunVis;
uniform float uStars;
uniform float uCloud;
uniform float uOvercast;
uniform float uTime;
uniform float uMoon;
uniform vec3 uCloudColor;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}
void main() {
  vec2 uv = vUv;
  vec3 col = mix(uHorizon, uTop, smoothstep(0.0, 1.0, uv.y));
  // 太陽 / 月
  vec2 d = (uv - uSun) * vec2(2.2, 1.0);
  float r = length(d);
  col += uSunColor * (smoothstep(0.05, 0.035, r) * 2.5 + exp(-r * 7.0) * 0.6) * uSunVis * (1.0 - uOvercast * 0.85);
  vec2 md = (uv - vec2(0.72, 0.78)) * vec2(2.2, 1.0);
  float mr = length(md);
  float moon = smoothstep(0.035, 0.03, mr) * (1.0 - smoothstep(0.03, 0.02, length(md - vec2(0.012, 0.006))));
  col += vec3(0.95, 0.93, 0.85) * (moon * 1.4 + exp(-mr * 14.0) * 0.08) * uMoon * (1.0 - uOvercast);
  // 星
  vec2 sg = floor(uv * vec2(180.0, 80.0));
  float s = hash(sg);
  float tw = 0.6 + 0.4 * sin(uTime * (1.0 + s * 3.0) + s * 40.0);
  col += vec3(1.0) * step(0.985, s) * tw * uStars * smoothstep(0.35, 0.9, uv.y) * (1.0 - uOvercast);
  // 雲
  vec2 cp = uv * vec2(3.0, 1.6) + vec2(uTime * 0.004, 0.0);
  float c = fbm(cp + fbm(cp * 0.7) * 0.6);
  float cover = mix(0.62, 0.25, uCloud);
  float cm = smoothstep(cover, cover + 0.25, c) * smoothstep(0.15, 0.6, uv.y);
  col = mix(col, uCloudColor, cm * 0.85);
  col = mix(col, uCloudColor * 0.9, uOvercast * 0.75);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export class Outside {
  readonly root = new THREE.Group();
  private skyMat: THREE.ShaderMaterial;
  private bldMat: THREE.MeshBasicMaterial;
  private winMat: THREE.MeshBasicMaterial;
  private winTextures: THREE.CanvasTexture[];
  private tree = new THREE.Group();
  private treeMat!: THREE.MeshBasicMaterial;
  private rain: THREE.LineSegments;
  private rainPos: Float32Array;
  private flakes: THREE.Points;
  private flakePos: Float32Array;
  private flakeVel: Float32Array;
  private flakeMat: THREE.PointsMaterial;
  private bounds = { x0: -0.15, x1: 1.45, y0: 0.45, y1: 2.0, z0: BACK_Z + 0.05, z1: ROOM.minZ - ROOM.wallT - 0.05 };

  constructor() {
    this.root.name = 'outside';
    // 空
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: skyVert,
      fragmentShader: skyFrag,
      uniforms: {
        uTop: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uSunColor: { value: new THREE.Color() },
        uSun: { value: new THREE.Vector2(0.5, 0.7) },
        uSunVis: { value: 0 },
        uStars: { value: 0 },
        uCloud: { value: 0.3 },
        uOvercast: { value: 0 },
        uTime: { value: 0 },
        uMoon: { value: 0 },
        uCloudColor: { value: new THREE.Color() },
      },
      depthWrite: true,
      toneMapped: false,
    });
    // 窓越しに見える範囲だけを覆う（壁の外にはみ出さない）
    const skyW = BD.x1 - BD.x0, skyH = BD.y1 - BD.y0;
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(skyW, skyH), this.skyMat);
    sky.position.set((BD.x0 + BD.x1) / 2, (BD.y0 + BD.y1) / 2, BACK_Z - 0.02);
    this.root.add(sky);

    // 向かいの建物
    const [bldTex, winTexes] = buildingTextures();
    this.winTextures = winTexes;
    this.bldMat = new THREE.MeshBasicMaterial({ map: bldTex, transparent: true, toneMapped: false });
    this.winMat = new THREE.MeshBasicMaterial({ map: winTexes[0], transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const bw = BD.x1 - BD.x0, bh = 1.0;
    const bld = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), this.bldMat);
    bld.position.set((BD.x0 + BD.x1) / 2, BD.y0 + bh / 2, BACK_Z + 0.01);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), this.winMat);
    win.position.set((BD.x0 + BD.x1) / 2, BD.y0 + bh / 2, BACK_Z + 0.012);
    this.root.add(bld, win);

    // 窓際の木（季節で葉の色が変わる）
    this.buildTree();

    // 雨
    const RAIN = 260;
    this.rainPos = new Float32Array(RAIN * 6);
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: '#c8d4e0', transparent: true, opacity: 0.35, depthWrite: false }));
    this.rain.frustumCulled = false;
    const rng = new Rng(77);
    for (let i = 0; i < RAIN; i++) this.respawnRain(i, rng.next());
    this.root.add(this.rain);

    // 雪・花びら・落ち葉
    const FL = 140;
    this.flakePos = new Float32Array(FL * 3);
    this.flakeVel = new Float32Array(FL * 3);
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(this.flakePos, 3));
    this.flakeMat = new THREE.PointsMaterial({ color: '#ffffff', size: 0.025, transparent: true, opacity: 0.9, depthWrite: false, map: dotTexture(), alphaTest: 0.05 });
    this.flakes = new THREE.Points(fg, this.flakeMat);
    this.flakes.frustumCulled = false;
    for (let i = 0; i < FL; i++) this.respawnFlake(i, rng, true);
    this.root.add(this.flakes);
  }

  private buildTree(): void {
    // 窓の上のほうに枝が張り出している。季節ごとに描いた絵を貼る
    this.treeMat = new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false, depthWrite: false });
    const w = 1.5, h = 0.95;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.treeMat);
    plane.position.set(1.45 - w / 2, 1.1 + h / 2, BACK_Z + 0.16);
    this.tree.add(plane);
    this.root.add(this.tree);
  }

  private respawnRain(i: number, f: number): void {
    const b = this.bounds;
    const x = b.x0 + Math.random() * (b.x1 - b.x0);
    const z = b.z0 + Math.random() * (b.z1 - b.z0);
    const y = b.y0 + f * (b.y1 - b.y0);
    const p = this.rainPos;
    p[i * 6] = x; p[i * 6 + 1] = y; p[i * 6 + 2] = z;
    p[i * 6 + 3] = x - 0.01; p[i * 6 + 4] = y - 0.09; p[i * 6 + 5] = z;
  }

  private respawnFlake(i: number, rng: Rng | null, anywhere: boolean): void {
    const b = this.bounds;
    const r = () => (rng ? rng.next() : Math.random());
    this.flakePos[i * 3] = b.x0 + r() * (b.x1 - b.x0);
    this.flakePos[i * 3 + 1] = anywhere ? b.y0 + r() * (b.y1 - b.y0) : b.y1;
    this.flakePos[i * 3 + 2] = b.z0 + r() * (b.z1 - b.z0);
    this.flakeVel[i * 3] = (r() - 0.5) * 0.1;
    this.flakeVel[i * 3 + 1] = -(0.15 + r() * 0.15);
    this.flakeVel[i * 3 + 2] = 0;
  }

  private lastSeason: Season | null = null;
  private applySeason(season: Season): void {
    if (season === this.lastSeason) return;
    this.lastSeason = season;
    this.treeMat.map?.dispose();
    this.treeMat.map = treeTexture(season);
    this.treeMat.needsUpdate = true;
  }

  update(s: OutsideState, dt: number): void {
    this.applySeason(s.season);
    const u = this.skyMat.uniforms;
    const day = s.dayLight;
    const over = s.weather === 'rain' ? 0.85 : s.weather === 'cloudy' ? 0.6 : s.weather === 'snow' ? 0.75 : 0;
    const top = new THREE.Color('#0b1328').lerp(new THREE.Color('#3f86d6'), day);
    const hor = new THREE.Color('#1a2440').lerp(new THREE.Color('#a9d0f0'), day);
    const dusk = new THREE.Color('#ff8a4a');
    hor.lerp(dusk, s.twilight * 0.75);
    top.lerp(new THREE.Color('#6a5a9a'), s.twilight * 0.35);
    const grey = new THREE.Color('#2a2e36').lerp(new THREE.Color('#9aa3ad'), day);
    top.lerp(grey, over);
    hor.lerp(grey, over * 0.9);
    u.uTop.value.copy(top);
    u.uHorizon.value.copy(hor);
    u.uSunColor.value.set('#fff2d0').lerp(new THREE.Color('#ff9a50'), s.twilight);
    u.uSun.value.set(0.5 + s.sunX * 0.45, 0.35 + s.sunY * 0.5);
    u.uSunVis.value = day > 0.02 ? 1 : 0;
    u.uStars.value = s.night;
    u.uMoon.value = s.night;
    u.uCloud.value = s.weather === 'clear' ? 0.25 : 0.7;
    u.uOvercast.value = over;
    u.uTime.value = s.t;
    u.uCloudColor.value.set('#3a4050').lerp(new THREE.Color('#f4f4f6'), day).lerp(new THREE.Color('#ffb48a'), s.twilight * 0.5);

    // 建物：昼は明るく、夜は暗いシルエット
    const b = 0.12 + day * 0.75 * (1 - over * 0.35);
    this.bldMat.color.setRGB(b, b * 1.02, b * 1.06).lerp(new THREE.Color('#ffb080'), s.twilight * 0.15);
    const wi = Math.min(this.winTextures.length - 1, Math.floor(s.windowLights * this.winTextures.length));
    if (this.winMat.map !== this.winTextures[wi]) {
      this.winMat.map = this.winTextures[wi];
      this.winMat.needsUpdate = true;
    }
    this.winMat.opacity = Math.min(1, s.night * 1.2) * (s.windowLights > 0.02 ? 1 : 0);

    // 木の揺れ
    this.tree.position.x = Math.sin(s.t * 0.7) * 0.004 + Math.sin(s.t * 1.9) * 0.002;
    this.tree.position.y = Math.sin(s.t * 1.1) * 0.002;
    const tb = 0.08 + day * 0.85 * (1 - over * 0.3);
    this.treeMat.color.setRGB(tb, tb, tb).lerp(new THREE.Color('#ffb080'), s.twilight * 0.2);

    // 雨
    const raining = s.weather === 'rain';
    this.rain.visible = raining;
    if (raining) {
      const p = this.rainPos;
      for (let i = 0; i < p.length / 6; i++) {
        p[i * 6 + 1] -= dt * 4.5;
        p[i * 6 + 4] -= dt * 4.5;
        p[i * 6] -= dt * 0.4;
        p[i * 6 + 3] -= dt * 0.4;
        if (p[i * 6 + 4] < this.bounds.y0) this.respawnRain(i, 1);
      }
      (this.rain.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    }

    // 雪・花びら・落ち葉
    let mode: 'snow' | 'petal' | 'leaf' | null = null;
    if (s.weather === 'snow') mode = 'snow';
    else if (s.weather !== 'rain' && s.season === 'spring') mode = 'petal';
    else if (s.weather !== 'rain' && s.season === 'autumn') mode = 'leaf';
    this.flakes.visible = mode !== null;
    if (mode) {
      const count = mode === 'snow' ? 140 : 18;
      this.flakeMat.color.set(mode === 'snow' ? '#ffffff' : mode === 'petal' ? '#ffc4d8' : '#e0782a');
      this.flakeMat.size = mode === 'snow' ? 0.022 : 0.03;
      const speed = mode === 'snow' ? 0.8 : 0.5;
      const p = this.flakePos, v = this.flakeVel;
      for (let i = 0; i < p.length / 3; i++) {
        if (i >= count) {
          p[i * 3 + 1] = -10;
          continue;
        }
        if (p[i * 3 + 1] < -5) this.respawnFlake(i, null, true);
        p[i * 3] += (v[i * 3] + Math.sin(s.t * 1.3 + i) * 0.08) * dt * speed;
        p[i * 3 + 1] += v[i * 3 + 1] * dt * speed;
        if (p[i * 3 + 1] < this.bounds.y0) this.respawnFlake(i, null, false);
      }
      (this.flakes.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    }
  }
}

/** 窓の外の枝（季節ごと）。右から枝が伸び、先に葉や花の塊がつく */
function treeTexture(season: Season): THREE.CanvasTexture {
  const W = 768, H = 486;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  const rng = new Rng(4242);
  const tips: [number, number][] = [];
  const branch = (x: number, y: number, ang: number, len: number, width: number, depth: number) => {
    const x2 = x + Math.cos(ang) * len;
    const y2 = y + Math.sin(ang) * len;
    ctx.strokeStyle = '#3a2e26';
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo((x + x2) / 2 + rng.range(-10, 10), (y + y2) / 2 + rng.range(-10, 10), x2, y2);
    ctx.stroke();
    if (depth <= 0 || width < 1.5) {
      tips.push([x2, y2]);
      return;
    }
    const n = depth > 2 ? 2 : rng.int(2, 3);
    for (let i = 0; i < n; i++) {
      branch(x2, y2, ang + rng.range(-0.7, 0.7), len * rng.range(0.6, 0.8), width * 0.65, depth - 1);
    }
    if (depth < 3) tips.push([x2, y2]);
  };
  branch(W + 10, H * 0.62, Math.PI + 0.35, 230, 22, 4);
  branch(W + 10, H * 0.9, Math.PI + 0.55, 180, 16, 3);
  const palettes: Record<Season, string[]> = {
    spring: ['#f8d0dc', '#f4bccc', '#fde4ec', '#eeaabf', '#ffffff'],
    summer: ['#3f7a2e', '#4f8c34', '#2f6a28', '#5c9a3a', '#6aa844'],
    autumn: ['#d9622b', '#e3a02a', '#b8432a', '#c97a2a', '#e8b84a'],
    winter: [],
  };
  const pal = palettes[season];
  if (pal.length) {
    const size = season === 'spring' ? 6 : 9;
    for (const [tx, ty] of tips) {
      const n = season === 'spring' ? 26 : 34;
      for (let i = 0; i < n; i++) {
        const a = rng.next() * Math.PI * 2, r = Math.sqrt(rng.next()) * 46;
        const x = tx + Math.cos(a) * r * 1.3, y = ty + Math.sin(a) * r;
        ctx.fillStyle = pal[rng.int(0, pal.length - 1)];
        ctx.globalAlpha = rng.range(0.75, 1);
        ctx.beginPath();
        ctx.ellipse(x, y, size * rng.range(0.7, 1.3), size * rng.range(0.5, 0.9), rng.next() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function dotTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(16, 16, 2, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

/** 向かいのマンション群。シルエットと、点灯率の違う窓明かり数段階 */
function buildingTextures(): [THREE.CanvasTexture, THREE.CanvasTexture[]] {
  const W = 1024, H = 512;
  const base = document.createElement('canvas');
  base.width = W;
  base.height = H;
  const ctx = base.getContext('2d')!;
  const rng = new Rng(123);
  type Bld = { x: number; w: number; h: number; tone: number; floors: number; cols: number };
  const blds: Bld[] = [];
  // 奥の列
  let x = -20;
  while (x < W) {
    const w = rng.range(90, 200);
    blds.push({ x, w, h: rng.range(260, 470), tone: rng.range(0.55, 0.7), floors: 0, cols: 0 });
    x += w + rng.range(-10, 20);
  }
  // 手前の列
  x = -40;
  while (x < W) {
    const w = rng.range(140, 260);
    blds.push({ x, w, h: rng.range(150, 300), tone: rng.range(0.75, 0.95), floors: 0, cols: 0 });
    x += w + rng.range(10, 60);
  }
  for (const b of blds) {
    const t = b.tone;
    const r = 200 * t, g = 196 * t, bl = 190 * t;
    ctx.fillStyle = `rgb(${r},${g},${bl})`;
    ctx.fillRect(b.x, H - b.h, b.w, b.h);
    // 影側
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(b.x + b.w * 0.82, H - b.h, b.w * 0.18, b.h);
    // ベランダの線
    b.floors = Math.floor(b.h / 26);
    b.cols = Math.max(2, Math.floor(b.w / 34));
    for (let f = 0; f < b.floors; f++) {
      const y = H - b.h + 10 + f * 26;
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(b.x + 4, y + 16, b.w - 8, 3);
      for (let c = 0; c < b.cols; c++) {
        ctx.fillStyle = 'rgba(40,50,70,0.35)';
        ctx.fillRect(b.x + 8 + c * ((b.w - 16) / b.cols), y + 2, (b.w - 16) / b.cols - 8, 12);
      }
    }
    // 屋上の給水塔
    if (rng.chance(0.4)) {
      ctx.fillStyle = `rgb(${r * 0.8},${g * 0.8},${bl * 0.8})`;
      ctx.fillRect(b.x + b.w * 0.3, H - b.h - 18, 26, 18);
    }
  }
  // 電線
  ctx.strokeStyle = 'rgba(20,20,20,0.6)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(0, 150 + i * 14);
    ctx.quadraticCurveTo(W / 2, 200 + i * 14, W, 150 + i * 14);
    ctx.stroke();
  }
  const bt = new THREE.CanvasTexture(base);
  bt.colorSpace = THREE.SRGBColorSpace;

  // 窓明かり：点灯率ごとに数枚
  const levels = [0.08, 0.2, 0.35, 0.55];
  const wins = levels.map((lv) => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const wc = c.getContext('2d')!;
    const r2 = new Rng(321);
    for (const b of blds) {
      for (let f = 0; f < b.floors; f++) {
        const y = H - b.h + 10 + f * 26;
        for (let col = 0; col < b.cols; col++) {
          const on = r2.next() < lv;
          const warm = r2.next();
          if (!on) continue;
          wc.fillStyle = warm < 0.7 ? 'rgba(255,200,120,0.95)' : warm < 0.9 ? 'rgba(230,240,255,0.9)' : 'rgba(140,170,255,0.85)';
          wc.fillRect(b.x + 8 + col * ((b.w - 16) / b.cols), y + 2, (b.w - 16) / b.cols - 8, 12);
        }
      }
    }
    // 遠くの赤い航空障害灯
    wc.fillStyle = 'rgba(255,60,40,1)';
    wc.fillRect(300, H - 470, 4, 4);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
  return [bt, wins];
}
