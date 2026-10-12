import * as THREE from 'three';
import type { ScreenMode, Genre } from '../brain/ctx';
import { Rng } from '../core/random';
import { fmtHM } from '../core/time';

// モニター・ノートPC・TV・スマホの画面をキャンバスに描く。ゲームはすべて架空。

export const GAME_TITLES: Record<Genre, string> = {
  fps: 'STEEL HOUND',
  mmo: 'エターナル・レルム',
  rpg: '星屑のレクイエム IV',
  fighting: 'VERSUS GODS',
  racing: 'ターボドリフト7',
  puzzle: 'ブロック・カスケード',
  retro: 'ピクセルナイト',
  horror: '深夜病棟',
  sports: 'ストライカーズ',
};

/** 画面の光の色（部屋への照り返し用） */
const GLOW: Record<string, string> = {
  lock: '#5a6aa0', desktop: '#7aa0d8', work: '#c8d6ea', meeting: '#a8b4c8', video: '#d8c0a8', tv: '#e8d0b0',
  fps: '#c89a6a', mmo: '#8ac07a', rpg: '#6a8ae0', fighting: '#e07a5a', racing: '#a0b8d0', puzzle: '#8a6ae0',
  retro: '#7ac0f0', horror: '#3a4a3a', sports: '#5ac06a', sns: '#e8eef8', gacha: '#f0d070', alarm: '#f0f0f0',
};

class Surface {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly tex: THREE.CanvasTexture;
  private nextDraw = 0;
  private lastKey = '';
  glow = new THREE.Color('#000');
  level = 0;

  constructor(readonly w: number, readonly h: number, private fps: number) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
  }

  due(realT: number, key: string): boolean {
    if (key !== this.lastKey || realT >= this.nextDraw) {
      this.lastKey = key;
      this.nextDraw = realT + 1 / this.fps;
      return true;
    }
    return false;
  }
}

export interface ScreenTargets {
  monitor: THREE.MeshStandardMaterial;
  laptop: THREE.MeshStandardMaterial;
  tv: THREE.MeshStandardMaterial;
  phone: THREE.MeshStandardMaterial;
}

export class Screens {
  private mon = new Surface(512, 300, 15);
  private lap = new Surface(256, 160, 4);
  private tvs = new Surface(512, 288, 15);
  private ph = new Surface(128, 256, 8);

  constructor(private targets: ScreenTargets) {
    for (const [s, m] of [[this.mon, targets.monitor], [this.lap, targets.laptop], [this.tvs, targets.tv], [this.ph, targets.phone]] as const) {
      m.emissiveMap = s.tex;
      m.emissive.set('#ffffff');
      m.needsUpdate = true;
    }
  }

  update(modes: { monitor: ScreenMode; laptop: ScreenMode; tv: ScreenMode; phone: ScreenMode }, realT: number, boxDayMs: number): void {
    this.draw(this.mon, this.targets.monitor, modes.monitor, realT, boxDayMs, 1.0);
    this.draw(this.lap, this.targets.laptop, modes.laptop, realT, boxDayMs, 0.8);
    this.draw(this.tvs, this.targets.tv, modes.tv, realT, boxDayMs, 1.1);
    this.draw(this.ph, this.targets.phone, modes.phone, realT, boxDayMs, 1.0);
  }

  get monitorGlow(): { color: THREE.Color; level: number } {
    return { color: this.mon.glow, level: this.mon.level };
  }
  get tvGlow(): { color: THREE.Color; level: number } {
    return { color: this.tvs.glow, level: this.tvs.level };
  }
  get phoneLevel(): number {
    return this.ph.level;
  }

  private draw(s: Surface, mat: THREE.MeshStandardMaterial, m: ScreenMode, realT: number, dayMs: number, bright: number): void {
    const off = m.kind === 'off';
    mat.emissiveIntensity = off ? 0 : bright;
    mat.color.set(off ? '#0a0a0c' : '#000000');
    s.level = off ? 0 : m.kind === 'lock' ? 0.35 : 1;
    const gkey = m.kind === 'game' ? m.genre ?? 'fps' : m.kind;
    s.glow.set(GLOW[gkey] ?? '#9fb4d8');
    if (off) return;
    const key = `${m.kind}|${m.genre}|${m.event}|${m.cam}|${m.seed}`;
    const t = m.t;
    if (!s.due(realT, key)) return;
    const c = s.ctx;
    c.save();
    switch (m.kind) {
      case 'lock': drawLock(c, s.w, s.h, dayMs); break;
      case 'desktop': drawDesktop(c, s.w, s.h, dayMs); break;
      case 'work': drawWork(c, s.w, s.h, t, m.seed, m.event); break;
      case 'meeting': drawMeeting(c, s.w, s.h, t, m.cam ?? false); break;
      case 'video': drawVideo(c, s.w, s.h, t, m.seed); break;
      case 'tv': drawTV(c, s.w, s.h, t, m.seed); break;
      case 'game': drawGame(c, s.w, s.h, t, m.genre ?? 'fps', m.event); break;
      case 'sns': drawSNS(c, s.w, s.h, t); break;
      case 'gacha': drawGacha(c, s.w, s.h, t, m.event); break;
      case 'alarm': drawAlarm(c, s.w, s.h, t, dayMs); break;
    }
    c.restore();
    s.tex.needsUpdate = true;
    if (m.kind === 'game' && (m.event === 'win')) s.glow.set('#f0d080');
    if (m.kind === 'game' && m.genre === 'fps' && Math.sin(t * 13) > 0.8) s.level = 1.4;
  }
}

