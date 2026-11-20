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
    <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[60] pointer-events-none w-[86vw] max-w-sm px-3 py-1.5 rounded-lg bg-[#070a10]/90 border border-sky-400/40 shadow-[0_8px_24px_rgba(0,0,0,0.75)] backdrop-blur-md">
      <div className="flex items-center justify-between gap-2 text-[10px] font-mono mb-1">
        <span className="font-display font-bold text-slate-100 truncate">
          {isCdn ? 'Baixando CDN · ' : 'Carregando · '}
          {snap.currentLabel}
          {snap.activeCount > 1 ? ` (+${snap.activeCount - 1})` : ''}
        </span>
        <span className="text-sky-300 font-semibold tabular-nums shrink-0">
          {snap.indeterminate
            ? 'Conectando...'
            : hasSize
              ? `${snap.progressPct}% · ${formatMegabytes(snap.loadedBytes)} / ${formatMegabytes(snap.totalBytes)}`
              : `${formatMegabytes(snap.loadedBytes)}`}
        </span>
      </div>

      <div className="w-full h-1.5 rounded-full bg-slate-900 border border-white/10 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-sky-500 to-amber-400 transition-all duration-150"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};
