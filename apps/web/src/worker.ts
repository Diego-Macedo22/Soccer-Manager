/// <reference lib="webworker" />
/**
 * Worker da carreira: toda a simulação roda aqui, fora da thread da tela (B8).
 * Responde cada comando com uma `View` pronta para desenhar e grava o save no
 * IndexedDB depois de cada ação (pontos de controle, nunca a cada minuto).
 */
import { FORMATIONS, encodeSave, sortTable, totalsByKind, type Fixture } from '@sm/core';
import { loadDatabase, type Database } from '@sm/data';
import { Game } from '@sm/game';
import { IdbStore } from './idb-store.ts';
import type { ClubRef, Command, FixtureView, Reply, View } from './protocol.ts';

const SLOT = 'carreira-1';
const db: Database = loadDatabase();
const store = new IdbStore();
const clubs = new Map(db.clubs.map((c) => [c.id, c]));
const LEAGUES: Record<string, string> = { A: 'Liga Nacional Série A', B: 'Liga Nacional Série B', PL: 'Liga Inglesa', LL: 'Liga Espanhola' };
let game: Game | null = null;

const ref = (id: string): ClubRef => ({ id, name: clubs.get(id)?.name ?? id, abbr: clubs.get(id)?.abbr ?? id.slice(0, 3).toUpperCase() });

function fixtureView(g: Game, f: Fixture): FixtureView {
  const comp = g.state.calendar.competitions[f.competitionId];
  const score = f.result ? `${f.result.home} x ${f.result.away}${f.result.penalties ? ' (pên.)' : ''}` : null;
  return { id: f.id, date: f.date, competition: comp?.name ?? '', round: f.roundName, home: ref(f.home), away: ref(f.away), score };
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
      table: sortTable(c.table).map((r, i) => ({ pos: i + 1, club: ref(r.clubId), played: r.played, won: r.won, drawn: r.drawn, lost: r.lost, gd: r.goalsFor - r.goalsAgainst, points: r.points, user: r.clubId === user })),
      userFixtures: c.fixtureIds.map((id) => cal.fixtures[id]!).filter((f) => f && (f.home === user || f.away === user || c.format === 'knockout')).slice(-40).map((f) => fixtureView(g, f)),
    })),
    finance: {
      balance: s.finance.balance,
      wages: g.squad().reduce((t, p) => t + (s.players[p.id]?.wage ?? 0), 0),
      totals: totalsByKind(s.finance, `${cal.date.slice(0, 4)}-01-01`, cal.date) as Record<string, number>,
      entries: s.finance.ledger.slice(-40).reverse().map((e) => ({ date: e.date, label: e.label, value: e.value, ...(e.detail ? { detail: e.detail } : {}) })),
    },
    saveSize: enc.ok ? enc.size : 0,
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
