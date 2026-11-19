/// <reference lib="webworker" />
/**
 * Worker da carreira: toda a simulação roda aqui, fora da thread da tela (B8).
 * Responde cada comando com uma `View` pronta para desenhar e grava o save no
 * IndexedDB depois de cada ação (pontos de controle, nunca a cada minuto).
 */
import { SCOUT_LIMIT, SCOUT_REGIONS, objectivesScore, scoutHireCost, type ScoutRegion, ACADEMY_LIMIT, ACADEMY_MAX_LEVEL, FORMATIONS, academyUpgradeCost, encodeSave, sortTable, totalsByKind, type Fixture, applyToTable, emptyTable, YOUTH_INTAKE_DAYS, type MatchChange, type StandingRow } from '@sm/core';
import type { MarketResult } from '@sm/game';
import { loadDatabase, type Database } from '@sm/data';
import { Game } from '@sm/game';
import { IdbStore } from './idb-store.ts';
import type { LiveMatchView, LiveRoundView, BoardView, ClubRef, Command, FixtureView, MarketView, Reply, UpcomingItem, View } from './protocol.ts';

const SLOT = 'carreira-1';
const db: Database = loadDatabase();
const store = new IdbStore();
const clubs = new Map(db.clubs.map((c) => [c.id, c]));
const LEAGUES: Record<string, string> = { A: 'Liga Nacional Série A', B: 'Liga Nacional Série B', PL: 'Liga Inglesa', LL: 'Liga Espanhola' };
let game: Game | null = null;
/** Partida ao vivo em andamento (mudanças feitas pelo usuário). */
let live: { fixtureId: string; changes: MatchChange[]; round: LiveRoundView } | null = null;

const ref = (id: string): ClubRef => ({ id, name: clubs.get(id)?.name ?? id, abbr: clubs.get(id)?.abbr ?? id.slice(0, 3).toUpperCase() });

function fixtureView(g: Game, f: Fixture): FixtureView {
  const comp = g.state.calendar.competitions[f.competitionId];
  const score = f.result ? `${f.result.home} x ${f.result.away}${f.result.penalties ? ' (pên.)' : ''}` : null;
  return { id: f.id, date: f.date, competition: comp?.name ?? '', round: f.roundName, home: ref(f.home), away: ref(f.away), score };
}

function marketView(g: Game): MarketView {
  const s = g.state;
  const m = s.market;
  const youth = (id: string) => {
    const d = s.players[id]!;
    return { id, name: g.playerName(id), pos: d.pos, age: d.age, ovr: d.ovr, pot: d.pot };
  };
  return {
    windowOpen: g.windowOpen(),
    offers: m.offers.map((o) => ({ id: o.id, player: g.playerName(o.playerId), playerId: o.playerId, club: ref(o.fromClubId), type: o.type, value: o.value, expires: o.expires })),
    players: Object.entries(s.players)
      .filter(([id, d]) => d.clubId !== s.userClubId)
      .map(([id, d]) => ({ id, name: g.playerName(id), club: d.clubId ? ref(d.clubId) : null, pos: d.pos, age: d.age, ovr: d.ovr, pot: d.pot, value: g.valueOf(id), ask: g.askingPrice(id), wage: d.wage, contract: d.contract, preContract: g.preContractOpen(id) }))
      .sort((a, b) => b.ovr - a.ovr),
    loanedIn: m.loans.filter((l) => l.to === s.userClubId).map((l) => l.playerId),
    precontracts: (m.precontracts ?? []).map((x) => ({ playerId: x.playerId, name: g.playerName(x.playerId), club: ref(s.players[x.playerId]?.clubId ?? '').name, wage: x.wage, arrives: g.contractEnd(x.playerId) })),
    academy: {
      level: m.academy.level, maxLevel: ACADEMY_MAX_LEVEL, upgradeCost: academyUpgradeCost(m.academy.level), lastIntake: m.academy.lastIntake,
      candidates: m.academy.candidates.map((y) => ({ id: y.id, name: y.name, pos: y.pos, age: y.age, ovr: y.ovr, pot: y.pot })),
      roster: m.academy.roster.map(youth), limit: ACADEMY_LIMIT,
    },
  };
}

