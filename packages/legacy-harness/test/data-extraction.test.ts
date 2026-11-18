/**
 * Os arquivos de packages/data/src/data são reproduzíveis a partir do legado:
 * se alguém editar o JSON à mão ou mudar a conversão sem regenerar, este teste falha.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractData } from '../scripts/extract-data.ts';

test('a base em packages/data é exatamente a extraída do legado', () => {
  const files = extractData();
  for (const [name, content] of Object.entries(files)) {
    const committed = readFileSync(new URL(`../../data/src/data/${name}`, import.meta.url), 'utf8');
    assert.equal(committed, content, `${name} difere da extração; rode \`npm run extract-data\` e revise o diff`);
  }
});
