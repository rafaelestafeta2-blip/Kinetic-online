/**
 * Per-peer pose history for render interpolation and client-side lag compensation.
 * Stores a short ring of transforms keyed by uid; used by onlineMatchSync + combat hits.
 */

export interface PeerPoseSample {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  isCrouching: boolean;
  ts: number;
}

const MAX_SAMPLES = 28;
const buffers = new Map<string, PeerPoseSample[]>();

export function resetPeerSnapshotBuffers(): void {
  buffers.clear();
}

export function clearPeerPoseBuffer(uid: string): void {
  if (!uid) return;
  buffers.delete(uid);
}

export function pushPeerPose(uid: string, sample: PeerPoseSample): void {
  if (!uid) return;
  let ring = buffers.get(uid);
  if (!ring) {
    ring = [];
    buffers.set(uid, ring);
  }
  const last = ring[ring.length - 1];
  if (last) {
    const dtMs = sample.ts - last.ts;
    // Ignore duplicate or out-of-order timestamps
    if (dtMs <= 0) return;

    // Large spatial jump (e.g. round respawn > 12m): reset buffer so we don't slide across the map
    const dx = sample.x - last.x;
    const dy = sample.y - last.y;
    const dz = sample.z - last.z;
    if (dx * dx + dy * dy + dz * dz > 144) {
      ring.length = 0;
      ring.push(sample);
      return;
    }

    // If the peer was idle / no packets arrived for >380ms, re-anchor the previous sample
    // to 45ms before now so starting to move is immediately responsive instead of
    // interpolating across a multi-second pause.
    if (dtMs > 380) {
      const anchor: PeerPoseSample = {
        ...last,
        ts: sample.ts - 45,
      };
      ring.length = 0;
      ring.push(anchor, sample);
      return;
    }

    if (dtMs < 10) {
      ring[ring.length - 1] = sample;
      return;
    }
  }
  ring.push(sample);
  if (ring.length > MAX_SAMPLES) ring.shift();
}

/** Pose at approximately `whenMs` (rewind for fairer hits). Falls back to newest. */
export function samplePeerPoseAt(uid: string, whenMs: number): PeerPoseSample | null {
  const ring = buffers.get(uid);
  if (!ring || ring.length === 0) return null;
  if (ring.length === 1) return ring[0];

  // Find surrounding samples
  for (let i = ring.length - 1; i >= 1; i--) {
    const newer = ring[i];
    const older = ring[i - 1];
    if (whenMs >= older.ts && whenMs <= newer.ts) {
      const span = Math.max(1, newer.ts - older.ts);
      const a = (whenMs - older.ts) / span;
      return lerpPose(older, newer, a);
    }
  }
  if (whenMs < ring[0].ts) return ring[0];

  // Short dead-reckoning extrapolation (up to 65ms) when a packet is slightly delayed
  const newest = ring[ring.length - 1];
  const prev = ring[ring.length - 2];
  const overrunMs = whenMs - newest.ts;
  const segSpanMs = newest.ts - prev.ts;
  if (overrunMs > 0 && overrunMs <= 65 && segSpanMs >= 15 && segSpanMs <= 220) {
    const extraFactor = Math.min(0.65, overrunMs / segSpanMs);
    return {
      x: newest.x + (newest.x - prev.x) * extraFactor,
      y: newest.y + (newest.y - prev.y) * extraFactor,
      z: newest.z + (newest.z - prev.z) * extraFactor,
      yaw: lerpAngle(prev.yaw, newest.yaw, 1 + extraFactor),
      pitch: newest.pitch,
      isCrouching: newest.isCrouching,
      ts: whenMs,
    };
  }

  return newest;
}

/** Render-time pose: interpolate ~65ms behind latest network arrival for jitter-free motion. */
export function samplePeerPoseForRender(
  uid: string,
  renderDelayMs = 65
): PeerPoseSample | null {
  const ring = buffers.get(uid);
  if (!ring || ring.length === 0) return null;
  const targetTs = Date.now() - renderDelayMs;
  return samplePeerPoseAt(uid, targetTs) || ring[ring.length - 1];
}

function lerpPose(a: PeerPoseSample, b: PeerPoseSample, t: number): PeerPoseSample {
  const u = Math.min(1, Math.max(0, t));
  return {
    x: a.x + (b.x - a.x) * u,
    y: a.y + (b.y - a.y) * u,
    z: a.z + (b.z - a.z) * u,
    yaw: lerpAngle(a.yaw, b.yaw, u),
    pitch: a.pitch + (b.pitch - a.pitch) * u,
    isCrouching: u < 0.5 ? a.isCrouching : b.isCrouching,
    ts: a.ts + (b.ts - a.ts) * u,
  };
}

function lerpAngle(current: number, target: number, alpha: number): number {
  let diff = target - current;
  while (diff < -Math.PI) diff += Math.PI * 2;
  while (diff > Math.PI) diff -= Math.PI * 2;
  return current + diff * alpha;
}

