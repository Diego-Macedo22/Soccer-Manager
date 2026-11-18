/**
 * Diretoria, torcida, nota do técnico e olheiros: regras puras portadas da v0.5.
 *
 * - Objetivos com pesos (liga 45, copa 25, finanças 20, elenco 10) definidos pela
 *   reputação e divisão do clube.
 * - Confiança da diretoria = objetivos × .45 + últimos 8 resultados × .4 + finanças × .15.
 * - Confiança da torcida pelos últimos 8 resultados, mais exigente em clubes grandes.
 * - Nota do técnico (1–10): +.035 vitória, −.03 derrota, +.008 empate, com bônus/ônus
 *   pela diferença de reputação do adversário.
 * - Olheiros: contratação por 1,5 mi + 1,35 mi por olheiro já contratado; missões de
 *   1–6 meses por região; relatório com 4 + nível nomes (5–15).
 */
import type { IsoDate } from '../dates.ts';

export type ObjectiveId = 'league' | 'cup' | 'finance' | 'squad';
export type MatchOutcome = 'win' | 'draw' | 'loss';

export interface Objective {
  id: ObjectiveId;
  title: string;
  weight: number;
  /** Liga: posição máxima aceitável. Copa: fases a vencer. */
  target: number;
}

export interface Scout {
  id: string;
  name: string;
  level: number;
  /** 58–92: quanto menor, maior o erro na estimativa de OVR/POT. */
  accuracy: number;
  mission: { region: ScoutRegion; end: IsoDate } | null;
  /** Jogadores observados, com a estimativa do olheiro. */
  reports: { playerId: string; ovr: number; pot: number }[];
}

export type ScoutRegion = 'BR' | 'ENG' | 'ESP' | 'SUL' | 'LIVRES';
export const SCOUT_REGIONS: Record<ScoutRegion, string> = { BR: 'Brasil', ENG: 'Inglaterra', ESP: 'Espanha', SUL: 'América do Sul', LIVRES: 'Agentes livres' };
export const SCOUT_LIMIT = 6;
const SCOUT_NAMES = ['André Farias', 'Paulo Monteiro', 'Rafael Teles', 'Leandro Braga', 'Gustavo Mota', 'Henrique Luz'];

export interface JobOffer {
  clubId: string;
  expires: IsoDate;
}

export interface BoardState {
  objectives: Objective[];
  clubConfidence: number;
  fanConfidence: number;
  rating: number;
  record: { played: number; wins: number; draws: number; losses: number };
  /** Últimos resultados do usuário (mais recente no fim), no máximo 8. */
  recent: MatchOutcome[];
  /** Avaliações de temporadas encerradas. */
  history: { season: string; clubId: string; position: number | null; score: number }[];
  jobOffers: JobOffer[];
  /** Demitido: só pode avançar depois de aceitar uma proposta. */
  sacked: boolean;
  scouts: Scout[];
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function createBoard(club: { rep: number; division: string | null }): BoardState {
  return {
    objectives: boardObjectives(club),
    clubConfidence: 70,
    fanConfidence: 70,
    rating: 5,
    record: { played: 0, wins: 0, draws: 0, losses: 0 },
    recent: [],
    history: [],
    jobOffers: [],
    sacked: false,
    scouts: [],
  };
}

export function boardObjectives(c: { rep: number; division: string | null }): Objective[] {
  const top = c.division === 'B';
  const league: Objective = c.rep >= 85
    ? { id: 'league', title: 'Disputar o título (top 3)', weight: 45, target: 3 }
    : c.rep >= 78 && !top
      ? { id: 'league', title: 'Terminar entre os 8 primeiros', weight: 45, target: 8 }
      : top
        ? c.rep >= 70
          ? { id: 'league', title: 'Brigar pelo acesso (top 4)', weight: 45, target: 4 }
          : { id: 'league', title: 'Terminar na metade de cima', weight: 45, target: 10 }
        : { id: 'league', title: 'Evitar o rebaixamento', weight: 45, target: 16 };
  return [
    league,
    c.rep >= 82 ? { id: 'cup', title: 'Vencer 3 fases da copa', weight: 25, target: 3 } : { id: 'cup', title: 'Vencer 2 fases da copa', weight: 25, target: 2 },
    { id: 'finance', title: 'Manter o caixa positivo', weight: 20, target: 0 },
    { id: 'squad', title: 'Manter o elenco com boa moral', weight: 10, target: 70 },
  ];
}

/** 0–100 para cada objetivo, dados o estado atual. */
export function objectiveStatus(o: Objective, s: { leaguePos: number | null; cupWins: number; balance: number; avgMorale: number }): number {
  switch (o.id) {
    case 'league':
      return s.leaguePos === null ? 70 : s.leaguePos <= o.target ? 100 : clamp(100 - (s.leaguePos - o.target) * 9, 15, 100);
    case 'cup':
      return clamp(Math.round(40 + (60 * s.cupWins) / o.target), 40, 100);
    case 'finance':
      return s.balance >= 0 ? 100 : 20;
    case 'squad':
      return Math.round(clamp(s.avgMorale, 0, 100));
  }
}

export function objectivesScore(objs: Objective[], statuses: number[]): number {
  const w = objs.reduce((t, o) => t + o.weight, 0) || 1;
  return Math.round(objs.reduce((t, o, i) => t + (statuses[i] ?? 70) * o.weight, 0) / w);
}

/** Aplica um resultado do usuário: recorde, nota e últimos jogos. */
export function recordOutcome(b: BoardState, outcome: MatchOutcome, oppRep: number, ownRep: number): void {
  b.record.played++;
  b.record[outcome === 'win' ? 'wins' : outcome === 'loss' ? 'losses' : 'draws']++;
  const repDiff = (oppRep - ownRep) / 1000;
  const delta = outcome === 'win' ? 0.035 + Math.max(0, repDiff) : outcome === 'loss' ? -0.03 + Math.min(0, repDiff) : 0.008;
  b.rating = clamp(Math.round((b.rating + delta) * 100) / 100, 1, 10);
  b.recent = [...b.recent, outcome].slice(-8);
}

/** Recalcula as confianças (diretoria e torcida). */
export function updateConfidence(b: BoardState, objScore: number, balance: number, clubRep: number): void {
  const r = b.recent;
  const results = r.length ? r.reduce((t, x) => t + (x === 'win' ? 100 : x === 'draw' ? 58 : 22), 0) / r.length : 100;
  b.clubConfidence = clamp(Math.round(objScore * 0.45 + results * 0.4 + (balance >= 0 ? 100 : 20) * 0.15), 0, 100);
  const demanding = clamp((clubRep - 65) / 30, 0, 1);
  const fans = r.length ? r.reduce((t, x) => t + (x === 'win' ? 100 : x === 'draw' ? 60 - 10 * demanding : 28 - 16 * demanding), 0) / r.length : 100;
  b.fanConfidence = clamp(Math.round(fans), 0, 100);
}

/** Nota mínima que um clube exige do técnico (v0.5). */
export function jobRequirement(rep: number): number {
  return clamp(4.5 + (rep - 60) / 9, 4.5, 9.4);
}

export function scoutHireCost(count: number): number {
  return 1_500_000 + count * 1_350_000;
}

export function newScout(index: number, id: string): Scout {
  return {
    id,
    name: SCOUT_NAMES[index % SCOUT_NAMES.length]!,
    level: clamp(1 + Math.floor(index / 2), 1, 10),
    accuracy: clamp(58 + index * 6, 58, 92),
    mission: null,
    reports: [],
  };
}

export function scoutReportSize(level: number): number {
  return clamp(4 + level, 5, 15);
}
