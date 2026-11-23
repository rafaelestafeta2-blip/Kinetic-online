/**
 * Fullscreen single-pass tactical post-processing:
 * - WebGL2 Hardware MSAA on the offscreen render target (keeps edges crisp, zero jaggedness)
 * - HalfFloat HDR render target when supported (prevents 8-bit banding on bright metal/sky)
 * - 5-tap neighborhood-clamped CAS sharpen (crisp textures, zero ringing/halos)
 * - Zero-extra-fetch micro-bloom on specular highlights (sun glints, muzzle flash, optics)
 * - Filmic S-curve micro-contrast + biome-calibrated tactical color balance
 * - Subtle optical lens vignette + reactive combat damage flash
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

  // 5-tap cross neighborhood: simultaneously drives CAS edge sharpen AND
  // zero-extra-fetch soft highlight bloom on bright speculars/muzzle flashes.
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
      // Protect deep shadows and clipped highlights from sharpening noise
      float protect = smoothstep(0.02, 0.14, lum) * (1.0 - smoothstep(0.86, 1.0, lum));
      c = mix(c, sharpened, protect);
    }

    if (uBloomStrength > 0.001) {
      // Soft knee extraction on blurred neighborhood so only real speculars/lights glow
      vec3 hi = max(blur - vec3(0.82), vec3(0.0));
      c += hi * uBloomStrength;
    }
  }

  // Subtle filmic micro-contrast (gentle S-curve in midtones, protects shadow legibility)
  if (abs(uContrast - 1.0) > 0.001) {
    vec3 mid = vec3(0.18);
    c = max(vec3(0.0), mid + (c - mid) * uContrast);
  }

  // Subtle vibrance / saturation & biome split tint
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(luma), c, uSaturation);
  c *= uTint;

  // Optical framing vignette (very subtle, draws eye to sight picture)
  vec2 d = vUv - 0.5;
  float r2 = dot(d, d);
  if (uVignette > 0.001) {
    float optVig = 1.0 - smoothstep(0.22, 0.72, r2) * uVignette;
    c *= optVig;
  }

  // Damage vignette only while the player is actually hit.
  if (uDamage > 0.001) {
    float vig = smoothstep(0.42, 1.15, length(d) * 1.35);
    c = mix(c, c * vec3(0.65, 0.16, 0.12), vig * uDamage);
  }

  gl_FragColor = vec4(max(c, vec3(0.0)), 1.0);
  #include <colorspace_fragment>
}
`;

export interface TacticalPostFxState {
  enabled: boolean;
  sharpen: number;
  biome: PostFxBiome;
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
    u.uBloomStrength.value = 0.24;
    u.uContrast.value = 1.06;
    u.uSaturation.value = 1.07;
    u.uVignette.value = 0.14;
    u.uTint.value.set(1.015, 1.0, 0.985);
  } else if (biome === 'outdoor') {
    u.uBloomStrength.value = 0.26;
    u.uContrast.value = 1.07;
    u.uSaturation.value = 1.06;
    u.uVignette.value = 0.15;
    u.uTint.value.set(0.995, 1.005, 1.015);
  } else {
    // Indoor / tactical range: slightly richer shadow contrast & crisp highlights
    u.uBloomStrength.value = 0.28;
    u.uContrast.value = 1.08;
    u.uSaturation.value = 1.05;
    u.uVignette.value = 0.18;
    u.uTint.value.set(0.985, 1.0, 1.02);
  }
}

export function createTacticalPostFx(): TacticalPostFxState {
  return {
    enabled: false,
    sharpen: 0.55,
    biome: 'outdoor',
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
        uBloomStrength: { value: 0.25 },
        uContrast: { value: 1.06 },
        uSaturation: { value: 1.06 },
        uVignette: { value: 0.15 },
        uTint: { value: new THREE.Vector3(1.0, 1.0, 1.0) },
        uTexel: { value: new THREE.Vector2(1 / w, 1 / h) },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    applyBiomeUniforms(state.material, state.biome);
    state.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), state.material);
    state.scene = new THREE.Scene();
    state.scene.add(state.quad);
    state.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  } else {
    syncTargetSize(state, renderer);
    if (state.material) {
      applyBiomeUniforms(state.material, state.biome);
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
  state.rt?.dispose();
  state.material?.dispose();
  state.quad?.geometry.dispose();
  state.rt = null;
  state.material = null;
  state.quad = null;
  state.scene = null;
  state.camera = null;
}
