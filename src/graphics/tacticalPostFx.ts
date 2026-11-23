/**
 * Fullscreen single-pass HDR tactical post-processing:
 * - WebGL2 Hardware MSAA on the offscreen render target (keeps edges crisp, zero jaggedness)
 * - HalfFloat HDR render target when supported (preserves specular headroom before tone mapping)
 * - HDR-thresholded micro-bloom on bright glints/muzzle flash (never blooms matte walls)
 * - Official Three.js `#include <tonemapping_fragment>` (ACES Filmic / Linear + toneMappingExposure)
 * - Post-tonemap 5-tap neighborhood-clamped CAS sharpen (crisp textures, zero ringing/halos)
 * - Subtle biome-calibrated contrast/vibrance + optical framing vignette + damage flash
 *
 * Single quad blit — no multi-pass EffectComposer overhead on mobile GPUs.
 */

import * as THREE from 'three';

export type PostFxBiome = 'desert' | 'outdoor' | 'indoor';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tDiffuse;
uniform float uSharpen;
uniform float uDamage;
uniform float uBloomStrength;
uniform float uContrast;
uniform float uSaturation;
uniform float uVignette;
uniform vec3 uTint;
uniform vec2 uTexel;
varying vec2 vUv;

void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb;

  // 5-tap cross neighborhood in linear HDR space:
  // Drives subtle HDR-thresholded micro-bloom AND zero-ringing CAS edge sharpen.
  if (uSharpen > 0.001 || uBloomStrength > 0.001) {
    vec2 t = uTexel;
    vec3 n  = texture2D(tDiffuse, vUv + vec2(0.0, t.y)).rgb;
    vec3 s  = texture2D(tDiffuse, vUv - vec2(0.0, t.y)).rgb;
    vec3 e  = texture2D(tDiffuse, vUv + vec2(t.x, 0.0)).rgb;
    vec3 w  = texture2D(tDiffuse, vUv - vec2(t.x, 0.0)).rgb;

    vec3 blur = (n + s + e + w) * 0.25;

    if (uSharpen > 0.001) {
      vec3 detail = c - blur;
      vec3 mn = min(c, min(min(n, s), min(e, w)));
      vec3 mx = max(c, max(max(n, s), max(e, w)));
      vec3 sharpened = clamp(c + detail * uSharpen, mn, mx);

      float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
      float protect = smoothstep(0.02, 0.15, lum) * (1.0 - smoothstep(0.95, 1.6, lum));
      c = mix(c, sharpened, protect);
    }

    if (uBloomStrength > 0.001) {
      // True HDR threshold (> 1.35 linear) so matte sunlit sandstone NEVER washes out,
      // while metallic glints, muzzle flashes, and emissive optics get a clean soft glow.
      vec3 hi = max(blur - vec3(1.35), vec3(0.0));
      hi = hi / (vec3(1.0) + hi);
      c += hi * uBloomStrength;
    }
  }

  // Official Three.js Tone Mapping (ACES Filmic or Linear + renderer.toneMappingExposure)
  // Required because WebGLRenderer skips material tone mapping when rendering to an offscreen RT.
  gl_FragColor = vec4(max(c, vec3(0.0)), 1.0);
  #include <tonemapping_fragment>

  // Post-tonemap subtle filmic grading in display linear [0..1]
  vec3 mapped = gl_FragColor.rgb;

  if (abs(uContrast - 1.0) > 0.001) {
    vec3 pivot = vec3(0.18);
    mapped = max(vec3(0.0), pivot + (mapped - pivot) * uContrast);
  }

  float luma = dot(mapped, vec3(0.2126, 0.7152, 0.0722));
  mapped = mix(vec3(luma), mapped, uSaturation);
  mapped *= uTint;

  // Subtle optical lens framing vignette
  vec2 d = vUv - 0.5;
  float r2 = dot(d, d);
  if (uVignette > 0.001) {
    float optVig = 1.0 - smoothstep(0.24, 0.76, r2) * uVignette;
    mapped *= optVig;
  }

  // Reactive combat damage vignette
  if (uDamage > 0.001) {
    float vig = smoothstep(0.42, 1.15, length(d) * 1.35);
    mapped = mix(mapped, mapped * vec3(0.65, 0.16, 0.12), vig * uDamage);
  }

  gl_FragColor = vec4(max(mapped, vec3(0.0)), 1.0);
  #include <colorspace_fragment>
}
`;

export interface TacticalPostFxState {
  enabled: boolean;
  sharpen: number;
  biome: PostFxBiome;
  lastToneMapping: THREE.ToneMapping | null;
  rt: THREE.WebGLRenderTarget | null;
  scene: THREE.Scene | null;
  camera: THREE.OrthographicCamera | null;
  material: THREE.ShaderMaterial | null;
  quad: THREE.Mesh | null;
}

const _drawSize = new THREE.Vector2();

function isMobileClient(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Mobile|Capacitor/i.test(navigator.userAgent);
}

function resolveMsaaSamples(renderer: THREE.WebGLRenderer): number {
  if (!renderer.capabilities.isWebGL2) return 0;
  const maxSamples = renderer.capabilities.maxSamples || 0;
  if (maxSamples < 2) return 0;
  // 2x MSAA on mobile tile GPUs (fast in on-chip tile memory), 4x on desktop GPUs
  return isMobileClient() ? Math.min(2, maxSamples) : Math.min(4, maxSamples);
}

function resolveTargetType(renderer: THREE.WebGLRenderer): THREE.TextureDataType {
  if (!renderer.capabilities.isWebGL2) return THREE.UnsignedByteType;
  const gl = renderer.getContext();
  if (gl && gl.getExtension('EXT_color_buffer_half_float')) {
    return THREE.HalfFloatType;
  }
  return THREE.UnsignedByteType;
}

function applyBiomeUniforms(material: THREE.ShaderMaterial, biome: PostFxBiome): void {
  const u = material.uniforms;
  if (biome === 'desert') {
    u.uBloomStrength.value = 0.18;
    u.uContrast.value = 1.05;
    u.uSaturation.value = 1.06;
    u.uVignette.value = 0.13;
    u.uTint.value.set(1.01, 0.995, 0.98);
  } else if (biome === 'outdoor') {
    u.uBloomStrength.value = 0.2;
    u.uContrast.value = 1.06;
    u.uSaturation.value = 1.05;
    u.uVignette.value = 0.14;
    u.uTint.value.set(0.995, 1.0, 1.01);
  } else {
    u.uBloomStrength.value = 0.22;
    u.uContrast.value = 1.07;
    u.uSaturation.value = 1.05;
    u.uVignette.value = 0.16;
    u.uTint.value.set(0.99, 1.0, 1.015);
  }
}

export function createTacticalPostFx(): TacticalPostFxState {
  return {
    enabled: false,
    sharpen: 0.55,
    biome: 'outdoor',
    lastToneMapping: null,
    rt: null,
    scene: null,
    camera: null,
    material: null,
    quad: null,
  };
}

function targetSize(renderer: THREE.WebGLRenderer): { w: number; h: number } {
  renderer.getDrawingBufferSize(_drawSize);
  return {
    w: Math.max(2, Math.floor(_drawSize.x)),
    h: Math.max(2, Math.floor(_drawSize.y)),
  };
}

function syncTargetSize(state: TacticalPostFxState, renderer: THREE.WebGLRenderer): void {
  if (!state.rt || !state.material) return;
  const { w, h } = targetSize(renderer);
  if (state.rt.width === w && state.rt.height === h) return;
  state.rt.setSize(w, h);
  state.material.uniforms.uTexel.value.set(1 / w, 1 / h);
}

export function setTacticalPostFxBiome(
  state: TacticalPostFxState,
  biome: PostFxBiome
): void {
  state.biome = biome;
  if (state.material) {
    applyBiomeUniforms(state.material, biome);
  }
}

export function configureTacticalPostFx(
  state: TacticalPostFxState,
  renderer: THREE.WebGLRenderer,
  opts: {
    enabled: boolean;
    sharpen: number;
    biome?: PostFxBiome;
  }
): void {
  state.enabled = opts.enabled;
  state.sharpen = opts.sharpen;
  if (opts.biome) state.biome = opts.biome;
  if (!opts.enabled) return;

  const { w, h } = targetSize(renderer);

  if (!state.rt) {
    const samples = resolveMsaaSamples(renderer);
    const type = resolveTargetType(renderer);
    state.rt = new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type,
      depthBuffer: true,
      stencilBuffer: false,
      samples,
      colorSpace: THREE.LinearSRGBColorSpace,
    });
    state.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: state.rt.texture },
        uSharpen: { value: state.sharpen },
        uDamage: { value: 0 },
        uBloomStrength: { value: 0.2 },
        uContrast: { value: 1.05 },
        uSaturation: { value: 1.05 },
        uVignette: { value: 0.14 },
        uTint: { value: new THREE.Vector3(1.0, 1.0, 1.0) },
        uTexel: { value: new THREE.Vector2(1 / w, 1 / h) },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
      toneMapped: true,
    });
    state.lastToneMapping = renderer.toneMapping;
    applyBiomeUniforms(state.material, state.biome);
    state.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), state.material);
    state.scene = new THREE.Scene();
    state.scene.add(state.quad);
    state.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  } else {
    syncTargetSize(state, renderer);
    if (state.material) {
      applyBiomeUniforms(state.material, state.biome);
      if (state.lastToneMapping !== renderer.toneMapping) {
        state.lastToneMapping = renderer.toneMapping;
        state.material.needsUpdate = true;
      }
    }
  }
}

export function renderWithTacticalPostFx(
  state: TacticalPostFxState,
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  damageFlashAlpha: number
): void {
  if (!state.enabled || !state.rt || !state.scene || !state.camera || !state.material) {
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
    return;
  }

  syncTargetSize(state, renderer);

  if (state.lastToneMapping !== renderer.toneMapping) {
    state.lastToneMapping = renderer.toneMapping;
    state.material.needsUpdate = true;
  }

  renderer.setRenderTarget(state.rt);
  renderer.clear();
  renderer.render(scene, camera);

  state.material.uniforms.tDiffuse.value = state.rt.texture;
  state.material.uniforms.uSharpen.value = state.sharpen;
  state.material.uniforms.uDamage.value = Math.min(1, damageFlashAlpha);

  renderer.setRenderTarget(null);
  renderer.render(state.scene, state.camera);
}

export function disposeTacticalPostFx(state: TacticalPostFxState): void {
  state.enabled = false;
  state.lastToneMapping = null;
  state.rt?.dispose();
  state.material?.dispose();
  state.quad?.geometry.dispose();
  state.rt = null;
  state.material = null;
  state.quad = null;
  state.scene = null;
  state.camera = null;
}
