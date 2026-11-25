/**
 * Resolve the active Dust2TriangleCollider for the current drill mode.
 * Shared so bot navmesh bake / LOS / movement never miss new GLB maps.
 */

import { DrillMode } from '../types/game';
import { Dust2TriangleCollider } from './dust2Collider';

type LevelWithCollider = { collider: Dust2TriangleCollider };

export interface GlbColliderHost {
  state: { drillMode: DrillMode };
  dust2LevelData: LevelWithCollider;
  assaultLevelData: LevelWithCollider;
  industriaLevelData: LevelWithCollider;
  hangarLevelData: LevelWithCollider;
  easternCityLevelData: LevelWithCollider;
  mirageAnubisLevelData: LevelWithCollider;
  csgoAssaultLevelData: LevelWithCollider;
  deDstLevelData: LevelWithCollider;
  mpNukedLevelData: LevelWithCollider;
  deSupplyLevelData: LevelWithCollider;
  yardV2LevelData: LevelWithCollider;
  objectD17LevelData: LevelWithCollider;
  bridgesV2LevelData: LevelWithCollider;
  hangarFsLevelData: LevelWithCollider;
  stationArenaLevelData: LevelWithCollider;
}

export function getActiveGlbCollider(
  engine: GlbColliderHost
): Dust2TriangleCollider | null {
  switch (engine.state.drillMode) {
    case 'DUST2_BOMB_5V5':
      return engine.dust2LevelData.collider;
    case 'ASSAULT_BOMB_5V5':
      return engine.assaultLevelData.collider;
    case 'INDUSTRIA_BOMB_5V5':
      return engine.industriaLevelData.collider;
    case 'HANGAR_BOMB_5V5':
      return engine.hangarLevelData.collider;
    case 'EASTERN_CITY_BOMB_5V5':
      return engine.easternCityLevelData.collider;
    case 'MIRAGE_ANUBIS_BOMB_5V5':
      return engine.mirageAnubisLevelData.collider;
    case 'CSGO_ASSAULT_BOMB_5V5':
      return engine.csgoAssaultLevelData.collider;
    case 'DE_DST_BOMB_5V5':
      return engine.deDstLevelData.collider;
    case 'MP_NUKED_BOMB_5V5':
      return engine.mpNukedLevelData.collider;
    case 'DE_SUPPLY_BOMB_5V5':
      return engine.deSupplyLevelData.collider;
    case 'YARD_V2_BOMB_5V5':
      return engine.yardV2LevelData.collider;
    case 'OBJECT_D17_BOMB_5V5':
      return engine.objectD17LevelData.collider;
    case 'BRIDGES_V2_BOMB_5V5':
      return engine.bridgesV2LevelData.collider;
    case 'HANGAR_FS_TDM_5V5':
      return engine.hangarFsLevelData.collider;
    case 'STATION_CAPTURE_5V5':
    case 'STATION_TDM_5V5':
      return engine.stationArenaLevelData.collider;
    default:
      return null;
  }
}

/** True when this mode uses a collision-baked GLB triangle navmesh. */
export function isGlbNavMeshMode(mode: DrillMode): boolean {
  return (
    mode === 'DUST2_BOMB_5V5' ||
    mode === 'ASSAULT_BOMB_5V5' ||
    mode === 'INDUSTRIA_BOMB_5V5' ||
    mode === 'HANGAR_BOMB_5V5' ||
    mode === 'EASTERN_CITY_BOMB_5V5' ||
    mode === 'MIRAGE_ANUBIS_BOMB_5V5' ||
    mode === 'CSGO_ASSAULT_BOMB_5V5' ||
    mode === 'DE_DST_BOMB_5V5' ||
    mode === 'MP_NUKED_BOMB_5V5' ||
    mode === 'DE_SUPPLY_BOMB_5V5' ||
    mode === 'YARD_V2_BOMB_5V5' ||
    mode === 'OBJECT_D17_BOMB_5V5' ||
    mode === 'BRIDGES_V2_BOMB_5V5' ||
    mode === 'HANGAR_FS_TDM_5V5' ||
    mode === 'STATION_CAPTURE_5V5' ||
    mode === 'STATION_TDM_5V5'
  );
}
