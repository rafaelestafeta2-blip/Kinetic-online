import * as THREE from 'three';
import { setMasterShellshockLowpassHz } from '../audio/audioSettings';
import {
  clearShellshockAudioEffect,
  triggerShellshockTinnitus,
} from '../audio/tacticalImmersionAudio';

/**
 * Constantes Oficiais do Sistema de Dois Raios da Granada (KINETIC // Tactical FPS)
 * - Raio 1 (Zona Fatal): 0.0m a 5.0m -> Dano fatal (100% / eliminação imediata) + GrenadeKillCam.
 * - Raio 2 (Zona de Concussão / Shellshock): 5.0m a 11.0m -> Dano escalonado linearmente (75 a 20),
 *   empurrão na câmera e status `isShellshocked = true` por 4.0 segundos.
 * - Fora do Raio (> 11.0m): Zero impacto (velocidade, visão e audição 100% normais).
 */
export const GRENADE_LETHAL_RADIUS_M = 5.0;
export const GRENADE_CONCUSSION_RADIUS_M = 11.0;
export const GRENADE_SHELLSHOCK_DURATION_SEC = 4.0;
export const GRENADE_CONCUSSION_MAX_DAMAGE = 75;
export const GRENADE_CONCUSSION_MIN_DAMAGE = 20;

export type GrenadeBlastZone = 'LETHAL_R1' | 'CONCUSSION_R2' | 'OUTSIDE';

export interface GrenadeTwoRadiusVerdict {
  zone: GrenadeBlastZone;
  distanceMeters: number;
  isBehindCover: boolean;
  lethal: boolean;
  damageApplied: number;
  isShellshocked: boolean;
  shellshockDurationSec: number;
  shellshockIntensity: number;
  /** Vetor de impulso [vx, vy, vz]: arremesso forte no Raio 1 ou empurrão de recuo no Raio 2. */
  impulseVel: [number, number, number];
}

export interface ShellshockFrameTelemetry {
  isShellshocked: boolean;
  /** Intensidade normalizada (1.0 no impacto decaindo gradualmente até 0.0 em 4.0s). */
  intensity: number;
  remainingSec: number;
  /** Oscilação suave (sway) nos eixos da câmera em 1ª pessoa (radianos). */
  swayYawOffset: number;
  swayPitchOffset: number;
  swayRollOffset: number;
  /** Aumento temporário de FOV (+graus) durante a desorientação da onda de choque. */
  fovOffsetDeg: number;
  /** Frequência atual (Hz) do BiquadFilterNode ('lowpass'): ~400Hz -> 20000Hz. */
  lowpassCutoffHz: number;
  /** Velocidade residual do empurrão físico da onda de choque (Zero-GC). */
  pushVelocity: THREE.Vector3;
}

const _pushDir = new THREE.Vector3();

/**
 * Calcula de forma determinística (usada tanto no Servidor Autoritativo quanto no Cliente)
 * o veredito dos Dois Raios da Granada para um alvo a partir de `grenadePos` e `targetPos`.
 */
