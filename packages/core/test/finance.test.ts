/**
 * Finanças (Fase 2). Corrige B1: folha mensal e receitas lançadas na data em
 * que acontecem, com todo movimento de caixa registrado no extrato.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceTo,
  calendarSnapshot,
  charge,
  checkTransition,
  createCalendar,
  createFinance,
  createFinanceListener,
  createRng,
  financeSnapshot,
  gateIncome,
  involves,
  occupancy,
  receive,
  recordResult,
  seasonGrant,
  spend,
  weeklyMerchandise,
  type CalendarState,
  type Club,
  type FinanceContext,
  type FinanceState,
  type InvariantSnapshot,
  type IsoDate,
  type ResultProvider,
} from '../src/index.ts';

const pad = (i: number) => String(i).padStart(2, '0');
const group = (prefix: string, country: string, division: string, topRep: number): Club[] =>
  Array.from({ length: 20 }, (_, i) => ({ id: `${prefix}${pad(i)}`, country, division, rep: topRep - i }));
const CLUBS: Club[] = [...group('bra', 'BR', 'A', 90), ...group('brb', 'BR', 'B', 72), ...group('eng', 'ENG', 'PL', 95), ...group('esp', 'ESP', 'LL', 94)];
const REP = new Map(CLUBS.map((c) => [c.id, c.rep]));

const USER = 'bra00';
const WAGES = 5_800_000;
const play: ResultProvider = (_f, { rng }) => ({ home: rng.poisson(1.45), away: rng.poisson(1.1) });
const ctx: FinanceContext = {
  club: () => ({ capacity: 49_205, fanbase: 30_000_000, rep: 90, baseBudget: 78_000_000, cycleId: 'BR' }),
  monthlyWages: () => WAGES,
  fanConfidence: () => 80,
  clubRep: (id) => REP.get(id) ?? 60,
};

function career(): { cal: CalendarState; fin: FinanceState } {
  return {
    cal: createCalendar({ seed: 'financas', startDate: '2026-01-05', startYear: 2026, clubs: CLUBS }),
    fin: createFinance(USER, 78_000_000),
  };
}

function snapshot(cal: CalendarState, fin: FinanceState): InvariantSnapshot {
  return { ...calendarSnapshot(cal, USER), ...financeSnapshot(fin) };
}

function addDays(d: IsoDate, n: number, cap: IsoDate): IsoDate {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  const iso = x.toISOString().slice(0, 10);
  return iso > cap ? cap : iso;
}

describe('extrato', () => {
  test('o saldo só muda por lançamento e sempre bate com o extrato', () => {
    const fin = createFinance('x', 1_000);
    receive(fin, { date: '2026-01-10', kind: 'gate', label: 'Bilheteria', amount: 500.4 });
    charge(fin, { date: '2026-02-01', kind: 'payroll', label: 'Folha', amount: 2_000 });
    assert.equal(fin.balance, -500);
    assert.equal(fin.balance, 1_000 + fin.ledger.reduce((s, e) => s + e.value, 0));
  });

  test('gasto sem caixa é recusado e não altera nada', () => {
    const fin = createFinance('x', 100);
    const r = spend(fin, { date: '2026-01-10', kind: 'transfer', label: 'Contratação', amount: 150 });
    assert.deepEqual(r, { ok: false, reason: 'insufficient-funds', shortfall: 50 });
    assert.equal(fin.balance, 100);
    assert.equal(fin.ledger.length, 0);
  });

  test('valor negativo é erro e ref repetida não lança duas vezes', () => {
    const fin = createFinance('x', 0);
    assert.throws(() => receive(fin, { date: '2026-01-10', kind: 'gate', label: 'X', amount: -5 }), RangeError);
    receive(fin, { date: '2026-01-10', kind: 'gate', label: 'X', amount: 5, ref: 'gate:1' });
    assert.equal(receive(fin, { date: '2026-01-10', kind: 'gate', label: 'X', amount: 5, ref: 'gate:1' }), null);
    assert.equal(fin.balance, 5);
  });
});

describe('fórmulas (mesmos números da v0.5)', () => {
  test('bilheteria', () => {
    assert.deepEqual(gateIncome({ capacity: 49_205, fanbase: 30_000_000, homeRep: 84, awayRep: 80, fanConfidence: 100 }), {
      attendance: 46_745,
      ticket: 97,
      income: 4_534_265,
    });
    assert.equal(occupancy({ capacity: 1, fanbase: 1, homeRep: 90, awayRep: 50, fanConfidence: 0 }), 0.38);
    assert.equal(occupancy({ capacity: 1, fanbase: 1, homeRep: 50, awayRep: 90, fanConfidence: 100 }), 1);
  });

  test('produtos e aporte', () => {
    assert.equal(weeklyMerchandise(30_000_000, 100), 900_000);
    assert.equal(weeklyMerchandise(30_000_000, 50), 630_000);
    assert.equal(seasonGrant(78_000_000), 27_300_000);
  });
});

describe('finanças ligadas ao calendário', () => {
  test('B1: folha paga todo mês e caixa coerente com o extrato durante a temporada', () => {
    const { cal, fin } = career();
    const onEvent = createFinanceListener(fin, ctx);
    const rng = createRng('b1');
    while (cal.date < '2026-12-31') {
      const prev = snapshot(cal, fin);
      advanceTo(cal, addDays(cal.date, rng.int(1, 30), '2026-12-31'), { play, onEvent });
      assert.deepEqual(checkTransition(prev, snapshot(cal, fin)), [], `${prev.date} → ${cal.date}`);
    }
    const payroll = fin.ledger.filter((e) => e.kind === 'payroll');
    assert.equal(payroll.length, 11);
    assert.ok(payroll.every((e) => e.value === -WAGES && e.date.endsWith('-01')));
    const homeGames = Object.values(cal.fixtures).filter((f) => f.home === USER && f.result).length;
    assert.equal(fin.ledger.filter((e) => e.kind === 'gate').length, homeGames);
  });

  test('B1: avançar de 3 em 4 dias (quarta/domingo) ou de uma vez dá o mesmo extrato', () => {
    const a = career();
    advanceTo(a.cal, '2026-12-31', { play, onEvent: createFinanceListener(a.fin, ctx) });
    const b = career();
    const onEvent = createFinanceListener(b.fin, ctx);
    let i = 0;
    while (b.cal.date < '2026-12-31') advanceTo(b.cal, addDays(b.cal.date, i++ % 2 ? 4 : 3, '2026-12-31'), { play, onEvent });
    assert.deepEqual(b.fin, a.fin);
    const weeks = Math.floor((Date.parse('2026-12-31') - Date.parse('2026-01-05')) / (7 * 86_400_000));
    assert.equal(a.fin.ledger.filter((e) => e.kind === 'merchandise').length, weeks);
  });

  test('aporte da diretoria só a partir da segunda temporada, inclusive depois de recarregar', () => {
    const a = career();
    advanceTo(a.cal, '2027-01-15', { play, onEvent: createFinanceListener(a.fin, ctx) });
    const board = a.fin.ledger.filter((e) => e.kind === 'board');
    assert.deepEqual(
      board.map((e) => [e.date, e.value, e.detail]),
      [['2027-01-10', 27_300_000, 'Temporada 2027']],
    );
    // "Recarregar o save": cópia do estado e um ouvinte novo no meio da carreira.
    const b = career();
    advanceTo(b.cal, '2026-06-01', { play, onEvent: createFinanceListener(b.fin, ctx) });
    const reloaded = { cal: structuredClone(b.cal), fin: structuredClone(b.fin) };
    advanceTo(reloaded.cal, '2027-01-15', { play, onEvent: createFinanceListener(reloaded.fin, ctx) });
    assert.deepEqual(reloaded.fin, a.fin);
  });

  test('jogo ao vivo do usuário gera bilheteria na data do jogo', () => {
    const { cal, fin } = career();
    const onEvent = createFinanceListener(fin, ctx);
    for (;;) {
      const { pausedAt } = advanceTo(cal, '2026-06-30', { play, onEvent, pauseOn: involves(USER) });
      if (!pausedAt) break;
      recordResult(cal, pausedAt, { home: 2, away: 1 }, { onEvent });
    }
    const homeGames = Object.values(cal.fixtures).filter((f) => f.home === USER && f.result);
    const gate = fin.ledger.filter((e) => e.kind === 'gate');
    assert.equal(gate.length, homeGames.length);
    assert.deepEqual(gate.map((e) => e.date), homeGames.map((f) => f.date).sort());
  });
});
