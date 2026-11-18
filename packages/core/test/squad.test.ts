/**
 * Elenco e escalação (Fase 2). Corrige B6 (escalação refeita sem aviso) e
 * cobre a operação de troca usada pelo "⇄ Trocar" (B5).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  adaptation,
  addDays,
  autoLineup,
  changeFormation,
  createRng,
  effectiveOvr,
  lineupSnapshot,
  lineupValid,
  reconcileLineup,
  swapPlayers,
  type Lineup,
  type Position,
  type SquadPlayer,
} from '../src/index.ts';

const DATE = '2026-03-01';
const mk = (id: string, pos: Position, ovr: number, extra: Partial<SquadPlayer> = {}): SquadPlayer => ({
  id,
  name: id,
  clubId: 'me',
  pos,
  positions: [pos],
  ovr,
  attrs: { vel: 65, fin: 65, pas: 65, dri: 65, def: 65, fis: 65 },
  form: 70,
  morale: 70,
  fitness: 100,
  injuredUntil: null,
  ...extra,
});

function squad(): SquadPlayer[] {
  const spec: [Position, number[]][] = [
    ['GOL', [78, 70, 62]],
    ['ZAG', [80, 77, 72, 66]],
    ['LD', [76, 68]],
    ['LE', [75, 67]],
    ['VOL', [79, 74, 65]],
    ['MC', [77, 71, 64]],
    ['MAT', [82, 70]],
    ['PE', [79, 69]],
    ['PD', [78, 68]],
    ['ATA', [84, 75, 66]],
  ];
  return spec.flatMap(([pos, ovrs]) => ovrs.map((ovr, i) => mk(`${pos.toLowerCase()}${i + 1}`, pos, ovr)));
}

const ids = (l: Lineup) => [...l.xi.map((s) => s.playerId), ...l.bench, ...l.reserves];
const valid = (l: Lineup, sq: SquadPlayer[], date = DATE) =>
  lineupValid({ date, clubId: 'me', budget: 0, ledger: [], fixtures: [], competitions: [], ...lineupSnapshot(l, sq) });
const xiOf = (l: Lineup) => l.xi.map((s) => s.playerId);

describe('posições (mesmas regras da v0.3)', () => {
  test('adaptação: natural, secundária, improviso e proibido', () => {
    const zag = mk('z', 'ZAG', 70, { positions: ['ZAG', 'LE'] });
    assert.equal(adaptation(zag, 'ZAG'), 1);
    assert.equal(adaptation(zag, 'LE'), 0);
    assert.equal(adaptation(zag, 'LD'), -3, 'zaga → lateral é zona adjacente');
    assert.equal(adaptation({ ...zag, attrs: { ...zag.attrs, vel: 80 } }, 'LD'), -2, 'velocidade ajuda na lateral');
    assert.equal(adaptation(zag, 'ATA'), -5);
    assert.equal(adaptation(zag, 'GOL'), -99);
    assert.equal(adaptation(mk('g', 'GOL', 70), 'ZAG'), -99);
    assert.equal(effectiveOvr(mk('x', 'ZAG', 41), 'ATA'), 40, 'OVR na função nunca abaixo de 40');
  });
});

describe('escalação automática', () => {
  test('11 válidos, goleiro no gol, sem lesionados, cada jogador uma vez', () => {
    const sq = squad();
    sq.find((p) => p.id === 'ata1')!.injuredUntil = '2026-03-20';
    const l = autoLineup(sq, '4-2-3-1', DATE);
    assert.deepEqual(valid(l, sq), []);
    assert.equal(l.bench.length, 9);
    assert.deepEqual([...ids(l)].sort(), sq.map((p) => p.id).sort());
    assert.ok(l.reserves.includes('ata1'), 'lesionado fica nas reservas');
    assert.equal(l.xi[0]!.playerId, 'gol1');
  });

  test('prefere a posição natural ao OVR improvisado e é determinística', () => {
    const sq = squad();
    const l = autoLineup(sq, '4-2-3-1', DATE);
    assert.deepEqual(l.xi.filter((s) => s.pos === 'ZAG').map((s) => s.playerId), ['zag1', 'zag2']);
    assert.deepEqual(autoLineup(squad(), '4-2-3-1', DATE), l);
  });
});

describe('B6: a escalação do usuário só muda no que ficou inválido', () => {
  test('escalação válida não muda', () => {
    const sq = squad();
    const l = autoLineup(sq, '4-2-3-1', DATE);
    assert.deepEqual(reconcileLineup(l, sq, DATE), { lineup: l, changes: [] });
  });

  test('lesão de titular: só aquele slot muda, com o reserva natural da posição', () => {
    const sq = squad();
    const l = autoLineup(sq, '4-2-3-1', DATE);
    const slot = l.xi.findIndex((s) => s.pos === 'LD');
    assert.equal(l.xi[slot]!.playerId, 'ld1');
    sq.find((p) => p.id === 'ld1')!.injuredUntil = '2026-04-10';
    const { lineup, changes } = reconcileLineup(l, sq, DATE);
    assert.equal(lineup.xi[slot]!.playerId, 'ld2', 'entra o lateral do banco, não o atacante de OVR maior');
    lineup.xi.forEach((s, i) => i !== slot && assert.equal(s.playerId, l.xi[i]!.playerId));
    assert.ok(lineup.reserves.includes('ld1'));
    assert.equal(lineup.bench.length, 9, 'a vaga aberta no banco é reposta');
    assert.deepEqual(
      changes.map((c) => c.type),
      ['removed', 'replaced', 'bench-filled'],
    );
    assert.deepEqual(valid(lineup, sq), []);
  });

  test('escolha do usuário fora do "ideal" sobrevive a uma venda em outra posição', () => {
    const sq = squad();
    const auto = autoLineup(sq, '4-2-3-1', DATE);
    const swapped = swapPlayers(auto, sq, 'ata1', 'ata3', DATE);
    assert.ok(swapped.ok);
    const sold = sq.filter((p) => p.id !== auto.bench[0]);
    const { lineup } = reconcileLineup(swapped.lineup, sold, DATE);
    assert.equal(lineup.xi.find((s) => s.pos === 'ATA')!.playerId, 'ata3', 'o legado voltaria a escalar ata1');
    assert.deepEqual(xiOf(lineup), xiOf(swapped.lineup));
  });

  test('contratação entra nas reservas sem mexer no time', () => {
    const sq = [...squad(), mk('reforco', 'ATA', 90)];
    const l = autoLineup(squad(), '4-2-3-1', DATE);
    const { lineup, changes } = reconcileLineup(l, sq, DATE);
    assert.deepEqual(xiOf(lineup), xiOf(l));
    assert.deepEqual(lineup.bench, l.bench);
    assert.equal(lineup.reserves.at(-1), 'reforco');
    assert.deepEqual(changes, [{ type: 'added', playerId: 'reforco' }]);
  });

  test('reconciliar duas vezes dá o mesmo resultado', () => {
    const sq = squad();
    const l = autoLineup(sq, '4-2-3-1', DATE);
    sq.find((p) => p.id === 'vol1')!.injuredUntil = '2026-05-01';
    const once = reconcileLineup(l, sq.filter((p) => p.id !== 'mc1'), DATE).lineup;
    assert.deepEqual(reconcileLineup(once, sq.filter((p) => p.id !== 'mc1'), DATE), { lineup: once, changes: [] });
  });

  test('propriedade: 300 eventos aleatórios de elenco nunca deixam a escalação inválida', () => {
    const rng = createRng('elenco');
    let sq = squad();
    let date = DATE;
    let lineup = autoLineup(sq, '4-2-3-1', date);
    let signed = 0;
    for (let step = 0; step < 300; step++) {
      const roll = rng.int(0, 4);
      if (roll === 0) rng.pick(sq).injuredUntil = addDays(date, rng.int(3, 40));
      else if (roll === 1 && sq.length > 20) sq = sq.filter((p) => p.id !== rng.pick(sq).id);
      else if (roll === 2) sq.push(mk(`novo${signed++}`, rng.pick(['GOL', 'ZAG', 'MC', 'ATA', 'LD', 'PE'] as Position[]), rng.int(60, 85)));
      else if (roll === 3) date = addDays(date, rng.int(1, 10));
      else {
        const r = swapPlayers(lineup, sq, rng.pick(sq).id, rng.pick(sq).id, date);
        if (r.ok) lineup = r.lineup;
      }
      lineup = reconcileLineup(lineup, sq, date).lineup;
      assert.deepEqual([...ids(lineup)].sort(), sq.map((p) => p.id).sort(), `passo ${step}: cada jogador exatamente uma vez`);
      const available = sq.filter((p) => !p.injuredUntil || p.injuredUntil < date);
      if (available.some((p) => p.pos === 'GOL') && available.length >= 11) {
        assert.deepEqual(valid(lineup, sq, date), [], `passo ${step}`);
      }
    }
  });
});

describe('troca de jogadores (B5) e formação', () => {
  test('troca titular ↔ banco e recusa trocas inválidas', () => {
    const sq = squad();
    const l = autoLineup(sq, '4-2-3-1', DATE);
    const benchMid = l.bench.find((id) => id.startsWith('mc'))!;
    const r = swapPlayers(l, sq, l.xi[8]!.playerId!, benchMid, DATE);
    assert.ok(r.ok && r.lineup.xi[8]!.playerId === benchMid && r.lineup.bench.includes(l.xi[8]!.playerId!));
    assert.deepEqual(swapPlayers(l, sq, 'gol2', 'zag1', DATE), { ok: false, reason: 'wrong-position' });
    sq.find((p) => p.id === 'ata2')!.injuredUntil = '2026-03-30';
    assert.deepEqual(swapPlayers(l, sq, 'ata1', 'ata2', DATE), { ok: false, reason: 'unavailable' });
    assert.deepEqual(swapPlayers(l, sq, 'ata1', 'ata1', DATE), { ok: false, reason: 'same-player' });
    assert.deepEqual(swapPlayers(l, sq, 'ata1', 'fantasma', DATE), { ok: false, reason: 'not-in-squad' });
  });

  test('mudar de 4-2-3-1 para 4-4-2 mantém os mesmos titulares e o goleiro', () => {
    const sq = squad();
    const l = autoLineup(sq, '4-2-3-1', DATE);
    const { lineup } = changeFormation(l, sq, '4-4-2', DATE);
    assert.equal(lineup.formation, '4-4-2');
    assert.deepEqual([...xiOf(lineup)].sort(), [...xiOf(l)].sort());
    assert.equal(lineup.xi.find((s) => s.pos === 'GOL')!.playerId, 'gol1');
    assert.deepEqual(valid(lineup, sq), []);
  });
});
