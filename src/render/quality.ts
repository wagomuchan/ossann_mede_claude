import * as THREE from 'three';

export interface Quality {
  level: 'low' | 'mid' | 'high';
  pixelRatio: number;
  shadowSize: number;
  ao: boolean;
  msaa: number;
}

export function detectQuality(renderer: THREE.WebGLRenderer, override?: string): Quality {
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && window.innerWidth < 1100);
  const dpr = window.devicePixelRatio || 1;
  const gl = renderer.getContext();
  const maxSamples = gl instanceof WebGL2RenderingContext ? (gl.getParameter(gl.MAX_SAMPLES) as number) : 0;
  let level: Quality['level'] = mobile ? 'mid' : 'high';
  if (override === 'low' || override === 'mid' || override === 'high') level = override;
  switch (level) {
    case 'high':
      return { level, pixelRatio: Math.min(dpr, 2), shadowSize: 2048, ao: true, msaa: Math.min(4, maxSamples) };
    case 'mid':
      return { level, pixelRatio: Math.min(dpr, 1.5), shadowSize: 1024, ao: false, msaa: Math.min(4, maxSamples) };
    default:
      return { level, pixelRatio: 1, shadowSize: 1024, ao: false, msaa: 0 };
  }
}
