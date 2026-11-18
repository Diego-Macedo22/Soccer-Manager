/**
 * Mercado e categoria de base ligados à carreira.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore, academyUpgradeCost, buyChance, checkTransition, decodeSave, encodeSave, marketValue } from '@sm/core';
import { loadDatabase } from '@sm/data';
import { Game } from '../src/index.ts';

const db = loadDatabase();
const newGame = (seed = 'mercado') => Game.create(db, { clubId: 'corinthians', manager: 'Teste', seed });
/** Executa `fn` e confere as invariantes da transição (caixa × extrato, escalação…). */
function act<T>(g: Game, fn: () => T): T {
  const prev = g.snapshot();
  const r = fn();
  assert.deepEqual(checkTransition(prev, g.snapshot()), []);
  return r;
}

describe('fórmulas', () => {
  test('valor cresce com o OVR e chance de compra segue a v0.5', () => {
    assert.ok(marketValue({ ovr: 80, pot: 80, age: 26 }) > marketValue({ ovr: 70, pot: 70, age: 26 }));
    assert.ok(marketValue({ ovr: 70, pot: 70, age: 34 }) < marketValue({ ovr: 70, pot: 70, age: 26 }));
    assert.equal(buyChance(0, 1, { contract: 3 }), 0.18);
    assert.equal(buyChance(10, 1, { contract: 3 }), 0.93);
    assert.equal(academyUpgradeCost(1), 3_750_000);
    assert.equal(academyUpgradeCost(10), 0);
  });
});

describe('mercado', () => {
  test('compra na janela: caixa, elenco, escalação e extrato consistentes', () => {
    const g = newGame();
    const target = g.squad('palmeiras').sort((a, b) => a.ovr - b.ovr)[0]!;
    const before = g.state.finance.balance;
    const r = act(g, () => g.buy(target.id, g.askingPrice(target.id) * 3));
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(g.state.players[target.id]!.clubId, 'corinthians');
    assert.ok(g.squad().some((p) => p.id === target.id));
    assert.equal(g.state.finance.balance, before - g.askingPrice(target.id) * 3);
  });

  test('fora da janela não compra; oferta sem caixa é bloqueada', () => {
    const g = newGame();
    g.advance('2026-03-01');
    const target = g.squad('palmeiras')[0]!;
    assert.deepEqual(g.buy(target.id, 1), { ok: false, reason: 'window-closed' });
    const h = newGame();
    assert.deepEqual(h.buy(target.id, h.state.finance.balance + 1), { ok: false, reason: 'no-funds' });
  });

  test('empréstimo volta ao dono na temporada seguinte', () => {
    const g = newGame();
    const loaned = g.squad('palmeiras').sort((a, b) => a.ovr - b.ovr).find((p) => act(g, () => g.loanIn(p.id)).ok);
    assert.ok(loaned, 'algum empréstimo aceito');
    act(g, () => g.advance('2027-02-15'));
    assert.equal(g.state.players[loaned.id]!.clubId, 'palmeiras');
    assert.equal(g.state.market.loans.length, 0);
  });

  test('propostas recebidas chegam na janela; aceitar vende e credita o caixa', () => {
    const g = newGame('ofertas');
    act(g, () => g.advance('2026-07-31'));
    assert.ok(g.state.news.some((n) => n.title === 'Proposta recebida'));
    assert.ok(g.state.news.some((n) => n.title === 'Mercado se movimenta'));
    const o = g.state.market.offers.at(-1);
    if (o) {
      const before = g.state.finance.balance;
      assert.ok(act(g, () => g.acceptOffer(o.id)).ok);
      assert.equal(g.state.finance.balance, before + o.value);
      assert.notEqual(g.state.players[o.playerId]!.clubId, 'corinthians');
    }
  });

  test('renovação, rescisão e agente livre', () => {
    const g = newGame();
    const p = g.squad().sort((a, b) => a.ovr - b.ovr)[0]!;
    assert.ok(g.renew(p.id).ok);
    assert.equal(g.state.players[p.id]!.contract, 3);
    assert.ok(act(g, () => g.release(p.id)).ok);
    assert.equal(g.state.players[p.id]!.clubId, null);
    assert.ok(act(g, () => g.signFree(p.id)).ok);
    assert.equal(g.state.players[p.id]!.clubId, 'corinthians');
  });
});

describe('base', () => {
  test('relatório, contratação, promoção e save', async () => {
    const g = newGame();
    g.advance('2026-02-10');
    const a = g.state.market.academy;
    assert.ok(a.candidates.length >= 5 && a.candidates.length <= 8);
    const y = a.candidates[0]!;
    assert.ok(g.signYouth(y.id).ok);
    const id = a.roster[0]!;
    assert.equal(g.playerName(id), y.name);
    assert.ok(!g.squad().some((p) => p.id === id), 'base fica fora do elenco profissional');
    assert.ok(act(g, () => g.upgradeAcademy()).ok);
    assert.equal(a.level, 2);
    assert.ok(act(g, () => g.promoteYouth(id)).ok);
    assert.ok(g.squad().some((p) => p.id === id));
    const store = new MemoryStore();
    await g.save(store, 's');
    const back = await Game.load(db, store, 's');
    assert.equal(back!.playerName(id), y.name);
    assert.equal(back!.state.market.academy.level, 2);
  });

  test('save v1 (antes do mercado) migra para v2', () => {
    const g = newGame();
    const enc = encodeSave(g.state);
    assert.ok(enc.ok);
    const raw = JSON.parse(enc.text);
    raw.schemaVersion = 1;
    raw.data.schemaVersion = 1;
    delete raw.data.market;
    const r = decodeSave(JSON.stringify(raw));
    assert.ok(r.ok && r.migratedFrom === 1 && r.state.market.academy.level === 1);
  });
});