export function evaluateGrenadeTwoRadiusVerdict(
  grenadeX: number,
  grenadeY: number,
  grenadeZ: number,
  targetX: number,
  targetY: number,
  targetZ: number,
  isBehindCover = false
): GrenadeTwoRadiusVerdict {
  const dx = targetX - grenadeX;
  const dy = targetY + 0.9 - (grenadeY + 0.15);
  const dz = targetZ - grenadeZ;
  const dist = Math.hypot(dx, dy, dz);

  // Fora do Raio 2 (> 11.0m): Zero impacto
  if (dist > GRENADE_CONCUSSION_RADIUS_M) {
    return {
      zone: 'OUTSIDE',
      distanceMeters: Number(dist.toFixed(2)),
      isBehindCover,
      lethal: false,
      damageApplied: 0,
      isShellshocked: false,
      shellshockDurationSec: 0,
      shellshockIntensity: 0,
      impulseVel: [0, 0, 0],
    };
  }

  // Direção horizontal oposta à granada: dir = normalize(targetPos - grenadePos)
  const horizLen = Math.hypot(dx, dz);
  const dirX = horizLen > 0.001 ? dx / horizLen : 0;
  const dirZ = horizLen > 0.001 ? dz / horizLen : 1;

  // RAIO 1 — Zona Fatal (0m a 5.0m exposto sem cobertura sólida)
  if (dist <= GRENADE_LETHAL_RADIUS_M && !isBehindCover) {
    const prox = THREE.MathUtils.clamp(
      1 - dist / GRENADE_LETHAL_RADIUS_M,
      0,
      1
    );
    const launchHorizSpeed = THREE.MathUtils.lerp(8.4, 12.8, prox);
    const launchUpwardVy = THREE.MathUtils.lerp(3.9, 5.8, prox);

    return {
      zone: 'LETHAL_R1',
      distanceMeters: Number(dist.toFixed(2)),
      isBehindCover: false,
      lethal: true,
      damageApplied: 195, // 100%+ eliminação fatal imediata
      isShellshocked: false,
      shellshockDurationSec: 0,
      shellshockIntensity: 1.0,
      impulseVel: [
        Number((dirX * launchHorizSpeed).toFixed(2)),
        Number(launchUpwardVy.toFixed(2)),
        Number((dirZ * launchHorizSpeed).toFixed(2)),
      ],
    };
  }

  // RAIO 2 — Zona de Concussão / Shellshock (5.0m a 11.0m, ou dentro de 5.0m protegido por cobertura)
  const span = GRENADE_CONCUSSION_RADIUS_M - GRENADE_LETHAL_RADIUS_M; // 6.0m
  const distFromLethalEdge = Math.max(0, dist - GRENADE_LETHAL_RADIUS_M);
  const linearT = THREE.MathUtils.clamp(distFromLethalEdge / span, 0, 1);

  // Dano escalonado linearmente: 75 perto de 5.0m caindo até 20 em 11.0m
  let rawDamage = Math.round(
    THREE.MathUtils.lerp(
      GRENADE_CONCUSSION_MAX_DAMAGE,
      GRENADE_CONCUSSION_MIN_DAMAGE,
      linearT
    )
  );
  if (isBehindCover) {
    // Cobertura parcial reduz o impacto direto de estilhaços mas mantém a onda de concussão
    rawDamage = Math.max(
      GRENADE_CONCUSSION_MIN_DAMAGE,
      Math.round(rawDamage * 0.72)
    );
  }

  const peakIntensity = Number(
    THREE.MathUtils.lerp(1.0, 0.38, linearT).toFixed(3)
  );
  const pushHorizSpeed = THREE.MathUtils.lerp(3.6, 1.35, linearT);
  const pushUpwardVy = THREE.MathUtils.lerp(1.15, 0.35, linearT);

  return {
    zone: 'CONCUSSION_R2',
    distanceMeters: Number(dist.toFixed(2)),
    isBehindCover,
    lethal: false,
    damageApplied: rawDamage,
    isShellshocked: true,
    shellshockDurationSec: GRENADE_SHELLSHOCK_DURATION_SEC,
    shellshockIntensity: peakIntensity,
    impulseVel: [
      Number((dirX * pushHorizSpeed).toFixed(2)),
      Number(pushUpwardVy.toFixed(2)),
      Number((dirZ * pushHorizSpeed).toFixed(2)),
    ],
  };
}

/**
 * ShellshockEffectController
 * ---------------------------------------------------------------------------
 * Controlador modular de efeitos sensoriais de Concussão (Raio 2: 5.0m a 11.0m)
 * otimizado para 60 FPS em navegadores mobile (Zero-GC, sem shaders pesados):
 *
 * 1. Visão Embaçada e Desorientação (4.0 segundos, intensity 1.0 -> 0.0):
 *    - Alimenta a HUD com `isShellshocked` e `shellshockIntensity` para renderizar
 *      a vinheta esbranquiçada/embaçada pulsante nas bordas + blur leve controlado em CSS.
 *    - Aplica oscilação harmônica suave (`sway`) nos ângulos da câmera em 1ª pessoa
 *      (yaw, pitch, roll), recuo físico na direção oposta à granada e leve abertura de FOV.
 * 2. Audição Abafada + Zumbido Procedural (Web Audio API):
 *    - Controla o `BiquadFilterNode` (`type = 'lowpass'`) global, derrubando a frequência
 *      de corte para `~400Hz` e subindo gradualmente de volta para `20000Hz` ao longo de 4.0s.
 *    - Dispara via `OscillatorNode` um zumbido agudo sutil (`~3200Hz`) com ganho baixo
 *      decaindo suavemente em 4.0 segundos.
 */
