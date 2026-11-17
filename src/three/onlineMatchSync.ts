import * as THREE from 'three';
import { DrillMode, WeaponId } from '../types/game';
import { YardBotEntity } from './yardPropsBuilder';
import {
  syncBotCharacterAppearance,
  triggerBotFireAnimation,
} from './botCharacterSystem';
import { BotAnimController } from './botCharacterClips';
import { YardBombSystem } from './yardBombSystem';
import { playSpatialBotGunshot } from '../audio/spatialCombatAudio';
import {
  getActiveOnlineRoom,
  getLocalOnlinePlayerState,
  publishLocalPlayerTransform,
} from '../multiplayer/onlineRoomService';
import {
  pushPeerPose,
  samplePeerPoseForRender,
} from '../multiplayer/peerSnapshotBuffer';
import { getTeamSpawnForArena, OnlinePlayerState } from '../multiplayer/onlineTypes';
import { getEquippedWeaponSkinId, getPlayerInventoryState } from '../progression/loadoutSystem';

export interface OnlineMatchSyncContext {
  dt: number;
  targets: YardBotEntity[];
  shootableMeshes: THREE.Object3D[];
  playerPos: THREE.Vector3;
  localFeetPos: THREE.Vector3;
  yaw: number;
  pitch: number;
  activeWeapon: WeaponId;
  health: number;
  isPlayerDead: boolean;
  isCrouching: boolean;
  isFiring: boolean;
  isSoftwareGl: boolean;
  yardBombSystem: YardBombSystem;
  isBombMode: boolean;
  getGroundHeight: (x: number, y: number, z: number) => number;
}

const lastRemoteShotSeenMap: Record<string, number> = {};

function lerpAngleRadians(current: number, target: number, alpha: number): number {
  let diff = target - current;
  while (diff < -Math.PI) diff += Math.PI * 2;
  while (diff > Math.PI) diff -= Math.PI * 2;
  return current + diff * Math.min(1, Math.max(0, alpha));
}

function syncShootableHitboxes(
  bot: YardBotEntity,
  shootableMeshes: THREE.Object3D[],
  shouldBeShootable: boolean
): void {
  if (bot.headMesh) bot.headMesh.userData.hitZone = 'HEAD';
  if (bot.torsoMesh) bot.torsoMesh.userData.hitZone = 'TORSO_A';
  if (bot.armorMesh) bot.armorMesh.userData.hitZone = 'ARMOR';
  const hitboxes = [bot.headMesh, bot.torsoMesh, bot.armorMesh].filter(Boolean) as THREE.Object3D[];
  for (const mesh of hitboxes) {
    mesh.userData.targetId = bot.id;
    const idx = shootableMeshes.indexOf(mesh);
    if (shouldBeShootable && idx === -1) {
      shootableMeshes.push(mesh);
    } else if (!shouldBeShootable && idx !== -1) {
      shootableMeshes.splice(idx, 1);
    }
  }
}

export function applyOnlineTeamSpawnToLocalPlayer(
  mode: DrillMode,
  playerPos: THREE.Vector3,
  getGroundHeight: (x: number, y: number, z: number) => number,
  /** Prefer Dust2-parity playable snap (XZ inside footprint + street Y). */
  findPlayableSpawn?: (
    hintX: number,
    hintZ: number,
    hintY: number
  ) => { x: number; y: number; z: number } | null
): { yaw: number } | null {
  const room = getActiveOnlineRoom();
  const localPlayer = getLocalOnlinePlayerState();
  if (!room || !localPlayer) return null;

  const teamMembers = Object.values(room.players)
    .filter((p) => p.team === localPlayer.team)
    .sort((a, b) => a.uid.localeCompare(b.uid));
  const slotIndex = Math.max(
    0,
    teamMembers.findIndex((p) => p.uid === localPlayer.uid)
  );

  const spawn = getTeamSpawnForArena(mode, localPlayer.team, slotIndex);
  if (findPlayableSpawn) {
    const playable = findPlayableSpawn(spawn.x, spawn.z, spawn.y);
    if (playable) {
      playerPos.set(playable.x, playable.y, playable.z);
      return { yaw: spawn.yaw };
    }
  }
  const groundY = getGroundHeight(spawn.x, spawn.y, spawn.z);
  playerPos.set(spawn.x, groundY, spawn.z);
  return { yaw: spawn.yaw };
}

