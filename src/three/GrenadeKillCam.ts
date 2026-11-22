import * as THREE from 'three';
import { Dust2TriangleCollider } from './dust2Collider';
import { ColliderBox } from './levelBuilder';
import { PlayerDeathThirdPersonController } from './playerDeathThirdPerson';
import {
  GRENADE_LETHAL_RADIUS_M,
} from './ShellshockEffectController';
import { YardBotEntity } from './yardPropsBuilder';

const MAX_POOLED_SHOCKWAVES = 3;
const MAX_POOLED_THROWN_BOTS = 10;

interface PooledShockwaveInstance {
  active: boolean;
  age: number;
  maxAge: number;
  group: THREE.Group;
  machRingMesh: THREE.Mesh;
  machRingMat: THREE.MeshBasicMaterial;
  pressureDomeMesh: THREE.Mesh;
  pressureDomeMat: THREE.MeshBasicMaterial;
  coreFlashMesh: THREE.Mesh;
  coreFlashMat: THREE.MeshBasicMaterial;
}

interface PooledThrownBotSlot {
  active: boolean;
  bot: YardBotEntity | null;
  vel: THREE.Vector3;
  angVel: THREE.Vector3;
  groundY: number;
  age: number;
  maxAge: number;
}

const _launchDir = new THREE.Vector3();
const _resolvedHoriz = { x: 0, z: 0 };

/**
 * GrenadeKillCam
 * ---------------------------------------------------------------------------
 * Controlador cinematográfico da **Grenade Death Cam** (Raio 1 — Zona Fatal: 0m a 5.0m)
 * para KINETIC // Tactical FPS:
 *
 * - **Sem botão de pular** (`canSkip = false`): a sequência cinematográfica reproduz integralmente.
 * - **Onda de Choque Expansiva 3D**: anel supersônico Mach + domo de pressão em Object Pool (Zero-GC).
 * - **Câmera Lenta Local**: `timeScale = 0.25` durante o impacto/arremesso inicial, restaurando
 *   gradualmente para `1.0`.
 * - **Arremesso Forte do Personagem**: projeta o operador local (e/ou bots eliminados no Raio 1)
 *   em arco parabólico na direção oposta à granada (`dir = normalize(pos - grenadePos)` + `vy`),
 *   respeitando colisores do mapa e altura do piso.
 */
export class GrenadeKillCam {
  private readonly scene: THREE.Scene;
  private readonly shockwavePool: PooledShockwaveInstance[] = [];
  private readonly thrownBotsPool: PooledThrownBotSlot[] = [];
  private readonly pooledGeometries: THREE.BufferGeometry[] = [];
  private readonly pooledMaterials: THREE.Material[] = [];

  // Estado da Grenade Death Cam do Jogador Local
  private localKillCamActive = false;
  private localElapsedSec = 0;
  private localDurationSec = 2.85;
  private localTimeScale = 1.0;
  private killerCallsign = 'GRANADA FRAG';
  private distanceMeters = 0;

