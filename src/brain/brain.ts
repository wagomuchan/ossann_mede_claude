import * as THREE from 'three';
import { getPlan } from './plan';
import { ACTS } from './acts';
import { Ctx, FrameOut, Place, Step, resetOut } from './ctx';
import { findPath, samplePath } from './nav';
import { Rng, hash32, noise1 } from '../core/random';
import { BoxTime, DAY, DebugParams, MINUTE, DEFAULT_SPEED } from '../core/time';
import type { Env } from '../world/environment';
import type { WorldDyn } from '../world/world';
import type { Ossan } from '../ossan/ossan';
import * as P from '../ossan/poses';

// 箱庭の時刻から「いま何をしているか」を決め、姿勢・小道具・画面・音を出力する。

const WALK_SPEED = 0.72; // m/s（現実時間）
const BOX_PER_SEC = DEFAULT_SPEED * 1000;
const PROJECT_EPOCH = Date.UTC(2026, 9, 1);

export interface BrainState {
  step: Step;
  walking: boolean;
  label: string;
}

const T_COLORS = ['#6b7280', '#2f3b52', '#3a3a3a', '#7a2e2e', '#56614a', '#8a8f99', '#2b4a6b'];

export class Brain {
  private lastKey = '';
  private lastSec = 0;
  private firstFrame = true;
  state: BrainState | null = null;

  constructor(private ossan: Ossan, private debug: DebugParams) {}

  frame(t: BoxTime, env: Env, realT: number, out: FrameOut, dyn: WorldDyn): void {
    resetOut(out);
    const plan = getPlan(t.day);
    let i = plan.length - 1;
    while (i > 0 && plan[i].start > t.dayMs) i--;
    const step = plan[i];
    const prev = i > 0 ? plan[i - 1] : getPlan(t.day - 1).slice(-1)[0];
    const end = i < plan.length - 1 ? plan[i + 1].start : DAY;
    const local = t.dayMs - step.start;
    const dur = end - step.start;

    const def = ACTS[step.act];
    const prevDef = ACTS[prev.act];
    const from = (prevDef.exit ?? prevDef.place)({ step: prev });
    const to = def.place({ step });

    // 歩く必要があるか
    let walkBox = 0;
    let path: ReturnType<typeof findPath> | null = null;
    if (from && to && from.pos.distanceTo(to.pos) > 0.05 && !step.p.cont) {
      path = findPath(from.node, from.pos, to.node, to.pos);
      walkBox = Math.min((path.length / WALK_SPEED) * BOX_PER_SEC, dur * 0.6);
    }

    const p = this.ossan.begin();
    this.appearance(t, env, plan, out);

    const key = `${t.day}|${i}`;
    // 出前のインターホンは、歩き出す前に鳴る
    if (step.act === 'delivery' && !this.lastKey.startsWith(`${key}|`) && !this.firstFrame) out.sounds.push('doorbell');
    if (local < walkBox && path) {
      this.walk(p, path, local / walkBox, (path.length / walkBox) * BOX_PER_SEC, realT, step, out, prev, to);
      this.state = { step, walking: true, label: `→ ${step.act}` };
      this.lastKey = `${key}|walk`;
    } else {
      const sec = (local - walkBox) / BOX_PER_SEC;
      const durSec = (dur - walkBox) / BOX_PER_SEC;
      const k2 = `${key}|act`;
      let prevSec = this.lastKey === k2 ? this.lastSec : 0;
      if (this.firstFrame) prevSec = sec;
      const seed = step.p.seed ?? hash32(t.day, i);
      const ctx: Ctx = {
        p,
        props: this.ossan.props,
        dyn,
        out,
        t,
        env,
        realT,
        sec,
        prevSec,
        durSec,
        step,
        seed,
        rng: (tag) => Rng.of(seed, tag),
        once: (name, at) => {
          if (prevSec < at && sec >= at) out.sounds.push(name);
          else if (at === 0 && prevSec === 0 && sec > 0 && this.lastKey !== k2) out.sounds.push(name);
        },
        loop: (name, vol = 1) => out.loops.set(name, Math.max(out.loops.get(name) ?? 0, vol)),
      };
      def.sample(ctx);
      this.lastKey = k2;
      this.lastSec = sec;
      this.state = { step, walking: false, label: step.act };
    }
    this.firstFrame = false;

    // 照明
    if (out.ceiling === 'auto') out.ceiling = env.dayLight < 0.45 && out.visible ? 'on' : 'off';
    this.ossan.visible = out.visible;
  }

