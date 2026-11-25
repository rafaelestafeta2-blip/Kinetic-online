import * as THREE from 'three';
import { playRealPlayerHitGrunt } from '../audio/characterAndBombAudio';
import {
  playSpatialBotGunshot,
  updateSpatialBotFootstepsAndHeartbeat,
} from '../audio/spatialCombatAudio';
import { soundEngine } from '../audio/soundEngine';
import { mobileHardware } from '../mobile/nativeHardware';
import {
  isOnlineMatchActive,
  isPrivateRoomWithBotsActive,
} from '../multiplayer/onlineRoomService';
import { addPlayerCash } from '../progression/ranks';
import { canGrantMatchProgressionRewards } from '../progression/matchProgressionGate';
import {
  alertBotsToPlayerFootsteps,
  updateSmartBotNavigation,
} from './botNavigationSystem';
import {
  triggerBotFireAnimation,
  triggerBotHitAnimation,
  updateAllBotCharacters,
} from './botCharacterSystem';
import { _worldPos } from './engineMathTemps';
import {
  enforceUnusedBotVisibility,
  syncOnlineMatchFrame,
} from './onlineMatchSync';
import { YardBotEntity } from './yardPropsBuilder';
import { applyPlayerCombatDamage } from './classSupportSystem';
import { getActiveGlbCollider } from './activeGlbCollider';
import {
  STATION_ARENA_ATTACKER_SPAWN,
  STATION_ARENA_DEFENDER_SPAWN,
} from './stationArenaLevelBuilder';


const _privateAiBotsScratch: YardBotEntity[] = [];

/**
 * Extracted from TacticalFPSEngine.updateTargetsAndCombatAI — behavior preserved.
 * `engine` is the live TacticalFPSEngine instance (cast at call site).
 */
