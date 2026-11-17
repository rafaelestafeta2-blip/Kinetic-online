import * as THREE from 'three';
import { alignWeaponPropToMixamoHands } from './botWeaponProps';
import { YardBotEntity } from './yardPropsBuilder';

export type BotAnimState =
  | 'RIFLE_IDLE'
  | 'RIFLE_WALK'
  | 'RIFLE_WALK_LEFT'
  | 'RIFLE_WALK_RIGHT'
  | 'RIFLE_WALK_BACK'
  | 'RIFLE_RUN'
  | 'RIFLE_RUN_LEFT'
  | 'RIFLE_RUN_RIGHT'
  | 'RIFLE_SPRINT'
  | 'RIFLE_AIM'
  | 'RIFLE_FIRE'
  | 'RIFLE_THROW'
  | 'RIFLE_CROUCH'
  | 'RIFLE_CROUCH_WALK'
  | 'RIFLE_HIT'
  | 'RIFLE_JUMP'
  | 'RIFLE_RELOAD_3P'
  | 'RIFLE_DEATH'
  | 'RIFLE_DEATH_HEADSHOT'
  | 'RIFLE_DEATH_BACK'
  | 'RIFLE_DEATH_BACK_HEADSHOT'
  | 'RIFLE_DEATH_RIGHT'
  | 'RIFLE_DEATH_CROUCH';

export type BotClipMap = Record<BotAnimState, THREE.AnimationClip>;

export interface BotAnimController {
  modelRoot: THREE.Object3D;
  weaponProp: THREE.Group;
  rHandBone: THREE.Object3D | null;
  lHandBone: THREE.Object3D | null;
  mixer: THREE.AnimationMixer;
  actions: Record<BotAnimState, THREE.AnimationAction>;
  currentState: BotAnimState;
  prevX: number;
  prevY: number;
  prevZ: number;
  smoothedSpeed: number;
  hitReactTimer: number;
  fireAnimTimer: number;
  throwAnimTimer: number;
  jumpAnimTimer: number;
  reloadAnimTimer: number;
  deathElapsed: number;
  lodAccumDt: number;
  tacticalTimer: number;
  crouchStance: boolean;
}

function normalizeMixamoClip(clip: THREE.AnimationClip): THREE.AnimationClip {
  const cloned = clip.clone();
  for (let i = 0; i < cloned.tracks.length; i++) {
    const t = cloned.tracks[i];
    if (t.name.includes(':')) {
      t.name = t.name.replace(':', '');
    }
  }
  return cloned;
}

export function findFirstSkinnedMesh(root: THREE.Object3D | null | undefined): THREE.SkinnedMesh | null {
  if (!root) return null;
  let found: THREE.SkinnedMesh | null = null;
  root.traverse((c) => {
    if (!found && (c as THREE.SkinnedMesh).isSkinnedMesh && (c as THREE.SkinnedMesh).skeleton) {
      found = c as THREE.SkinnedMesh;
    }
  });
  return found;
}

/**
 * Retarget a Mixamo cm-scale FBX clip (Pro Rifle Pack rest axes) onto a meter-scale
 * Blender operator rig (sniper / vanguard_rifleman / engineer / medic).
 *
 * Why custom world-delta retargeting instead of `SkeletonUtils.retargetClip`:
 * 1. In GLTF models, `mixamorigHips` is a sibling of `SkinnedMesh` under `Armature`/`Scene`,
 *    not a child of `SkinnedMesh`. `SkeletonUtils.retargetClip(targetSkinned, sourceSkinned, clip)`
 *    creates `new AnimationMixer(sourceSkinned)`, which fails to bind `mixamorig*.quaternion`
 *    tracks, leaving `sourceSkinned` frozen in T-pose for every frame and baking a static
 *    T-pose clip into `RIFLE_JUMP` / `RIFLE_RELOAD_3P`!
 * 2. Custom Blender operator GLBs (`vanguard_rifleman`, `sniper_operator`, `vanguard_engineer`,
 *    `vanguard_medic`) have rotated local bone axes relative to Mixamo (`LeftUpLeg` rotated
 *    180° around X instead of Z, `Hips` rotated -90° Y). Computing the world-space rotation
 *    delta `deltaW = qSrcAnimW * inv(qSrcRestW)` and applying `desiredTgtW = deltaW * qTgtRestW`
 *    transfers the exact animation into the target rig's native bone coordinate system and
 *    restores both rigs' bind poses afterward.
 */