export function hideAllBotsForOnlineMatch(
  targets: YardBotEntity[],
  shootableMeshes: THREE.Object3D[]
): void {
  for (const bot of targets) {
    bot.isDown = true;
    bot.health = 0;
    bot.root.visible = false;
    bot.root.position.set(0, -999, 0);
    delete bot.root.userData.remotePlayerUid;
    syncShootableHitboxes(bot, shootableMeshes, false);
  }
}

export function enforceUnusedBotVisibility(targets: YardBotEntity[]): void {
  for (const bot of targets) {
    if (!bot.root.userData?.remotePlayerUid) {
      bot.root.visible = false;
      bot.isDown = true;
      bot.root.position.set(0, -999, 0);
    }
  }
}

export function syncOnlineMatchFrame(ctx: OnlineMatchSyncContext): void {
  const room = getActiveOnlineRoom();
  const localPlayer = getLocalOnlinePlayerState();
  if (!room || !localPlayer) return;

  const localClassId = getPlayerInventoryState().selectedClass || localPlayer.classId || 'FUZILEIRO';

  // 1. Publish local player feet transform over WebSocket (25Hz + keepalive in combatNetcode)
  publishLocalPlayerTransform({
    x: ctx.localFeetPos.x,
    y: ctx.localFeetPos.y,
    z: ctx.localFeetPos.z,
    yaw: ctx.yaw,
    pitch: ctx.pitch,
    weaponId: ctx.activeWeapon,
    weaponSkinId: getEquippedWeaponSkinId(ctx.activeWeapon),
    classId: localClassId,
    health: Math.max(0, Math.round(ctx.health)),
    isDown: ctx.isPlayerDead || ctx.health <= 0,
    isCrouching: ctx.isCrouching,
    isFiring: ctx.isFiring,
  });

  // 2. Collect real remote players (strictly human players, ZERO AI bots)
  const remotePlayers: OnlinePlayerState[] = Object.values(room.players)
    .filter((p) => p.uid !== localPlayer.uid)
    .sort((a, b) => a.uid.localeCompare(b.uid));

  let alliesAlive = ctx.isPlayerDead ? 0 : 1;
  let enemiesAlive = 0;

  // 3. Bind each remote player to a pre-allocated 3D World Model slot
  for (let i = 0; i < ctx.targets.length; i++) {
    const bot = ctx.targets[i];
    const remote = remotePlayers[i];

    if (!remote) {
      bot.isDown = true;
      bot.health = 0;
      bot.root.visible = false;
      bot.root.position.set(0, -999, 0);
      delete bot.root.userData.remotePlayerUid;
      syncShootableHitboxes(bot, ctx.shootableMeshes, false);
      continue;
    }

    const isSameTeam = remote.team === localPlayer.team;
    if (!remote.isDown && remote.health > 0) {
      if (isSameTeam) alliesAlive++;
      else enemiesAlive++;
    }

    const prevBoundUid = bot.root.userData.remotePlayerUid;
    bot.root.userData.remotePlayerUid = remote.uid;
    bot.callsign = remote.callsign;
    bot.weaponId = remote.weaponId || 'M4_CARBINE';
    bot.weaponSkinId = remote.weaponSkinId || 'default';
    bot.classId = remote.classId || 'FUZILEIRO';
    bot.isAlly = isSameTeam;
    bot.health = remote.health;
    bot.maxHealth = 100;
    bot.armorHealth = Math.max(0, remote.armor || 0);
    if (bot.armorMesh) bot.armorMesh.visible = bot.armorHealth > 0;
    bot.isDown = remote.isDown || remote.health <= 0;
    bot.isTelegraphing = true;
    bot.root.matrixAutoUpdate = true;
    bot.pivotGroup.matrixAutoUpdate = true;
    bot.root.frustumCulled = false;
    bot.pivotGroup.frustumCulled = false;

    syncBotCharacterAppearance(bot, ctx.isSoftwareGl);

    // Only enemy real players can be shot by local raycasts
    syncShootableHitboxes(bot, ctx.shootableMeshes, !isSameTeam && !bot.isDown);

    // Ensure snapshot buffer is seeded if this peer was already in the room before WS packets arrived
    let sampledPose = samplePeerPoseForRender(remote.uid, 65);
    if (!sampledPose) {
      pushPeerPose(remote.uid, {
        x: remote.x,
        y: remote.y,
        z: remote.z,
        yaw: remote.yaw,
        pitch: remote.pitch,
        isCrouching: remote.isCrouching,
        ts: Date.now(),
      });
      sampledPose = samplePeerPoseForRender(remote.uid, 65);
    }

    const renderPose = sampledPose || {
      x: remote.x,
      y: remote.y,
      z: remote.z,
      yaw: remote.yaw,
      pitch: remote.pitch,
      isCrouching: remote.isCrouching,
      ts: Date.now(),
    };

    if (bot.isDown) {
      // Keep corpse visible for Warface revive window (same-team medics).
      bot.root.visible = true;
      const nowSec = performance.now() / 1000;
      if (isSameTeam) {
        if (!bot.reviveUntilSec && !bot.reviveExpired) {
          bot.reviveUntilSec = nowSec + 40;
          bot.reviveExpired = false;
        }
        if (bot.reviveExpired || (bot.reviveUntilSec || 0) <= nowSec) {
          bot.reviveExpired = true;
          bot.reviveUntilSec = 0;
          bot.root.visible = false;
          bot.root.position.set(0, -999, 0);
        }
      } else {
        // Enemy corpses: keep visible briefly for death animation then hide
        const ctrl = bot.root.userData?.botAnimCtrl as BotAnimController | undefined;
        if (ctrl && ctrl.deathElapsed >= 2.8) {
          bot.root.visible = false;
          bot.root.position.set(0, -999, 0);
        }
      }
      if (bot.root.visible) {
        const gy = ctx.getGroundHeight(renderPose.x, renderPose.y, renderPose.z);
        bot.root.position.set(renderPose.x, gy, renderPose.z);
        bot.root.rotation.y = renderPose.yaw + Math.PI;
        bot.pivotGroup.position.y = 0;
      }
      continue;
    }

    bot.reviveUntilSec = 0;
    bot.reviveExpired = false;
    bot.pivotGroup.position.y = 0;
    bot.pivotGroup.rotation.x = 0;
    bot.root.visible = true;

    const targetGroundY = ctx.getGroundHeight(renderPose.x, renderPose.y, renderPose.z);
    let targetY = renderPose.y;
    if (Math.abs(renderPose.y - targetGroundY) <= 0.32 || renderPose.y < targetGroundY - 0.35) {
      targetY = targetGroundY;
    } else if (renderPose.y > targetGroundY + 4.0) {
      targetY = targetGroundY;
    }

    const dx = renderPose.x - bot.root.position.x;
    const dz = renderPose.z - bot.root.position.z;
    const planarDistSq = dx * dx + dz * dz;

    if (prevBoundUid !== remote.uid || planarDistSq > 144 || bot.root.position.y < -100) {
      bot.root.position.set(renderPose.x, targetY, renderPose.z);
      bot.root.rotation.y = renderPose.yaw + Math.PI;
      const ctrl = bot.root.userData?.botAnimCtrl as BotAnimController | undefined;
      if (ctrl) {
        ctrl.prevX = renderPose.x;
        ctrl.prevY = targetY;
        ctrl.prevZ = renderPose.z;
        ctrl.smoothedSpeed = 0;
      }
    } else {
      bot.root.position.x = THREE.MathUtils.damp(bot.root.position.x, renderPose.x, 28, ctx.dt);
      bot.root.position.z = THREE.MathUtils.damp(bot.root.position.z, renderPose.z, 28, ctx.dt);
      bot.root.position.y = THREE.MathUtils.damp(bot.root.position.y, targetY, 26, ctx.dt);
    }

    const targetModelYaw = renderPose.yaw + Math.PI;
    bot.root.rotation.y = lerpAngleRadians(bot.root.rotation.y, targetModelYaw, Math.min(1, ctx.dt * 24));
    bot.root.rotation.x = 0;
    bot.root.rotation.z = 0;

    if (bot.root.userData?.botAnimCtrl) {
      bot.root.userData.botAnimCtrl.crouchStance = renderPose.isCrouching;
    }

    // Trigger remote gunshot animation & spatial 3D audio + Warface/CoD radar ping
    const prevShotAt = lastRemoteShotSeenMap[remote.uid] || 0;
    if (remote.lastShotAtMs > prevShotAt) {
      lastRemoteShotSeenMap[remote.uid] = remote.lastShotAtMs;
      triggerBotFireAnimation(bot);
      if (!bot.isAlly) {
        bot.root.userData = bot.root.userData || {};
        bot.root.userData.radarRevealedUntilMs = performance.now() + 3800;
      }
      playSpatialBotGunshot(
        bot.root.position,
        ctx.playerPos,
        ctx.yaw,
        remote.weaponId || 'M4_CARBINE',
        false
      );
    }
  }

  // 4. Sync 5v5 HUD scoreboard and bomb state with real online players
  if (ctx.isBombMode) {
    const allPlayers = Object.values(room.players);
    const vanguardTotal = allPlayers.filter((p) => p.team === 'VANGUARD').length;
    const blackthornTotal = allPlayers.filter((p) => p.team === 'BLACKTHORN').length;
    ctx.yardBombSystem.setOnlineContext(
      true,
      localPlayer.team,
      vanguardTotal,
      blackthornTotal
    );

    const vanguardAlive =
      localPlayer.team === 'VANGUARD' ? alliesAlive : enemiesAlive;
    const blackthornAlive =
      localPlayer.team === 'VANGUARD' ? enemiesAlive : alliesAlive;
    ctx.yardBombSystem.info.alliesAlive = vanguardAlive;
    ctx.yardBombSystem.info.enemiesAlive = blackthornAlive;

    const roomRound = room.currentRound || 1;
    if (roomRound > ctx.yardBombSystem.info.currentRound) {
      ctx.yardBombSystem.info.currentRound = roomRound;
    }
    const roomScoreSum = (room.vanguardScore || 0) + (room.blackthornScore || 0);
    const localScoreSum =
      (ctx.yardBombSystem.info.vanguardScore || 0) +
      (ctx.yardBombSystem.info.blackthornScore || 0);
    if (roomScoreSum > localScoreSum) {
      ctx.yardBombSystem.info.vanguardScore = Math.max(
        ctx.yardBombSystem.info.vanguardScore,
        room.vanguardScore || 0
      );
      ctx.yardBombSystem.info.blackthornScore = Math.max(
        ctx.yardBombSystem.info.blackthornScore,
        room.blackthornScore || 0
      );
    }

    if (ctx.yardBombSystem.info.roundState === 'PLAYING') {
      const localBomb = ctx.yardBombSystem.info.bombStatus;
      if (
        room.bombStatus === 'PLANTED' &&
        room.plantedSite !== 'NONE' &&
        localBomb !== 'PLANTED'
      ) {
        ctx.yardBombSystem.applyRemoteBombState('PLANTED', room.plantedSite);
      } else if (room.bombStatus === 'DEFUSED' && localBomb !== 'DEFUSED') {
        ctx.yardBombSystem.applyRemoteBombState('DEFUSED', room.plantedSite || 'NONE');
      } else if (room.bombStatus === 'DETONATED' && localBomb !== 'DETONATED') {
        ctx.yardBombSystem.applyRemoteBombState('DETONATED', room.plantedSite || 'NONE');
      }
    }

    ctx.yardBombSystem.info.squadStats = allPlayers.map((p) => ({
      callsign: p.callsign,
      roleTitle: p.team === 'VANGUARD' ? 'OPERADOR VANGUARD' : 'OPERADOR BLACKTHORN',
      weaponId: p.weaponId || 'M4_CARBINE',
      kills: p.kills || 0,
      deaths: p.deaths || 0,
      assists: p.assists || 0,
      headshots: p.headshots || 0,
      score: (p.kills || 0) * 100 + (p.headshots || 0) * 50,
      isPlayer: p.uid === localPlayer.uid,
    }));
  }
}
