/**
 * Calendário do jogo: uma fila de eventos processada em ordem cronológica.
 *
 * Correções em relação ao legado (docs/PLANEJAMENTO-FASE1-COMPLEMENTO.md, 1.3):
 * - B2: a data só avança; `advanceTo` recusa datas anteriores.
 * - B3/B11: cada ciclo abre a própria temporada e só depois que a anterior terminou.
 * - B4: jogos criados durante um avanço (fases de copa) entram na fila e são
 *   processados no mesmo avanço.
 * - B16: copas nacionais só aceitam clubes do país.
 * - B18: eventos semanais e mensais rodam na própria data, um a um.
 * Resultado: avançar em um salto ou em muitos passos produz o mesmo estado.
 */
import { addDays, compareDates, type IsoDate } from '../dates.ts';
import { createRng } from '../rng.ts';
import type { InvariantSnapshot } from '../invariants.ts';
import {
  DEFAULT_CYCLES,
  competitionInstanceId,
  cycleOpenDate,
  findCompetitionDef,
  seasonKey,
  type CompetitionDef,
  type ContinentalDef,
  type CycleDef,
  type KnockoutDef,
  type LeagueDef,
} from './definitions.ts';
import { floorPowerOfTwo, knockoutPairs, knockoutRoundName, roundRobin } from './schedule.ts';
import { continentalEntrants, drawGroups, groupStanding, libQuarterPairs, sulaQuarterPairs } from './continental.ts';
import { applyToTable, emptyTable, sortTable } from './standings.ts';
import type {
  AgendaEntry,
  AgendaInput,
  CalendarEvent,
  CalendarState,
  Club,
  CompetitionInstance,
  Fixture,
  RawResult,
  ResultProvider,
  TickKind,
} from './types.ts';

export interface CreateCalendarOptions {
  seed: number | string;
  /** Data inicial do mundo (o legado usava 05/01). */
  startDate: IsoDate;
  /** Ano da primeira temporada de cada ciclo. */
  startYear: number;
  clubs: readonly Club[];
  cycles?: readonly CycleDef[];
}

export interface AdvanceOptions {
  play: ResultProvider;
  /** Para antes de um jogo (ex.: o do usuário, que será jogado ao vivo). */
  pauseOn?: (fixture: Fixture) => boolean;
  /** Chamado na data exata de cada evento periódico (folha, mercado, base…). */
  onTick?: (tick: TickKind, state: CalendarState) => void;
  /**
   * Chamado no momento em que cada evento acontece (jogo disputado, temporada
   * aberta, competição encerrada…), com o mundo naquela data. É por aqui que
   * finanças, mercado e notícias reagem ao calendário.
   */
  onEvent?: EventListener;
  cycles?: readonly CycleDef[];
}

export type EventListener = (event: CalendarEvent, state: CalendarState) => void;

/** Destino dos eventos internos: guarda na lista e avisa o ouvinte na hora. */
interface EventSink {
  push(event: CalendarEvent): unknown;
}

function sink(events: CalendarEvent[], state: CalendarState, listener?: EventListener): EventSink {
  return {
    push(event) {
      events.push(event);
      listener?.(event, state);
    },
  };
}

export interface AdvanceResult {
  events: CalendarEvent[];
  /** Jogo em que o avanço parou por `pauseOn`, ou `null` se chegou à data-alvo. */
  pausedAt: string | null;
}

const KIND_ORDER: Record<AgendaEntry['kind'], number> = { 'cycle-open': 0, monthly: 1, weekly: 2, fixture: 3 };

function laterOf(a: IsoDate, b: IsoDate): IsoDate {
  return compareDates(a, b) >= 0 ? a : b;
}

function firstOfNextMonth(date: IsoDate): IsoDate {
  const [y, m] = date.split('-').map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
}

function agendaLess(a: AgendaEntry, b: AgendaEntry): boolean {
  const d = compareDates(a.date, b.date);
  if (d !== 0) return d < 0;
  const k = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
  return k !== 0 ? k < 0 : a.seq < b.seq;
}

