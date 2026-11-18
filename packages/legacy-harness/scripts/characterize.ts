/**
 * Gera o "golden master estatístico" do legado: uma temporada completa por
 * semente, avançando pelo calendário (05/01 → 20/12/2026) com o Corintianos.
 *
 * Uso: npm run characterize -- [quantidade de sementes, padrão 8]
 * Saída: packages/legacy-harness/fixtures/characterization.json
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LEGACY_APP_PATH, LegacyGame, seasonMetrics, type SeasonMetrics } from '@sm/legacy-harness';

export const CHARACTERIZATION_CLUB = 'corinthians';
export const CHARACTERIZATION_END = '2026-12-20';

export function runSeason(seed: number): SeasonMetrics {
  const game = LegacyGame.load({ seed });
  game.startCareer(CHARACTERIZATION_CLUB);
  const start = game.state();
  game.advanceTo(CHARACTERIZATION_END);
  return seasonMetrics(start, game.state(), game.saveSizeChars());
}

export function legacySha256(): string {
  return createHash('sha256').update(readFileSync(LEGACY_APP_PATH)).digest('hex');
}

type Num = Record<string, unknown>;
function aggregate(samples: Num[]): Num {
  const out: Num = {};
  const first = samples[0] ?? {};
  for (const key of Object.keys(first)) {
    const values = samples.map((s) => s[key]);
    if (typeof first[key] === 'number') {
      const xs = values as number[];
      const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
      out[key] = { mean: Math.round(mean * 1000) / 1000, min: Math.min(...xs), max: Math.max(...xs) };
    } else if (typeof first[key] === 'boolean') {
      out[key] = { trueRate: (values as boolean[]).filter(Boolean).length / values.length };
    } else if (first[key] && typeof first[key] === 'object') {
      out[key] = aggregate(values as Num[]);
    }
  }
  return out;
}

if (import.meta.main) {
  const n = Number(process.argv[2] ?? 8);
  const perSeed: { seed: number; metrics: SeasonMetrics }[] = [];
  for (let seed = 1; seed <= n; seed++) {
    const t = performance.now();
    perSeed.push({ seed, metrics: runSeason(seed) });
    console.log(`semente ${seed}/${n}: ${Math.round((performance.now() - t) / 1000)} s`);
  }
  const out = {
    description:
      'Golden master estatístico do legado v0.5. Finanças excluídas (B1). Copa e ligas europeias refletem B3/B4. Regenerar com `npm run characterize` só se o legado mudar de propósito.',
    legacyAppSha256: legacySha256(),
    scenario: { club: CHARACTERIZATION_CLUB, from: '2026-01-05', to: CHARACTERIZATION_END },
    aggregate: aggregate(perSeed.map((p) => p.metrics as unknown as Num)),
    perSeed,
  };
  const path = new URL('../fixtures/characterization.json', import.meta.url);
  writeFileSync(path, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`gravado em ${fileURLToPath(path)}`);
}