export function retargetFbxClipToTargetRig(
  clip: THREE.AnimationClip,
  targetRoot: THREE.Object3D,
  sourceRoot: THREE.Object3D,
  clipName: string
): THREE.AnimationClip {
  if (!targetRoot || !sourceRoot || !clip || clip.tracks.length === 0) {
    const fallback = clip.clone();
    fallback.name = clipName;
    return fallback;
  }

  const targetSkinned = findFirstSkinnedMesh(targetRoot);
  const sourceSkinned = findFirstSkinnedMesh(sourceRoot);

  try {
    sourceSkinned?.skeleton?.pose();
    targetSkinned?.skeleton?.pose();
    sourceRoot.updateMatrixWorld(true);
    targetRoot.updateMatrixWorld(true);

    interface BoneRestEntry {
      node: THREE.Object3D;
      localPos: THREE.Vector3;
      localQuat: THREE.Quaternion;
      localScale: THREE.Vector3;
      worldQuat: THREE.Quaternion;
      worldQuatInv: THREE.Quaternion;
    }

    const srcRest = new Map<string, BoneRestEntry>();
    const tgtBones: BoneRestEntry[] = [];

    sourceRoot.traverse((obj) => {
      if (!obj.name || !obj.name.startsWith('mixamorig')) return;
      const wq = obj.getWorldQuaternion(new THREE.Quaternion());
      srcRest.set(obj.name, {
        node: obj,
        localPos: obj.position.clone(),
        localQuat: obj.quaternion.clone(),
        localScale: obj.scale.clone(),
        worldQuat: wq,
        worldQuatInv: wq.clone().invert(),
      });
    });

    // Traverse top-down so parent bones are always updated before child bones
    targetRoot.traverse((obj) => {
      if (!obj.name || !obj.name.startsWith('mixamorig')) return;
      if (!srcRest.has(obj.name)) return;
      const wq = obj.getWorldQuaternion(new THREE.Quaternion());
      tgtBones.push({
        node: obj,
        localPos: obj.position.clone(),
        localQuat: obj.quaternion.clone(),
        localScale: obj.scale.clone(),
        worldQuat: wq,
        worldQuatInv: wq.clone().invert(),
      });
    });

    if (tgtBones.length < 10) {
      const cloned = clip.clone();
      cloned.name = clipName;
      return cloned;
    }

    const duration = Math.max(0.05, clip.duration);
    const numFrames = Math.max(2, Math.min(90, Math.round(duration * 30) + 1));
    const times = new Float32Array(numFrames);
    for (let f = 0; f < numFrames; f++) {
      times[f] = (f / (numFrames - 1)) * duration;
    }

    const quatValuesByBone = tgtBones.map(() => new Float32Array(numFrames * 4));

    const mixer = new THREE.AnimationMixer(sourceRoot);
    const action = mixer.clipAction(clip);
    action.play();

    const qSrcAnimW = new THREE.Quaternion();
    const qDeltaW = new THREE.Quaternion();
    const qDesiredTgtW = new THREE.Quaternion();
    const qParentW = new THREE.Quaternion();
    const qLocalOut = new THREE.Quaternion();

    for (let f = 0; f < numFrames; f++) {
      mixer.setTime(times[f]);
      sourceRoot.updateMatrixWorld(true);

      for (let b = 0; b < tgtBones.length; b++) {
        const tgtEntry = tgtBones[b];
        const srcEntry = srcRest.get(tgtEntry.node.name)!;

        srcEntry.node.getWorldQuaternion(qSrcAnimW);
        // World rotation delta from source bind pose: deltaW = qSrcAnimW * inv(qSrcRestW)
        qDeltaW.copy(qSrcAnimW).multiply(srcEntry.worldQuatInv);
        // Apply world delta to target bind pose: desiredTgtW = deltaW * qTgtRestW
        qDesiredTgtW.copy(qDeltaW).multiply(tgtEntry.worldQuat);

        if (tgtEntry.node.parent) {
          tgtEntry.node.parent.getWorldQuaternion(qParentW);
          qLocalOut.copy(qParentW).invert().multiply(qDesiredTgtW).normalize();
        } else {
          qLocalOut.copy(qDesiredTgtW).normalize();
        }

        tgtEntry.node.quaternion.copy(qLocalOut);
        tgtEntry.node.updateMatrixWorld(false);

        const outArr = quatValuesByBone[b];
        const baseIdx = f * 4;
        // Enforce quaternion hemisphere continuity across consecutive frames
        if (f > 0) {
          const prevIdx = (f - 1) * 4;
          const dot =
            outArr[prevIdx] * qLocalOut.x +
            outArr[prevIdx + 1] * qLocalOut.y +
            outArr[prevIdx + 2] * qLocalOut.z +
            outArr[prevIdx + 3] * qLocalOut.w;
          if (dot < 0) {
            qLocalOut.x = -qLocalOut.x;
            qLocalOut.y = -qLocalOut.y;
            qLocalOut.z = -qLocalOut.z;
            qLocalOut.w = -qLocalOut.w;
          }
        }
        outArr[baseIdx] = qLocalOut.x;
        outArr[baseIdx + 1] = qLocalOut.y;
        outArr[baseIdx + 2] = qLocalOut.z;
        outArr[baseIdx + 3] = qLocalOut.w;
      }
    }

    mixer.stopAllAction();
    mixer.uncacheClip(clip);

    // Restore both rigs to their exact pristine bind poses
    srcRest.forEach((entry) => {
      entry.node.position.copy(entry.localPos);
      entry.node.quaternion.copy(entry.localQuat);
      entry.node.scale.copy(entry.localScale);
    });
    for (let b = 0; b < tgtBones.length; b++) {
      const entry = tgtBones[b];
      entry.node.position.copy(entry.localPos);
      entry.node.quaternion.copy(entry.localQuat);
      entry.node.scale.copy(entry.localScale);
    }
    sourceSkinned?.skeleton?.pose();
    targetSkinned?.skeleton?.pose();
    sourceRoot.updateMatrixWorld(true);
    targetRoot.updateMatrixWorld(true);

    const tracks: THREE.KeyframeTrack[] = [];
    for (let b = 0; b < tgtBones.length; b++) {
      tracks.push(
        new THREE.QuaternionKeyframeTrack(
          `${tgtBones[b].node.name}.quaternion`,
          times,
          quatValuesByBone[b]
        )
      );
    }

    return new THREE.AnimationClip(clipName, duration, tracks);
  } catch {
    const fallback = clip.clone();
    fallback.name = clipName;
    return fallback;
  }
}