export class ShellshockEffectController {
  private active = false;
  private elapsedSec = 0;
  private durationSec = GRENADE_SHELLSHOCK_DURATION_SEC;
  private peakIntensity = 1.0;
  private phaseSeed = 0;

  /** Velocidade residual do empurrão físico da onda de choque no jogador local (Zero-GC). */
  public readonly pushVelocity = new THREE.Vector3();

  private readonly telemetry: ShellshockFrameTelemetry = {
    isShellshocked: false,
    intensity: 0,
    remainingSec: 0,
    swayYawOffset: 0,
    swayPitchOffset: 0,
    swayRollOffset: 0,
    fovOffsetDeg: 0,
    lowpassCutoffHz: 20000,
    pushVelocity: this.pushVelocity,
  };

  /**
   * Aciona o estado de Concussão / Shellshock (Raio 2) no jogador local por 4.0 segundos.
   */
  public triggerShellshock(
    grenadePos: THREE.Vector3,
    playerPos: THREE.Vector3,
    peakIntensity = 1.0,
    durationSec = GRENADE_SHELLSHOCK_DURATION_SEC,
    outPlayerVel?: THREE.Vector3,
    outCameraImpulse?: { pitchKick: number; rollKick: number; shake: number }
  ): void {
    const clampedPeak = THREE.MathUtils.clamp(peakIntensity, 0.25, 1.0);

    // Se já estiver em shellshock, mantém o pico mais forte e renova a duração
    if (this.active) {
      const currentRemainingRatio = Math.max(
        0,
        1 - this.elapsedSec / Math.max(0.1, this.durationSec)
      );
      const currentLiveIntensity = this.peakIntensity * currentRemainingRatio;
      this.peakIntensity = Math.max(clampedPeak, currentLiveIntensity);
    } else {
      this.peakIntensity = clampedPeak;
      this.phaseSeed = performance.now() * 0.001;
    }

    this.active = true;
    this.elapsedSec = 0;
    this.durationSec = Math.max(1.0, durationSec);

    // 1. Empurrão físico (recoil push) na direção oposta à granada
    _pushDir.subVectors(playerPos, grenadePos);
    _pushDir.y = 0;
    const horizDist = _pushDir.length();
    if (horizDist > 0.001) {
      _pushDir.divideScalar(horizDist);
    } else {
      _pushDir.set(0, 0, 1);
    }

    const pushSpeed = THREE.MathUtils.lerp(1.4, 3.8, this.peakIntensity);
    this.pushVelocity.set(
      _pushDir.x * pushSpeed,
      0.55 * this.peakIntensity,
      _pushDir.z * pushSpeed
    );

    if (outPlayerVel) {
      outPlayerVel.x += this.pushVelocity.x;
      outPlayerVel.z += this.pushVelocity.z;
    }

    if (outCameraImpulse) {
      outCameraImpulse.pitchKick = 0.042 * this.peakIntensity;
      outCameraImpulse.rollKick =
        (Math.random() >= 0.5 ? 1 : -1) * 0.055 * this.peakIntensity;
      outCameraImpulse.shake = 0.036 * this.peakIntensity;
    }

    // 2. Aciona Web Audio API: BiquadFilterNode ('lowpass' ~400Hz -> 20000Hz) + OscillatorNode (~3200Hz)
    triggerShellshockTinnitus(
      grenadePos,
      playerPos,
      this.durationSec,
      this.peakIntensity
    );

    this.syncTelemetry(0);
  }