// ================= 描画 =================

const FONT = '"Hiragino Sans", "Noto Sans JP", "IPAGothic", "Yu Gothic", sans-serif';

function grad(c: CanvasRenderingContext2D, h: number, a: string, b: string): CanvasGradient {
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  return g;
}

function drawLock(c: CanvasRenderingContext2D, w: number, h: number, dayMs: number): void {
  c.fillStyle = grad(c, h, '#1a2240', '#3a2a50');
  c.fillRect(0, 0, w, h);
  c.fillStyle = 'rgba(255,255,255,0.9)';
  c.font = `200 ${h * 0.28}px ${FONT}`;
  c.textAlign = 'center';
  c.fillText(fmtHM(dayMs), w / 2, h * 0.5);
  c.font = `${h * 0.06}px ${FONT}`;
  c.fillStyle = 'rgba(255,255,255,0.6)';
  c.fillText('ロック中', w / 2, h * 0.64);
}

function drawDesktop(c: CanvasRenderingContext2D, w: number, h: number, dayMs: number): void {
  c.fillStyle = grad(c, h, '#0d1b3a', '#f07a3a');
  c.fillRect(0, 0, w, h);
  c.fillStyle = 'rgba(0,0,0,0.5)';
  c.fillRect(0, h - 20, w, 20);
  c.fillStyle = '#fff';
  c.font = `12px ${FONT}`;
  c.textAlign = 'right';
  c.fillText(fmtHM(dayMs), w - 8, h - 6);
}

function drawWork(c: CanvasRenderingContext2D, w: number, h: number, t: number, seed: number, event?: string): void {
  // 数十秒ごとに作業内容が変わる
  const phase = Math.floor((t + (seed % 50)) / 45) % 3;
  if (phase === 0) {
    // コードエディタ
    c.fillStyle = '#1e1f26';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#25262e';
    c.fillRect(0, 0, 90, h);
    c.fillStyle = '#2d2e38';
    c.fillRect(0, 0, w, 16);
    const lines = 26;
    const scroll = Math.floor(t * 0.6);
    const colors = ['#c678dd', '#61afef', '#98c379', '#e5c07b', '#abb2bf', '#e06c75', '#56b6c2'];
    for (let i = 0; i < 18; i++) {
      c.fillStyle = 'rgba(255,255,255,0.2)';
      c.fillRect(10, 24 + i * 14, 50 + ((i * 37) % 30), 5);
    }
    for (let i = 0; i < lines; i++) {
      const r = new Rng(seed + i + scroll * 7);
      let x = 100 + r.int(0, 4) * 14;
      const y = 26 + i * 10.5;
      const n = r.int(1, 5);
      for (let k = 0; k < n; k++) {
        const len = r.int(12, 60);
        c.fillStyle = colors[r.int(0, colors.length - 1)];
        c.fillRect(x, y, len, 5);
        x += len + 6;
      }
    }
    // カーソル
    if (Math.sin(t * 6) > 0) {
      c.fillStyle = '#fff';
      c.fillRect(100 + ((t * 40) % 200), 26 + 12 * 10.5, 2, 8);
    }
  } else if (phase === 1) {
    // 表計算
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#1d6f42';
    c.fillRect(0, 0, w, 22);
    c.strokeStyle = '#d8dce0';
    c.lineWidth = 1;
    for (let y = 40; y < h; y += 14) {
      c.beginPath();
      c.moveTo(0, y + 0.5);
      c.lineTo(w, y + 0.5);
      c.stroke();
    }
    for (let x = 30; x < w; x += 64) {
      c.beginPath();
      c.moveTo(x + 0.5, 26);
      c.lineTo(x + 0.5, h);
      c.stroke();
    }
    const rows = Math.min(18, 6 + Math.floor(t * 0.3));
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < 7; col++) {
        const rr = new Rng(seed * 3 + r * 13 + col);
        c.fillStyle = col === 0 ? '#333' : '#555';
        c.fillRect(36 + col * 64, 44 + r * 14, rr.int(18, 50), 5);
      }
    }
    c.fillStyle = 'rgba(29,111,66,0.25)';
    c.fillRect(30 + 64 * 2, 40 + (Math.floor(t) % rows) * 14, 64, 14);
  } else {
    // チャット
    c.fillStyle = '#f8f8fa';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#3f0e40';
    c.fillRect(0, 0, 110, h);
    for (let i = 0; i < 10; i++) {
      c.fillStyle = i === 2 ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.45)';
      c.fillRect(14, 30 + i * 18, 60 + ((i * 23) % 30), 6);
    }
    const scroll = Math.floor(t / 4);
    for (let i = 0; i < 8; i++) {
      const r = new Rng(seed + i + scroll);
      const y = 20 + i * 34;
      c.fillStyle = ['#e8a23a', '#3a8ae8', '#4ab86a', '#d84a6a'][r.int(0, 3)];
      c.fillRect(124, y, 22, 22);
      c.fillStyle = '#222';
      c.fillRect(154, y + 2, 50, 5);
      c.fillStyle = '#777';
      c.fillRect(154, y + 12, r.int(120, 320), 5);
    }
  }
  if (event === 'slack') {
    c.fillStyle = 'rgba(30,30,40,0.95)';
    c.fillRect(w - 200, h - 70, 190, 58);
    c.fillStyle = '#e8a23a';
    c.fillRect(w - 192, h - 62, 26, 26);
    c.fillStyle = '#fff';
    c.font = `bold 12px ${FONT}`;
    c.textAlign = 'left';
    c.fillText('部長', w - 158, h - 50);
    c.fillStyle = '#ccc';
    c.font = `11px ${FONT}`;
    c.fillText('ちょっといいですか？', w - 158, h - 32);
  }
}

