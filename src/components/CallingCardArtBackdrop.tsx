import React, { useId } from 'react';
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
 * Renders layered AAA calling-card banner artwork (including GPU-accelerated
 * animated fire, cyberpunk neon, electric plasma, liquid gold, cosmic nebula
 * and mythic dragon wings) with zero external network dependencies.
 */
export const CallingCardArtBackdrop: React.FC<CallingCardArtBackdropProps> = ({
  cardId,
  card,
  className = '',
}) => {
  const def = card || getCallingCardById(cardId);
  const rawUid = useId().replace(/:/g, '');
  const gradId = `cc-grad-${def.id}-${rawUid}`;
  const fireGradId = `cc-fire-${def.id}-${rawUid}`;

  return (
    <div
      className={`absolute inset-0 pointer-events-none overflow-hidden ${className}`}
      style={{ background: def.bgStyle }}
    >
      {/* Animated cosmic vortex base layer */}
      {def.pattern === 'cosmic_nebula' && (
        <div
          className="cc-anim-plasma absolute -right-10 -top-16 w-48 h-48 rounded-full opacity-65"
          style={{
            background:
              'conic-gradient(from 0deg, rgba(168,85,247,0.05), rgba(56,189,248,0.55), rgba(236,72,153,0.5), rgba(168,85,247,0.45), rgba(14,165,233,0.05))',
            filter: 'blur(10px)',
          }}
        />
      )}

      {/* Crisp vector atmospheric layer per pattern */}
      <svg
        viewBox="0 0 320 72"
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full opacity-90"
      >
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={def.accentHex} stopOpacity="0.06" />
            <stop offset="55%" stopColor={def.accentHex} stopOpacity="0.58" />
            <stop offset="100%" stopColor={def.secondaryHex} stopOpacity="0.18" />
          </linearGradient>
          <linearGradient id={fireGradId} x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.92" />
            <stop offset="50%" stopColor="#f97316" stopOpacity="0.72" />
            <stop offset="100%" stopColor="#fef08a" stopOpacity="0.15" />
          </linearGradient>
        </defs>

        {def.pattern === 'steel_beam' && (
          <>
            <polygon points="110,0 185,0 140,72 65,72" fill={`url(#${gradId})`} />
            <polygon points="195,0 230,0 185,72 150,72" fill={def.accentHex} fillOpacity="0.18" />
            <line x1="90" y1="72" x2="165" y2="0" stroke={def.accentHex} strokeOpacity="0.55" strokeWidth="1.5" />
          </>
        )}

        {def.pattern === 'crimson_slash' && (
          <>
            <path d="M125,72 L220,0 L252,0 L158,72 Z" fill={`url(#${gradId})`} />
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
            <polygon points="125,72 215,0 248,0 165,72" fill={`url(#${gradId})`} />
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

        {/* === ANIMATED CALLING CARD PATTERNS === */}
        {def.pattern === 'inferno_blaze' && (
          <>
            <g className="cc-anim-fire">
              <path
                d="M95,72 C112,48 122,56 138,32 C154,50 164,18 186,8 C196,34 214,16 232,6 C248,30 264,14 282,4 C298,28 310,20 320,12 L320,72 Z"
                fill={`url(#${fireGradId})`}
              />
            </g>
            <g className="cc-anim-fire-alt">
              <path
                d="M125,72 C142,46 156,52 172,26 C188,46 206,22 224,14 C242,38 258,26 276,16 C292,38 306,32 320,24 L320,72 Z"
                fill="#fde047"
                fillOpacity="0.32"
              />
            </g>
            <circle cx="152" cy="54" r="2.2" fill="#fef08a" className="cc-anim-ember" />
            <circle cx="198" cy="58" r="1.8" fill="#fb923c" className="cc-anim-ember" style={{ animationDelay: '0.5s' }} />
            <circle cx="242" cy="52" r="2.4" fill="#fef08a" className="cc-anim-ember" style={{ animationDelay: '1.1s' }} />
            <circle cx="276" cy="56" r="1.7" fill="#fca5a5" className="cc-anim-ember" style={{ animationDelay: '1.6s' }} />
          </>
        )}

        {def.pattern === 'neon_overdrive' && (
          <>
            <g stroke="#22d3ee" strokeOpacity="0.34" strokeWidth="1">
              <line x1="90" y1="52" x2="320" y2="52" />
              <line x1="110" y1="62" x2="320" y2="62" />
              <line x1="120" y1="72" x2="170" y2="38" />
              <line x1="168" y1="72" x2="210" y2="38" />
              <line x1="216" y1="72" x2="250" y2="38" />
              <line x1="264" y1="72" x2="290" y2="38" />
            </g>
            <path d="M96,36 H320" stroke="#f472b6" strokeWidth="2.2" strokeOpacity="0.82" />
            <path d="M132,20 L216,20 L236,36 L306,36" stroke="#22d3ee" strokeWidth="1.6" strokeOpacity="0.78" fill="none" />
            <circle cx="216" cy="20" r="2.6" fill="#22d3ee" className="cc-anim-electric" />
            <circle cx="278" cy="36" r="2.6" fill="#f472b6" className="cc-anim-electric" style={{ animationDelay: '0.7s' }} />
          </>
        )}

        {def.pattern === 'thunder_volt' && (
          <>
            <g className="cc-anim-electric">
              <path
                d="M92,56 L142,32 L134,46 L194,16 L184,32 L254,6 L236,34 L304,12"
                stroke="#e0f2fe"
                strokeWidth="2.6"
                fill="none"
              />
              <path
                d="M112,66 L168,38 L160,52 L226,24 L218,38 L294,20"
                stroke="#38bdf8"
                strokeWidth="5"
                strokeOpacity="0.38"
                fill="none"
              />
            </g>
            <g className="cc-anim-electric" style={{ animationDelay: '0.9s' }}>
              <path
                d="M130,68 L184,48 L178,58 L246,34 L288,46"
                stroke="#7dd3fc"
                strokeWidth="1.8"
                fill="none"
              />
            </g>
          </>
        )}

        {def.pattern === 'aurum_shimmer' && (
          <>
            <polygon points="116,72 208,0 248,0 160,72" fill={`url(#${gradId})`} />
            <polygon points="214,72 288,0 314,0 246,72" fill="#fde047" fillOpacity="0.22" />
            <line x1="132" y1="72" x2="222" y2="0" stroke="#fef9c3" strokeOpacity="0.85" strokeWidth="1.6" />
            <circle cx="176" cy="54" r="2.2" fill="#fef08a" className="cc-anim-ember" />
            <circle cx="228" cy="50" r="1.9" fill="#fde047" className="cc-anim-ember" style={{ animationDelay: '0.7s' }} />
            <circle cx="268" cy="56" r="2.4" fill="#fef9c3" className="cc-anim-ember" style={{ animationDelay: '1.4s' }} />
          </>
        )}

        {def.pattern === 'cosmic_nebula' && (
          <>
            <path d="M98,60 Q188,10 306,26" stroke="#c084fc" strokeWidth="2.2" strokeOpacity="0.72" fill="none" />
            <path d="M126,68 Q214,28 312,48" stroke="#38bdf8" strokeWidth="1.8" strokeOpacity="0.65" fill="none" />
            <circle cx="172" cy="24" r="2" fill="#f8fafc" className="cc-anim-electric" />
            <circle cx="222" cy="18" r="1.6" fill="#7dd3fc" className="cc-anim-electric" style={{ animationDelay: '0.5s' }} />
            <circle cx="262" cy="44" r="2.2" fill="#f0abfc" className="cc-anim-electric" style={{ animationDelay: '1.1s' }} />
            <circle cx="294" cy="22" r="1.8" fill="#fef08a" className="cc-anim-electric" style={{ animationDelay: '1.5s' }} />
          </>
        )}

        {def.pattern === 'mythic_wings' && (
          <>
            <g className="cc-anim-wing">
              <path d="M120,66 C165,12 225,8 292,20 C244,30 212,48 168,70 Z" fill={`url(#${gradId})`} />
              <path d="M148,68 C192,28 240,24 304,38 C262,48 232,58 198,72 Z" fill={def.secondaryHex} fillOpacity="0.4" />
              <path d="M126,62 C172,18 228,12 290,22" stroke="#fef08a" strokeWidth="2" strokeOpacity="0.9" fill="none" />
            </g>
            <circle cx="192" cy="50" r="2.2" fill="#fef08a" className="cc-anim-ember" />
            <circle cx="244" cy="52" r="2" fill="#fda4af" className="cc-anim-ember" style={{ animationDelay: '0.9s' }} />
            <circle cx="272" cy="44" r="1.8" fill="#fde047" className="cc-anim-ember" style={{ animationDelay: '1.5s' }} />
          </>
        )}
      </svg>

      {/* Animated neon laser sweep overlay */}
      {def.pattern === 'neon_overdrive' && (
        <div
          className="cc-anim-neon-sweep absolute inset-y-0 left-0 w-24"
          style={{
            background:
              'linear-gradient(90deg, transparent 0%, rgba(34,211,238,0.45) 45%, rgba(244,114,182,0.55) 60%, transparent 100%)',
          }}
        />
      )}

      {/* Animated liquid gold specular sheen */}
      {(def.pattern === 'aurum_shimmer' || def.pattern === 'mythic_wings') && (
        <div
          className="cc-anim-shimmer absolute inset-y-0 left-0 w-20"
          style={{
            background:
              'linear-gradient(90deg, transparent 0%, rgba(254,249,195,0.45) 50%, transparent 100%)',
          }}
        />
      )}

      {/* Animated fiery heat glow for inferno_blaze */}
      {def.pattern === 'inferno_blaze' && (
        <div
          className="cc-anim-fire absolute inset-x-0 bottom-0 h-8"
          style={{
            background:
              'linear-gradient(0deg, rgba(239,68,68,0.58) 0%, rgba(249,115,22,0.28) 55%, transparent 100%)',
          }}
        />
      )}

      {/* Dark readability vignette over left side for text contrast */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#06090f]/86 via-[#06090f]/26 to-[#05070c]/50" />
    </div>
  );
};

