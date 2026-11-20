import React from 'react';

export type ClanEmblemId =
  | 'alpha_wolf'
  | 'crimson_skull'
  | 'golden_eagle'
  | 'cyber_cobra'
  | 'spartan_helm'
  | 'iron_phoenix'
  | 'shadow_panther'
  | 'valkyrie_blade'
  | 'titan_crown'
  | 'vanguard_lion';

export interface ClanEmblemDefinition {
  id: ClanEmblemId;
  name: string;
  tagline: string;
  primaryColor: string;
  secondaryColor: string;
  glowColor: string;
}

export const CLAN_EMBLEM_CATALOG: ClanEmblemDefinition[] = [
  {
    id: 'alpha_wolf',
    name: 'LOBO ALFA IMPERIAL',
    tagline: 'Lobo alado coroado com brasão rubro',
    primaryColor: '#ef4444',
    secondaryColor: '#f59e0b',
    glowColor: 'rgba(239,68,68,0.55)',
  },
  {
    id: 'crimson_skull',
    name: 'CEIFADOR FANTASMA',
    tagline: 'Crânio tático de operações especiais',
    primaryColor: '#dc2626',
    secondaryColor: '#991b1b',
    glowColor: 'rgba(220,38,38,0.55)',
  },
  {
    id: 'golden_eagle',
    name: 'ÁGUIA DOURADA',
    tagline: 'Soberania aérea e precisão letal',
    primaryColor: '#f59e0b',
    secondaryColor: '#fde047',
    glowColor: 'rgba(245,158,11,0.55)',
  },
  {
    id: 'cyber_cobra',
    name: 'VÍBORA VENENOSA',
    tagline: 'Ataque furtivo de alta velocidade',
    primaryColor: '#10b981',
    secondaryColor: '#34d399',
    glowColor: 'rgba(16,185,129,0.55)',
  },
  {
    id: 'spartan_helm',
    name: 'FALANGE ESPARTANA',
    tagline: 'Defesa impenetrável em esquadrão',
    primaryColor: '#f97316',
    secondaryColor: '#fbbf24',
    glowColor: 'rgba(249,115,22,0.55)',
  },
  {
    id: 'iron_phoenix',
    name: 'FÊNIX DE FOGO',
    tagline: 'Renascimento em chamas no campo de batalha',
    primaryColor: '#fb7185',
    secondaryColor: '#facc15',
    glowColor: 'rgba(251,113,133,0.55)',
  },
  {
    id: 'shadow_panther',
    name: 'PANTERA NEGRA',
    tagline: 'Predador noturno silencioso',
    primaryColor: '#a855f7',
    secondaryColor: '#38bdf8',
    glowColor: 'rgba(168,85,247,0.55)',
  },
  {
    id: 'valkyrie_blade',
    name: 'LÂMINA VALQUÍRIA',
    tagline: 'Espadas gêmeas da vitória competitiva',
    primaryColor: '#38bdf8',
    secondaryColor: '#e2e8f0',
    glowColor: 'rgba(56,189,248,0.55)',
  },
  {
    id: 'titan_crown',
    name: 'COROA DOS TITÃS',
    tagline: 'Realeza suprema do ranking global',
    primaryColor: '#eab308',
    secondaryColor: '#ef4444',
    glowColor: 'rgba(234,179,8,0.55)',
  },
  {
    id: 'vanguard_lion',
    name: 'LEÃO DE VANGUARDA',
    tagline: 'Coragem implacável na linha de frente',
    primaryColor: '#ec4899',
    secondaryColor: '#f59e0b',
    glowColor: 'rgba(236,72,153,0.55)',
  },
];

export function getClanEmblemDef(id?: string): ClanEmblemDefinition {
  return (
    CLAN_EMBLEM_CATALOG.find((e) => e.id === id) || CLAN_EMBLEM_CATALOG[0]
  );
}

interface ClanEmblemIconProps {
  emblemId?: string;
  className?: string;
  showGlow?: boolean;
}