function enqueue(state: CalendarState, input: AgendaInput): void {
  const entry = { ...input, seq: state.nextSeq++ } as AgendaEntry;
  let lo = 0;
  let hi = state.agenda.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (agendaLess(state.agenda[mid]!, entry)) lo = mid + 1;
    else hi = mid;
  }
  state.agenda.splice(lo, 0, entry);
}

export function createCalendar(o: CreateCalendarOptions): CalendarState {
  const cycles = o.cycles ?? DEFAULT_CYCLES;
  const state: CalendarState = {
    seed: createRng(o.seed).seed,
    date: o.startDate,
    clubs: o.clubs.map((c) => ({ ...c })),
    competitions: {},
    fixtures: {},
    agenda: [],
    nextSeq: 0,
    cycles: {},
  };
  for (const cycle of cycles) {
    state.cycles[cycle.id] = { openedYear: null, waitingYear: null };
    enqueue(state, { kind: 'cycle-open', cycleId: cycle.id, year: o.startYear, date: laterOf(cycleOpenDate(cycle, o.startYear), o.startDate) });
  }
  enqueue(state, { kind: 'weekly', date: addDays(o.startDate, 7) });
  enqueue(state, { kind: 'monthly', date: firstOfNextMonth(o.startDate) });
  return state;
}

/** Avança o tempo até `target`, processando tudo em ordem cronológica. */
export function advanceTo(state: CalendarState, target: IsoDate, opts: AdvanceOptions): AdvanceResult {
  if (compareDates(target, state.date) < 0) {
    throw new RangeError(`O tempo não volta: ${target} é anterior à data atual ${state.date}`);
  }
  const cycles = opts.cycles ?? DEFAULT_CYCLES;
  const events: CalendarEvent[] = [];
  const out = sink(events, state, opts.onEvent);
  for (;;) {
    const next = state.agenda[0];
    if (!next || compareDates(next.date, target) > 0) break;
    if (next.kind === 'fixture' && opts.pauseOn) {
      const f = state.fixtures[next.fixtureId];
      if (f && !f.result && opts.pauseOn(f)) {
        state.date = laterOf(state.date, next.date);
        return { events, pausedAt: f.id };
      }
    }
    state.agenda.shift();
    state.date = laterOf(state.date, next.date);
    handle(state, next, opts, cycles, out);
  }
  state.date = target;
  return { events, pausedAt: null };
}

/** Registra o resultado de um jogo disputado fora do avanço automático (ex.: ao vivo). */
export function recordResult(
  state: CalendarState,
  fixtureId: string,
  result: RawResult,
  opts: { cycles?: readonly CycleDef[]; onEvent?: EventListener } = {},
): CalendarEvent[] {
  const cycles = opts.cycles ?? DEFAULT_CYCLES;
  const f = state.fixtures[fixtureId];
  if (!f) throw new Error(`Jogo inexistente: ${fixtureId}`);
  if (f.result) throw new Error(`Jogo já disputado: ${fixtureId}`);
  if (compareDates(f.date, state.date) > 0) throw new Error(`Jogo ${fixtureId} é em ${f.date}; hoje é ${state.date}`);
  state.agenda = state.agenda.filter((e) => !(e.kind === 'fixture' && e.fixtureId === fixtureId));
  const events: CalendarEvent[] = [];
  applyResult(state, f, result, cycles, sink(events, state, opts.onEvent));
  return events;
}

/** Próximo jogo ainda não disputado que satisfaz o filtro (ex.: do clube do usuário). */
export function nextFixture(state: CalendarState, filter: (f: Fixture) => boolean): Fixture | null {
  for (const e of state.agenda) {
    if (e.kind !== 'fixture') continue;
    const f = state.fixtures[e.fixtureId];
    if (f && !f.result && filter(f)) return f;
  }
  return null;
}

export function involves(clubId: string): (f: Fixture) => boolean {
  return (f) => f.home === clubId || f.away === clubId;
}

// ---------------------------------------------------------------------------

