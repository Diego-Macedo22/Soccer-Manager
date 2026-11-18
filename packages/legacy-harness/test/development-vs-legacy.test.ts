/**
 * B17 com dados reais: os mesmos jogadores da v0.5, evoluídos pelo novo
 * módulo, comparados com o que o legado fez (golden master estatístico).
 */
import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calibrateAttributes, computeOvr, developMonth, type DevelopingPlayer, type Position } from '@sm/core';
import { LegacyGame, type LegacyState } from '@sm/legacy-harness';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/characterization.json', import.meta.url), 'utf8'));
const clampOvr = (v: number) => Math.max(40, Math.min(99, Math.round(v)));

interface LegacyPlayer {
  id: string;
  clubId: string;
  pos: Position;
  age: number;
  ovr: number;
  pot: number;
  form: number;
  morale: number;
  attrs: DevelopingPlayer['attrs'];
}

let players: LegacyPlayer[];

before(() => {
  const game = LegacyGame.load({ seed: 1 });
  game.startCareer('corinthians');
  const s: LegacyState = game.state();
  players = (s.db.players as LegacyPlayer[]).filter((p) => p.attrs && p.clubId !== 'free_agents');
});

test('o OVR antigo (média simples) não batia com o cadastro; a calibração reproduz todos', () => {
  const simple = (p: LegacyPlayer) =>
    p.pos === 'GOL'
      ? Math.round(((p.attrs.gk ?? 50) * 2 + p.attrs.pas + p.attrs.fis + p.attrs.vel) / 5)
      : Math.round((p.attrs.vel + p.attrs.fin + p.attrs.pas + p.attrs.dri + p.attrs.def + p.attrs.fis) / 6);
  const off = players.filter((p) => simple(p) <= p.ovr - 3).length;
  assert.ok(off > players.length * 0.7, `${off} de ${players.length} perdiam 3+ pontos no legado`);
  for (const p of players) {
    assert.equal(computeOvr(calibrateAttributes(p.attrs, p.pos, p.ovr), p.pos), clampOvr(p.ovr), p.id);
  }
});

test('B17 corrigido: numa temporada, os jovens evoluem (no legado caíam 2,7)', (t) => {
  const legacyYoung: number = fixture.aggregate.development.youngAvgOvrDelta.mean;
  assert.ok(legacyYoung < -2, `referência do legado: ${legacyYoung}`);

  // Titulares (14 maiores OVR de cada clube) jogam 90% dos jogos; os demais, 25%.
  const starters = new Set<string>();
  const byClub = Map.groupBy(players, (p) => p.clubId);
  for (const squad of byClub.values()) [...squad].sort((a, b) => b.ovr - a.ovr).slice(0, 14).forEach((p) => starters.add(p.id));

  const young: number[] = [];
  const veterans: number[] = [];
  for (const lp of players) {
    const p: DevelopingPlayer = { pos: lp.pos, age: lp.age, ovr: clampOvr(lp.ovr), pot: lp.pot, attrs: lp.attrs, form: lp.form, morale: lp.morale, devProgress: 0, declineProgress: 0 };
    const start = p.ovr;
    const rate = starters.has(lp.id) ? 0.9 : 0.25;
    for (let m = 1; m <= 11; m++) {
      const r = developMonth(p, { appsThisSeason: Math.round(m * 4 * rate), monthsIntoSeason: m });
      if (lp.age <= 29) assert.ok(r.after >= r.before, `${lp.id} (${lp.age} anos) caiu de ${r.before} para ${r.after}`);
    }
    if (lp.age <= 21) young.push(p.ovr - start);
    if (lp.age >= 32) veterans.push(p.ovr - start);
  }
  const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  t.diagnostic(`jovens (≤21): ${avg(young).toFixed(2)} | veteranos (≥32): ${avg(veterans).toFixed(2)} | legado jovens: ${legacyYoung}`);
  assert.ok(avg(young) > 1, `jovens: ${avg(young).toFixed(2)} (legado ${legacyYoung})`);
  assert.ok(avg(veterans) <= 0, `veteranos: ${avg(veterans).toFixed(2)}`);
});