/**
 * Tripo medic IBM ≠ rifleman/Mixamo bind — position tracks explode the mesh.
 * Keep quaternion (+ meter-scale hips Y only) so menu/inventory & match bots stay grounded.
 */
export function retargetClipsRotationOnly(clips: BotClipMap): BotClipMap {
  const next = { ...clips };
  (Object.keys(next) as BotAnimState[]).forEach((key) => {
    const src = next[key];
    if (!src) return;
    const tracks: THREE.KeyframeTrack[] = [];
    for (let i = 0; i < src.tracks.length; i++) {
      const t = src.tracks[i];
      const name = t.name.includes(':') ? t.name.replace(/:/g, '') : t.name;
      if (name.endsWith('.quaternion')) {
        const qt = t.clone();
        qt.name = name;
        tracks.push(qt);
      } else if (name === 'mixamorigHips.position') {
        // Keep vertical root motion only — convert cm (≈95) to meters (≈0.95) if needed.
        const vals = new Float32Array(t.values.length);
        let maxAbsY = 0;
        for (let s = 1; s < t.values.length; s += 3) {
          const ay = Math.abs(t.values[s]);
          if (ay > maxAbsY) maxAbsY = ay;
        }
        const yScale = maxAbsY > 5.0 ? 0.01 : 1.0;
        for (let s = 0; s < t.values.length; s += 3) {
          vals[s] = 0;
          vals[s + 1] = t.values[s + 1] * yScale;
          vals[s + 2] = 0;
        }
        tracks.push(new THREE.VectorKeyframeTrack(name, t.times, vals));
      }
    }
    next[key] = new THREE.AnimationClip(src.name, src.duration, tracks);
  });
  return next;
}

