import { Capacitor } from '@capacitor/core';
import { NativeAudio } from '@capacitor-community/native-audio';

interface KineticNativeAudioBridge {
  preloadSfx?: (key: string, assetPath: string) => void;
  playSfx?: (key: string, volume: number, rate: number) => boolean;
  isSfxReady?: (key: string) => boolean;
}

declare global {
  interface Window {
    KineticNativeAudio?: KineticNativeAudioBridge;
  }
}

const isNativeAndroid =
  typeof window !== 'undefined' &&
  Capacitor.isNativePlatform() &&
  Capacitor.getPlatform() === 'android';

const preloadedSfxKeys = new Set<string>();
const preloadedTrackIds = new Set<string>();
let nativeAudioConfigured = false;
let sfxMasterScale = 1.0;
let musicMasterScale = 0.8;
let shellshockMuffleActive = false;

function normalizeLocalAssetPath(url: string): string | null {
  if (!url) return null;
  let path = url.trim();
  // Strip origin if same-origin Capacitor asset URL (https://localhost/sounds/...)
  if (/^https?:\/\/localhost(:\d+)?\//i.test(path)) {
    path = path.replace(/^https?:\/\/localhost(:\d+)?/i, '');
  }
  // Only bundle-local /sounds/* or /audio/* exist inside APK assets/public/
  if (/^https?:\/\//i.test(path)) return null;
  const clean = path.split('?')[0].split('#')[0].replace(/^\/+/, '');
  if (!clean.startsWith('sounds/') && !clean.startsWith('audio/')) {
    return null;
  }
  return `public/${clean}`;
}

function getSoundPoolBridge(): KineticNativeAudioBridge | null {
  if (!isNativeAndroid || typeof window === 'undefined') return null;
  return window.KineticNativeAudio ?? null;
}

/**
 * Configures Capacitor NativeAudio plugin once on native Android so background
 * tracks mix smoothly with low-latency SoundPool SFX and WebRTC voice comms.
 */
export function initNativeAudioBridge(): void {
  if (!isNativeAndroid || nativeAudioConfigured) return;
  nativeAudioConfigured = true;
  void NativeAudio.configure({ fade: true, focus: false }).catch(() => {});
}

export function syncNativeAudioVolumes(
  master0to100: number,
  effects0to100: number,
  music0to100: number
): void {
  const master = Math.max(0, Math.min(1, (master0to100 ?? 100) / 100));
  sfxMasterScale = Math.max(0, Math.min(1, master * Math.max(0, Math.min(1, (effects0to100 ?? 100) / 100))));
  musicMasterScale = Math.max(0, Math.min(1, master * Math.max(0, Math.min(1, (music0to100 ?? 80) / 100))));

  if (!isNativeAndroid || preloadedTrackIds.size === 0) return;
  preloadedTrackIds.forEach((assetId) => {
    void NativeAudio.setVolume({ assetId, volume: musicMasterScale }).catch(() => {});
  });
}

export function setNativeAudioShellshockActive(active: boolean): void {
  shellshockMuffleActive = active;
}

/**
 * Preloads a local tactical SFX clip into Android's native SoundPool PCM cache
 * (non-blocking background thread in MainActivity). No-op on Web.
 */
export function preloadNativeSfxUrl(url: string): void {
  const bridge = getSoundPoolBridge();
  if (!bridge?.preloadSfx) return;
  const assetPath = normalizeLocalAssetPath(url);
  if (!assetPath || preloadedSfxKeys.has(assetPath)) return;
  preloadedSfxKeys.add(assetPath);
  try {
    bridge.preloadSfx(assetPath, assetPath);
  } catch {
    preloadedSfxKeys.delete(assetPath);
  }
}

/**
 * Attempts ultra-low-latency hardware SoundPool playback on Capacitor Android.
 * Returns true if played natively, or false so callers fall back seamlessly to Web Audio.
 */
export function tryPlayNativeSfxUrl(
  url: string,
  volume = 1.0,
  pitch = 1.0
): boolean {
  if (shellshockMuffleActive) return false;
  const bridge = getSoundPoolBridge();
  if (!bridge?.playSfx) return false;
  const assetPath = normalizeLocalAssetPath(url);
  if (!assetPath) return false;

  if (!preloadedSfxKeys.has(assetPath)) {
    preloadNativeSfxUrl(url);
    return false;
  }

  const finalVol = Math.max(0, Math.min(1, volume * sfxMasterScale));
  if (finalVol <= 0.001) return true; // Muted cleanly without waking WebAudio

  const clampedRate = Math.max(0.5, Math.min(2.0, pitch || 1.0));
  try {
    return Boolean(bridge.playSfx(assetPath, finalVol, clampedRate));
  } catch {
    return false;
  }
}

/**
 * Hardware-backed streaming track preload via @capacitor-community/native-audio
 * (ideal for long music/ambient cues on Android).
 */
export async function preloadNativeMusicTrack(
  assetId: string,
  url: string
): Promise<boolean> {
  if (!isNativeAndroid) return false;
  initNativeAudioBridge();
  const assetPath = normalizeLocalAssetPath(url);
  if (!assetPath) return false;
  if (preloadedTrackIds.has(assetId)) return true;
  try {
    await NativeAudio.preload({
      assetId,
      assetPath,
      audioChannelNum: 1,
      volume: musicMasterScale,
      isUrl: false,
    });
    preloadedTrackIds.add(assetId);
    return true;
  } catch {
    return false;
  }
}

export async function playNativeMusicTrack(assetId: string, loop = true): Promise<boolean> {
  if (!isNativeAndroid || !preloadedTrackIds.has(assetId)) return false;
  try {
    await NativeAudio.setVolume({ assetId, volume: musicMasterScale });
    if (loop) {
      await NativeAudio.loop({ assetId });
    } else {
      await NativeAudio.play({ assetId });
    }
    return true;
  } catch {
    return false;
  }
}

export async function stopNativeMusicTrack(assetId: string): Promise<void> {
  if (!isNativeAndroid || !preloadedTrackIds.has(assetId)) return;
  try {
    await NativeAudio.stop({ assetId });
  } catch {
    // ignore if already stopped
  }
}
