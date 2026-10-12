import * as THREE from 'three';
import { buildRoom, RoomShell } from './room';
import { buildFurniture, Furniture } from './furniture';
import { Outside } from './outside';
import { Lighting, InteriorLights } from './lighting';
import type { Env } from './environment';
import { BoxTime, HOUR, MINUTE } from '../core/time';
import { damp, TAU } from '../core/math';

export interface WorldDyn {
  /** 0=閉 1=全開 */
  door: number;
  fridge: number;
  chairYaw: number;
  chairPos: THREE.Vector2;
  duvetCover: number;
  fan: boolean;
  laundry: boolean;
  trashBags: number;
  cans: number;
  microwave: number;
  kettle: number;
  scaleDisplay: number;
  ac: number;
}

export function defaultDyn(): WorldDyn {
  return {
    door: 0,
    fridge: 0,
    chairYaw: -Math.PI / 2,
    chairPos: new THREE.Vector2(-0.98, -0.95),
    duvetCover: 0,
    fan: true,
    laundry: false,
    trashBags: 1,
    cans: 3,
    microwave: 0,
    kettle: 0,
    scaleDisplay: 0,
    ac: 0,
  };
}

export class World {
  readonly room: RoomShell;
  readonly furn: Furniture;
  readonly outside: Outside;
  readonly lighting: Lighting;
  private steamSeeds: Float32Array;
  private doorAngle = 0;
  private fridgeAngle = 0;
  private duvet = 0;
  private fanSpin = 0;
  private first = true;

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer, shadowSize: number) {
    this.room = buildRoom();
    this.furn = buildFurniture();
    this.outside = new Outside();
    scene.add(this.room.root, this.furn.root, this.outside.root);
    this.lighting = new Lighting(scene, renderer, shadowSize);
    this.steamSeeds = new Float32Array(40).map(() => Math.random());
  }

  update(t: BoxTime, env: Env, inside: InteriorLights, dyn: WorldDyn, realT: number, dt: number): void {
    this.lighting.update(env, inside, dt);
    this.outside.update(
      {
        dayLight: env.dayLight,
        twilight: env.twilight,
        sunX: env.sunAz,
        sunY: env.dayLight > 0 ? env.sunEl : -1,
        night: env.night,
        weather: env.weather,
        season: env.season,
        t: realT,
        windowLights: env.windowLights,
      },
      dt,
    );
    const f = this.furn;

    // 壁掛け時計
    const h = t.dayMs / HOUR;
    const m = (t.dayMs % HOUR) / MINUTE;
    const s = (t.dayMs % MINUTE) / 1000;
    f.clockHour.rotation.z = -((h % 12) / 12) * TAU;
    f.clockMinute.rotation.z = -(m / 60) * TAU;
    f.clockSecond.rotation.z = -(s / 60) * TAU;

    // 季節の模様替え
    const season = env.season;
    for (const [k, g] of Object.entries(f.seasonal)) g.visible = k === season;
    f.kotatsu.visible = season === 'winter';
    f.table.visible = season !== 'winter';
    f.kotatsuGlow.intensity = season === 'winter' ? inside.kotatsu * 0.6 : 0;

    // 扇風機（首振り）
    if (season === 'summer') {
      const on = dyn.fan ? 1 : 0;
      this.fanSpin = damp(this.fanSpin, on * 28, 2, dt);
      f.fanBlades.rotation.z += this.fanSpin * dt;
      if (on) f.fanHead.rotation.y = Math.sin(realT * 0.35) * 0.7;
      f.windChime.rotation.z = Math.sin(realT * 2.1) * 0.12 * (0.4 + Math.sin(realT * 0.3) * 0.6);
    }
    // 加湿器の湯気
    if (season === 'winter') {
      const pos = f.humidifierSteam.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const k = (realT * 0.25 + this.steamSeeds[i]) % 1;
        pos.setXYZ(i, Math.sin(k * 6 + i) * 0.03 * k, k * 0.5, Math.cos(k * 5 + i) * 0.03 * k);
      }
      pos.needsUpdate = true;
      (f.humidifierSteam.material as THREE.PointsMaterial).opacity = 0.22;
    }

    // ドア・冷蔵庫・布団（ページを開いた直後は即座に合わせる）
    if (this.first) {
      this.first = false;
      this.doorAngle = dyn.door;
      this.fridgeAngle = dyn.fridge;
      this.duvet = dyn.duvetCover;
    }
    this.doorAngle = damp(this.doorAngle, dyn.door, 6, dt);
    this.room.door.rotation.y = -this.doorAngle * 1.45;
    this.room.corridorLight.intensity = inside.corridor * 0.6;
    this.fridgeAngle = damp(this.fridgeAngle, dyn.fridge, 7, dt);
    f.fridgeDoor.rotation.y = this.fridgeAngle * 1.6;
    this.duvet = damp(this.duvet, dyn.duvetCover, 3, dt);
    f.duvet.morphTargetInfluences![0] = this.duvet;

    // チェア
    f.chair.position.x = dyn.chairPos.x;
    f.chair.position.z = dyn.chairPos.y;
    f.chairSeat.rotation.y = dyn.chairYaw + Math.PI / 2;

    // 生活感の蓄積
    f.laundry.visible = dyn.laundry;
    f.trashBags.forEach((b, i) => (b.visible = i < dyn.trashBags));
    f.cans.forEach((c, i) => (c.visible = i < dyn.cans));
    f.microwaveWindow.emissiveIntensity = dyn.microwave * 1.5;
    f.kettleLed.emissiveIntensity = dyn.kettle * 3;
    f.scaleDisplay.emissiveIntensity = dyn.scaleDisplay * 2;
    f.acLed.emissiveIntensity = dyn.ac * 2;
    f.acFlap.rotation.z = dyn.ac * -0.6;

    // PCのRGBはゆっくり色が変わる
    f.pcGlow.emissive.setHSL((realT * 0.03) % 1, 0.8, 0.55);
    f.pcGlow.emissiveIntensity = inside.pc * 1.6;
  }

  /** 平日/休日の洗濯物など、日単位で決まる小物 */
  static dailyProps(t: BoxTime): Partial<WorldDyn> {
    const dow = t.dow;
    // ゴミの日は火・金（朝に出す）。それまで袋が溜まる
    const sinceTrash = dow === 2 || dow === 5 ? 0 : dow === 3 || dow === 6 ? 1 : dow === 4 || dow === 0 ? 2 : 3;
    const afterMorning = t.hour > 7.55 || !(dow === 2 || dow === 5);
    return {
      trashBags: afterMorning ? Math.min(3, sinceTrash) : Math.min(3, sinceTrash + 1),
      cans: Math.min(7, 1 + ((dow + 6) % 7)),
    };
  }
}
