/**
 * Evolução (Fase 2). Corrige B17: OVR coerente com os atributos e evolução que
 * nunca derruba um jogador em crescimento.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ATTRIBUTE_KEYS,
  POSITIONS,
  POSITION_WEIGHTS,
  calibrateAttributes,
  computeOvr,
  createRng,
  developMonth,
  growthPoints,
  type DevelopingPlayer,
  type MonthContext,
  type PlayerAttributes,
  type Position,
} from '../src/index.ts';

const attrs = (v: number, extra: Partial<PlayerAttributes> = {}): PlayerAttributes => ({ vel: v, fin: v, pas: v, dri: v, def: v, fis: v, gk: 25, ...extra });

function player(age: number, ovr: number, pos: Position = 'MC', extra: Partial<DevelopingPlayer> = {}): DevelopingPlayer {
  return { pos, age, ovr, pot: 90, attrs: calibrateAttributes(attrs(ovr), pos, ovr), form: 72, morale: 72, devProgress: 0, declineProgress: 0, ...extra };
}

/** Uma temporada de 11 meses; `rate` = fração dos jogos disputados. */
function season(p: DevelopingPlayer, rate: number, onLoan = false): number {
  const start = p.ovr;
  for (let m = 1; m <= 11; m++) {
    const ctx: MonthContext = { appsThisSeason: Math.round(m * 4 * rate), monthsIntoSeason: m, onLoan };
    const r = developMonth(p, ctx);
    if (p.age <= 29) assert.ok(r.after >= r.before, `jovem caiu de ${r.before} para ${r.after}`);
    assert.equal(p.ovr, computeOvr(p.attrs, p.pos), 'OVR sempre coerente com os atributos');
  }
  return p.ovr - start;
}

describe('OVR por posição', () => {
  test('pesos somam 1 em todas as posições', () => {
    for (const pos of POSITIONS) {
      const sum = ATTRIBUTE_KEYS.reduce((s, k) => s + (POSITION_WEIGHTS[pos][k] ?? 0), 0);
      assert.ok(Math.abs(sum - 1) < 1e-9, `${pos}: ${sum}`);
    }
  });

  test('goleiro mantém a fórmula da v0.4', () => {
    const a = { vel: 50, fin: 20, pas: 60, dri: 40, def: 45, fis: 70, gk: 80 };
    assert.equal(computeOvr(a, 'GOL'), Math.round((80 * 2 + 60 + 70 + 50) / 5));
  });

  test('calibrar reproduz o OVR exato e preserva o perfil', () => {
    const rng = createRng('calibra');
    for (let i = 0; i < 500; i++) {
      const pos = rng.pick(POSITIONS);
      const a: PlayerAttributes = { vel: rng.int(20, 95), fin: rng.int(20, 95), pas: rng.int(20, 95), dri: rng.int(20, 95), def: rng.int(20, 95), fis: rng.int(20, 95), gk: rng.int(20, 95) };
      const target = rng.int(45, 92);
      const c = calibrateAttributes(a, pos, target);
      assert.equal(computeOvr(c, pos), target, `${pos} → ${target}`);
      for (const k of ATTRIBUTE_KEYS) assert.ok((c[k] ?? 50) >= 20 && (c[k] ?? 50) <= 99);
    }
    const striker = { vel: 80, fin: 85, pas: 60, dri: 75, def: 30, fis: 70, gk: 25 };
    const c = calibrateAttributes(striker, 'ATA', 70);
    assert.ok(c.fin > c.dri && c.dri > c.def, 'o atacante continua finalizando melhor do que marca');
  });
});

describe('B17: evolução mensal', () => {
  test('jovem ativo sobe todo ano e nunca cai; inativo sobe menos', () => {
    const active = season(player(18, 62), 1);
    const benched = player(18, 62);
    const inactive = season(benched, 0) + season(benched, 0);
    assert.ok(active >= 3, `jovem titular: +${active} numa temporada`);
    assert.ok(inactive >= 1 && inactive < active * 2, `jovem sem jogar: +${inactive} em duas temporadas`);
  });

  test('curva por idade da v0.5: quanto mais novo, mais evolui; a partir de 31 só declina', () => {
    const ctx = { appsThisSeason: 24, monthsIntoSeason: 6 };
    const pts = [18, 22, 25, 28, 30, 31].map((age) => growthPoints(player(age, 70), ctx));
    assert.ok(pts.every((x, i) => i === 0 || x < pts[i - 1]!), pts.join(' > '));
    assert.equal(pts.at(-1), 0);
    const vet = player(34, 75);
    const loss = season(vet, 0.8) + season(vet, 0.8) + season(vet, 0.8);
    assert.ok(loss < 0, `veterano em 3 temporadas: ${loss}`);
  });

  test('veterano que joga e está em forma declina mais devagar', () => {
    const playing = player(34, 80, 'ZAG', { form: 82 });
    const benched = player(34, 80, 'ZAG', { form: 65 });
    const a = season(playing, 1) + season(playing, 1) + season(playing, 1);
    const b = season(benched, 0) + season(benched, 0) + season(benched, 0);
    assert.ok(a > b, `em 3 temporadas: jogando ${a}, sem jogar ${b}`);
  });

  test('acima do potencial a evolução fica mais lenta', () => {
    const below = season(player(19, 70, 'MC', { pot: 85 }), 1);
    const above = season(player(19, 70, 'MC', { pot: 70 }), 1);
    assert.ok(above < below && above >= 1, `${above} < ${below}`);
  });

  test('dados incoerentes do legado são calibrados antes de evoluir (goleiro perdia 8 de OVR)', () => {
    // Perfil de goleiro gerado pela v0.5 (buildAttrs) para OVR 80: média ponderada antiga = 72.
    const gk: DevelopingPlayer = {
      pos: 'GOL', age: 20, ovr: 80, pot: 88, form: 70, morale: 70, devProgress: 95, declineProgress: 0,
      attrs: { vel: 55, fin: 20, pas: 65, dri: 56, def: 62, fis: 76, gk: 82 },
    };
    const r = developMonth(gk, { appsThisSeason: 4, monthsIntoSeason: 1 });
    assert.equal(r.before, 80);
    assert.ok(r.after >= 80, `goleiro jovem foi para ${r.after}`);
  });

  test('é determinística e emprestado não ganha jogos fictícios', () => {
    assert.equal(season(player(20, 65), 0.5), season(player(20, 65), 0.5));
    const p = player(20, 65);
    const ctx = { appsThisSeason: 0, monthsIntoSeason: 3 };
    assert.ok(growthPoints(p, { ...ctx, onLoan: true }) > growthPoints(p, ctx), 'empréstimo dá bônus de desenvolvimento');
    assert.equal(ctx.appsThisSeason, 0);
  });
});