const REASON: Record<Exclude<MarketResult, { ok: true }>['reason'], string> = {
  'not-available': 'Negócio indisponível.',
  'window-closed': 'A janela de transferências está fechada (abre em janeiro e julho).',
  'squad-full': 'O elenco está cheio.',
  'squad-short': 'O elenco ficaria curto demais.',
  'seller-short': 'O clube não quer ficar com o elenco curto.',
  'no-funds': 'Caixa insuficiente.',
  refused: 'Proposta recusada. Tente melhorar os termos.',
  'max-level': 'A base já está no nível máximo.',
  'academy-full': 'A base atingiu o limite de jogadores.',
};
const said = (r: MarketResult, okText: string) => (r.ok ? okText : REASON[r.reason]);

function boardView(g: Game): BoardView {
  const b = g.state.board;
  const st = g.objectiveStatuses();
  return {
    objectives: b.objectives.map((o, i) => ({ title: o.title, weight: o.weight, status: st[i] ?? 70 })),
    score: objectivesScore(b.objectives, st),
    clubConfidence: b.clubConfidence, fanConfidence: b.fanConfidence, rating: b.rating, record: b.record, recent: b.recent,
    history: b.history.map((h) => ({ season: h.season, club: ref(h.clubId).name, position: h.position, score: h.score })).reverse(),
    jobOffers: b.jobOffers.map((o) => ({ club: ref(o.clubId), rep: clubs.get(o.clubId)?.rep ?? 0, expires: o.expires })),
    sacked: b.sacked,
    scouts: b.scouts.map((sc) => ({ ...sc, mission: sc.mission ? { region: SCOUT_REGIONS[sc.mission.region], end: sc.mission.end } : null })),
    scoutCost: scoutHireCost(b.scouts.length), scoutLimit: SCOUT_LIMIT,
    regions: Object.entries(SCOUT_REGIONS),
  };
}

function rows(table: ReturnType<typeof sortTable>, user: string) {
  return table.map((r, i) => ({ pos: i + 1, club: ref(r.clubId), played: r.played, won: r.won, drawn: r.drawn, lost: r.lost, gd: r.goalsFor - r.goalsAgainst, points: r.points, user: r.clubId === user }));
}

function liveView(g: Game): LiveMatchView {
  const f = g.state.calendar.fixtures[live!.fixtureId]!;
  const input = g.matchInput(f.id);
  const timeline = g.runMatch(f.id, live!.changes);
  const names: Record<string, string> = {};
  for (const s of ['home', 'away'] as const) for (const p of [...input[s].xi, ...input[s].bench]) names[p.id] = p.name;
  const club = (id: string) => ({ ...ref(id), colors: clubs.get(id)?.colors ?? (['#555', '#fff'] as [string, string]) });
  return {
    fixtureId: f.id, competition: g.state.calendar.competitions[f.competitionId]?.name ?? '', round: f.roundName,
    home: club(f.home), away: club(f.away), userSide: f.home === g.state.userClubId ? 'home' : 'away',
    input, timeline, names, changes: live!.changes, day: live!.round,
  };
}

/** Rodada ao vivo: os outros jogos da competição no dia e a tabela de antes da rodada. */
function roundView(g: Game, fixtureId: string): LiveRoundView {
  const cal = g.state.calendar;
  const f = cal.fixtures[fixtureId]!;
  const comp = cal.competitions[f.competitionId]!;
  const games = g.dayResults(fixtureId).map((x) => ({
    home: ref(x.home),
    away: ref(x.away),
    final: [x.result!.home, x.result!.away] as [number, number],
    goals: (x.result!.goals ?? []).map(([s, m]) => [s, m] as [0 | 1, number]),
  }));
  let table: StandingRow[] | null = null;
  if (comp.format === 'league') {
    table = emptyTable(comp.participants);
    for (const id of comp.fixtureIds) {
      const x = cal.fixtures[id];
      if (x?.result && x.date < f.date) applyToTable(table, x.home, x.away, x.result.home, x.result.away);
    }
  }
  const refs: Record<string, ClubRef> = {};
  for (const id of comp.participants) refs[id] = ref(id);
  return { games, table, clubs: refs };
}

const REGION_NAME: Record<string, string> = { BR: 'Brasil', ENG: 'Inglaterra', ESP: 'Espanha', SUL: 'América do Sul', LIVRES: 'agentes livres' };
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
function firstOfMonthFrom(d: string): string {
  if (d.endsWith('-01')) return d;
  const x = new Date(`${d}T00:00:00Z`);
  return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
}

