import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  cloneVanguardCharacterAvatar,
  preloadProRifleBotCharacter,
} from '../three/botCharacterSystem';
import {
  alignWeaponPropToMixamoHands,
  createBotThirdPersonWeaponMesh,
  preloadRealBotWeaponGlbs,
} from '../three/botWeaponProps';
import {
  createSecondaryWebGLRenderer,
  disposeSecondaryWebGLRenderer,
} from '../three/webglContextGuard';
import {
  applyOperatorSuitToCharacter3D,
  getOperatorDefinition,
  getOperatorOwnershipState,
} from '../progression/operatorSkinsSystem';
import { WeaponId } from '../types/game';
import { WarfaceClassId } from './WarfaceClassIcons';

export interface SquadFormationMemberSpec {
  uid: string;
  callsign: string;
  classId: WarfaceClassId;
  weaponId: WeaponId;
  weaponSkinId?: string;
  operatorSkinId?: string;
  isLeader?: boolean;
  isSpeaking?: boolean;
}

interface SquadFormation3DCanvasProps {
  members: SquadFormationMemberSpec[];
}

interface FormationSlotTransform {
  x: number;
  z: number;
  startZ: number;
  scale: number;
  yaw: number;
  walkDelaySec: number;
  walkDurationSec: number;
  defaultOpSkin: string;
  defaultWeapon: WeaponId;
  defaultWeaponSkin: string;
}

/**
 * Exact 4-to-5 operator V-formation from the tactical squad room reference:
 * - Slot 0 (Leader / Center Foreground): Front-and-center, commanding presence
 * - Slot 1 (Left Flank): Step behind to the left
 * - Slot 2 (Right Inner Flank): Step behind to the right
 * - Slot 3 (Far Right Rear Flank): Further behind on the right
 * - Slot 4 (Far Left Rear Flank): Further behind on the left (when 5th member joins)
 */
const FORMATION_SLOTS: FormationSlotTransform[] = [
  {
    x: -0.04,
    z: 0.72,
    startZ: -1.45,
    scale: 1.08,
    yaw: 0.08,
    walkDelaySec: 0.0,
    walkDurationSec: 1.15,
    defaultOpSkin: 'op_crimson_warden',
    defaultWeapon: 'M4_CARBINE',
    defaultWeaponSkin: 'crimson_pulse',
  },
  {
    x: -0.86,
    z: -0.22,
    startZ: -2.25,
    scale: 0.96,
    yaw: 0.16,
    walkDelaySec: 0.12,
    walkDurationSec: 1.25,
    defaultOpSkin: 'op_ghost_arctic',
    defaultWeapon: 'AK12_RIFLE',
    defaultWeaponSkin: 'cyber_cobalt',
  },
  {
    x: 0.78,
    z: -0.34,
    startZ: -2.35,
    scale: 0.94,
    yaw: -0.14,
    walkDelaySec: 0.22,
    walkDurationSec: 1.3,
    defaultOpSkin: 'op_cobalt_specter',
    defaultWeapon: 'CARBINE_AR',
    defaultWeaponSkin: 'cyber_cobalt',
  },
  {
    x: 1.48,
    z: -0.92,
    startZ: -2.85,
    scale: 0.89,
    yaw: -0.19,
    walkDelaySec: 0.34,
    walkDurationSec: 1.38,
    defaultOpSkin: 'op_aurum_general',
    defaultWeapon: 'S_MILITARY',
    defaultWeaponSkin: 'gold_imperial',
  },
  {
    x: -1.52,
    z: -0.96,
    startZ: -2.9,
    scale: 0.88,
    yaw: 0.2,
    walkDelaySec: 0.42,
    walkDurationSec: 1.42,
    defaultOpSkin: 'op_emerald_viper',
    defaultWeapon: 'SMG_MP5',
    defaultWeaponSkin: 'default',
  },
];

interface MountedSquadSlotRuntime {
  slotIndex: number;
  uid: string;
  pivot: THREE.Group;
  modelRoot: THREE.Object3D;
  weaponProp: THREE.Group;
  rHandBone: THREE.Object3D | null;
  lHandBone: THREE.Object3D | null;
  mixer: THREE.AnimationMixer;
  walkAction: THREE.AnimationAction | null;
  idleAction: THREE.AnimationAction | null;
  isWalkingIn: boolean;
  entryElapsedSec: number;
  walkDelaySec: number;
  walkDurationSec: number;
  startZ: number;
  targetX: number;
  targetZ: number;
  baseYaw: number;
}

