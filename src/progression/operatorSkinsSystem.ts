import * as THREE from 'three';
import { WarfaceClassId } from '../components/WarfaceClassIcons';
import { CharacterAvatarKind } from '../three/botCharacterSystem';

export type OperatorRarity = 'PADRAO' | 'ESPECIAL' | 'ELITE' | 'LENDARIO';

export interface OperatorDefinition {
  id: string;
  name: string;
  codename: string;
  faction: 'VANGUARD' | 'BLACKWOOD' | 'PHANTOM' | 'AURUM';
  rarity: OperatorRarity;
  preferredClass: WarfaceClassId;
  avatarKindOverride?: CharacterAvatarKind;
  description: string;
  perkLabel: string;
  diamondPrice: number;
  swatchColors: [string, string, string];
  suitVisual: {
    armorColorHex: number;
    clothColorHex: number;
    trimEmissiveHex: number;
    emissiveIntensity: number;
    roughnessDelta: number;
    metalnessDelta: number;
  } | null;
}

export const OPERATOR_CATALOG: OperatorDefinition[] = [
  {
    id: 'op_vanguard_default',
    name: 'OPERADOR VANGUARD PADRÃO',
    codename: 'VANGUARD-01',
    faction: 'VANGUARD',
    rarity: 'PADRAO',
    preferredClass: 'FUZILEIRO',
    description:
      'Uniforme operacional padrão da coalizão Vanguard adaptado automaticamente à sua classe tática ativa.',
    perkLabel: 'Traje Oficial da Classe Ativa',
    diamondPrice: 0,
    swatchColors: ['#334155', '#475569', '#ef4444'],
    suitVisual: null,
  },
  {
    id: 'op_blackwood_spectre',
    name: 'SPECTRE BLACKWOOD',
    codename: 'SPECTRE-X9',
    faction: 'BLACKWOOD',
    rarity: 'ELITE',
    preferredClass: 'FUZILEIRO',
    avatarKindOverride: 'VANGUARD_FUZILEIRO',
    description:
      'Operador de infiltração noturna da divisão secreta Blackwood com blindagem em polímero obsidiana e detalhes carmesim.',
    perkLabel: 'Divisão Blackwood · Blindagem Obsidiana & Carmesim',
    diamondPrice: 650,
    swatchColors: ['#18181b', '#dc2626', '#7f1d1d'],
    suitVisual: {
      armorColorHex: 0x26262b,
      clothColorHex: 0x3b1219,
      trimEmissiveHex: 0xdc2626,
      emissiveIntensity: 0.14,
      roughnessDelta: -0.12,
      metalnessDelta: 0.22,
    },
  },
  {
    id: 'op_ghost_arctic',
    name: 'PHANTOM DIVISÃO ÁRTICA',
    codename: 'GHOST-ZERO',
    faction: 'PHANTOM',
    rarity: 'ELITE',
    preferredClass: 'FRANCO_ATIRADOR',
    avatarKindOverride: 'SNIPER',
    description:
      'Especialista de reconhecimento alpino equipado com traje térmico branco-glacial e placas balísticas em titânio.',
    perkLabel: 'Forças Alpinas · Camuflagem Invernal & Titânio',
    diamondPrice: 620,
    swatchColors: ['#f8fafc', '#93c5fd', '#334155'],
    suitVisual: {
      armorColorHex: 0xdbeafe,
      clothColorHex: 0xcbd5e1,
      trimEmissiveHex: 0x38bdf8,
      emissiveIntensity: 0.12,
      roughnessDelta: -0.08,
      metalnessDelta: 0.18,
    },
  },
  {
    id: 'op_aurum_commander',
    name: 'COMANDANTE IMPERIAL AURUM',
    codename: 'AURUM-24K',
    faction: 'AURUM',
    rarity: 'LENDARIO',
    preferredClass: 'ENGENHEIRO',
    avatarKindOverride: 'VANGUARD_ENGENHEIRO',
    description:
      'Traje de comando supremo revestido em malha de carbono aeroespacial com placas anodizadas em Ouro Imperial 24K.',
    perkLabel: 'Edição Lendária · Carbono & Ouro Imperial 24K',
    diamondPrice: 950,
    swatchColors: ['#facc15', '#18181b', '#ca8a04'],
    suitVisual: {
      armorColorHex: 0xeab308,
      clothColorHex: 0x27241d,
      trimEmissiveHex: 0xfacc15,
      emissiveIntensity: 0.18,
      roughnessDelta: -0.22,
      metalnessDelta: 0.42,
    },
  },
  {
    id: 'op_cobalt_strike',
    name: 'KINETIC COBALTO CYBER',
    codename: 'COBALT-V7',
    faction: 'PHANTOM',
    rarity: 'ESPECIAL',
    preferredClass: 'MEDICO',
    avatarKindOverride: 'VANGUARD_MEDICO',
    description:
      'Operador de resposta rápida urbana com colete balístico em liga azul-cobalto e sensores táticos integrados.',
    perkLabel: 'Divisão Cyber · Liga Azul-Cobalto Anodizada',
    diamondPrice: 480,
    swatchColors: ['#0284c7', '#38bdf8', '#0f172a'],
    suitVisual: {
      armorColorHex: 0x1d4ed8,
      clothColorHex: 0x1e293b,
      trimEmissiveHex: 0x0ea5e9,
      emissiveIntensity: 0.14,
      roughnessDelta: -0.14,
      metalnessDelta: 0.26,
    },
  },
  {
    id: 'op_viper_recon',
    name: 'VÍBORA RECON ESMERALDA',
    codename: 'VIPER-S4',
    faction: 'BLACKWOOD',
    rarity: 'ESPECIAL',
    preferredClass: 'FUZILEIRO',
    avatarKindOverride: 'DEFAULT',
    description:
      'Operador de operações especiais em selva e incursões noturnas com blindagem verde-esmeralda e grafite.',
    perkLabel: 'Operações Noturnas · Blindagem Esmeralda & Ônix',
    diamondPrice: 460,
    swatchColors: ['#10b981', '#064e3b', '#18181b'],
    suitVisual: {
      armorColorHex: 0x059669,
      clothColorHex: 0x132a20,
      trimEmissiveHex: 0x10b981,
      emissiveIntensity: 0.13,
      roughnessDelta: -0.1,
      metalnessDelta: 0.2,
    },
  },
];