function handle(state: CalendarState, e: AgendaEntry, opts: AdvanceOptions, cycles: readonly CycleDef[], events: EventSink): void {
  switch (e.kind) {
    case 'weekly':
    case 'monthly': {
      events.push({ type: 'tick', date: e.date, tick: e.kind });
      opts.onTick?.(e.kind, state);
      enqueue(state, { kind: e.kind, date: e.kind === 'weekly' ? addDays(e.date, 7) : firstOfNextMonth(e.date) });
      return;
    }
    case 'cycle-open': {
      const cycle = cycles.find((c) => c.id === e.cycleId);
      if (!cycle) throw new Error(`Ciclo sem definição: ${e.cycleId}`);
      openSeason(state, cycle, e.year, events);
      return;
    }
    case 'fixture': {
      const f = state.fixtures[e.fixtureId];
      if (!f || f.result) return;
      const competition = state.competitions[f.competitionId]!;
      const raw = opts.play(f, { state, competition, rng: createRng(state.seed).derive(`match:${f.id}`) });
      applyResult(state, f, raw, cycles, events);
      return;
    }
  }
}

function applyResult(
  state: CalendarState,
  f: Fixture,
  raw: RawResult,
  cycles: readonly CycleDef[],
  events: EventSink,
): void {
  const comp = state.competitions[f.competitionId];
  if (!comp) throw new Error(`Competição inexistente: ${f.competitionId}`);
  if (!Number.isInteger(raw.home) || !Number.isInteger(raw.away) || raw.home < 0 || raw.away < 0) {
    throw new RangeError(`Placar inválido em ${f.id}: ${raw.home} x ${raw.away}`);
  }
  if (raw.goals && (raw.goals.filter((g) => g[0] === 0).length !== raw.home || raw.goals.filter((g) => g[0] === 1).length !== raw.away)) {
    throw new RangeError(`Gols não batem com o placar em ${f.id}`);
  }
  let winnerId: string | null = raw.home > raw.away ? f.home : raw.away > raw.home ? f.away : null;
  let penalties = false;
  // Jogo que decide confronto: mata-mata de jogo único ou a volta de um ida e volta.
  const decisive = isKnockoutFixture(comp, f) && f.leg !== 1;
  if (decisive && f.leg === 2) {
    // Agregado, sem gol fora de casa (abolido pela Conmebol em 2022 e pela CBF na Copa do Brasil).
    const first = comp.fixtureIds.map((id) => state.fixtures[id]!).find((x) => x.round === f.round && x.leg === 1 && x.home === f.away && x.away === f.home);
    const aggHome = raw.home + (first?.result?.away ?? 0);
    const aggAway = raw.away + (first?.result?.home ?? 0);
    winnerId = aggHome > aggAway ? f.home : aggAway > aggHome ? f.away : null;
  }
  if (winnerId === null && decisive) {
    penalties = true;
    winnerId =
      raw.winnerId === f.home || raw.winnerId === f.away
        ? raw.winnerId
        : createRng(state.seed).derive(`pens:${f.id}`).chance(0.5)
          ? f.home
          : f.away;
  }
  const goals = raw.goals?.length ? { goals: raw.goals } : {};
  f.result = penalties ? { home: raw.home, away: raw.away, winnerId, penalties, ...goals } : { home: raw.home, away: raw.away, winnerId, ...goals };
  events.push({ type: 'fixture-played', date: state.date, fixtureId: f.id });

  if (comp.format === 'league') {
    applyToTable(comp.table, f.home, f.away, raw.home, raw.away);
    if (comp.fixtureIds.every((id) => state.fixtures[id]?.result)) finish(state, comp, sortTable(comp.table)[0]?.clubId ?? null, cycles, events);
    return;
  }
  if (comp.format === 'continental' && f.group) {
    applyToTable(comp.table, f.home, f.away, raw.home, raw.away);
    if (comp.fixtureIds.every((id) => state.fixtures[id]?.result)) startContinentalKnockouts(state, cycles);
    return;
  }
  const round = comp.fixtureIds.map((id) => state.fixtures[id]!).filter((x) => x.round === f.round);
  if (round.some((x) => !x.result)) return;
  const winners = round.filter((x) => x.leg !== 1).map((x) => x.result!.winnerId!);
  if (winners.length === 1) {
    finish(state, comp, winners[0]!, cycles, events);
    return;
  }
  const { def } = findCompetitionDef(cycles, comp.defId);
  if (def.format === 'continental') createContinentalRound(state, comp, def, pairUp(winners, createRng(state.seed).derive(`draw:${comp.id}:${f.round + 1}`)), f.round + 1);
  else createKnockoutRound(state, comp, def as KnockoutDef, winners, f.round + 1);
}

