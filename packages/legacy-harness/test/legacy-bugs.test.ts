/**
 * Reproduções automatizadas dos bugs do legado v0.5.
 *
 * Estes testes PASSAM enquanto o bug existir: documentam o comportamento do
 * legado congelado (tag v0.5-legacy). O novo core é validado pelas mesmas
 * invariantes (`@sm/core`), mas lá a expectativa é a oposta: nenhuma violação.
 */
import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { checkTransition, codes, diffDays, type InvariantSnapshot, type Violation } from '@sm/core';
import { LegacyGame, seasonMetrics, toSnapshot, type LegacyState } from '@sm/legacy-harness';

describe('carreira no Brasil, avanço pelo calendário de 05/01 a 20/12/2026', () => {
  let game: LegacyGame;
  let start: LegacyState;
  let end: LegacyState;
  let violations: Violation[];

  before(() => {
    game = LegacyGame.load({ seed: 1 });
    game.startCareer('corinthians');
    start = game.state();
    game.advanceTo('2026-12-20');
    end = game.state();
    violations = checkTransition(toSnapshot(start), toSnapshot(end));
  });

  test('B1: nenhuma folha salarial é paga e o caixa só cresce', () => {
    assert.ok(codes(violations).includes('PAYROLL_MISSING'));
    const types = new Set((end.financeLedger as { type: string }[]).map((e) => e.type));
    assert.deepEqual([...types], ['Bilheteria']);
    assert.ok(end.budget > start.budget * 1.5, `caixa ${start.budget} → ${end.budget}`);
  });

  test('B4: a Copa trava com jogos no passado sem resultado', () => {
    assert.ok(codes(violations).includes('PAST_FIXTURE_UNPLAYED'));
    assert.match(violations.find((v) => v.code === 'PAST_FIXTURE_UNPLAYED')!.message, /copa/);
    assert.equal(end.competitions.copa.finished, false);
  });

  test('B17: a evolução mensal derruba o OVR dos jovens em vez de evoluí-los', () => {
    const m = seasonMetrics(start, end, 0);
    assert.ok(m.development.youngAvgOvrDelta < -1, `variação média dos jovens: ${m.development.youngAvgOvrDelta}`);
  });

  test('B18: avançando pelo calendário, o mercado da IA não faz nenhuma transferência', () => {
    assert.equal(seasonMetrics(start, end, 0).market.aiPlayersChangedClub, 0);
  });

  test('B3: a virada de temporada descarta as ligas europeias em andamento', () => {
    const beforeTurn: InvariantSnapshot = toSnapshot(end);
    game.finishOffseason();
    const after = toSnapshot(game.state());
    const discarded = checkTransition(beforeTurn, after).filter((v) => v.code === 'COMPETITION_DISCARDED');
    const ids = discarded.map((v) => v.message.split(' ')[0]);
    assert.ok(ids.includes('pl') && ids.includes('laliga'), JSON.stringify(discarded));
  });
});

describe('carreira na Liga Inglesa', () => {
  let game: LegacyGame;
  let clubId: string;

  before(() => {
    game = LegacyGame.load({ seed: 2 });
    clubId = game.clubOptions().find((c) => c.label.includes('Liga Inglesa'))!.id;
    game.startCareer(clubId);
  });

  test('B2: mais de 6 meses entre o início da carreira e o primeiro jogo da liga', () => {
    const s = game.state();
    const first = (s.fixtures as { compId: string; date: string; home: string; away: string }[])
      .filter((f) => f.compId === 'pl' && (f.home === clubId || f.away === clubId))
      .map((f) => f.date)
      .sort()[0]!;
    assert.ok(diffDays(s.date, first) > 180, `${s.date} → ${first}`);
  });

  test('B16: a Copa Nacional brasileira é preenchida por clubes ingleses e espanhóis', () => {
    const s = game.state();
    const division = new Map((s.db.clubs as { id: string; division: string }[]).map((c) => [c.id, c.division]));
    const foreign = (s.competitions.copa.clubIds as string[]).filter((id) => ['PL', 'LL'].includes(division.get(id)!));
    assert.ok(foreign.length >= 10, `${foreign.length} estrangeiros entre 32`);
    assert.ok(foreign.includes(clubId), 'o próprio clube inglês do usuário disputa a Copa Nacional');
  });

  test('B2: a nova temporada faz a data voltar no tempo', () => {
    game.advanceTo('2027-06-30');
    const seasonEnd = toSnapshot(game.state());
    assert.equal(game.state().offseason?.active, true);
    game.finishOffseason();
    const next = toSnapshot(game.state());
    assert.ok(codes(checkTransition(seasonEnd, next)).includes('DATE_REGRESSION'));
    assert.equal(next.date, '2027-01-05');
  });
});

describe('interface e save', () => {
  test('B5: a seleção para troca em Táticas é apagada a cada renderização', () => {
    const game = LegacyGame.load({ seed: 3 });
    game.startCareer('corinthians');
    const [a, b] = (game.state().lineup.xi as { playerId: string }[]).map((x) => x.playerId);
    game.call('v04SelectPlayer', a);
    game.call('v04SelectPlayer', b);
    const html = game.html('#tactics');
    assert.match(html, /tactic-player/, 'a tela de táticas foi renderizada');
    assert.doesNotMatch(html, /selected-player/);
    assert.doesNotMatch(html, /swap-bar/);
  });

  test('B7: com outro save antigo na mesma origem, o save estoura a cota sem tratamento', () => {
    const game = LegacyGame.load({
      seed: 4,
      storageQuotaChars: 5_242_880,
      preloadStorage: { soccerManagerV04: 'x'.repeat(4_000_000) },
    });
    assert.throws(() => game.startCareer('corinthians'), { name: 'QuotaExceededError' });
    assert.equal(game.storage.getItem('soccerManagerV05'), null);
  });

  test('B8: a partida ao vivo grava o save inteiro a cada minuto', () => {
    const game = LegacyGame.load({ seed: 5 });
    game.startCareer('corinthians');
    game.advanceToNextEvent();
    game.call('startMatch');
    assert.ok(game.state().match, 'a partida começou');
    const writes = game.storage.writes;
    game.tick(30);
    assert.equal(game.state().match.minute, 30);
    assert.ok(game.storage.writes - writes >= 30, `${game.storage.writes - writes} gravações em 30 minutos`);
    assert.ok(game.saveSizeChars() > 1_000_000);
  });
});