/** O que vem por aí: jogos, janela, peneira, olheiros, propostas, contratos e fim da liga. */
function upcomingView(g: Game): UpcomingItem[] {
  const s = g.state;
  const cal = s.calendar;
  const today = cal.date;
  const user = s.userClubId;
  const items: Omit<UpcomingItem, 'days'>[] = [];
  const mine = Object.values(cal.fixtures).filter((f) => !f.result && (f.home === user || f.away === user)).sort((a, b) => a.date.localeCompare(b.date));
  for (const f of mine.slice(0, 3)) {
    const decisive = f.roundName.startsWith('Final') || f.leg === 2;
    items.push({ date: f.date, title: `${decisive ? '🏆' : '⚽'} ${ref(f.home).name} x ${ref(f.away).name}`, detail: `${cal.competitions[f.competitionId]?.name ?? ''} • ${f.roundName}` });
  }
  const [y, mo] = today.split('-').map(Number) as [number, number];
  if (g.windowOpen()) items.push({ date: new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10), title: '🔁 Fecha a janela de transferências', detail: 'Último dia para comprar e pegar emprestado.' });
  else items.push({ date: mo < 7 ? `${y}-07-01` : `${y + 1}-01-01`, title: '🔁 Abre a janela de transferências', detail: '' });
  const academy = s.market.academy;
  items.push({ date: firstOfMonthFrom(academy.lastIntake ? addDays(academy.lastIntake, YOUTH_INTAKE_DAYS) : today), title: '🌱 Peneira da base', detail: `Base nível ${academy.level}` });
  for (const sc of s.board.scouts) if (sc.mission) items.push({ date: sc.mission.end, title: `🔭 Relatório de ${sc.name}`, detail: `Missão: ${REGION_NAME[sc.mission.region] ?? sc.mission.region}` });
  for (const o of [...s.market.offers].sort((a, b) => a.expires.localeCompare(b.expires)).slice(0, 2)) {
    items.push({ date: o.expires, title: `📨 Vence a proposta por ${g.playerName(o.playerId)}`, detail: ref(o.fromClubId).name });
  }
  const ending = g.squad().filter((p) => s.players[p.id]?.contract === 1);
  const end = ending.length ? g.contractEnd(ending[0]!.id) : null;
  if (end) items.push({ date: end, title: `✍️ ${ending.length === 1 ? '1 contrato termina' : `${ending.length} contratos terminam`}`, detail: 'Renove a tempo ou perca o jogador de graça.' });
  const league = Object.values(cal.competitions).find((c) => c.format === 'league' && c.status === 'running' && c.participants.includes(user));
  const last = league?.fixtureIds.map((id) => cal.fixtures[id]?.date ?? '').sort().pop();
  if (league && last) items.push({ date: last, title: `📋 Última rodada da ${league.name}`, detail: 'Depois dela, a avaliação da diretoria.' });
  return items
    .filter((i) => i.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 7)
    .map((i) => ({ ...i, days: daysBetween(today, i.date) }));
}

