/**
 * Base de dados do jogo e adaptadores para os módulos do core.
 */
import { cycleForDivision, DEFAULT_CYCLES, type Club, type ClubEconomy, type CycleDef, type SquadPlayer } from '@sm/core';
import clubsJson from './data/clubs.json' with { type: 'json' };
import playersJson from './data/players.json' with { type: 'json' };
import type { ClubData, Database, PlayerData } from './types.ts';

export * from './types.ts';
export * from './convert.ts';
export * from './validate.ts';
export * from './career.ts';

/** Base inicial do jogo (cópia nova a cada chamada: a carreira pode alterá-la). */
export function loadDatabase(): Database {
  return structuredClone({ version: 1, clubs: clubsJson as unknown as ClubData[], players: playersJson as unknown as PlayerData[] });
}

/** Clubes no formato do calendário (só os que disputam ligas ou copas nacionais). */
export function calendarClubs(db: Database): Club[] {
  return db.clubs.filter((c) => c.division !== null).map((c) => ({ id: c.id, country: c.country, division: c.division!, rep: c.rep }));
}

/** Elenco no formato do módulo de escalação, com o estado inicial de uma carreira. */
export function squadOf(db: Database, clubId: string): SquadPlayer[] {
  return db.players
    .filter((p) => p.clubId === clubId)
    .map((p) => ({
      id: p.id,
      name: p.name,
      clubId,
      pos: p.pos,
      positions: p.positions,
      ovr: p.ovr,
      attrs: p.attrs,
      form: 70,
      morale: 70,
      fitness: 100,
      injuredUntil: null,
    }));
}

/** Dados econômicos do clube para o módulo de finanças. */
export function clubEconomy(db: Database, clubId: string, cycles: readonly CycleDef[] = DEFAULT_CYCLES): ClubEconomy {
  const c = db.clubs.find((x) => x.id === clubId);
  if (!c || !c.division) throw new Error(`Clube sem liga: ${clubId}`);
  const cycle = cycleForDivision(cycles, c.division);
  if (!cycle) throw new Error(`Divisão sem ciclo de temporada: ${c.division}`);
  return { capacity: c.stadium?.capacity ?? 20_000, fanbase: c.fanbase, rep: c.rep, baseBudget: c.baseBudget, cycleId: cycle.id };
}
