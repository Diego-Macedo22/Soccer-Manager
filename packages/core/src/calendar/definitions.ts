/**
 * Definições estáticas das competições, agrupadas em ciclos de temporada.
 *
 * Cada ciclo (Brasil, Inglaterra, Espanha) tem o próprio calendário e abre a
 * temporada seguinte sozinho — não existe mais "virada global" que apaga tudo
 * (B3) nem data fixa que faz o tempo voltar (B2).
 */
import type { IsoDate } from '../dates.ts';

export interface LeagueDef {
  format: 'league';
  id: string;
  name: string;
  /** Participam os clubes com esta divisão no momento da abertura. */
  division: string;
  /** `MM-DD` do primeiro jogo, no ano de início da temporada. */
  firstMatch: string;
  intervalDays: number;
  doubleRoundRobin: boolean;
}

export interface KnockoutDef {
  format: 'knockout';
  id: string;
  name: string;
  /** Só clubes deste país (B16: a Copa Nacional era preenchida por ingleses e espanhóis). */
  country: string;
  /** Número de participantes (potência de 2); os de maior reputação entram. */
  size: number;
  firstMatch: string;
  roundGapDays: number;
  /** 2 = ida e volta em todas as fases (Copa do Brasil a partir da 3ª fase). */
  legs?: 1 | 2;
}

/**
 * Copa continental: fase de grupos (4 clubes, turno e returno) e mata-mata em
 * ida e volta, sem gol fora de casa (abolido pela Conmebol em 2022), com final
 * em jogo único. `entry` define quem se classifica (continental.ts).
 */
export interface ContinentalDef {
  format: 'continental';
  id: string;
  name: string;
  entry: 'lib' | 'sula';
  /** Número de grupos de 4. */
  groups: number;
  groupsFirst: string;
  groupInterval: number;
  /** Datas (MM-DD) da ida de cada fase de mata-mata antes da final; a volta é 7 dias depois. */
  knockout: string[];
  final: string;
}

export type CompetitionDef = LeagueDef | KnockoutDef | ContinentalDef;

export interface PromotionRule {
  /** Id da liga de cima e da de baixo (definições do mesmo ciclo). */
  upper: string;
  lower: string;
  count: number;
}

export interface CycleDef {
  id: string;
  name: string;
  /** `calendar` = temporada "2026"; `split` = temporada "2026/27". */
  yearStyle: 'calendar' | 'split';
  /** `MM-DD` em que a temporada é criada (antes do primeiro jogo). */
  openOn: string;
  competitions: CompetitionDef[];
  promotion?: PromotionRule[];
}

export function seasonKey(cycle: Pick<CycleDef, 'yearStyle'>, year: number): string {
  return cycle.yearStyle === 'calendar' ? String(year) : `${year}/${String((year + 1) % 100).padStart(2, '0')}`;
}

export function cycleOpenDate(cycle: Pick<CycleDef, 'openOn'>, year: number): IsoDate {
  return `${year}-${cycle.openOn}`;
}

export function competitionInstanceId(defId: string, key: string): string {
  return `${defId}@${key}`;
}

export function findCompetitionDef(cycles: readonly CycleDef[], defId: string): { cycle: CycleDef; def: CompetitionDef } {
  for (const cycle of cycles) {
    const def = cycle.competitions.find((d) => d.id === defId);
    if (def) return { cycle, def };
  }
  throw new Error(`Competição sem definição: ${defId}`);
}

/** Ciclo cuja liga recebe clubes desta divisão (para saber quando a carreira começa). */
export function cycleForDivision(cycles: readonly CycleDef[], division: string): CycleDef | undefined {
  return cycles.find((c) => c.competitions.some((d) => d.format === 'league' && d.division === division));
}

/** Competições do jogo, com as mesmas datas e formatos da v0.5. */
export const DEFAULT_CYCLES: readonly CycleDef[] = [
  {
    id: 'BR',
    name: 'Brasil',
    yearStyle: 'calendar',
    openOn: '01-10',
    competitions: [
      { format: 'league', id: 'brA', name: 'Liga Nacional Série A', division: 'A', firstMatch: '02-01', intervalDays: 7, doubleRoundRobin: true },
      { format: 'league', id: 'brB', name: 'Liga Nacional Série B', division: 'B', firstMatch: '02-01', intervalDays: 7, doubleRoundRobin: true },
      { format: 'knockout', id: 'copa', name: 'Copa Nacional', country: 'BR', size: 32, firstMatch: '03-10', roundGapDays: 28, legs: 2 },
      // Taça Continental (Libertadores): 16 clubes, 4 grupos; 1º e 2º às quartas, 3º à Sul-Continental.
      { format: 'continental', id: 'lib', name: 'Taça Continental', entry: 'lib', groups: 4, groupsFirst: '04-08', groupInterval: 7, knockout: ['08-05', '09-23'], final: '11-28' },
      // Copa Sul-Continental (Sul-Americana): 8 clubes, 2 grupos; 1º e 2º encaram os 3º da Taça nas quartas.
      { format: 'continental', id: 'sula', name: 'Copa Sul-Continental', entry: 'sula', groups: 2, groupsFirst: '04-09', groupInterval: 7, knockout: ['08-06', '09-24'], final: '11-21' },
    ],
    promotion: [{ upper: 'brA', lower: 'brB', count: 4 }],
  },
  {
    id: 'ENG',
    name: 'Inglaterra',
    yearStyle: 'split',
    openOn: '07-01',
    competitions: [
      { format: 'league', id: 'pl', name: 'Liga Inglesa', division: 'PL', firstMatch: '08-21', intervalDays: 7, doubleRoundRobin: true },
    ],
  },
  {
    id: 'ESP',
    name: 'Espanha',
    yearStyle: 'split',
    openOn: '07-01',
    competitions: [
      { format: 'league', id: 'laliga', name: 'Liga Espanhola', division: 'LL', firstMatch: '08-15', intervalDays: 7, doubleRoundRobin: true },
    ],
  },
];
