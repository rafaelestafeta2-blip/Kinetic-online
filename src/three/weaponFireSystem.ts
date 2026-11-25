import * as THREE from 'three';
import { soundEngine } from '../audio/soundEngine';
import {
  detectSurfaceMaterialFromMesh,
  playMaterialImpact3D,
  playShellCasingDrop3D,
} from '../audio/tacticalImmersionAudio';
import {
  computeBallisticDamage,
  getWeaponBallistics,
} from '../data/weaponBallistics';
import { getSprayOffset, getWeaponFeel } from '../data/weaponFeel';
import { mobileHardware } from '../mobile/nativeHardware';
import { samplePeerPoseAt } from '../multiplayer/peerSnapshotBuffer';
import { getWeaponGunsmithModifiers } from '../progression/loadoutSystem';
import { WeaponId } from '../types/game';
import { alertBotsToPlayerCombat } from './botNavigationSystem';
import { raycastCombatShot } from './combatRaycast';
import {
  _forward,
  _hitNormal,
  _rayDir,
  _rayOrigin,
  _right,
  _up,
  _worldPos,
  _worldPos2,
} from './engineMathTemps';

const _baseShotDir = new THREE.Vector3();
const _pendingBulletCamImpactPoint = new THREE.Vector3();
const _pendingBulletCamImpactNormal = new THREE.Vector3();
let lastShellAudioMs = 0;
let lastAutoHudEmitMs = 0;

/** Temporarily rewind online peer meshes to attacker-time pose for fairer hit checks. */
function withRewoundOnlinePeers<T>(engine: any, rewindMs: number, fn: () => T): T {
  const targets = engine.targets as Array<{
    root: THREE.Object3D;
    isDown?: boolean;
  }> | undefined;
  if (!targets || targets.length === 0) return fn();

  const restores: Array<{
    root: THREE.Object3D;
    x: number;
    y: number;
    z: number;
    ry: number;
  }> = [];
  const when = Date.now() - rewindMs;

  for (let i = 0; i < targets.length; i++) {
    const bot = targets[i];
    const uid = bot?.root?.userData?.remotePlayerUid as string | undefined;
    if (!uid || bot.isDown) continue;
    const pose = samplePeerPoseAt(uid, when);
    if (!pose) continue;
    restores.push({
      root: bot.root,
      x: bot.root.position.x,
      y: bot.root.position.y,
      z: bot.root.position.z,
      ry: bot.root.rotation.y,
    });
    bot.root.position.set(pose.x, pose.y, pose.z);
    bot.root.rotation.y = pose.yaw + Math.PI;
    bot.root.updateMatrixWorld(true);
  }

  try {
    return fn();
  } finally {
    for (let i = 0; i < restores.length; i++) {
      const r = restores[i];
      r.root.position.set(r.x, r.y, r.z);
      r.root.rotation.y = r.ry;
      r.root.updateMatrixWorld(true);
    }
  }
}


/** Extracted from TacticalFPSEngine.attemptFireWeapon — behavior preserved. */
export function attemptFireWeapon(engine: any): void {
    if (engine.isPlayerDying || engine.state.health <= 0) return;
    if (engine.bulletCamManager?.isActive()) return;
    if (engine.state.yardBomb?.roundState === 'EQUIP') return;
    // If the player is holding a grenade in hand, pressing Fire pulls the pin & throws the grenade!
    if (
      engine.state.equippedGrenade !== null ||
      engine.grenadeSystem.isBusyOrHolding()
    ) {
      if (!engine.triggerPulledThisPress) {
        engine.triggerPulledThisPress = true;
        engine.useEquippedGrenade();
      }
      return;
    }

    if (engine.state.reloadPhase !== 'IDLE' && engine.state.reloadPhase !== 'MAG_CHECK') {
      return;
    }
    if (engine.fireCooldown > 0) return;

    // Prevent firing if barrel is heavily tucked against a wall
    if (engine.state.wallTuckAmount > 0.78) {
      soundEngine.playMechanicalSwitch(0.7);
      return;
    }

    if (engine.state.chambered === 0) {
      if (engine.sniperChamberTimer > 0) {
        return;
      }
      if (!engine.triggerPulledThisPress) {
        soundEngine.playDryFire();
        engine.triggerPulledThisPress = true;
        if (engine.state.currentMagRounds <= 0) {
          engine.triggerReload(false);
        } else {
          engine.triggerManualBoltRack();
        }
      }
      return;
    }

    if (engine.state.fireMode === 'SEMI' && engine.triggerPulledThisPress) {
      return;
    }

    engine.triggerPulledThisPress = true;
    if (engine.state.fireMode === 'BURST' && engine.burstRemaining === 0) {
      engine.burstRemaining = 3;
    }

    // Interrompe imediatamente o sprint para trazer a arma para a mira frontal e atirar no alvo
    if (engine.state.stance === 'SPRINT' || engine.touchSprinting) {
      engine.touchSprinting = false;
      engine.sprintPoseAlpha = 0;
      engine.state.stance = 'STAND';
    }

    engine.executeSingleShot();
}


