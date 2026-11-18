/**
 * Copas continentais: classificação, sorteio dos grupos e cruzamentos.
 *
 * Regulamento real (Conmebol) em escala reduzida para o universo do jogo
 * (40 clubes brasileiros + 8 convidados sul-americanos):
 *
 * - Vagas do Brasil, nesta ordem de prioridade (critério da CBF): campeão da
 *   Libertadores, campeão da Sul-Americana, campeão da Copa do Brasil e a
 *   Série A em ordem; vagas já ocupadas descem na tabela.
 * - Taça Continental: 8 brasileiros + 8 convidados em 4 grupos. Potes 1 e 2
 *   com os brasileiros (pela ordem de classificação), potes 3 e 4 com os
 *   convidados (pela reputação). Os 2 primeiros vão às quartas; o 3º cai para
 *   o mata-mata da Sul-Continental (como na Libertadores real).
 * - Copa Sul-Continental: os 8 brasileiros seguintes, em 2 grupos. 1º e 2º de
 *   cada grupo enfrentam os 4 terceiros da Taça nas quartas (o "playoff" real
 *   entre 2º da Sul-Americana e 3º da Libertadores).
 * - Quartas e semifinal em ida e volta, sem gol fora de casa; pênaltis no
 *   empate do agregado. Final em jogo único.
 * - Ninguém disputa as duas copas no mesmo ano.
 */
import type { Rng } from '../rng.ts';
import { sortTable } from './standings.ts';
import type { CalendarState, Club, CompetitionInstance } from './types.ts';

const SOUTH_AMERICA = new Set(['BR', 'ARG', 'URU', 'ECU', 'CHI', 'COL', 'PAR', 'PER', 'BOL', 'VEN']);
export const GROUP_NAMES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

function previous(state: CalendarState, defId: string, year: number): CompetitionInstance | undefined {
  return state.competitions[`${defId}@${year - 1}`];
}

/** Ordem de prioridade dos brasileiros para as vagas continentais do ano `year`. */
export function brazilianEntryOrder(state: CalendarState, year: number): string[] {
  const br = new Map(state.clubs.filter((c) => c.country === 'BR').map((c) => [c.id, c]));
  const champ = (id: string) => {
    const c = previous(state, id, year);
    return c?.status === 'finished' && c.championId && br.has(c.championId) ? [c.championId] : [];
  };
  const prevA = previous(state, 'brA', year);
  const table = prevA?.status === 'finished'
    ? sortTable(prevA.table).map((r) => r.clubId)
    // Primeira temporada da carreira: a reputação faz o papel da tabela anterior.
    : [...br.values()].filter((c) => c.division === 'A').sort((a, b) => b.rep - a.rep || a.id.localeCompare(b.id)).map((c) => c.id);
  return [...new Set([...champ('lib'), ...champ('sula'), ...champ('copa'), ...table])];
}

/** Participantes de `lib` e `sula` do ano `year` (calculados juntos para não repetir clubes). */
export function continentalEntrants(state: CalendarState, year: number): { lib: string[]; sula: string[] } {
  const order = brazilianEntryOrder(state, year);
  const guests = state.clubs
    .filter((c) => c.country !== 'BR' && SOUTH_AMERICA.has(c.country))
    .sort((a, b) => b.rep - a.rep || a.id.localeCompare(b.id))
    .map((c) => c.id);
  const libBr = order.slice(0, 16 - Math.min(8, guests.length));
  const lib = [...libBr, ...guests.slice(0, 8)];
  const sula = order.filter((id) => !lib.includes(id)).slice(0, 8);
  return { lib, sula };
}

/**
 * Sorteio por potes: `seeded` já vem na ordem de força; cada grupo recebe um
 * clube de cada pote.
 */
export function drawGroups(seeded: readonly string[], groups: number, rng: Rng): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (let g = 0; g < groups; g++) out[GROUP_NAMES[g]!] = [];
  for (let pot = 0; pot * groups < seeded.length; pot++) {
    const drawn = rng.shuffle(seeded.slice(pot * groups, (pot + 1) * groups));
    drawn.forEach((id, g) => out[GROUP_NAMES[g]!]!.push(id));
  }
  return out;
}

/** Classificação final de um grupo. */
export function groupStanding(comp: CompetitionInstance, group: string): string[] {
  const members = new Set(comp.groups?.[group] ?? []);
  return sortTable(comp.table.filter((r) => members.has(r.clubId))).map((r) => r.clubId);
}

/**
 * Quartas da Taça: 1º de um grupo contra o 2º de outro (nunca do mesmo grupo);
 * o 1º decide em casa. Retorna pares [mandante da ida, mandante da volta].
 */
export function libQuarterPairs(comp: CompetitionInstance): [string, string][] {
  const names = Object.keys(comp.groups ?? {}).sort();
  const pairs: [string, string][] = [];
  for (let i = 0; i < names.length; i++) {
    const winner = groupStanding(comp, names[i]!)[0]!;
    const runnerUp = groupStanding(comp, names[(i % 2 === 0 ? i + 1 : i - 1) % names.length]!)[1]!;
    pairs.push([runnerUp, winner]);
  }
  return pairs;
}

/** Quartas da Sul-Continental: os 4 classificados dos grupos contra os 3º da Taça (sorteio); quem vem da Sul decide em casa. */
export function sulaQuarterPairs(comp: CompetitionInstance, libThirds: readonly string[], rng: Rng): [string, string][] {
  const own = Object.keys(comp.groups ?? {}).sort().flatMap((g) => groupStanding(comp, g).slice(0, 2));
  if (libThirds.length !== own.length) {
    // Sem os terceiros da Taça (ela não aconteceu), os classificados se cruzam: 2º de um grupo contra o 1º do outro.
    const half = own.length / 2;
    return Array.from({ length: half }, (_, i) => [own[own.length - 1 - i]!, own[i]!] as [string, string]);
  }
  const thirds = rng.shuffle([...libThirds]);
  return own.map((id, i) => [thirds[i]!, id] as [string, string]);
}

export function isSouthAmerican(c: Pick<Club, 'country'>): boolean {
  return SOUTH_AMERICA.has(c.country);
}
