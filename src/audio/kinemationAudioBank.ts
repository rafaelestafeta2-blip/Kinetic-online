import { resolveAssetUrl } from '../utils/assetUrl';
import { preloadNativeSfxUrl, tryPlayNativeSfxUrl } from './nativeAudioBridge';

export interface MultiVariationBank {
  urls: string[];
  rawBuffers: Array<ArrayBuffer | null>;
  decodedBuffers: Array<AudioBuffer | null>;
  decoding: boolean[];
  htmlPool: HTMLAudioElement[];
  htmlIdx: number;
  lastPickIdx: number;
}

export interface SingleClipBank {
  url: string;
  rawBuffer: ArrayBuffer | null;
  decodedBuffer: AudioBuffer | null;
  decoding: boolean;
  htmlPool: HTMLAudioElement[];
  htmlIdx: number;
}

export const KINEMATION_SHOT_URLS = {
  mps5: [
    '/sounds/kinemation/shots/mps5_0.mp3',
    '/sounds/kinemation/shots/mps5_1.mp3',
    '/sounds/kinemation/shots/mps5_2.mp3',
    '/sounds/kinemation/shots/mps5_3.mp3',
  ],
  mx16a4: [
    '/sounds/kinemation/shots/mx16a4_0.mp3',
    '/sounds/kinemation/shots/mx16a4_1.mp3',
    '/sounds/kinemation/shots/mx16a4_2.mp3',
    '/sounds/kinemation/shots/mx16a4_3.mp3',
  ],
  akx200: [
    '/sounds/kinemation/shots/akx200_0.mp3',
    '/sounds/kinemation/shots/akx200_1.mp3',
    '/sounds/kinemation/shots/akx200_2.mp3',
    '/sounds/kinemation/shots/akx200_3.mp3',
  ],
  drake12: [
    '/sounds/kinemation/shots/drake12_0.mp3',
    '/sounds/kinemation/shots/drake12_1.mp3',
    '/sounds/kinemation/shots/drake12_2.mp3',
    '/sounds/kinemation/shots/drake12_3.mp3',
  ],
  mk14: [
    '/sounds/kinemation/shots/mk14_0.mp3',
    '/sounds/kinemation/shots/mk14_1.mp3',
    '/sounds/kinemation/shots/mk14_2.mp3',
    '/sounds/kinemation/shots/mk14_3.mp3',
  ],
  kar98k: [
    '/sounds/kinemation/shots/kar98k_0.mp3',
    '/sounds/kinemation/shots/kar98k_1.mp3',
    '/sounds/kinemation/shots/kar98k_2.mp3',
    '/sounds/kinemation/shots/kar98k_3.mp3',
  ],
  dgl50: [
    '/sounds/kinemation/shots/dgl50_0.mp3',
    '/sounds/kinemation/shots/dgl50_1.mp3',
    '/sounds/kinemation/shots/dgl50_2.mp3',
    '/sounds/kinemation/shots/dgl50_3.mp3',
  ],
  x18: [
    '/sounds/kinemation/shots/x18_0.mp3',
    '/sounds/kinemation/shots/x18_1.mp3',
    '/sounds/kinemation/shots/x18_2.mp3',
    '/sounds/kinemation/shots/x18_3.mp3',
  ],
} as const;

export const KINEMATION_FOOTSTEP_URLS = {
  walk: [
    '/sounds/kinemation/general/walk_1.mp3',
    '/sounds/kinemation/general/walk_2.mp3',
    '/sounds/kinemation/general/walk_3.mp3',
    '/sounds/kinemation/general/walk_4.mp3',
    '/sounds/kinemation/general/walk_5.mp3',
  ],
  run: [
    '/sounds/kinemation/general/run_1.mp3',
    '/sounds/kinemation/general/run_2.mp3',
    '/sounds/kinemation/general/run_3.mp3',
    '/sounds/kinemation/general/run_4.mp3',
    '/sounds/kinemation/general/run_5.mp3',
  ],
} as const;

