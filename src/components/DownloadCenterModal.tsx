import React, { useEffect, useMemo, useState } from 'react';
import { soundEngine } from '../audio/soundEngine';
import {
  AssetDownloadSnapshot,
  formatMegabytes,
  getAssetDownloadSnapshot,
  subscribeAssetDownloads,
} from '../utils/assetDownloadTracker';
import { hasExternalAssetCdn } from '../utils/assetUrl';
import {
  cancelAllPackDownloads,
  cancelPackDownload,
  clearAllResourcePackCache,
  deletePackFromCache,
  enqueueAllPendingPacks,
  enqueuePackDownload,
  formatSpeedLabel,
  getResourcePacksSnapshot,
  hydrateResourcePacksFromCache,
  ResourcePackCategory,
  ResourcePacksSnapshot,
  subscribeResourcePacks,
} from '../utils/resourcePackManager';
import { thumbForDrillMode } from './mapSelectThumbs';

interface DownloadCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type CategoryFilter = 'ALL' | ResourcePackCategory;

const CATEGORY_TABS: Array<{ id: CategoryFilter; label: string }> = [
  { id: 'ALL', label: 'Todos' },
  { id: 'MAPS', label: 'Mapas' },
  { id: 'OPERATORS', label: 'Operadores' },
  { id: 'WEAPONS', label: 'Armas' },
  { id: 'ACCESSORIES', label: 'Acessórios' },
];

const CATEGORY_LABELS: Record<ResourcePackCategory, string> = {
  MAPS: 'Mapa',
  OPERATORS: 'Operadores',
  WEAPONS: 'Armas',
  ACCESSORIES: 'Acessórios',
};

