import { DrillMode, QualityPreset } from '../types/game';

export interface TelemetrySnapshotPayload {
  sessionId: string;
  platform: 'android_capacitor' | 'web';
  gpuRenderer: string;
  drillMode: DrillMode;
  qualityPreset: QualityPreset;
  avgFps: number;
  p95FrameMs: number;
  p99FrameMs: number;
  hitchCount: number;
  totalFrames: number;
  matchLoadMs: number | null;
  pingMs: number | null;
  webglContextLostCount: number;
  lastError: string | null;
  ts: number;
}

const FRAME_BUFFER_SIZE = 240;
const FLUSH_INTERVAL_MS = 45000;

class RuntimeTelemetryCollector {
  private readonly sessionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  private frameTimesMs = new Float32Array(FRAME_BUFFER_SIZE);
  private frameCursor = 0;
  private frameSamples = 0;
  private totalFrames = 0;
  private hitchCount = 0;
  private accumTimeSec = 0;
  private accumFrames = 0;
  private avgFps = 60;

  private matchLoadMs: number | null = null;
  private pingMs: number | null = null;
  private webglContextLostCount = 0;
  private lastError: string | null = null;
  private drillMode: DrillMode = 'FREE_RANGE';
  private qualityPreset: QualityPreset = 'BALANCED_60';
  private gpuRenderer = 'unknown';
  private lastFlushMs = 0;
  private initializedGlobals = false;

  public initEnvironment(gpuString?: string): void {
    if (gpuString) {
      this.gpuRenderer = gpuString.slice(0, 120);
    }
    if (this.initializedGlobals || typeof window === 'undefined') return;
    this.initializedGlobals = true;

    window.addEventListener('error', (ev) => {
      const msg = ev?.message || 'window_error';
      this.recordError('runtime_error', msg);
    });
    window.addEventListener('unhandledrejection', (ev) => {
      const reason =
        ev?.reason instanceof Error
          ? ev.reason.message
          : String(ev?.reason || 'unhandled_rejection');
      this.recordError('runtime_error', reason);
    });
  }

  public setContext(drillMode: DrillMode, qualityPreset: QualityPreset): void {
    this.drillMode = drillMode;
    this.qualityPreset = qualityPreset;
  }

  public recordFrame(rawDtSec: number): void {
    if (!Number.isFinite(rawDtSec) || rawDtSec <= 0 || rawDtSec > 1.5) return;
    const ms = rawDtSec * 1000;
    this.frameTimesMs[this.frameCursor] = ms;
    this.frameCursor = (this.frameCursor + 1) % FRAME_BUFFER_SIZE;
    if (this.frameSamples < FRAME_BUFFER_SIZE) this.frameSamples += 1;

    this.totalFrames += 1;
    if (ms > 50) this.hitchCount += 1;

    this.accumTimeSec += rawDtSec;
    this.accumFrames += 1;
    if (this.accumTimeSec >= 1.0) {
      this.avgFps = Math.round(this.accumFrames / this.accumTimeSec);
      this.accumTimeSec = 0;
      this.accumFrames = 0;
    }

    const now = performance.now();
    if (now - this.lastFlushMs >= FLUSH_INTERVAL_MS && this.totalFrames > 30) {
      this.flush(false);
    }
  }

  public recordMatchLoad(mode: DrillMode, durationMs: number): void {
    this.drillMode = mode;
    this.matchLoadMs = Math.round(Math.max(0, durationMs));
    this.flush(false);
  }

  public recordPingSample(rttMs: number): void {
    if (!Number.isFinite(rttMs) || rttMs < 0 || rttMs > 10000) return;
    this.pingMs =
      this.pingMs === null
        ? Math.round(rttMs)
        : Math.round(this.pingMs * 0.7 + rttMs * 0.3);
  }

  public recordError(
    kind: 'context_lost' | 'context_restored' | 'runtime_error',
    detail?: string
  ): void {
    if (kind === 'context_lost') {
      this.webglContextLostCount += 1;
      this.lastError = detail ? `webgl_context_lost:${detail}` : 'webgl_context_lost';
      this.flush(true);
      return;
    }
    if (kind === 'runtime_error' && detail) {
      this.lastError = detail.slice(0, 180);
    }
  }

  public getSnapshot(): TelemetrySnapshotPayload {
    const count = this.frameSamples;
    let p95 = 16.7;
    let p99 = 16.7;
    if (count > 0) {
      const sorted = Array.from(this.frameTimesMs.subarray(0, count)).sort(
        (a, b) => a - b
      );
      p95 = Number(
        (sorted[Math.min(count - 1, Math.floor(count * 0.95))] || 16.7).toFixed(1)
      );
      p99 = Number(
        (sorted[Math.min(count - 1, Math.floor(count * 0.99))] || 16.7).toFixed(1)
      );
    }

    const isCapacitor =
      typeof window !== 'undefined' &&
      Boolean((window as unknown as { Capacitor?: unknown }).Capacitor);

    return {
      sessionId: this.sessionId,
      platform: isCapacitor ? 'android_capacitor' : 'web',
      gpuRenderer: this.gpuRenderer,
      drillMode: this.drillMode,
      qualityPreset: this.qualityPreset,
      avgFps: this.avgFps,
      p95FrameMs: p95,
      p99FrameMs: p99,
      hitchCount: this.hitchCount,
      totalFrames: this.totalFrames,
      matchLoadMs: this.matchLoadMs,
      pingMs: this.pingMs,
      webglContextLostCount: this.webglContextLostCount,
      lastError: this.lastError,
      ts: Date.now(),
    };
  }

  public flush(useBeacon = false): void {
    if (typeof window === 'undefined' || typeof fetch === 'undefined') return;
    this.lastFlushMs = performance.now();
    const payload = JSON.stringify(this.getSnapshot());

    if (useBeacon && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      try {
        const blob = new Blob([payload], { type: 'application/json' });
        if (navigator.sendBeacon('/api/telemetry', blob)) return;
      } catch {
        // fallback to fetch
      }
    }

    fetch('/api/telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => {
      // silent telemetry — never disturb gameplay
    });
  }
}

export const runtimeTelemetry = new RuntimeTelemetryCollector();
