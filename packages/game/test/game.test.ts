/**
 * Camada de jogo: carreira inteira com a base real, todos os módulos ligados.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore, checkTransition, encodeSave } from '@sm/core';
import { loadDatabase } from '@sm/data';
import { Game } from '../src/index.ts';

const db = loadDatabase();
const newGame = () => Game.create(db, { clubId: 'corinthians', manager: 'Teste', seed: 'jogo' });

function stepTo(g: Game, target: string, days: number[]): void {
  let i = 0;
  while (g.date < target) {
    const d = new Date(`${g.date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days[i++ % days.length]!);
    const next = d.toISOString().slice(0, 10);
    const prev = g.snapshot();
    g.advance(next > target ? target : next);
    assert.deepEqual(checkTransition(prev, g.snapshot()), [], `${prev.date} → ${g.date}`);
  }
}

describe('carreira completa', () => {
  test('uma temporada: invariantes completas a cada passo (data, jogos, folha, caixa, escalação)', () => {
    const g = newGame();
    stepTo(g, '2026-12-31', [3, 4, 9, 17]);
    assert.equal(g.state.calendar.competitions['brA@2026']!.status, 'finished');
    assert.equal(g.state.finance.ledger.filter((e) => e.kind === 'payroll').length, 11);
  });

  test('evolução mensal e lesões acontecem, e a escalação continua válida', () => {
    const g = newGame();
    const before = new Map(Object.entries(g.state.players).map(([id, p]) => [id, p.ovr]));
    g.advance('2026-12-31');
    const young = Object.entries(g.state.players).filter(([, p]) => p.clubId && p.age <= 21);
    const avg = young.reduce((s, [id, p]) => s + p.ovr - before.get(id)!, 0) / young.length;
    assert.ok(avg > 0.5, `jovens de todos os clubes: +${avg.toFixed(2)}`);
    assert.ok(g.state.news.some((n) => n.title.includes('lesionado')), 'houve lesões');
    assert.ok(Object.values(g.state.players).some((p) => p.appsThisSeason > 30), 'titulares acumulam jogos');
  });

  test('salto único e passos variados geram a mesma carreira', () => {
    const a = newGame();
    a.advance('2027-03-01');
    const b = newGame();
    stepTo(b, '2027-03-01', [1, 6, 13, 30]);
    assert.deepEqual(b.state, a.state);
  });

  test('virada de temporada: idade +1, aporte da diretoria e save compactado', () => {
    const g = newGame();
    const age = g.squad()[0]!;
    g.advance('2029-01-20');
    assert.equal(g.state.players[age.id]!.age, (db.players.find((p) => p.id === age.id)!.age) + 3);
    assert.equal(g.state.finance.ledger.filter((e) => e.kind === 'board').length, 3);
    const enc = encodeSave(g.state);
    assert.ok(enc.ok && enc.size < 1_300_000, `save após 3 temporadas: ${enc.ok && enc.size}`);
  });

  test('jogo ao vivo do usuário: avanço para no dia, resultado registrado, salvar e carregar', async () => {
    const g = newGame();
    const { pausedAt } = g.advance('2026-12-31', { stopAtUserMatch: true });
    assert.ok(pausedAt);
    const f = g.state.calendar.fixtures[pausedAt]!;
    assert.equal(g.date, f.date);
    g.playUserMatch(pausedAt, { home: 3, away: 0 });
    assert.deepEqual(g.state.calendar.fixtures[pausedAt]!.result, { home: 3, away: 0, winnerId: f.home });
    const store = new MemoryStore();
    assert.ok((await g.save(store, 'slot')).ok);
    const loaded = (await Game.load(db, store, 'slot'))!;
    assert.deepEqual(loaded.state, g.state);
    loaded.advance('2026-04-01');
    g.advance('2026-04-01');
    assert.deepEqual(loaded.state, g.state, 'carregar o save continua a carreira de forma idêntica');
  });
});

describe('ações da interface', () => {
  test('simular o jogo parado, trocar jogadores, mudar formação e escalar automático', () => {
    const g = newGame();
    const { pausedAt } = g.advance('2026-12-31', { stopAtUserMatch: true });
    g.simulateUserMatch(pausedAt!);
    assert.ok(g.state.calendar.fixtures[pausedAt!]!.result);
    const xi = g.state.lineup.xi[10]!.playerId!;
    const bench = g.state.lineup.bench.find((id) => g.squad().find((p) => p.id === id)!.pos !== 'GOL')!;
    assert.ok(g.swap(xi, bench).ok);
    assert.equal(g.state.lineup.xi[10]!.playerId, bench);
    g.setFormation('4-4-2');
    assert.equal(g.state.lineup.formation, '4-4-2');
    g.autoPick();
    assert.deepEqual(checkTransition(g.snapshot(), g.snapshot()), []);
  });
});
