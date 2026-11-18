/**
 * Tipos do calendário. Todo o estado é JSON puro (vai no save); as definições
 * de competições (definitions.ts) são código estático e não são salvas.
 */
import type { IsoDate } from '../dates.ts';
import type { Rng } from '../rng.ts';

export interface Club {
  id: string;
  /** Código do país: `BR`, `ENG`, `ESP`… — define quem pode disputar copas nacionais (B16). */
  country: string;
  /** Divisão atual (`A`, `B`, `PL`, `LL`…); muda com acesso/rebaixamento. */
  division: string;
  rep: number;
}

export interface MatchResult {
  home: number;
  away: number;
  /** Vencedor (mata-mata sempre tem; empate em liga = `null`). */
  winnerId: string | null;
  penalties?: boolean;
}

export interface Fixture {
  /** Estável e legível: `<competição>/r<rodada>/<mandante>-<visitante>`. */
  id: string;
  competitionId: string;
  date: IsoDate;
  round: number;
  roundName: string;
  home: string;
  away: string;
  result: MatchResult | null;
}

export interface StandingRow {
  clubId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
}

/** Uma temporada de uma competição (ex.: `pl@2026/27`). Nunca é apagada antes de terminar (B3). */
export interface CompetitionInstance {
  id: string;
  defId: string;
  name: string;
  cycleId: string;
  seasonKey: string;
  startYear: number;
  format: 'league' | 'knockout';
  participants: string[];
  status: 'running' | 'finished';
  /** Data do primeiro jogo (pode ser adiada se a temporada abriu atrasada). */
  firstMatchDate: IsoDate;
  fixtureIds: string[];
  /** Classificação (apenas ligas). */
  table: StandingRow[];
  championId: string | null;
}

export type AgendaEntry =
  | { date: IsoDate; seq: number; kind: 'cycle-open'; cycleId: string; year: number }
  | { date: IsoDate; seq: number; kind: 'monthly' }
  | { date: IsoDate; seq: number; kind: 'weekly' }
  | { date: IsoDate; seq: number; kind: 'fixture'; fixtureId: string };

export type AgendaInput = { [K in AgendaEntry['kind']]: Omit<Extract<AgendaEntry, { kind: K }>, 'seq'> }[AgendaEntry['kind']];

export interface CycleProgress {
  /** Último ano de temporada aberto. */
  openedYear: number | null;
  /** Ano cuja abertura está esperando a temporada anterior terminar (B11). */
  waitingYear: number | null;
}

export interface CalendarState {
  seed: number;
  date: IsoDate;
  clubs: Club[];
  competitions: Record<string, CompetitionInstance>;
  fixtures: Record<string, Fixture>;
  /** Fila de eventos ordenada por data, tipo e ordem de inserção. */
  agenda: AgendaEntry[];
  nextSeq: number;
  cycles: Record<string, CycleProgress>;
}

export type TickKind = 'weekly' | 'monthly';

export type CalendarEvent =
  | { type: 'season-opened'; date: IsoDate; cycleId: string; seasonKey: string; competitionIds: string[] }
  | { type: 'season-delayed'; date: IsoDate; cycleId: string; year: number; waitingFor: string[] }
  | { type: 'fixture-played'; date: IsoDate; fixtureId: string }
  | { type: 'competition-finished'; date: IsoDate; competitionId: string; championId: string | null }
  | { type: 'division-changed'; date: IsoDate; clubId: string; from: string; to: string }
  | { type: 'tick'; date: IsoDate; tick: TickKind };

export interface FixtureContext {
  state: CalendarState;
  competition: CompetitionInstance;
  /** Fluxo exclusivo desta partida: o resultado não depende de como o tempo foi avançado. */
  rng: Rng;
}

/** Quem decide o placar (motor de partida, modelo rápido ou teste). O calendário só organiza. */
export type ResultProvider = (fixture: Fixture, ctx: FixtureContext) => { home: number; away: number; winnerId?: string | null };
