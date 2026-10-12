import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';

// ミニチュア感：ティルトシフト＋周辺減光＋フィルムグレイン
const FinishShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uTilt: { value: 1 },
    uFocusY: { value: 0.5 },
    uVignette: { value: 0.32 },
    uGrain: { value: 0.035 },
    uFade: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uRes;
    uniform float uTime;
    uniform float uTilt;
    uniform float uFocusY;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uFade;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      float d = abs(vUv.y - uFocusY);
      float blur = smoothstep(0.22, 0.62, d) * uTilt;
      vec4 col = texture2D(tDiffuse, vUv);
      if (blur > 0.001) {
        vec2 px = 1.0 / uRes;
        float r = blur * 3.0;
        vec4 acc = col;
        float w = 1.0;
        for (int i = 0; i < 12; i++) {
          float a = float(i) * 2.39996;
          float rr = sqrt(float(i) + 0.5) / sqrt(12.0) * r;
          vec2 o = vec2(cos(a), sin(a)) * rr * px * 2.0;
          acc += texture2D(tDiffuse, vUv + o);
          w += 1.0;
        }
        col = mix(col, acc / w, clamp(blur * 1.4, 0.0, 1.0));
      }
      vec2 c = vUv - 0.5;
      c.x *= uRes.x / uRes.y;
      float v = smoothstep(0.95, 0.25, length(c));
      col.rgb *= mix(1.0 - uVignette, 1.0, v);
      col.rgb += (hash(vUv * uRes + fract(uTime) * 100.0) - 0.5) * uGrain;
      col.rgb = mix(col.rgb, vec3(0.0), uFade);
      gl_FragColor = col;
    }
  `,
};

export interface PostOptions {
  ao: boolean;
  bloom: boolean;
  msaa: number;
}

export class Post {
  readonly composer: EffectComposer;
  private bloom: UnrealBloomPass | null = null;
  private gtao: GTAOPass | null = null;
  private finish: ShaderPass;

  constructor(private renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, opts: PostOptions) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: opts.msaa });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(scene, camera));
    if (opts.ao) {
      this.gtao = new GTAOPass(scene, camera, size.x, size.y);
      this.gtao.output = GTAOPass.OUTPUT.Default;
      this.gtao.blendIntensity = 0.85;
      this.gtao.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.5, thickness: 1.5, scale: 1.0, samples: 12 });
      this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      this.composer.addPass(this.gtao);
    }
    if (opts.bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.45, 0.6, 0.85);
      this.composer.addPass(this.bloom);
    }
    this.composer.addPass(new OutputPass());
    this.finish = new ShaderPass(FinishShader);
    this.composer.addPass(this.finish);
  }

  setSize(w: number, h: number): void {
    this.composer.setSize(w, h);
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.finish.uniforms.uRes.value.set(size.x, size.y);
  }

  set bloomStrength(v: number) {
    if (this.bloom) this.bloom.strength = v;
  }

  set focusY(v: number) {
    this.finish.uniforms.uFocusY.value = v;
  }

  set fade(v: number) {
    this.finish.uniforms.uFade.value = v;
  }

  render(t: number): void {
    this.finish.uniforms.uTime.value = t;
    this.composer.render();
  }
}