export const SquadFormation3DCanvas: React.FC<SquadFormation3DCanvasProps> = ({
  members,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [contextEpoch, setContextEpoch] = useState(0);
  const membersRef = useRef<SquadFormationMemberSpec[]>(members);
  membersRef.current = members;
  const syncSquadFnRef = useRef<((nextMembers: SquadFormationMemberSpec[]) => void) | null>(
    null
  );

  useEffect(() => {
    if (syncSquadFnRef.current) {
      syncSquadFnRef.current(members);
    }
  }, [members]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let disposed = false;
    let frameId = 0;

    const isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const width = Math.max(320, container.clientWidth || 960);
    const height = Math.max(280, container.clientHeight || 540);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 35);
    camera.position.set(0, 1.12, 3.65);
    camera.lookAt(0, 0.92, -0.1);

    const renderer = createSecondaryWebGLRenderer({
      antialias: !isSoftwareGl,
      alpha: true,
      powerPreference: 'high-performance',
      pinned: true,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    renderer.setPixelRatio(
      isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 1.75)
    );
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    if (!isSoftwareGl) {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      if (disposed) return;
      disposed = true;
      window.setTimeout(() => {
        setContextEpoch((n) => n + 1);
      }, 60);
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost, false);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.03).texture;
    scene.environment = envTex;
    scene.environmentIntensity = 1.2;
    pmremGenerator.dispose();

    // Warm Golden Sunset Hangar Lighting matching reference image
    const hemiLight = new THREE.HemisphereLight(0xffe4b5, 0x1a120b, 1.05);
    scene.add(hemiLight);

    const sunsetBackRim = new THREE.DirectionalLight(0xff9e44, 2.85);
    sunsetBackRim.position.set(-0.6, 2.8, -3.2);
    scene.add(sunsetBackRim);

    const keyLight = new THREE.DirectionalLight(0xfff5e4, 2.25);
    keyLight.position.set(1.8, 3.6, 2.9);
    keyLight.castShadow = !isSoftwareGl;
    if (keyLight.castShadow) {
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 0.5;
      keyLight.shadow.camera.far = 14;
      keyLight.shadow.camera.left = -3.2;
      keyLight.shadow.camera.right = 3.2;
      keyLight.shadow.camera.top = 3.2;
      keyLight.shadow.camera.bottom = -0.5;
      keyLight.shadow.bias = -0.0003;
    }
    scene.add(keyLight);

    const crimsonLeftLight = new THREE.PointLight(0xff3b30, 1.9, 7.5);
    crimsonLeftLight.position.set(-2.2, 1.35, 0.8);
    scene.add(crimsonLeftLight);

    const warmFloorBounce = new THREE.PointLight(0xffae42, 1.25, 6.5);
    warmFloorBounce.position.set(0, 0.25, 1.85);
    scene.add(warmFloorBounce);

    // Subtle shadow catcher plane on the hangar floor
    const shadowFloorGeo = new THREE.PlaneGeometry(8, 8);
    shadowFloorGeo.rotateX(-Math.PI / 2);
    const shadowFloorMat = new THREE.ShadowMaterial({
      opacity: 0.42,
    });
    const shadowFloor = new THREE.Mesh(shadowFloorGeo, shadowFloorMat);
    shadowFloor.position.y = 0.002;
    shadowFloor.receiveShadow = !isSoftwareGl;
    scene.add(shadowFloor);

    const formationRoot = new THREE.Group();
    formationRoot.position.set(0, 0, 0);
    scene.add(formationRoot);

    const activeRuntimes = new Map<number, MountedSquadSlotRuntime>();
    let assetsReady = false;

    const mountOrUpdateSlot = (
      slotIdx: number,
      spec: SquadFormationMemberSpec
    ) => {
      if (disposed || !assetsReady) return;
      const slotCfg = FORMATION_SLOTS[slotIdx] || FORMATION_SLOTS[0];
      const existing = activeRuntimes.get(slotIdx);

      // If same player UID is already mounted in this slot, keep their stance
      if (existing && existing.uid === spec.uid) {
        return;
      }

      if (existing) {
        existing.mixer.stopAllAction();
        formationRoot.remove(existing.pivot);
        activeRuntimes.delete(slotIdx);
      }

      const opId =
        spec.operatorSkinId ||
        (slotIdx === 0
          ? getOperatorOwnershipState().activeOperatorId || slotCfg.defaultOpSkin
          : slotCfg.defaultOpSkin);
      const opDef = getOperatorDefinition(opId);
      const weaponId = spec.weaponId || slotCfg.defaultWeapon;
      const weaponSkinId = spec.weaponSkinId || slotCfg.defaultWeaponSkin;

      const cloned = cloneVanguardCharacterAvatar(
        isSoftwareGl,
        weaponId,
        spec.classId || opDef.preferredClass
      );
      if (!cloned) return;

      const { modelRoot, clips, avatarKind } = cloned;
      let rHandBone: THREE.Object3D | null = null;
      let lHandBone: THREE.Object3D | null = null;

      const baseScale =
        (avatarKind === 'VANGUARD_MEDICO' ? 0.98 : 1.0) * slotCfg.scale;
      modelRoot.scale.setScalar(baseScale);
      modelRoot.position.set(0, 0, 0);

      modelRoot.traverse((child) => {
        if (child.name === 'mixamorigRightHand') rHandBone = child;
        else if (child.name === 'mixamorigLeftHand') lHandBone = child;

        if ((child as THREE.SkinnedMesh).isSkinnedMesh) {
          const sk = child as THREE.SkinnedMesh;
          sk.frustumCulled = false;
          sk.skeleton?.bones.forEach((b) => {
            b.matrixAutoUpdate = true;
          });
        }

        if ((child as THREE.Mesh).isMesh) {
          const m = child as THREE.Mesh;
          m.castShadow = !isSoftwareGl;
          m.receiveShadow = false;
          m.frustumCulled = false;
        }
      });

      applyOperatorSuitToCharacter3D(modelRoot, opDef.id);

      modelRoot.updateMatrixWorld(true);
      const footBox = new THREE.Box3().setFromObject(modelRoot);
      if (Number.isFinite(footBox.min.y)) {
        modelRoot.position.y -= footBox.min.y;
      }

      const pivot = new THREE.Group();
      pivot.position.set(slotCfg.x, 0.01, slotCfg.startZ);
      pivot.rotation.y = slotCfg.yaw;
      pivot.add(modelRoot);

      const weaponProp = createBotThirdPersonWeaponMesh(
        weaponId,
        true,
        weaponSkinId
      );
      weaponProp.userData = { ...(weaponProp.userData || {}), isWeaponProp: true };
      pivot.add(weaponProp);
      formationRoot.add(pivot);

      const mixer = new THREE.AnimationMixer(modelRoot);
      const walkClip = clips.RIFLE_WALK || clips.RIFLE_RUN || clips.RIFLE_IDLE;
      const idleClip = clips.RIFLE_IDLE || clips.RIFLE_AIM;

      let walkAction: THREE.AnimationAction | null = null;
      let idleAction: THREE.AnimationAction | null = null;

      if (idleClip) {
        idleAction = mixer.clipAction(idleClip);
        idleAction.setLoop(THREE.LoopRepeat, Infinity);
      }
      if (walkClip) {
        walkAction = mixer.clipAction(walkClip);
        walkAction.setLoop(THREE.LoopRepeat, Infinity);
        walkAction.timeScale = 0.92;
        walkAction.play();
      } else if (idleAction) {
        idleAction.play();
      }

      mixer.update(0.016);
      pivot.updateMatrixWorld(true);
      alignWeaponPropToMixamoHands(weaponProp, pivot, rHandBone, lHandBone);

      activeRuntimes.set(slotIdx, {
        slotIndex: slotIdx,
        uid: spec.uid,
        pivot,
        modelRoot,
        weaponProp,
        rHandBone,
        lHandBone,
        mixer,
        walkAction,
        idleAction,
        isWalkingIn: true,
        entryElapsedSec: 0,
        walkDelaySec: slotCfg.walkDelaySec,
        walkDurationSec: slotCfg.walkDurationSec,
        startZ: slotCfg.startZ,
        targetX: slotCfg.x,
        targetZ: slotCfg.z,
        baseYaw: slotCfg.yaw,
      });
    };

    const syncAllSlots = (list: SquadFormationMemberSpec[]) => {
      if (disposed || !assetsReady) return;
      const desiredCount = Math.min(FORMATION_SLOTS.length, Math.max(1, list.length));

      // Remove slots that left the squad
      for (const [slotIdx, rt] of activeRuntimes.entries()) {
        if (slotIdx >= desiredCount) {
          rt.mixer.stopAllAction();
          formationRoot.remove(rt.pivot);
          activeRuntimes.delete(slotIdx);
        }
      }

      for (let i = 0; i < desiredCount; i++) {
        mountOrUpdateSlot(i, list[i]);
      }
      setIsLoaded(true);
    };

    syncSquadFnRef.current = syncAllSlots;

    void Promise.all([
      preloadProRifleBotCharacter(),
      preloadRealBotWeaponGlbs(),
    ]).then(() => {
      if (disposed) return;
      assetsReady = true;
      syncAllSlots(membersRef.current);
    });

    const handleResize = () => {
      if (!container || disposed) return;
      const nw = Math.max(320, container.clientWidth);
      const nh = Math.max(260, container.clientHeight);
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };
    window.addEventListener('resize', handleResize);
    const resizeObserver =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(handleResize) : null;
    resizeObserver?.observe(container);

    const clock = new THREE.Clock();

    const animate = () => {
      if (disposed) return;
      frameId = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.08);
      const elapsed = clock.getElapsedTime();

      for (const rt of activeRuntimes.values()) {
        rt.entryElapsedSec += dt;

        if (rt.isWalkingIn) {
          const activeWalkTime = Math.max(0, rt.entryElapsedSec - rt.walkDelaySec);
          const t = Math.min(1, activeWalkTime / Math.max(0.2, rt.walkDurationSec));
          // Smooth cubic ease-out walk-in into formation slot
          const eased = 1 - Math.pow(1 - t, 3);
          rt.pivot.position.z = THREE.MathUtils.lerp(rt.startZ, rt.targetZ, eased);
          rt.pivot.position.x = rt.targetX;

          if (t >= 1) {
            rt.isWalkingIn = false;
            rt.pivot.position.z = rt.targetZ;
            if (rt.idleAction && rt.walkAction && rt.idleAction !== rt.walkAction) {
              rt.idleAction.reset();
              rt.idleAction.play();
              rt.walkAction.crossFadeTo(rt.idleAction, 0.32, false);
            } else if (rt.idleAction) {
              rt.idleAction.play();
            }
          }
        } else {
          // Subtle tactical breathing sway in formation
          const swayPhase = elapsed * 0.75 + rt.slotIndex * 1.3;
          rt.pivot.rotation.y = rt.baseYaw + Math.sin(swayPhase) * 0.035;
        }

        rt.mixer.update(dt);
        rt.pivot.updateMatrixWorld(true);
        alignWeaponPropToMixamoHands(
          rt.weaponProp,
          rt.pivot,
          rt.rHandBone,
          rt.lHandBone
        );
      }

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      disposed = true;
      syncSquadFnRef.current = null;
      cancelAnimationFrame(frameId);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      window.removeEventListener('resize', handleResize);
      resizeObserver?.disconnect();
      for (const rt of activeRuntimes.values()) {
        rt.mixer.stopAllAction();
      }
      activeRuntimes.clear();
      envTex.dispose();
      shadowFloorGeo.dispose();
      shadowFloorMat.dispose();
      disposeSecondaryWebGLRenderer(renderer);
    };
  }, [contextEpoch]);

  return (
    <div className="relative w-full h-full flex items-center justify-center pointer-events-none">
      <div ref={mountRef} className="w-full h-full" />
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="px-4 py-2 rounded-lg bg-black/75 border border-amber-400/40 text-amber-300 font-mono text-xs uppercase tracking-widest shadow-xl">
            POSICIONANDO ESQUADRÃO 3D NA SALA...
          </div>
        </div>
      )}
    </div>
  );
};
