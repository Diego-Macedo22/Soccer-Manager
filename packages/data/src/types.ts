/**
 * Modelo da base de dados estática (clubes e jogadores no início do jogo).
 * Estado dinâmico (moral, forma, lesões, estatísticas) não fica aqui: nasce
 * na carreira e vai para o save.
 */
import type { PlayerAttributes, Position } from '@sm/core';

export type Division = 'A' | 'B' | 'PL' | 'LL';

export interface ClubData {
  /** Id interno estável (nunca exibido). */
  id: string;
  name: string;
  abbr: string;
  /** Código do país: BR, ENG, ESP, ARG, URU, ECU… */
  country: string;
  /** Liga atual; `null` para convidados continentais. */
  division: Division | null;
  guest: boolean;
  rep: number;
  /** Orçamento-base (caixa inicial e aporte de temporada). */
  baseBudget: number;
  /** Teto mensal de salários. */
  wageBudget: number;
  colors: [string, string];
  stadium: { name: string; capacity: number } | null;
  /** Número de torcedores. */
  fanbase: number;
}

export interface PlayerData {
  /** `p` + 5 dígitos. Não depende do nome (B15). */
  id: string;
  name: string;
  /** `null` = sem clube (passe livre). */
  clubId: string | null;
  nationality: string;
  age: number;
  pos: Position;
  positions: Position[];
  ovr: number;
  pot: number;
  attrs: PlayerAttributes;
  /** Salário mensal. */
  wage: number;
  value: number;
  /** Anos restantes de contrato. */
  contract: number;
  traits: string[];
  /** `true` = criado para completar o elenco (não veio da base original). */
  generated: boolean;
}

export interface Database {
  version: number;
  clubs: ClubData[];
  players: PlayerData[];
}

export interface DataIssue {
  code: string;
  message: string;
}
