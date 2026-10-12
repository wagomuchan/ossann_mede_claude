import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { ROOM, WINDOW, SPOT } from './layout';
import type { Env } from './environment';
import { damp } from '../core/math';

export interface InteriorLights {
  ceiling: number;
  monitor: number;
  monitorColor: THREE.Color;
  tv: number;
  tvColor: THREE.Color;
  phone: number;
  phonePos: THREE.Vector3;
  fridge: number;
  corridor: number;
  kotatsu: number;
  pc: number;
}

export function defaultInterior(): InteriorLights {
  return {
    ceiling: 0,
    monitor: 0,
    monitorColor: new THREE.Color('#9fc4ff'),
    tv: 0,
    tvColor: new THREE.Color('#9fc4ff'),
    phone: 0,
    phonePos: new THREE.Vector3(),
    fridge: 0,
    corridor: 0,
    kotatsu: 0,
    pc: 1,
  };
}

export class Lighting {
  readonly root = new THREE.Group();
  readonly sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private ambient: THREE.AmbientLight;
  readonly ceiling: THREE.SpotLight;
  private windowFill: THREE.RectAreaLight;
  private monitorGlow: THREE.PointLight;
  private tvGlow: THREE.PointLight;
  private phoneGlow: THREE.PointLight;
  private fridgeGlow: THREE.PointLight;
  private pcGlow: THREE.PointLight;
  private smoothCeil = 0;
  private envTex: THREE.Texture | null = null;

  constructor(private scene: THREE.Scene, renderer: THREE.WebGLRenderer, shadowSize: number) {
    RectAreaLightUniformsLib.init();

    const pmrem = new THREE.PMREMGenerator(renderer);
    this.envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = this.envTex;
    scene.environmentIntensity = 0.2;
    pmrem.dispose();

    this.sun = new THREE.DirectionalLight('#fff3dd', 0);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(shadowSize, shadowSize);
    const sc = this.sun.shadow.camera;
    sc.left = -3.2; sc.right = 3.2; sc.top = 3.2; sc.bottom = -3.2; sc.near = 0.5; sc.far = 20;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.radius = 4;
    this.sun.target.position.set(0.3, 0, 0);
    this.root.add(this.sun, this.sun.target);

    this.hemi = new THREE.HemisphereLight('#bcd4ff', '#6b5440', 0.3);
    this.root.add(this.hemi);
    this.ambient = new THREE.AmbientLight('#ffe2bf', 0);
    this.root.add(this.ambient);

    this.ceiling = new THREE.SpotLight('#fff1dc', 0, 0, 1.25, 1, 1.6);
    this.ceiling.position.set(0, ROOM.height - 0.04, 0);
    this.ceiling.target.position.set(0, 0, 0);
    this.ceiling.castShadow = true;
    this.ceiling.shadow.mapSize.set(shadowSize / 2, shadowSize / 2);
    this.ceiling.shadow.bias = -0.0006;
    this.ceiling.shadow.normalBias = 0.03;
    this.ceiling.shadow.radius = 6;
    this.ceiling.shadow.camera.near = 0.2;
    this.ceiling.shadow.camera.far = 4;
    this.root.add(this.ceiling, this.ceiling.target);

    const ww = WINDOW.x1 - WINDOW.x0, wh = WINDOW.y1 - WINDOW.y0;
    this.windowFill = new THREE.RectAreaLight('#cfe2ff', 0, ww, wh);
    this.windowFill.position.set((WINDOW.x0 + WINDOW.x1) / 2, (WINDOW.y0 + WINDOW.y1) / 2, ROOM.minZ + 0.02);
    this.windowFill.lookAt((WINDOW.x0 + WINDOW.x1) / 2, (WINDOW.y0 + WINDOW.y1) / 2 - 0.4, 1);
    this.root.add(this.windowFill);

    this.monitorGlow = new THREE.PointLight('#9fc4ff', 0, 2.6, 2);
    this.monitorGlow.position.set(SPOT.desk.x + 0.2, 0.98, SPOT.desk.z + 0.02);
    this.tvGlow = new THREE.PointLight('#9fc4ff', 0, 3.2, 2);
    this.tvGlow.position.set(SPOT.tv.x - 0.2, 0.75, SPOT.tv.z);
    this.phoneGlow = new THREE.PointLight('#cfe0ff', 0, 0.8, 2);
    this.fridgeGlow = new THREE.PointLight('#f4f8ff', 0, 1.6, 2);
    this.fridgeGlow.position.set(SPOT.fridge.x + 0.45, 0.5, SPOT.fridge.z);
    this.pcGlow = new THREE.PointLight('#8a4cff', 0, 0.9, 2);
    this.pcGlow.position.set(SPOT.desk.x - 0.05, 0.25, SPOT.desk.z + 0.6);
    this.root.add(this.monitorGlow, this.tvGlow, this.phoneGlow, this.fridgeGlow, this.pcGlow);

    scene.add(this.root);
  }

  update(env: Env, inside: InteriorLights, dt: number): void {
    const over = env.weather === 'rain' ? 0.8 : env.weather === 'snow' ? 0.6 : env.weather === 'cloudy' ? 0.55 : 0;
    const day = env.dayLight;

    // 太陽（夜は月）
    const az = env.sunAz;
    const elev = 0.35 + env.sunEl * 0.9;
    const dir = new THREE.Vector3(az * 0.9, elev, -1).normalize();
    if (day < 0.05) dir.set(0.4, 0.9, -1).normalize();
    this.sun.position.copy(this.sun.target.position).addScaledVector(dir, 9);
    const sunCol = new THREE.Color('#fff4e2').lerp(new THREE.Color('#ffa463'), env.twilight * 0.9);
    const moonCol = new THREE.Color('#8fa8d8');
    this.sun.color.copy(day > 0.05 ? sunCol : moonCol);
    const moon = (1 - day) * 0.35 * (1 - over);
    this.sun.intensity = day * 4.2 * (1 - over * 0.85) + moon;

    // 空からの拡散光
    const skyCol = new THREE.Color('#1b2540').lerp(new THREE.Color('#c4dcff'), day).lerp(new THREE.Color('#ffb48a'), env.twilight * 0.4);
    this.hemi.color.copy(skyCol);
    this.hemi.groundColor.set('#3a2c22').lerp(new THREE.Color('#7a5c44'), day);
    this.hemi.intensity = 0.06 + day * 0.55 * (1 - over * 0.3);

    this.windowFill.color.copy(skyCol);
    this.windowFill.intensity = 0.15 + day * 3.2 * (1 - over * 0.4);

    // 天井灯（ふわっと点く）
    this.smoothCeil = damp(this.smoothCeil, inside.ceiling, inside.ceiling > this.smoothCeil ? 18 : 10, dt);
    this.ceiling.intensity = this.smoothCeil * 9;
    this.ambient.intensity = this.smoothCeil * 0.45;

    this.monitorGlow.color.copy(inside.monitorColor);
    this.monitorGlow.intensity = inside.monitor * 0.9;
    this.tvGlow.color.copy(inside.tvColor);
    this.tvGlow.intensity = inside.tv * 1.6;
    this.phoneGlow.position.copy(inside.phonePos);
    this.phoneGlow.intensity = inside.phone * 0.25;
    this.fridgeGlow.intensity = inside.fridge * 0.8;
    this.pcGlow.intensity = inside.pc * 0.12;

    this.scene.environmentIntensity = 0.05 + day * 0.25 + this.smoothCeil * 0.15;
  }

  get ceilingLevel(): number {
    return this.smoothCeil;
  }
}
