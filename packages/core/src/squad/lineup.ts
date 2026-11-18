/**
 * Escalação: XI, banco e reservas.
 *
 * Correção de B6: o legado chamava `autoLineup` a cada lesão, venda, contratação
 * ou até ao abrir a tela, apagando as escolhas do usuário. Aqui:
 * - `autoLineup` só roda quando pedido (carreira nova, botão "escalar automático").
 * - `reconcileLineup` conserta apenas o que ficou inválido e devolve a lista de
 *   mudanças para a interface avisar ("Fulano lesionado → entra Ciclano").
 * - Uma escalação válida nunca é alterada.
 * Todas as funções são puras: devolvem uma escalação nova.
 */
import { formationSlots, type SlotDef } from './formations.ts';
import { canPlay, effectiveOvr, isAvailable, ZONE, type Position, type SquadPlayer } from './positions.ts';
import type { SnapshotLineupSlot, SnapshotPlayer } from '../invariants.ts';

export const BENCH_SIZE = 9;

export interface LineupSlot extends SlotDef {
  playerId: string | null;
}

export interface Lineup {
  formation: string;
  xi: LineupSlot[];
  bench: string[];
  /** Demais jogadores do elenco, inclusive lesionados. */
  reserves: string[];
}

export type LineupArea = 'xi' | 'bench' | 'reserves';

export type LineupChange =
  | { type: 'removed'; playerId: string; from: LineupArea; reason: 'left-club' | 'unavailable' }
  | { type: 'replaced'; slot: number; pos: Position; playerId: string; from: 'bench' | 'reserves' }
  | { type: 'unfilled'; slot: number; pos: Position }
  | { type: 'bench-filled'; playerId: string }
  | { type: 'added'; playerId: string };

export interface LineupOptions {
  customFormations?: Record<string, readonly SlotDef[]>;
}

const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);

/** Mesma pontuação da v0.4: posição natural pesa mais que OVR improvisado. */
export function suitability(p: SquadPlayer, slot: Position): number {
  if (slot === 'GOL') return p.pos === 'GOL' ? 200 + p.ovr : -999;
  if (p.pos === 'GOL') return -999;
  let v = effectiveOvr(p, slot);
  if (p.pos === slot) v += 15;
  else if (p.positions.includes(slot)) v += 10;
  else if (ZONE[p.pos] === ZONE[slot]) v += 5;
  return v + p.form / 35 + p.morale / 100;
}

function benchScore(p: SquadPlayer): number {
  return p.ovr + p.form / 30;
}

function bestFor(slot: Position, pool: readonly SquadPlayer[]): SquadPlayer | undefined {
  return pool
    .filter((p) => canPlay(p, slot))
    .sort((a, b) => suitability(b, slot) - suitability(a, slot) || byId(a, b))[0];
}

/** Escalação automática: melhor jogador disponível para cada posição, na ordem da formação. */
export function autoLineup(squad: readonly SquadPlayer[], formation: string, date: string, opts: LineupOptions = {}): Lineup {
  const slots = formationSlots(formation, opts.customFormations);
  const available = squad.filter((p) => isAvailable(p, date));
  const used = new Set<string>();
  const xi: LineupSlot[] = slots.map((s) => {
    const p = bestFor(s.pos, available.filter((x) => !used.has(x.id)));
    if (p) used.add(p.id);
    return { ...s, playerId: p?.id ?? null };
  });
  const rest = available.filter((p) => !used.has(p.id)).sort((a, b) => benchScore(b) - benchScore(a) || byId(a, b));
  const bench = rest.slice(0, BENCH_SIZE).map((p) => p.id);
  const reserves = [...rest.slice(BENCH_SIZE), ...squad.filter((p) => !isAvailable(p, date)).sort(byId)].map((p) => p.id);
  return { formation, xi, bench, reserves };
}

/**
 * Ajusta a escalação a mudanças no elenco (lesão, venda, empréstimo, contratação)
 * mexendo só no que ficou inválido.
 */