  private readonly localBlastOrigin = new THREE.Vector3();
  private readonly localLaunchVel = new THREE.Vector3();
  private localTumblePitch = 0;
  private localTumbleRoll = 0;
  private localTumblePitchVel = 0;
  private localTumbleRollVel = 0;
  private localBouncedOnGround = false;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.initShockwavePool();
    this.initThrownBotsPool();
  }

  private initShockwavePool(): void {
    const ringGeo = new THREE.RingGeometry(0.45, 0.98, 36);
    ringGeo.rotateX(-Math.PI / 2);
    const domeGeo = new THREE.SphereGeometry(
      1.0,
      20,
      14,
      0,
      Math.PI * 2,
      0,
      Math.PI * 0.52
    );
    const coreGeo = new THREE.SphereGeometry(0.65, 14, 12);

    this.pooledGeometries.push(ringGeo, domeGeo, coreGeo);

    for (let i = 0; i < MAX_POOLED_SHOCKWAVES; i++) {
      const group = new THREE.Group();
      group.name = `GrenadeShockwavePool_${i}`;
      group.visible = false;
      this.scene.add(group);

      const machRingMat = new THREE.MeshBasicMaterial({
        color: 0xfef08a,
        transparent: true,
        opacity: 0.92,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const machRingMesh = new THREE.Mesh(ringGeo, machRingMat);
      machRingMesh.position.y = 0.08;
      group.add(machRingMesh);

      const pressureDomeMat = new THREE.MeshBasicMaterial({
        color: 0xf97316,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const pressureDomeMesh = new THREE.Mesh(domeGeo, pressureDomeMat);
      group.add(pressureDomeMesh);

      const coreFlashMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const coreFlashMesh = new THREE.Mesh(coreGeo, coreFlashMat);
      group.add(coreFlashMesh);

      this.pooledMaterials.push(machRingMat, pressureDomeMat, coreFlashMat);

      this.shockwavePool.push({
        active: false,
        age: 0,
        maxAge: 0.85,
        group,
        machRingMesh,
        machRingMat,
        pressureDomeMesh,
        pressureDomeMat,
        coreFlashMesh,
        coreFlashMat,
      });
    }
  }

  private initThrownBotsPool(): void {
    for (let i = 0; i < MAX_POOLED_THROWN_BOTS; i++) {
      this.thrownBotsPool.push({
        active: false,
        bot: null,
        vel: new THREE.Vector3(),
        angVel: new THREE.Vector3(),
        groundY: 0,
        age: 0,
        maxAge: 1.85,
      });
    }
  }

  /**
   * Dispara a onda de choque 3D expansiva no ponto exato da detonação (`grenadePos`).
   */
  public spawnShockwaveAt(grenadePos: THREE.Vector3): void {
    let inst = this.shockwavePool[0];
    for (let i = 0; i < this.shockwavePool.length; i++) {
      if (!this.shockwavePool[i].active) {
        inst = this.shockwavePool[i];
        break;
      }
    }

    inst.active = true;
    inst.age = 0;
    inst.group.position.set(
      grenadePos.x,
      Math.max(0.04, grenadePos.y),
      grenadePos.z
    );
    inst.group.visible = true;

    inst.machRingMesh.visible = true;
    inst.machRingMesh.scale.setScalar(0.4);
    inst.machRingMat.opacity = 0.95;

    inst.pressureDomeMesh.visible = true;
    inst.pressureDomeMesh.scale.setScalar(0.35);
    inst.pressureDomeMat.opacity = 0.52;

    inst.coreFlashMesh.visible = true;
    inst.coreFlashMesh.scale.setScalar(0.35);
    inst.coreFlashMat.opacity = 1.0;
  }

  /**
   * Aciona o arremesso físico parabólico de um bot eliminado dentro do Raio 1 (0m a 5.0m).
   */
  public triggerBotBlastThrow(
    bot: YardBotEntity,
    grenadePos: THREE.Vector3,
    distanceMeters: number,
    groundY = 0
  ): void {
    // Procura slot existente para o mesmo bot ou um slot livre no pool
    let slot: PooledThrownBotSlot | null = null;
    for (let i = 0; i < this.thrownBotsPool.length; i++) {
      if (this.thrownBotsPool[i].active && this.thrownBotsPool[i].bot === bot) {
        slot = this.thrownBotsPool[i];
        break;
      }
    }
    if (!slot) {
      for (let i = 0; i < this.thrownBotsPool.length; i++) {
        if (!this.thrownBotsPool[i].active) {
          slot = this.thrownBotsPool[i];
          break;
        }
      }
    }
    if (!slot) {
      slot = this.thrownBotsPool[0];
    }

    _launchDir.subVectors(bot.root.position, grenadePos);
    _launchDir.y = 0;
    const hLen = _launchDir.length();
    if (hLen > 0.001) {
      _launchDir.divideScalar(hLen);
    } else {
      _launchDir.set(0, 0, 1);
    }

    const prox = THREE.MathUtils.clamp(
      1 - distanceMeters / GRENADE_LETHAL_RADIUS_M,
      0,
      1
    );
    const horizSpeed = THREE.MathUtils.lerp(7.8, 12.2, prox);
    const upwardVy = THREE.MathUtils.lerp(3.8, 5.6, prox);

    slot.active = true;
    slot.bot = bot;
    slot.age = 0;
    slot.maxAge = 1.65;
    slot.groundY = groundY;
    slot.vel.set(
      _launchDir.x * horizSpeed,
      upwardVy,
      _launchDir.z * horizSpeed
    );
    slot.angVel.set(
      -3.2 - prox * 2.2,
      (Math.random() - 0.5) * 3.5,
      (Math.random() - 0.5) * 2.4
    );
  }

  /**
   * Aciona a **Grenade Death Cam** para o jogador local eliminado no Raio 1 (0m a 5.0m):
   * - Sem botão de pular
   * - Onda de choque 3D expansiva
   * - Câmera lenta local (`timeScale = 0.25`)
   * - Arremesso forte do personagem na direção oposta à granada
   */
  public triggerLocalPlayerDeath(
    grenadePos: THREE.Vector3,
    playerPos: THREE.Vector3,
    killerCallsign = 'GRANADA FRAG',
    overrideImpulseVel?: [number, number, number]
  ): void {
    this.spawnShockwaveAt(grenadePos);

    const dist = playerPos.distanceTo(grenadePos);
    this.localKillCamActive = true;
    this.localElapsedSec = 0;
    this.localDurationSec = 2.85;
    this.localTimeScale = 0.25;
    this.killerCallsign = killerCallsign || 'GRANADA FRAG';
    this.distanceMeters = Number(dist.toFixed(1));
    this.localBlastOrigin.copy(grenadePos);
    this.localTumblePitch = 0;
    this.localTumbleRoll = 0;
    this.localBouncedOnGround = false;

    if (
      overrideImpulseVel &&
      (Math.abs(overrideImpulseVel[0]) > 0.01 ||
        Math.abs(overrideImpulseVel[1]) > 0.01 ||
        Math.abs(overrideImpulseVel[2]) > 0.01)
    ) {
      this.localLaunchVel.set(
        overrideImpulseVel[0],
        overrideImpulseVel[1],
        overrideImpulseVel[2]
      );
    } else {
      _launchDir.subVectors(playerPos, grenadePos);
      _launchDir.y = 0;
      const hLen = _launchDir.length();
      if (hLen > 0.001) {
        _launchDir.divideScalar(hLen);
      } else {
        _launchDir.set(0, 0, 1);
      }
      const prox = THREE.MathUtils.clamp(
        1 - dist / GRENADE_LETHAL_RADIUS_M,
        0,
        1
      );
      const horizSpeed = THREE.MathUtils.lerp(8.4, 12.6, prox);
      const upwardVy = THREE.MathUtils.lerp(4.0, 5.8, prox);
      this.localLaunchVel.set(
        _launchDir.x * horizSpeed,
        upwardVy,
        _launchDir.z * horizSpeed
      );
    }

    this.localTumblePitchVel = -2.4;
    this.localTumbleRollVel = (Math.random() >= 0.5 ? 1 : -1) * 1.65;
  }

  /**
   * Atualiza por frame (60 FPS, Zero-GC) as ondas de choque 3D, os bots arremessados
   * e o arremesso + câmera lenta da Grenade Death Cam do jogador local.
   */
  public update(
    rawDt: number,
    playerPos: THREE.Vector3,
    playerDeathTp?: PlayerDeathThirdPersonController | null,
    colliders?: ColliderBox[],
    activeGlbCollider?: Dust2TriangleCollider | null,
    getGroundHeight?: (x: number, y: number, z: number) => number,
    checkHorizontalCollision?: (
      x: number,
      z: number,
      yBottom: number,
      r: number
    ) => boolean
  ): void {
    // 1. Atualiza escala de tempo local da Grenade Death Cam
    if (this.localKillCamActive) {
      this.localElapsedSec += rawDt;

      // Fase 1 (0.0s a 0.95s real): slow-motion 0.25x durante a onda de choque e voo inicial
      // Fase 2 (0.95s a 1.85s real): retorno suave da escala de tempo para 1.0x
      if (this.localElapsedSec < 0.95) {
        this.localTimeScale = 0.25;
      } else if (this.localElapsedSec < 1.85) {
        const t = (this.localElapsedSec - 0.95) / 0.9;
        this.localTimeScale = THREE.MathUtils.lerp(0.25, 1.0, t * t);
      } else {
        this.localTimeScale = 1.0;
      }

      const simDt = rawDt * Math.max(0.35, this.localTimeScale * 1.45);
      this.updateLocalPlayerBlastFlight(
        simDt,
        playerPos,
        playerDeathTp,
        activeGlbCollider,
        getGroundHeight,
        checkHorizontalCollision
      );

      if (this.localElapsedSec >= this.localDurationSec) {
        this.localKillCamActive = false;
        this.localTimeScale = 1.0;
        playerDeathTp?.setAirborneBlastTumble(0, 0);
      }
    } else {
      this.localTimeScale = 1.0;
    }

    const worldSimDt = rawDt * this.localTimeScale;

    // 2. Atualiza Ondas de Choque 3D Expansivas (Raio 1 -> Raio 2)
    for (let i = 0; i < this.shockwavePool.length; i++) {
      const sw = this.shockwavePool[i];
      if (!sw.active) continue;

      sw.age += worldSimDt;
      if (sw.age >= sw.maxAge) {
        sw.active = false;
        sw.group.visible = false;
        continue;
      }

      const p = sw.age / sw.maxAge;
      const easeOut = 1 - Math.pow(1 - p, 2.4);

      // Anel Mach expande até o limite da zona fatal/concussão (~9.5m)
      const ringRadius = 0.5 + easeOut * 9.5;
      sw.machRingMesh.scale.setScalar(ringRadius);
      sw.machRingMat.opacity = 0.92 * (1 - p);

      // Domo de pressão expande até 5.5m (Zona Fatal de 5.0m)
      const domeRadius = 0.4 + easeOut * 5.4;
      sw.pressureDomeMesh.scale.setScalar(domeRadius);
      sw.pressureDomeMat.opacity = 0.48 * Math.pow(1 - p, 1.5);

      if (p < 0.35) {
        const cp = p / 0.35;
        sw.coreFlashMesh.scale.setScalar(0.4 + cp * 3.2);
        sw.coreFlashMat.opacity = 1 - cp;
      } else {
        sw.coreFlashMesh.visible = false;
      }
    }

    // 3. Atualiza Bots Arremessados no Raio 1 (0m a 5.0m)
    for (let i = 0; i < this.thrownBotsPool.length; i++) {
      const slot = this.thrownBotsPool[i];
      if (!slot.active || !slot.bot) continue;

      slot.age += worldSimDt;
      if (slot.age >= slot.maxAge || !slot.bot.isDown) {
        slot.active = false;
        slot.bot.pivotGroup.rotation.z = 0;
        slot.bot = null;
        continue;
      }

      const botPos = slot.bot.root.position;
      slot.vel.y -= 17.5 * worldSimDt;

      const nextX = botPos.x + slot.vel.x * worldSimDt;
      const nextY = botPos.y + slot.vel.y * worldSimDt;
      const nextZ = botPos.z + slot.vel.z * worldSimDt;

      // Checa colisão simples com caixas AABB do mapa para não atravessar paredes
      let blockedX = false;
      let blockedZ = false;
      if (colliders) {
        const r = 0.32;
        for (let c = 0; c < colliders.length; c++) {
          const box = colliders[c];
          if (nextY + 1.2 <= box.minY || nextY >= box.maxY) continue;
          if (
            nextX + r > box.minX &&
            nextX - r < box.maxX &&
            botPos.z + r > box.minZ &&
            botPos.z - r < box.maxZ
          ) {
            blockedX = true;
          }
          if (
            botPos.x + r > box.minX &&
            botPos.x - r < box.maxX &&
            nextZ + r > box.minZ &&
            nextZ - r < box.maxZ
          ) {
            blockedZ = true;
          }
        }
      }

      if (blockedX) {
        slot.vel.x *= -0.35;
      } else {
        botPos.x = nextX;
      }
      if (blockedZ) {
        slot.vel.z *= -0.35;
      } else {
        botPos.z = nextZ;
      }

      const floorY = getGroundHeight
        ? getGroundHeight(botPos.x, nextY + 0.3, botPos.z)
        : slot.groundY;

      if (nextY <= floorY) {
        botPos.y = floorY;
        if (Math.abs(slot.vel.y) > 1.35) {
          slot.vel.y = Math.abs(slot.vel.y) * 0.28;
          slot.vel.x *= 0.55;
          slot.vel.z *= 0.55;
          slot.angVel.multiplyScalar(0.5);
        } else {
          slot.vel.y = 0;
          const friction = Math.max(0, 1 - 8.5 * worldSimDt);
          slot.vel.x *= friction;
          slot.vel.z *= friction;
          slot.angVel.multiplyScalar(friction);
        }
      } else {
        botPos.y = nextY;
        slot.bot.pivotGroup.rotation.z = THREE.MathUtils.clamp(
          slot.bot.pivotGroup.rotation.z + slot.angVel.z * worldSimDt * 0.35,
          -0.45,
          0.45
        );
      }
    }
  }

  private updateLocalPlayerBlastFlight(
    dt: number,
    playerPos: THREE.Vector3,
    playerDeathTp?: PlayerDeathThirdPersonController | null,
    activeGlbCollider?: Dust2TriangleCollider | null,
    getGroundHeight?: (x: number, y: number, z: number) => number,
    checkHorizontalCollision?: (
      x: number,
      z: number,
      yBottom: number,
      r: number
    ) => boolean
  ): void {
    this.localLaunchVel.y -= 16.8 * dt;

    const intendedX = playerPos.x + this.localLaunchVel.x * dt;
    const intendedZ = playerPos.z + this.localLaunchVel.z * dt;
    const radius = 0.32;

    if (activeGlbCollider && activeGlbCollider.ready) {
      activeGlbCollider.resolveHorizontal(
        intendedX,
        intendedZ,
        playerPos.y,
        1.1,
        radius,
        _resolvedHoriz
      );
      if (Math.abs(_resolvedHoriz.x - intendedX) > 0.03) {
        this.localLaunchVel.x *= -0.35;
      }
      if (Math.abs(_resolvedHoriz.z - intendedZ) > 0.03) {
        this.localLaunchVel.z *= -0.35;
      }
      playerPos.x = _resolvedHoriz.x;
      playerPos.z = _resolvedHoriz.z;
    } else if (checkHorizontalCollision) {
      if (!checkHorizontalCollision(intendedX, playerPos.z, playerPos.y, radius)) {
        playerPos.x = intendedX;
      } else {
        this.localLaunchVel.x *= -0.35;
      }
      if (!checkHorizontalCollision(playerPos.x, intendedZ, playerPos.y, radius)) {
        playerPos.z = intendedZ;
      } else {
        this.localLaunchVel.z *= -0.35;
      }
    } else {
      playerPos.x = intendedX;
      playerPos.z = intendedZ;
    }

    const nextY = playerPos.y + this.localLaunchVel.y * dt;
    const floorY = getGroundHeight
      ? getGroundHeight(playerPos.x, Math.max(playerPos.y, nextY) + 0.25, playerPos.z)
      : 0;

    if (nextY <= floorY) {
      playerPos.y = floorY;
      if (!this.localBouncedOnGround && Math.abs(this.localLaunchVel.y) > 1.4) {
        this.localBouncedOnGround = true;
        this.localLaunchVel.y = Math.abs(this.localLaunchVel.y) * 0.28;
        this.localLaunchVel.x *= 0.58;
        this.localLaunchVel.z *= 0.58;
        this.localTumblePitchVel *= 0.45;
        this.localTumbleRollVel *= 0.45;
      } else {
        this.localLaunchVel.y = 0;
        const groundFriction = Math.max(0, 1 - 8.5 * dt);
        this.localLaunchVel.x *= groundFriction;
        this.localLaunchVel.z *= groundFriction;
        this.localTumblePitch = THREE.MathUtils.damp(
          this.localTumblePitch,
          0,
          9,
          dt
        );
        this.localTumbleRoll = THREE.MathUtils.damp(
          this.localTumbleRoll,
          0,
          9,
          dt
        );
      }
    } else {
      playerPos.y = nextY;
      this.localTumblePitch = THREE.MathUtils.clamp(
        this.localTumblePitch + this.localTumblePitchVel * dt * 0.35,
        -0.58,
        0.35
      );
      this.localTumbleRoll = THREE.MathUtils.clamp(
        this.localTumbleRoll + this.localTumbleRollVel * dt * 0.35,
        -0.42,
        0.42
      );
    }

    playerDeathTp?.setAirborneBlastTumble(
      this.localTumblePitch,
      this.localTumbleRoll
    );
  }

  public isActive(): boolean {
    return this.localKillCamActive;
  }

  public getTimeScale(): number {
    return this.localKillCamActive ? this.localTimeScale : 1.0;
  }

  public getHudInfo(): {
    active: boolean;
    killerCallsign: string;
    distanceMeters: number;
  } {
    return {
      active: this.localKillCamActive,
      killerCallsign: this.killerCallsign,
      distanceMeters: this.distanceMeters,
    };
  }

  public clear(): void {
    this.localKillCamActive = false;
    this.localElapsedSec = 0;
    this.localTimeScale = 1.0;
    this.localLaunchVel.set(0, 0, 0);
    for (let i = 0; i < this.shockwavePool.length; i++) {
      this.shockwavePool[i].active = false;
      this.shockwavePool[i].group.visible = false;
    }
    for (let i = 0; i < this.thrownBotsPool.length; i++) {
      const slot = this.thrownBotsPool[i];
      if (slot.bot) {
        slot.bot.pivotGroup.rotation.z = 0;
      }
      slot.active = false;
      slot.bot = null;
    }
  }

  public dispose(): void {
    this.clear();
    for (let i = 0; i < this.shockwavePool.length; i++) {
      this.scene.remove(this.shockwavePool[i].group);
    }
    for (let i = 0; i < this.pooledGeometries.length; i++) {
      this.pooledGeometries[i].dispose();
    }
    for (let i = 0; i < this.pooledMaterials.length; i++) {
      this.pooledMaterials[i].dispose();
    }
  }
}
