/** Mensagens entre a interface e o Worker que roda a carreira. */
import type { NewsItem, Position } from '@sm/core';

export type Command =
  | { type: 'init' }
  | { type: 'new'; clubId: string; manager: string }
  | { type: 'load' }
  | { type: 'continue' }
  | { type: 'advanceDays'; days: number }
  | { type: 'swap'; a: string; b: string }
  | { type: 'formation'; key: string }
  | { type: 'auto' };

export type Reply =
  | { type: 'init'; hasSave: boolean; clubs: ClubOption[] }
  | { type: 'view'; view: View; toast?: string }
  | { type: 'error'; message: string };

export interface ClubOption {
  id: string;
  name: string;
  league: string;
}

export interface ClubRef {
  id: string;
  name: string;
  abbr: string;
}

export interface FixtureView {
  id: string;
  date: string;
  competition: string;
  round: string;
  home: ClubRef;
  away: ClubRef;
  score: string | null;
}

export interface PlayerView {
  id: string;
  name: string;
  pos: Position;
  positions: Position[];
  age: number;
  ovr: number;
  pot: number;
  fitness: number;
  morale: number;
  injuredUntil: string | null;
  wage: number;
  contract: number;
  apps: number;
}

export interface TableRow {
  pos: number;
  club: ClubRef;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gd: number;
  points: number;
  user: boolean;
}

export interface CompetitionView {
  id: string;
  name: string;
  format: 'league' | 'knockout';
  status: 'running' | 'finished';
  champion: string | null;
  table: TableRow[];
  userFixtures: FixtureView[];
}

export interface View {
  date: string;
  manager: string;
  club: ClubRef & { colors: [string, string] };
  /** Próximo jogo do usuário; `today` = o avanço parou no dia dele. */
  next: (FixtureView & { today: boolean }) | null;
  standing: { competition: string; pos: number; points: number } | null;
  results: FixtureView[];
  news: NewsItem[];
  squad: PlayerView[];
  lineup: { formation: string; xi: { pos: Position; x: number; y: number; playerId: string | null }[]; bench: string[]; reserves: string[] };
  formations: string[];
  competitions: CompetitionView[];
  finance: { balance: number; wages: number; totals: Record<string, number>; entries: { date: string; label: string; value: number; detail?: string }[] };
  saveSize: number;
}
