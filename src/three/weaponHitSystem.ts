import * as THREE from 'three';
import { soundEngine } from '../audio/soundEngine';
import { triggerTacticalRadioCallout } from '../audio/tacticalImmersionAudio';
import { computeBallisticDamage } from '../data/weaponBallistics';
import { mobileHardware } from '../mobile/nativeHardware';
import {
  isOnlineMatchActive,
  publishCombatHit,
} from '../multiplayer/onlineRoomService';
import { WeaponId } from '../types/game';
import { triggerBotHitAnimation } from './botCharacterSystem';
import { alertBotsToPlayerCombat } from './botNavigationSystem';
import { YardBotEntity } from './yardPropsBuilder';


/** Extracted from TacticalFPSEngine.handleTargetHit — behavior preserved. */
export function handleTargetHit(engine: any, targetId: string, hitZone: 'HEAD' | 'TORSO_A' | 'ARMOR' | 'STEEL_GONG', distanceMeters: number, hitPoint: THREE.Vector3, hitNormal: THREE.Vector3, isShotgunPellet = false): void {
    const target = engine.targetMap.get(targetId);
    if (!target || target.isDown || (target as YardBotEntity).isAlly) return;

    const weaponId = engine.state.activeWeapon as WeaponId;
    const ballisticsHit = computeBallisticDamage(
      weaponId,
      distanceMeters,
      hitZone === 'STEEL_GONG' ? 'TORSO_A' : hitZone,
      Boolean(engine.state.suppressorAttached)
    );

    engine.state.hits += 1;
    const velocityMs = ballisticsHit.velocityMs;

    if (hitZone === 'STEEL_GONG') {
      // Steel Gong Harmonics & Reactive Swing
      soundEngine.playImpact('STEEL_GONG');
      engine.fxPool.spawnImpactFX(hitPoint, hitNormal, true, false);
      target.hitTiltVelocity = -12.5;
      engine.state.score += 75;
      engine.state.hitMarkerAlpha = 1.0;
      engine.state.hitMarkerIsCrit = false;
      engine.state.hitMarkerIsKill = false;
      engine.state.lastHitZone = 'TORSO';
      engine.recordShotTelemetry(distanceMeters, 'STEEL_GONG', 75, velocityMs);
      return;
    }

    const isSniper =
      weaponId === 'SNIPER_BOLT' ||
      weaponId === 'SNIPER_TACTICAL';

    if (hitZone === 'ARMOR' && target.armorHealth > 0) {
      if (ballisticsHit.armorPiercing) {
        // Sniper .338 Lapua / .308 AP round punches straight through armor, shattering it and continuing to lethal body damage
        target.armorHealth = 0;
        if (target.armorMesh) target.armorMesh.visible = false;
        soundEngine.playImpact('ARMOR_BREAK');
      } else {
        target.armorHealth -= ballisticsHit.armorDamage;
        target.hitTiltVelocity = -5.5;
        triggerBotHitAnimation(target);
        engine.fxPool.spawnImpactFX(hitPoint, hitNormal, true, false);
        engine.state.hitMarkerAlpha = 1.0;
        engine.state.hitMarkerIsCrit = false;
        engine.state.hitMarkerIsKill = false;
        engine.state.lastHitZone = 'ARMOR';

        if (target.armorHealth <= 0 && target.armorMesh) {
          target.armorMesh.visible = false;
          soundEngine.playImpact('ARMOR_BREAK');
          engine.hitstopTimer = 0.038; // Crisp 38ms hitstop on armor shatter
        } else {
          soundEngine.playImpact('TORSO');
        }
        engine.recordShotTelemetry(
          distanceMeters,
          'ARMOR',
          Math.max(1, Math.round(ballisticsHit.armorDamage * 0.75)),
          velocityMs
        );
        return;
      }
    }

    const isHead = hitZone === 'HEAD';
    const damage = ballisticsHit.damage;
    target.health -= damage;
    if (isOnlineMatchActive() && target.root.userData?.remotePlayerUid) {
      publishCombatHit(
        String(target.root.userData.remotePlayerUid),
        damage,
        isHead || isSniper,
        engine.state.activeWeapon
      );
    }
    target.hitTiltVelocity = isSniper || isHead ? -16.0 : -7.5;
    triggerBotHitAnimation(target);
    alertBotsToPlayerCombat(engine.targets, engine.playerPos, target);

    engine.fxPool.spawnImpactFX(hitPoint, hitNormal, isHead || isSniper, isHead || isSniper);
    engine.state.hitMarkerAlpha = 1.0;
    engine.state.hitMarkerIsCrit = isHead || isSniper;
    engine.state.hitMarkerIsKill = target.health <= 0;

    if (isHead || isSniper) {
      if (isHead) engine.state.headshots += 1;
      soundEngine.playImpact(isHead ? 'HEADSHOT' : 'TORSO');
      mobileHardware.vibrateHitConfirm(true);
      engine.hitstopTimer = isSniper ? 0.052 : 0.042; // Heavy tactile hitstop on lethal sniper shot
    } else {
      soundEngine.playImpact('TORSO');
      mobileHardware.vibrateHitConfirm(false);
    }

    engine.recordShotTelemetry(
      distanceMeters,
      isHead ? 'HEAD' : 'TORSO_A',
      damage,
      velocityMs
    );

    if (target.health <= 0) {
      target.isDown = true;
      target.lastDeathWasHeadshot = isHead;
      target.downTimer =
        engine.state.drillMode === 'FREE_RANGE'
          ? 2.6
          : engine.state.drillMode === 'STATION_TDM_5V5'
            ? 3.2
            : 9999;
      target.isTelegraphing = false;
      if (target.laserLine) target.laserLine.visible = false;
      if (isHead) {
        soundEngine.playHeadshotDeath();
      }
      engine.state.score += isHead ? 150 : 100;
      engine.state.lastHitZone = 'KILL';
      engine.state.hitMarkerIsCrit = true;
      engine.state.hitMarkerIsKill = true;
      engine.state.killConfirmAlpha = 1.0;
      engine.state.killConfirmLabel = isHead ? 'HEADSHOT · HITKILL' : 'ABATE CONFIRMADO';

      const bot = target as YardBotEntity;
      if (engine.state.drillMode !== 'FREE_RANGE') {
        triggerTacticalRadioCallout('TARGET_DOWN');
      }
      engine.registerKill(
        'VOCÊ',
        'VANGUARD',
        bot.callsign || 'INIMIGO-BT',
        'BLACKTHORN',
        engine.state.activeWeapon,
        isHead
      );

      // Update remaining drill targets
      if (
        engine.state.drillMode === 'KILLHOUSE_BLITZ' ||
        engine.state.drillMode === 'TACTICAL_WAVE' ||
        engine.state.drillMode === 'YARD_BOMB_5V5' ||
        engine.state.drillMode === 'DUST2_BOMB_5V5' ||
        engine.state.drillMode === 'ASSAULT_BOMB_5V5' ||
        engine.state.drillMode === 'INDUSTRIA_BOMB_5V5' ||
        engine.state.drillMode === 'HANGAR_BOMB_5V5' ||
        engine.state.drillMode === 'EASTERN_CITY_BOMB_5V5' ||
        engine.state.drillMode === 'MIRAGE_ANUBIS_BOMB_5V5' ||
        engine.state.drillMode === 'STATION_CAPTURE_5V5' ||
        engine.state.drillMode === 'STATION_TDM_5V5'
      ) {
        const remaining = engine.targets.filter(
          (t: any) =>
            t.sector === 'KILLHOUSE' &&
            !t.isDown &&
            !(t as YardBotEntity).isAlly
        ).length;
        engine.state.targetsRemaining = remaining;

        if (
          remaining === 0 &&
          (engine.state.drillMode === 'KILLHOUSE_BLITZ' ||
            engine.state.drillMode === 'TACTICAL_WAVE')
        ) {
          if (
            engine.state.bestCourseTimeSec === null ||
            engine.state.courseTimerSec < engine.state.bestCourseTimeSec
          ) {
            engine.state.bestCourseTimeSec = Number(
              engine.state.courseTimerSec.toFixed(2)
            );
          }
          engine.addPlayerXp(350);
          engine.state.screen = 'VICTORY';
          if (document.pointerLockElement) {
            document.exitPointerLock();
          }
        }
      }
    } else {
      engine.state.score += 35;
      engine.state.lastHitZone = isHead ? 'HEAD' : 'TORSO';
    }
}
