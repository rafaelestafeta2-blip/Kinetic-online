import * as THREE from 'three';
import { createGameGltfLoader } from './gltfLoaderFactory';
import { resolveAssetUrl } from '../utils/assetUrl';
import {
  KINEMATION_ARMS_BASE_URL,
  calibrateKinemationMaterialScene,
} from './kinemationArmsRig';

/**
 * Slices `granada_frag.glb` (`granade_read_the_description.glb`) so ONLY the
 * single upright center grenade (vertices 0..1872, indices 0..6425) is rendered,
 * removing the 2 extra tilted showcase grenades baked into the same mesh.
 */
export function isolateSingleFragGrenadeInGlb(rawScene: THREE.Group): void {
  rawScene.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    const mesh = child as THREE.Mesh;
    const geo = mesh.geometry;
    if (!geo) return;

    const posAttr = geo.getAttribute('position');
    const indexAttr = geo.getIndex();
    if (!posAttr || !indexAttr) return;

    if (posAttr.count >= 5000 && indexAttr.count >= 18000) {
      const singleVertCount = 1873;
      const singleIndexCount = 6426;

      const newGeo = new THREE.BufferGeometry();
      for (const name of Object.keys(geo.attributes)) {
        const attr = geo.getAttribute(name) as THREE.BufferAttribute;
        const itemSize = attr.itemSize;
        const slicedArray = attr.array.slice(0, singleVertCount * itemSize);
        newGeo.setAttribute(
          name,
          new THREE.BufferAttribute(slicedArray, itemSize, attr.normalized)
        );
      }

      const slicedIndices = indexAttr.array.slice(0, singleIndexCount);
      newGeo.setIndex(new THREE.BufferAttribute(slicedIndices, 1));
      newGeo.computeBoundingBox();
      newGeo.computeBoundingSphere();
      mesh.geometry = newGeo;
    }
  });
}

/**
 * Unified First-Person Grenade Hand Rig powered by the Kinemation tactical arms
 * (`arms_base.glb`) and its native grenade clips (`Grenade_Pose`, `GrenadeThrow_Start`,
 * `GrenadeThrow_End`). Eliminates the legacy 11 MB `m4_fps_pack.glb` dependency.
 */
export class GrenadeFirstPersonHandRig {
  public readonly root = new THREE.Group();
  public readonly grenadeSocket = new THREE.Group();

  private armsMount = new THREE.Group();
  private armsRotateY = new THREE.Group();
  private fallbackHandGroup = new THREE.Group();

  private armsLoaded = false;
  private mixer: THREE.AnimationMixer | null = null;
  private actions: Record<string, THREE.AnimationAction> = {};
  private activeClipName: string | null = null;
  private lastThrowTime = -1;

  constructor() {
    this.armsRotateY.rotation.y = Math.PI;
    this.armsMount.add(this.armsRotateY);
    this.root.add(this.armsMount);
    this.root.add(this.fallbackHandGroup);

    this.grenadeSocket.position.set(0.085, -0.075, -0.255);
    this.fallbackHandGroup.add(this.grenadeSocket);

    this.loadUnifiedKinemationHands();
  }

  private loadUnifiedKinemationHands(): void {
    const loader = createGameGltfLoader();
    loader.load(
      resolveAssetUrl(KINEMATION_ARMS_BASE_URL),
      (gltf) => {
        const model = gltf.scene;
        calibrateKinemationMaterialScene(model, true);
        this.armsRotateY.add(model);

        const mixer = new THREE.AnimationMixer(model);
        this.mixer = mixer;
        for (const clip of gltf.animations || []) {
          if (
            clip.name === 'Grenade_Pose' ||
            clip.name === 'GrenadeThrow_Start' ||
            clip.name === 'GrenadeThrow_Loop' ||
            clip.name === 'GrenadeThrow_End'
          ) {
            this.actions[clip.name] = mixer.clipAction(clip);
          }
        }

        // Attach grenadeSocket directly to Kinemation `hand_r` palm (cm space -> 100x scale)
        const handR = model.getObjectByName('hand_r');
        if (handR) {
          handR.add(this.grenadeSocket);
          this.grenadeSocket.position.set(-9.6, -2.6, 1.4);
          this.grenadeSocket.scale.setScalar(100);
          this.grenadeSocket.rotation.set(0.15, 0, -Math.PI / 2 + 0.18);
        }

        this.fallbackHandGroup.visible = false;
        this.armsLoaded = true;
        this.playPoseClip('Grenade_Pose', 0);
      },
      undefined,
      () => {
        // Keep lightweight fallback grenade socket visible if load fails
      }
    );
  }

  private playPoseClip(clipName: string, timeSec: number): void {
    if (!this.mixer) return;
    const targetAct = this.actions[clipName];
    if (!targetAct) return;

    if (this.activeClipName !== clipName) {
      for (const name of Object.keys(this.actions)) {
        const act = this.actions[name];
        if (name !== clipName) {
          act.stop();
          act.weight = 0;
        }
      }
      targetAct.setLoop(THREE.LoopOnce, 1);
      targetAct.clampWhenFinished = true;
      targetAct.weight = 1.0;
      targetAct.timeScale = 1.0;
      targetAct.reset();
      targetAct.play();
      this.activeClipName = clipName;
    }

    const dur = Math.max(0.01, targetAct.getClip().duration);
    this.mixer.setTime(THREE.MathUtils.clamp(timeSec, 0, dur));
  }

