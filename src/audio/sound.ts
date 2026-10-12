import type { FrameOut } from '../brain/ctx';
import type { Env } from '../world/environment';
import type { WorldDyn } from '../world/world';
import type { BoxTime } from '../core/time';

// 効果音・環境音はすべて Web Audio で生成する（外部の音源なし）。

type Vowel = 'a' | 'i' | 'u' | 'e' | 'o' | 'n';
const FORMANTS: Record<Vowel, [number, number, number]> = {
  a: [780, 1180, 2500],
  i: [300, 2200, 2950],
  u: [340, 1250, 2400],
  e: [460, 1850, 2550],
  o: [470, 820, 2550],
  n: [280, 1100, 2300],
};

interface LoopVoice {
  /** 現在の音量（なめらかに追従） */
  vol: number;
  target: number;
  gain: GainNode;
  /** 鳴っている間、毎フレーム呼ぶ（粒の音を予約するなど） */
  tick?(dt: number, vol: number): void;
  stop?(): void;
}

export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private ambBus!: GainNode;
  private muffled!: BiquadFilterNode;
  private noise!: { white: AudioBuffer; pink: AudioBuffer; brown: AudioBuffer };
  private loops = new Map<string, LoopVoice>();
  private amb = new Map<string, LoopVoice>();
  private nextRandom: Record<string, number> = {};
  private time = 0;
  private started = false;

  start(): void {
    if (this.started) return;
    this.started = true;
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;
    void ctx.resume();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 3;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.gain.linearRampToValueAtTime(0.9, ctx.currentTime + 2.5);
    this.master.connect(comp).connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.ambBus = ctx.createGain();
    this.ambBus.connect(this.master);
    // 壁の向こうの音（風呂など）
    this.muffled = ctx.createBiquadFilter();
    this.muffled.type = 'lowpass';
    this.muffled.frequency.value = 700;
    this.muffled.connect(this.sfxBus);
    this.noise = { white: this.makeNoise('white'), pink: this.makeNoise('pink'), brown: this.makeNoise('brown') };
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else void this.ctx.resume();
    });
  }

  private makeNoise(kind: 'white' | 'pink' | 'brown'): AudioBuffer {
    const ctx = this.ctx!;
    const len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') d[i] = w * 0.5;
      else if (kind === 'pink') {
        b0 = 0.99765 * b0 + w * 0.099046;
        b1 = 0.963 * b1 + w * 0.2965164;
        b2 = 0.57 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.12;
      } else {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.2;
      }
    }
    return buf;
  }

  // ---------------- 部品 ----------------

  private noiseSrc(kind: 'white' | 'pink' | 'brown' = 'white'): AudioBufferSourceNode {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noise[kind];
    s.loop = true;
    s.loopStart = Math.random() * 2;
    return s;
  }

  private filter(type: BiquadFilterType, freq: number, q = 1): BiquadFilterNode {
    const f = this.ctx!.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  /** ノイズの一発音 */
  private burst(o: { at?: number; dur: number; type?: BiquadFilterType; freq: number; q?: number; vol: number; attack?: number; kind?: 'white' | 'pink' | 'brown'; sweep?: number; dest?: AudioNode }): void {
    const ctx = this.ctx!;
    const t = (o.at ?? 0) + ctx.currentTime;
    const src = this.noiseSrc(o.kind ?? 'white');
    const f = this.filter(o.type ?? 'bandpass', o.freq, o.q ?? 1);
    if (o.sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, o.freq * o.sweep), t + o.dur);
    const g = ctx.createGain();
    const a = o.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(f).connect(g).connect(o.dest ?? this.sfxBus);
    src.start(t, Math.random() * 2);
    src.stop(t + o.dur + 0.05);
  }

  /** 音程のある一発音 */
  private tone(o: { at?: number; freq: number; to?: number; dur: number; vol: number; type?: OscillatorType; attack?: number; dest?: AudioNode }): void {
    const ctx = this.ctx!;
    const t = (o.at ?? 0) + ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol, t + (o.attack ?? 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    osc.connect(g).connect(o.dest ?? this.sfxBus);
    osc.start(t);
    osc.stop(t + o.dur + 0.05);
  }

  /** 声（ノコギリ波＋フォルマント）。母音の並びと音程の流れ */
  private voice(o: { at?: number; vowels: Vowel[]; pitch: [number, number]; dur: number; vol: number; breath?: number; dest?: AudioNode }): void {
    const ctx = this.ctx!;
    const t = (o.at ?? 0) + ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(o.pitch[0], t);
    osc.frequency.linearRampToValueAtTime(o.pitch[1], t + o.dur);
    // ゆらぎ
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.5;
    const vg = ctx.createGain();
    vg.gain.value = o.pitch[0] * 0.02;
    vib.connect(vg).connect(osc.frequency);
    const src = ctx.createGain();
    osc.connect(src);
    if (o.breath) {
      const n = this.noiseSrc('white');
      const ng = ctx.createGain();
      ng.gain.value = o.breath;
      n.connect(ng).connect(src);
      n.start(t);
      n.stop(t + o.dur + 0.1);
    }
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(o.vol, t + 0.04);
    env.gain.setValueAtTime(o.vol, t + o.dur * 0.7);
    env.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    const step = o.dur / o.vowels.length;
    for (let k = 0; k < 3; k++) {
      const bp = this.filter('bandpass', FORMANTS[o.vowels[0]][k], 7 + k * 3);
      o.vowels.forEach((v, i) => bp.frequency.linearRampToValueAtTime(FORMANTS[v][k], t + step * (i + 0.5)));
      const g = ctx.createGain();
      g.gain.value = [1, 0.6, 0.25][k];
      src.connect(bp).connect(g).connect(env);
    }
    env.connect(o.dest ?? this.sfxBus);
    osc.start(t);
    vib.start(t);
    osc.stop(t + o.dur + 0.05);
    vib.stop(t + o.dur + 0.05);
  }

  /** 連続音（ノイズ＋フィルタ） */
  private noiseLoop(kind: 'white' | 'pink' | 'brown', type: BiquadFilterType, freq: number, q: number, dest?: AudioNode): LoopVoice {
    const ctx = this.ctx!;
    const src = this.noiseSrc(kind);
    const f = this.filter(type, freq, q);
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(dest ?? this.sfxBus);
    src.start();
    return { vol: 0, target: 0, gain: g, stop: () => src.stop() };
  }

  /** 粒の音を予約し続けるループ */
  private grainLoop(rate: number, fire: (vol: number) => void): LoopVoice {
    const g = this.ctx!.createGain();
    let acc = Math.random();
    return {
      vol: 0,
      target: 0,
      gain: g,
      tick: (dt, vol) => {
        acc += dt * rate * (0.6 + Math.random() * 0.8);
        while (acc >= 1) {
          acc -= 1;
          fire(vol);
        }
      },
    };
  }

  // ---------------- 一回きりの音 ----------------

  private play(name: string): void {
    const B = (o: Parameters<Sound['burst']>[0]) => this.burst(o);
    const T = (o: Parameters<Sound['tone']>[0]) => this.tone(o);
    const Vo = (o: Parameters<Sound['voice']>[0]) => this.voice(o);
    switch (name) {
      case 'sigh':
        B({ dur: 0.35, freq: 900, q: 0.8, vol: 0.05, attack: 0.15, kind: 'pink' });
        B({ at: 0.4, dur: 1.4, freq: 700, q: 0.7, vol: 0.09, attack: 0.1, sweep: 0.6, kind: 'pink' });
        Vo({ at: 0.45, vowels: ['a', 'a', 'o'], pitch: [125, 95], dur: 0.9, vol: 0.025, breath: 0.6 });
        break;
      case 'yawn':
        Vo({ vowels: ['a', 'a', 'o', 'u'], pitch: [190, 110], dur: 1.8, vol: 0.06, breath: 0.4 });
        break;
      case 'stretch':
        Vo({ vowels: ['n', 'n', 'u'], pitch: [140, 210], dur: 1.2, vol: 0.05, breath: 0.2 });
        B({ at: 0.3, dur: 0.12, freq: 300, q: 4, vol: 0.05 });
        break;
      case 'ahh':
        B({ dur: 0.12, freq: 1500, q: 0.6, vol: 0.06 });
        Vo({ at: 0.1, vowels: ['a', 'a', 'a'], pitch: [170, 120], dur: 0.9, vol: 0.06, breath: 0.5 });
        break;
      case 'laugh':
        for (let i = 0; i < 4; i++) Vo({ at: i * 0.16, vowels: ['a'], pitch: [170 - i * 8, 150 - i * 8], dur: 0.12, vol: 0.05, breath: 0.4 });
        break;
      case 'huff':
        B({ dur: 0.4, freq: 800, q: 0.7, vol: 0.08, attack: 0.02, kind: 'pink' });
        Vo({ vowels: ['u'], pitch: [140, 120], dur: 0.3, vol: 0.03, breath: 0.8 });
        break;
      case 'startle':
        B({ dur: 0.25, freq: 1400, q: 1, vol: 0.05, attack: 0.03 });
        this.creak(0.1);
        break;
      case 'win':
        // ゲームのファンファーレ＋小さく「よし」
        [523, 659, 784, 1046].forEach((f, i) => T({ at: i * 0.09, freq: f, dur: 0.25, vol: 0.035, type: 'square' }));
        Vo({ at: 0.45, vowels: ['o', 'i'], pitch: [150, 170], dur: 0.35, vol: 0.05 });
        break;
      case 'lose':
        [392, 330, 262, 196].forEach((f, i) => T({ at: i * 0.15, freq: f, dur: 0.3, vol: 0.03, type: 'triangle' }));
        Vo({ at: 0.3, vowels: ['a', 'a', 'a'], pitch: [160, 100], dur: 1.1, vol: 0.06, breath: 0.5 });
        this.creak(0.6);
        break;
      case 'gulp':
        T({ freq: 320, to: 140, dur: 0.14, vol: 0.12 });
        break;
      case 'click':
        B({ dur: 0.03, freq: 3500, q: 3, vol: 0.08 });
        break;
      case 'slack':
        T({ freq: 880, dur: 0.12, vol: 0.06, type: 'triangle' });
        T({ at: 0.09, freq: 1320, dur: 0.18, vol: 0.05, type: 'triangle' });
        B({ dur: 0.05, freq: 2000, q: 2, vol: 0.05 });
        break;
      case 'doorOpen':
        B({ dur: 0.06, freq: 2500, q: 3, vol: 0.12 });
        this.creak(0.08, 0.9);
        break;
      case 'doorClose':
        B({ dur: 0.25, freq: 120, q: 1, vol: 0.4, kind: 'brown' });
        B({ at: 0.03, dur: 0.05, freq: 2200, q: 3, vol: 0.12 });
        break;
      case 'doorbell':
        T({ freq: 659, dur: 1.0, vol: 0.18, type: 'sine' });
        T({ freq: 1318, dur: 0.6, vol: 0.03, type: 'sine' });
        T({ at: 0.55, freq: 523, dur: 1.6, vol: 0.18, type: 'sine' });
        T({ at: 0.55, freq: 1046, dur: 0.8, vol: 0.03, type: 'sine' });
        break;
      case 'fridgeOpen':
        B({ dur: 0.18, freq: 400, q: 0.8, vol: 0.1, kind: 'pink' });
        break;
      case 'fridgeClose':
        B({ dur: 0.2, freq: 150, q: 1, vol: 0.25, kind: 'brown' });
        break;
      case 'canOpen':
        B({ dur: 0.03, freq: 3000, q: 2, vol: 0.12 });
        B({ at: 0.02, dur: 0.35, freq: 5000, q: 0.7, vol: 0.12, sweep: 0.5 });
        break;
      case 'beep':
        T({ freq: 2100, dur: 0.09, vol: 0.06, type: 'square' });
        T({ at: 0.14, freq: 2100, dur: 0.09, vol: 0.06, type: 'square' });
        break;
      case 'flush':
        B({ dur: 3.5, freq: 600, q: 0.5, vol: 0.25, attack: 0.3, kind: 'pink', sweep: 0.6, dest: this.muffled });
        break;
      case 'thanks':
        this.mumble(1.2, 0.05, 150);
        this.mumble(1.0, 0.035, 120, 1.3);
        break;
      case 'bag':
        for (let i = 0; i < 6; i++) B({ at: i * 0.05 + Math.random() * 0.03, dur: 0.06, freq: 3000 + Math.random() * 3000, q: 1, vol: 0.05 });
        break;
      case 'cloth':
        B({ dur: 0.5, freq: 2500, q: 0.6, vol: 0.04, attack: 0.1, kind: 'pink' });
        break;
      case 'shave': {
        const ctx = this.ctx!;
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = 118;
        const f = this.filter('bandpass', 1200, 2);
        const g = ctx.createGain();
        const t = ctx.currentTime;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.02, t + 0.1);
        g.gain.setValueAtTime(0.02, t + 2);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 2.3);
        osc.connect(f).connect(g).connect(this.muffled);
        osc.start(t);
        osc.stop(t + 2.4);
        break;
      }
    }
  }

  private creak(at = 0, vol = 1): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(70 + Math.random() * 30, t);
    osc.frequency.linearRampToValueAtTime(110 + Math.random() * 40, t + 0.3);
    const f = this.filter('bandpass', 900, 6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.02 * vol, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    osc.connect(f).connect(g).connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + 0.4);
  }

  /** もごもごした話し声 */
  private mumble(dur: number, vol: number, pitch: number, at = 0, dest?: AudioNode): void {
    const vs: Vowel[] = ['a', 'i', 'u', 'e', 'o', 'n'];
    let tt = 0;
    while (tt < dur) {
      const len = 0.08 + Math.random() * 0.14;
      const seq = [vs[Math.floor(Math.random() * 6)], vs[Math.floor(Math.random() * 6)]];
      const p0 = pitch * (0.9 + Math.random() * 0.3);
      this.voice({ at: at + tt, vowels: seq, pitch: [p0, p0 * (0.85 + Math.random() * 0.2)], dur: len, vol, dest });
      tt += len + (Math.random() < 0.15 ? 0.15 : 0.01);
    }
  }

  // ---------------- 鳴らし続ける音 ----------------

  private makeLoop(name: string): LoopVoice | null {
    const B = (o: Parameters<Sound['burst']>[0]) => this.burst(o);
    switch (name) {
      case 'snore': {
        // 吸って吐くのに合わせていびき
        let phase = 0;
        const g = this.ctx!.createGain();
        return {
          vol: 0, target: 0, gain: g,
          tick: (dt, vol) => {
            phase += dt / 3.6;
            if (phase >= 1) {
              phase -= 1;
              const ctx = this.ctx!;
              const t = ctx.currentTime;
              const osc = ctx.createOscillator();
              osc.type = 'sawtooth';
              osc.frequency.setValueAtTime(55, t);
              osc.frequency.linearRampToValueAtTime(70, t + 1.2);
              const am = ctx.createOscillator();
              am.frequency.value = 28;
              const amg = ctx.createGain();
              amg.gain.value = 0.5;
              const f = this.filter('lowpass', 500, 2);
              const env = ctx.createGain();
              env.gain.setValueAtTime(0.0001, t);
              env.gain.exponentialRampToValueAtTime(0.06 * vol, t + 0.5);
              env.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
              am.connect(amg).connect(env.gain);
              osc.connect(f).connect(env).connect(this.sfxBus);
              osc.start(t);
              am.start(t);
              osc.stop(t + 1.5);
              am.stop(t + 1.5);
              B({ at: 1.7, dur: 1.2, freq: 500, q: 0.6, vol: 0.03 * vol, attack: 0.3, kind: 'pink' });
            }
          },
        };
      }
      case 'alarm':
        return this.grainLoop(4, (v) => this.tone({ freq: 1250, dur: 0.12, vol: 0.06 * v, type: 'square' }));
      case 'typing':
        return this.grainLoop(9, (v) => B({ dur: 0.035, freq: 2200 + Math.random() * 2500, q: 2.5, vol: (0.03 + Math.random() * 0.03) * v }));
      case 'click':
        return this.grainLoop(3, (v) => B({ dur: 0.02, freq: 4000, q: 4, vol: 0.05 * v }));
      case 'clicky':
        return this.grainLoop(7, (v) => B({ dur: 0.02, freq: 3500 + Math.random() * 1500, q: 4, vol: 0.035 * v }));
      case 'tap':
        return this.grainLoop(3, (v) => B({ dur: 0.02, freq: 1800, q: 3, vol: 0.02 * v }));
      case 'meetingVoice':
        return this.grainLoop(0.9, (v) => this.mumble(0.8 + Math.random() * 1.2, 0.012 * v, 110 + Math.random() * 90, 0, this.laptopBus()));
      case 'mumble':
        return this.grainLoop(1.6, (v) => this.mumble(0.5, 0.04 * v, 125));
      case 'videoAudio':
        return this.grainLoop(1.2, (v) => {
          this.mumble(0.6 + Math.random(), 0.01 * v, 140 + Math.random() * 60, 0, this.laptopBus());
          if (Math.random() < 0.2) this.tone({ freq: 440 * Math.pow(2, Math.floor(Math.random() * 8) / 12), dur: 0.3, vol: 0.01 * v, type: 'triangle' });
        });
      case 'tvShow':
        return this.grainLoop(1.4, (v) => {
          this.mumble(0.7 + Math.random(), 0.016 * v, 150 + Math.random() * 80, 0, this.laptopBus());
          if (Math.random() < 0.25) for (let i = 0; i < 6; i++) this.voice({ at: 0.6 + i * 0.13, vowels: ['a'], pitch: [200 + Math.random() * 100, 180], dur: 0.1, vol: 0.008 * v, breath: 0.6, dest: this.laptopBus() });
        });
      case 'gamePC':
        return this.grainLoop(2.5, (v) => {
          B({ dur: 0.12, freq: 400 + Math.random() * 600, q: 1, vol: 0.02 * v, dest: this.laptopBus() });
          if (Math.random() < 0.3) this.tone({ freq: 220 * (1 + Math.floor(Math.random() * 4)), dur: 0.12, vol: 0.008 * v, type: 'square', dest: this.laptopBus() });
        });
      case 'gameTV': {
        // ペンタトニックで適当なチップチューン
        const scale = [0, 2, 4, 7, 9, 12, 14, 16];
        let n = 0;
        return this.grainLoop(5, (v) => {
          n++;
          const root = 262;
          const f = root * Math.pow(2, scale[Math.floor(Math.random() * scale.length)] / 12);
          this.tone({ freq: f, dur: 0.16, vol: 0.012 * v, type: 'square', dest: this.laptopBus() });
          if (n % 4 === 0) this.tone({ freq: root / 2, dur: 0.3, vol: 0.014 * v, type: 'triangle', dest: this.laptopBus() });
        });
      }
      case 'slurp':
        return this.grainLoop(1.2, (v) => B({ dur: 0.45, freq: 1800, q: 1.5, vol: 0.05 * v, sweep: 1.6, kind: 'pink' }));
      case 'crunch':
        return this.grainLoop(5, (v) => B({ dur: 0.05, freq: 2500 + Math.random() * 2000, q: 1, vol: 0.04 * v }));
      case 'kettle': {
        const l = this.noiseLoop('brown', 'lowpass', 300, 1);
        return l;
      }
      case 'pour':
        return this.noiseLoop('pink', 'bandpass', 1400, 1.2);
      case 'shower':
        return this.noiseLoop('pink', 'bandpass', 1800, 0.6, this.muffled);
      case 'steps':
        return this.grainLoop(1.8, (v) => B({ dur: 0.09, freq: 140, q: 1, vol: 0.1 * v, kind: 'brown' }));
      case 'spray':
        return this.grainLoop(3, (v) => B({ dur: 0.15, freq: 5000, q: 0.8, vol: 0.05 * v }));
      case 'pant':
        return this.grainLoop(2.4, (v) => B({ dur: 0.3, freq: 900, q: 0.7, vol: 0.05 * v, attack: 0.05, kind: 'pink' }));
      case 'cloth':
        return this.grainLoop(1.2, (v) => B({ dur: 0.3, freq: 2500, q: 0.6, vol: 0.03 * v, attack: 0.05, kind: 'pink' }));
    }
    return null;
  }

  private _laptopBus: BiquadFilterNode | null = null;
  /** スピーカー越しの音（帯域が狭い） */
  private laptopBus(): AudioNode {
    if (!this._laptopBus) {
      this._laptopBus = this.filter('bandpass', 1500, 0.5);
      this._laptopBus.connect(this.sfxBus);
    }
    return this._laptopBus;
  }

  // ---------------- 環境音 ----------------

  private makeAmb(name: string): LoopVoice | null {
    switch (name) {
      case 'room':
        return this.noiseLoop('brown', 'lowpass', 220, 0.7, this.ambBus);
      case 'ac':
        return this.noiseLoop('pink', 'lowpass', 900, 0.5, this.ambBus);
      case 'fan':
        return this.noiseLoop('pink', 'bandpass', 600, 0.4, this.ambBus);
      case 'rain':
        return this.noiseLoop('pink', 'bandpass', 2500, 0.35, this.ambBus);
      case 'city':
        return this.noiseLoop('brown', 'lowpass', 160, 0.5, this.ambBus);
      case 'cicada': {
        // ミンミン：高い音を震わせる
        const ctx = this.ctx!;
        const g = ctx.createGain();
        g.gain.value = 0;
        const mk = (f: number, rate: number) => {
          const o = ctx.createOscillator();
          o.frequency.value = f;
          const am = ctx.createOscillator();
          am.frequency.value = rate;
          const amg = ctx.createGain();
          amg.gain.value = 0.5;
          const og = ctx.createGain();
          og.gain.value = 0.5;
          am.connect(amg).connect(og.gain);
          o.connect(og).connect(g);
          o.start();
          am.start();
        };
        mk(4200, 32);
        mk(4800, 41);
        const n = this.noiseSrc('white');
        const nf = this.filter('bandpass', 5500, 3);
        const ng = ctx.createGain();
        ng.gain.value = 0.4;
        n.connect(nf).connect(ng).connect(g);
        n.start();
        const lp = this.filter('lowpass', 3500, 0.5);
        g.connect(lp).connect(this.ambBus);
        return { vol: 0, target: 0, gain: g };
      }
      case 'crickets':
        return this.grainLoop(2.2, (v) => {
          for (let i = 0; i < 3; i++) this.tone({ at: i * 0.05, freq: 4400, dur: 0.035, vol: 0.006 * v, dest: this.ambBus });
        });
      case 'birds':
        return this.grainLoop(0.6, (v) => {
          const f = 2500 + Math.random() * 1500;
          for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) this.tone({ at: i * 0.12, freq: f, to: f * 1.3, dur: 0.08, vol: 0.008 * v, dest: this.ambBus });
        });
    }
    return null;
  }

  private setVoice(map: Map<string, LoopVoice>, name: string, target: number, dt: number, make: (n: string) => LoopVoice | null, rate = 3): void {
    let v = map.get(name);
    if (!v) {
      if (target <= 0.001) return;
      const nv = make(name);
      if (!nv) return;
      v = nv;
      map.set(name, v);
    }
    v.target = target;
    v.vol += (v.target - v.vol) * (1 - Math.exp(-rate * dt));
    v.gain.gain.value = v.vol * (v.tick ? 1 : 0.5);
    if (v.tick && v.vol > 0.02) v.tick(dt, v.vol);
  }

  update(out: FrameOut, env: Env, dyn: WorldDyn, t: BoxTime, dt: number): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    this.time += dt;
    for (const s of out.sounds) this.play(s);

    // 行動の音
    const names = new Set<string>([...this.loops.keys(), ...out.loops.keys()]);
    for (const n of names) {
      const target = out.loops.get(n) ?? 0;
      const vol = n === 'shower' ? target * 0.25 : n === 'kettle' ? target * 0.3 : n === 'pour' ? target * 0.12 : target;
      this.setVoice(this.loops, n, vol, dt, (x) => this.makeLoop(x), 6);
    }

    // 環境音
    const h = t.hour;
    const rain = env.weather === 'rain' ? 0.12 : 0;
    const summerDay = env.season === 'summer' && h > 6.5 && h < 18.5 && env.weather !== 'rain' ? 0.035 : 0;
    const crickets = (env.season === 'autumn' || (env.season === 'summer' && h > 20)) && (h > 19 || h < 4) ? 1 : 0;
    const birds = (h > env.sunRise - 0.4 && h < env.sunRise + 2.5 && env.weather !== 'rain') ? 1 : 0;
    this.setVoice(this.amb, 'room', 0.05, dt, (x) => this.makeAmb(x));
    this.setVoice(this.amb, 'ac', dyn.ac ? 0.06 : 0, dt, (x) => this.makeAmb(x), 1);
    this.setVoice(this.amb, 'fan', env.season === 'summer' && dyn.fan ? 0.05 : 0, dt, (x) => this.makeAmb(x), 1);
    this.setVoice(this.amb, 'rain', rain, dt, (x) => this.makeAmb(x), 0.5);
    this.setVoice(this.amb, 'city', 0.08 + (h > 7 && h < 21 ? 0.06 : 0), dt, (x) => this.makeAmb(x), 0.5);
    this.setVoice(this.amb, 'cicada', summerDay, dt, (x) => this.makeAmb(x), 0.5);
    this.setVoice(this.amb, 'crickets', crickets, dt, (x) => this.makeAmb(x), 0.5);
    this.setVoice(this.amb, 'birds', birds, dt, (x) => this.makeAmb(x), 0.5);

    // ときどき聞こえる遠くの音
    this.randomly('car', 9, 25, () => this.burst({ dur: 2.5, freq: 300, q: 0.7, vol: 0.05, attack: 1.0, kind: 'brown', sweep: 0.6, dest: this.ambBus }));
    this.randomly('siren', 120, 300, () => this.siren());
    if (env.season === 'summer') this.randomly('chime', 6, 18, () => {
      const f = 2300 + Math.random() * 400;
      this.tone({ freq: f, dur: 1.6, vol: 0.02, dest: this.ambBus });
      this.tone({ freq: f * 2.7, dur: 0.8, vol: 0.006, dest: this.ambBus });
    });
    if (h > 16 && h < 18.5) this.randomly('crow', 25, 60, () => {
      for (let i = 0; i < 2; i++) this.voice({ at: i * 0.5, vowels: ['a', 'a'], pitch: [520, 480], dur: 0.35, vol: 0.006, breath: 0.8, dest: this.ambBus });
    });
  }

  private randomly(key: string, min: number, max: number, fn: () => void): void {
    const next = this.nextRandom[key];
    if (next === undefined) {
      this.nextRandom[key] = this.time + min + Math.random() * (max - min);
      return;
    }
    if (this.time >= next) {
      fn();
      this.nextRandom[key] = this.time + min + Math.random() * (max - min);
    }
  }

  private siren(): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    for (let i = 0; i < 12; i++) osc.frequency.setValueAtTime(i % 2 ? 770 : 960, t + i * 0.65);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.01, t + 3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 7.8);
    const f = this.filter('lowpass', 1400, 0.5);
    osc.connect(f).connect(g).connect(this.ambBus);
    osc.start(t);
    osc.stop(t + 8);
  }
}