export function reconcileLineup(lineup: Lineup, squad: readonly SquadPlayer[], date: string): { lineup: Lineup; changes: LineupChange[] } {
  const players = new Map(squad.map((p) => [p.id, p]));
  const changes: LineupChange[] = [];
  const seen = new Set<string>();

  // 1. Retira quem saiu do clube ou ficou indisponível; lesionados vão para as reservas.
  const toReserves: string[] = [];
  const keep = (id: string, from: LineupArea): boolean => {
    if (!players.has(id)) {
      changes.push({ type: 'removed', playerId: id, from, reason: 'left-club' });
      return false;
    }
    if (seen.has(id)) return false;
    if (from !== 'reserves' && !isAvailable(players.get(id)!, date)) {
      changes.push({ type: 'removed', playerId: id, from, reason: 'unavailable' });
      toReserves.push(id);
      seen.add(id);
      return false;
    }
    seen.add(id);
    return true;
  };
  const xi: LineupSlot[] = lineup.xi.map((s) => ({ ...s, playerId: s.playerId !== null && keep(s.playerId, 'xi') ? s.playerId : null }));
  // Jogador no slot errado (ex.: linha no gol) também sai do slot, mas fica no clube.
  for (const s of xi) {
    if (s.playerId && !canPlay(players.get(s.playerId)!, s.pos)) {
      toReserves.push(s.playerId);
      changes.push({ type: 'removed', playerId: s.playerId, from: 'xi', reason: 'unavailable' });
      s.playerId = null;
    }
  }
  let bench = lineup.bench.filter((id) => keep(id, 'bench'));
  const benchVacancies = lineup.bench.length - bench.length;
  let reserves = [...lineup.reserves.filter((id) => keep(id, 'reserves')), ...toReserves.filter((id) => players.has(id))];

  // 2. Preenche os slots vazios: primeiro com o banco, depois com as reservas.
  let promotedFromBench = 0;
  xi.forEach((s, slot) => {
    if (s.playerId !== null) return;
    const fromBench = bestFor(s.pos, bench.map((id) => players.get(id)!).filter((p) => isAvailable(p, date)));
    const fromReserves = fromBench ? undefined : bestFor(s.pos, reserves.map((id) => players.get(id)!).filter((p) => isAvailable(p, date)));
    const pick = fromBench ?? fromReserves;
    if (!pick) {
      changes.push({ type: 'unfilled', slot, pos: s.pos });
      return;
    }
    s.playerId = pick.id;
    if (fromBench) {
      bench = bench.filter((id) => id !== pick.id);
      promotedFromBench++;
    } else reserves = reserves.filter((id) => id !== pick.id);
    changes.push({ type: 'replaced', slot, pos: s.pos, playerId: pick.id, from: fromBench ? 'bench' : 'reserves' });
  });

  // 3. Repõe no banco apenas as vagas abertas agora (o resto do banco é escolha do usuário).
  const refill = reserves
    .map((id) => players.get(id)!)
    .filter((p) => isAvailable(p, date))
    .sort((a, b) => benchScore(b) - benchScore(a) || byId(a, b))
    .slice(0, Math.max(0, Math.min(BENCH_SIZE - bench.length, benchVacancies + promotedFromBench)));
  for (const p of refill) {
    bench.push(p.id);
    reserves = reserves.filter((id) => id !== p.id);
    changes.push({ type: 'bench-filled', playerId: p.id });
  }

  // 4. Contratações e jovens promovidos entram nas reservas.
  const listed = new Set([...xi.map((s) => s.playerId), ...bench, ...reserves]);
  for (const p of [...squad].sort(byId)) {
    if (listed.has(p.id)) continue;
    reserves.push(p.id);
    changes.push({ type: 'added', playerId: p.id });
  }
  return { lineup: { formation: lineup.formation, xi, bench, reserves }, changes };
}

export type SwapResult = { ok: true; lineup: Lineup } | { ok: false; reason: 'not-in-squad' | 'unavailable' | 'wrong-position' | 'same-player' };

