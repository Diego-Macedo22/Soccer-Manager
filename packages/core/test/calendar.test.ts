/**
 * Calendário (Fase 2). Cada teste corresponde a uma especificação derivada de
 * um bug do legado; as invariantes de `@sm/core` rodam a cada passo de avanço.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceTo,
  calendarSnapshot,
  checkTransition,
  createCalendar,
  createRng,
  cycleForDivision,
  cycleOpenDate,
  DEFAULT_CYCLES,
  diffDays,
  involves,
  monthStartsBetween,
  nextFixture,
  recordResult,
  roundRobin,
  sortTable,
  type CalendarState,
  type Club,
  type CycleDef,
  type IsoDate,
  type ResultProvider,
  type TickKind,
  type ViolationCode,
} from '../src/index.ts';

const pad = (i: number) => String(i).padStart(2, '0');
const group = (prefix: string, country: string, division: string, topRep: number): Club[] =>
  Array.from({ length: 20 }, (_, i) => ({ id: `${prefix}${pad(i)}`, country, division, rep: topRep - i }));

const CLUBS: Club[] = [
  ...group('bra', 'BR', 'A', 90),
  ...group('brb', 'BR', 'B', 72),
  ...group('eng', 'ENG', 'PL', 95),
  ...group('esp', 'ESP', 'LL', 94),
];

const play: ResultProvider = (_f, { rng }) => ({ home: rng.poisson(1.45), away: rng.poisson(1.1) });
const world = (cycles: readonly CycleDef[] = DEFAULT_CYCLES): CalendarState =>
  createCalendar({ seed: 'calendario', startDate: '2026-01-05', startYear: 2026, clubs: CLUBS, cycles });

const CALENDAR_CODES: ViolationCode[] = ['DATE_REGRESSION', 'PAST_FIXTURE_UNPLAYED', 'COMPETITION_DISCARDED'];

/** Avança em passos aleatórios (1–45 dias), checando as invariantes a cada passo. */
function stepTo(state: CalendarState, target: IsoDate, seed: string, cycles: readonly CycleDef[] = DEFAULT_CYCLES): void {
  const rng = createRng(seed);
  while (state.date < target) {
    const prev = calendarSnapshot(state, 'bra00');
    const next = [state.date, target].sort()[0] === target ? target : addDaysCapped(state.date, rng.int(1, 45), target);
    advanceTo(state, next, { play, cycles });
    const bad = checkTransition(prev, calendarSnapshot(state, 'bra00')).filter((v) => CALENDAR_CODES.includes(v.code));
    assert.deepEqual(bad, [], `violação ao avançar ${prev.date} → ${state.date}`);
  }
}

function addDaysCapped(from: IsoDate, days: number, cap: IsoDate): IsoDate {
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  const iso = d.toISOString().slice(0, 10);
  return iso > cap ? cap : iso;
}

describe('geração de jogos', () => {
  test('pontos corridos: 380 jogos, 38 por clube, 19 em casa, um jogo por data', () => {
    const ids = CLUBS.slice(0, 20).map((c) => c.id);
    const fs = roundRobin(ids, '2026-02-01', 7, true, createRng(1));
    assert.equal(fs.length, 380);
    for (const id of ids) {
      const mine = fs.filter((f) => f.home === id || f.away === id);
      assert.equal(mine.length, 38);
      assert.equal(mine.filter((f) => f.home === id).length, 19);
      assert.equal(new Set(mine.map((f) => f.date)).size, 38);
    }
    const pairs = new Set(fs.map((f) => `${f.home}>${f.away}`));
    assert.equal(pairs.size, 380, 'cada confronto acontece uma vez em cada mando');
  });
});