  public setRightHandGripCurl(_gripAlpha: number): void {
    // Finger grip is author-animated by Kinemation Grenade clips
  }

  /**
   * Idle/Aiming pose using native Kinemation `Grenade_Pose` with tactical breathing & walk bob.
   */
  public updateHoldPose(idleTime: number, walkBobAmp: number): void {
    const breathX = Math.sin(idleTime * 1.8) * 0.0032;
    const breathY = Math.cos(idleTime * 3.6) * 0.0028;
    const bobX = Math.cos(idleTime * 8.5) * 0.0075 * walkBobAmp;
    const bobY = Math.abs(Math.sin(idleTime * 8.5)) * -0.0085 * walkBobAmp;

    this.grenadeSocket.visible = true;
    this.lastThrowTime = -1;

    if (!this.armsLoaded) {
      this.grenadeSocket.position.set(
        0.085 + breathX + bobX,
        -0.075 + breathY + bobY,
        -0.255
      );
      return;
    }

    this.playPoseClip('Grenade_Pose', 0);
    this.armsMount.position.set(
      -0.155 + breathX + bobX,
      -1.615 + breathY + bobY,
      0.015
    );
    this.armsMount.rotation.set(
      breathY * 1.2,
      breathX * 1.4,
      0
    );
  }

  /**
   * 3-Stage Pin-Pull, Wind-Up, and Forward Throw Animation powered by native
   * Kinemation `GrenadeThrow_Start` (pin pull + cock) & `GrenadeThrow_End` (forward throw).
   */
  public updateThrowSequence(
    t: number,
    pinMesh: THREE.Object3D | null,
    leverMesh: THREE.Object3D | null
  ): { shouldReleaseNow: boolean; finished: boolean } {
    this.lastThrowTime = t;

    if (t < 0.30) {
      const p = t / 0.30;
      const pullAlpha = p > 0.42 ? (p - 0.42) / 0.58 : 0;
      const easePull = 1 - Math.pow(1 - pullAlpha, 3);

      this.grenadeSocket.visible = true;

      if (this.armsLoaded) {
        const startClip = this.actions['GrenadeThrow_Start'];
        const startDur = startClip ? startClip.getClip().duration : 1.5;
        // Scrub first 72% of GrenadeThrow_Start (left hand pulls safety pin)
        this.playPoseClip('GrenadeThrow_Start', p * startDur * 0.72);
        this.armsMount.position.set(
          THREE.MathUtils.lerp(-0.155, -0.135, p),
          THREE.MathUtils.lerp(-1.615, -1.605, p),
          THREE.MathUtils.lerp(0.015, 0.005, p)
        );
        this.armsMount.rotation.set(0.02, 0, easePull * 0.05);
      }

      if (pinMesh && pullAlpha > 0) {
        pinMesh.position.x = -0.022 - easePull * 0.11;
        pinMesh.position.y = 0.048 + easePull * 0.024;
      }

      return { shouldReleaseNow: false, finished: false };
    }

    if (t < 0.46) {
      const p = (t - 0.30) / 0.16;
      const ease = 1 - Math.pow(1 - p, 2);

      if (pinMesh) {
        pinMesh.visible = false;
      }

      if (this.armsLoaded) {
        const startClip = this.actions['GrenadeThrow_Start'];
        const startDur = startClip ? startClip.getClip().duration : 1.5;
        // Finish wind-up portion (72% -> 100%)
        this.playPoseClip(
          'GrenadeThrow_Start',
          THREE.MathUtils.lerp(startDur * 0.72, startDur, ease)
        );
        this.armsMount.position.set(
          THREE.MathUtils.lerp(-0.135, -0.105, ease),
          THREE.MathUtils.lerp(-1.605, -1.585, ease),
          THREE.MathUtils.lerp(0.005, 0.045, ease)
        );
        this.armsMount.rotation.set(ease * 0.08, -ease * 0.06, -ease * 0.05);
      }

      return { shouldReleaseNow: false, finished: false };
    }

    if (t < 0.72) {
      const p = (t - 0.46) / 0.26;
      const ease = 1 - Math.pow(1 - p, 3);

      if (leverMesh) {
        leverMesh.rotation.z = -p * 1.6;
      }

      if (this.armsLoaded) {
        const endClip = this.actions['GrenadeThrow_End'];
        const endDur = endClip ? endClip.getClip().duration : 1.0;
        this.playPoseClip('GrenadeThrow_End', p * endDur * 0.85);
        this.armsMount.position.set(
          THREE.MathUtils.lerp(-0.105, -0.175, ease),
          THREE.MathUtils.lerp(-1.585, -1.655, ease),
          THREE.MathUtils.lerp(0.045, -0.025, Math.sin(p * Math.PI * 0.78))
        );
        this.armsMount.rotation.set(
          THREE.MathUtils.lerp(0.08, -0.16, ease),
          THREE.MathUtils.lerp(-0.06, 0.05, ease),
          THREE.MathUtils.lerp(-0.05, 0.04, ease)
        );
      }

      const shouldReleaseNow = p >= 0.12;
      if (shouldReleaseNow) {
        this.grenadeSocket.visible = false;
      }

      return { shouldReleaseNow, finished: false };
    }

    void this.lastThrowTime;
    return { shouldReleaseNow: true, finished: true };
  }
}
