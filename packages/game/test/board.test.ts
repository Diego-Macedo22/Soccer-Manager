/**
 * Diretoria, nota do técnico, troca de clube e olheiros.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore, boardObjectives, checkTransition, createBoard, decodeSave, encodeSave, recordOutcome, updateConfidence } from '@sm/core';
import { loadDatabase } from '@sm/data';
import { Game } from '../src/index.ts';

const db = loadDatabase();
const newGame = (clubId = 'corinthians', seed = 'diretoria') => Game.create(db, { clubId, manager: 'Teste', seed });

describe('regras', () => {
  test('objetivos pela reputação e divisão; nota e confiança pelos resultados', () => {
    assert.equal(boardObjectives({ rep: 88, division: 'A' })[0]!.target, 3);
    assert.equal(boardObjectives({ rep: 65, division: 'A' })[0]!.target, 16);
    assert.equal(boardObjectives({ rep: 72, division: 'B' })[0]!.target, 4);
    const b = createBoard({ rep: 70, division: 'A' });
    recordOutcome(b, 'win', 80, 70);
    assert.equal(b.rating, 5.05);
    for (let i = 0; i < 8; i++) recordOutcome(b, 'loss', 60, 70);
    updateConfidence(b, 50, 1, 70);
    assert.ok(b.clubConfidence < 50 && b.fanConfidence < 40, JSON.stringify(b));
    assert.equal(b.record.played, 9);
  });
});

describe('carreira', () => {
  test('temporada: recorde, confiança e avaliação final com invariantes', () => {
    const g = newGame();
    let prev = g.snapshot();
    for (const d of ['2026-04-01', '2026-08-01', '2026-12-31']) {
      g.advance(d);
      const next = g.snapshot();
      assert.deepEqual(checkTransition(prev, next), []);
      prev = next;
    }
    const b = g.state.board;
    assert.ok(b.record.played >= 38, `jogos: ${b.record.played}`);
    assert.equal(b.history.length, 1);
    assert.ok(b.history[0]!.position! >= 1);
    assert.equal(g.objectiveStatuses().length, 4);
    assert.ok(g.state.news.some((n) => n.title.startsWith('Avaliação da temporada') || n.title.startsWith('❌')));
  });

  test('troca de clube: novo caixa, elenco, objetivos; demitido não avança', () => {
    const g = newGame();
    g.state.board.sacked = true;
    g.state.board.jobOffers = [{ clubId: 'palmeiras', expires: '2027-12-31' }];
    const d = g.date;
    g.advance('2026-03-01');
    assert.equal(g.date, d, 'demitido não avança');
    assert.ok(g.takeJob('palmeiras').ok);
    assert.equal(g.state.userClubId, 'palmeiras');
    assert.equal(g.state.finance.clubId, 'palmeiras');
    assert.ok(g.state.lineup.xi.every((s) => !s.playerId || g.state.players[s.playerId]!.clubId === 'palmeiras'));
    assert.equal(g.state.board.sacked, false);
    const prev = g.snapshot();
    g.advance('2026-03-01');
    assert.deepEqual(checkTransition(prev, g.snapshot()), []);
  });

  test('olheiro: contratação, missão e relatório', async () => {
    const g = newGame();
    assert.ok(g.hireScout().ok);
    const sc = g.state.board.scouts[0]!;
    assert.ok(g.sendScout(sc.id, 'ESP', 1).ok);
    g.advance('2026-02-20');
    assert.equal(sc.mission, null);
    assert.equal(sc.reports.length, 5);
    for (const r of sc.reports) assert.ok(['ESP'].includes(db.clubs.find((c) => c.id === g.state.players[r.playerId]!.clubId)!.country));
    const store = new MemoryStore();
    await g.save(store, 's');
    assert.equal((await Game.load(db, store, 's'))!.state.board.scouts[0]!.reports.length, 5);
  });

  test('save v2 migra para v3 e recebe objetivos ao carregar', async () => {
    const g = newGame();
    const enc = encodeSave(g.state);
    assert.ok(enc.ok);
    const raw = JSON.parse(enc.text);
    raw.schemaVersion = raw.data.schemaVersion = 2;
    delete raw.data.board;
    const r = decodeSave(JSON.stringify(raw));
    assert.ok(r.ok && r.migratedFrom === 2);
    const store = new MemoryStore();
    await store.set('s', JSON.stringify(raw));
    const back = await Game.load(db, store, 's');
    assert.equal(back!.state.board.objectives.length, 4);
  });
});
