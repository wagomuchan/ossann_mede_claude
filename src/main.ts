import * as THREE from 'three';
import { Clock, readDebugParams, MINUTE } from './core/time';
import { computeEnv } from './world/environment';
import { World, defaultDyn } from './world/world';
import { defaultInterior } from './world/lighting';
import { Screens } from './world/screens';
import { createCamera, fitCamera } from './render/camera';
import { Post } from './render/post';
import { detectQuality } from './render/quality';
import { Ossan } from './ossan/ossan';
import { Brain } from './brain/brain';
import { defaultOut } from './brain/ctx';
import { getPlan } from './brain/plan';
import { Sound } from './audio/sound';

const debug = readDebugParams();
const clock = new Clock(debug);
const app = document.getElementById('app')!;
const veil = document.getElementById('veil')!;

let renderer: THREE.WebGLRenderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
} catch {
  document.getElementById('fail')!.style.display = 'flex';
  veil.style.display = 'none';
  throw new Error('WebGL unavailable');
}

const quality = detectQuality(renderer, debug.quality);
renderer.setPixelRatio(quality.pixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#16171c');
const camera = createCamera();

const world = new World(scene, renderer, quality.shadowSize);
const ossan = new Ossan(scene);
const brain = new Brain(ossan, debug);
const screens = new Screens({
  monitor: world.furn.monitorScreen,
  laptop: world.furn.laptopScreen,
  tv: world.furn.tvScreen,
  phone: ossan.props.phoneScreen,
});
const post = new Post(renderer, scene, camera, { ao: quality.ao, bloom: true, msaa: quality.msaa });
const sound = new Sound();

function resize(): void {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  post.setSize(w, h);
  fitCamera(camera, w / h, debug.cam);
  post.focusY = 0.48;
}
window.addEventListener('resize', resize);
resize();

const dyn = defaultDyn();
const inside = defaultInterior();
const out = defaultOut();
const phonePos = new THREE.Vector3();

let last = performance.now();
const startReal = last;
function frame(now: number): void {
  const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
  last = now;
  const realT = (now - startReal) / 1000;
  const t = clock.now();
  const env = computeEnv(t, debug);

  // 毎フレーム、一時的な状態を戻してから行動に書き込ませる
  Object.assign(dyn, World.dailyProps(t));
  dyn.door = 0;
  dyn.fridge = 0;
  dyn.kettle = 0;
  dyn.microwave = 0;
  dyn.scaleDisplay = 0;
  dyn.duvetCover = 0;
  dyn.laundry = laundryVisible(t.day, t.dayMs);
  brain.frame(t, env, realT, out, dyn);
  brain.applyLook(out);
  ossan.end(dt, realT);
  screens.update(out, realT, t.dayMs);

  // 部屋の明かり
  inside.ceiling = out.ceiling === 'on' ? 1 : 0;
  const mg = screens.monitorGlow;
  inside.monitor = mg.level;
  inside.monitorColor.copy(mg.color);
  const tg = screens.tvGlow;
  inside.tv = tg.level;
  inside.tvColor.copy(tg.color);
  const phone = ossan.props.items.phone;
  inside.phone = phone.visible && out.phone.kind !== 'off' ? 1 : 0;
  if (inside.phone) phone.getWorldPosition(phonePos).add(new THREE.Vector3(0, 0.05, 0));
  inside.phonePos.copy(phonePos);
  inside.fridge = out.fridgeLight;
  inside.corridor = out.corridor;
  inside.kotatsu = !out.asleep && out.visible ? 1 : 0;
  dyn.ac = (env.season === 'summer' || env.season === 'winter') && out.visible ? 1 : 0;

  world.update(t, env, inside, dyn, realT, dt);
  sound.update(out, env, dyn, t, dt);
  renderer.toneMappingExposure = 1.0 + (1 - env.dayLight) * 0.2 - inside.ceiling * 0.08;
  post.render(realT);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/** 休日：洗濯物を干してから取り込むまで */
function laundryVisible(day: number, dayMs: number): boolean {
  let vis = false;
  for (const s of getPlan(day)) {
    if (s.act !== 'laundry' || dayMs < s.start + 3 * MINUTE) continue;
    vis = s.p.mode !== 'take';
  }
  return vis;
}

function enter(): void {
  veil.classList.add('gone');
  sound.start();
}
veil.addEventListener('click', enter);
veil.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') enter();
});

// 開発用
(window as unknown as Record<string, unknown>).__ossan = { scene, camera, renderer, world, clock, post, inside, dyn, brain, out, getPlan };
