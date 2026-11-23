import * as THREE from 'three';
import { WarfaceClassId } from '../components/WarfaceClassIcons';
import { CharacterAvatarKind } from '../three/botCharacterSystem';

export type OperatorRarity = 'PADRAO' | 'ESPECIAL' | 'ELITE' | 'LENDARIO';

export interface FemaleOperatorModelConfig {
  glbPath: string;
  camoCode: string;
  gloveVariant: 'a' | 'b' | 'c' | 'd';
  gender: 'FEMALE';
  silhouetteLabel: string;
  hairColorHex?: number;
}

export interface OperatorDefinition {
  id: string;
  name: string;
  codename: string;
  faction: 'VANGUARD' | 'BLACKWOOD' | 'PHANTOM' | 'AURUM';
  rarity: OperatorRarity;
  preferredClass: WarfaceClassId;
  avatarKindOverride?: CharacterAvatarKind;
  customModelConfig?: FemaleOperatorModelConfig;
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
  // =========================================================================
  // DIVISÃO FEMININA — 16 OPERADORAS TÁTICAS (4 POR CLASSE · LOJA DIAMANTES)
  // =========================================================================
  // --- FUZILEIRO (4 SKINS) ---
  {
    id: 'op_fem_fuz_valkyrie',
    name: 'VALKYRIE BLACK OPS',
    codename: 'VALKYRIE-01',
    faction: 'BLACKWOOD',
    rarity: 'LENDARIO',
    preferredClass: 'FUZILEIRO',
    customModelConfig: {
      glbPath: '/models/characters/female_ops/fuz_heavy.glb',
      camoCode: 'd',
      gloveVariant: 'b',
      gender: 'FEMALE',
      silhouetteLabel: 'Assalto Pesado · Capacete Tático & Balaclava',
      hairColorHex: 0x18181b,
    },
    description:
      'Operadora de assalto pesado em traje furtivo Black Ops, colete balístico reforçado e capacete com fone tático.',
    perkLabel: 'Fuzileiro Feminino · Assalto Pesado Black Ops',
    diamondPrice: 850,
    swatchColors: ['#1c1e24', '#3f4552', '#f59e0b'],
    suitVisual: null,
  },
  {
    id: 'op_fem_fuz_artemis',
    name: 'ÁRTEMIS MULTICAM',
    codename: 'ARTEMIS-02',
    faction: 'VANGUARD',
    rarity: 'ELITE',
    preferredClass: 'FUZILEIRO',
    customModelConfig: {
      glbPath: '/models/characters/female_ops/fuz_heavy.glb',
      camoCode: 'a',
      gloveVariant: 'a',
      gender: 'FEMALE',
      silhouetteLabel: 'Assalto Pesado · Capacete Tático & Colete Plate',
      hairColorHex: 0x3b2618,
    },
    description:
      'Especialista de linha de frente equipada com camuflagem MultiCam oficial de combate e rig modular de carregadores.',
    perkLabel: 'Fuzileiro Feminino · Camuflagem MultiCam Padrão',
    diamondPrice: 680,
    swatchColors: ['#6e684f', '#4e523a', '#a19675'],
    suitVisual: null,
  },
  {
    id: 'op_fem_fuz_athena',
    name: 'ATHENA FLORESTA',
    codename: 'ATHENA-03',
    faction: 'VANGUARD',
    rarity: 'ESPECIAL',
    preferredClass: 'FUZILEIRO',
    customModelConfig: {
      glbPath: '/models/characters/female_ops/fuz_vanguard.glb',
      camoCode: 'b',
      gloveVariant: 'c',
      gender: 'FEMALE',
      silhouetteLabel: 'Vanguarda · Capacete Ops-Core & Óculos Táticos',
      hairColorHex: 0x4a2e1b,
    },
    description:
      'Fuzileira de incursão florestal com padrão Woodland tático, óculos balísticos e proteção de joelhos reforçada.',
    perkLabel: 'Fuzileiro Feminino · Padrão Florestal Woodland',
    diamondPrice: 540,
    swatchColors: ['#3f4f34', '#2b3824', '#6b7556'],
    suitVisual: null,
  },
  {
    id: 'op_fem_fuz_freya',
    name: 'FREYA DESERTO',
    codename: 'FREYA-04',
    faction: 'AURUM',
    rarity: 'ESPECIAL',
    preferredClass: 'FUZILEIRO',
    customModelConfig: {
      glbPath: '/models/characters/female_ops/fuz_vanguard.glb',
      camoCode: 'i',
      gloveVariant: 'd',
      gender: 'FEMALE',
      silhouetteLabel: 'Vanguarda · Capacete Ops-Core & Equipamento Árido',
      hairColorHex: 0x9c7b52,
    },
    description:
      'Operadora de assalto desértico com uniforme Tan/Areia de alta respirabilidade para combate em zonas áridas.',
    perkLabel: 'Fuzileiro Feminino · Operações em Zona Árida',
    diamondPrice: 520,
    swatchColors: ['#b59c78', '#7d684a', '#d8c5a3'],
    suitVisual: null,
  },

