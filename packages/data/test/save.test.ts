/**
 * Save da carreira (Fase 2, B7): formato versionado, migrações, limite de
 * tamanho, gravação segura e compactação — com a base real de @sm/data.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_SAVE_CHARS,
  MemoryStore,
  SCHEMA_VERSION,
  advanceTo,
  calendarSnapshot,
  checkTransition,
  compactCalendar,
  decodeSave,
  encodeSave,
  readSave,
  writeSave,
  type ResultProvider,
} from '@sm/core';
import { careerSquad, createCareer, loadDatabase } from '../src/index.ts';

const db = loadDatabase();
const play: ResultProvider = (_f, { rng }) => ({ home: rng.poisson(1.4), away: rng.poisson(1.1) });
const career = () => createCareer(db, { clubId: 'corinthians', manager: 'Teste', seed: 'save' });

describe('formato do save', () => {
  test('ida e volta preserva a carreira inteira', () => {
    const s = career();
    advanceTo(s.calendar, '2026-07-01', { play });
    const enc = encodeSave(s);
    assert.ok(enc.ok);
    const dec = decodeSave(enc.text);
    assert.ok(dec.ok);
    assert.deepEqual(dec.state, s);
    assert.equal(dec.migratedFrom, null);
  });

  test('não guarda a base estática e fica bem abaixo do save da v0.5', () => {
    const enc = encodeSave(career());
    assert.ok(enc.ok);
    assert.ok(!enc.text.includes(db.players[0]!.name), 'nomes vêm de @sm/data, não do save');
    assert.ok(enc.size < 1_300_000, `${enc.size} caracteres (v0.5: ~1,3 milhão no início)`);
  });

  test('migra versões antigas em cadeia e recusa versões futuras ou corrompidas', () => {
    const s = career();
    const v1 = encodeSave(s);
    assert.ok(v1.ok);
    const migrations = { [SCHEMA_VERSION]: (d: { news: unknown[] }) => ({ ...d, news: [], migrated: true }) };
    const up = decodeSave(v1.text, migrations, SCHEMA_VERSION + 1);
    assert.ok(up.ok && up.migratedFrom === SCHEMA_VERSION && up.state.schemaVersion === SCHEMA_VERSION + 1);
    assert.deepEqual(decodeSave(v1.text, {}, SCHEMA_VERSION + 1), { ok: false, reason: 'missing-migration', detail: `Sem migração v${SCHEMA_VERSION} → v${SCHEMA_VERSION + 1}` });
    const future = v1.text.replace(`"schemaVersion":${SCHEMA_VERSION}`, `"schemaVersion":${SCHEMA_VERSION + 5}`);
    assert.equal((decodeSave(future) as { reason: string }).reason, 'newer-version');
    assert.equal((decodeSave('{quebrado') as { reason: string }).reason, 'corrupt');
    assert.equal((decodeSave('{"clubId":"x"}') as { reason: string }).reason, 'not-a-save');
  });
});

describe('gravação segura', () => {
  test('save grande demais é recusado sem tocar no armazenamento', async () => {
    const store = new MemoryStore();
    const r = await writeSave(store, 'slot1', career(), 1_000);
    assert.equal(r.ok, false);
    assert.equal(await store.get('slot1'), null);
  });

  test('B7: cota estourada mantém o save anterior e o estado em memória', async () => {
    const s = career();
    const first = encodeSave(s);
    assert.ok(first.ok);
    // Cabe o save atual + outro jogo; o save seguinte (maior) não cabe mais.
    const store = new MemoryStore(first.size + 60_010);
    assert.deepEqual(await writeSave(store, 'slot1', s), { ok: true, size: first.size });
    await store.set('outro-jogo', 'x'.repeat(60_000));
    advanceTo(s.calendar, '2026-03-01', { play });
    const before = structuredClone(s);
    const r = await writeSave(store, 'slot1', s);
    assert.equal(r.ok, false);
    assert.equal((r as { reason: string }).reason, 'storage-error');
    assert.deepEqual(s, before, 'estado em memória intacto');
    const old = await readSave(store, 'slot1');
    assert.ok(old?.ok && old.state.calendar.date === '2026-01-05', 'o save anterior continua legível');
  });
});

describe('compactação', () => {
  test('três temporadas: jogos antigos saem, tabelas e campeões ficam, invariantes valem', () => {
    const s = career();
    advanceTo(s.calendar, '2029-01-20', { play });
    const before = encodeSave(s, Infinity);
    const prev = calendarSnapshot(s.calendar, s.userClubId);
    const removed = compactCalendar(s.calendar);
    assert.ok(removed > 2_000, `${removed} jogos removidos`);
    const bad = checkTransition(prev, calendarSnapshot(s.calendar, s.userClubId)).filter((v) =>
      ['DATE_REGRESSION', 'PAST_FIXTURE_UNPLAYED', 'COMPETITION_DISCARDED'].includes(v.code),
    );
    assert.deepEqual(bad, []);
    const a2026 = s.calendar.competitions['brA@2026']!;
    assert.ok(a2026.championId && a2026.table.length === 20 && a2026.fixtureIds.length === 0);
    const after = encodeSave(s);
    assert.ok(after.ok && before.ok && after.size < before.size * 0.7, `${before.ok && before.size} → ${after.ok && after.size}`);
    assert.ok(after.size < MAX_SAVE_CHARS);
    advanceTo(s.calendar, '2029-06-01', { play });
    assert.ok(careerSquad(s, db, s.userClubId).length >= 16);
  });
});