const OPERATOR_MAP = new Map<string, OperatorDefinition>(
  OPERATOR_CATALOG.map((op) => [op.id, op])
);

export function getOperatorDefinition(operatorId?: string | null): OperatorDefinition {
  if (operatorId && OPERATOR_MAP.has(operatorId)) {
    return OPERATOR_MAP.get(operatorId)!;
  }
  return OPERATOR_CATALOG[0];
}

export interface OperatorOwnershipState {
  activeOperatorId: string;
  unlockedOperatorIds: string[];
}

const OPERATOR_STORAGE_KEY = 'kinetic_operators_state_v1';

function sanitizeOperatorList(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : [];
  const valid = list.filter(
    (id): id is string => typeof id === 'string' && OPERATOR_MAP.has(id)
  );
  return Array.from(new Set(['op_vanguard_default', ...valid]));
}

function loadOperatorState(): OperatorOwnershipState {
  try {
    const raw = localStorage.getItem(OPERATOR_STORAGE_KEY);
    if (!raw) {
      return {
        activeOperatorId: 'op_vanguard_default',
        unlockedOperatorIds: ['op_vanguard_default'],
      };
    }
    const parsed = JSON.parse(raw) as Partial<OperatorOwnershipState>;
    const unlocked = sanitizeOperatorList(parsed.unlockedOperatorIds);
    const active =
      typeof parsed.activeOperatorId === 'string' &&
      unlocked.includes(parsed.activeOperatorId)
        ? parsed.activeOperatorId
        : 'op_vanguard_default';
    return {
      activeOperatorId: active,
      unlockedOperatorIds: unlocked,
    };
  } catch {
    return {
      activeOperatorId: 'op_vanguard_default',
      unlockedOperatorIds: ['op_vanguard_default'],
    };
  }
}

let currentOpState: OperatorOwnershipState = loadOperatorState();
const opListeners = new Set<(state: OperatorOwnershipState) => void>();
let cloudOperatorHook: ((state: OperatorOwnershipState) => void) | null = null;
let isApplyingRemoteOperator = false;

function persistOperatorState(): void {
  try {
    localStorage.setItem(OPERATOR_STORAGE_KEY, JSON.stringify(currentOpState));
  } catch {
    // Ignore storage quota errors
  }
}

function emitOperatorState(pushToCloud = false): void {
  const snap: OperatorOwnershipState = {
    activeOperatorId: currentOpState.activeOperatorId,
    unlockedOperatorIds: [...currentOpState.unlockedOperatorIds],
  };
  opListeners.forEach((fn) => fn(snap));
  if (pushToCloud && !isApplyingRemoteOperator && cloudOperatorHook) {
    cloudOperatorHook(snap);
  }
}

export function registerCloudOperatorHook(
  hook: (state: OperatorOwnershipState) => void
): void {
  cloudOperatorHook = hook;
}

export function getOperatorOwnershipState(): OperatorOwnershipState {
  return {
    activeOperatorId: currentOpState.activeOperatorId,
    unlockedOperatorIds: [...currentOpState.unlockedOperatorIds],
  };
}

export function subscribeOperatorOwnership(
  listener: (state: OperatorOwnershipState) => void
): () => void {
  opListeners.add(listener);
  listener(getOperatorOwnershipState());
  return () => {
    opListeners.delete(listener);
  };
}

export function isOperatorUnlocked(operatorId: string): boolean {
  if (operatorId === 'op_vanguard_default') return true;
  return currentOpState.unlockedOperatorIds.includes(operatorId);
}

export function equipOperatorSkin(operatorId: string): boolean {
  if (!OPERATOR_MAP.has(operatorId)) return false;
  if (!isOperatorUnlocked(operatorId)) return false;
  currentOpState = {
    ...currentOpState,
    activeOperatorId: operatorId,
  };
  persistOperatorState();
  emitOperatorState(true);
  return true;
}

