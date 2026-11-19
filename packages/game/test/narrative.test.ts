/**
 * Fase 4.5: autores dos gols, artilharia e prêmios, rodada ao vivo exata e
 * lesões em campo.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_SUBS, positionsAt, simulateMatch } from '@sm/core';
import { loadDatabase } from '@sm/data';
import { Game } from '../src/index.ts';

const db = loadDatabase();

describe('gols, artilharia e prêmios', () => {
  const g = Game.create(db, { clubId: 'corinthians', manager: 'Teste', seed: 'artilharia' });
  g.advance('2026-06-01');
  const brA = Object.values(g.state.calendar.competitions).find((c) => c.id.startsWith('brA@'))!;
  const last = brA.fixtureIds.map((id) => g.state.calendar.fixtures[id]!.date).sort().pop()!;
  g.advance(last);
  const played = brA.fixtureIds.map((id) => g.state.calendar.fixtures[id]!).filter((f) => f.result);

  test('todo gol tem autor e minuto, e os gols batem com o placar', () => {
    assert.ok(played.length > 300);
    for (const f of played) {
      const goals = f.result!.goals ?? [];
      assert.equal(goals.filter((x) => x[0] === 0).length, f.result!.home, f.id);
      assert.equal(goals.filter((x) => x[0] === 1).length, f.result!.away, f.id);
      for (const [, minute, scorer, assist] of goals) {
        assert.ok(minute >= 1 && minute <= 100, `${f.id}: minuto ${minute}`);
        assert.ok(g.state.players[scorer], `${f.id}: autor ${scorer}`);
        assert.notEqual(scorer, assist);
      }
    }
  });

  test('artilharia derivada dos resultados, com atacantes na frente', () => {
    const stats = g.competitionStats(brA.id);
    const total = played.reduce((t, f) => t + f.result!.home + f.result!.away, 0);
    assert.equal(stats.reduce((t, s) => t + s.goals, 0), total);
    const top = stats.slice(0, 10).map((s) => g.playerPositions(s.playerId)[0]!);
    assert.ok(top.filter((pos) => ['ATA', 'SA', 'PE', 'PD', 'MAT'].includes(pos)).length >= 7, JSON.stringify(top));
    assert.ok(stats[0]!.goals >= 12 && stats[0]!.goals <= 40, `artilheiro com ${stats[0]!.goals}`);
  });

  test('o chute que vira gol fica onde foi batido (mapa de chutes)', () => {
    const home = g.matchTeam('corinthians');
    const away = g.matchTeam('palmeiras');
    let goals = 0;
    for (let i = 0; i < 40; i++) {
      const ev = simulateMatch({ seed: `mapa${i}`, home, away }).events;
      ev.forEach((e, k) => {
        if (e.type !== 'goal') return;
        goals++;
        const shot = ev[k - 1]!;
        assert.equal(shot.type, 'shot');
        assert.ok(shot.x > 0.5 && shot.x < 104.5, `origem ${shot.x}`);
        assert.ok(e.t > shot.t, 'a bola chega à rede depois do chute');
      });
    }
    assert.ok(goals > 40, `${goals} gols`);
  });

  test('fim da liga publica os prêmios', () => {
    const awards = g.state.news.find((n) => n.title.startsWith(`🏅 Prêmios da ${brA.name}`));
    assert.ok(awards, 'notícia dos prêmios');
    assert.match(awards.body, /Craque: .+ • Artilheiro: .+ gols • Garçom: .+ assistências/);
  });
});

describe('rodada ao vivo', () => {
  test('a prévia dos outros jogos do dia é exatamente o que acontece', () => {
    const h = Game.create(db, { clubId: 'corinthians', manager: 'Teste', seed: 'rodada' });
    let id = h.advance('2026-12-31', { stopAtUserMatch: true }).pausedAt;
    while (id && !id.startsWith('brA@')) {
      h.finishUserMatch(id);
      id = h.advance('2026-12-31', { stopAtUserMatch: true }).pausedAt;
    }
    assert.ok(id, 'jogo de liga do usuário');
    const preview = h.dayResults(id);
    assert.ok(preview.length >= 5, `${preview.length} jogos na rodada`);
    h.finishUserMatch(id);
    for (const f of preview) assert.deepEqual(h.state.calendar.fixtures[f.id]!.result, f.result, f.id);
  });
});

describe('lesões em campo', () => {
  const g = Game.create(db, { clubId: 'corinthians', manager: 'Teste', seed: 'lesoes' });
  const clubs = db.clubs.filter((c) => c.division === 'A').map((c) => c.id);
  const teams = new Map(clubs.map((c) => [c, g.matchTeam(c)]));

  test('acontecem numa taxa realista e tiram o jogador de campo', () => {
    let injuries = 0;
    const n = 200;
    for (let i = 0; i < n; i++) {
      const input = { seed: `lesao${i}`, home: teams.get(clubs[i % 20]!)!, away: teams.get(clubs[(i * 7 + 3) % 20]!)! };
      const tl = simulateMatch(input);
      for (const e of tl.events.filter((x) => x.type === 'injury')) {
        injuries++;
        assert.ok(!tl.final[e.side].includes(e.player!), 'lesionado não termina em campo');
        assert.ok(!positionsAt(input, tl, tl.duration - 1).players.some((p) => p.id === e.player), 'nem no visualizador');
      }
      for (const s of ['home', 'away'] as const) assert.ok(tl.events.filter((e) => e.type === 'sub' && e.side === s).length <= MAX_SUBS);
    }
    assert.ok(injuries / n > 0.12 && injuries / n < 0.5, `${injuries / n} lesões por jogo`);
  });

  test('o lesionado do usuário fica fora dos próximos jogos', () => {
    const h = Game.create(db, { clubId: 'corinthians', manager: 'Teste', seed: 'lesao-usuario' });
    for (let i = 0; i < 40; i++) {
      const id = h.advance('2027-12-31', { stopAtUserMatch: true }).pausedAt;
      assert.ok(id);
      const side = h.state.calendar.fixtures[id]!.home === 'corinthians' ? 'home' : 'away';
      const hurt = h.runMatch(id).events.find((e) => e.type === 'injury' && e.side === side);
      h.finishUserMatch(id);
      if (!hurt) continue;
      assert.ok(h.state.players[hurt.player!]!.injuredUntil! > h.date, 'data de volta no futuro');
      assert.ok(!h.state.lineup.xi.some((s) => s.playerId === hurt.player), 'saiu da escalação');
      assert.ok(h.state.news.some((n) => n.title.includes('se machucou em campo')));
      return;
    }
    assert.fail('nenhuma lesão do usuário em 40 jogos');
  });

  test('troca de formação ao vivo fica registrada na linha do tempo', () => {
    const input = { seed: 'formacao', home: teams.get('corinthians')!, away: teams.get('palmeiras')!, manual: ['home' as const] };
    const tl = simulateMatch(input, [{ minute: 30, side: 'home', type: 'formation', formation: '4-4-2' }]);
    assert.ok(tl.events.some((e) => e.type === 'tactics' && e.side === 'home' && e.other === '4-4-2'));
  });
});