function buildDerivedImpulseClip(
  baseAimClip: THREE.AnimationClip,
  clipName: string,
  duration: number,
  pitchKickRad: number,
  isGrenadeThrow = false
): THREE.AnimationClip {
  const numSamples = 9;
  const times = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    times[i] = (i / (numSamples - 1)) * duration;
  }

  const tracks: THREE.KeyframeTrack[] = [];
  const qBase = new THREE.Quaternion();
  const qKick = new THREE.Quaternion();
  const eulerKick = new THREE.Euler();

  for (let i = 0; i < baseAimClip.tracks.length; i++) {
    const srcTrack = baseAimClip.tracks[i];
    const [boneName, prop] = srcTrack.name.split('.');

    if (prop === 'position' && boneName === 'mixamorigHips') {
      const vals = new Float32Array(numSamples * 3);
      const bx = srcTrack.values[0];
      const by = srcTrack.values[1];
      const bz = srcTrack.values[2];
      for (let s = 0; s < numSamples; s++) {
        const pulse = Math.sin((s / (numSamples - 1)) * Math.PI);
        vals[s * 3 + 0] = bx;
        vals[s * 3 + 1] = by - pulse * Math.abs(pitchKickRad) * 4.0;
        vals[s * 3 + 2] = bz - pulse * Math.abs(pitchKickRad) * 14.0;
      }
      tracks.push(new THREE.VectorKeyframeTrack(srcTrack.name, times, vals));
      continue;
    }

    if (prop === 'quaternion') {
      const vals = new Float32Array(numSamples * 4);
      qBase.set(
        srcTrack.values[0],
        srcTrack.values[1],
        srcTrack.values[2],
        srcTrack.values[3]
      );

      for (let s = 0; s < numSamples; s++) {
        const p = s / (numSamples - 1);
        const pulse = Math.sin(p * Math.PI);

        if (isGrenadeThrow) {
          const throwArc = Math.sin(p * Math.PI * 2);
          if (boneName === 'mixamorigRightArm') {
            eulerKick.set(-pulse * 1.15, throwArc * 0.45, -pulse * 0.35, 'XYZ');
            qKick.setFromEuler(eulerKick);
          } else if (boneName === 'mixamorigRightForeArm') {
            eulerKick.set(-throwArc * 0.85, 0, 0, 'XYZ');
            qKick.setFromEuler(eulerKick);
          } else if (boneName === 'mixamorigSpine1' || boneName === 'mixamorigSpine2') {
            eulerKick.set(throwArc * 0.18, -throwArc * 0.24, 0, 'XYZ');
            qKick.setFromEuler(eulerKick);
          } else {
            qKick.identity();
          }
          const qOut = qBase.clone().multiply(qKick);
          vals[s * 4 + 0] = qOut.x;
          vals[s * 4 + 1] = qOut.y;
          vals[s * 4 + 2] = qOut.z;
          vals[s * 4 + 3] = qOut.w;
        } else {
          const isSpineOrArm =
            boneName === 'mixamorigSpine1' ||
            boneName === 'mixamorigSpine2' ||
            boneName === 'mixamorigRightShoulder' ||
            boneName === 'mixamorigLeftShoulder';
          if (isSpineOrArm) {
            eulerKick.set(-pulse * pitchKickRad, 0, 0, 'XYZ');
            qKick.setFromEuler(eulerKick);
            const qOut = qBase.clone().multiply(qKick);
            vals[s * 4 + 0] = qOut.x;
            vals[s * 4 + 1] = qOut.y;
            vals[s * 4 + 2] = qOut.z;
            vals[s * 4 + 3] = qOut.w;
          } else {
            vals[s * 4 + 0] = qBase.x;
            vals[s * 4 + 1] = qBase.y;
            vals[s * 4 + 2] = qBase.z;
            vals[s * 4 + 3] = qBase.w;
          }
        }
      }
      tracks.push(new THREE.QuaternionKeyframeTrack(srcTrack.name, times, vals));
    }
  }

  return new THREE.AnimationClip(clipName, duration, tracks);
}

