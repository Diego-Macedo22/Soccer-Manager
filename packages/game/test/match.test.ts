/**
 * Motor de partida: determinismo, mudanças ao vivo, regras e calibração.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_SUBS, positionsAt, simulateMatch, type MatchInput } from '@sm/core';
import { loadDatabase } from '@sm/data';
import { Game } from '../src/index.ts';

const db = loadDatabase();
const g = Game.create(db, { clubId: 'corinthians', manager: 'Teste', seed: 'motor' });
const clubs = db.clubs.filter((c) => c.division === 'A').map((c) => c.id);
const input = (seed: string, h = 'corinthians', a = 'palmeiras'): MatchInput => ({ seed, home: g.matchTeam(h), away: g.matchTeam(a), manual: ['home'] });

describe('motor de partida', () => {
  test('determinístico: mesma seed e entradas = mesma partida', () => {
    assert.deepEqual(simulateMatch(input('x')), simulateMatch(input('x')));
    assert.notDeepEqual(simulateMatch(input('x')).events, simulateMatch(input('y')).events);
  });

  test('placar e estatísticas derivados dos eventos (B9)', () => {
    const tl = simulateMatch(input('stats'));
    for (const s of ['home', 'away'] as const) {
      const goals = tl.events.filter((e) => e.type === 'goal' && e.side === s).length;
      assert.equal(tl.score[s], goals);
      assert.equal(tl.stats[s].goals, goals);
      assert.ok(tl.stats[s].onTarget >= goals && tl.stats[s].shots >= tl.stats[s].onTarget);
    }
    assert.equal(tl.stats.home.possession + tl.stats.away.possession, 100);
    for (let i = 1; i < tl.events.length; i++) assert.ok(tl.events[i]!.t >= tl.events[i - 1]!.t, 'tempo crescente');
  });

  test('mudança ao vivo: tudo antes do minuto é idêntico; substituição respeita o limite', () => {
    const inp = input('ao-vivo');
    const base = simulateMatch(inp);
    const out = inp.home.xi[9]!.id;
    const inn = inp.home.bench[0]!.id;
    const changed = simulateMatch(inp, [{ minute: 60, side: 'home', type: 'sub', out, in: inn }]);
    const before = (tl: typeof base) => tl.events.filter((e) => e.t < tl.secondHalfStart + 15 * 60 - 1);
    assert.deepEqual(before(changed), before(base));
    assert.ok(changed.events.some((e) => e.type === 'sub' && e.player === inn && e.other === out));
    const many = inp.home.bench.slice(0, 7).map((b, i) => ({ minute: 50 + i, side: 'home' as const, type: 'sub' as const, out: inp.home.xi[i + 1]!.id, in: b.id }));
    const tl = simulateMatch(inp, many);
    const subs = tl.events.filter((e) => e.type === 'sub' && e.side === 'home');
    assert.ok(subs.length <= MAX_SUBS);
    assert.ok(new Set(subs.map((e) => Math.floor(e.t / 60))).size <= 3, 'até 3 janelas');
  });

  test('visualizador: 22 jogadores dentro do campo e bola seguindo os eventos', () => {
    const inp = input('viewer');
    const tl = simulateMatch(inp);
    for (const t of [0, 600, 2800, 4000, tl.duration - 1]) {
      const pos = positionsAt(inp, tl, t);
      assert.ok(pos.players.length >= 20);
      for (const p of [...pos.players, pos.ball]) assert.ok(p.x >= 0 && p.x <= 105 && p.y >= 0 && p.y <= 68, JSON.stringify(p));
    }
  });

  test('calibração: 400 jogos da Série A dentro das faixas de ligas reais', () => {
    let goals = 0, home = 0, draw = 0, shots = 0, onT = 0;
    const n = 400;
    const teams = new Map(clubs.map((c) => [c, g.matchTeam(c)]));
    for (let i = 0; i < n; i++) {
      const tl = simulateMatch({ seed: `cal${i}`, home: teams.get(clubs[i % 20]!)!, away: teams.get(clubs[(i * 7 + 3) % 20]!)! });
      goals += tl.score.home + tl.score.away;
      if (tl.score.home > tl.score.away) home++;
      else if (tl.score.home === tl.score.away) draw++;
      shots += tl.stats.home.shots + tl.stats.away.shots;
      onT += tl.stats.home.onTarget + tl.stats.away.onTarget;
    }
    const r = { goals: goals / n, home: home / n, draw: draw / n, shots: shots / n, conv: goals / shots, onT: onT / shots };
    assert.ok(r.goals > 2.2 && r.goals < 2.9, JSON.stringify(r));
    assert.ok(r.home > 0.38 && r.home < 0.5, JSON.stringify(r));
    assert.ok(r.draw > 0.2 && r.draw < 0.31, JSON.stringify(r));
    assert.ok(r.shots > 20 && r.shots < 28, JSON.stringify(r));
    assert.ok(r.conv > 0.08 && r.conv < 0.13, JSON.stringify(r));
    assert.ok(r.onT > 0.3 && r.onT < 0.45, JSON.stringify(r));
  });

  test('modelo rápido (jogos da IA) com a mesma distribuição do motor completo', () => {
    const h = Game.create(db, { clubId: 'corinthians', manager: 'Teste', seed: 'rapido' });
    h.advance('2026-12-31');
    const fx = Object.values(h.state.calendar.fixtures).filter((f) => f.result && /^br[AB]@/.test(f.competitionId));
    const goals = fx.reduce((t, f) => t + f.result!.home + f.result!.away, 0) / fx.length;
    const home = fx.filter((f) => f.result!.home > f.result!.away).length / fx.length;
    const draw = fx.filter((f) => f.result!.home === f.result!.away).length / fx.length;
    assert.ok(goals > 2.2 && goals < 2.8 && home > 0.38 && home < 0.52 && draw > 0.2 && draw < 0.31, JSON.stringify({ goals, home, draw }));
  });

  test('jogo do usuário simulado pelo motor fica registrado no calendário', () => {
    const h = Game.create(db, { clubId: 'corinthians', manager: 'Teste', seed: 'registro' });
    const { pausedAt } = h.advance('2026-03-01', { stopAtUserMatch: true });
    assert.ok(pausedAt);
    const { timeline } = h.finishUserMatch(pausedAt);
    const f = h.state.calendar.fixtures[pausedAt]!;
    assert.deepEqual([f.result!.home, f.result!.away], [timeline.score.home, timeline.score.away]);
  });
});