export function grantOperatorSkin(operatorId: string, autoEquip = true): void {
  if (!OPERATOR_MAP.has(operatorId)) return;
  const unlocked = Array.from(
    new Set([...currentOpState.unlockedOperatorIds, operatorId])
  );
  currentOpState = {
    activeOperatorId: autoEquip ? operatorId : currentOpState.activeOperatorId,
    unlockedOperatorIds: unlocked,
  };
  persistOperatorState();
  emitOperatorState(true);
}

export function applyCloudOperatorSnapshot(remote: {
  activeOperatorId?: string;
  unlockedOperators?: string[];
} | null | undefined): OperatorOwnershipState {
  if (!remote) return getOperatorOwnershipState();
  const mergedUnlocked = sanitizeOperatorList([
    ...currentOpState.unlockedOperatorIds,
    ...(remote.unlockedOperators || []),
  ]);
  const nextActive =
    remote.activeOperatorId && mergedUnlocked.includes(remote.activeOperatorId)
      ? remote.activeOperatorId
      : currentOpState.activeOperatorId;
  isApplyingRemoteOperator = true;
  try {
    currentOpState = {
      activeOperatorId: nextActive,
      unlockedOperatorIds: mergedUnlocked,
    };
    persistOperatorState();
    emitOperatorState(false);
  } finally {
    isApplyingRemoteOperator = false;
  }
  return getOperatorOwnershipState();
}

interface SavedCharMatOrig {
  colorHex: number;
  emissiveHex: number;
  emissiveIntensity: number;
  roughness: number;
  metalness: number;
}

/**
 * Applies the selected operator's tactical armor/uniform palette to a 3D character root
 * without mutating shared template materials.
 */
export function applyOperatorSuitToCharacter3D(
  root: THREE.Object3D | null | undefined,
  operatorId?: string | null
): void {
  if (!root) return;
  const op = getOperatorDefinition(operatorId);

  let meshIdx = 0;
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    // Do not tint attached 3P weapon prop
    if (mesh.userData?.isWeaponProp || child.parent?.userData?.isWeaponProp) return;

    const rawMats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const nextMats = rawMats.map((raw) => {
      const std = raw as THREE.MeshStandardMaterial;
      if (!std || !('color' in std)) return raw;

      let own = std;
      if (!std.userData?.__opSuitCloned) {
        own = std.clone();
        own.userData = {
          ...(std.userData || {}),
          __opSuitCloned: true,
          __opOrig: {
            colorHex: std.color ? std.color.getHex() : 0xffffff,
            emissiveHex: std.emissive ? std.emissive.getHex() : 0x000000,
            emissiveIntensity:
              typeof std.emissiveIntensity === 'number' ? std.emissiveIntensity : 0,
            roughness: typeof std.roughness === 'number' ? std.roughness : 0.65,
            metalness: typeof std.metalness === 'number' ? std.metalness : 0.15,
          } satisfies SavedCharMatOrig,
        };
      }

      const orig = own.userData.__opOrig as SavedCharMatOrig | undefined;
      if (!orig) return own;

      if (!op.suitVisual) {
        own.color.setHex(orig.colorHex);
        if (own.emissive) own.emissive.setHex(orig.emissiveHex);
        own.emissiveIntensity = orig.emissiveIntensity;
        own.roughness = orig.roughness;
        own.metalness = orig.metalness;
        own.needsUpdate = true;
        return own;
      }

      const matName = (own.name || '').toLowerCase();
      const isSkinOrFace =
        matName.includes('skin') ||
        matName.includes('head') ||
        matName.includes('face') ||
        matName.includes('eye') ||
        matName.includes('hair');

      if (isSkinOrFace) {
        own.color.setHex(orig.colorHex);
        own.needsUpdate = true;
        return own;
      }

      const isArmorPlate =
        meshIdx % 2 === 0 ||
        matName.includes('armor') ||
        matName.includes('vest') ||
        matName.includes('helmet') ||
        matName.includes('gear');

      const baseColor = new THREE.Color(orig.colorHex);
      const targetTint = new THREE.Color(
        isArmorPlate ? op.suitVisual.armorColorHex : op.suitVisual.clothColorHex
      );
      baseColor.lerp(targetTint, 0.58);
      own.color.copy(baseColor);

      if (own.emissive) {
        own.emissive.setHex(op.suitVisual.trimEmissiveHex);
        own.emissiveIntensity = op.suitVisual.emissiveIntensity;
      }
      own.roughness = Math.max(
        0.18,
        Math.min(0.92, orig.roughness + op.suitVisual.roughnessDelta)
      );
      own.metalness = Math.max(
        0.05,
        Math.min(0.9, orig.metalness + op.suitVisual.metalnessDelta)
      );
      own.needsUpdate = true;
      return own;
    });

    mesh.material = Array.isArray(mesh.material) ? nextMats : nextMats[0];
    meshIdx++;
  });
}