export function buildProRiflePackClips(
  _templateRoot: THREE.Object3D,
  rawGltfClips: THREE.AnimationClip[]
): BotClipMap {
  const byName = new Map<string, THREE.AnimationClip>();
  for (let i = 0; i < rawGltfClips.length; i++) {
    const c = normalizeMixamoClip(rawGltfClips[i]);
    byName.set(c.name, c);
  }

  const idle = byName.get('RIFLE_IDLE') || byName.get('RIFLE_AIM') || rawGltfClips[0];
  const aim = byName.get('RIFLE_AIM') || idle;
  const walk = byName.get('RIFLE_WALK') || idle;
  const walkLeft = byName.get('RIFLE_WALK_LEFT') || walk;
  const walkRight = byName.get('RIFLE_WALK_RIGHT') || walk;
  const walkBack = byName.get('RIFLE_WALK_BACK') || walk;
  const run = byName.get('RIFLE_RUN') || walk;
  const sprint = byName.get('RIFLE_SPRINT') || run;
  const runLeft = byName.get('RIFLE_RUN_LEFT') || run;
  const runRight = byName.get('RIFLE_RUN_RIGHT') || run;
  const crouch = byName.get('RIFLE_CROUCH') || aim;
  const crouchWalk = byName.get('RIFLE_CROUCH_WALK') || crouch;
  const death = byName.get('RIFLE_DEATH') || idle;
  const deathHeadshot = byName.get('RIFLE_DEATH_HEADSHOT') || death;
  const deathBack = byName.get('RIFLE_DEATH_BACK') || death;
  const deathBackHeadshot = byName.get('RIFLE_DEATH_BACK_HEADSHOT') || deathBack;
  const deathRight = byName.get('RIFLE_DEATH_RIGHT') || death;
  const deathCrouch = byName.get('RIFLE_DEATH_CROUCH') || deathHeadshot;

  const fire = byName.get('RIFLE_FIRE') || buildDerivedImpulseClip(aim, 'RIFLE_FIRE', 0.2, 0.08, false);
  const hit = byName.get('RIFLE_HIT') || buildDerivedImpulseClip(aim, 'RIFLE_HIT', 0.28, 0.16, false);
  const throwClip = byName.get('RIFLE_THROW') || buildDerivedImpulseClip(aim, 'RIFLE_THROW', 0.58, 0.1, true);
  const jump = byName.get('RIFLE_JUMP') || crouch || aim;
  const reload3p = byName.get('RIFLE_RELOAD_3P') || throwClip || aim;

  const cloneForState = (
    srcClip: THREE.AnimationClip,
    stateName: BotAnimState
  ): THREE.AnimationClip => {
    const c = srcClip.clone();
    c.name = stateName;
    return c;
  };

  return {
    RIFLE_IDLE: cloneForState(idle, 'RIFLE_IDLE'),
    RIFLE_AIM: cloneForState(aim, 'RIFLE_AIM'),
    RIFLE_WALK: cloneForState(walk, 'RIFLE_WALK'),
    RIFLE_WALK_LEFT: cloneForState(walkLeft, 'RIFLE_WALK_LEFT'),
    RIFLE_WALK_RIGHT: cloneForState(walkRight, 'RIFLE_WALK_RIGHT'),
    RIFLE_WALK_BACK: cloneForState(walkBack, 'RIFLE_WALK_BACK'),
    RIFLE_RUN: cloneForState(run, 'RIFLE_RUN'),
    RIFLE_RUN_LEFT: cloneForState(runLeft, 'RIFLE_RUN_LEFT'),
    RIFLE_RUN_RIGHT: cloneForState(runRight, 'RIFLE_RUN_RIGHT'),
    RIFLE_SPRINT: cloneForState(sprint, 'RIFLE_SPRINT'),
    RIFLE_CROUCH: cloneForState(crouch, 'RIFLE_CROUCH'),
    RIFLE_CROUCH_WALK: cloneForState(crouchWalk, 'RIFLE_CROUCH_WALK'),
    RIFLE_FIRE: cloneForState(fire, 'RIFLE_FIRE'),
    RIFLE_THROW: cloneForState(throwClip, 'RIFLE_THROW'),
    RIFLE_HIT: cloneForState(hit, 'RIFLE_HIT'),
    RIFLE_JUMP: cloneForState(jump, 'RIFLE_JUMP'),
    RIFLE_RELOAD_3P: cloneForState(reload3p, 'RIFLE_RELOAD_3P'),
    RIFLE_DEATH: cloneForState(death, 'RIFLE_DEATH'),
    RIFLE_DEATH_HEADSHOT: cloneForState(deathHeadshot, 'RIFLE_DEATH_HEADSHOT'),
    RIFLE_DEATH_BACK: cloneForState(deathBack, 'RIFLE_DEATH_BACK'),
    RIFLE_DEATH_BACK_HEADSHOT: cloneForState(deathBackHeadshot, 'RIFLE_DEATH_BACK_HEADSHOT'),
    RIFLE_DEATH_RIGHT: cloneForState(deathRight, 'RIFLE_DEATH_RIGHT'),
    RIFLE_DEATH_CROUCH: cloneForState(deathCrouch, 'RIFLE_DEATH_CROUCH'),
  };
}

