/**
 * Base de dados extraída da v0.5 (Fase 2): validação, correções B15/B19/B20/B21
 * e uma temporada inteira do calendário com os clubes e elencos reais.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  advanceTo,
  autoLineup,
  calendarSnapshot,
  checkTransition,
  createCalendar,
  effectiveOvr,
  gateIncome,
  lineupSnapshot,
  lineupValid,
  sortTable,
  type ResultProvider,
} from '@sm/core';
import { calendarClubs, clubEconomy, loadDatabase, squadOf, validateDatabase } from '../src/index.ts';

const db = loadDatabase();
const legacyMap: Record<string, string> = JSON.parse(readFileSync(new URL('../src/data/legacy-id-map.json', import.meta.url), 'utf8'));
const meta = JSON.parse(readFileSync(new URL('../src/data/meta.json', import.meta.url), 'utf8')) as { report: { playersAdded: number } };

describe('base de dados', () => {
  test('passa em todas as regras de validação', () => {
    assert.deepEqual(validateDatabase(db), []);
  });

  test('4 ligas com 20 clubes, 40 clubes brasileiros e 12 passes livres', () => {
    for (const d of ['A', 'B', 'PL', 'LL']) assert.equal(db.clubs.filter((c) => c.division === d).length, 20, d);
    assert.equal(db.clubs.filter((c) => c.country === 'BR' && c.division).length, 40);
    assert.equal(db.players.filter((p) => p.clubId === null).length, 12);
  });

  test('B15: ids sem nome, mapa completo do legado e referências estáveis a renomeações', () => {
    const ids = new Set(db.players.map((p) => p.id));
    const fromLegacy = db.players.length - meta.report.playersAdded;
    assert.equal(Object.keys(legacyMap).length, fromLegacy);
    assert.equal(new Set(Object.values(legacyMap)).size, fromLegacy);
    assert.ok(Object.values(legacyMap).every((id) => ids.has(id)));
    assert.ok(db.players.every((p) => !p.id.includes(p.name.split(' ')[0]!.toLowerCase())));
    const copy = loadDatabase();
    copy.players.forEach((p, i) => (p.name = `Renomeado ${i}`));
    assert.deepEqual(validateDatabase(copy), [], 'renomear todos os jogadores não quebra nada');
  });

  test('B19: elencos de liga completos (3 goleiros e cobertura de todas as posições)', () => {
    for (const c of db.clubs.filter((x) => x.division)) {
      const squad = db.players.filter((p) => p.clubId === c.id);
      assert.ok(squad.filter((p) => p.pos === 'GOL').length >= 3, `${c.id} sem 3 goleiros`);
      assert.ok(squad.length >= 16, `${c.id}: ${squad.length}`);
    }
    const fromLegacy = new Set(Object.values(legacyMap));
    const added = db.players.filter((p) => !fromLegacy.has(p.id));
    assert.equal(added.length, meta.report.playersAdded);
    assert.ok(added.every((p) => p.generated && p.clubId !== null));
    assert.equal(new Set(added.map((p) => p.name)).size, added.length, 'nomes dos jogadores adicionados são únicos');
  });

  test('B20: torcida dos clubes europeus em número de torcedores, com bilheteria realista', () => {
    const club = db.clubs.find((c) => c.division === 'PL' && c.rep === Math.max(...db.clubs.filter((x) => x.division === 'PL').map((x) => x.rep)))!;
    assert.ok(club.fanbase >= 10_000_000, `${club.id}: ${club.fanbase}`);
    const e = clubEconomy(db, club.id);
    const g = gateIncome({ capacity: e.capacity, fanbase: e.fanbase, homeRep: e.rep, awayRep: 80, fanConfidence: 80 });
    assert.ok(g.income > 1_000_000, `bilheteria ${g.income}`);
    assert.equal(e.cycleId, 'ENG');
  });

  test('B21: nenhum jogador com nome de clube', () => {
    assert.ok(db.players.every((p) => !p.name.includes('Santista FC')));
    assert.ok(db.players.some((p) => p.name === 'Coiabinho'));
  });
});

describe('dados reais no core', () => {
  test('todo clube de liga consegue escalar um XI válido', () => {
    for (const c of calendarClubs(db)) {
      const squad = squadOf(db, c.id);
      const l = autoLineup(squad, '4-2-3-1', '2026-01-05');
      const v = lineupValid({ date: '2026-01-05', clubId: c.id, budget: 0, ledger: [], fixtures: [], competitions: [], ...lineupSnapshot(l, squad) });
      assert.deepEqual(v, [], c.id);
    }
  });

  test('uma temporada com clubes e elencos reais respeita as invariantes', () => {
    const clubs = calendarClubs(db);
    const strength = new Map(
      clubs.map((c) => {
        const xi = autoLineup(squadOf(db, c.id), '4-2-3-1', '2026-01-05').xi;
        const squad = new Map(squadOf(db, c.id).map((p) => [p.id, p]));
        return [c.id, xi.reduce((s, x) => s + effectiveOvr(squad.get(x.playerId!)!, x.pos), 0) / 11];
      }),
    );
    // Mesmos coeficientes do simulateFixture da v0.4.
    const play: ResultProvider = (f, { rng }) => {
      const d = (strength.get(f.home)! - strength.get(f.away)!) / 7;
      const lh = Math.max(0.15, Math.min(3.6, 1.44 + d * 0.48));
      const la = Math.max(0.12, Math.min(3.3, 1.04 - d * 0.48));
      return { home: rng.poisson(lh), away: rng.poisson(la) };
    };
    const cal = createCalendar({ seed: 'dados-reais', startDate: '2026-01-05', startYear: 2026, clubs });
    const prev = calendarSnapshot(cal, 'corinthians');
    advanceTo(cal, '2026-12-31', { play });
    const bad = checkTransition(prev, calendarSnapshot(cal, 'corinthians')).filter((v) =>
      ['DATE_REGRESSION', 'PAST_FIXTURE_UNPLAYED', 'COMPETITION_DISCARDED'].includes(v.code),
    );
    assert.deepEqual(bad, []);
    const table = sortTable(cal.competitions['brA@2026']!.table);
    const reps = clubs.filter((c) => c.division === 'A').map((c) => c.rep).sort((a, b) => a - b);
    const champion = clubs.find((c) => c.id === table[0]!.clubId)!;
    assert.ok(champion.rep >= reps[10]!, `campeão ${champion.id} (rep ${champion.rep}) entre os mais fortes`);
    assert.ok(cal.competitions['copa@2026']!.participants.every((id) => clubs.find((c) => c.id === id)!.country === 'BR'));
  });
});
