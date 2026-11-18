import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, compareDates, diffDays, isIsoDate, monthKey, monthStartsBetween } from '../src/dates.ts';

test('valida datas ISO reais', () => {
  assert.ok(isIsoDate('2026-02-28'));
  assert.ok(isIsoDate('2028-02-29'));
  assert.ok(!isIsoDate('2026-02-29'));
  assert.ok(!isIsoDate('2026-13-01'));
  assert.ok(!isIsoDate('05/01/2026'));
});

test('addDays e diffDays atravessam meses e anos', () => {
  assert.equal(addDays('2026-12-30', 3), '2027-01-02');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(diffDays('2026-01-05', '2026-12-20'), 349);
  assert.equal(diffDays('2027-06-30', '2027-01-05'), -176);
});

test('compareDates ordena', () => {
  assert.ok(compareDates('2026-01-05', '2026-01-06') < 0);
  assert.equal(compareDates('2026-01-05', '2026-01-05'), 0);
});

test('monthStartsBetween lista os dias 1 atravessados em (from, to]', () => {
  assert.deepEqual(monthStartsBetween('2026-01-05', '2026-03-01'), ['2026-02-01', '2026-03-01']);
  assert.deepEqual(monthStartsBetween('2026-01-01', '2026-01-31'), []);
  assert.deepEqual(monthStartsBetween('2026-12-20', '2027-01-01'), ['2027-01-01']);
  assert.equal(monthStartsBetween('2026-01-05', '2026-12-20').length, 11);
});

test('avanços curtos e um avanço longo cobrem os mesmos meses', () => {
  // A receita semanal do legado reiniciava a contagem a cada avanço (bug latente de B1).
  const steps = ['2026-01-05', '2026-01-08', '2026-01-31', '2026-02-02', '2026-02-27', '2026-03-03'];
  const short = steps.slice(1).flatMap((d, i) => monthStartsBetween(steps[i]!, d));
  assert.deepEqual(short, monthStartsBetween('2026-01-05', '2026-03-03'));
  assert.equal(monthKey('2026-03-03'), '2026-03');
});
