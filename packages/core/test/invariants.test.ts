import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSnapshot, checkTransition, codes, type InvariantSnapshot, type SnapshotPlayer } from '../src/invariants.ts';

const squad: SnapshotPlayer[] = [
  { id: 'gk', clubId: 'me', position: 'GOL', injuredUntil: null },
  ...Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, clubId: 'me', position: 'MC', injuredUntil: null })),
  { id: 'rival', clubId: 'other', position: 'ATA', injuredUntil: null },
];

const base = (over: Partial<InvariantSnapshot> = {}): InvariantSnapshot => ({
  date: '2026-01-05',
  clubId: 'me',
  budget: 1_000,
  ledger: [],
  fixtures: [
    { id: 'f1', competitionId: 'liga', date: '2026-01-10', played: false, home: 'me', away: 'other' },
    { id: 'f2', competitionId: 'liga', date: '2026-01-17', played: false, home: 'other', away: 'me' },
  ],
  competitions: [{ id: 'liga', finished: false }],
  players: squad,
  lineup: [{ playerId: 'gk', slot: 'GOL' }, ...Array.from({ length: 10 }, (_, i) => ({ playerId: `p${i}`, slot: 'MC' }))],
  ...over,
});

test('um avanço correto não gera violações', () => {
  const prev = base();
  const next = base({
    date: '2026-02-03',
    budget: 1_000 - 300 + 50,
    ledger: [
      { date: '2026-01-10', kind: 'gate', value: 50 },
      { date: '2026-02-01', kind: 'payroll', value: -300 },
    ],
    fixtures: prev.fixtures.map((f) => ({ ...f, played: true })),
  });
  assert.deepEqual(checkTransition(prev, next), []);
});

test('detecta data voltando no tempo (B2)', () => {
  const prev = base({ date: '2027-06-30', fixtures: [] });
  assert.deepEqual(codes(checkTransition(prev, { ...prev, date: '2027-01-05' })), ['DATE_REGRESSION']);
});

test('detecta folha salarial ausente (B1)', () => {
  const v = checkTransition(base(), base({ date: '2026-03-15' }));
  assert.ok(codes(v).includes('PAYROLL_MISSING'));
  assert.match(v.find((x) => x.code === 'PAYROLL_MISSING')!.message, /2026-02, 2026-03/);
});

test('detecta jogo no passado sem resultado (B4)', () => {
  assert.deepEqual(codes(checkSnapshot(base({ date: '2026-01-20' }))), ['PAST_FIXTURE_UNPLAYED']);
});

test('detecta competição descartada no meio (B3)', () => {
  const prev = base({ fixtures: base().fixtures.map((f, i) => ({ ...f, played: i === 0 })), date: '2026-01-12' });
  const next = base({ fixtures: [], competitions: [], date: '2026-01-12' });
  assert.deepEqual(codes(checkTransition(prev, next)), ['COMPETITION_DISCARDED']);
});

test('detecta caixa que muda sem lançamento', () => {
  assert.deepEqual(codes(checkTransition(base(), base({ budget: 5_000 }))), ['BUDGET_LEDGER_MISMATCH']);
});

test('valida a escalação (B6)', () => {
  const lineup = base().lineup!;
  const swapGk = lineup.map((x) => (x.slot === 'GOL' ? { ...x, playerId: 'p11' } : x));
  assert.deepEqual(codes(checkSnapshot(base({ lineup: swapGk }))), ['LINEUP_GOALKEEPER']);
  assert.deepEqual(codes(checkSnapshot(base({ lineup: lineup.slice(0, 10) }))), ['LINEUP_SIZE']);
  const foreign = lineup.map((x, i) => (i === 3 ? { ...x, playerId: 'rival' } : x));
  assert.deepEqual(codes(checkSnapshot(base({ lineup: foreign }))), ['LINEUP_FOREIGN_PLAYER']);
  const injured = squad.map((p) => (p.id === 'p2' ? { ...p, injuredUntil: '2026-02-01' } : p));
  assert.deepEqual(codes(checkSnapshot(base({ players: injured }))), ['LINEUP_INJURED']);
});