function isKnockoutFixture(comp: CompetitionInstance, f: Fixture): boolean {
  return comp.format === 'knockout' || (comp.format === 'continental' && !f.group);
}

function pairUp(ids: string[], rng: ReturnType<typeof createRng>): [string, string][] {
  return knockoutPairs(ids, rng);
}

function finish(state: CalendarState, comp: CompetitionInstance, championId: string | null, cycles: readonly CycleDef[], events: EventSink): void {
  comp.status = 'finished';
  comp.championId = championId;
  events.push({ type: 'competition-finished', date: state.date, competitionId: comp.id, championId });
  for (const cycle of cycles) {
    const waiting = state.cycles[cycle.id]?.waitingYear;
    if (waiting != null) openSeason(state, cycle, waiting, events);
  }
}

function openSeason(state: CalendarState, cycle: CycleDef, year: number, events: EventSink): void {
  const progress = (state.cycles[cycle.id] ??= { openedYear: null, waitingYear: null });
  const running = Object.values(state.competitions).filter((c) => c.cycleId === cycle.id && c.startYear < year && c.status === 'running');
  if (running.length) {
    if (progress.waitingYear !== year) {
      events.push({ type: 'season-delayed', date: state.date, cycleId: cycle.id, year, waitingFor: running.map((c) => c.id) });
    }
    progress.waitingYear = year;
    return;
  }
  progress.waitingYear = null;
  applyPromotion(state, cycle, year - 1, events);
  const key = seasonKey(cycle, year);
  const ids: string[] = [];
  const entrants = cycle.competitions.some((d) => d.format === 'continental') ? continentalEntrants(state, year) : null;
  for (const def of cycle.competitions) {
    const comp =
      def.format === 'league'
        ? createLeague(state, cycle, def, year, key)
        : def.format === 'knockout'
          ? createKnockout(state, cycle, def, year, key)
          : createContinental(state, cycle, def, year, key, entrants![def.entry]);
    if (comp) ids.push(comp.id);
  }
  progress.openedYear = year;
  enqueue(state, { kind: 'cycle-open', cycleId: cycle.id, year: year + 1, date: laterOf(cycleOpenDate(cycle, year + 1), addDays(state.date, 1)) });
  events.push({ type: 'season-opened', date: state.date, cycleId: cycle.id, seasonKey: key, competitionIds: ids });
}

/** Primeiro jogo: a data planejada ou, se a temporada abriu atrasada, uma semana depois da abertura. */
function firstMatchDate(state: CalendarState, year: number, monthDay: string): IsoDate {
  return laterOf(`${year}-${monthDay}`, addDays(state.date, 7));
}

function newInstance(cycle: CycleDef, def: CompetitionDef, year: number, key: string, participants: string[], first: IsoDate): CompetitionInstance {
  return {
    id: competitionInstanceId(def.id, key),
    defId: def.id,
    name: def.name,
    cycleId: cycle.id,
    seasonKey: key,
    startYear: year,
    format: def.format,
    participants,
    status: 'running',
    firstMatchDate: first,
    fixtureIds: [],
    table: def.format === 'knockout' ? [] : emptyTable(participants),
    championId: null,
  };
}

function addFixture(state: CalendarState, comp: CompetitionInstance, f: Omit<Fixture, 'id' | 'competitionId' | 'result'>): void {
  const id = `${comp.id}/r${f.round}/${f.home}-${f.away}`;
  state.fixtures[id] = { id, competitionId: comp.id, result: null, ...f };
  comp.fixtureIds.push(id);
  enqueue(state, { kind: 'fixture', fixtureId: id, date: f.date });
}

