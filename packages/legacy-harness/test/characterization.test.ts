/**
 * Garante que o golden master do legado continua válido:
 * 1. o legado não mudou desde que a caracterização foi gerada (ele está congelado);
 * 2. a mesma semente reproduz exatamente as mesmas métricas (o harness é determinístico).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { legacySha256, runSeason } from '../scripts/characterize.ts';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/characterization.json', import.meta.url), 'utf8'));

test('o legado (game/frontend/js/app.js) não mudou desde a caracterização', () => {
  assert.equal(
    legacySha256(),
    fixture.legacyAppSha256,
    'O legado está congelado. Se a mudança foi intencional, rode `npm run characterize` e revise o diff do JSON.',
  );
});

test('a caracterização é reproduzível pela semente', () => {
  const { seed, metrics } = fixture.perSeed[0];
  assert.deepEqual(runSeason(seed), metrics);
});
