/**
 * Camada de jogo: liga calendário, finanças, elenco, evolução e save numa
 * carreira. É a única peça que a interface (Fase 3) precisa chamar.
 *
 * Tudo reage aos eventos do calendário (`onEvent`), na data em que acontecem:
 * - jogo disputado → bilheteria, jogos na temporada dos titulares;
 * - semana → produtos, lesões do elenco do usuário (escalação reconciliada e avisada);
 * - mês → folha salarial e evolução de todos os jogadores;
 * - temporada aberta → idade +1, contagem de jogos zerada, aporte e compactação do save;
 * - competição encerrada → notícia.
 * Determinístico: mesma semente e mesmas decisões = mesma carreira, em qualquer ritmo de avanço.
 */
import {
  advanceTo,
  autoLineup,
  calendarSnapshot,
  compactCalendar,
  createFinanceListener,
  createRng,
  developMonth,
  effectiveOvr,
  financeSnapshot,
  involves,
  lineupSnapshot,
  nextFixture,
  reconcileLineup,
  recordResult,
  readSave,
  writeSave,
  capNews,
  type CalendarEvent,
  type CalendarState,
  type CareerState,
  type Fixture,
  type InvariantSnapshot,
  type LineupChange,
  type ResultProvider,
  type SaveStore,
  type SquadPlayer,
  type IsoDate,
  type WriteResult,
} from '@sm/core';
import { clubEconomy, createCareer, type Database, type NewCareerOptions } from '@sm/data';