function person(c: CanvasRenderingContext2D, x: number, y: number, s: number, skin: string, hair: string, shirt: string, bob: number, bald = false): void {
  c.fillStyle = shirt;
  c.beginPath();
  c.ellipse(x, y + s * 0.95, s * 0.75, s * 0.5, 0, Math.PI, 0);
  c.fill();
  c.fillStyle = skin;
  c.beginPath();
  c.arc(x, y + bob, s * 0.38, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = hair;
  c.beginPath();
  if (bald) {
    c.arc(x, y + bob, s * 0.385, Math.PI * 0.85, Math.PI * 1.05);
    c.arc(x, y + bob, s * 0.385, Math.PI * 1.95, Math.PI * 2.15);
  } else c.arc(x, y + bob - s * 0.05, s * 0.4, Math.PI, 0);
  c.fill();
}

function drawMeeting(c: CanvasRenderingContext2D, w: number, h: number, t: number, cam: boolean): void {
  c.fillStyle = '#1b1c20';
  c.fillRect(0, 0, w, h);
  const cols = 3, rows = 2;
  const tw = (w - 16) / cols, th = (h - 44) / rows;
  const speaker = Math.floor(t / 5) % 5;
  const people = [
    ['#f0c8a0', '#3a2a20', '#2a4a7a', '#4a5a6a'],
    ['#e8b890', '#111', '#6a3a3a', '#8a7a6a'],
    ['#f4d0b0', '#5a3a2a', '#e8e8e8', '#5a6a5a'],
    ['#d8a880', '#222', '#3a3a3a', '#3a4a6a'],
    ['#f0c0a0', '#8a6a4a', '#7a5a8a', '#6a5a4a'],
  ];
  for (let i = 0; i < 6; i++) {
    const x = 6 + (i % cols) * (tw + 2), y = 6 + Math.floor(i / cols) * (th + 2);
    if (i === 5) {
      // 自分
      if (cam) {
        c.fillStyle = '#4a4440';
        c.fillRect(x, y, tw, th);
        person(c, x + tw / 2, y + th * 0.45, th * 0.5, '#e0aa86', '#3b3532', '#c9dcf0', 0, true);
        c.strokeStyle = '#222';
        c.lineWidth = 2;
        c.strokeRect(x + tw / 2 - th * 0.17, y + th * 0.42, th * 0.14, th * 0.08);
        c.strokeRect(x + tw / 2 + th * 0.03, y + th * 0.42, th * 0.14, th * 0.08);
      } else {
        c.fillStyle = '#2a2b30';
        c.fillRect(x, y, tw, th);
        c.fillStyle = '#5a6a8a';
        c.beginPath();
        c.arc(x + tw / 2, y + th / 2, th * 0.2, 0, Math.PI * 2);
        c.fill();
      }
      continue;
    }
    const pp = people[i];
    c.fillStyle = pp[3];
    c.fillRect(x, y, tw, th);
    person(c, x + tw / 2, y + th * 0.45, th * 0.5, pp[0], pp[1], pp[2], Math.sin(t * 2 + i) * 1.5);
    if (i === speaker) {
      c.strokeStyle = '#4ad86a';
      c.lineWidth = 3;
      c.strokeRect(x + 1.5, y + 1.5, tw - 3, th - 3);
    }
  }
  // ツールバー
  c.fillStyle = '#111';
  c.fillRect(0, h - 34, w, 34);
  for (let i = 0; i < 4; i++) {
    c.fillStyle = i === 1 && !cam ? '#d84a4a' : '#3a3b40';
    c.beginPath();
    c.arc(w / 2 - 60 + i * 30, h - 17, 10, 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = '#e84040';
  c.fillRect(w / 2 + 70, h - 26, 36, 18);
}

function drawVideo(c: CanvasRenderingContext2D, w: number, h: number, t: number, seed: number): void {
  c.fillStyle = '#0f0f0f';
  c.fillRect(0, 0, w, h);
  const vw = w * 0.68, vh = vw * 9 / 16;
  const kind = seed % 3;
  if (kind === 0) {
    // 猫動画
    c.fillStyle = '#e8dcc8';
    c.fillRect(8, 8, vw, vh);
    c.fillStyle = '#8a6a4a';
    const cx = 8 + vw / 2 + Math.sin(t * 0.8) * vw * 0.25, cy = 8 + vh * 0.65;
    c.beginPath();
    c.ellipse(cx, cy, 40, 24, 0, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.arc(cx + 34 * Math.sign(Math.cos(t * 0.8)), cy - 18, 18, 0, Math.PI * 2);
    c.fill();
  } else if (kind === 1) {
    // 料理動画
    c.fillStyle = '#3a2a20';
    c.fillRect(8, 8, vw, vh);
    c.fillStyle = '#222';
    c.beginPath();
    c.ellipse(8 + vw / 2, 8 + vh * 0.6, 80, 40, 0, 0, Math.PI * 2);
    c.fill();
    for (let i = 0; i < 8; i++) {
      c.fillStyle = ['#e8a23a', '#d84a3a', '#5aa04a'][i % 3];
      c.beginPath();
      c.arc(8 + vw / 2 + Math.cos(i + t) * 40, 8 + vh * 0.6 + Math.sin(i * 2 + t * 1.3) * 18, 8, 0, Math.PI * 2);
      c.fill();
    }
  } else {
    // ゲーム実況
    drawGame(c, vw, vh, t, 'retro', undefined, 8, 8);
    c.fillStyle = '#e0aa86';
    c.beginPath();
    c.arc(8 + vw - 30, 8 + vh - 30, 20, 0, Math.PI * 2);
    c.fill();
  }
  // シークバー
  c.fillStyle = '#444';
  c.fillRect(8, vh + 12, vw, 3);
  c.fillStyle = '#e02020';
  c.fillRect(8, vh + 12, vw * ((t / 240) % 1), 3);
  c.fillStyle = '#ddd';
  c.fillRect(8, vh + 24, vw * 0.7, 8);
  c.fillStyle = '#888';
  c.fillRect(8, vh + 40, vw * 0.3, 6);
  // おすすめ一覧
  for (let i = 0; i < 6; i++) {
    const r = new Rng(seed + i);
    c.fillStyle = `hsl(${r.int(0, 360)},40%,40%)`;
    c.fillRect(vw + 16, 8 + i * 46, 64, 38);
    c.fillStyle = '#ccc';
    c.fillRect(vw + 86, 12 + i * 46, w - vw - 96, 5);
    c.fillStyle = '#777';
    c.fillRect(vw + 86, 24 + i * 46, (w - vw - 96) * 0.6, 4);
  }
}

function drawTV(c: CanvasRenderingContext2D, w: number, h: number, t: number, seed: number): void {
  // バラエティ番組
  c.fillStyle = grad(c, h, '#f0a0c0', '#f8e080');
  c.fillRect(0, 0, w, h);
  for (let i = 0; i < 4; i++) {
    person(c, w * (0.2 + i * 0.2), h * 0.45, h * 0.3, '#f0c8a0', ['#222', '#6a4a2a', '#111', '#aa6a3a'][i], ['#e84a4a', '#4a8ae8', '#f0f0f0', '#4ab86a'][i], Math.sin(t * 3 + i) * 2 * (Math.sin(t * 0.7) > 0.6 ? 3 : 1));
  }
  c.fillStyle = '#fff';
  c.fillRect(0, h * 0.78, w, h * 0.16);
  c.font = `bold ${h * 0.09}px ${FONT}`;
  c.textAlign = 'center';
  c.fillStyle = '#e83a6a';
  c.strokeStyle = '#fff';
  const lines = ['まさかの展開！？', '衝撃の結末', 'これはヤバい', '一同騒然'];
  c.fillText(lines[(Math.floor(t / 6) + seed) % lines.length], w / 2, h * 0.9);
}

function drawGame(c: CanvasRenderingContext2D, w: number, h: number, t: number, g: Genre, event?: string, ox = 0, oy = 0): void {
  c.save();
  c.translate(ox, oy);
  c.beginPath();
  c.rect(0, 0, w, h);
  c.clip();
  if (event === 'loading') {
    c.fillStyle = '#000';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#fff';
    c.font = `bold ${h * 0.09}px ${FONT}`;
    c.textAlign = 'center';
    c.fillText(GAME_TITLES[g], w / 2, h * 0.42);
    c.font = `${h * 0.05}px ${FONT}`;
    c.fillStyle = '#aaa';
    c.fillText('NOW LOADING' + '.'.repeat(Math.floor(t * 2) % 4), w / 2, h * 0.6);
    c.strokeStyle = '#fff';
    c.lineWidth = 3;
    c.beginPath();
    c.arc(w - 30, h - 30, 12, t * 5, t * 5 + 4.5);
    c.stroke();
    c.restore();
    return;
  }
  switch (g) {
    case 'fps': {
      c.fillStyle = grad(c, h * 0.55, '#7aa0c8', '#d8c8a8');
      c.fillRect(0, 0, w, h * 0.55);
      c.fillStyle = '#8a7a5a';
      c.fillRect(0, h * 0.55, w, h * 0.45);
      const sway = Math.sin(t * 0.7) * 40;
      for (let i = 0; i < 7; i++) {
        const bx = ((i * 97 + sway) % (w + 100)) - 50;
        c.fillStyle = ['#6a6050', '#7a7060', '#5a5244'][i % 3];
        c.fillRect(bx, h * 0.25 + (i % 3) * 10, 60 + (i % 2) * 30, h * 0.3);
      }
      // 敵
      const ex = w / 2 + Math.sin(t * 1.3) * w * 0.25;
      c.fillStyle = '#a02a2a';
      c.fillRect(ex - 6, h * 0.45, 12, 26);
      c.beginPath();
      c.arc(ex, h * 0.43, 6, 0, Math.PI * 2);
      c.fill();
      // 銃
      c.fillStyle = '#2a2a2e';
      c.beginPath();
      c.moveTo(w * 0.62, h);
      c.lineTo(w * 0.7, h * 0.72);
      c.lineTo(w * 0.78, h * 0.74);
      c.lineTo(w * 0.86, h);
      c.fill();
      if (Math.sin(t * 13) > 0.8) {
        c.fillStyle = 'rgba(255,220,120,0.9)';
        c.beginPath();
        c.arc(w * 0.705, h * 0.71, 14, 0, Math.PI * 2);
        c.fill();
      }
      c.strokeStyle = '#3f3';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(w / 2 - 10, h / 2);
      c.lineTo(w / 2 + 10, h / 2);
      c.moveTo(w / 2, h / 2 - 10);
      c.lineTo(w / 2, h / 2 + 10);
      c.stroke();
      c.fillStyle = 'rgba(0,0,0,0.5)';
      c.fillRect(10, h - 30, 110, 20);
      c.fillStyle = '#4f4';
      c.fillRect(14, h - 26, 80 + Math.sin(t) * 20, 12);
      c.fillStyle = '#fff';
      c.font = `bold 16px ${FONT}`;
      c.textAlign = 'right';
      c.fillText(`${(30 - Math.floor(t * 2) % 30)} / 120`, w - 10, h - 14);
      break;
    }
    case 'mmo': {
      c.fillStyle = grad(c, h, '#8ac0f0', '#4a8a3a');
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#3a6a2a';
      for (let i = 0; i < 6; i++) {
        c.beginPath();
        c.arc(((i * 110 + t * 8) % (w + 80)) - 40, h * 0.55, 40, 0, Math.PI * 2);
        c.fill();
      }
      c.fillStyle = '#c84a3a';
      c.fillRect(w / 2 - 8, h * 0.55, 16, 30);
      c.fillStyle = '#6a3a8a';
      const mx = w * 0.65 + Math.sin(t) * 10;
      c.beginPath();
      c.arc(mx, h * 0.6, 22, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#ff4';
      c.font = `bold 14px ${FONT}`;
      c.fillText(String(100 + Math.floor((t * 37) % 900)), mx, h * 0.48 - (t * 30) % 20);
      for (let i = 0; i < 10; i++) {
        c.fillStyle = 'rgba(0,0,0,0.6)';
        c.fillRect(w / 2 - 110 + i * 22, h - 26, 20, 20);
        c.fillStyle = `hsl(${i * 36},60%,55%)`;
        c.fillRect(w / 2 - 107 + i * 22, h - 23, 14, 14);
      }
      c.fillStyle = 'rgba(0,0,0,0.45)';
      c.fillRect(6, h - 90, 160, 60);
      for (let i = 0; i < 5; i++) {
        c.fillStyle = ['#ff8', '#8ff', '#fff', '#f8f'][(i + Math.floor(t)) % 4];
        c.fillRect(10, h - 84 + i * 11, 40 + ((i * 53 + Math.floor(t) * 17) % 110), 4);
      }
      for (let i = 0; i < 4; i++) {
        c.fillStyle = 'rgba(0,0,0,0.5)';
        c.fillRect(6, 6 + i * 22, 100, 18);
        c.fillStyle = '#4c4';
        c.fillRect(9, 9 + i * 22, 60 + ((i * 17 + t * 5) % 30), 6);
        c.fillStyle = '#48f';
        c.fillRect(9, 17 + i * 22, 50, 3);
      }
      break;
    }
    case 'rpg': {
      c.fillStyle = grad(c, h, '#1a2a6a', '#6a3a8a');
      c.fillRect(0, 0, w, h);
      for (let i = 0; i < 3; i++) {
        const sx = w * (0.25 + i * 0.22), sy = h * 0.42 + Math.sin(t * 2 + i) * 4;
        c.fillStyle = ['#4ac86a', '#4a8ae8', '#e8a23a'][i];
        c.beginPath();
        c.ellipse(sx, sy, 28, 22 + Math.sin(t * 3 + i) * 2, 0, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#000';
        c.fillRect(sx - 10, sy - 6, 5, 6);
        c.fillRect(sx + 5, sy - 6, 5, 6);
      }
      c.fillStyle = 'rgba(10,20,90,0.92)';
      c.strokeStyle = '#fff';
      c.lineWidth = 2;
      c.fillRect(8, h * 0.68, w - 16, h * 0.3 - 8);
      c.strokeRect(8, h * 0.68, w - 16, h * 0.3 - 8);
      c.fillStyle = '#fff';
      c.font = `${h * 0.055}px ${FONT}`;
      c.textAlign = 'left';
      const names = ['ゆうしゃ', 'まほうつかい', 'そうりょ'];
      for (let i = 0; i < 3; i++) {
        c.fillText(names[i], 24 + i * (w / 3.2), h * 0.78);
        c.fillStyle = '#4c4';
        c.fillRect(24 + i * (w / 3.2), h * 0.82, 80 - ((t * 7 + i * 20) % 40), 5);
        c.fillStyle = '#fff';
      }
      if (Math.floor(t) % 4 === 0) {
        c.fillStyle = '#ff4';
        c.font = `bold ${h * 0.1}px ${FONT}`;
        c.textAlign = 'center';
        c.fillText(String(120 + (Math.floor(t * 3) % 80)), w * 0.47, h * 0.3);
      }
      break;
    }
    case 'fighting': {
      c.fillStyle = grad(c, h, '#f08a4a', '#5a2a4a');
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#3a2a2a';
      c.fillRect(0, h * 0.8, w, h * 0.2);
      const d = Math.sin(t * 1.7) * 30;
      for (const [x, col, dir] of [[w * 0.38 + d, '#3a6ae8', 1], [w * 0.62 - d * 0.6, '#e83a3a', -1]] as const) {
        c.fillStyle = col;
        c.fillRect(x - 12, h * 0.5, 24, h * 0.3);
        c.beginPath();
        c.arc(x, h * 0.45, 13, 0, Math.PI * 2);
        c.fill();
        if (Math.sin(t * 6 + dir) > 0.6) c.fillRect(x, h * 0.55, dir * 34, 8);
      }
      c.fillStyle = '#222';
      c.fillRect(10, 10, w * 0.4, 12);
      c.fillRect(w * 0.6 - 10, 10, w * 0.4, 12);
      c.fillStyle = '#fd3';
      c.fillRect(10, 10, w * 0.4 * (0.4 + 0.4 * Math.abs(Math.sin(t * 0.2))), 12);
      c.fillRect(w * 0.6 - 10 + w * 0.4 * 0.3, 10, w * 0.4 * 0.7, 12);
      c.fillStyle = '#fff';
      c.font = `bold 20px ${FONT}`;
      c.textAlign = 'center';
      c.fillText(String(99 - (Math.floor(t) % 99)), w / 2, 26);
      break;
    }
    case 'racing': {
      c.fillStyle = grad(c, h * 0.45, '#5a9ae8', '#c8e0f8');
      c.fillRect(0, 0, w, h * 0.45);
      c.fillStyle = '#4a8a3a';
      c.fillRect(0, h * 0.45, w, h * 0.55);
      const curve = Math.sin(t * 0.5) * w * 0.15;
      c.fillStyle = '#555';
      c.beginPath();
      c.moveTo(w / 2 + curve - 10, h * 0.45);
      c.lineTo(w / 2 + curve + 10, h * 0.45);
      c.lineTo(w * 0.95, h);
      c.lineTo(w * 0.05, h);
      c.fill();
      for (let i = 0; i < 8; i++) {
        const k = ((i / 8 + t * 1.5) % 1);
        const y = h * 0.45 + k * k * h * 0.55;
        const x = w / 2 + curve * (1 - k);
        c.fillStyle = '#fff';
        c.fillRect(x - 2 - k * 6, y, 4 + k * 12, 3 + k * 8);
      }
      c.fillStyle = '#d82a2a';
      c.fillRect(w / 2 - 40, h * 0.74, 80, 34);
      c.fillStyle = '#222';
      c.fillRect(w / 2 - 44, h * 0.84, 20, 14);
      c.fillRect(w / 2 + 24, h * 0.84, 20, 14);
      c.fillStyle = '#fff';
      c.font = `bold 18px ${FONT}`;
      c.textAlign = 'right';
      c.fillText(`${180 + Math.floor(Math.sin(t) * 40)} km/h`, w - 10, h - 12);
      break;
    }
    case 'puzzle': {
      c.fillStyle = '#14102a';
      c.fillRect(0, 0, w, h);
      const cell = h / 20;
      const gx = w / 2 - cell * 5;
      c.fillStyle = '#000';
      c.fillRect(gx, 0, cell * 10, h);
      const r = new Rng(7);
      const fill = 6 + (Math.floor(t / 3) % 6);
      for (let y = 20 - fill; y < 20; y++) {
        for (let x = 0; x < 10; x++) {
          if (r.chance(0.82)) {
            c.fillStyle = `hsl(${r.int(0, 6) * 50},70%,55%)`;
            c.fillRect(gx + x * cell + 1, y * cell + 1, cell - 2, cell - 2);
          }
        }
      }
      const py = Math.floor((t * 4) % (20 - fill));
      c.fillStyle = '#e8d83a';
      for (const [dx, dy] of [[0, 0], [1, 0], [2, 0], [1, 1]]) c.fillRect(gx + (4 + dx) * cell + 1, (py + dy) * cell + 1, cell - 2, cell - 2);
      c.fillStyle = '#fff';
      c.font = `bold 14px ${FONT}`;
      c.textAlign = 'left';
      c.fillText(`SCORE ${12400 + Math.floor(t * 30)}`, gx + cell * 10.5, 30);
      break;
    }
    case 'retro': {
      c.fillStyle = '#6a8ae8';
      c.fillRect(0, 0, w, h);
      const sc = (t * 60) % 64;
      c.fillStyle = '#fff';
      for (let i = 0; i < 4; i++) {
        c.fillRect(((i * 160 - t * 10) % (w + 80) + w + 80) % (w + 80) - 40, 30 + (i % 2) * 20, 50, 14);
      }
      for (let x = -64; x < w + 64; x += 32) {
        c.fillStyle = '#b8682a';
        c.fillRect(x - sc, h - 40, 31, 20);
        c.fillStyle = '#7a3a1a';
        c.fillRect(x - sc, h - 20, 31, 20);
      }
      for (let i = 0; i < 3; i++) {
        c.fillStyle = '#fd3';
        c.fillRect(((i * 120 - t * 60) % (w + 40) + w + 40) % (w + 40) - 20, h * 0.5, 12, 14);
      }
      const jump = Math.abs(Math.sin(t * 3)) * 40;
      c.fillStyle = '#e83a2a';
      c.fillRect(w * 0.3, h - 72 - jump, 20, 32);
      c.fillStyle = '#f0c8a0';
      c.fillRect(w * 0.3 + 4, h - 80 - jump, 14, 10);
      break;
    }
    case 'horror': {
      c.fillStyle = '#050605';
      c.fillRect(0, 0, w, h);
      const fx = w / 2 + Math.sin(t * 0.6) * 60, fy = h / 2 + Math.sin(t * 0.9) * 20;
      const g = c.createRadialGradient(fx, fy, 5, fx, fy, h * 0.6);
      g.addColorStop(0, 'rgba(200,210,180,0.55)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(120,130,110,0.4)';
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(w * 0.35, h * 0.35);
      c.moveTo(w, 0);
      c.lineTo(w * 0.65, h * 0.35);
      c.moveTo(0, h);
      c.lineTo(w * 0.35, h * 0.65);
      c.moveTo(w, h);
      c.lineTo(w * 0.65, h * 0.65);
      c.stroke();
      if (Math.floor(t * 0.5) % 9 === 0 && Math.sin(t * 20) > 0) {
        c.fillStyle = '#ddd';
        c.beginPath();
        c.arc(w / 2, h / 2, 40, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#000';
        c.fillRect(w / 2 - 18, h / 2 - 8, 10, 14);
        c.fillRect(w / 2 + 8, h / 2 - 8, 10, 14);
      }
      break;
    }
    case 'sports': {
      c.fillStyle = '#3a8a3a';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(255,255,255,0.7)';
      c.lineWidth = 2;
      c.strokeRect(10, 10, w - 20, h - 20);
      c.beginPath();
      c.moveTo(w / 2, 10);
      c.lineTo(w / 2, h - 10);
      c.stroke();
      c.beginPath();
      c.arc(w / 2, h / 2, 30, 0, Math.PI * 2);
      c.stroke();
      for (let i = 0; i < 10; i++) {
        c.fillStyle = i < 5 ? '#e83a3a' : '#3a6ae8';
        c.beginPath();
        c.arc(w * (0.2 + (i % 5) * 0.15) + Math.sin(t + i) * 20, h * (0.3 + (i % 3) * 0.2) + Math.cos(t * 0.8 + i) * 15, 5, 0, Math.PI * 2);
        c.fill();
      }
      c.fillStyle = '#fff';
      c.beginPath();
      c.arc(w / 2 + Math.sin(t * 1.2) * 80, h / 2 + Math.cos(t * 0.9) * 40, 3, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = 'rgba(0,0,0,0.6)';
      c.fillRect(w / 2 - 50, 12, 100, 20);
      c.fillStyle = '#fff';
      c.font = `bold 14px ${FONT}`;
      c.textAlign = 'center';
      c.fillText('1 - 1', w / 2, 27);
      break;
    }
  }
  if (event === 'win' || event === 'lose') {
    c.fillStyle = event === 'win' ? 'rgba(40,30,0,0.45)' : 'rgba(0,0,0,0.6)';
    c.fillRect(0, 0, w, h);
    c.font = `bold ${h * 0.14}px ${FONT}`;
    c.textAlign = 'center';
    c.fillStyle = event === 'win' ? '#ffd84a' : '#aaa';
    c.fillText(event === 'win' ? 'VICTORY' : g === 'fps' ? 'ELIMINATED' : 'GAME OVER', w / 2, h / 2 + h * 0.05);
  }
  c.restore();
}

function drawSNS(c: CanvasRenderingContext2D, w: number, h: number, t: number): void {
  c.fillStyle = '#f4f6f8';
  c.fillRect(0, 0, w, h);
  const scroll = (t * 25) % 80;
  for (let i = -1; i < 5; i++) {
    const y = i * 80 - scroll + 20;
    const r = new Rng(Math.floor(t * 25 / 80) + i);
    c.fillStyle = '#fff';
    c.fillRect(6, y, w - 12, 72);
    c.fillStyle = `hsl(${r.int(0, 360)},50%,60%)`;
    c.beginPath();
    c.arc(18, y + 12, 7, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#333';
    c.fillRect(30, y + 8, 40, 4);
    c.fillStyle = '#888';
    c.fillRect(12, y + 24, w - 30, 3);
    c.fillRect(12, y + 31, w - 50, 3);
    if (r.chance(0.5)) {
      c.fillStyle = `hsl(${r.int(0, 360)},40%,70%)`;
      c.fillRect(12, y + 40, w - 24, 28);
    }
  }
  c.fillStyle = '#fff';
  c.fillRect(0, 0, w, 14);
}

function drawGacha(c: CanvasRenderingContext2D, w: number, h: number, t: number, event?: string): void {
  const win = event === 'win';
  const fail = event === 'fail';
  c.fillStyle = grad(c, h, '#2a1a4a', '#4a2a6a');
  c.fillRect(0, 0, w, h);
  if (win || fail) {
    const g = c.createRadialGradient(w / 2, h / 2, 5, w / 2, h / 2, h * 0.5);
    g.addColorStop(0, win ? '#fff6a0' : '#8aa0c0');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    c.fillStyle = win ? '#ffd84a' : '#9ab';
    c.fillRect(w / 2 - 26, h / 2 - 38, 52, 76);
    c.fillStyle = '#fff';
    c.font = `bold 14px ${FONT}`;
    c.textAlign = 'center';
    c.fillText(win ? '★★★★★' : '★★★', w / 2, h * 0.8);
  } else {
    c.fillStyle = '#ffd84a';
    c.font = `bold 16px ${FONT}`;
    c.textAlign = 'center';
    c.fillText('10連', w / 2, h * 0.75);
    c.fillStyle = 'rgba(255,255,255,0.3)';
    c.beginPath();
    c.arc(w / 2, h * 0.4, 30 + Math.sin(t * 4) * 4, 0, Math.PI * 2);
    c.fill();
  }
}

function drawAlarm(c: CanvasRenderingContext2D, w: number, h: number, t: number, dayMs: number): void {
  c.fillStyle = Math.sin(t * 8) > 0 ? '#202230' : '#30344a';
  c.fillRect(0, 0, w, h);
  c.fillStyle = '#fff';
  c.font = `200 ${w * 0.32}px ${FONT}`;
  c.textAlign = 'center';
  c.fillText(fmtHM(dayMs), w / 2, h * 0.38);
  c.fillStyle = '#f0a03a';
  c.fillRect(w * 0.15, h * 0.7, w * 0.7, 28);
  c.fillStyle = '#000';
  c.font = `bold 14px ${FONT}`;
  c.fillText('スヌーズ', w / 2, h * 0.7 + 19);
}
