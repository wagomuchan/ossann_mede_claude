import * as THREE from 'three';
import { Rng } from '../core/random';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function toTex(c: HTMLCanvasElement, srgb = true, repeat?: [number, number]): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

function noise(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, rng: Rng): void {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng.next() - 0.5) * amount;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

const cache = new Map<string, THREE.Texture>();
function cached<T extends THREE.Texture>(key: string, make: () => T): T {
  let t = cache.get(key) as T | undefined;
  if (!t) {
    t = make();
    cache.set(key, t);
  }
  return t;
}

/** フローリング（板目） */
export function woodFloorTexture(): THREE.CanvasTexture {
  return cached('wood', () => {
    const W = 1024;
    const [c, ctx] = canvas(W, W);
    const rng = new Rng(11);
    const plankW = W / 8;
    for (let i = 0; i < 8; i++) {
      let y = -rng.range(0, W);
      while (y < W) {
        const len = rng.range(W * 0.45, W * 0.9);
        const base = rng.range(0.85, 1.1);
        const r = 168 * base, g = 118 * base, b = 76 * base;
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(i * plankW, y, plankW, len);
        // 木目
        for (let k = 0; k < 22; k++) {
          const x = i * plankW + rng.range(4, plankW - 4);
          ctx.strokeStyle = `rgba(${70 + rng.range(0, 30)},${40},${20},${rng.range(0.05, 0.16)})`;
          ctx.lineWidth = rng.range(0.6, 2.2);
          ctx.beginPath();
          ctx.moveTo(x, y);
          let xx = x;
          for (let yy = y; yy < y + len; yy += 16) {
            xx += rng.range(-1.2, 1.2);
            ctx.lineTo(xx, yy);
          }
          ctx.stroke();
        }
        // 継ぎ目
        ctx.fillStyle = 'rgba(40,22,10,0.55)';
        ctx.fillRect(i * plankW, y + len - 2, plankW, 2);
        y += len;
      }
      ctx.fillStyle = 'rgba(40,22,10,0.6)';
      ctx.fillRect(i * plankW, 0, 2, W);
    }
    noise(ctx, W, W, 10, rng);
    return toTex(c, true, [2, 2]);
  });
}

/** 壁紙（白っぽい織物調） */
export function wallpaperTexture(): THREE.CanvasTexture {
  return cached('wall', () => {
    const W = 512;
    const [c, ctx] = canvas(W, W);
    const rng = new Rng(21);
    ctx.fillStyle = '#ece6dc';
    ctx.fillRect(0, 0, W, W);
    for (let i = 0; i < 4000; i++) {
      ctx.fillStyle = `rgba(${rng.chance(0.5) ? 255 : 150},${rng.chance(0.5) ? 250 : 140},${rng.chance(0.5) ? 240 : 130},0.06)`;
      ctx.fillRect(rng.range(0, W), rng.range(0, W), rng.range(1, 4), rng.range(1, 4));
    }
    noise(ctx, W, W, 8, rng);
    return toTex(c, true, [3, 2]);
  });
}

/** 布地 */
export function fabricTexture(color: string, seed = 1, stripes = false): THREE.CanvasTexture {
  return cached(`fabric-${color}-${seed}-${stripes}`, () => {
    const W = 256;
    const [c, ctx] = canvas(W, W);
    const rng = new Rng(seed);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, W, W);
    for (let y = 0; y < W; y += 2) {
      ctx.fillStyle = `rgba(0,0,0,${rng.range(0.02, 0.06)})`;
      ctx.fillRect(0, y, W, 1);
    }
    for (let x = 0; x < W; x += 2) {
      ctx.fillStyle = `rgba(255,255,255,${rng.range(0.01, 0.04)})`;
      ctx.fillRect(x, 0, 1, W);
    }
    if (stripes) {
      for (let y = 0; y < W; y += 32) {
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(0, y, W, 6);
      }
    }
    noise(ctx, W, W, 10, rng);
    return toTex(c, true, [2, 2]);
  });
}