export const KINEMATION_SINGLE_URLS = {
  aimIn: '/sounds/kinemation/general/aim_in.mp3',
  aimOut: '/sounds/kinemation/general/aim_out.mp3',
  equip: '/sounds/kinemation/general/equip.mp3',
  unequip: '/sounds/kinemation/general/unequip.mp3',
  unequipPistol: '/sounds/kinemation/general/unequip_pistol.mp3',
  firemode: '/sounds/kinemation/general/firemode.mp3',
  jump: '/sounds/kinemation/general/jump.mp3',
  land: '/sounds/kinemation/general/land.mp3',
  pickup: '/sounds/kinemation/general/pickup.mp3',
  grenadePin: '/sounds/kinemation/general/grenade_pull_pin.mp3',
  grenadeThrow: '/sounds/kinemation/general/grenade_throw.mp3',
  mps5Tac: '/sounds/kinemation/reloads/mps5_tac.mp3',
  mps5Empty: '/sounds/kinemation/reloads/mps5_empty.mp3',
  mx16a4Tac: '/sounds/kinemation/reloads/mx16a4_tac.mp3',
  mx16a4Empty: '/sounds/kinemation/reloads/mx16a4_empty.mp3',
  akx200Tac: '/sounds/kinemation/reloads/akx200_tac.mp3',
  akx200Empty: '/sounds/kinemation/reloads/akx200_empty.mp3',
  dgl50Tac: '/sounds/kinemation/reloads/dgl50_tac.mp3',
  dgl50Empty: '/sounds/kinemation/reloads/dgl50_empty.mp3',
  m1911Tac: '/sounds/kinemation/reloads/m1911_tac.mp3',
  m1911Empty: '/sounds/kinemation/reloads/m1911_empty.mp3',
  mk14Tac: '/sounds/kinemation/reloads/mk14_tac.mp3',
  mk14Empty: '/sounds/kinemation/reloads/mk14_empty.mp3',
  drake12Start: '/sounds/kinemation/reloads/drake12_start.mp3',
  drake12Insert: '/sounds/kinemation/reloads/drake12_insert.mp3',
  drake12End: '/sounds/kinemation/reloads/drake12_end.mp3',
  drake12Dry: '/sounds/kinemation/reloads/drake12_dry.mp3',
  kar98kBoltOpen: '/sounds/kinemation/reloads/kar98k_bolt_open.mp3',
  kar98kBulletInsert: '/sounds/kinemation/reloads/kar98k_bullet_insert.mp3',
  kar98kBoltClose: '/sounds/kinemation/reloads/kar98k_bolt_close.mp3',
} as const;

export function createMultiVariationBank(urls: readonly string[]): MultiVariationBank {
  return {
    urls: urls.map((u) => resolveAssetUrl(u)),
    rawBuffers: urls.map(() => null),
    decodedBuffers: urls.map(() => null),
    decoding: urls.map(() => false),
    htmlPool: [],
    htmlIdx: 0,
    lastPickIdx: -1,
  };
}

export function createSingleClipBank(url: string): SingleClipBank {
  return {
    url: resolveAssetUrl(url),
    rawBuffer: null,
    decodedBuffer: null,
    decoding: false,
    htmlPool: [],
    htmlIdx: 0,
  };
}

async function fetchArrayBuffer(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url).catch(() => null);
    if (res && res.ok) {
      return await res.arrayBuffer().catch(() => null);
    }
  } catch {
    // Ignore network fetch failures cleanly
  }
  return null;
}

export function preloadMultiBank(
  bank: MultiVariationBank,
  getCtx: () => AudioContext | null,
  withHtmlPool = true
): void {
  if (typeof window === 'undefined') return;
  for (let i = 0; i < bank.urls.length; i++) {
    const url = bank.urls[i];
    preloadNativeSfxUrl(url);
    if (withHtmlPool) {
      const audio = new Audio(url);
      audio.preload = 'auto';
      bank.htmlPool.push(audio);
    }
    void fetchArrayBuffer(url).then((buf) => {
      if (!buf) return;
      bank.rawBuffers[i] = buf;
      const ctx = getCtx();
      if (ctx) decodeMultiBank(bank, ctx);
    });
  }
}

export function decodeMultiBank(bank: MultiVariationBank, ctx: AudioContext): void {
  for (let i = 0; i < bank.urls.length; i++) {
    const raw = bank.rawBuffers[i];
    if (!raw || bank.decodedBuffers[i] || bank.decoding[i]) continue;
    bank.decoding[i] = true;
    ctx
      .decodeAudioData(raw.slice(0))
      .then((decoded) => {
        bank.decodedBuffers[i] = decoded;
        bank.decoding[i] = false;
      })
      .catch(() => {
        bank.decoding[i] = false;
      });
  }
}

export function preloadSingleBank(
  bank: SingleClipBank,
  getCtx: () => AudioContext | null,
  htmlCopies = 2
): void {
  if (typeof window === 'undefined') return;
  preloadNativeSfxUrl(bank.url);
  for (let i = 0; i < htmlCopies; i++) {
    const audio = new Audio(bank.url);
    audio.preload = 'auto';
    bank.htmlPool.push(audio);
  }
  void fetchArrayBuffer(bank.url).then((buf) => {
    if (!buf) return;
    bank.rawBuffer = buf;
    const ctx = getCtx();
    if (ctx) decodeSingleBank(bank, ctx);
  });
}

export function decodeSingleBank(bank: SingleClipBank, ctx: AudioContext): void {
  if (!bank.rawBuffer || bank.decodedBuffer || bank.decoding) return;
  bank.decoding = true;
  ctx
    .decodeAudioData(bank.rawBuffer.slice(0))
    .then((decoded) => {
      bank.decodedBuffer = decoded;
      bank.decoding = false;
    })
    .catch(() => {
      bank.decoding = false;
    });
}