  // --- ENGENHEIRO (4 SKINS) ---
  {
    id: 'op_fem_eng_nova',
    name: 'NOVA CYBER NAVY',
    codename: 'NOVA-05',
    faction: 'PHANTOM',
    rarity: 'LENDARIO',
    preferredClass: 'ENGENHEIRO',
    customModelConfig: {
      glbPath: '/models/characters/female_ops/eng_breacher.glb',
      camoCode: 'q',
      gloveVariant: 'b',
      gender: 'FEMALE',
      silhouetteLabel: 'Breacher C4 · Óculos Táticos & Rig de Explosivos',
      hairColorHex: 0x1e293b,
    },
    description:
      'Engenheira de demolição e contramedidas eletrônicas com traje azul-marinho tático, visor balístico e cinturão C4.',
    perkLabel: 'Engenheiro Feminino · Divisão Cyber Navy C4',
    diamondPrice: 840,
    swatchColors: ['#1e3a5f', '#38bdf8', '#0f172a'],
    suitVisual: null,
  },
  {
    id: 'op_fem_eng_spark',
    name: 'SPARK URBANA',
    codename: 'SPARK-06',
    faction: 'BLACKWOOD',
    rarity: 'ELITE',
    preferredClass: 'ENGENHEIRO',
    customModelConfig: {
      glbPath: '/models/characters/female_ops/eng_breacher.glb',
      camoCode: 'p',
      gloveVariant: 'c',
      gender: 'FEMALE',
      silhouetteLabel: 'Breacher C4 · Visor Balístico & Colete Urbano',
      hairColorHex: 0x2c1f1a,
    },
    description:
      'Especialista em invasão CQB e desarme sob fogo, equipada com padrão cinza-urbano digital e bolsas de ferramentas.',
    perkLabel: 'Engenheiro Feminino · Invasão Urbana Digital',
    diamondPrice: 640,
    swatchColors: ['#525866', '#2e333d', '#94a3b8'],
    suitVisual: null,
  },
  {
    id: 'op_fem_eng_volta',
    name: 'VOLTA COYOTE',
    codename: 'VOLTA-07',
    faction: 'VANGUARD',
    rarity: 'ESPECIAL',
    preferredClass: 'ENGENHEIRO',
    customModelConfig: {
      glbPath: '/models/characters/female_ops/eng_sapper.glb',
      camoCode: 'o',
      gloveVariant: 'd',
      gender: 'FEMALE',
      silhouetteLabel: 'Sapper Ágil · Boné Tático, Headset & Rig Leve',
      hairColorHex: 0x5c3622,
    },
    description:
      'Sapadora de alta mobilidade com boné tático, comunicador de campo e equipamento Coyote Brown para flanqueios.',
    perkLabel: 'Engenheiro Feminino · Mobilidade Tática Coyote',
    diamondPrice: 550,
    swatchColors: ['#8c6d4f', '#574230', '#c2a482'],
    suitVisual: null,
  },
  {
    id: 'op_fem_eng_kestrel',
    name: 'KESTREL COMANDO',
    codename: 'KESTREL-08',
    faction: 'VANGUARD',
    rarity: 'ESPECIAL',
    preferredClass: 'ENGENHEIRO',
    customModelConfig: {
      glbPath: '/models/characters/female_ops/eng_sapper.glb',
      camoCode: 'n',
      gloveVariant: 'a',
      gender: 'FEMALE',
      silhouetteLabel: 'Sapper Ágil · Boné Tático & Camuflagem Comando',
      hairColorHex: 0x1f1a18,
    },
    description:
      'Engenheira de reconhecimento e sabotagem com rig ultraleve, luvas de precisão e padrão verde-oliva comando.',
    perkLabel: 'Engenheiro Feminino · Sabotagem Comando Oliva',
    diamondPrice: 500,
    swatchColors: ['#4a5741', '#2f3829', '#7d8a6e'],
    suitVisual: null,
  },

