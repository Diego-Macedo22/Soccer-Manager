/**
 * Regulamento das copas continentais e pré-contrato, com a base real.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { checkTransition, groupStanding, type CompetitionInstance, type Fixture } from '@sm/core';
import { loadDatabase } from '@sm/data';
import { Game } from '../src/index.ts';

const db = loadDatabase();
const country = new Map(db.clubs.map((c) => [c.id, c.country]));
const g = Game.create(db, { clubId: 'corinthians', manager: 'Teste', seed: 'continental' });
g.advance('2027-12-31');
const cal = g.state.calendar;
const fx = (c: CompetitionInstance): Fixture[] => c.fixtureIds.map((id) => cal.fixtures[id]!);
const lib = cal.competitions['lib@2027']!;
const sula = cal.competitions['sula@2027']!;

describe('Taça Continental e Copa Sul-Continental', () => {
  test('vagas: campeões têm prioridade; ninguém joga as duas; convidados só na Taça', () => {
    assert.equal(lib.participants.length, 16);
    assert.equal(sula.participants.length, 8);
    assert.ok(!lib.participants.some((id) => sula.participants.includes(id)));
    assert.equal(lib.participants.filter((id) => country.get(id) !== 'BR').length, 8);
    for (const prev of ['copa@2026', 'sula@2026', 'lib@2026']) {
      const champ = cal.competitions[prev]?.championId;
      if (champ && country.get(champ) === 'BR') assert.ok(lib.participants.includes(champ), `${prev}: ${champ}`);
    }
  });

  test('grupos de 4 com 2 brasileiros e 2 convidados, turno e returno', () => {
    for (const members of Object.values(lib.groups!)) {
      assert.equal(members.length, 4);
      assert.equal(members.filter((id) => country.get(id) === 'BR').length, 2);
    }
    const groupGames = fx(lib).filter((f) => f.group);
    assert.equal(groupGames.length, 4 * 12);
    for (const f of groupGames) assert.ok(lib.groups![f.group!]!.includes(f.home) && lib.groups![f.group!]!.includes(f.away));
  });

  test('quartas da Taça: 1º contra 2º de outro grupo, com o 1º decidindo em casa', () => {
    const qf = fx(lib).filter((f) => f.roundName === 'Quartas (volta)');
    assert.equal(qf.length, 4);
    const firsts = Object.keys(lib.groups!).map((k) => groupStanding(lib, k)[0]);
    const seconds = Object.keys(lib.groups!).map((k) => groupStanding(lib, k)[1]);
    for (const f of qf) {
      assert.ok(firsts.includes(f.home), `${f.home} decide em casa`);
      assert.ok(seconds.includes(f.away));
      const sameGroup = Object.values(lib.groups!).some((m) => m.includes(f.home) && m.includes(f.away));
      assert.ok(!sameGroup);
    }
  });

  test('3º colocados da Taça caem nas quartas da Sul-Continental', () => {
    const thirds = Object.keys(lib.groups!).map((k) => groupStanding(lib, k)[2]!);
    assert.deepEqual([...lib.thirds!].sort(), [...thirds].sort());
    const qfSula = fx(sula).filter((f) => f.roundName === 'Quartas (ida)');
    assert.deepEqual(qfSula.map((f) => f.home).sort(), [...thirds].sort());
  });

  test('final em jogo único; quartas e semis em ida e volta', () => {
    for (const c of [lib, sula]) {
      const final = fx(c).filter((f) => f.roundName.startsWith('Final'));
      assert.equal(final.length, 1);
      assert.equal(final[0]!.leg, undefined);
      assert.equal(c.championId, final[0]!.result!.winnerId);
      assert.equal(fx(c).filter((f) => f.roundName.startsWith('Semifinal')).length, 4);
    }
  });
});

describe('pré-contrato', () => {
  test('só nos últimos 6 meses; jogador chega sem custo de transferência ao fim do contrato', () => {
    const h = Game.create(db, { clubId: 'corinthians', manager: 'Teste', seed: 'pre' });
    const target = Object.entries(h.state.players).find(([, p]) => p.clubId && p.clubId !== 'corinthians' && country.get(p.clubId) === 'BR' && p.contract === 1)![0];
    h.state.players[target]!.contract = 1;
    assert.equal(h.preContractOpen(target), false, 'janeiro: falta quase um ano');
    h.advance('2026-07-15');
    if (h.state.players[target]!.clubId === 'corinthians' || h.state.players[target]!.contract !== 1) return;
    assert.equal(h.preContractOpen(target), true);
    let r = h.preContract(target);
    for (let i = 0; !r.ok && r.reason === 'refused' && i < 30; i++) {
      h.advance(new Date(Date.parse(h.date) + 86_400_000).toISOString().slice(0, 10));
      r = h.preContract(target);
    }
    assert.ok(r.ok, JSON.stringify(r));
    assert.ok(h.state.finance.ledger.some((e) => e.label === 'Luvas de pré-contrato'));
    for (const d of ['2026-10-01', '2026-12-31', '2027-01-09', '2027-02-01']) {
      const prev = h.snapshot();
      h.advance(d);
      assert.deepEqual(checkTransition(prev, h.snapshot()), [], d);
    }
    assert.equal(h.state.players[target]!.clubId, 'corinthians');
    assert.equal(h.state.players[target]!.contract, 3);
  });
});