function buildView(g: Game): View {
  const s = g.state;
  const cal = s.calendar;
  const user = s.userClubId;
  const club = clubs.get(user)!;
  const next = g.nextUserFixture();
  const rank = (c: { participants: string[]; format: string; status: string }) =>
    (c.participants.includes(user) ? 2 : 0) + (c.format === 'league' ? 1 : 0) + (c.status === 'running' ? 1 : 0);
  const comps = Object.values(cal.competitions)
    .filter((c) => c.status === 'running' || c.startYear >= Math.max(...Object.values(cal.competitions).map((x) => x.startYear)) - 1)
    // Liga do usuário primeiro, depois as outras competições dele, depois o resto.
    .sort((a, b) => rank(b) - rank(a) || b.startYear - a.startYear || a.name.localeCompare(b.name));
  const userFixtures = Object.values(cal.fixtures).filter((f) => f.home === user || f.away === user).sort((a, b) => a.date.localeCompare(b.date));
  const league = comps.find((c) => c.format === 'league' && c.status === 'running' && c.participants.includes(user));
  const leagueTable = league ? sortTable(league.table) : [];
  const enc = encodeSave(s, Infinity);
  return {
    date: cal.date,
    manager: s.manager,
    club: { ...ref(user), colors: club.colors },
    next: next ? { ...fixtureView(g, next), today: next.date === cal.date } : null,
    standing: league ? { competition: league.name, pos: leagueTable.findIndex((r) => r.clubId === user) + 1, points: leagueTable.find((r) => r.clubId === user)?.points ?? 0 } : null,
    results: userFixtures.filter((f) => f.result).slice(-5).reverse().map((f) => fixtureView(g, f)),
    news: s.news.slice(-20).reverse(),
    upcoming: upcomingView(g),
    squad: g.squad().map((p) => {
      const d = s.players[p.id]!;
      return { id: p.id, name: p.name, pos: p.pos, positions: p.positions, age: d.age, ovr: d.ovr, pot: d.pot, fitness: Math.round(d.fitness), morale: Math.round(d.morale), injuredUntil: d.injuredUntil && d.injuredUntil >= cal.date ? d.injuredUntil : null, wage: d.wage, contract: d.contract, apps: d.appsThisSeason };
    }).sort((a, b) => b.ovr - a.ovr),
    lineup: { formation: s.lineup.formation, xi: s.lineup.xi.map((x) => ({ pos: x.pos, x: x.x, y: x.y, playerId: x.playerId })), bench: s.lineup.bench, reserves: s.lineup.reserves },
    formations: Object.keys(FORMATIONS),
    competitions: comps.slice(0, 12).map((c) => ({
      id: c.id,
      name: `${c.name} ${c.seasonKey}`,
      format: c.format,
      status: c.status,
      champion: c.championId ? ref(c.championId).name : null,
      table: c.format === 'league' ? rows(sortTable(c.table), user) : [],
      groups: Object.entries(c.groups ?? {}).map(([name, members]) => ({ name, table: rows(sortTable(c.table.filter((r) => members.includes(r.clubId))), user) })),
      userFixtures: c.fixtureIds.map((id) => cal.fixtures[id]!).filter((f) => f && (f.home === user || f.away === user || (c.format !== 'league' && !f.group))).slice(-40).map((f) => fixtureView(g, f)),
      scorers: g.competitionStats(c.id).slice(0, 10).map((x) => ({ name: g.playerName(x.playerId), club: ref(x.clubId), goals: x.goals, assists: x.assists })),
    })),
    finance: {
      balance: s.finance.balance,
      wages: g.squad().reduce((t, p) => t + (s.players[p.id]?.wage ?? 0), 0),
      totals: totalsByKind(s.finance, `${cal.date.slice(0, 4)}-01-01`, cal.date) as Record<string, number>,
      entries: s.finance.ledger.slice(-40).reverse().map((e) => ({ date: e.date, label: e.label, value: e.value, ...(e.detail ? { detail: e.detail } : {}) })),
    },
    saveSize: enc.ok ? enc.size : 0,
    market: marketView(g),
    board: boardView(g),
  };
}

function addDays(d: string, n: number): string {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}

async function persist(g: Game): Promise<string | undefined> {
  const r = await g.save(store, SLOT);
  return r.ok ? undefined : `Não foi possível salvar: ${r.detail}`;
}