export function pickMultiDecodedBuffer(bank: MultiVariationBank): AudioBuffer | null {
  let availableCount = 0;
  for (let i = 0; i < bank.decodedBuffers.length; i++) {
    if (bank.decodedBuffers[i]) availableCount++;
  }
  if (availableCount === 0) return null;

  const len = bank.decodedBuffers.length;
  let pick = Math.floor(Math.random() * len);
  if (availableCount > 1 && pick === bank.lastPickIdx) {
    pick = (pick + 1 + Math.floor(Math.random() * (len - 1))) % len;
  }
  for (let step = 0; step < len; step++) {
    const idx = (pick + step) % len;
    const buf = bank.decodedBuffers[idx];
    if (buf) {
      bank.lastPickIdx = idx;
      return buf;
    }
  }
  return null;
}

export function playMultiBankSample(
  bank: MultiVariationBank,
  ctx: AudioContext | null,
  options: {
    volume?: number;
    pitch?: number;
    pitchJitter?: number;
    suppressed?: boolean;
    lowpassHz?: number;
    delaySec?: number;
  } = {}
): boolean {
  const {
    volume = 1.0,
    pitch = 1.0,
    pitchJitter = 0.04,
    suppressed = false,
    lowpassHz = 1350,
    delaySec = 0,
  } = options;

  // Fast-path: ultra-low-latency native Android SoundPool for immediate, unsuppressed combat SFX
  if (!suppressed && delaySec <= 0 && bank.urls.length > 0) {
    const len = bank.urls.length;
    let pick = Math.floor(Math.random() * len);
    if (len > 1 && pick === bank.lastPickIdx) {
      pick = (pick + 1 + Math.floor(Math.random() * (len - 1))) % len;
    }
    const rate = Math.max(0.5, pitch + (Math.random() - 0.5) * pitchJitter);
    if (tryPlayNativeSfxUrl(bank.urls[pick], volume, rate)) {
      bank.lastPickIdx = pick;
      return true;
    }
  }

  if (ctx) {
    decodeMultiBank(bank, ctx);
    const buf = pickMultiDecodedBuffer(bank);
    if (buf) {
      const startAt = ctx.currentTime + Math.max(0, delaySec);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.setValueAtTime(
        Math.max(0.5, pitch + (Math.random() - 0.5) * pitchJitter),
        startAt
      );
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(volume, startAt);
      if (suppressed) {
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(lowpassHz, startAt);
        src.connect(lp);
        lp.connect(gain);
      } else {
        src.connect(gain);
      }
      gain.connect(ctx.destination);
      src.start(startAt);
      return true;
    }
  }

  if (delaySec <= 0 && bank.htmlPool.length > 0) {
    const el = bank.htmlPool[bank.htmlIdx];
    bank.htmlIdx = (bank.htmlIdx + 1) % bank.htmlPool.length;
    el.currentTime = 0;
    el.volume = Math.max(0, Math.min(1, volume));
    el.playbackRate = Math.max(0.5, pitch);
    el.play().catch(() => {});
    return true;
  }

  return false;
}

export function playSingleBankSample(
  bank: SingleClipBank,
  ctx: AudioContext | null,
  options: {
    volume?: number;
    pitch?: number;
    pitchJitter?: number;
    delaySec?: number;
  } = {}
): boolean {
  const { volume = 0.95, pitch = 1.0, pitchJitter = 0.03, delaySec = 0 } = options;

  // Fast-path: ultra-low-latency native Android SoundPool for immediate single combat cues
  if (delaySec <= 0) {
    const rate = Math.max(0.5, pitch + (Math.random() - 0.5) * pitchJitter);
    if (tryPlayNativeSfxUrl(bank.url, volume, rate)) {
      return true;
    }
  }

  if (ctx) {
    decodeSingleBank(bank, ctx);
    if (bank.decodedBuffer) {
      const startAt = ctx.currentTime + Math.max(0, delaySec);
      const src = ctx.createBufferSource();
      src.buffer = bank.decodedBuffer;
      src.playbackRate.setValueAtTime(
        Math.max(0.5, pitch + (Math.random() - 0.5) * pitchJitter),
        startAt
      );
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(volume, startAt);
      src.connect(gain);
      gain.connect(ctx.destination);
      src.start(startAt);
      return true;
    }
  }

  if (delaySec <= 0 && bank.htmlPool.length > 0) {
    const el = bank.htmlPool[bank.htmlIdx];
    bank.htmlIdx = (bank.htmlIdx + 1) % bank.htmlPool.length;
    el.currentTime = 0;
    el.volume = Math.max(0, Math.min(1, volume));
    el.playbackRate = Math.max(0.5, pitch);
    el.play().catch(() => {});
    return true;
  }

  return false;
}
