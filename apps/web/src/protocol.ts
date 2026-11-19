/** Mensagens entre a interface e o Worker que roda a carreira. */
import type { MatchChange, MatchInput, MatchTimeline, NewsItem, Position, StandingRow } from '@sm/core';

export type Command =
  | { type: 'init' }
  | { type: 'new'; clubId: string; manager: string }
  | { type: 'load' }
  | { type: 'continue' }
  | { type: 'advanceDays'; days: number }
  | { type: 'swap'; a: string; b: string }
  | { type: 'formation'; key: string }
  | { type: 'auto' }
  | { type: 'buy'; id: string; offer: number }
  | { type: 'loanIn'; id: string }
  | { type: 'signFree'; id: string }
  | { type: 'renew'; id: string }
  | { type: 'release'; id: string }
  | { type: 'acceptOffer'; id: string }
  | { type: 'rejectOffer'; id: string }
  | { type: 'upgradeAcademy' }
  | { type: 'signYouth'; id: string }
  | { type: 'dismissYouth'; id: string }
  | { type: 'promoteYouth'; id: string }
  | { type: 'releaseYouth'; id: string }
  | { type: 'preContract'; id: string }
  | { type: 'matchStart' }
  | { type: 'matchChange'; change: MatchChange }
  | { type: 'matchFinish' }
  | { type: 'hireScout' }
  | { type: 'sendScout'; id: string; region: string; months: number }
  | { type: 'takeJob'; clubId: string }
  | { type: 'declineJob'; clubId: string };

export interface BoardView {
  objectives: { title: string; weight: number; status: number }[];
  score: number;
  clubConfidence: number;
  fanConfidence: number;
  rating: number;
  record: { played: number; wins: number; draws: number; losses: number };
  recent: ('win' | 'draw' | 'loss')[];
  history: { season: string; club: string; position: number | null; score: number }[];
  jobOffers: { club: ClubRef; rep: number; expires: string }[];
  sacked: boolean;
  scouts: { id: string; name: string; level: number; accuracy: number; mission: { region: string; end: string } | null; reports: { playerId: string; ovr: number; pot: number }[] }[];
  scoutCost: number;
  scoutLimit: number;
  regions: [string, string][];
}

export interface MarketPlayer {
  id: string;
  name: string;
  club: ClubRef | null;
  pos: Position;
  age: number;
  ovr: number;
  pot: number;
  value: number;
  ask: number;
  wage: number;
  contract: number;
  /** Último ano de contrato e até 6 meses para o fim. */
  preContract: boolean;
}

export interface YouthView {
  id: string;
  name: string;
  pos: Position;
  age: number;
  ovr: number;
  pot: number;
}

export interface MarketView {
  windowOpen: boolean;
  offers: { id: string; player: string; playerId: string; club: ClubRef; type: 'sale' | 'loan'; value: number; expires: string }[];
  players: MarketPlayer[];
  loanedIn: string[];
  precontracts: { playerId: string; name: string; club: string; wage: number; arrives: string | null }[];
  academy: { level: number; maxLevel: number; upgradeCost: number; lastIntake: string | null; candidates: YouthView[]; roster: YouthView[]; limit: number };
}

export type Reply =
  | { type: 'init'; hasSave: boolean; clubs: ClubOption[] }
  | { type: 'view'; view: View; toast?: string }
  | { type: 'match'; match: LiveMatchView }
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
  format: 'league' | 'knockout' | 'continental';
  groups: { name: string; table: TableRow[] }[];
  status: 'running' | 'finished';
  champion: string | null;
  table: TableRow[];
  userFixtures: FixtureView[];
  /** Artilharia (top 10), derivada dos resultados. */
  scorers: { name: string; club: ClubRef; goals: number; assists: number }[];
}

/** Próximos acontecimentos do painel. */
export interface UpcomingItem {
  date: string;
  days: number;
  title: string;
  detail: string;
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
  upcoming: UpcomingItem[];
  squad: PlayerView[];
  lineup: { formation: string; xi: { pos: Position; x: number; y: number; playerId: string | null }[]; bench: string[]; reserves: string[] };
  formations: string[];
  competitions: CompetitionView[];
  finance: { balance: number; wages: number; totals: Record<string, number>; entries: { date: string; label: string; value: number; detail?: string }[] };
  saveSize: number;
  market: MarketView;
  board: BoardView;
}

/** Partida ao vivo: o motor roda no Worker; a tela só reproduz a linha do tempo. */
export interface LiveMatchView {
  fixtureId: string;
  competition: string;
  round: string;
  home: ClubRef & { colors: [string, string] };
  away: ClubRef & { colors: [string, string] };
  userSide: 'home' | 'away';
  input: MatchInput;
  timeline: MatchTimeline;
  names: Record<string, string>;
  changes: MatchChange[];
  /** Os outros jogos do dia. */
  day: LiveRoundView;
}

/** Rodada ao vivo: já decidida no Worker; a tela revela os gols no minuto certo. */
export interface LiveRoundView {
  /** Outros jogos da competição no mesmo dia: placar final e minuto de cada gol (0 = mandante). */
  games: { home: ClubRef; away: ClubRef; final: [number, number]; goals: [0 | 1, number][] }[];
  /** Classificação antes da rodada (só ligas); a tela soma os placares parciais. */
  table: StandingRow[] | null;
  clubs: Record<string, ClubRef>;
}