function createLeague(state: CalendarState, cycle: CycleDef, def: LeagueDef, year: number, key: string): CompetitionInstance | null {
  const participants = state.clubs.filter((c) => c.division === def.division).map((c) => c.id).sort();
  if (participants.length < 2) return null;
  const comp = newInstance(cycle, def, year, key, participants, firstMatchDate(state, year, def.firstMatch));
  state.competitions[comp.id] = comp;
  const rng = createRng(state.seed).derive(`schedule:${comp.id}`);
  for (const p of roundRobin(participants, comp.firstMatchDate, def.intervalDays, def.doubleRoundRobin, rng)) {
    addFixture(state, comp, { date: p.date, round: p.round, roundName: `Rodada ${p.round}`, home: p.home, away: p.away });
  }
  return comp;
}

function createKnockout(state: CalendarState, cycle: CycleDef, def: KnockoutDef, year: number, key: string): CompetitionInstance | null {
  const eligible = state.clubs
    .filter((c) => c.country === def.country)
    .sort((a, b) => b.rep - a.rep || a.id.localeCompare(b.id));
  const size = Math.min(def.size, floorPowerOfTwo(eligible.length));
  if (size < 2) return null;
  const participants = eligible.slice(0, size).map((c) => c.id);
  const comp = newInstance(cycle, def, year, key, participants, firstMatchDate(state, year, def.firstMatch));
  state.competitions[comp.id] = comp;
  createKnockoutRound(state, comp, def, participants, 1);
  return comp;
}

function createKnockoutRound(state: CalendarState, comp: CompetitionInstance, def: KnockoutDef, clubIds: string[], round: number): void {
  const planned = addDays(comp.firstMatchDate, def.roundGapDays * (round - 1));
  const date = laterOf(planned, addDays(state.date, 1));
  const rng = createRng(state.seed).derive(`draw:${comp.id}:${round}`);
  const name = knockoutRoundName(clubIds.length);
  for (const [home, away] of knockoutPairs(clubIds, rng)) {
    if (def.legs === 2) {
      addFixture(state, comp, { date, round, roundName: `${name} (ida)`, leg: 1, home, away });
      addFixture(state, comp, { date: addDays(date, 7), round, roundName: `${name} (volta)`, leg: 2, home: away, away: home });
    } else addFixture(state, comp, { date, round, roundName: name, home, away });
  }
}

function createContinental(state: CalendarState, cycle: CycleDef, def: ContinentalDef, year: number, key: string, entrants: string[]): CompetitionInstance | null {
  const size = def.groups * 4;
  if (entrants.length < size) return null;
  const participants = entrants.slice(0, size);
  const comp = newInstance(cycle, def, year, key, [...participants].sort(), firstMatchDate(state, year, def.groupsFirst));
  comp.groups = drawGroups(participants, def.groups, createRng(state.seed).derive(`groups:${comp.id}`));
  state.competitions[comp.id] = comp;
  for (const [g, members] of Object.entries(comp.groups)) {
    const rng = createRng(state.seed).derive(`schedule:${comp.id}:${g}`);
    for (const p of roundRobin(members, comp.firstMatchDate, def.groupInterval, true, rng)) {
      addFixture(state, comp, { date: p.date, round: p.round, roundName: `Grupo ${g} • ${p.round}ª rodada`, group: g, home: p.home, away: p.away });
    }
  }
  return comp;
}