export const ClanEmblemIcon: React.FC<ClanEmblemIconProps> = ({
  emblemId = 'alpha_wolf',
  className = 'w-8 h-8',
  showGlow = false,
}) => {
  const def = getClanEmblemDef(emblemId);

  return (
    <div
      className={`relative inline-flex items-center justify-center select-none shrink-0 ${className}`}
      style={
        showGlow
          ? { filter: `drop-shadow(0 0 10px ${def.glowColor})` }
          : undefined
      }
    >
      <svg viewBox="0 0 64 64" className="w-full h-full overflow-visible">
        <defs>
          <linearGradient id={`clan-bg-${def.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={def.primaryColor} />
            <stop offset="55%" stopColor="#1a090d" />
            <stop offset="100%" stopColor="#090b10" />
          </linearGradient>
          <linearGradient id={`clan-rim-${def.id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={def.secondaryColor} />
            <stop offset="50%" stopColor="#ffffff" />
            <stop offset="100%" stopColor={def.primaryColor} />
          </linearGradient>
        </defs>

        {/* Outer Winged Crest Flanks */}
        <path
          d="M6 22 L18 16 L15 36 L6 30 Z M58 22 L46 16 L49 36 L58 30 Z"
          fill={def.primaryColor}
          opacity="0.85"
        />
        <path
          d="M2 27 L16 22 L14 40 L4 35 Z M62 27 L48 22 L50 40 L60 35 Z"
          fill={def.secondaryColor}
          opacity="0.7"
        />

        {/* Main Tactical Heraldic Shield */}
        <path
          d="M32 6 L52 14 L48 41 L32 58 L16 41 L12 14 Z"
          fill={`url(#clan-bg-${def.id})`}
          stroke={`url(#clan-rim-${def.id})`}
          strokeWidth="2.8"
        />
        <path
          d="M32 10 L48 16.5 L44.8 39 L32 53 L19.2 39 L16 16.5 Z"
          fill="none"
          stroke="#ffffff"
          strokeOpacity="0.25"
          strokeWidth="1.2"
        />

        {/* Top Royal Crown */}
        <path
          d="M22 13 L25 6 L32 11 L39 6 L42 13 Z"
          fill="#fbbf24"
          stroke="#78350f"
          strokeWidth="1"
        />

        {/* Center Crest Motif by Emblem ID */}
        {def.id === 'alpha_wolf' && (
          <g>
            {/* Fierce Wolf Head */}
            <path
              d="M20 18 L25 27 L19 33 L25 39 L32 50 L39 39 L45 33 L39 27 L44 18 L36 24 L32 21 L28 24 Z"
              fill="#e2e8f0"
              stroke="#0f172a"
              strokeWidth="1.6"
            />
            <path
              d="M24 27 L29 31 L26 36 L32 45 L38 36 L35 31 L40 27 L32 24 Z"
              fill="#475569"
            />
            {/* Glowing Red Eyes */}
            <polygon points="25,30 29,31 27,33" fill="#ef4444" />
            <polygon points="39,30 35,31 37,33" fill="#ef4444" />
            {/* Fangs & Nose */}
            <polygon points="30,40 34,40 32,44" fill="#0f172a" />
            <polygon points="28,44 30,48 32,45 34,48 36,44" fill="#ffffff" />
          </g>
        )}

        {def.id === 'crimson_skull' && (
          <g>
            <path
              d="M21 28 C21 19 43 19 43 28 C43 34 40 37 38 40 L38 47 L26 47 L26 40 C24 37 21 34 21 28 Z"
              fill="#f1f5f9"
              stroke="#0f172a"
              strokeWidth="1.8"
            />
            <circle cx="27" cy="30" r="3.2" fill="#dc2626" />
            <circle cx="37" cy="30" r="3.2" fill="#dc2626" />
            <polygon points="32,33 29.5,37 34.5,37" fill="#0f172a" />
            <path
              d="M28 41 V46 M32 41 V46 M36 41 V46"
              stroke="#0f172a"
              strokeWidth="1.8"
            />
          </g>
        )}

        {def.id === 'golden_eagle' && (
          <g>
            <path
              d="M16 26 L27 29 L32 19 L37 29 L48 26 L40 37 L43 47 L32 41 L21 47 L24 37 Z"
              fill="#facc15"
              stroke="#713f12"
              strokeWidth="1.6"
            />
            <polygon points="32,27 29,34 32,39 35,34" fill="#ffffff" />
          </g>
        )}

        {def.id === 'cyber_cobra' && (
          <g>
            <path
              d="M21 26 C21 18 43 18 43 26 C43 33 36 37 36 46 L28 46 C28 37 21 33 21 26 Z"
              fill="#10b981"
              stroke="#064e3b"
              strokeWidth="1.8"
            />
            <polygon points="26,27 30,29 27,31" fill="#fef08a" />
            <polygon points="38,27 34,29 37,31" fill="#fef08a" />
            <path d="M30 41 L29 48 M34 41 L35 48" stroke="#ffffff" strokeWidth="2" />
          </g>
        )}

        {def.id === 'spartan_helm' && (
          <g>
            <path
              d="M22 22 L32 17 L42 22 L41 44 L35 48 L35 35 L29 35 L29 48 L23 44 Z"
              fill="#fbbf24"
              stroke="#78350f"
              strokeWidth="1.8"
            />
            <path
              d="M24 29 L30 32 L24 34 Z M40 29 L34 32 L40 34 Z"
              fill="#0f172a"
            />
          </g>
        )}

        {def.id === 'iron_phoenix' && (
          <g>
            <path
              d="M15 24 L26 30 L32 17 L38 30 L49 24 L41 38 L45 48 L32 42 L19 48 L23 38 Z"
              fill="#fb7185"
              stroke="#881337"
              strokeWidth="1.5"
            />
            <circle cx="32" cy="31" r="4" fill="#fef08a" />
          </g>
        )}

        {def.id === 'shadow_panther' && (
          <g>
            <path
              d="M21 20 L26 24 L38 24 L43 20 L42 36 L32 47 L22 36 Z"
              fill="#1e1b4b"
              stroke="#c084fc"
              strokeWidth="1.8"
            />
            <polygon points="25,30 29,31 27,34" fill="#38bdf8" />
            <polygon points="39,30 35,31 37,34" fill="#38bdf8" />
            <path d="M28 40 L32 43 L36 40" stroke="#f8fafc" strokeWidth="2" fill="none" />
          </g>
        )}

        {def.id === 'valkyrie_blade' && (
          <g>
            <path
              d="M20 44 L44 20 M44 44 L20 20"
              stroke="#e2e8f0"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
            <circle cx="32" cy="32" r="6" fill="#0284c7" stroke="#bae6fd" strokeWidth="1.8" />
          </g>
        )}

        {def.id === 'titan_crown' && (
          <g>
            <path
              d="M18 39 L21 24 L28 31 L32 21 L36 31 L43 24 L46 39 Z"
              fill="#facc15"
              stroke="#713f12"
              strokeWidth="1.8"
            />
            <circle cx="32" cy="34" r="2.8" fill="#ef4444" />
            <circle cx="25" cy="35" r="2" fill="#38bdf8" />
            <circle cx="39" cy="35" r="2" fill="#38bdf8" />
          </g>
        )}

        {def.id === 'vanguard_lion' && (
          <g>
            <path
              d="M19 23 L26 19 L32 21 L38 19 L45 23 L43 38 L32 49 L21 38 Z"
              fill="#f59e0b"
              stroke="#78350f"
              strokeWidth="1.8"
            />
            <polygon points="25,29 29,30 27,33" fill="#ffffff" />
            <polygon points="39,29 35,30 37,33" fill="#ffffff" />
            <polygon points="29,37 35,37 32,42" fill="#78350f" />
          </g>
        )}
      </svg>
    </div>
  );
};
