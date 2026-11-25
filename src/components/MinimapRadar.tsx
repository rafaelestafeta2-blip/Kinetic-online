import React, { useEffect, useRef } from 'react';
import { ASSAULT_BOMB_SITE_A, ASSAULT_BOMB_SITE_B } from '../three/assaultLevelBuilder';
import { DUST2_BOMB_SITE_A, DUST2_BOMB_SITE_B } from '../three/dust2LevelBuilder';
import {
  INDUSTRIA_BOMB_SITE_A,
  INDUSTRIA_BOMB_SITE_B,
} from '../three/industriaLevelBuilder';
import {
  HANGAR_BOMB_SITE_A,
  HANGAR_BOMB_SITE_B,
} from '../three/hangarLevelBuilder';
import {
  EASTERN_CITY_BOMB_SITE_A,
  EASTERN_CITY_BOMB_SITE_B,
} from '../three/easternCityLevelBuilder';
import {
  MIRAGE_ANUBIS_BOMB_SITE_A,
  MIRAGE_ANUBIS_BOMB_SITE_B,
} from '../three/mirageAnubisLevelBuilder';
import {
  V23_MAP_CONFIGS,
  isV23BombMapMode,
} from '../three/v23MapsLevelBuilder';
import {
  STATION_ARENA_VANGUARD_FLAG_BASE,
  STATION_ARENA_BLACKTHORN_FLAG_BASE,
} from '../three/stationArenaLevelBuilder';
import { YARD_BOMB_SITE_A, YARD_BOMB_SITE_B } from '../three/yardMapData';
import { DrillMode, YardBombHudInfo } from '../types/game';

interface MinimapRadarProps {
  playerX: number;
  playerZ: number;
  playerYaw: number;
  drillMode?: DrillMode;
  yardBomb?: YardBombHudInfo;
  targets?: Array<{
    id: string;
    sector: 'RANGE' | 'KILLHOUSE';
    x: number;
    z: number;
    isDown: boolean;
    isAlly?: boolean;
    isRevealed?: boolean;
  }>;
  empJammedSec?: number;
}

const YARD_RADAR_SRC = '/assets/aistudio/Yard_Map_Radar_7754e5f9.webp';