/** Extracted from TacticalFPSEngine.executeSingleShot — behavior preserved. */
export function executeSingleShot(engine: any): void {
    if (engine.state.activeWeapon === 'KNIFE_TACTICAL') {
      engine.fireCooldown = 0.52;
      engine.state.shotsFired += 1;
      engine.weaponRig.triggerFireAnimation(false);
      soundEngine.playKnifeSlash();
      mobileHardware.vibrateKnifeSlash();

      engine.yawObject.rotation.y = engine.yaw;
      engine.pitchObject.rotation.x = engine.pitch;
      engine.camera.updateMatrixWorld(true);

      engine.camera.getWorldPosition(_rayOrigin);
      engine.camera.getWorldDirection(_rayDir);
      engine.raycaster.set(_rayOrigin, _rayDir);
      engine.raycaster.far = 2.4;

      const knifeCollider =
        engine.state.drillMode === 'DUST2_BOMB_5V5'
          ? engine.dust2LevelData.collider
          : engine.state.drillMode === 'ASSAULT_BOMB_5V5'
            ? engine.assaultLevelData.collider
            : engine.state.drillMode === 'INDUSTRIA_BOMB_5V5'
              ? engine.industriaLevelData.collider
              : engine.state.drillMode === 'HANGAR_BOMB_5V5'
                ? engine.hangarLevelData.collider
                : engine.state.drillMode === 'EASTERN_CITY_BOMB_5V5'
                  ? engine.easternCityLevelData.collider
                : engine.state.drillMode === 'MIRAGE_ANUBIS_BOMB_5V5'
                  ? engine.mirageAnubisLevelData.collider
                : engine.state.drillMode === 'CSGO_ASSAULT_BOMB_5V5'
                  ? engine.csgoAssaultLevelData.collider
                : engine.state.drillMode === 'DE_DST_BOMB_5V5'
                  ? engine.deDstLevelData.collider
                : engine.state.drillMode === 'MP_NUKED_BOMB_5V5'
                  ? engine.mpNukedLevelData.collider
                : engine.state.drillMode === 'DE_SUPPLY_BOMB_5V5'
                  ? engine.deSupplyLevelData.collider
                : engine.state.drillMode === 'YARD_V2_BOMB_5V5'
                  ? engine.yardV2LevelData.collider
                : engine.state.drillMode === 'OBJECT_D17_BOMB_5V5'
                  ? engine.objectD17LevelData.collider
                : engine.state.drillMode === 'BRIDGES_V2_BOMB_5V5'
                  ? engine.bridgesV2LevelData.collider
                : engine.state.drillMode === 'STATION_CAPTURE_5V5' ||
                    engine.state.drillMode === 'STATION_TDM_5V5'
                  ? engine.stationArenaLevelData.collider
                : null;
      const hit = raycastCombatShot(
        engine.raycaster,
        engine.shootableMeshes,
        knifeCollider,
        engine.combatRayHit
      );
      if (hit) {
        const hitMesh = hit.object as THREE.Mesh | null;
        const wallWeaponId = hitMesh?.userData?.wallWeaponId as
          | WeaponId
          | undefined;
        if (wallWeaponId) {
          engine.selectWeapon(wallWeaponId);
          return;
        }

        const targetId = hitMesh?.userData?.targetId as string | undefined;
        if (targetId) {
          soundEngine.playKnifeHit();
          mobileHardware.vibrateKnifeHit();
          engine.state.hitMarkerAlpha = 1.0;
          engine.state.hitMarkerIsCrit = true;
          _hitNormal.copy(hit.normal);
          engine.handleTargetHit(
            targetId,
            'HEAD',
            hit.distance,
            hit.point,
            _hitNormal
          );
        } else {
          soundEngine.playKnifeHit();
          _hitNormal.copy(hit.normal);
          engine.fxPool.spawnImpactFX(hit.point, _hitNormal, false, false);
        }
      }
      engine.emitHud();
      return;
    }

    // Safety check: weapon cannot fire if chamber is empty
    if (engine.state.chambered === 0) {
      engine.burstRemaining = 0;
      soundEngine.playDryFire();
      if (engine.state.currentMagRounds <= 0) {
        engine.triggerReload(false);
      } else {
        engine.triggerManualBoltRack();
      }
      return;
    }

    const isSniper =
      engine.state.activeWeapon === 'SNIPER_BOLT' ||
      engine.state.activeWeapon === 'SNIPER_TACTICAL' ||
      engine.state.activeWeapon === 'SNIPER_AWP' ||
      engine.state.activeWeapon === 'SNIPER_HEAVY';
    const wasScopedAtShot = engine.state.isAds;

    const isShotgun =
      engine.state.activeWeapon === 'SHOTGUN_12' ||
      engine.state.activeWeapon === 'SHOTGUN_SPAS';
    const isRpg = engine.state.activeWeapon === 'RPG7_LAUNCHER';

    let shotInterval = 0.075;
    if (isSniper) {
      const boltDur =
        engine.state.activeWeapon === 'SNIPER_HEAVY'
          ? 1.45
          : engine.state.activeWeapon === 'SNIPER_AWP'
            ? 1.38
            : engine.state.activeWeapon === 'SNIPER_BOLT'
              ? 1.32
              : 1.08;
      shotInterval = boltDur + 0.1;
      engine.sniperChamberDuration = boltDur;
      if (engine.state.currentMagRounds > 0) {
        engine.sniperChamberTimer = boltDur;
        engine.sniperReturnToScopeAfterBolt = wasScopedAtShot;
        engine.state.reloadTypeLabel =
          'CICLANDO FERROLHO — CARREGANDO PRÓXIMA BALA...';
        engine.magCheckTimer = boltDur;
        soundEngine.playBoltActionCycle();
      } else {
        engine.sniperChamberTimer = 0;
        engine.sniperReturnToScopeAfterBolt = false;
        engine.state.boltLockedBack = true;
      }
    } else if (isRpg) {
      shotInterval = 0.9;
    } else if (isShotgun) {
      shotInterval = engine.state.activeWeapon === 'SHOTGUN_12' ? 0.68 : 0.3;
    } else {
      shotInterval =
        engine.state.activeWeapon === 'SMG_45'
          ? 0.064
          : engine.state.activeWeapon === 'SMG_MP5'
            ? 0.07
            : engine.state.activeWeapon === 'AK47_RIFLE'
              ? 0.088
              : engine.state.activeWeapon === 'AK12_RIFLE'
                ? 0.082
                : engine.state.activeWeapon === 'S_MILITARY'
                  ? 0.078
                  : engine.state.activeWeapon === 'L49_LMG'
                    ? 0.08
                    : engine.state.activeWeapon === 'M1911_PISTOL'
                      ? 0.135
                      : engine.state.activeWeapon === 'P50_PISTOL'
                        ? 0.175
                        : 0.075;
    }
    // Carry over sub-frame negative fireCooldown remainder so rapid full-auto maintains
    // a rock-solid, natural RPM cadence even when frame times fluctuate on mobile.
    const carryOver =
      engine.fireCooldown < 0
        ? Math.max(-shotInterval * 0.6, engine.fireCooldown)
        : 0;
    engine.fireCooldown = shotInterval + carryOver;
    engine.state.shotsFired += 1;

    // Consume chambered round and cycle bolt carrier
    engine.state.chambered = 0;
    if (!isSniper) {
      if (engine.state.currentMagRounds > 0) {
        engine.state.currentMagRounds -= 1;
        engine.state.chambered = 1;
        engine.state.boltLockedBack = false;
      } else {
        // Last round fired! Lock Bolt Carrier Group back!
        engine.state.boltLockedBack = true;
      }
    }

    // Play weapon-specific gunshot audio (Desert Eagle .WAV for P50 Pistol) + Mobile Haptic Vibration
    soundEngine.playGunshot(
      engine.state.suppressorAttached,
      engine.state.boltLockedBack,
      engine.state.activeWeapon
    );
    if (!engine.state.suppressorAttached) {
      alertBotsToPlayerCombat(engine.targets, engine.playerPos, null);
    }
    const feel = getWeaponFeel(engine.state.activeWeapon as WeaponId);
    mobileHardware.vibrateGunshot(
      engine.state.suppressorAttached,
      engine.state.boltLockedBack,
      feel.hapticMs
    );

    // Muzzle flash, GLB embedded fire animation (Fire / Fire_ADS) & bolt carrier kick
    engine.weaponRig.triggerFireAnimation(wasScopedAtShot);
    engine.boltCycleOffset = 0.046;
    engine.muzzleFlashTimer = engine.state.suppressorAttached ? 0.018 : 0.036;
    engine.weaponRig.muzzleFlashGroup.rotation.z = Math.random() * Math.PI * 2;
    const randFlashScale = 0.88 + Math.random() * 0.32;
    engine.weaponRig.muzzleFlashGroup.scale.set(
      randFlashScale,
      randFlashScale,
      0.92 + Math.random() * 0.38
    );

    // Eject spinning brass casing from ejection port + throttled 3D brass bounce sound
    const nowPerfMs = performance.now();
    if (!isRpg) {
      engine.weaponRig.ejectionPortWorldPos.getWorldPosition(_worldPos);
      engine.camera.getWorldDirection(_forward);
      _right.crossVectors(_forward, _up).normalize();
      engine.fxPool.spawnBrassCasing(_worldPos, _right, _up);
      if (nowPerfMs - lastShellAudioMs >= 145) {
        lastShellAudioMs = nowPerfMs;
        playShellCasingDrop3D(
          engine.playerPos,
          engine.playerPos,
          engine.yaw,
          engine.state.activeWeapon,
          true
        );
      }
    }

    // Perform Ballistic Raycast FIRST (aligned with exact current Sight/Crosshair vector before recoil kick & unscope!)
    // Update only camera chain without force=true so we don't recursively rebuild the entire 1P weapon/arms skeleton 13x/sec.
    engine.yawObject.rotation.y = engine.yaw;
    engine.pitchObject.rotation.x = engine.pitch;
    engine.yawObject.updateMatrix();
    engine.pitchObject.updateMatrix();
    engine.camera.updateMatrix();
    engine.yawObject.updateMatrixWorld(false);

    engine.camera.getWorldPosition(_rayOrigin);
    engine.camera.getWorldDirection(_rayDir);

    const gunsmith = getWeaponGunsmithModifiers(
      engine.state.activeWeapon as WeaponId
    );

    // Tight, predictable dispersion when hip-firing or moving fast; 100% pinpoint accuracy when ADS
    const speed = Math.hypot(engine.playerVel.x, engine.playerVel.z);
    const hipSpread =
      engine.state.adsAlpha > 0.85
        ? 0
        : ((1 - engine.state.adsAlpha) * 0.0028 + speed * 0.001) *
          gunsmith.hipSpreadMult;
    if (hipSpread > 0.0002) {
      _rayDir.x += (Math.random() - 0.5) * hipSpread;
      _rayDir.y += (Math.random() - 0.5) * hipSpread;
      _rayDir.z += (Math.random() - 0.5) * hipSpread;
      _rayDir.normalize();
    }

    engine.weaponRig.muzzleWorldPos.getWorldPosition(_worldPos2);

    const ballistics = getWeaponBallistics(engine.state.activeWeapon as WeaponId);
    const pelletCount = ballistics.pelletCount;
    const baseDir = _baseShotDir.copy(_rayDir);
    const pelletSpread = wasScopedAtShot
      ? ballistics.pelletSpreadAds
      : ballistics.pelletSpreadHip;

    // For bolt-action Snipers: immediately exit the scope zoom AFTER the shot raycast so the player sees the 3D bolt-action animation!
    if (isSniper && wasScopedAtShot) {
      engine.state.isAds = false;
      engine.touchHoldBreath = false;
    }

    // Physical Recoil Impulse applied AFTER raycast (so shot lands where player aimed)
    const stanceMult = engine.state.stance === 'CROUCH' ? 0.72 : 1.0;
    const suppMult = engine.state.suppressorAttached ? 0.82 : 1.0;
    const adsMult = wasScopedAtShot ? 0.55 : 1.0;
    const totalMult = stanceMult * suppMult * adsMult;
    const pitchMult = totalMult * gunsmith.recoilPitchMult;
    const yawMult = totalMult * gunsmith.recoilYawMult;
    const sprayIdx = Math.max(0, (engine.state.shotsFired || 1) - 1);
    const spray = getSprayOffset(engine.state.activeWeapon as WeaponId, sprayIdx);
    const jitter = 0.15 + Math.random() * 0.2;

    // Crisp per-shot kick with a tighter Z cap so rapid full-auto visibly snaps cleanly per round
    engine.recoilKickZ = Math.min(
      engine.recoilKickZ * 0.65 + feel.kickZ * pitchMult,
      0.058
    );
    engine.recoilPitch += (feel.kickPitch + spray.pitch * jitter) * pitchMult;
    engine.recoilYaw +=
      (spray.yaw + (Math.random() - 0.5) * feel.kickYaw) * yawMult;
    engine.cameraShake = Math.min(
      engine.cameraShake + feel.shake * pitchMult,
      0.016
    );
    engine.weaponFeelRecovery = feel.recovery;

    engine.pitch = THREE.MathUtils.clamp(
      engine.pitch + feel.kickPitch * 0.55 * pitchMult,
      -Math.PI * 0.46,
      Math.PI * 0.46
    );

    // ~RTT/2 rewind for online peers so hits register closer to what the attacker saw.
    withRewoundOnlinePeers(engine, 75, () => {
      let wallSelected = false;
      for (let p = 0; p < pelletCount; p++) {
        const pDir = _rayDir.copy(baseDir);
        if (isShotgun) {
          if (p > 0) {
            const ang =
              ((p - 1) / (pelletCount - 1)) * Math.PI * 2 +
              (Math.random() - 0.5) * 0.45;
            const rad = (0.35 + Math.random() * 0.65) * pelletSpread;
            pDir.x += Math.cos(ang) * rad;
            pDir.y += Math.sin(ang) * rad;
            pDir.z += (Math.random() - 0.5) * rad * 0.35;
            pDir.normalize();
          }
        }
        engine.raycaster.set(_rayOrigin, pDir);
        engine.raycaster.far = ballistics.maxRange;

        const glbCollider =
          engine.state.drillMode === 'DUST2_BOMB_5V5'
            ? engine.dust2LevelData.collider
            : engine.state.drillMode === 'ASSAULT_BOMB_5V5'
              ? engine.assaultLevelData.collider
              : engine.state.drillMode === 'INDUSTRIA_BOMB_5V5'
                ? engine.industriaLevelData.collider
                : engine.state.drillMode === 'HANGAR_BOMB_5V5'
                  ? engine.hangarLevelData.collider
                  : engine.state.drillMode === 'EASTERN_CITY_BOMB_5V5'
                    ? engine.easternCityLevelData.collider
                    : engine.state.drillMode === 'MIRAGE_ANUBIS_BOMB_5V5'
                      ? engine.mirageAnubisLevelData.collider
                      : engine.state.drillMode === 'CSGO_ASSAULT_BOMB_5V5'
                        ? engine.csgoAssaultLevelData.collider
                        : engine.state.drillMode === 'DE_DST_BOMB_5V5'
                          ? engine.deDstLevelData.collider
                          : engine.state.drillMode === 'MP_NUKED_BOMB_5V5'
                            ? engine.mpNukedLevelData.collider
                            : engine.state.drillMode === 'DE_SUPPLY_BOMB_5V5'
                              ? engine.deSupplyLevelData.collider
                              : engine.state.drillMode === 'YARD_V2_BOMB_5V5'
                                ? engine.yardV2LevelData.collider
                                : engine.state.drillMode === 'OBJECT_D17_BOMB_5V5'
                                  ? engine.objectD17LevelData.collider
                                  : engine.state.drillMode === 'BRIDGES_V2_BOMB_5V5'
                                    ? engine.bridgesV2LevelData.collider
                                    : engine.state.drillMode === 'STATION_CAPTURE_5V5' ||
                                    engine.state.drillMode === 'STATION_TDM_5V5'
                                  ? engine.stationArenaLevelData.collider
                                  : null;

        const hit = raycastCombatShot(
          engine.raycaster,
          engine.shootableMeshes,
          glbCollider,
          engine.combatRayHit
        );

        if (hit) {
          const hitMesh = hit.object as THREE.Mesh | null;
          const dist = hit.distance;
          _hitNormal.copy(hit.normal);

          const targetId = hitMesh?.userData?.targetId as string | undefined;
          const hitZone = hitMesh?.userData?.hitZone as
            | 'HEAD'
            | 'TORSO_A'
            | 'ARMOR'
            | 'STEEL_GONG'
            | undefined;

          let triggeredBulletCam = false;
          if (
            isSniper &&
            p === 0 &&
            targetId &&
            hitZone &&
            hitZone !== 'STEEL_GONG' &&
            typeof engine.tryTriggerSniperBulletCam === 'function'
          ) {
            const target = engine.targetMap?.get(targetId);
            if (
              target &&
              target.type === 'COMBAT_BOT' &&
              !target.isDown &&
              !target.isAlly &&
              !target.root?.userData?.remotePlayerUid
            ) {
              const weaponId = engine.state.activeWeapon as WeaponId;
              const effectiveDist = dist / Math.max(0.75, gunsmith.rangeMult);
              const predicted = computeBallisticDamage(
                weaponId,
                effectiveDist,
                hitZone,
                Boolean(engine.state.suppressorAttached)
              );
              const blockedByArmor =
                hitZone === 'ARMOR' &&
                target.armorHealth > 0 &&
                !predicted.armorPiercing;
              const isPredictedKill =
                !blockedByArmor && target.health - predicted.damage <= 0;

              if (isPredictedKill) {
                _pendingBulletCamImpactPoint.copy(hit.point);
                _pendingBulletCamImpactNormal.copy(_hitNormal);
                triggeredBulletCam = engine.tryTriggerSniperBulletCam({
                  weaponId,
                  isPredictedKill,
                  isHeadshot: hitZone === 'HEAD',
                  hitZone,
                  isRemoteHumanTarget: Boolean(
                    target.root?.userData?.remotePlayerUid
                  ),
                  distanceMeters: dist,
                  startPos: _worldPos2,
                  impactPos: _pendingBulletCamImpactPoint,
                  impactNormal: _pendingBulletCamImpactNormal,
                  targetRoot: target.root,
                  onImpact: () => {
                    engine.handleTargetHit(
                      targetId,
                      hitZone,
                      dist,
                      _pendingBulletCamImpactPoint,
                      _pendingBulletCamImpactNormal,
                      false
                    );
                    engine.emitHud();
                  },
                });
              }
            }
          }

          if (!triggeredBulletCam && p < 3) {
            engine.fxPool.spawnTracer(_worldPos2, hit.point);
          }

          const wallWeaponId = hitMesh?.userData?.wallWeaponId as
            | WeaponId
            | undefined;
          if (wallWeaponId && !wallSelected) {
            wallSelected = true;
            engine.selectWeapon(wallWeaponId);
            return;
          }

          if (isRpg) {
            if (typeof engine.handleRpgExplosion === 'function') {
              engine.handleRpgExplosion(hit.point, _hitNormal);
            }
            break;
          }

          if (targetId && hitZone) {
            if (!triggeredBulletCam) {
              engine.handleTargetHit(
                targetId,
                hitZone,
                dist,
                hit.point,
                _hitNormal,
                isShotgun
              );
            }
          } else {
            const surfMat = hitMesh
              ? detectSurfaceMaterialFromMesh(hitMesh, hit.point)
              : 'CONCRETE';
            engine.fxPool.spawnImpactFX(
              hit.point,
              _hitNormal,
              surfMat === 'METAL',
              false
            );
            if (p === 0) {
              playMaterialImpact3D(hit.point, _rayOrigin, engine.yaw, surfMat);
              if (surfMat === 'CONCRETE') {
                soundEngine.playImpact('CONCRETE');
              }
            }
          }
        } else if (p < 2) {
          _worldPos
            .copy(_rayOrigin)
            .addScaledVector(pDir, Math.min(80, ballistics.maxRange));
          engine.fxPool.spawnTracer(_worldPos2, _worldPos);
        }
      }
    });

    if (engine.burstRemaining > 0) {
      engine.burstRemaining -= 1;
    }

    // Throttle React HUD emit during full-auto spray so ammo counter stays smooth
    // without triggering 13+ full React reconciliations/sec on mobile.
    const mustEmitNow =
      engine.state.boltLockedBack ||
      engine.state.currentMagRounds <= 3 ||
      engine.state.fireMode !== 'AUTO' ||
      nowPerfMs - lastAutoHudEmitMs >= 75;
    if (mustEmitNow) {
      lastAutoHudEmitMs = nowPerfMs;
      engine.emitHud();
    }
}
