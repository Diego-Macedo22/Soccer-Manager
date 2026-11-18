import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng, hashString } from '../src/rng.ts';

const take = (seed: number | string, n: number) => {
  const r = createRng(seed);
  return Array.from({ length: n }, () => r.next());
};

test('mesma semente gera a mesma sequência', () => {
  assert.deepEqual(take(42, 50), take(42, 50));
  assert.deepEqual(take('carreira-1', 20), take('carreira-1', 20));
});

test('sementes diferentes geram sequências diferentes', () => {
  assert.notDeepEqual(take(1, 10), take(2, 10));
});

test('a sequência é estável entre versões (golden values)', () => {
  // Se estes valores mudarem, saves e replays antigos deixam de ser reproduzíveis.
  const r = createRng(12345);
  assert.deepEqual([r.int(0, 999), r.int(0, 999), r.int(0, 999)], [979, 306, 484]);
  assert.equal(hashString('soccer'), 78213982);
});

test('next() fica em [0, 1) e int() respeita os limites', () => {
  const r = createRng(7);
  for (let i = 0; i < 10_000; i++) {
    const x = r.next();
    assert.ok(x >= 0 && x < 1);
    const k = r.int(-3, 3);
    assert.ok(Number.isInteger(k) && k >= -3 && k <= 3);
  }
});

test('int() cobre todo o intervalo com frequências parecidas', () => {
  const r = createRng(99);
  const counts = new Array(6).fill(0);
  for (let i = 0; i < 60_000; i++) counts[r.int(0, 5)]++;
  for (const c of counts) assert.ok(c > 9_000 && c < 11_000, `contagem fora do esperado: ${c}`);
});

test('estado salvo e restaurado continua a sequência exata', () => {
  const a = createRng(2026);
  a.next();
  a.next();
  const saved = a.getState();
  const expected = [a.next(), a.next(), a.next()];
  const b = createRng(1);
  b.setState(saved);
  assert.deepEqual([b.next(), b.next(), b.next()], expected);
});

test('derive() é independente do consumo do fluxo principal', () => {
  const a = createRng(10);
  const b = createRng(10);
  for (let i = 0; i < 100; i++) b.next(); // outro sistema sorteou mais vezes
  assert.deepEqual(take(a.derive('match:abc').seed, 5), take(b.derive('match:abc').seed, 5));
  assert.notEqual(a.derive('match:abc').seed, a.derive('match:xyz').seed);
});

test('pick/weighted falham alto em lista vazia', () => {
  const r = createRng(1);
  assert.throws(() => r.pick([]), RangeError);
  assert.throws(() => r.weighted([], () => 1), RangeError);
});

test('weighted() respeita os pesos', () => {
  const r = createRng(5);
  let heavy = 0;
  for (let i = 0; i < 10_000; i++) if (r.weighted(['a', 'b'], (x) => (x === 'a' ? 9 : 1)) === 'a') heavy++;
  assert.ok(heavy > 8_700 && heavy < 9_300, `peso 9:1 gerou ${heavy}/10000`);
});

test('poisson() tem média próxima de lambda', () => {
  const r = createRng(3);
  const n = 20_000;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += r.poisson(1.4);
  assert.ok(Math.abs(sum / n - 1.4) < 0.05, `média ${sum / n}`);
});

test('shuffle() mantém os elementos', () => {
  const r = createRng(8);
  const items = Array.from({ length: 20 }, (_, i) => i);
  assert.deepEqual([...r.shuffle(items.slice())].sort((a, b) => a - b), items);
});