export const MinimapRadar: React.FC<MinimapRadarProps> = React.memo(
  ({ playerX, playerZ, playerYaw, drillMode, yardBomb, targets, empJammedSec = 0 }) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const radarImgRef = useRef<HTMLImageElement | null>(null);
    const yardV2RadarImgRef = useRef<HTMLImageElement | null>(null);
    const objectD17RadarImgRef = useRef<HTMLImageElement | null>(null);
    const bridgesV2RadarImgRef = useRef<HTMLImageElement | null>(null);
    const hangarFsRadarImgRef = useRef<HTMLImageElement | null>(null);

    useEffect(() => {
      const img = new Image();
      img.src = YARD_RADAR_SRC;
      img.onload = () => {
        radarImgRef.current = img;
      };
      const imgV2 = new Image();
      imgV2.src = '/assets/yard_v2_radar.webp';
      imgV2.onload = () => {
        yardV2RadarImgRef.current = imgV2;
      };
      const imgD17 = new Image();
      imgD17.src = '/assets/object_d17_radar.webp';
      imgD17.onload = () => {
        objectD17RadarImgRef.current = imgD17;
      };
      const imgB2 = new Image();
      imgB2.src = '/assets/bridges_v2_radar.webp';
      imgB2.onload = () => {
        bridgesV2RadarImgRef.current = imgB2;
      };
      const imgHfs = new Image();
      imgHfs.src = '/assets/hangar_fs_radar.webp';
      imgHfs.onload = () => {
        hangarFsRadarImgRef.current = imgHfs;
      };
    }, []);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const size = 112;
      const center = size / 2;
      const isYard = drillMode === 'YARD_BOMB_5V5';
      const isYardV2 = drillMode === 'YARD_V2_BOMB_5V5';
      const isObjectD17 = drillMode === 'OBJECT_D17_BOMB_5V5';
      const isBridgesV2 = drillMode === 'BRIDGES_V2_BOMB_5V5';
      const isHangarFs = drillMode === 'HANGAR_FS_TDM_5V5';
      const isDust2 = drillMode === 'DUST2_BOMB_5V5';
      const isAssault = drillMode === 'ASSAULT_BOMB_5V5';
      const isIndustria = drillMode === 'INDUSTRIA_BOMB_5V5';
      const isHangar = drillMode === 'HANGAR_BOMB_5V5';
      const isEasternCity = drillMode === 'EASTERN_CITY_BOMB_5V5';
      const isMirageAnubis = drillMode === 'MIRAGE_ANUBIS_BOMB_5V5';
      const isV23Map = isV23BombMapMode(drillMode);
      const isStationCapture = drillMode === 'STATION_CAPTURE_5V5';
      const isStationTdm = drillMode === 'STATION_TDM_5V5';
      const isBombMode =
        isYard ||
        isDust2 ||
        isAssault ||
        isIndustria ||
        isHangar ||
        isEasternCity ||
        isMirageAnubis ||
        (isV23Map && !isHangarFs);
      const scale = isStationCapture || isStationTdm ? 1.35 : isHangarFs ? 0.96 : isDust2 || isAssault || isIndustria || isHangar || isEasternCity || isMirageAnubis || isV23Map ? 0.88 : isYard ? 1.38 : 2.0;
      const maxRange = center - 7;

      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = isDust2 || isMirageAnubis || isYardV2 || drillMode === 'DE_DST_BOMB_5V5' ? '#1e1914' : '#121820';
      ctx.fillRect(0, 0, size, size);

      ctx.save();
      ctx.translate(center, center);

      const drawSectorRect = (wx: number, wz: number, w: number, d: number, fill: string, stroke = 'rgba(255,255,255,0.38)') => {
        const rx = (wx - playerX) * scale;
        const rz = (wz - playerZ) * scale;
        ctx.fillStyle = fill;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1.1;
        ctx.fillRect(rx - (w * scale) / 2, rz - (d * scale) / 2, w * scale, d * scale);
        ctx.strokeRect(rx - (w * scale) / 2, rz - (d * scale) / 2, w * scale, d * scale);
      };

      if (isYard && radarImgRef.current) {
        const worldW = 78 * scale;
        const worldH = 92 * scale;
        const imgCenterX = (2 - playerX) * scale;
        const imgCenterZ = (1 - playerZ) * scale;
        ctx.drawImage(
          radarImgRef.current,
          imgCenterX - worldW / 2,
          imgCenterZ - worldH / 2,
          worldW,
          worldH
        );
      } else if (isYardV2 && yardV2RadarImgRef.current) {
        const worldW = 128 * scale;
        const worldH = 148 * scale;
        const imgCenterX = (7 - playerX) * scale;
        const imgCenterZ = (9 - playerZ) * scale;
        ctx.drawImage(
          yardV2RadarImgRef.current,
          imgCenterX - worldW / 2,
          imgCenterZ - worldH / 2,
          worldW,
          worldH
        );
      } else if (isObjectD17 && objectD17RadarImgRef.current) {
        // Exact CS2 overview calibration (pos_x=-1507, pos_y=1418, scale=3.383161, 1024px, rotated +90deg)
        const worldW = 88.0 * scale;
        const worldH = 88.0 * scale;
        const imgCenterX = (-7.98 - playerX) * scale;
        const imgCenterZ = (5.72 - playerZ) * scale;
        ctx.drawImage(
          objectD17RadarImgRef.current,
          imgCenterX - worldW / 2,
          imgCenterZ - worldH / 2,
          worldW,
          worldH
        );
      } else if (isBridgesV2 && bridgesV2RadarImgRef.current) {
        // Exact CS2 overview calibration (pos_x=-1779, pos_y=3268, scale=5.382061, 1024px, rotated +90deg)
        const worldW = 140.0 * scale;
        const worldH = 140.0 * scale;
        const imgCenterX = (13.02 - playerX) * scale;
        const imgCenterZ = (24.81 - playerZ) * scale;
        ctx.drawImage(
          bridgesV2RadarImgRef.current,
          imgCenterX - worldW / 2,
          imgCenterZ - worldH / 2,
          worldW,
          worldH
        );
      } else if (isHangarFs && hangarFsRadarImgRef.current) {
        // Exact CS2 overview calibration (pos_x=-4167, pos_y=4353, scale=3.671712, 1024px, rotated +90deg)
        const worldW = 95.5 * scale;
        const worldH = 95.5 * scale;
        const imgCenterX = (62.82 - playerX) * scale;
        const imgCenterZ = (-58.09 - playerZ) * scale;
        ctx.drawImage(
          hangarFsRadarImgRef.current,
          imgCenterX - worldW / 2,
          imgCenterZ - worldH / 2,
          worldW,
          worldH
        );
      } else if (isDust2) {
        drawSectorRect(-18, 19, 56, 12, '#73604c'); // T Spawn
        drawSectorRect(22, 8, 28, 16, '#6b5845'); // Outside Long
        drawSectorRect(35, -28, 14, 52, '#7c6752'); // Long A Street
        drawSectorRect(28, -60, 22, 20, '#8a725a', 'rgba(248,113,113,0.65)'); // Site A
        drawSectorRect(2, -38, 16, 26, '#715d49'); // Short A / Catwalk
        drawSectorRect(-11, -14, 12, 54, '#665442'); // Mid Alley & Doors
        drawSectorRect(-4, -56, 26, 16, '#5c4c3b'); // CT Spawn Underpass
        drawSectorRect(-38, -26, 22, 26, '#64523f'); // Upper B Tunnels
        drawSectorRect(-22, -36, 16, 12, '#584838'); // Lower B Tunnels
        drawSectorRect(-40, -64, 24, 24, '#7d6852', 'rgba(56,189,248,0.65)'); // Site B
      } else if (isAssault) {
        drawSectorRect(-16, 40, 56, 24, '#334155');
        drawSectorRect(-40, 36, 18, 16, '#475569');
        drawSectorRect(-26, 12, 28, 22, '#3b4c63', 'rgba(248,113,113,0.55)');
        drawSectorRect(-3, 2, 24, 26, '#475973', 'rgba(56,189,248,0.55)');
        drawSectorRect(-9, -7, 16, 10, '#526682');
        drawSectorRect(14, 18, 14, 28, '#2d3b4e');
      } else if (isIndustria) {
        drawSectorRect(12, 11, 190, 186, '#283548');
        drawSectorRect(8, -28, 28, 24, '#3b4d66');
      } else if (isHangar) {
        drawSectorRect(0, 0, 77, 30, '#283548');
        drawSectorRect(-31.4, -8.5, 12.4, 15.5, '#3b4d66');
        drawSectorRect(-20.0, 4.8, 2.5, 12.3, '#475569');
        drawSectorRect(-9.0, -9.0, 14, 10, '#4c2626', 'rgba(248,113,113,0.45)');
        drawSectorRect(12.5, 7.5, 14, 10, '#233b4e', 'rgba(56,189,248,0.45)');
      } else if (isEasternCity) {
        drawSectorRect(-8.5, 4.5, 140, 128, '#283548');
        drawSectorRect(0, -20, 24, 20, '#3b4d66');
        drawSectorRect(-36, -4, 18, 16, '#4c2626', 'rgba(248,113,113,0.45)');
        drawSectorRect(28, 16, 18, 16, '#233b4e', 'rgba(56,189,248,0.45)');
      } else if (isMirageAnubis) {
        drawSectorRect(-32.5, -31.5, 110, 112, '#6c5844');
        drawSectorRect(-33, -40, 22, 18, '#826b53');
      } else if (isV23Map && drillMode && isV23BombMapMode(drillMode)) {
        const cfg = V23_MAP_CONFIGS[drillMode];
        if (drillMode === 'DE_DST_BOMB_5V5') {
          drawSectorRect(6, 0, 118, 156, '#6c5844');
          drawSectorRect(-16, -64, 34, 22, '#5a4937');
          drawSectorRect(-11, 62, 34, 22, '#5a4937');
        } else if (drillMode === 'MP_NUKED_BOMB_5V5') {
          drawSectorRect(0, -4, 108, 56, '#283548');
          drawSectorRect(-23, -2, 22, 26, '#3b4d66');
          drawSectorRect(21, -4, 22, 26, '#3b4d66');
          drawSectorRect(0, 2, 16, 22, '#334155');
        } else if (drillMode === 'CSGO_ASSAULT_BOMB_5V5') {
          drawSectorRect(0, -3, 94, 98, '#283548');
          drawSectorRect(12, 18, 42, 42, '#334155');
        } else if (drillMode === 'DE_SUPPLY_BOMB_5V5') {
          drawSectorRect(0, -5, 98, 102, '#283548');
          drawSectorRect(0, 6, 76, 36, '#334155');
        } else {
          drawSectorRect(0, 0, 110, 110, '#283548');
        }
        drawSectorRect(cfg.bombSiteA.x, cfg.bombSiteA.z, 18, 18, '#4c2626', 'rgba(248,113,113,0.55)');
        drawSectorRect(cfg.bombSiteB.x, cfg.bombSiteB.z, 18, 18, '#233b4e', 'rgba(56,189,248,0.55)');
      } else if (isStationCapture || isStationTdm) {
        drawSectorRect(0, 0, 56, 48, '#243042');
        drawSectorRect(-10, -16, 16, 12, '#12355b', 'rgba(56,189,248,0.75)');
        drawSectorRect(10, 16, 16, 12, '#4c141d', 'rgba(239,68,68,0.75)');
        drawSectorRect(0, 0, 18, 22, '#334155');
      } else {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
        for (let g = -40; g <= 40; g += 20) {
          ctx.beginPath();
          ctx.moveTo(g, -center);
          ctx.lineTo(g, center);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(-center, g);
          ctx.lineTo(center, g);
          ctx.stroke();
        }
        drawSectorRect(-6, 0, 8, 18, '#334155');
        drawSectorRect(8, -10, 12, 16, '#3e4f66');
        drawSectorRect(0, -18, 22, 6, '#293548');
      }

      // Draw Bomb Site A and B pins on minimap
      if (isBombMode) {
        const siteA =
          isV23Map && drillMode && isV23BombMapMode(drillMode)
            ? V23_MAP_CONFIGS[drillMode].bombSiteA
            : isDust2
            ? DUST2_BOMB_SITE_A
            : isAssault
              ? ASSAULT_BOMB_SITE_A
              : isIndustria
                ? INDUSTRIA_BOMB_SITE_A
                : isHangar
                  ? HANGAR_BOMB_SITE_A
                  : isEasternCity
                    ? EASTERN_CITY_BOMB_SITE_A
                  : isMirageAnubis
                    ? MIRAGE_ANUBIS_BOMB_SITE_A
                  : YARD_BOMB_SITE_A;
        const siteB =
          isV23Map && drillMode && isV23BombMapMode(drillMode)
            ? V23_MAP_CONFIGS[drillMode].bombSiteB
            : isDust2
            ? DUST2_BOMB_SITE_B
            : isAssault
              ? ASSAULT_BOMB_SITE_B
              : isIndustria
                ? INDUSTRIA_BOMB_SITE_B
                : isHangar
                  ? HANGAR_BOMB_SITE_B
                  : isEasternCity
                    ? EASTERN_CITY_BOMB_SITE_B
                  : isMirageAnubis
                    ? MIRAGE_ANUBIS_BOMB_SITE_B
                  : YARD_BOMB_SITE_B;
        const drawSitePin = (sx: number, sz: number, label: string, color: string) => {
          let rx = (sx - playerX) * scale;
          let rz = (sz - playerZ) * scale;
          const dist = Math.hypot(rx, rz);
          if (dist > maxRange) {
            const ang = Math.atan2(rz, rx);
            rx = Math.cos(ang) * maxRange;
            rz = Math.sin(ang) * maxRange;
          }
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.roundRect(rx - 5.5, rz - 5.5, 11, 11, 2.5);
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.75)';
          ctx.lineWidth = 0.9;
          ctx.stroke();
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 8px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, rx, rz + 0.5);
        };
        drawSitePin(siteA.x, siteA.z, 'A', '#dc2626');
        drawSitePin(siteB.x, siteB.z, 'B', '#0284c7');
      } else if (isStationCapture) {
        const vgFlag = yardBomb?.vanguardFlagPos || STATION_ARENA_VANGUARD_FLAG_BASE;
        const btFlag = yardBomb?.blackthornFlagPos || STATION_ARENA_BLACKTHORN_FLAG_BASE;
        const drawFlagPin = (fx: number, fz: number, color: string, status?: string) => {
          let rx = (fx - playerX) * scale;
          let rz = (fz - playerZ) * scale;
          const dist = Math.hypot(rx, rz);
          if (dist > maxRange) {
            const ang = Math.atan2(rz, rx);
            rx = Math.cos(ang) * maxRange;
            rz = Math.sin(ang) * maxRange;
          }
          if (status === 'CARRIED' || status === 'DROPPED') {
            ctx.beginPath();
            ctx.arc(rx, rz, 7.5, 0, Math.PI * 2);
            ctx.strokeStyle = status === 'DROPPED' ? '#facc15' : color;
            ctx.lineWidth = 1.4;
            ctx.stroke();
          }
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.roundRect(rx - 5.5, rz - 5.5, 11, 11, 3);
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.0;
          ctx.stroke();
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 9px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('⚑', rx, rz + 0.5);
        };
        drawFlagPin(vgFlag.x, vgFlag.z, '#0ea5e9', yardBomb?.vanguardFlagStatus);
        drawFlagPin(btFlag.x, btFlag.z, '#ef4444', yardBomb?.blackthornFlagStatus);
      }

      // Target & Ally pings (Warface / Call of Duty Fog-of-War: Enemies ONLY appear when firing or eliminating an ally! Disabled while EMP-jammed.)
      if (empJammedSec <= 0 && targets && targets.length > 0) {
        const isFreeRange = drillMode === 'FREE_RANGE';
        for (let i = 0; i < targets.length; i++) {
          const t = targets[i];
          if (t.isDown) continue;
          const canShow = Boolean(t.isAlly) || Boolean(t.isRevealed) || isFreeRange;
          if (!canShow) continue;

          const relX = (t.x - playerX) * scale;
          const relZ = (t.z - playerZ) * scale;
          const dist = Math.hypot(relX, relZ);
          let tx = relX;
          let tz = relZ;
          if (dist > maxRange) {
            const ang = Math.atan2(relZ, relX);
            tx = Math.cos(ang) * maxRange;
            tz = Math.sin(ang) * maxRange;
          }

          if (!t.isAlly && !isFreeRange) {
            // Pulsing red Warface/CoD gunfire ping ring
            ctx.beginPath();
            ctx.arc(tx, tz, 6.2, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(239, 68, 68, 0.55)';
            ctx.lineWidth = 1.4;
            ctx.stroke();
          }

          ctx.beginPath();
          ctx.arc(tx, tz, 3.4, 0, Math.PI * 2);
          ctx.fillStyle = t.isAlly ? '#38bdf8' : '#ef4444';
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.0;
          ctx.stroke();
        }
      }

      // Rotate for player vision cone & yellow directional arrow marker (matching reference image)
      ctx.rotate(-playerYaw);

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-16, -30);
      ctx.arc(0, 0, 34, -Math.PI / 2 - 0.48, -Math.PI / 2 + 0.48);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.fill();

      // Crisp yellow chevron arrow for player
      ctx.beginPath();
      ctx.moveTo(0, -7.5);
      ctx.lineTo(5.8, 5.5);
      ctx.lineTo(0, 2.5);
      ctx.lineTo(-5.8, 5.5);
      ctx.closePath();
      ctx.fillStyle = '#facc15';
      ctx.fill();
      ctx.strokeStyle = '#18181b';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.restore();
    }, [playerX, playerZ, playerYaw, drillMode, yardBomb, targets, empJammedSec]);

    const isEmpJammed = empJammedSec > 0;

    return (
      <div
        className={`relative w-24 h-24 sm:w-28 sm:h-28 rounded-xl bg-[#181614]/90 border shadow-[0_6px_20px_rgba(0,0,0,0.65)] overflow-hidden shrink-0 pointer-events-none ${
          isEmpJammed ? 'border-cyan-400/80' : 'border-white/35'
        }`}
      >
        <canvas
          ref={canvasRef}
          width={112}
          height={112}
          className={`w-full h-full block transition-opacity ${isEmpJammed ? 'opacity-25 blur-[1px]' : 'opacity-100'}`}
        />
        {isEmpJammed ? (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center bg-[#06131f]/80 px-1 text-center"
            style={{
              backgroundImage:
                'repeating-linear-gradient(0deg, rgba(56,189,248,0.16) 0px, rgba(56,189,248,0.16) 1px, transparent 1px, transparent 4px)',
            }}
          >
            <span className="text-[9px] font-black tracking-widest text-cyan-300 uppercase animate-pulse">
              EMP · SEM SINAL
            </span>
            <span className="mt-0.5 text-[10px] font-bold text-white tabular-nums">
              {Math.ceil(empJammedSec)}s
            </span>
          </div>
        ) : (
          <div className="absolute top-1 left-1/2 -translate-x-1/2 flex items-center gap-0.5 pointer-events-none">
            <span className="px-1 py-0.2 rounded bg-sky-500/90 text-[8px] font-black text-white leading-tight shadow">
              S
            </span>
          </div>
        )}
      </div>
    );
  },
  (prev, next) =>
    prev.playerX === next.playerX &&
    prev.playerZ === next.playerZ &&
    prev.playerYaw === next.playerYaw &&
    prev.drillMode === next.drillMode &&
    prev.yardBomb?.vanguardFlagStatus === next.yardBomb?.vanguardFlagStatus &&
    prev.yardBomb?.blackthornFlagStatus === next.yardBomb?.blackthornFlagStatus &&
    prev.yardBomb?.vanguardFlagPos?.x === next.yardBomb?.vanguardFlagPos?.x &&
    prev.yardBomb?.vanguardFlagPos?.z === next.yardBomb?.vanguardFlagPos?.z &&
    prev.yardBomb?.blackthornFlagPos?.x === next.yardBomb?.blackthornFlagPos?.x &&
    prev.yardBomb?.blackthornFlagPos?.z === next.yardBomb?.blackthornFlagPos?.z &&
    Math.ceil(prev.empJammedSec || 0) === Math.ceil(next.empJammedSec || 0) &&
    prev.targets === next.targets
);