/** Chance de lesão no elenco do usuário a cada 30 dias (dificuldade normal da v0.5). */
export const INJURY_RATE_30_DAYS = 0.1;
const INJURIES: [string, number, number][] = [
  ['Contusão leve', 5, 10], ['Torção no tornozelo', 14, 24], ['Distensão muscular', 14, 28], ['Lesão na panturrilha', 20, 40],
  ['Entorse no joelho', 25, 45], ['Lesão no posterior da coxa', 21, 50], ['Fratura no pé', 45, 80], ['Ruptura do LCA', 160, 210],
];

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function addDays(date: IsoDate, n: number): IsoDate {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export class Game {
  readonly db: Database;
  state: CareerState;
  private readonly finance: ReturnType<typeof createFinanceListener>;
  private readonly base: Map<string, Database['players'][number]>;
  /** Elencos montados a partir do estado; limpo sempre que um jogador muda (resultado idêntico, só mais rápido). */
  private squads: Map<string, SquadPlayer[]> | null = null;

  constructor(db: Database, state: CareerState) {
    this.db = db;
    this.state = state;
    this.base = new Map(db.players.map((p) => [p.id, p]));
    const economy = clubEconomy(db, state.userClubId);
    const reps = new Map(db.clubs.map((c) => [c.id, c.rep]));
    this.finance = createFinanceListener(state.finance, {
      club: () => economy,
      monthlyWages: () => Object.values(this.state.players).filter((p) => p.clubId === this.state.userClubId).reduce((s, p) => s + p.wage, 0),
      fanConfidence: () => 70,
      clubRep: (id) => reps.get(id) ?? 60,
    });
  }

  static create(db: Database, o: NewCareerOptions): Game {
    return new Game(db, createCareer(db, o));
  }

  squad(clubId = this.state.userClubId): SquadPlayer[] {
    if (!this.squads) {
      this.squads = new Map();
      for (const [id, d] of Object.entries(this.state.players)) {
        if (!d.clubId) continue;
        const b = this.base.get(id);
        const list = this.squads.get(d.clubId) ?? [];
        list.push({ id, name: b?.name ?? id, clubId: d.clubId, pos: d.pos, positions: b?.positions ?? [d.pos], ovr: d.ovr, attrs: d.attrs, form: d.form, morale: d.morale, fitness: d.fitness, injuredUntil: d.injuredUntil });
        this.squads.set(d.clubId, list);
      }
    }
    return [...(this.squads.get(clubId) ?? [])];
  }

  private changed(): void {
    this.squads = null;
  }

  get date(): IsoDate {
    return this.state.calendar.date;
  }

  /** Próximo jogo do clube do usuário. */
  nextUserFixture(): Fixture | null {
    return nextFixture(this.state.calendar, involves(this.state.userClubId));
  }

  /**
   * Avança até `target`. Com `stopAtUserMatch`, para no dia do próximo jogo do
   * usuário (para jogar ao vivo); sem ele, o jogo do usuário é simulado.
   */
  advance(target: IsoDate, opts: { stopAtUserMatch?: boolean } = {}): { events: CalendarEvent[]; pausedAt: string | null } {
    const r = advanceTo(this.state.calendar, target, {
      play: this.play,
      onEvent: this.onEvent,
      ...(opts.stopAtUserMatch ? { pauseOn: involves(this.state.userClubId) } : {}),
    });
    capNews(this.state);
    return r;
  }

  /** Registra o resultado do jogo do usuário disputado ao vivo. */
  playUserMatch(fixtureId: string, result: { home: number; away: number; winnerId?: string | null }): CalendarEvent[] {
    return recordResult(this.state.calendar, fixtureId, result, { onEvent: this.onEvent });
  }

  /** Visão completa para as invariantes (calendário + finanças + escalação). */
  snapshot(): InvariantSnapshot {
    return { ...calendarSnapshot(this.state.calendar, this.state.userClubId), ...financeSnapshot(this.state.finance), ...lineupSnapshot(this.state.lineup, this.squad()) };
  }

  save(store: SaveStore, slot: string): Promise<WriteResult> {
    return writeSave(store, slot, this.state);
  }

  static async load(db: Database, store: SaveStore, slot: string): Promise<Game | null> {
    const r = await readSave(store, slot);
    if (!r) return null;
    if (!r.ok) throw new Error(`Save inválido: ${r.reason} (${r.detail})`);
    return new Game(db, r.state);
  }

  // -------------------------------------------------------------------------

  /** Força do XI: usuário com a escalação escolhida; IA com a automática. */
  private strength(clubId: string, date: IsoDate): number {
    const squad = this.squad(clubId);
    const byId = new Map(squad.map((p) => [p.id, p]));
    const xi = clubId === this.state.userClubId ? this.state.lineup.xi : autoLineup(squad, '4-2-3-1', date).xi;
    const filled = xi.filter((s) => s.playerId && byId.has(s.playerId));
    const sum = filled.reduce((s, x) => s + effectiveOvr(byId.get(x.playerId!)!, x.pos) * (0.75 + byId.get(x.playerId!)!.fitness / 400), 0);
    return sum / 11;
  }

  /** Modelo rápido da v0.4 (Poisson pela diferença de força) até o motor de partida da Fase 4. */
  private readonly play: ResultProvider = (f, { rng, state }) => {
    const d = (this.strength(f.home, state.date) - this.strength(f.away, state.date)) / 7;
    return { home: rng.poisson(clamp(1.44 + d * 0.48, 0.15, 3.6)), away: rng.poisson(clamp(1.04 - d * 0.48, 0.12, 3.3)) };
  };

  private news(date: IsoDate, title: string, body = ''): void {
    this.state.news.push({ date, title, body });
  }

  private readonly onEvent = (e: CalendarEvent, cal: CalendarState): void => {
    this.finance(e, cal);
    switch (e.type) {
      case 'fixture-played':
        return this.countAppearances(cal.fixtures[e.fixtureId]!, cal.date);
      case 'tick':
        if (e.tick === 'monthly') this.developAll(cal);
        else this.injuries(e.date);
        return;
      case 'season-opened':
        return this.seasonOpened(e, cal);
      case 'competition-finished': {
        const comp = cal.competitions[e.competitionId]!;
        const champion = this.db.clubs.find((c) => c.id === e.championId)?.name ?? '—';
        if (comp.participants.includes(this.state.userClubId) || comp.format === 'league') this.news(e.date, `${comp.name} ${comp.seasonKey}: campeão ${champion}`);
        return;
      }
      default:
        return;
    }
  };

  private countAppearances(f: Fixture, date: IsoDate): void {
    for (const club of [f.home, f.away]) {
      const ids = club === this.state.userClubId ? this.state.lineup.xi.map((s) => s.playerId) : autoLineup(this.squad(club), '4-2-3-1', date).xi.map((s) => s.playerId);
      for (const id of ids) {
        const p = id ? this.state.players[id] : undefined;
        if (p) {
          p.appsThisSeason++;
          p.fitness = clamp(p.fitness - 12, 35, 100);
        }
      }
    }
    this.changed();
  }

  private developAll(cal: CalendarState): void {
    const leagueStart = new Map<string, IsoDate>();
    for (const c of Object.values(cal.competitions)) {
      if (c.format === 'league' && c.status === 'running') for (const id of c.participants) leagueStart.set(id, c.firstMatchDate);
    }
    for (const p of Object.values(this.state.players)) {
      p.fitness = clamp(p.fitness + 30, 0, 100);
      if (!p.clubId) continue;
      const start = leagueStart.get(p.clubId);
      const months = start && start < cal.date ? Math.max(1, Math.round((Date.parse(cal.date) - Date.parse(start)) / (30.4 * 86_400_000))) : 1;
      developMonth(p, { appsThisSeason: p.appsThisSeason, monthsIntoSeason: months });
    }
    this.changed();
  }

  private injuries(date: IsoDate): void {
    const rng = createRng(this.state.seed).derive(`injury:${date}`);
    if (!rng.chance(1 - (1 - INJURY_RATE_30_DAYS) ** (7 / 30))) return;
    const pool = this.squad().filter((p) => !p.injuredUntil || p.injuredUntil < date);
    if (!pool.length) return;
    const victim = rng.pick(pool.sort((a, b) => a.id.localeCompare(b.id)));
    const [name, min, max] = rng.pick(INJURIES);
    const days = rng.int(min, max);
    this.state.players[victim.id]!.injuredUntil = addDays(date, days);
    this.changed();
    this.news(date, `🏥 ${victim.name} lesionado`, `${name} • ${days} dias fora.`);
    this.reconcile(date);
  }

  private reconcile(date: IsoDate): LineupChange[] {
    const { lineup, changes } = reconcileLineup(this.state.lineup, this.squad(), date);
    this.state.lineup = lineup;
    const names = new Map(this.squad().map((p) => [p.id, p.name]));
    for (const c of changes) {
      if (c.type === 'replaced') this.news(date, 'Escalação ajustada', `${names.get(c.playerId)} entra como ${c.pos}.`);
    }
    return changes;
  }

  private seasonOpened(e: Extract<CalendarEvent, { type: 'season-opened' }>, cal: CalendarState): void {
    const clubs = new Set(Object.values(cal.competitions).filter((c) => c.cycleId === e.cycleId && c.seasonKey === e.seasonKey).flatMap((c) => c.participants));
    // A primeira temporada do ciclo é a do início da carreira: ninguém envelhece nela.
    const firstSeason = !Object.values(cal.competitions).some((c) => c.cycleId === e.cycleId && c.seasonKey !== e.seasonKey);
    for (const p of Object.values(this.state.players)) {
      if (firstSeason) break;
      if (p.clubId && clubs.has(p.clubId)) {
        p.age++;
        p.appsThisSeason = 0;
        p.contract = Math.max(0, p.contract - 1);
      }
    }
    this.changed();
    compactCalendar(cal);
    if (clubs.has(this.state.userClubId)) {
      this.news(e.date, `Temporada ${e.seasonKey}`, 'Calendário publicado.');
      this.reconcile(e.date);
    }
  }
}
