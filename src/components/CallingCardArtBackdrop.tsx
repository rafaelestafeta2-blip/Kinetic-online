import React from 'react';
import {
  CallingCardDefinition,
  getCallingCardById,
} from '../progression/callingCardsSystem';

interface CallingCardArtBackdropProps {
  cardId?: string | null;
  card?: CallingCardDefinition;
  className?: string;
}

/**
 * Renders layered AAA calling-card banner artwork (lightning, plasma slashes,
 * radar sweep, cyber circuits, imperial gold dust, mythic wings) with zero
 * external network dependencies.
 */
export const CallingCardArtBackdrop: React.FC<CallingCardArtBackdropProps> = ({
  cardId,
  card,
  className = '',
}) => {
  const def = card || getCallingCardById(cardId);

  return (
    <div
      className={`absolute inset-0 pointer-events-none overflow-hidden ${className}`}
      style={{ background: def.bgStyle }}
    >
      {/* Crisp vector atmospheric layer per pattern */}
      <svg
        viewBox="0 0 320 72"
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full opacity-85"
      >
        <defs>
          <linearGradient id={`cc-grad-${def.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={def.accentHex} stopOpacity="0.05" />
            <stop offset="55%" stopColor={def.accentHex} stopOpacity="0.55" />
            <stop offset="100%" stopColor={def.secondaryHex} stopOpacity="0.15" />
          </linearGradient>
        </defs>

        {def.pattern === 'steel_beam' && (
          <>
            <polygon points="110,0 185,0 140,72 65,72" fill={`url(#cc-grad-${def.id})`} />
            <polygon points="195,0 230,0 185,72 150,72" fill={def.accentHex} fillOpacity="0.18" />
            <line x1="90" y1="72" x2="165" y2="0" stroke={def.accentHex} strokeOpacity="0.55" strokeWidth="1.5" />
          </>
        )}

        {def.pattern === 'crimson_slash' && (
          <>
            <path d="M125,72 L220,0 L252,0 L158,72 Z" fill={`url(#cc-grad-${def.id})`} />
            <path d="M168,72 L255,6 L264,12 L182,72 Z" fill={def.accentHex} fillOpacity="0.45" />
            <line x1="120" y1="68" x2="236" y2="4" stroke="#fecaca" strokeOpacity="0.55" strokeWidth="1.2" />
          </>
        )}

        {def.pattern === 'arctic_hex' && (
          <>
            <g stroke={def.accentHex} strokeOpacity="0.28" strokeWidth="1" fill="none">
              <polygon points="150,12 168,4 186,12 186,28 168,36 150,28" />
              <polygon points="186,28 204,20 222,28 222,44 204,52 186,44" />
              <polygon points="222,12 240,4 258,12 258,28 240,36 222,28" />
              <polygon points="168,44 186,36 204,44 204,60 186,68 168,60" />
              <polygon points="240,36 258,28 276,36 276,52 258,60 240,52" />
            </g>
            <path d="M110,60 Q190,15 290,34" stroke="#e0f2fe" strokeOpacity="0.45" strokeWidth="1.5" fill="none" />
          </>
        )}

        {def.pattern === 'cobalt_lightning' && (
          <>
            <path
              d="M95,58 L148,38 L138,48 L196,20 L185,34 L256,8 L236,36 L278,24"
              stroke="#bfdbfe"
              strokeWidth="2.2"
              strokeOpacity="0.85"
              fill="none"
            />
            <path
              d="M115,66 L175,40 L166,52 L244,18"
              stroke={def.accentHex}
              strokeWidth="4.5"
              strokeOpacity="0.32"
              fill="none"
            />
          </>
        )}

        {def.pattern === 'ruby_vortex' && (
          <>
            <circle cx="222" cy="36" r="42" stroke={def.accentHex} strokeOpacity="0.25" strokeWidth="6" fill="none" />
            <circle cx="222" cy="36" r="24" stroke="#fecdd3" strokeOpacity="0.35" strokeWidth="2" fill="none" />
            <path d="M105,64 Q188,4 282,42" stroke={def.accentHex} strokeOpacity="0.55" strokeWidth="3" fill="none" />
            <path d="M130,72 Q204,22 296,12" stroke="#fda4af" strokeOpacity="0.38" strokeWidth="1.5" fill="none" />
          </>
        )}

        {def.pattern === 'emerald_radar' && (
          <>
            <circle cx="228" cy="36" r="32" stroke={def.accentHex} strokeOpacity="0.28" strokeWidth="1" fill="none" />
            <circle cx="228" cy="36" r="20" stroke={def.accentHex} strokeOpacity="0.35" strokeWidth="1" fill="none" />
            <circle cx="228" cy="36" r="9" stroke={def.accentHex} strokeOpacity="0.45" strokeWidth="1" fill="none" />
            <path d="M228,36 L262,14 A38,38 0 0,1 268,44 Z" fill={def.accentHex} fillOpacity="0.32" />
            <line x1="120" y1="36" x2="280" y2="36" stroke={def.accentHex} strokeOpacity="0.18" strokeWidth="1" />
          </>
        )}

        {def.pattern === 'lunar_wolf' && (
          <>
            <path d="M140,8 L230,66" stroke="#f8fafc" strokeOpacity="0.48" strokeWidth="2.5" />
            <path d="M162,4 L252,62" stroke="#cbd5e1" strokeOpacity="0.4" strokeWidth="2" />
            <path d="M184,2 L274,60" stroke="#94a3b8" strokeOpacity="0.32" strokeWidth="1.5" />
            <circle cx="236" cy="24" r="18" fill="#e2e8f0" fillOpacity="0.16" />
          </>
        )}

        {def.pattern === 'cyber_circuit' && (
          <>
            <g stroke={def.accentHex} strokeOpacity="0.5" strokeWidth="1.3" fill="none">
              <path d="M110,18 H175 L192,34 H245 L260,20 H305" />
              <path d="M135,54 H195 L212,40 H265 L280,54 H310" stroke={def.secondaryHex} />
            </g>
            <circle cx="175" cy="18" r="2.5" fill={def.accentHex} />
            <circle cx="245" cy="34" r="2.5" fill={def.secondaryHex} />
            <circle cx="212" cy="40" r="2.5" fill={def.accentHex} />
          </>
        )}

        {def.pattern === 'imperial_gold' && (
          <>
            <polygon points="125,72 215,0 248,0 165,72" fill={`url(#cc-grad-${def.id})`} />
            <line x1="138" y1="72" x2="228" y2="0" stroke="#fef08a" strokeOpacity="0.7" strokeWidth="1.4" />
            <circle cx="195" cy="22" r="2" fill="#fef08a" fillOpacity="0.9" />
            <circle cx="234" cy="44" r="1.8" fill="#fde047" fillOpacity="0.8" />
            <circle cx="258" cy="18" r="2.2" fill="#fbbf24" fillOpacity="0.85" />
            <circle cx="164" cy="48" r="1.5" fill="#fef08a" fillOpacity="0.75" />
          </>
        )}

        {def.pattern === 'viper_scales' && (
          <>
            <path d="M108,52 L152,24 L184,48 L228,16 L262,42 L302,14" stroke={def.accentHex} strokeWidth="2.4" strokeOpacity="0.72" fill="none" />
            <path d="M122,66 L166,38 L198,62 L242,30 L276,56" stroke={def.secondaryHex} strokeWidth="1.4" strokeOpacity="0.5" fill="none" />
          </>
        )}

        {def.pattern === 'solar_flare' && (
          <>
            <circle cx="235" cy="36" r="34" fill="#fb923c" fillOpacity="0.22" />
            <circle cx="235" cy="36" r="18" fill="#fde047" fillOpacity="0.28" />
            <path d="M90,62 Q195,8 308,28" stroke="#fde047" strokeWidth="2.4" strokeOpacity="0.75" fill="none" />
            <path d="M120,72 Q210,30 304,54" stroke="#fb923c" strokeWidth="3.5" strokeOpacity="0.45" fill="none" />
          </>
        )}

        {def.pattern === 'mythic_wings' && (
          <>
            <path d="M120,66 C165,12 225,8 292,20 C244,30 212,48 168,70 Z" fill={`url(#cc-grad-${def.id})`} />
            <path d="M148,68 C192,28 240,24 304,38 C262,48 232,58 198,72 Z" fill={def.secondaryHex} fillOpacity="0.34" />
            <path d="M126,62 C172,18 228,12 290,22" stroke="#fef08a" strokeWidth="1.8" strokeOpacity="0.82" fill="none" />
            <circle cx="204" cy="24" r="2.2" fill="#fef08a" />
            <circle cx="248" cy="32" r="2" fill="#fda4af" />
          </>
        )}
      </svg>

      {/* Dark readability vignette over left side for text contrast */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#06090f]/88 via-[#06090f]/30 to-[#05070c]/55" />
    </div>
  );
};