  // --- MÉDICO (4 SKINS) ---
  {
    id: 'op_fem_med_seraph',
    name: 'SERAPH ÁRTICA',
    codename: 'SERAPH-09',
    faction: 'PHANTOM',
    rarity: 'LENDARIO',
    preferredClass: 'MEDICO',
    customModelConfig: {
      glbPath: '/models/characters/female_ops/med_field.glb',
      camoCode: 's',
      gloveVariant: 'b',
      gender: 'FEMALE',
      silhouetteLabel: 'Médica de Campo · Boina Tática & Mochila de Trauma',
      hairColorHex: 0xd6cfc2,
    },
    description:
      'Médica de resgate em zonas glaciais com uniforme camuflado ártico de alta visibilidade tática e kit completo de trauma.',
    perkLabel: 'Médico Feminino · Resgate Ártico de Elite',
    diamondPrice: 860,
    swatchColors: ['#e2e8f0', '#94a3b8', '#10b981'],
    suitVisual: null,
  },
  {
    id: 'op_fem_med_iris',
    name: 'ÍRIS SOMBRA',
    codename: 'IRIS-10',
    faction: 'BLACKWOOD',
    rarity: 'ELITE',
    preferredClass: 'MEDICO',
    customModelConfig: {
      glbPath: '/models/characters/female_ops/med_field.glb',
      camoCode: 'r',
      gloveVariant: 'c',
      gender: 'FEMALE',
      silhouetteLabel: 'Médica de Campo · Boina Tática & Rig Noturno',
      hairColorHex: 0x1a1518,
    },
    description:
      'Especialista em extração noturna e reanimação em combate fechado, trajando acabamento grafite-sombra discreto.',
    perkLabel: 'Médico Feminino · Extração Noturna Sombra',
    diamondPrice: 660,
    swatchColors: ['#2a2f3a', '#161920', '#34d399'],
    suitVisual: null,
  },
  {
    id: 'op_fem_med_aura',
    name: 'AURA SELVA',
    codename: 'AURA-11',
    faction: 'VANGUARD',
    rarity: 'ESPECIAL',
    preferredClass: 'MEDICO',
    customModelConfig: {
      glbPath: '/models/characters/female_ops/med_trauma.glb',
      camoCode: 'c',
      gloveVariant: 'a',
      gender: 'FEMALE',
      silhouetteLabel: 'Suporte Trauma · Headset Tático & Bolsas IFAK',
      hairColorHex: 0x3a2417,
    },
    description:
      'Médica de selva equipada com múltiplas bolsas IFAK, fone de comunicação ativa e camuflagem tropical fechada.',
    perkLabel: 'Médico Feminino · Suporte Tropical IFAK',
    diamondPrice: 530,
    swatchColors: ['#2f4a36', '#1e3324', '#5b7d5f'],
    suitVisual: null,
  },
  {
    id: 'op_fem_med_lyra',
    name: 'LYRA SAVANA',
    codename: 'LYRA-12',
    faction: 'AURUM',
    rarity: 'ESPECIAL',
    preferredClass: 'MEDICO',
    customModelConfig: {
      glbPath: '/models/characters/female_ops/med_trauma.glb',
      camoCode: 'e',
      gloveVariant: 'd',
      gender: 'FEMALE',
      silhouetteLabel: 'Suporte Trauma · Rig Médico & Uniforme Savana',
      hairColorHex: 0x6b3e26,
    },
    description:
      'Operadora de socorro rápido em terrenos abertos com uniforme savana resistente e bolsas de desfibrilador.',
    perkLabel: 'Médico Feminino · Resposta Rápida Savana',
    diamondPrice: 490,
    swatchColors: ['#96815c', '#635339', '#c9b48d'],
    suitVisual: null,
  },

