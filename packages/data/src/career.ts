/**
 * Criação de carreira e importação de saves da v0.5 (B7).
 */
import {
  DEFAULT_FORMATION,
  SCHEMA_VERSION,
  createMarket,
  createBoard,
  autoLineup,
  createCalendar,
  createFinance,
  createRng,
  ensureCoherent,
  reconcileLineup,
  type CareerState,
  type DevelopingPlayer,
  type Lineup,
  type PlayerDynamic,
  type Position,
  type SquadPlayer,
} from '@sm/core';
import type { Database, PlayerData } from './types.ts';

export interface NewCareerOptions {
  clubId: string;
  manager: string;
  seed: number | string;
  startYear?: number;
}

function dynamicFrom(p: PlayerData): PlayerDynamic {
  return {
    clubId: p.clubId, pos: p.pos, age: p.age, ovr: p.ovr, pot: p.pot, attrs: { ...p.attrs }, wage: p.wage, contract: p.contract,
    form: 70, morale: 70, fitness: 100, injuredUntil: null, devProgress: 0, declineProgress: 0, appsThisSeason: 0,
  };
}

/** Elenco atual de um clube, a partir do estado da carreira. */
export function careerSquad(state: CareerState, db: Database, clubId: string): SquadPlayer[] {
  const base = new Map(db.players.map((p) => [p.id, p]));
  return Object.entries(state.players)
    .filter(([, d]) => d.clubId === clubId)
    .map(([id, d]) => ({
      id, name: base.get(id)?.name ?? id, clubId, pos: d.pos, positions: base.get(id)?.positions ?? [d.pos], ovr: d.ovr, attrs: d.attrs,
      form: d.form, morale: d.morale, fitness: d.fitness, injuredUntil: d.injuredUntil,
    }));
}

export function calendarClubsFrom(db: Database, divisions: Record<string, string | null> = {}) {
  return db.clubs
    // Convidados sul-americanos entram sem liga (divisão INT): só disputam as copas continentais.
    .map((c) => ({ id: c.id, country: c.country, division: (c.id in divisions ? divisions[c.id] : c.division) ?? (c.guest ? 'INT' : null), rep: c.rep }))
    .filter((c): c is { id: string; country: string; division: string; rep: number } => c.division !== null);
}