export function updateTargetsAndCombatAI(engine: any, dt: number): void {
    engine.camera.getWorldPosition(_worldPos);

    for (let i = 0; i < engine.targets.length; i++) {
      const t = engine.targets[i];

      // 1. Patrol Motion on Active Range Rail Targets Only (COMBAT_BOT uses full AI pursuit!)
      if (t.type !== 'COMBAT_BOT' && !t.isDown && t.patrolAxis !== 'NONE' && t.patrolSpeed > 0) {
        const offset =
          Math.sin(engine.elapsedTime * t.patrolSpeed * 1.45 + t.patrolOffset) *
          t.patrolRange;
        if (t.patrolAxis === 'X') {
          t.root.position.x = t.basePosition.x + offset;
        } else {
          t.root.position.z = t.basePosition.z + offset;
        }
      }

      // 2. Pop-Up Recovery in Free Range Mode
      if (t.isDown) {
        if (!t.root.userData?.hasSkeletalCharacter) {
          t.pivotGroup.rotation.x = THREE.MathUtils.damp(
            t.pivotGroup.rotation.x,
            -Math.PI / 2,
            14,
            dt
          );
        }
        if (engine.state.drillMode === 'FREE_RANGE') {
          t.downTimer -= dt;
          if (t.downTimer <= 0) {
            t.isDown = false;
            t.health = t.maxHealth;
            t.armorHealth = t.armorMesh ? 60 : 0;
            if (t.armorMesh) t.armorMesh.visible = true;
            soundEngine.playMechanicalSwitch(0.85);
          }
        } else if (
          engine.state.drillMode === 'STATION_TDM_5V5' &&
          (!isOnlineMatchActive() ||
            (isPrivateRoomWithBotsActive() && !t.root.userData?.remotePlayerUid))
        ) {
          t.downTimer -= dt;
          if (t.downTimer <= 0) {
            const isAlly = Boolean((t as YardBotEntity).isAlly);
            const anchor = isAlly ? STATION_ARENA_ATTACKER_SPAWN : STATION_ARENA_DEFENDER_SPAWN;
            const rx = anchor.x + (Math.random() - 0.5) * 7.5;
            const rz = anchor.z + (Math.random() - 0.5) * 4.5;
            const col = engine.stationArenaLevelData?.collider;
            const p = col?.ready
              ? col.findPlayableSpawn(rx, rz, anchor.y)
              : { x: rx, y: anchor.y, z: rz };
            t.root.position.set(p.x, p.y, p.z);
            t.basePosition.set(p.x, p.y, p.z);
            t.isDown = false;
            t.health = t.maxHealth;
            t.armorHealth = t.armorMesh ? 60 : 0;
            if (t.armorMesh) t.armorMesh.visible = true;
            t.root.visible = true;
            t.pivotGroup.position.y = 0;
            t.pivotGroup.rotation.x = 0;
            t.hitTiltAngle = 0;
            t.hitTiltVelocity = 0;
            t.isTelegraphing = false;
            t.cooldownTimer = 1.0 + Math.random();
            t.reviveUntilSec = 0;
            t.reviveExpired = false;
            if (t.root.userData) {
              t.root.userData.navData = undefined;
              t.root.userData.prevPos = undefined;
              t.root.userData.magRounds = 30;
            }
          }
        }
        continue;
      }

      // Spring-damper reactive impact wobble when standing (paper/steel targets)
      t.hitTiltAngle += t.hitTiltVelocity * dt;
      t.hitTiltVelocity += -t.hitTiltAngle * 145 * dt;
      t.hitTiltVelocity *= Math.exp(-9 * dt);
      if (!t.root.userData?.hasSkeletalCharacter) {
        t.pivotGroup.rotation.x = t.hitTiltAngle;
      }
    }

    // 3. Sistema Tático de Navegação, Ronda e Perseguição Implacável (5v5 Bomb, Tactical Wave e Killhouse)
    const isTdmMode = engine.state.drillMode === 'STATION_TDM_5V5';
    const isBombMode =
      engine.state.drillMode === 'YARD_BOMB_5V5' ||
      engine.state.drillMode === 'DUST2_BOMB_5V5' ||
      engine.state.drillMode === 'ASSAULT_BOMB_5V5' ||
      engine.state.drillMode === 'INDUSTRIA_BOMB_5V5' ||
      engine.state.drillMode === 'HANGAR_BOMB_5V5' ||
      engine.state.drillMode === 'EASTERN_CITY_BOMB_5V5' ||
      engine.state.drillMode === 'MIRAGE_ANUBIS_BOMB_5V5' ||
      engine.state.drillMode === 'CSGO_ASSAULT_BOMB_5V5' ||
      engine.state.drillMode === 'DE_DST_BOMB_5V5' ||
      engine.state.drillMode === 'MP_NUKED_BOMB_5V5' ||
      engine.state.drillMode === 'DE_SUPPLY_BOMB_5V5' ||
      engine.state.drillMode === 'YARD_V2_BOMB_5V5' ||
      engine.state.drillMode === 'OBJECT_D17_BOMB_5V5' ||
      engine.state.drillMode === 'BRIDGES_V2_BOMB_5V5' ||
      engine.state.drillMode === 'STATION_CAPTURE_5V5';

    if (engine.state.drillMode !== 'FREE_RANGE' && engine.targets.length > 0) {
      const onlineActive = isOnlineMatchActive();
      const privateBotsActive = isPrivateRoomWithBotsActive();

      if (onlineActive) {
        const shotsFired = Number(engine.state?.shotsFired || 0);
        const prevNetShots =
          typeof engine._lastNetShotsFired === 'number'
            ? engine._lastNetShotsFired
            : shotsFired;
        const shotPulse = shotsFired !== prevNetShots;
        engine._lastNetShotsFired = shotsFired;

        syncOnlineMatchFrame({
          dt,
          targets: engine.targets as YardBotEntity[],
          shootableMeshes: engine.shootableMeshes,
          playerPos: _worldPos,
          localFeetPos: engine.playerPos,
          yaw: engine.yaw,
          pitch: engine.pitch,
          activeWeapon: engine.state.activeWeapon,
          health: engine.state.health,
          isPlayerDead:
            engine.isPlayerDying ||
            Boolean(engine.playerDeathTp?.isActive()) ||
            engine.state.health <= 0,
          isCrouching:
            engine.state.stance === 'CROUCH' || engine.state.stance === 'PRONE',
          isFiring: shotPulse,
          isSoftwareGl: Boolean(engine.isSoftwareGl),
          yardBombSystem: engine.yardBombSystem,
          isBombMode,
          getGroundHeight: (x, y, z) => engine.getCurrentGroundHeight(x, y, z),
        });
        if (isBombMode || isTdmMode) {
          engine.state.yardBomb = { ...engine.yardBombSystem.info };
        }
      }

      if (!onlineActive || privateBotsActive) {
        // Zero-GC scratch list: in Private Room + Bots, run AI only on non-human slots
        let aiTargets: YardBotEntity[] = engine.targets as YardBotEntity[];
        if (onlineActive && privateBotsActive) {
          _privateAiBotsScratch.length = 0;
          for (let i = 0; i < engine.targets.length; i++) {
            const candidate = engine.targets[i] as YardBotEntity;
            if (!candidate.root.userData?.remotePlayerUid) {
              _privateAiBotsScratch.push(candidate);
            }
          }
          aiTargets = _privateAiBotsScratch;
        }

        // Full GLB triangle collider for all bomb arenas (Dust2/Assault +
        // Industria/Hangar/Eastern/Mirage) so collision-baked navmesh matches floors.
        const activeGlbCollider = getActiveGlbCollider(engine);

        const playerAlive =
          engine.state.health > 0 &&
          !engine.isPlayerDying &&
          !engine.playerDeathTp?.isActive();

        // Footsteps → nearby enemies investigate frozen LKP (no LOS / wallhack).
        const horizSpd = Math.hypot(engine.playerVel?.x || 0, engine.playerVel?.z || 0);
        const isMoving =
          playerAlive &&
          horizSpd > 0.85 &&
          !engine.state.isProneToggled &&
          engine.state.stance !== 'PRONE';
        const isSprinting = isMoving && engine.state.stance === 'SPRINT';
        if (isMoving) {
          engine._botFootstepHearTimer =
            (engine._botFootstepHearTimer || 0) - dt;
          if (engine._botFootstepHearTimer <= 0) {
            engine._botFootstepHearTimer = isSprinting ? 0.34 : 0.55;
            alertBotsToPlayerFootsteps(
              aiTargets,
              _worldPos,
              isSprinting,
              true
            );
          }
        } else {
          engine._botFootstepHearTimer = 0;
        }

        updateSmartBotNavigation(
          aiTargets,
          engine.state.drillMode,
          _worldPos,
          engine.yaw,
          dt,
          engine.yardBombSystem,
          engine.fxPool,
          engine.grenadeSystem,
          (dmg, isHeadshot, bot) => {
            if (
              engine.isPlayerDying ||
              engine.playerDeathTp?.isActive() ||
              engine.bulletCamManager?.isActive()
            ) {
              return;
            }
            if (isHeadshot) {
              soundEngine.playImpact('HEADSHOT');
            } else {
              soundEngine.playImpact('TORSO');
            }
            mobileHardware.vibrateDamage();
            playRealPlayerHitGrunt(isHeadshot);
            applyPlayerCombatDamage(engine, dmg, isHeadshot);
            engine.state.damageFlashAlpha = isHeadshot ? 0.95 : 0.75;
            {
              const flinchMod =
                engine.state.activeWeapon === 'SNIPER_BOLT' ||
                engine.state.activeWeapon === 'SNIPER_TACTICAL'
                  ? 1.25
                  : engine.state.activeWeapon === 'L49_LMG'
                    ? 1.15
                    : 1.0;
              engine.cameraShake = (isHeadshot ? 0.024 : 0.012) * flinchMod;
              engine.pitch = Math.max(
                -Math.PI * 0.46,
                Math.min(
                  Math.PI * 0.46,
                  engine.pitch - (isHeadshot ? 0.018 : 0.01) * flinchMod
                )
              );
            }

            if (engine.state.health <= 0) {
              engine.triggerPlayerDeathSequence(
                isHeadshot,
                bot.callsign || 'KRAKEN-BT',
                'BLACKTHORN',
                bot.weaponId || 'AK47_RIFLE',
                () => {
                  if (isTdmMode) {
                    if (engine.yardBombSystem?.info?.roundState === 'PLAYING') {
                      engine.respawnLocalPlayerTdm();
                    }
                    return;
                  }
                  if (!isBombMode) {
                    engine.state.screen = 'GAME_OVER';
                    engine.emitHud();
                    return;
                  }
                  const specBot = engine.playerDeathTp.startSpectating(
                    engine.targets as YardBotEntity[]
                  );
                  if (specBot && engine.yardBombSystem.info.roundState === 'PLAYING') {
                    engine.yardBombSystem.info.isSpectating = true;
                    engine.yardBombSystem.info.spectatedCallsign =
                      specBot.callsign || 'VANGUARD-02';
                    engine.yardBombSystem.info.spectatedWeapon =
                      specBot.weaponId || 'M4_CARBINE';
                    engine.yardBombSystem.info.spectatedHealth = Math.max(0, specBot.health);
                    engine.state.damageFlashAlpha = 0;
                  } else if (engine.yardBombSystem.info.bombStatus !== 'PLANTED') {
                    engine.yardBombSystem.finishCurrentRound(
                      'BLACKTHORN',
                      isHeadshot
                        ? 'ESQUADRÃO VANGUARD ELIMINADO COM HEADSHOT CRÍTICO!'
                        : 'ESQUADRÃO VANGUARD NEUTRALIZADO EM COMBATE!',
                      (xp: number, cash: number) => {
                        engine.addPlayerXp(xp);
                        if (canGrantMatchProgressionRewards() && cash > 0) {
                          addPlayerCash(cash);
                        }
                        engine.state.score += xp;
                      }
                    );
                  }
                  engine.state.yardBomb = { ...engine.yardBombSystem.info };
                  engine.emitHud();
                },
                bot.root.position
              );
            }
            engine.emitHud();
          },
          engine.colliders,
          activeGlbCollider,
          playerAlive,
          engine.registerKill.bind(engine)
        );
      }
    }

    // 3.8. Áudio Tático 3D Estilo Call of Duty: Passos de Inimigos por Proximidade + Batimento Cardíaco
    if (engine.state.drillMode !== 'FREE_RANGE') {
      const activeGlbCollider = getActiveGlbCollider(engine);
      updateSpatialBotFootstepsAndHeartbeat(
        engine.targets,
        _worldPos,
        engine.yaw,
        engine.state.health,
        engine.isPlayerDying || engine.playerDeathTp?.isActive() || engine.state.health <= 0,
        dt,
        engine.grenadeSystem,
        engine.colliders,
        activeGlbCollider
      );
    }

    // 4. Update Pro.Rifle.Pack.glb 3D Skeletal Bot Mixers & State Machines
    if (engine.state.drillMode !== 'FREE_RANGE') {
      updateAllBotCharacters(
        engine.targets,
        _worldPos,
        dt,
        engine.isSoftwareGl
      );
      if (isOnlineMatchActive() && !isPrivateRoomWithBotsActive()) {
        enforceUnusedBotVisibility(engine.targets as YardBotEntity[]);
      }
    }
}
