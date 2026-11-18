/**
 * Extrai a base de dados da v0.5 (já com nomes fictícios) para packages/data.
 *
 * Uso: npm run extract-data
 * A extração é determinística: rodar de novo gera os mesmos arquivos (há um
 * teste que garante isso). Só regenere se o legado ou as regras de conversão
 * mudarem de propósito.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { convertLegacyDatabase } from '@sm/data/convert';
import { LegacyGame } from '@sm/legacy-harness';
import { legacySha256 } from './characterize.ts';

/** Semente do legado: o potencial dos jogadores era sorteado a cada carreira; fica congelado com a semente 1. */
export const EXTRACTION_SEED = 1;

const DATA_DIR = new URL('../../data/src/data/', import.meta.url);

/** Um registro por linha: diffs legíveis no git. */
function jsonLines(items: unknown[]): string {
  return `[\n${items.map((x) => JSON.stringify(x)).join(',\n')}\n]\n`;
}

export function extractData(): Record<string, string> {
  const game = LegacyGame.load({ seed: EXTRACTION_SEED });
  game.startCareer('corinthians');
  const { db, legacyIdMap, report } = convertLegacyDatabase(game.state().db);
  return {
    'clubs.json': jsonLines(db.clubs),
    'players.json': jsonLines(db.players),
    'legacy-id-map.json': `${JSON.stringify(legacyIdMap, null, 0).replace(/,"/g, ',\n"')}\n`,
    'meta.json': `${JSON.stringify(
      {
        description: 'Base extraída do legado v0.5 por `npm run extract-data`. Não edite à mão sem atualizar as regras de conversão.',
        dataVersion: db.version,
        legacyAppSha256: legacySha256(),
        legacySeed: EXTRACTION_SEED,
        counts: { clubs: db.clubs.length, players: db.players.length },
        report,
      },
      null,
      2,
    )}\n`,
  };
}

if (import.meta.main) {
  const files = extractData();
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(new URL(name, DATA_DIR), content);
    console.log(`gravado ${fileURLToPath(new URL(name, DATA_DIR))} (${Math.round(content.length / 1024)} KB)`);
  }
  console.log(JSON.parse(files['meta.json']!).report);
}