  // --- FRANCO-ATIRADOR (4 SKINS) ---
  {
    id: 'op_fem_snp_nyx',
    name: 'NYX FANTASMA',
    codename: 'NYX-13',
    faction: 'PHANTOM',
    rarity: 'LENDARIO',
    preferredClass: 'FRANCO_ATIRADOR',
    customModelConfig: {
      glbPath: '/models/characters/female_ops/snp_phantom.glb',
      camoCode: 'l',
      gloveVariant: 'b',
      gender: 'FEMALE',
      silhouetteLabel: 'Recon Fantasma · Máscara Facial & Óculos Sniper',
      hairColorHex: 0x16161a,
    },
    description:
      'Atiradora de elite fantasma com máscara tática, óculos antirreflexo e camuflagem monocromática de alta furtividade.',
    perkLabel: 'Franco-Atirador Feminino · Recon Fantasma Stealth',
    diamondPrice: 890,
    swatchColors: ['#242933', '#434c5e', '#f43f5e'],
    suitVisual: null,
  },
  {
    id: 'op_fem_snp_widow',
    name: 'WIDOW TAIGA',
    codename: 'WIDOW-14',
    faction: 'BLACKWOOD',
    rarity: 'ELITE',
    preferredClass: 'FRANCO_ATIRADOR',
    customModelConfig: {
      glbPath: '/models/characters/female_ops/snp_phantom.glb',
      camoCode: 'g',
      gloveVariant: 'c',
      gender: 'FEMALE',
      silhouetteLabel: 'Recon Fantasma · Máscara Tática & Padrão Taiga',
      hairColorHex: 0x451a1a,
    },
    description:
      'Caçadora de longa distância especialista em emboscadas frias com camuflagem Taiga e máscara respiratória.',
    perkLabel: 'Franco-Atirador Feminino · Emboscada Taiga',
    diamondPrice: 690,
    swatchColors: ['#4a5244', '#2d332a', '#8c9484'],
    suitVisual: null,
  },
  {
    id: 'op_fem_snp_echo',
    name: 'ECHO PANTANAL',
    codename: 'ECHO-15',
    faction: 'VANGUARD',
    rarity: 'ESPECIAL',
    preferredClass: 'FRANCO_ATIRADOR',
    customModelConfig: {
      glbPath: '/models/characters/female_ops/snp_stalker.glb',
      camoCode: 'k',
      gloveVariant: 'a',
      gender: 'FEMALE',
      silhouetteLabel: 'Stalker Recon · Chapéu Boonie & Perfil Silencioso',
      hairColorHex: 0x2b2018,
    },
    description:
      'Observadora e sniper de terreno úmido equipada com chapéu Boonie quebra-silhueta e uniforme Pantanal.',
    perkLabel: 'Franco-Atirador Feminino · Stalker Boonie Pantanal',
    diamondPrice: 560,
    swatchColors: ['#4c573c', '#323a27', '#7b8765'],
    suitVisual: null,
  },
  {
    id: 'op_fem_snp_mirage',
    name: 'MIRAGE DUNAS',
    codename: 'MIRAGE-16',
    faction: 'AURUM',
    rarity: 'ESPECIAL',
    preferredClass: 'FRANCO_ATIRADOR',
    customModelConfig: {
      glbPath: '/models/characters/female_ops/snp_stalker.glb',
      camoCode: 'j',
      gloveVariant: 'd',
      gender: 'FEMALE',
      silhouetteLabel: 'Stalker Recon · Chapéu Boonie & Camuflagem Dunas',
      hairColorHex: 0x8a6a42,
    },
    description:
      'Sniper de longo alcance especializada em linhas de tiro desérticas com chapéu Boonie e camuflagem Dunas.',
    perkLabel: 'Franco-Atirador Feminino · Recon Dunas Áridas',
    diamondPrice: 520,
    swatchColors: ['#b89d72', '#826b49', '#dec69e'],
    suitVisual: null,
  },
  // =========================================================================
  // OPERADORES CLÁSSICOS DA COALIZÃO
  // =========================================================================
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
  if (op.customModelConfig || root.userData?.preserveCustomPbrMaterials) {
    return;
  }

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