describe('avanço do calendário', () => {
  test('saltar ou avançar em passos produz exatamente o mesmo mundo (B4, B18)', () => {
    const jump = world();
    advanceTo(jump, '2028-12-31', { play });
    const steps = world();
    stepTo(steps, '2028-12-31', 'passos');
    assert.deepEqual(steps, jump);
  });

  test('três temporadas sem violar invariantes e sem clube jogando duas vezes no mesmo dia', () => {
    const s = world();
    stepTo(s, '2029-01-05', 'propriedade');
    const seen = new Set<string>();
    for (const f of Object.values(s.fixtures)) {
      for (const club of [f.home, f.away]) {
        const key = `${f.date}:${club}`;
        assert.ok(!seen.has(key), `${club} joga duas vezes em ${f.date}`);
        seen.add(key);
      }
    }
  });

  test('B2: o tempo não volta', () => {
    const s = world();
    advanceTo(s, '2026-06-01', { play });
    assert.throws(() => advanceTo(s, '2026-05-31', { play }), RangeError);
  });

  test('B2: carreira na Liga Inglesa começa perto do primeiro jogo, com o resto do mundo em andamento', () => {
    const cycle = cycleForDivision(DEFAULT_CYCLES, 'PL')!;
    const start = cycleOpenDate(cycle, 2026);
    const s = world();
    advanceTo(s, start, { play });
    const first = nextFixture(s, involves('eng00'))!;
    assert.ok(diffDays(s.date, first.date) <= 60, `${s.date} → ${first.date}`);
    const brA = s.competitions['brA@2026']!;
    assert.ok(brA.fixtureIds.some((id) => s.fixtures[id]!.result), 'a Série A já está em andamento');
  });

  test('B3: a temporada europeia termina e abre a seguinte sem ser descartada pela virada brasileira', () => {
    const s = world();
    advanceTo(s, '2027-08-01', { play });
    for (const id of ['pl@2026/27', 'laliga@2026/27']) {
      const c = s.competitions[id]!;
      assert.equal(c.status, 'finished', id);
      assert.ok(c.championId, `${id} tem campeão`);
      assert.ok(c.fixtureIds.every((f) => s.fixtures[f]!.result), `${id} completa`);
    }
    assert.ok(s.competitions['pl@2027/28'], 'nova temporada inglesa aberta');
    assert.ok(s.competitions['brA@2027'], 'nova temporada brasileira aberta');
  });

  test('B4: a Copa Nacional termina no mesmo salto em que suas fases são criadas', () => {
    const s = world();
    advanceTo(s, '2026-12-31', { play });
    const copa = s.competitions['copa@2026']!;
    assert.equal(copa.status, 'finished');
    // Ida e volta em todas as fases (31 confrontos × 2 jogos), como na Copa do Brasil.
    assert.equal(copa.fixtureIds.length, 62);
    assert.ok(copa.fixtureIds.every((id) => s.fixtures[id]!.result && (s.fixtures[id]!.leg === 1 || s.fixtures[id]!.result!.winnerId)));
    const finalists = copa.fixtureIds.map((id) => s.fixtures[id]!).find((f) => f.roundName === 'Final (volta)')!;
    assert.equal(copa.championId, finalists.result!.winnerId);
  });

  test('ida e volta: o agregado decide, sem gol fora de casa; empate no agregado vai aos pênaltis', () => {
    const s = world();
    advanceTo(s, '2026-12-31', { play });
    const fx = Object.values(s.fixtures).filter((f) => f.competitionId === 'copa@2026');
    for (const back of fx.filter((f) => f.leg === 2)) {
      const first = fx.find((f) => f.leg === 1 && f.round === back.round && f.home === back.away)!;
      const aggBack = back.result!.home + first.result!.away;
      const aggFirst = back.result!.away + first.result!.home;
      if (aggBack !== aggFirst) assert.equal(back.result!.winnerId, aggBack > aggFirst ? back.home : back.away);
      else assert.equal(back.result!.penalties, true);
    }
  });

  test('B16: a Copa Nacional só tem clubes brasileiros', () => {
    const s = world();
    advanceTo(s, '2026-03-01', { play });
    const copa = s.competitions['copa@2026']!;
    assert.equal(copa.participants.length, 32);
    assert.ok(copa.participants.every((id) => id.startsWith('br')));
  });

  test('B11: temporada nova espera a anterior terminar e começa depois dela', () => {
    const longSeason: CycleDef[] = [
      {
        id: 'X',
        name: 'Liga longa',
        yearStyle: 'calendar',
        openOn: '01-10',
        competitions: [{ format: 'league', id: 'x', name: 'Liga X', division: 'A', firstMatch: '06-01', intervalDays: 7, doubleRoundRobin: true }],
      },
    ];
    const s = world(longSeason);
    const events = [];
    const rng = createRng('b11');
    while (s.date < '2027-12-31') {
      events.push(...advanceTo(s, addDaysCapped(s.date, rng.int(5, 40), '2027-12-31'), { play, cycles: longSeason }).events);
    }
    const delayed = events.find((e) => e.type === 'season-delayed');
    assert.ok(delayed, 'a abertura de 2027 foi adiada');
    const finished = events.find((e) => e.type === 'competition-finished' && e.competitionId === 'x@2026')!;
    const opened = events.find((e) => e.type === 'season-opened' && e.seasonKey === '2027')!;
    assert.ok(finished.date <= opened.date && opened.date > '2027-01-10', `${finished.date} → ${opened.date}`);
    assert.ok(s.competitions['x@2027']!.firstMatchDate > finished.date);
    stepTo(world(longSeason), '2028-06-01', 'b11-invariantes', longSeason);
  });

  test('B18: eventos periódicos rodam na própria data, com o mesmo resultado em qualquer ritmo', () => {
    // Registra a data em que cada evento periódico enxerga o mundo e quantos jogos já foram disputados.
    const record = (log: string[]) => (tick: TickKind, st: CalendarState) => {
      const played = Object.values(st.fixtures).filter((f) => f.result).length;
      log.push(`${tick}:${st.date}:${played}`);
    };
    const jumpLog: string[] = [];
    const jump = world();
    advanceTo(jump, '2026-12-31', { play, onTick: record(jumpLog) });
    const stepLog: string[] = [];
    const steps = world();
    const rng = createRng('ticks');
    while (steps.date < '2026-12-31') {
      advanceTo(steps, addDaysCapped(steps.date, rng.int(1, 20), '2026-12-31'), { play, onTick: record(stepLog) });
    }
    assert.deepEqual(stepLog, jumpLog);
    const dates = (kind: TickKind) => jumpLog.filter((x) => x.startsWith(kind)).map((x) => x.split(':')[1]!);
    const weekly = dates('weekly');
    assert.ok(weekly.every((d, i) => i === 0 || diffDays(weekly[i - 1]!, d) === 7));
    assert.deepEqual(dates('monthly'), monthStartsBetween('2026-01-05', '2026-12-31'));
    const played = jumpLog.map((x) => Number(x.split(':')[2]));
    assert.ok(played.at(-1)! > played[0]!, 'cada evento vê o mundo na própria data, não no fim do avanço');
  });

  test('acesso e rebaixamento: 4 sobem e 4 descem na abertura da temporada seguinte', () => {
    const s = world();
    advanceTo(s, '2026-12-31', { play });
    const down = sortTable(s.competitions['brA@2026']!.table).slice(-4).map((r) => r.clubId);
    const up = sortTable(s.competitions['brB@2026']!.table).slice(0, 4).map((r) => r.clubId);
    advanceTo(s, '2027-01-15', { play });
    const a2027 = s.competitions['brA@2027']!.participants;
    assert.ok(up.every((id) => a2027.includes(id)));
    assert.ok(down.every((id) => !a2027.includes(id) && s.competitions['brB@2027']!.participants.includes(id)));
  });

  test('pausa no jogo do usuário: nenhum jogo dele é pulado nem fica no passado', () => {
    const s = world();
    const user = 'bra00';
    let played = 0;
    for (;;) {
      const prev = calendarSnapshot(s, user);
      const { pausedAt } = advanceTo(s, '2026-12-31', { play, pauseOn: involves(user) });
      const bad = checkTransition(prev, calendarSnapshot(s, user)).filter((v) => CALENDAR_CODES.includes(v.code));
      assert.deepEqual(bad, []);
      if (!pausedAt) break;
      assert.equal(s.fixtures[pausedAt]!.date, s.date, 'parou no dia do jogo');
      recordResult(s, pausedAt, { home: 1, away: 1 });
      played++;
    }
    const mine = Object.values(s.fixtures).filter(involves(user));
    assert.equal(played, mine.length);
    assert.ok(mine.every((f) => f.result));
  });

  test('não aceita resultado de jogo futuro', () => {
    const s = world();
    advanceTo(s, '2026-01-20', { play });
    const f = nextFixture(s, involves('bra00'))!;
    assert.throws(() => recordResult(s, f.id, { home: 1, away: 0 }), /hoje é/);
  });
});