async function handle(cmd: Command): Promise<Reply> {
  if (cmd.type === 'init') {
    const hasSave = (await store.get(SLOT)) !== null;
    const options = db.clubs
      .filter((c) => c.division)
      .sort((a, b) => a.division!.localeCompare(b.division!) || b.rep - a.rep)
      .map((c) => ({ id: c.id, name: c.name, league: LEAGUES[c.division!]! }));
    return { type: 'init', hasSave, clubs: options };
  }
  if (cmd.type === 'new') {
    game = Game.create(db, { clubId: cmd.clubId, manager: cmd.manager.trim() || 'Técnico', seed: `${cmd.clubId}:${Date.now()}` });
    return { type: 'view', view: buildView(game), ...withToast(await persist(game)) };
  }
  if (cmd.type === 'load') {
    game = await Game.load(db, store, SLOT);
    if (!game) return { type: 'error', message: 'Nenhuma carreira salva.' };
    return { type: 'view', view: buildView(game) };
  }
  const g = game;
  if (!g) return { type: 'error', message: 'Nenhuma carreira em andamento.' };
  let toast: string | undefined;
  if (g.state.board.sacked && ['continue', 'advanceDays'].includes(cmd.type)) {
    return { type: 'view', view: buildView(g), toast: 'Você foi demitido. Escolha um novo clube na aba Diretoria.' };
  }
  if (cmd.type === 'matchStart') {
    const next = g.nextUserFixture();
    if (!next || next.date !== g.date) return { type: 'error', message: 'Não há jogo hoje.' };
    live = { fixtureId: next.id, changes: [], round: roundView(g, next.id) };
    return { type: 'match', match: liveView(g) };
  }
  if (cmd.type === 'matchChange') {
    if (!live) return { type: 'error', message: 'Nenhuma partida em andamento.' };
    live.changes = [...live.changes, cmd.change];
    return { type: 'match', match: liveView(g) };
  }
  if (cmd.type === 'matchFinish') {
    if (!live) return { type: 'error', message: 'Nenhuma partida em andamento.' };
    const { timeline } = g.finishUserMatch(live.fixtureId, live.changes);
    const f = g.state.calendar.fixtures[live.fixtureId]!;
    live = null;
    const saveError = await persist(g);
    return { type: 'view', view: buildView(g), ...withToast(saveError ?? `Fim de jogo: ${ref(f.home).abbr} ${timeline.score.home} x ${timeline.score.away} ${ref(f.away).abbr}`) };
  }
  switch (cmd.type) {
    case 'continue': {
      const next = g.nextUserFixture();
      if (next && next.date === g.date) {
        g.simulateUserMatch(next.id);
        const f = g.state.calendar.fixtures[next.id]!;
        toast = `Fim de jogo: ${ref(f.home).abbr} ${f.result!.home} x ${f.result!.away} ${ref(f.away).abbr}`;
      } else {
        g.advance(next ? next.date : addDays(g.date, 7), { stopAtUserMatch: true });
      }
      break;
    }
    case 'advanceDays':
      g.advance(addDays(g.date, cmd.days), { stopAtUserMatch: true });
      break;
    case 'swap': {
      const r = g.swap(cmd.a, cmd.b);
      toast = r.ok ? 'Jogadores trocados.' : { 'wrong-position': 'Goleiro só joga no gol (e vice-versa).', unavailable: 'Jogador lesionado não pode ser relacionado.', 'not-in-squad': 'Jogador fora do elenco.', 'same-player': 'Escolha dois jogadores diferentes.' }[r.reason];
      break;
    }
    case 'formation':
      g.setFormation(cmd.key);
      toast = `Formação ${cmd.key}.`;
      break;
    case 'auto':
      g.autoPick();
      toast = 'Escalação automática aplicada.';
      break;
    case 'buy':
      toast = said(g.buy(cmd.id, cmd.offer), 'Transferência concluída.');
      break;
    case 'loanIn':
      toast = said(g.loanIn(cmd.id), 'Empréstimo acertado.');
      break;
    case 'signFree':
      toast = said(g.signFree(cmd.id), 'Agente livre contratado.');
      break;
    case 'renew':
      toast = said(g.renew(cmd.id), 'Contrato renovado por 3 temporadas.');
      break;
    case 'release':
      toast = said(g.release(cmd.id), 'Contrato rescindido.');
      break;
    case 'acceptOffer':
      toast = said(g.acceptOffer(cmd.id), 'Proposta aceita.');
      break;
    case 'rejectOffer':
      g.rejectOffer(cmd.id);
      toast = 'Proposta recusada.';
      break;
    case 'upgradeAcademy':
      toast = said(g.upgradeAcademy(), 'Instalações da base melhoradas.');
      break;
    case 'signYouth':
      toast = said(g.signYouth(cmd.id), 'Jovem contratado para a base.');
      break;
    case 'dismissYouth':
      g.dismissCandidate(cmd.id);
      break;
    case 'promoteYouth':
      toast = said(g.promoteYouth(cmd.id), 'Jogador promovido ao profissional.');
      break;
    case 'preContract':
      toast = said(g.preContract(cmd.id), 'Pré-contrato assinado: ele chega quando o contrato atual terminar.');
      break;
    case 'hireScout':
      toast = g.state.board.scouts.length >= SCOUT_LIMIT ? 'Limite de olheiros atingido.' : said(g.hireScout(), 'Olheiro contratado.');
      break;
    case 'sendScout':
      toast = said(g.sendScout(cmd.id, cmd.region as ScoutRegion, cmd.months), `Olheiro enviado por ${cmd.months} ${cmd.months === 1 ? 'mês' : 'meses'}.`);
      break;
    case 'takeJob':
      toast = said(g.takeJob(cmd.clubId), `Bem-vindo ao ${ref(cmd.clubId).name}!`);
      break;
    case 'declineJob':
      g.declineJob(cmd.clubId);
      break;
    case 'releaseYouth':
      g.releaseYouth(cmd.id);
      toast = 'Jovem dispensado.';
      break;
  }
  const saveError = await persist(g);
  return { type: 'view', view: buildView(g), ...withToast(saveError ?? toast) };
}

function withToast(t: string | undefined): { toast?: string } {
  return t ? { toast: t } : {};
}

self.onmessage = async (e: MessageEvent<Command>) => {
  let reply: Reply;
  try {
    reply = await handle(e.data);
  } catch (err) {
    reply = { type: 'error', message: err instanceof Error ? err.message : String(err) };
  }
  (self as unknown as Worker).postMessage(reply);
};