  private walk(p: ReturnType<Ossan['begin']>, path: ReturnType<typeof findPath>, k: number, speed: number, realT: number, step: Step, out: FrameOut, prev: Step, to: Place | null): void {
    const d = k * path.length;
    const s = samplePath(path, d);
    p.root.copy(s.pos);
    p.yaw = s.yaw;
    // 歩幅 1.1m で一周期
    const phase = (d / 1.05) * Math.PI * 2;
    P.walk(p, phase, Math.min(1, speed / 0.6));
    p.add('head', noise1(realT * 0.4, 8) * 0.05, noise1(realT * 0.3, 9) * 0.15, 0);
    // 到着の直前は目的の方を向く
    if (to && k > 0.9) p.yaw = s.yaw;
    p.lookAt(P.local(p, 0, 1.4, 1.5).add(new THREE.Vector3(0, -0.4, 0)), 0.3);
    out.loops.set('steps', 1);
    if (step.p.carry) {
      const side = 'R';
      this.ossan.props.hold(step.p.carry, side, [0, 0.0, 0.03]);
    }
    if (prev.act === 'back' && prev.p.why === 'bath') out.towel = true;
    if (prev.p.dark && step.act !== 'sleep') out.ceiling = 'auto';
  }

  /** 服装・髪・体重・ひげ（日や現実の日付で変わるもの） */
  private appearance(t: BoxTime, env: Env, plan: Step[], out: FrameOut): void {
    const rig = this.ossan.rig;
    // 長い時間で変わる：髪は減るだけ、体重は上下する
    const days = Math.max(0, (t.realMs - PROJECT_EPOCH) / 86_400_000);
    const hair = this.debug.hair ?? Math.max(0.12, 0.7 - days * 0.0011);
    const weight = this.debug.weight ?? Math.min(1, Math.max(0.15, 0.5 + 0.12 * Math.sin(days / 19) + noise1(days / 6, 3) * 0.08 + days * 0.0002));
    rig.setHair(hair);
    rig.setWeight(weight);

    // ひげ：月曜の朝に剃って、週末にかけて伸びる
    const sinceMon = ((t.dow + 6) % 7) * 24 + t.hour - 8.9;
    rig.setStubble(Math.min(1, Math.max(0, sinceMon / 130)));

    // 服：仕事中はシャツ（dress の途中で着替える）
    let shirt = false;
    for (const s of plan) {
      if (s.act !== 'dress') continue;
      const mid = s.start + 3 * MINUTE;
      if (t.dayMs >= mid) shirt = s.p.on ?? true;
    }
    out.outfit = shirt ? 'shirt' : 'tshirt';
    const r = Rng.of('tshirt', t.day);
    const color = T_COLORS[Math.floor(r.next() * T_COLORS.length)];
    rig.setHanten(env.season === 'winter' && !shirt);
    this.tshirtColor = color;
    this.tshirtPrint = r.chance(0.5);

    // 風呂上がりはしばらくタオルを首に
    for (const s of plan) {
      if (s.act === 'back' && s.p.why === 'bath' && t.dayMs > s.start && t.dayMs < s.start + 25 * MINUTE) out.towel = true;
    }
  }

  tshirtColor = '#6b7280';
  tshirtPrint = true;

  /** 行動が出力したあとの見た目の反映 */
  applyLook(out: FrameOut): void {
    const rig = this.ossan.rig;
    rig.setOutfit(out.outfit, this.tshirtColor, this.tshirtPrint);
    rig.neckTowel.visible = out.towel;
    rig.face.glasses.visible = out.glasses;
  }
}