  /**
   * Atualiza por frame (60 FPS, Zero-GC) a curva de recuperação de 4.0s (`intensity` de 1.0 até 0.0),
   * o sway de desorientação da câmera em 1ª pessoa, o FOV temporário e o BiquadFilterNode lowpass.
   */
  public update(rawDt: number): ShellshockFrameTelemetry {
    if (!this.active) {
      return this.telemetry;
    }

    this.elapsedSec += rawDt;
    if (this.elapsedSec >= this.durationSec) {
      this.clear();
      return this.telemetry;
    }

    // Decaimento do vetor de empurrão inicial
    const damp = Math.exp(-7.5 * rawDt);
    this.pushVelocity.multiplyScalar(damp);

    this.syncTelemetry(this.elapsedSec);
    return this.telemetry;
  }

  private syncTelemetry(elapsed: number): void {
    const progress = THREE.MathUtils.clamp(
      elapsed / Math.max(0.01, this.durationSec),
      0,
      1
    );
    // Recuperação gradual suave de 1.0 até 0.0 ao longo dos 4.0 segundos
    const envelope = Math.pow(1 - progress, 1.35);
    const liveIntensity = this.peakIntensity * envelope;

    const t = this.phaseSeed + elapsed;
    // Oscilação harmônica composta (Lissajous lento + tremor inicial pós-onda de choque)
    const shockTremor = Math.exp(-elapsed * 2.4) * Math.sin(t * 21.0) * 0.008;
    const swayYaw =
      (Math.sin(t * 2.65) * 0.026 + Math.cos(t * 4.3) * 0.011 + shockTremor) *
      liveIntensity;
    const swayPitch =
      (Math.cos(t * 2.15) * 0.02 + Math.sin(t * 3.85) * 0.009 + shockTremor * 0.7) *
      liveIntensity;
    const swayRoll =
      (Math.sin(t * 1.95 + 0.7) * 0.038 + Math.cos(t * 3.4) * 0.014) *
      liveIntensity;

    // Leve aumento temporário de FOV (+7.2° no pico + pulso respiratório de concussão)
    const pulseFov = (0.82 + 0.18 * Math.sin(elapsed * 6.5)) * 7.2 * liveIntensity;

    // Frequência do BiquadFilterNode ('lowpass'): ~400Hz subindo exponencialmente até 20000Hz
    const minHz = THREE.MathUtils.lerp(560, 380, this.peakIntensity);
    const cutoffHz =
      minHz * Math.pow(20000 / minHz, THREE.MathUtils.clamp(progress * progress, 0, 1));
    setMasterShellshockLowpassHz(cutoffHz, 0.05);

    this.telemetry.isShellshocked = liveIntensity > 0.01;
    this.telemetry.intensity = Number(liveIntensity.toFixed(3));
    this.telemetry.remainingSec = Number(
      Math.max(0, this.durationSec - elapsed).toFixed(2)
    );
    this.telemetry.swayYawOffset = swayYaw;
    this.telemetry.swayPitchOffset = swayPitch;
    this.telemetry.swayRollOffset = swayRoll;
    this.telemetry.fovOffsetDeg = pulseFov;
    this.telemetry.lowpassCutoffHz = Math.round(cutoffHz);
  }

  public isActive(): boolean {
    return this.active;
  }

  public getTelemetry(): ShellshockFrameTelemetry {
    return this.telemetry;
  }

  public clear(): void {
    const wasActive = this.active;
    this.active = false;
    this.elapsedSec = 0;
    this.pushVelocity.set(0, 0, 0);
    this.telemetry.isShellshocked = false;
    this.telemetry.intensity = 0;
    this.telemetry.remainingSec = 0;
    this.telemetry.swayYawOffset = 0;
    this.telemetry.swayPitchOffset = 0;
    this.telemetry.swayRollOffset = 0;
    this.telemetry.fovOffsetDeg = 0;
    this.telemetry.lowpassCutoffHz = 20000;
    if (wasActive) {
      clearShellshockAudioEffect();
    }
  }

  public dispose(): void {
    this.clear();
  }
}