const CategoryIcon: React.FC<{ category: ResourcePackCategory }> = ({ category }) => {
  if (category === 'MAPS') {
    return (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M9 18l-6 3V6l6-3 6 3 6-3v15l-6 3-6-3z" />
        <path d="M9 3v15M15 6v15" />
      </svg>
    );
  }
  if (category === 'OPERATORS') {
    return (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="8" r="4" />
        <path d="M5 20a7 7 0 0114 0" />
      </svg>
    );
  }
  if (category === 'WEAPONS') {
    return (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M3 10h14l4-2v4l-4 1h-3l-1 5h-3l1-5H7l-2 3H3v-6z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="2" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </svg>
  );
};

export const DownloadCenterModal: React.FC<DownloadCenterModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [packSnap, setPackSnap] = useState<ResourcePacksSnapshot>(() =>
    getResourcePacksSnapshot()
  );
  const [liveAssetSnap, setLiveAssetSnap] = useState<AssetDownloadSnapshot>(() =>
    getAssetDownloadSnapshot()
  );
  const [filter, setFilter] = useState<CategoryFilter>('ALL');
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  useEffect(() => {
    const unsubPacks = subscribeResourcePacks(setPackSnap);
    const unsubLive = subscribeAssetDownloads(setLiveAssetSnap);
    return () => {
      unsubPacks();
      unsubLive();
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      setConfirmClearAll(false);
      void hydrateResourcePacksFromCache();
    }
  }, [isOpen]);

  const filteredPacks = useMemo(() => {
    if (filter === 'ALL') return packSnap.packs;
    return packSnap.packs.filter((p) => p.category === filter);
  }, [packSnap.packs, filter]);

  if (!isOpen) return null;

  const overallPct =
    packSnap.totalBytesAll > 0
      ? Math.min(100, Math.round((packSnap.cachedBytesAll / packSnap.totalBytesAll) * 100))
      : 0;
  const remainingBytes = Math.max(0, packSnap.totalBytesAll - packSnap.cachedBytesAll);
  const hasPendingPacks = packSnap.downloadedPackCount < packSnap.totalPackCount;
  const isDownloadingOrQueued =
    packSnap.isAnyDownloading || packSnap.queuedPackIds.length > 0;
  const speedText = formatSpeedLabel(packSnap.activeSpeedBytesPerSec);
  const isCdn = hasExternalAssetCdn();

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 select-none pointer-events-auto font-sans"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[980px] h-[92dvh] max-h-[620px] rounded-2xl border border-white/15 bg-[#0a0f18] text-slate-100 shadow-[0_24px_80px_rgba(0,0,0,0.92)] overflow-hidden flex flex-col"
      >
        {/* TOP HEADER */}
        <header className="px-4 sm:px-5 py-3 bg-[#0e1522] border-b border-white/10 flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h2 className="font-display font-bold text-base sm:text-lg text-white tracking-tight truncate">
              Central de Downloads
            </h2>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-400 font-mono tabular-nums mt-0.5">
              <span>
                {formatMegabytes(packSnap.cachedBytesAll)} / {formatMegabytes(packSnap.totalBytesAll)}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {packSnap.downloadedPackCount} de {packSnap.totalPackCount} pacotes instalados
              </span>
              <span aria-hidden="true">·</span>
              <span>{isCdn ? 'Servidor R2 CDN' : 'Armazenamento local'}</span>
              {speedText && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-sky-300 font-semibold">{speedText}</span>
                </>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              soundEngine.playMenuSelect();
              onClose();
            }}
            aria-label="Fechar Central de Downloads"
            className="min-w-[44px] min-h-[44px] px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-slate-200 hover:text-white text-xs font-semibold cursor-pointer transition-colors shrink-0 whitespace-nowrap"
          >
            Fechar ✕
          </button>
        </header>

        {/* STORAGE SUMMARY + BATCH CONTROLS */}
        <div className="px-4 sm:px-5 py-3 bg-[#0c121d] border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-slate-300 font-medium">
                {remainingBytes > 0
                  ? `Faltam ${formatMegabytes(remainingBytes)} para baixar o pacote completo`
                  : 'Todos os recursos 3D estão salvos no aparelho'}
              </span>
              <span className="font-mono font-bold text-white tabular-nums ml-2 shrink-0">
                {overallPct}%
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-900 border border-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-sky-500 to-amber-400 transition-all duration-200"
                style={{ width: `${overallPct}%` }}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isDownloadingOrQueued ? (
              <button
                type="button"
                onClick={() => {
                  soundEngine.playMenuSelect();
                  cancelAllPackDownloads();
                }}
                className="min-h-[44px] px-4 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-400/45 text-red-200 text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap"
              >
                Pausar fila
              </button>
            ) : (
              hasPendingPacks && (
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playMenuSelect();
                    enqueueAllPendingPacks();
                  }}
                  className="min-h-[44px] px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold cursor-pointer transition-colors whitespace-nowrap"
                >
                  Baixar tudo ({formatMegabytes(remainingBytes)})
                </button>
              )
            )}

            {packSnap.cachedBytesAll > 0 && (
              <button
                type="button"
                onClick={() => {
                  soundEngine.playMenuSelect();
                  if (!confirmClearAll) {
                    setConfirmClearAll(true);
                    return;
                  }
                  setConfirmClearAll(false);
                  void clearAllResourcePackCache();
                }}
                className={`min-h-[44px] px-3.5 rounded-xl border text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap ${
                  confirmClearAll
                    ? 'bg-red-600 hover:bg-red-500 border-red-400 text-white'
                    : 'bg-white/[0.04] hover:bg-white/[0.09] border-white/10 text-slate-300'
                }`}
              >
                {confirmClearAll ? 'Confirmar limpeza' : 'Limpar cache'}
              </button>
            )}
          </div>
        </div>

        {/* CATEGORY FILTER TABS */}
        <div className="px-4 sm:px-5 py-2.5 bg-[#0a0f18] border-b border-white/[0.07] flex items-center justify-between gap-3 shrink-0 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/[0.08]">
            {CATEGORY_TABS.map((tab) => {
              const active = filter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    soundEngine.playMenuSelect();
                    setFilter(tab.id);
                  }}
                  className={`min-h-[36px] px-3.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-white text-slate-950 shadow-sm'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <span className="hidden md:inline text-xs text-slate-400 whitespace-nowrap shrink-0">
            Mapas e armas baixados abrem instantaneamente na partida
          </span>
        </div>

        {/* PACK LIST */}
        <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-white/[0.07] px-4 sm:px-5">
          {filteredPacks.map((pack) => {
            const thumb = pack.mapMode ? thumbForDrillMode(pack.mapMode) : null;
            const isDownloading = pack.status === 'DOWNLOADING';
            const isQueued = pack.status === 'QUEUED';
            const isDownloaded = pack.status === 'DOWNLOADED';
            const isPartial = pack.status === 'PARTIAL';
            const isError = pack.status === 'ERROR';

            return (
              <div
                key={pack.id}
                className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                {/* Left thumbnail / icon + metadata */}
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  <div className="w-16 h-11 sm:w-20 sm:h-12 rounded-lg overflow-hidden bg-slate-900 border border-white/10 flex items-center justify-center text-slate-300 shrink-0">
                    {thumb ? (
                      <img
                        src={thumb}
                        alt={pack.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <CategoryIcon category={pack.category} />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 min-w-0">
                      <h3 className="font-display font-semibold text-sm text-white truncate">
                        {pack.title}
                      </h3>
                      {pack.recommended && (
                        <span className="text-[11px] font-medium text-amber-300 shrink-0">
                          Recomendado
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-400 truncate mt-0.5">
                      {pack.subtitle}
                    </p>

                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-mono tabular-nums text-slate-400 mt-1">
                      <span>{CATEGORY_LABELS[pack.category]}</span>
                      <span aria-hidden="true">·</span>
                      <span>{formatMegabytes(pack.totalBytes)}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {pack.totalFileCount}{' '}
                        {pack.totalFileCount === 1 ? 'arquivo' : 'arquivos'}
                      </span>
                      <span aria-hidden="true">·</span>
                      {isDownloaded && (
                        <span className="text-emerald-400 font-semibold">Instalado</span>
                      )}
                      {isDownloading && (
                        <span className="text-sky-300 font-semibold">
                          Baixando {pack.progressPct}% ({formatMegabytes(pack.cachedBytes)} /{' '}
                          {formatMegabytes(pack.totalBytes)})
                          {pack.speedBytesPerSec > 0
                            ? ` · ${formatSpeedLabel(pack.speedBytesPerSec)}`
                            : ''}
                        </span>
                      )}
                      {isQueued && (
                        <span className="text-amber-300 font-semibold">Na fila</span>
                      )}
                      {isPartial && (
                        <span className="text-amber-200">
                          Parcial ({pack.cachedFileCount}/{pack.totalFileCount})
                        </span>
                      )}
                      {isError && (
                        <span className="text-red-400">
                          Erro: {pack.errorMessage || 'Falha de rede'}
                        </span>
                      )}
                      {pack.status === 'NOT_DOWNLOADED' && (
                        <span className="text-slate-400">Disponível na nuvem</span>
                      )}
                    </div>

                    {(isDownloading || isPartial || isQueued) && (
                      <div className="w-full max-w-md h-1.5 rounded-full bg-slate-900 border border-white/10 overflow-hidden mt-2">
                        <div
                          className={`h-full rounded-full transition-all duration-150 ${
                            isDownloading
                              ? 'bg-gradient-to-r from-sky-400 to-amber-400'
                              : 'bg-amber-500/70'
                          }`}
                          style={{ width: `${Math.max(2, pack.progressPct)}%` }}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Right actions (>= 44px touch targets) */}
                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  {isDownloading || isQueued ? (
                    <button
                      type="button"
                      onClick={() => {
                        soundEngine.playMenuSelect();
                        cancelPackDownload(pack.id);
                      }}
                      className="min-h-[44px] px-4 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-400/45 text-red-200 text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap"
                    >
                      Cancelar
                    </button>
                  ) : isDownloaded ? (
                    <button
                      type="button"
                      onClick={() => {
                        soundEngine.playMenuSelect();
                        void deletePackFromCache(pack.id);
                      }}
                      title="Remover pacote do armazenamento para liberar espaço"
                      className="min-h-[44px] px-3.5 rounded-xl bg-white/[0.04] hover:bg-red-500/20 border border-white/10 hover:border-red-400/45 text-slate-300 hover:text-red-200 text-xs font-semibold cursor-pointer transition-colors flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.9"
                      >
                        <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
                      </svg>
                      <span>Apagar</span>
                    </button>
                  ) : (
                    <>
                      {isPartial && (
                        <button
                          type="button"
                          onClick={() => {
                            soundEngine.playMenuSelect();
                            void deletePackFromCache(pack.id);
                          }}
                          aria-label={`Apagar arquivos parciais de ${pack.title}`}
                          className="min-w-[44px] min-h-[44px] rounded-xl bg-white/[0.04] hover:bg-red-500/20 border border-white/10 text-slate-300 hover:text-red-200 flex items-center justify-center cursor-pointer transition-colors"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.9"
                          >
                            <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
                          </svg>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          soundEngine.playMenuSelect();
                          enqueuePackDownload(pack.id);
                        }}
                        className="min-h-[44px] px-4 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/50 text-sky-200 text-xs font-bold cursor-pointer transition-colors flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.1"
                        >
                          <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 19h16" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span>{isPartial ? 'Continuar' : isError ? 'Tentar de novo' : 'Baixar'}</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* LIVE ON-DEMAND STREAMING FOOTER (only when an asset is actively downloading right now) */}
        {liveAssetSnap.activeCount > 0 && (
          <footer className="px-4 sm:px-5 py-2.5 bg-[#0e1522] border-t border-white/10 flex items-center justify-between gap-3 shrink-0">
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2 text-xs font-mono tabular-nums">
                <span className="text-slate-200 truncate">
                  Transferindo agora: {liveAssetSnap.currentLabel}
                  {liveAssetSnap.activeCount > 1
                    ? ` (+${liveAssetSnap.activeCount - 1})`
                    : ''}
                </span>
                <span className="text-sky-300 font-semibold shrink-0">
                  {liveAssetSnap.indeterminate
                    ? 'Conectando...'
                    : liveAssetSnap.totalBytes > 0
                      ? `${liveAssetSnap.progressPct}% · ${formatMegabytes(liveAssetSnap.loadedBytes)} / ${formatMegabytes(liveAssetSnap.totalBytes)}`
                      : formatMegabytes(liveAssetSnap.loadedBytes)}
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-slate-900 overflow-hidden mt-1.5">
                <div
                  className="h-full rounded-full bg-sky-400 transition-all duration-150"
                  style={{
                    width: `${liveAssetSnap.indeterminate ? 25 : Math.max(4, liveAssetSnap.progressPct)}%`,
                  }}
                />
              </div>
            </div>
          </footer>
        )}
      </div>
    </div>
  );
};