function locate(l: Lineup, id: string): { area: LineupArea; index: number } | null {
  const x = l.xi.findIndex((s) => s.playerId === id);
  if (x >= 0) return { area: 'xi', index: x };
  const b = l.bench.indexOf(id);
  if (b >= 0) return { area: 'bench', index: b };
  const r = l.reserves.indexOf(id);
  return r >= 0 ? { area: 'reserves', index: r } : null;
}

/** Troca dois jogadores de lugar (XI, banco ou reservas). É a operação por trás do "⇄ Trocar" (B5). */
export function swapPlayers(lineup: Lineup, squad: readonly SquadPlayer[], a: string, b: string, date: string): SwapResult {
  if (a === b) return { ok: false, reason: 'same-player' };
  const players = new Map(squad.map((p) => [p.id, p]));
  const pa = players.get(a);
  const pb = players.get(b);
  const la = locate(lineup, a);
  const lb = locate(lineup, b);
  if (!pa || !pb || !la || !lb) return { ok: false, reason: 'not-in-squad' };
  const fits = (p: SquadPlayer, target: { area: LineupArea; index: number }) => {
    if (target.area === 'reserves') return null;
    if (!isAvailable(p, date)) return 'unavailable' as const;
    if (target.area === 'xi' && !canPlay(p, lineup.xi[target.index]!.pos)) return 'wrong-position' as const;
    return null;
  };
  const problem = fits(pa, lb) ?? fits(pb, la);
  if (problem) return { ok: false, reason: problem };
  const next: Lineup = { formation: lineup.formation, xi: lineup.xi.map((s) => ({ ...s })), bench: [...lineup.bench], reserves: [...lineup.reserves] };
  const put = (where: { area: LineupArea; index: number }, id: string) => {
    if (where.area === 'xi') next.xi[where.index]!.playerId = id;
    else next[where.area][where.index] = id;
  };
  put(la, b);
  put(lb, a);
  return { ok: true, lineup: next };
}

/** Troca a formação mantendo os mesmos titulares sempre que possível. */
export function changeFormation(
  lineup: Lineup,
  squad: readonly SquadPlayer[],
  formation: string,
  date: string,
  opts: LineupOptions = {},
): { lineup: Lineup; changes: LineupChange[] } {
  const slots = formationSlots(formation, opts.customFormations);
  const players = new Map(squad.map((p) => [p.id, p]));
  const current = lineup.xi
    .map((s) => (s.playerId ? players.get(s.playerId) : undefined))
    .filter((p): p is SquadPlayer => !!p && isAvailable(p, date));
  const score = (p: SquadPlayer, pos: Position) =>
    effectiveOvr(p, pos) + (ZONE[p.pos] === ZONE[pos] ? 4 : 0) + (p.positions.includes(pos) ? 5 : 0) + (p.pos === pos ? 7 : 0);
  const used = new Set<string>();
  const order = slots.map((s, i) => ({ s, i })).sort((x, y) => Number(y.s.pos === 'GOL') - Number(x.s.pos === 'GOL'));
  const xi: LineupSlot[] = slots.map((s) => ({ ...s, playerId: null }));
  for (const { s, i } of order) {
    const pick = current
      .filter((p) => !used.has(p.id) && canPlay(p, s.pos))
      .sort((a, b) => score(b, s.pos) - score(a, s.pos) || byId(a, b))[0];
    if (pick) {
      used.add(pick.id);
      xi[i]!.playerId = pick.id;
    }
  }
  const leftovers = current.filter((p) => !used.has(p.id)).map((p) => p.id);
  const draft: Lineup = { formation, xi, bench: [...leftovers, ...lineup.bench], reserves: [...lineup.reserves] };
  return reconcileLineup(draft, squad, date);
}

/** Parte do snapshot de invariantes referente à escalação. */
export function lineupSnapshot(lineup: Lineup, squad: readonly SquadPlayer[]): { lineup: SnapshotLineupSlot[]; players: SnapshotPlayer[] } {
  return {
    lineup: lineup.xi.filter((s) => s.playerId !== null).map((s) => ({ playerId: s.playerId!, slot: s.pos })),
    players: squad.map((p) => ({ id: p.id, clubId: p.clubId, position: p.pos, injuredUntil: p.injuredUntil })),
  };
}
