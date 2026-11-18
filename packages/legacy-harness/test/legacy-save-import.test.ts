/**
 * B7: um save real da v0.5 (gerado pelo harness) é importado para o formato
 * novo, preservando clube, técnico, caixa, divisões e jogadores.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeSave, encodeSave, lineupSnapshot, lineupValid } from '@sm/core';
import { careerSquad, importLegacySave, loadDatabase } from '@sm/data';
import { LegacyGame } from '@sm/legacy-harness';

const map: Record<string, string> = JSON.parse(readFileSync(new URL('../../data/src/data/legacy-id-map.json', import.meta.url), 'utf8'));

test('save da v0.5 vira uma carreira válida no formato novo', () => {
  const game = LegacyGame.load({ seed: 7 });
  game.startCareer('flamengo', 'Técnica Teste');
  game.advanceTo('2026-06-01');
  const legacy = JSON.parse(game.storage.getItem('soccerManagerV05')!);
  const db = loadDatabase();
  const { state, report } = importLegacySave(legacy, db, map);

  assert.equal(state.userClubId, 'flamengo');
  assert.equal(state.manager, 'Técnica Teste');
  assert.equal(state.finance.balance, Math.round(legacy.budget));
  assert.equal(report.startsAt, '2027-01-05');
  assert.ok(report.playersImported > 1_500, `${report.playersImported} importados`);
  const squad = careerSquad(state, db, 'flamengo');
  const legacySquad = (legacy.db.players as { id: string; clubId: string }[]).filter((p) => p.clubId === 'flamengo' && map[p.id]);
  assert.ok(legacySquad.every((p) => squad.some((s) => s.id === map[p.id])), 'todo jogador do elenco antigo está no elenco novo');
  const v = lineupValid({ date: state.calendar.date, clubId: 'flamengo', budget: 0, ledger: [], fixtures: [], competitions: [], ...lineupSnapshot(state.lineup, squad) });
  assert.deepEqual(v, []);

  const enc = encodeSave(state);
  assert.ok(enc.ok && enc.size < game.saveSizeChars(), `novo ${enc.ok && enc.size} × v0.5 ${game.saveSizeChars()}`);
  const dec = decodeSave(enc.text);
  assert.ok(dec.ok);
  assert.deepEqual(dec.state, state);
});