export function syncBotWeaponWithMixamoHands(
  t: YardBotEntity,
  ctrl: BotAnimController,
  isCrouched: boolean
): void {
  t.pivotGroup.updateMatrixWorld(true);
  const kickBack = ctrl.fireAnimTimer > 0 ? 0.03 : 0;
  alignWeaponPropToMixamoHands(
    ctrl.weaponProp,
    t.pivotGroup,
    ctrl.rHandBone,
    ctrl.lHandBone,
    kickBack,
    isCrouched ? 0.78 : 1.2
  );
}

export function transitionBotAnim(
  ctrl: BotAnimController,
  nextState: BotAnimState,
  fadeSec = 0.22
): void {
  if (ctrl.currentState === nextState) return;
  const prevAction = ctrl.actions[ctrl.currentState];
  const nextAction = ctrl.actions[nextState];
  if (!nextAction) return;

  if (prevAction && prevAction !== nextAction) {
    prevAction.fadeOut(fadeSec);
  }

  const isOneShot =
    nextState === 'RIFLE_FIRE' ||
    nextState === 'RIFLE_THROW' ||
    nextState === 'RIFLE_HIT' ||
    nextState === 'RIFLE_JUMP' ||
    nextState === 'RIFLE_RELOAD_3P' ||
    nextState.startsWith('RIFLE_DEATH');

  if (isOneShot || !nextAction.isRunning()) {
    nextAction.reset();
  }
  nextAction.enabled = true;
  nextAction.setEffectiveTimeScale(1);
  nextAction.setEffectiveWeight(1);
  nextAction.fadeIn(fadeSec).play();
  ctrl.currentState = nextState;
}

/**
 * Seleciona entre as 6 animações reais de morte do Mixamo com base na direção
 * exata de onde veio o tiro (frente, costas, lateral/flanco, headshot ou agachado).
 */
export function selectDirectionalDeathState(
  victimPos: THREE.Vector3,
  victimFacingYaw: number,
  attackerPos: THREE.Vector3 | null | undefined,
  isHeadshot: boolean,
  isCrouched: boolean
): BotAnimState {
  if (isCrouched) {
    return 'RIFLE_DEATH_CROUCH';
  }
  if (!attackerPos) {
    return isHeadshot ? 'RIFLE_DEATH_HEADSHOT' : 'RIFLE_DEATH';
  }

  const dx = attackerPos.x - victimPos.x;
  const dz = attackerPos.z - victimPos.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.001) {
    return isHeadshot ? 'RIFLE_DEATH_HEADSHOT' : 'RIFLE_DEATH';
  }

  const dirToAttackerX = dx / dist;
  const dirToAttackerZ = dz / dist;
  const fwdX = Math.sin(victimFacingYaw);
  const fwdZ = Math.cos(victimFacingYaw);

  // Produto escalar entre a frente do personagem e a direção de onde partiu o disparo
  const forwardDot = fwdX * dirToAttackerX + fwdZ * dirToAttackerZ;

  if (forwardDot > 0.35) {
    // Tiro veio pela frente
    return isHeadshot ? 'RIFLE_DEATH_HEADSHOT' : 'RIFLE_DEATH';
  }
  if (forwardDot < -0.35) {
    // Tiro veio pelas costas
    return isHeadshot ? 'RIFLE_DEATH_BACK_HEADSHOT' : 'RIFLE_DEATH_BACK';
  }
  // Flank: only RIGHT death clip exists in Pro Rifle Pack (no LEFT asset).
  // Headshot from flank still uses RIGHT — no dedicated side-headshot clip on disk.
  return 'RIFLE_DEATH_RIGHT';
}
