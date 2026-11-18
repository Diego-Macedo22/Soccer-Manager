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
  ACADEMY_LIMIT,
  ACADEMY_MAX_LEVEL,
  LOAN_FEE_RATE,
  MAX_OFFERS,
  MAX_SQUAD,
  MIN_SQUAD,
  OFFER_DAYS,
  academyUpgradeCost,
  buyChance,
  calibrateAttributes,
  marketValue,
  receive,
  spend,
  transferWindowOpen,
  wageDemand,
  youthIntakeDue,
  youthRatings,
  type Position,
  SCOUT_LIMIT,
  PRECONTRACT_DAYS,
  cycleOpenDate,
  DEFAULT_CYCLES,
  boardObjectives,
  createFinance,
  jobRequirement,
  newScout,
  objectiveStatus,
  objectivesScore,
  recordOutcome,
  scoutHireCost,
  scoutReportSize,
  sortTable,
  updateConfidence,
  type MatchOutcome,
  type ScoutRegion,
  changeFormation,
  swapPlayers,
  type SwapResult,
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
export type MarketResult = { ok: true } | { ok: false; reason: 'not-available' | 'window-closed' | 'squad-full' | 'squad-short' | 'seller-short' | 'no-funds' | 'refused' | 'max-level' | 'academy-full' };
const fail = (reason: Exclude<MarketResult, { ok: true }>['reason']): MarketResult => ({ ok: false, reason });

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
  private finance!: ReturnType<typeof createFinanceListener>;
  private readonly base: Map<string, Database['players'][number]>;
  /** Elencos montados a partir do estado; limpo sempre que um jogador muda (resultado idêntico, só mais rápido). */
  private squads: Map<string, SquadPlayer[]> | null = null;

  constructor(db: Database, state: CareerState) {
    this.db = db;
    this.state = state;
    this.base = new Map(db.players.map((p) => [p.id, p]));
    this.reps = new Map(db.clubs.map((c) => [c.id, c.rep]));
    if (!state.board.objectives.length) state.board.objectives = boardObjectives(this.club());
    // Saves anteriores às copas continentais não tinham os convidados no calendário.
    for (const c of db.clubs) {
      if (c.guest && !state.calendar.clubs.some((x) => x.id === c.id)) state.calendar.clubs.push({ id: c.id, country: c.country, division: 'INT', rep: c.rep });
    }
    this.bindFinance();
  }

  private readonly reps: Map<string, number>;

  private bindFinance(): void {
    const economy = clubEconomy(this.db, this.state.userClubId);
    this.finance = createFinanceListener(this.state.finance, {
      club: () => economy,
      monthlyWages: () => Object.values(this.state.players).filter((p) => p.clubId === this.state.userClubId).reduce((s, p) => s + p.wage, 0),
      fanConfidence: () => this.state.board.fanConfidence,
      clubRep: (id) => this.reps.get(id) ?? 60,
    });
  }

  private club(id = this.state.userClubId) {
    return this.db.clubs.find((c) => c.id === id)!;
  }

  static create(db: Database, o: NewCareerOptions): Game {
    return new Game(db, createCareer(db, o));
  }

  squad(clubId = this.state.userClubId): SquadPlayer[] {
    if (!this.squads) {
      this.squads = new Map();
      const academy = new Set(this.state.market.academy.roster);
      for (const [id, d] of Object.entries(this.state.players)) {
        if (!d.clubId || academy.has(id)) continue;
        const list = this.squads.get(d.clubId) ?? [];
        list.push({ id, name: this.playerName(id), clubId: d.clubId, pos: d.pos, positions: this.playerPositions(id), ovr: d.ovr, attrs: d.attrs, form: d.form, morale: d.morale, fitness: d.fitness, injuredUntil: d.injuredUntil });
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
    if (this.state.board.sacked) return { events: [], pausedAt: null };
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

  /**
   * Simula o jogo do usuário em que o avanço parou (até existir o motor de
   * partida da Fase 4, é o mesmo modelo dos outros jogos).
   */
  simulateUserMatch(fixtureId: string): CalendarEvent[] {
    const cal = this.state.calendar;
    const f = cal.fixtures[fixtureId];
    if (!f) throw new Error(`Jogo inexistente: ${fixtureId}`);
    const competition = cal.competitions[f.competitionId]!;
    const r = this.play(f, { state: cal, competition, rng: createRng(this.state.seed).derive(`match:${f.id}`) });
    return this.playUserMatch(fixtureId, r);
  }

  /** Troca dois jogadores de lugar (XI, banco ou reservas). */
  swap(a: string, b: string): SwapResult {
    const r = swapPlayers(this.state.lineup, this.squad(), a, b, this.date);
    if (r.ok) this.state.lineup = r.lineup;
    return r;
  }

  setFormation(formation: string): LineupChange[] {
    const { lineup, changes } = changeFormation(this.state.lineup, this.squad(), formation, this.date);
    this.state.lineup = lineup;
    return changes;
  }

  /** Escalação automática, só quando o usuário pede. */
  autoPick(): void {
    this.state.lineup = autoLineup(this.squad(), this.state.lineup.formation, this.date);
  }

  /** Visão completa para as invariantes (calendário + finanças + escalação). */
  // ---------------------------------------------------------------- mercado

  playerName(id: string): string {
    return this.base.get(id)?.name ?? this.state.market.extra[id]?.name ?? id;
  }

  playerPositions(id: string): Position[] {
    return this.base.get(id)?.positions ?? this.state.market.extra[id]?.positions ?? [this.state.players[id]!.pos];
  }

  valueOf(id: string): number {
    const p = this.state.players[id]!;
    return marketValue(p);
  }

  /** Preço pedido pelo clube dono (contrato curto barateia). */
  askingPrice(id: string): number {
    const p = this.state.players[id]!;
    return Math.round((this.valueOf(id) * (p.contract <= 1 ? 0.8 : 1.15)) / 10_000) * 10_000;
  }

  isLoaned(id: string): boolean {
    return this.state.market.loans.some((l) => l.playerId === id);
  }

  windowOpen(): boolean {
    return transferWindowOpen(this.date);
  }

  private nextId(prefix: string): string {
    return `${prefix}${++this.state.market.seq}`;
  }

  private moveTo(id: string, clubId: string | null): void {
    const p = this.state.players[id]!;
    p.clubId = clubId;
    p.morale = clamp(p.morale + 5, 30, 95);
    this.changed();
  }

  private afterUserSquadChange(): void {
    this.changed();
    this.reconcile(this.date);
  }

  /** Compra: o clube aceita ou recusa conforme a oferta (fórmula da v0.5). */
  buy(id: string, offer: number): MarketResult {
    const p = this.state.players[id];
    const user = this.state.userClubId;
    if (!p || !p.clubId || p.clubId === user) return fail('not-available');
    if (!this.windowOpen()) return fail('window-closed');
    if (this.isLoaned(id)) return fail('not-available');
    if (this.squad().length >= MAX_SQUAD) return fail('squad-full');
    if (this.squad(p.clubId).length <= MIN_SQUAD) return fail('seller-short');
    if (offer > this.state.finance.balance) return fail('no-funds');
    const rng = createRng(this.state.seed).derive(`buy:${id}:${this.date}:${this.state.market.seq++}`);
    if (!rng.chance(buyChance(offer, this.askingPrice(id), p))) return fail('refused');
    const from = this.db.clubs.find((c) => c.id === p.clubId)?.name ?? '';
    spend(this.state.finance, { date: this.date, kind: 'transfer', label: 'Contratação', amount: offer, detail: this.playerName(id) });
    this.moveTo(id, user);
    p.wage = Math.max(p.wage, wageDemand(p.ovr));
    p.contract = 3;
    p.morale = 82;
    this.news(this.date, 'Contratação concluída', `${this.playerName(id)} chega do ${from}.`);
    this.afterUserSquadChange();
    return { ok: true };
  }

  /** Empréstimo até a próxima temporada, pagando 4% do valor. */
  loanIn(id: string): MarketResult {
    const p = this.state.players[id];
    const user = this.state.userClubId;
    if (!p || !p.clubId || p.clubId === user || this.isLoaned(id)) return fail('not-available');
    if (!this.windowOpen()) return fail('window-closed');
    if (this.squad().length >= MAX_SQUAD) return fail('squad-full');
    if (this.squad(p.clubId).length <= MIN_SQUAD) return fail('seller-short');
    const fee = Math.round(this.valueOf(id) * LOAN_FEE_RATE);
    if (fee > this.state.finance.balance) return fail('no-funds');
    const rng = createRng(this.state.seed).derive(`loan:${id}:${this.date}:${this.state.market.seq++}`);
    // Clubes emprestam com mais facilidade quem não é titular.
    const starter = autoLineup(this.squad(p.clubId), '4-2-3-1', this.date).xi.some((s) => s.playerId === id);
    if (!rng.chance(starter ? 0.2 : 0.65)) return fail('refused');
    spend(this.state.finance, { date: this.date, kind: 'transfer', label: 'Empréstimo', amount: fee, detail: this.playerName(id) });
    this.state.market.loans.push({ playerId: id, from: p.clubId, to: user, since: this.date });
    this.moveTo(id, user);
    this.news(this.date, 'Empréstimo acertado', `${this.playerName(id)} chega emprestado até o fim da temporada.`);
    this.afterUserSquadChange();
    return { ok: true };
  }

  /** Data em que o contrato atual do jogador termina (abertura da próxima temporada do clube dele). */
  contractEnd(id: string): IsoDate | null {
    const p = this.state.players[id];
    if (!p?.clubId || p.contract > 1) return null;
    const country = this.db.clubs.find((c) => c.id === p.clubId)?.country;
    const cycle = DEFAULT_CYCLES.find((c) => c.id === country) ?? DEFAULT_CYCLES[0]!;
    const year = Number(this.date.slice(0, 4));
    const opens = [year, year + 1, year + 2].map((y) => cycleOpenDate(cycle, y)).filter((d) => d > this.date);
    // A primeira abertura da carreira não desconta contrato (seasonOpened): o fim é a seguinte.
    const next = this.state.calendar.cycles[cycle.id]?.openedYear == null ? opens[1]! : opens[0]!;
    return p.contract === 1 ? next : this.date;
  }

  /** Pode assinar pré-contrato: último ano de contrato e no máximo 6 meses para o fim. */
  preContractOpen(id: string): boolean {
    const end = this.contractEnd(id);
    const p = this.state.players[id];
    if (!end || !p || p.clubId === this.state.userClubId || this.isLoaned(id)) return false;
    if ((this.state.market.precontracts ?? []).some((x) => x.playerId === id)) return false;
    return (Date.parse(end) - Date.parse(this.date)) / 86_400_000 <= PRECONTRACT_DAYS;
  }

  /** Pré-contrato: paga luvas (6 salários, como na v0.5) e o jogador chega quando o contrato acaba. */
  preContract(id: string): MarketResult {
    if (!this.preContractOpen(id)) return fail('not-available');
    const p = this.state.players[id]!;
    const wage = Math.max(p.wage, wageDemand(p.ovr));
    const rng = createRng(this.state.seed).derive(`pre:${id}:${this.date}`);
    // Clube maior convence mais fácil; jogador infeliz (moral baixa) também.
    const chance = clamp(0.5 + (this.club().rep - (this.reps.get(p.clubId!) ?? 60)) / 30 + (p.morale < 60 ? 0.15 : 0), 0.1, 0.9);
    if (!rng.chance(chance)) return fail('refused');
    const r = spend(this.state.finance, { date: this.date, kind: 'bonus', label: 'Luvas de pré-contrato', amount: wage * 6, detail: this.playerName(id) });
    if (!r.ok) return fail('no-funds');
    (this.state.market.precontracts ??= []).push({ playerId: id, to: this.state.userClubId, wage, signedOn: this.date });
    this.news(this.date, 'Pré-contrato assinado', `${this.playerName(id)} chega quando o contrato atual terminar.`);
    return { ok: true };
  }

  /** Agente livre: assina pelo salário pedido. */
  signFree(id: string): MarketResult {
    const p = this.state.players[id];
    if (!p || p.clubId) return fail('not-available');
    if (this.squad().length >= MAX_SQUAD) return fail('squad-full');
    p.clubId = this.state.userClubId;
    p.wage = wageDemand(p.ovr);
    p.contract = 2;
    p.morale = 80;
    this.news(this.date, 'Agente livre contratado', `${this.playerName(id)} assina por 2 temporadas.`);
    this.afterUserSquadChange();
    return { ok: true };
  }

  /** Renova por 3 temporadas com aumento de 10% (ou o salário de mercado, se maior). */
  renew(id: string): MarketResult {
    const p = this.state.players[id];
    if (!p || p.clubId !== this.state.userClubId || this.isLoaned(id)) return fail('not-available');
    p.wage = Math.max(Math.round(p.wage * 1.1), wageDemand(p.ovr));
    p.contract = 3;
    p.morale = clamp(p.morale + 8, 0, 100);
    this.changed();
    return { ok: true };
  }

  /** Rescisão: paga metade dos salários restantes e o jogador vira agente livre. */
  release(id: string): MarketResult {
    const p = this.state.players[id];
    if (!p || p.clubId !== this.state.userClubId || this.isLoaned(id)) return fail('not-available');
    if (this.squad().length <= MIN_SQUAD) return fail('squad-short');
    const cost = Math.round(p.wage * p.contract * 12 * 0.5);
    if (cost > 0 && !spend(this.state.finance, { date: this.date, kind: 'release', label: 'Rescisão', amount: cost, detail: this.playerName(id) }).ok) return fail('no-funds');
    p.contract = 0;
    this.moveTo(id, null);
    this.news(this.date, 'Contrato rescindido', `${this.playerName(id)} deixa o clube.`);
    this.afterUserSquadChange();
    return { ok: true };
  }

  acceptOffer(offerId: string): MarketResult {
    const m = this.state.market;
    const o = m.offers.find((x) => x.id === offerId);
    const p = o && this.state.players[o.playerId];
    m.offers = m.offers.filter((x) => x.id !== offerId);
    if (!o || !p || p.clubId !== this.state.userClubId) return fail('not-available');
    if (this.squad().length <= MIN_SQUAD) return fail('squad-short');
    const to = this.db.clubs.find((c) => c.id === o.fromClubId)?.name ?? '';
    receive(this.state.finance, { date: this.date, kind: 'transfer', label: o.type === 'sale' ? 'Venda' : 'Empréstimo cedido', amount: o.value, detail: this.playerName(o.playerId) });
    if (o.type === 'loan') m.loans.push({ playerId: o.playerId, from: this.state.userClubId, to: o.fromClubId, since: this.date });
    this.moveTo(o.playerId, o.fromClubId);
    m.offers = m.offers.filter((x) => x.playerId !== o.playerId);
    this.news(this.date, o.type === 'sale' ? 'Venda concluída' : 'Empréstimo cedido', `${this.playerName(o.playerId)} vai para o ${to}.`);
    this.afterUserSquadChange();
    return { ok: true };
  }

  rejectOffer(offerId: string): void {
    this.state.market.offers = this.state.market.offers.filter((x) => x.id !== offerId);
  }

  /** Toda semana: propostas pelos jogadores do usuário e o mercado da IA (só com a janela aberta). */
  private marketWeek(date: IsoDate): void {
    const m = this.state.market;
    m.offers = m.offers.filter((o) => o.expires >= date && this.state.players[o.playerId]?.clubId === this.state.userClubId);
    if (!transferWindowOpen(date)) return;
    const rng = createRng(this.state.seed).derive(`market:${date}`);
    const clubs = this.db.clubs.filter((c) => c.division && c.id !== this.state.userClubId);
    if (m.offers.length < MAX_OFFERS && rng.chance(0.42)) {
      const mine = this.squad().filter((p) => !this.isLoaned(p.id)).sort((a, b) => a.id.localeCompare(b.id));
      if (mine.length > MIN_SQUAD) {
        const p = rng.pick(mine);
        const bidder = rng.pick(clubs);
        const loan = rng.chance(0.28);
        const value = Math.round((this.valueOf(p.id) * (loan ? LOAN_FEE_RATE : rng.float(0.8, 1.25))) / 1000) * 1000;
        m.offers.push({ id: this.nextId('o'), playerId: p.id, fromClubId: bidder.id, type: loan ? 'loan' : 'sale', value, expires: addDays(date, OFFER_DAYS) });
        this.news(date, 'Proposta recebida', `${bidder.name} quer ${this.playerName(p.id)}${loan ? ' por empréstimo' : ''}.`);
      }
    }
    if (rng.chance(0.3)) {
      const from = rng.pick(clubs);
      const to = rng.pick(clubs.filter((c) => c.id !== from.id));
      const signed = new Set((m.precontracts ?? []).map((x) => x.playerId));
      const pool = this.squad(from.id).filter((p) => !this.isLoaned(p.id) && !signed.has(p.id) && (this.state.players[p.id]?.age ?? 99) < 34).sort((a, b) => a.id.localeCompare(b.id));
      if (pool.length > MIN_SQUAD + 2 && this.squad(to.id).length < MAX_SQUAD) {
        const p = rng.pick(pool);
        this.moveTo(p.id, to.id);
        this.state.players[p.id]!.contract = rng.int(2, 4);
        this.news(date, 'Mercado se movimenta', `${p.name} deixa o ${from.name} e acerta com o ${to.name}.`);
      }
    }
  }

  /** Abertura de temporada: empréstimos voltam, contratos vencidos são renovados (IA) ou encerrados (usuário). */
  private seasonMarket(cycleId: string, clubs: Set<string>, date: IsoDate): void {
    const m = this.state.market;
    const user = this.state.userClubId;
    let userChanged = false;
    const ending = m.loans.filter((x) => clubs.has(x.to) && addDays(x.since, 60) <= date);
    for (const l of ending) {
      const p = this.state.players[l.playerId];
      if (p) {
        p.clubId = l.from;
        userChanged ||= l.from === user || l.to === user;
        if (l.from === user || l.to === user) this.news(date, 'Fim de empréstimo', `${this.playerName(l.playerId)} volta ao ${this.db.clubs.find((c) => c.id === l.from)?.name ?? ''}.`);
      }
    }
    m.loans = m.loans.filter((x) => !ending.includes(x));
    const pre = new Map((m.precontracts ?? []).map((x) => [x.playerId, x]));
    const rng = createRng(this.state.seed).derive(`contracts:${date}:${cycleId}`);
    const academy = new Set(m.academy.roster);
    for (const [id, p] of Object.entries(this.state.players).sort(([a], [b]) => a.localeCompare(b))) {
      if (!p.clubId || !clubs.has(p.clubId) || p.contract > 0) continue;
      const deal = pre.get(id);
      if (deal) {
        p.clubId = deal.to;
        p.wage = deal.wage;
        p.contract = 3;
        p.morale = 82;
        pre.delete(id);
        userChanged ||= deal.to === user;
        this.news(date, 'Reforço por pré-contrato', `${this.playerName(id)} se apresenta sem custo de transferência.`);
      } else if (p.clubId === user && !academy.has(id)) {
        p.clubId = null;
        userChanged = true;
        this.news(date, 'Contrato encerrado', `${this.playerName(id)} sai como agente livre.`);
      } else {
        p.contract = rng.int(2, 4);
      }
    }
    m.precontracts = [...pre.values()];
    if (userChanged) this.changed();
  }

  // ----------------------------------------------------------------- base

  private youthIntake(date: IsoDate): void {
    const a = this.state.market.academy;
    const rng = createRng(this.state.seed).derive(`youth:${date}`);
    const n = rng.int(5, 8);
    const names = this.db.players.map((p) => p.name.split(' ')).filter((x) => x.length >= 2);
    a.candidates = [];
    for (let i = 0; i < n; i++) {
      const template = rng.pick(this.db.players);
      const pos = template.pos;
      const r = youthRatings(rng, a.level);
      const name = `${rng.pick(names)[0]} ${rng.pick(names).at(-1)}`;
      a.candidates.push({ id: this.nextId('yc'), name, pos, ...r, attrs: calibrateAttributes(template.attrs, pos, r.ovr) });
    }
    a.lastIntake = date;
    this.news(date, 'Relatório da base', `Chegaram ${n} jovens para avaliação.`);
  }

  upgradeAcademy(): MarketResult {
    const a = this.state.market.academy;
    if (a.level >= ACADEMY_MAX_LEVEL) return fail('max-level');
    const r = spend(this.state.finance, { date: this.date, kind: 'facility', label: 'Melhoria da base', amount: academyUpgradeCost(a.level), detail: `Nível ${a.level + 1}` });
    if (!r.ok) return fail('no-funds');
    a.level++;
    return { ok: true };
  }

  signYouth(candidateId: string): MarketResult {
    const a = this.state.market.academy;
    const i = a.candidates.findIndex((y) => y.id === candidateId);
    if (i < 0) return fail('not-available');
    if (a.roster.length >= ACADEMY_LIMIT) return fail('academy-full');
    const y = a.candidates.splice(i, 1)[0]!;
    const id = this.nextId('y');
    this.state.players[id] = {
      clubId: this.state.userClubId, pos: y.pos, age: y.age, ovr: y.ovr, pot: y.pot, attrs: y.attrs, wage: Math.round(y.ovr * y.ovr * 2.5), contract: 3,
      form: 70, morale: 78, fitness: 100, injuredUntil: null, devProgress: 0, declineProgress: 0, appsThisSeason: 0,
    };
    this.state.market.extra[id] = { name: y.name, positions: [y.pos] };
    a.roster.push(id);
    this.changed();
    return { ok: true };
  }

  dismissCandidate(candidateId: string): void {
    const a = this.state.market.academy;
    a.candidates = a.candidates.filter((y) => y.id !== candidateId);
  }

  /** Sobe ao profissional: passa a contar no elenco e na escalação. */
  promoteYouth(id: string): MarketResult {
    const a = this.state.market.academy;
    if (!a.roster.includes(id)) return fail('not-available');
    if (this.squad().length >= MAX_SQUAD) return fail('squad-full');
    a.roster = a.roster.filter((x) => x !== id);
    this.news(this.date, 'Promovido ao profissional', `${this.playerName(id)} sobe da base.`);
    this.afterUserSquadChange();
    return { ok: true };
  }

  releaseYouth(id: string): void {
    const a = this.state.market.academy;
    if (!a.roster.includes(id)) return;
    a.roster = a.roster.filter((x) => x !== id);
    delete this.state.players[id];
    delete this.state.market.extra[id];
    this.changed();
  }

  // -------------------------------------------------------------- diretoria

  private userDivision(cal = this.state.calendar): string | null {
    const c = Object.values(cal.competitions).find((x) => x.format === 'league' && x.status === 'running' && x.participants.includes(this.state.userClubId));
    return c ? (c.id.startsWith('brB') ? 'B' : 'A') : this.club().division;
  }

  /** Situação de cada objetivo (0–100), na ordem de `board.objectives`. */
  objectiveStatuses(): number[] {
    const s = this.state;
    const cal = s.calendar;
    const user = s.userClubId;
    const league = Object.values(cal.competitions)
      .filter((c) => c.format === 'league' && c.participants.includes(user))
      .sort((a, b) => b.startYear - a.startYear)[0];
    const table = league ? sortTable(league.table) : [];
    const row = table.findIndex((r) => r.clubId === user);
    const played = row >= 0 ? table[row]!.played : 0;
    const cupWins = Object.values(cal.fixtures).filter((f) => f.result?.winnerId === user && cal.competitions[f.competitionId]?.format === 'knockout').length;
    const squad = this.squad();
    const avgMorale = squad.reduce((t, p) => t + p.morale, 0) / Math.max(1, squad.length);
    const ctx = { leaguePos: played ? row + 1 : null, cupWins, balance: s.finance.balance, avgMorale };
    return s.board.objectives.map((o) => objectiveStatus(o, ctx));
  }

  private userResult(f: Fixture): void {
    const r = f.result!;
    const home = f.home === this.state.userClubId;
    const mine = home ? r.home : r.away;
    const theirs = home ? r.away : r.home;
    // Pela partida, não pelo confronto: perder a volta e passar no agregado ainda é derrota.
    const outcome: MatchOutcome = mine > theirs ? 'win' : mine < theirs ? 'loss' : 'draw';
    recordOutcome(this.state.board, outcome, this.reps.get(home ? f.away : f.home) ?? 60, this.club().rep);
    const morale = outcome === 'win' ? 3 : outcome === 'loss' ? -3 : 0;
    for (const p of this.squad()) this.state.players[p.id]!.morale = clamp(this.state.players[p.id]!.morale + morale, 30, 99);
    this.changed();
    updateConfidence(this.state.board, objectivesScore(this.state.board.objectives, this.objectiveStatuses()), this.state.finance.balance, this.club().rep);
  }

  private boardMonth(date: IsoDate): void {
    const b = this.state.board;
    updateConfidence(b, objectivesScore(b.objectives, this.objectiveStatuses()), this.state.finance.balance, this.club().rep);
    if (b.clubConfidence < 35) this.news(date, '⚠️ Diretoria preocupada', `A confiança da diretoria está em ${b.clubConfidence}%.`);
    b.jobOffers = b.jobOffers.filter((o) => o.expires >= date || b.sacked);
  }

  /** Fim da liga do usuário: avaliação, demissão ou propostas de outros clubes. */
  private seasonReview(competitionId: string, date: IsoDate): void {
    const s = this.state;
    const b = s.board;
    const comp = s.calendar.competitions[competitionId]!;
    const statuses = this.objectiveStatuses();
    const score = objectivesScore(b.objectives, statuses);
    updateConfidence(b, score, s.finance.balance, this.club().rep);
    const position = sortTable(comp.table).findIndex((r) => r.clubId === s.userClubId) + 1;
    b.history.push({ season: comp.seasonKey, clubId: s.userClubId, position, score });
    b.rating = clamp(Math.round((b.rating + (score - 60) / 100) * 100) / 100, 1, 10);
    const rng = createRng(s.seed).derive(`jobs:${date}`);
    const own = this.club().rep;
    const others = this.db.clubs.filter((c) => c.division && c.id !== s.userClubId).sort((a, b2) => a.id.localeCompare(b2.id));
    if (score < 45 && b.clubConfidence < 45) {
      b.sacked = true;
      const pool = others.filter((c) => c.rep <= own - 3).sort((a, b2) => a.rep - b2.rep);
      const picks = pool.length ? pool : others.sort((a, b2) => a.rep - b2.rep);
      b.jobOffers = picks.slice(-12).filter(() => rng.chance(0.5)).slice(0, 3).map((c) => ({ clubId: c.id, expires: addDays(date, 365) }));
      if (!b.jobOffers.length) b.jobOffers = [{ clubId: picks[0]!.id, expires: addDays(date, 365) }];
      this.news(date, '❌ Demitido', `A diretoria encerrou seu trabalho (avaliação ${score}/100). Escolha um novo clube.`);
      return;
    }
    this.news(date, `Avaliação da temporada ${comp.seasonKey}`, `${position}º lugar • nota da diretoria ${score}/100 • sua nota ${b.rating.toFixed(2)}.`);
    const interested = others.filter((c) => c.rep > own && jobRequirement(c.rep) <= b.rating + 0.9 && rng.chance(0.35)).slice(0, 3);
    b.jobOffers = interested.map((c) => ({ clubId: c.id, expires: addDays(date, 30) }));
    for (const c of interested) this.news(date, 'Proposta de emprego', `${c.name} quer contratar você.`);
  }

  /** Assume outro clube (proposta recebida). O caixa e a base passam a ser os do novo clube. */
  takeJob(clubId: string): MarketResult {
    const s = this.state;
    const b = s.board;
    if (!b.jobOffers.some((o) => o.clubId === clubId)) return fail('not-available');
    const club = this.club(clubId);
    // Os jovens da base ficam no clube antigo, como profissionais.
    s.market.academy = { ...s.market.academy, roster: [], candidates: [], level: 1, lastIntake: null };
    s.market.offers = [];
    s.userClubId = clubId;
    s.finance = createFinance(clubId, club.baseBudget);
    this.bindFinance();
    this.changed();
    s.lineup = autoLineup(this.squad(), s.lineup.formation, this.date);
    b.objectives = boardObjectives({ ...club, division: this.userDivision() });
    b.jobOffers = [];
    b.sacked = false;
    b.clubConfidence = 70;
    b.fanConfidence = 70;
    b.recent = [];
    this.news(this.date, `Novo clube: ${club.name}`, `${s.manager} assume o ${club.name}.`);
    return { ok: true };
  }

  declineJob(clubId: string): void {
    const b = this.state.board;
    if (b.sacked && b.jobOffers.length <= 1) return;
    b.jobOffers = b.jobOffers.filter((o) => o.clubId !== clubId);
  }

  // -------------------------------------------------------------- olheiros

  hireScout(): MarketResult {
    const b = this.state.board;
    if (b.scouts.length >= SCOUT_LIMIT) return fail('max-level');
    const r = spend(this.state.finance, { date: this.date, kind: 'other', label: 'Contratação de olheiro', amount: scoutHireCost(b.scouts.length) });
    if (!r.ok) return fail('no-funds');
    b.scouts.push(newScout(b.scouts.length, this.nextId('s')));
    return { ok: true };
  }

  sendScout(id: string, region: ScoutRegion, months: number): MarketResult {
    const sc = this.state.board.scouts.find((x) => x.id === id);
    if (!sc || sc.mission) return fail('not-available');
    sc.mission = { region, end: addDays(this.date, clamp(Math.round(months), 1, 6) * 30) };
    sc.reports = [];
    return { ok: true };
  }

  private scoutWeek(date: IsoDate): void {
    const countries: Record<ScoutRegion, string[]> = { BR: ['BR'], ENG: ['ENG'], ESP: ['ESP'], SUL: ['ARG', 'URU', 'ECU'], LIVRES: [] };
    const country = new Map(this.db.clubs.map((c) => [c.id, c.country]));
    for (const sc of this.state.board.scouts) {
      if (!sc.mission || sc.mission.end > date) continue;
      const rng = createRng(this.state.seed).derive(`scout:${sc.id}:${date}`);
      const region = sc.mission.region;
      const pool = Object.entries(this.state.players)
        .filter(([, p]) => (region === 'LIVRES' ? !p.clubId : !!p.clubId && p.clubId !== this.state.userClubId && countries[region].includes(country.get(p.clubId) ?? '')))
        .filter(([id]) => !this.state.market.academy.roster.includes(id))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([id, p]) => ({ id, p, score: p.pot + rng.float(0, 25) + sc.level - Math.max(0, p.age - 26) * 2 }))
        .sort((a, b) => b.score - a.score)
        .slice(0, scoutReportSize(sc.level));
      const err = Math.round((100 - sc.accuracy) / 5);
      sc.reports = pool.map(({ id, p }) => ({ playerId: id, ovr: p.ovr + rng.int(-err, err), pot: Math.max(p.ovr, p.pot + rng.int(-err, err)) }));
      this.news(date, 'Relatório de olheiro', `${sc.name} voltou com ${sc.reports.length} nomes.`);
      sc.mission = null;
    }
  }

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
      case 'fixture-played': {
        const f = cal.fixtures[e.fixtureId]!;
        this.countAppearances(f, cal.date);
        if (involves(this.state.userClubId)(f)) this.userResult(f);
        return;
      }
      case 'tick':
        if (e.tick === 'monthly') {
          this.developAll(cal);
          if (youthIntakeDue(this.state.market.academy, e.date)) this.youthIntake(e.date);
          this.boardMonth(e.date);
        } else {
          this.injuries(e.date);
          this.marketWeek(e.date);
          this.scoutWeek(e.date);
        }
        return;
      case 'season-opened':
        return this.seasonOpened(e, cal);
      case 'competition-finished': {
        const comp = cal.competitions[e.competitionId]!;
        const champion = this.db.clubs.find((c) => c.id === e.championId)?.name ?? '—';
        if (comp.participants.includes(this.state.userClubId) || comp.format === 'league') this.news(e.date, `${comp.name} ${comp.seasonKey}: campeão ${champion}`);
        if (comp.format === 'league' && comp.participants.includes(this.state.userClubId)) this.seasonReview(comp.id, e.date);
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
    if (!firstSeason) this.seasonMarket(e.cycleId, clubs, e.date);
    this.changed();
    compactCalendar(cal);
    if (clubs.has(this.state.userClubId)) {
      this.state.board.objectives = boardObjectives({ ...this.club(), division: this.userDivision(cal) });
      this.news(e.date, `Temporada ${e.seasonKey}`, `Calendário publicado. Objetivo na liga: ${this.state.board.objectives[0]!.title}.`);
      this.reconcile(e.date);
    }
  }
}