/** ラグ */
export function rugTexture(): THREE.CanvasTexture {
  return cached('rug', () => {
    const W = 512;
    const [c, ctx] = canvas(W, W);
    const rng = new Rng(31);
    ctx.fillStyle = '#6f7d74';
    ctx.fillRect(0, 0, W, W);
    ctx.strokeStyle = '#d8d0bd';
    ctx.lineWidth = 10;
    ctx.strokeRect(28, 28, W - 56, W - 56);
    ctx.lineWidth = 3;
    ctx.strokeRect(50, 50, W - 100, W - 100);
    for (let i = 0; i < 9000; i++) {
      ctx.fillStyle = `rgba(${rng.chance(0.5) ? 255 : 0},${rng.chance(0.5) ? 255 : 0},${rng.chance(0.5) ? 255 : 0},0.05)`;
      ctx.fillRect(rng.range(0, W), rng.range(0, W), 2, 2);
    }
    noise(ctx, W, W, 14, rng);
    return toTex(c);
  });
}

/** 背表紙が並んだ本棚の段 */
export function bookSpinesTexture(seed: number): THREE.CanvasTexture {
  return cached(`books-${seed}`, () => {
    const W = 256, H = 128;
    const [c, ctx] = canvas(W, H);
    const rng = new Rng(seed);
    ctx.fillStyle = '#2b2622';
    ctx.fillRect(0, 0, W, H);
    let x = 0;
    const palettes = ['#c94f3d', '#e8d9b0', '#3d6ea8', '#f2f0ea', '#1d1d1f', '#e2b03a', '#5b8f5a', '#8f4f9c', '#d97a2b'];
    while (x < W) {
      const w = rng.range(9, 15);
      const h = rng.range(H * 0.78, H * 0.96);
      const col = rng.pick(palettes);
      ctx.fillStyle = col;
      ctx.fillRect(x, H - h, w - 1, h);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x + w - 2, H - h, 1, h);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(x + 2, H - h + 8, w - 5, 3);
      ctx.fillRect(x + 2, H - 14, w - 5, 6);
      x += w;
    }
    return toTex(c);
  });
}

/** ゲームのポスター（架空） */
export function posterTexture(): THREE.CanvasTexture {
  return cached('poster', () => {
    const W = 256, H = 360;
    const [c, ctx] = canvas(W, H);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0d1b3a');
    g.addColorStop(0.6, '#5a2a6e');
    g.addColorStop(1, '#f07a3a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // 惑星
    ctx.fillStyle = '#f7d37a';
    ctx.beginPath();
    ctx.arc(170, 110, 46, 0, Math.PI * 2);
    ctx.fill();
    // 剣士のシルエット
    ctx.fillStyle = '#0a0a14';
    ctx.beginPath();
    ctx.moveTo(60, H);
    ctx.lineTo(95, 200);
    ctx.lineTo(120, 180);
    ctx.lineTo(140, 200);
    ctx.lineTo(180, H);
    ctx.fill();
    ctx.fillRect(118, 60, 5, 130);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('星屑の', W / 2, 280);
    ctx.fillText('レクイエム', W / 2, 316);
    ctx.font = '12px sans-serif';
    ctx.fillText('STARDUST REQUIEM IV', W / 2, 340);
    return toTex(c);
  });
}

/** 段ボールの伝票（宛名は絶対読めない） */
export function shippingLabelTexture(): THREE.CanvasTexture {
  return cached('label', () => {
    const W = 128, H = 96;
    const [c, ctx] = canvas(W, H);
    ctx.fillStyle = '#f5f2e8';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#2e6a3a';
    ctx.lineWidth = 2;
    ctx.strokeRect(3, 3, W - 6, H - 6);
    ctx.fillStyle = '#2e6a3a';
    ctx.fillRect(3, 3, W - 6, 14);
    // 宛名は手書きのにじみ
    ctx.fillStyle = 'rgba(30,30,40,0.7)';
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(12, 28 + i * 14, 60 + ((i * 37) % 40), 5);
    }
    // バーコード
    for (let x = 80; x < 118; x += 2) {
      if ((x * 7) % 5 < 3) ctx.fillRect(x, 70, 1, 16);
    }
    return toTex(c);
  });
}

/** 汎用ノイズ（ラフネス用） */
export function grainTexture(): THREE.CanvasTexture {
  return cached('grain', () => {
    const W = 256;
    const [c, ctx] = canvas(W, W);
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, W, W);
    noise(ctx, W, W, 60, new Rng(5));
    return toTex(c, false, [4, 4]);
  });
}
