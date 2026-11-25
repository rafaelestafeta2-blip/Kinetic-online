import type {
  ChampionshipStatus,
  MatchPhase,
  MatchStatus,
  RegistrationStatus,
} from '../../services/championshipClient';

export function formatBrlFromCents(cents: number): string {
  const value = Math.max(0, Number(cents) || 0) / 100;
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

export function formatDateTimeBr(iso: string | null | undefined): string {
  if (!iso) return '--/-- --:--';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--/-- --:--';
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTimeBr(iso: string | null | undefined): string {
  if (!iso) return '--:--';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--';
  return d.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatCountdownParts(targetIso: string | null | undefined, nowMs: number): {
  expired: boolean;
  label: string;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
} {
  if (!targetIso) {
    return { expired: true, label: '00:00:00', days: 0, hours: 0, minutes: 0, seconds: 0 };
  }
  const diffMs = new Date(targetIso).getTime() - nowMs;
  if (!Number.isFinite(diffMs) || diffMs <= 0) {
    return { expired: true, label: '00:00:00', days: 0, hours: 0, minutes: 0, seconds: 0 };
  }
  const totalSec = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  const label =
    days > 0
      ? `${days}d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
      : `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return { expired: false, label, days, hours, minutes, seconds };
}

export function getChampionshipStatusLabel(status: ChampionshipStatus): string {
  switch (status) {
    case 'ANUNCIADO':
      return 'ANUNCIADO';
    case 'INSCRICOES_ABERTAS':
      return 'INSCRIÇÕES ABERTAS';
    case 'ROSTER_LOCK':
      return 'ROSTER LOCK';
    case 'EM_ANDAMENTO':
      return 'EM ANDAMENTO';
    case 'FINALIZADO':
      return 'FINALIZADO';
  }
}

export function getChampionshipStatusColor(status: ChampionshipStatus): string {
  switch (status) {
    case 'ANUNCIADO':
      return 'text-slate-300 border-slate-600/60 bg-slate-900/80';
    case 'INSCRICOES_ABERTAS':
      return 'text-cyan-300 border-cyan-500/50 bg-cyan-950/50';
    case 'ROSTER_LOCK':
      return 'text-amber-300 border-amber-500/50 bg-amber-950/50';
    case 'EM_ANDAMENTO':
      return 'text-emerald-300 border-emerald-500/50 bg-emerald-950/50';
    case 'FINALIZADO':
      return 'text-amber-300 border-amber-400/60 bg-amber-950/60';
  }
}

export function getMatchStatusMeta(status: MatchStatus): {
  label: string;
  textClass: string;
  dotClass: string;
} {
  switch (status) {
    case 'AGENDADO':
      return {
        label: 'AGENDADO',
        textClass: 'text-slate-300',
        dotClass: 'bg-slate-400',
      };
    case 'SALA_ABERTA':
      return {
        label: 'SALA ABERTA',
        textClass: 'text-cyan-300',
        dotClass: 'bg-cyan-400',
      };
    case 'AO_VIVO':
      return {
        label: 'AO VIVO',
        textClass: 'text-emerald-300',
        dotClass: 'bg-emerald-400',
      };
    case 'FINALIZADO':
      return {
        label: 'FINALIZADO',
        textClass: 'text-slate-400',
        dotClass: 'bg-slate-500',
      };
    case 'WO':
      return {
        label: 'W.O.',
        textClass: 'text-rose-400',
        dotClass: 'bg-rose-500',
      };
  }
}

export function getMatchPhaseLabel(phase: MatchPhase, roundNumber: number): string {
  switch (phase) {
    case 'ROUND_ROBIN':
      return `RODADA ${roundNumber}`;
    case 'QUARTERFINAL':
      return 'QUARTAS DE FINAL';
    case 'SEMIFINAL':
      return 'SEMIFINAL';
    case 'FINAL':
      return 'GRANDE FINAL';
  }
}

export function getRegistrationStatusLabel(status: RegistrationStatus): string {
  switch (status) {
    case 'CONFIRMADO':
      return 'CONFIRMADO';
    case 'PENDENTE_PAGAMENTO':
      return 'PAGAMENTO PENDENTE';
    case 'CANCELADO':
      return 'CANCELADO';
    case 'DESCLASSIFICADO':
      return 'DESCLASSIFICADO';
  }
}

export function formatArenaDisplayName(arenaMode: string): string {
  switch (arenaMode) {
    case 'DUST2_BOMB_5V5':
      return 'DUST II · PLANTAR BOMBA 5V5';
    case 'ASSAULT_BOMB_5V5':
      return 'CS_ASSAULT · PLANTAR BOMBA 5V5';
    case 'INDUSTRIA_BOMB_5V5':
      return 'INDÚSTRIA · PLANTAR BOMBA 5V5';
    case 'HANGAR_BOMB_5V5':
      return 'HANGAR · PLANTAR BOMBA 5V5';
    case 'EASTERN_CITY_BOMB_5V5':
      return 'EASTERN CITY · PLANTAR BOMBA 5V5';
    case 'MIRAGE_ANUBIS_BOMB_5V5':
      return 'MIRAGE ANUBIS · PLANTAR BOMBA 5V5';
    case 'CSGO_ASSAULT_BOMB_5V5':
      return 'CSGO ASSAULT HD · PLANTAR BOMBA 5V5';
    case 'DE_DST_BOMB_5V5':
      return 'DE_DST DESERT · PLANTAR BOMBA 5V5';
    case 'MP_NUKED_BOMB_5V5':
      return 'MP_NUKED TOWN · PLANTAR BOMBA 5V5';
    case 'DE_SUPPLY_BOMB_5V5':
      return 'DE_SUPPLY BASE · PLANTAR BOMBA 5V5';
    case 'YARD_V2_BOMB_5V5':
      return 'YARD 2.0 HD · PLANTAR BOMBA 5V5';
    case 'OBJECT_D17_BOMB_5V5':
      return 'OBJECT D17 HD · PLANTAR BOMBA 5V5';
    case 'BRIDGES_V2_BOMB_5V5':
      return 'BRIDGES 2.0 HD · PLANTAR BOMBA 5V5';
    case 'YARD_BOMB_5V5':
      return 'YARD · PLANTAR BOMBA 5V5';
    case 'STORAGE_BOMB_5V5':
      return 'STORAGE · PLANTAR BOMBA 5V5';
    case 'FACTORY_BOMB_5V5':
      return 'FACTORY · PLANTAR BOMBA 5V5';
    default:
      return arenaMode.replace(/_/g, ' ');
  }
}