/** Fim da fase de grupos: sorteia as quartas (a Sul-Continental espera os terceiros da Taça). */
function startContinentalKnockouts(state: CalendarState, cycles: readonly CycleDef[]): void {
  const groupsDone = (c: CompetitionInstance) => c.fixtureIds.every((id) => state.fixtures[id]?.result || !state.fixtures[id]?.group);
  for (const comp of Object.values(state.competitions)) {
    if (comp.format !== 'continental' || comp.knockoutDrawn || comp.status !== 'running' || !groupsDone(comp)) continue;
    const { def } = findCompetitionDef(cycles, comp.defId);
    const cdef = def as ContinentalDef;
    let pairs: [string, string][];
    if (cdef.entry === 'lib') {
      comp.thirds = Object.keys(comp.groups ?? {}).sort().map((g) => groupStanding(comp, g)[2]!).filter(Boolean);
      pairs = libQuarterPairs(comp);
    } else {
      const lib = Object.values(state.competitions).find((c) => c.format === 'continental' && c.defId !== comp.defId && c.cycleId === comp.cycleId && c.seasonKey === comp.seasonKey);
      if (lib && !lib.knockoutDrawn) continue; // espera a Taça terminar os grupos
      pairs = sulaQuarterPairs(comp, lib?.thirds ?? [], createRng(state.seed).derive(`draw:${comp.id}:ko`));
    }
    comp.knockoutDrawn = true;
    const groupRounds = Math.max(...comp.fixtureIds.map((id) => state.fixtures[id]!.round));
    createContinentalRound(state, comp, cdef, pairs, groupRounds + 1);
  }
}

/** Fase de mata-mata continental: ida e volta, ou jogo único na final. */
function createContinentalRound(state: CalendarState, comp: CompetitionInstance, def: ContinentalDef, pairs: [string, string][], round: number): void {
  const groupRounds = Math.max(...comp.fixtureIds.map((id) => state.fixtures[id]!).filter((f) => f.group).map((f) => f.round));
  const stage = round - groupRounds - 1;
  const final = pairs.length === 1;
  const planned = `${comp.startYear}-${final ? def.final : (def.knockout[stage] ?? def.final)}`;
  const date = laterOf(planned, addDays(state.date, 1));
  const name = knockoutRoundName(pairs.length * 2);
  for (const [home, away] of pairs) {
    if (final) addFixture(state, comp, { date, round, roundName: 'Final (jogo único)', home, away });
    else {
      addFixture(state, comp, { date, round, roundName: `${name} (ida)`, leg: 1, home, away });
      addFixture(state, comp, { date: addDays(date, 7), round, roundName: `${name} (volta)`, leg: 2, home: away, away: home });
    }
  }
}

function applyPromotion(state: CalendarState, cycle: CycleDef, prevYear: number, events: EventSink): void {
  const key = seasonKey(cycle, prevYear);
  for (const rule of cycle.promotion ?? []) {
    const upper = state.competitions[competitionInstanceId(rule.upper, key)];
    const lower = state.competitions[competitionInstanceId(rule.lower, key)];
    if (upper?.status !== 'finished' || lower?.status !== 'finished') continue;
    const upperDef = cycle.competitions.find((d) => d.id === rule.upper) as LeagueDef;
    const lowerDef = cycle.competitions.find((d) => d.id === rule.lower) as LeagueDef;
    const down = sortTable(upper.table).slice(-rule.count).map((r) => r.clubId);
    const up = sortTable(lower.table).slice(0, rule.count).map((r) => r.clubId);
    for (const [ids, from, to] of [
      [down, upperDef.division, lowerDef.division],
      [up, lowerDef.division, upperDef.division],
    ] as const) {
      for (const id of ids) {
        const club = state.clubs.find((c) => c.id === id);
        if (!club) continue;
        club.division = to;
        events.push({ type: 'division-changed', date: state.date, clubId: id, from, to });
      }
    }
  }
}

/** Visão do calendário para as invariantes do core (sem finanças nem elenco). */
export function calendarSnapshot(state: CalendarState, clubId: string): InvariantSnapshot {
  return {
    date: state.date,
    clubId,
    budget: 0,
    ledger: [],
    fixtures: Object.values(state.fixtures).map((f) => ({
      id: f.id,
      competitionId: f.competitionId,
      date: f.date,
      played: f.result !== null,
      home: f.home,
      away: f.away,
    })),
    competitions: Object.values(state.competitions).map((c) => ({ id: c.id, finished: c.status === 'finished' })),
    players: [],
    lineup: null,
  };
}