export function createCareer(db: Database, o: NewCareerOptions): CareerState {
  const club = db.clubs.find((c) => c.id === o.clubId);
  if (!club?.division) throw new Error(`Clube sem liga: ${o.clubId}`);
  const startYear = o.startYear ?? 2026;
  const seed = createRng(o.seed).seed;
  const players = Object.fromEntries(db.players.map((p) => [p.id, dynamicFrom(p)]));
  const state: CareerState = {
    schemaVersion: SCHEMA_VERSION,
    seed,
    manager: o.manager,
    userClubId: club.id,
    calendar: createCalendar({ seed, startDate: `${startYear}-01-05`, startYear, clubs: calendarClubsFrom(db) }),
    finance: createFinance(club.id, club.baseBudget),
    lineup: { formation: DEFAULT_FORMATION, xi: [], bench: [], reserves: [] },
    players,
    market: createMarket(),
    board: createBoard(club),
    news: [{ date: `${startYear}-01-05`, title: 'Bem-vindo ao clube', body: `${o.manager} assume o ${club.name}.` }],
  };
  state.lineup = autoLineup(careerSquad(state, db, club.id), DEFAULT_FORMATION, state.calendar.date);
  return state;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface LegacyImportReport {
  playersImported: number;
  /** Jovens contratados pela base na v0.5 (não existem na base estática). */
  playersSkipped: number;
  fromSeason: string;
  startsAt: string;
}

/**
 * Importa uma carreira da v0.5 (chaves soccerManagerV02/V032/V04/V05).
 *
 * Limitação assumida: a temporada em andamento não é reconstruída (o calendário
 * do legado tinha B2–B4). A carreira continua na temporada seguinte, com clube,
 * técnico, caixa, divisões, transferências e estado dos jogadores preservados.
 */
export function importLegacySave(legacy: any, db: Database, legacyIdMap: Record<string, string>): { state: CareerState; report: LegacyImportReport } {
  if (!legacy?.db?.players || !legacy.clubId) throw new Error('Não é um save da v0.5');
  const userClubId: string = legacy.clubId;
  if (!db.clubs.some((c) => c.id === userClubId)) throw new Error(`Clube do save não existe na base: ${userClubId}`);
  const startYear = (Number(legacy.seasonStartYear) || 2026) + 1;
  const state = createCareer(db, { clubId: userClubId, manager: legacy.manager?.name || 'Técnico', seed: `legacy:${legacy.manager?.name}:${startYear}`, startYear });

  const divisions: Record<string, string | null> = {};
  for (const c of legacy.db.clubs ?? []) if (['A', 'B', 'PL', 'LL'].includes(c.division)) divisions[c.id] = c.division;
  state.calendar = createCalendar({ seed: state.seed, startDate: `${startYear}-01-05`, startYear, clubs: calendarClubsFrom(db, divisions) });

  let imported = 0;
  let skipped = 0;
  for (const lp of legacy.db.players) {
    const id = legacyIdMap[lp.id];
    const cur = id ? state.players[id] : undefined;
    if (!id || !cur) {
      skipped++;
      continue;
    }
    const dev: DevelopingPlayer = {
      pos: lp.pos as Position, age: lp.age, ovr: Math.max(40, Math.min(99, Math.round(lp.ovr))), pot: Math.max(lp.ovr, lp.pot ?? lp.ovr),
      attrs: { ...lp.attrs }, form: lp.form ?? 70, morale: lp.morale ?? 70, devProgress: lp.devProgress ?? 0, declineProgress: lp.declineProgress ?? 0,
    };
    ensureCoherent(dev);
    state.players[id] = {
      ...cur,
      clubId: lp.clubId === 'free_agents' || !db.clubs.some((c) => c.id === lp.clubId) ? null : lp.clubId,
      age: dev.age, ovr: dev.ovr, pot: Math.min(99, dev.pot), attrs: dev.attrs,
      wage: Math.round(lp.wage ?? cur.wage), contract: Math.max(0, Math.round(lp.contract ?? cur.contract)),
      form: dev.form, morale: dev.morale, fitness: 100, injuredUntil: null,
      devProgress: dev.devProgress, declineProgress: dev.declineProgress, appsThisSeason: 0,
    };
    imported++;
  }

  state.finance = createFinance(userClubId, Math.round(Number(legacy.budget) || 0));
  const map = (ids: string[] = []) => ids.map((x) => legacyIdMap[x]).filter((x): x is string => !!x);
  const squad = careerSquad(state, db, userClubId);
  const formation = typeof legacy.formation === 'string' && !legacy.formation.startsWith('custom:') ? legacy.formation : DEFAULT_FORMATION;
  const auto = autoLineup(squad, formation, state.calendar.date);
  const legacyXi: string[] = map((legacy.lineup?.xi ?? []).map((s: any) => s.playerId));
  const draft: Lineup = {
    formation,
    xi: auto.xi.map((s, i) => ({ ...s, playerId: legacyXi[i] ?? s.playerId })),
    bench: map(legacy.lineup?.bench),
    reserves: map(legacy.lineup?.out),
  };
  state.lineup = reconcileLineup(draft, squad, state.calendar.date).lineup;
  state.news.push({ date: state.calendar.date, title: 'Carreira importada da v0.5', body: `Temporada ${legacy.season ?? ''} encerrada; a carreira segue em ${startYear}.` });
  return { state, report: { playersImported: imported, playersSkipped: skipped, fromSeason: String(legacy.season ?? ''), startsAt: state.calendar.date } };
}
