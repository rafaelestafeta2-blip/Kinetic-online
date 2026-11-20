import React, { useEffect, useState } from 'react';
import {
  AssetDownloadSnapshot,
  formatMegabytes,
  getAssetDownloadSnapshot,
  subscribeAssetDownloads,
} from '../utils/assetDownloadTracker';
import { hasExternalAssetCdn } from '../utils/assetUrl';

interface AssetDownloadProgressToastProps {
  /** Hide during fullscreen LoadingScreen which already displays its own bar */
  hidden?: boolean;
}

export const AssetDownloadProgressToast: React.FC<AssetDownloadProgressToastProps> = ({
  hidden = false,
}) => {
  const [snap, setSnap] = useState<AssetDownloadSnapshot>(() =>
    getAssetDownloadSnapshot()
  );

  useEffect(() => {
    return subscribeAssetDownloads(setSnap);
  }, []);

  if (hidden || snap.activeCount <= 0) return null;

  const isCdn = hasExternalAssetCdn();
  const hasSize = snap.totalBytes > 0;
  const pct = snap.indeterminate ? 25 : Math.max(3, snap.progressPct);

  return (
    <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-[70] pointer-events-none w-[92vw] max-w-md px-3.5 py-2.5 rounded-xl bg-[#070a10]/92 border border-sky-400/50 shadow-[0_10px_32px_rgba(0,0,0,0.85)] backdrop-blur-md">
      <div className="flex items-center justify-between gap-2 text-[10px] font-mono mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full bg-sky-400 animate-ping shrink-0" />
          <span className="font-display font-black text-white uppercase tracking-wider truncate">
            {isCdn ? 'BAIXANDO DO CDN · ' : 'CARREGANDO · '}
            {snap.currentLabel}
            {snap.activeCount > 1 ? ` (+${snap.activeCount - 1})` : ''}
          </span>
        </div>
        <span className="text-sky-300 font-bold tabular-nums shrink-0">
          {snap.indeterminate
            ? 'CONECTANDO...'
            : hasSize
              ? `${snap.progressPct}% · ${formatMegabytes(snap.loadedBytes)} / ${formatMegabytes(snap.totalBytes)}`
              : `${formatMegabytes(snap.loadedBytes)}`}
        </span>
      </div>

      <div className="w-full h-2 rounded-full bg-slate-900/95 border border-white/15 overflow-hidden">
        <div
          className={`h-full rounded-full bg-gradient-to-r from-sky-500 via-cyan-400 to-amber-400 transition-all duration-150 shadow-[0_0_12px_rgba(56,189,248,0.75)] ${
            snap.indeterminate ? 'animate-pulse' : ''
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};
