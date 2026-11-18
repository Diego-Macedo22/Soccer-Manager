/**
 * Invariantes do jogo: regras que precisam valer em QUALQUER estado e em
 * QUALQUER avanço de tempo. Cada regra corresponde a um bug real do legado
 * (ver docs/PLANEJAMENTO-FASE1-COMPLEMENTO.md, tabela 1.3).
 *
 * As regras recebem um `InvariantSnapshot` — uma visão mínima do estado — para
 * que a mesma suíte valide o legado (via adaptador) e o novo core.
 */

import { compareDates, monthKey, monthStartsBetween, type IsoDate } from './dates.ts';

export type LedgerKind = 'payroll' | 'gate' | 'merchandise' | 'transfer' | 'bonus' | 'other';

export interface SnapshotLedgerEntry {
  date: IsoDate;
  kind: LedgerKind;
  /** Positivo = entrada; negativo = saída. */
  value: number;
}

export interface SnapshotFixture {
  id: string;
  competitionId: string;
  date: IsoDate;
  played: boolean;
  home: string;
  away: string;
}

export interface SnapshotCompetition {
  id: string;
  finished: boolean;
}

export interface SnapshotPlayer {
  id: string;
  clubId: string;
  /** Posição principal; `GOL` = goleiro. */
  position: string;
  injuredUntil: IsoDate | null;
}

export interface SnapshotLineupSlot {
  playerId: string;
  slot: string;
}

export interface InvariantSnapshot {
  date: IsoDate;
  clubId: string;
  budget: number;
  ledger: SnapshotLedgerEntry[];
  fixtures: SnapshotFixture[];
  competitions: SnapshotCompetition[];
  players: SnapshotPlayer[];
  lineup: SnapshotLineupSlot[] | null;
}

export type ViolationCode =
  | 'DATE_REGRESSION'
  | 'PAST_FIXTURE_UNPLAYED'
  | 'PAYROLL_MISSING'
  | 'COMPETITION_DISCARDED'
  | 'LEDGER_NOT_APPEND_ONLY'
  | 'BUDGET_LEDGER_MISMATCH'
  | 'LINEUP_SIZE'
  | 'LINEUP_DUPLICATE'
  | 'LINEUP_FOREIGN_PLAYER'
  | 'LINEUP_GOALKEEPER'
  | 'LINEUP_INJURED';

export interface Violation {
  code: ViolationCode;
  message: string;
}

const GOALKEEPER = 'GOL';

// ---------------------------------------------------------------------------
// Regras sobre um único estado
// ---------------------------------------------------------------------------

/** B4: jogo com data anterior à data atual precisa estar disputado. */
export function pastFixturesPlayed(s: InvariantSnapshot): Violation[] {
  const pending = s.fixtures.filter((f) => !f.played && compareDates(f.date, s.date) < 0);
  if (!pending.length) return [];
  const byComp = new Map<string, number>();
  for (const f of pending) byComp.set(f.competitionId, (byComp.get(f.competitionId) ?? 0) + 1);
  const detail = [...byComp].map(([c, n]) => `${c}: ${n}`).join(', ');
  return [{ code: 'PAST_FIXTURE_UNPLAYED', message: `${pending.length} jogo(s) no passado sem resultado (${detail})` }];
}

/** B6/B14: escalação com 11 jogadores distintos do clube, 1 goleiro no gol, nenhum lesionado. */
export function lineupValid(s: InvariantSnapshot): Violation[] {
  if (!s.lineup) return [];
  const out: Violation[] = [];
  const players = new Map(s.players.map((p) => [p.id, p]));
  if (s.lineup.length !== 11) out.push({ code: 'LINEUP_SIZE', message: `XI com ${s.lineup.length} jogadores` });
  const ids = s.lineup.map((x) => x.playerId);
  if (new Set(ids).size !== ids.length) out.push({ code: 'LINEUP_DUPLICATE', message: 'Jogador repetido no XI' });
  const foreign = ids.filter((id) => players.get(id)?.clubId !== s.clubId);
  if (foreign.length) out.push({ code: 'LINEUP_FOREIGN_PLAYER', message: `Fora do clube: ${foreign.join(', ')}` });
  const gkSlots = s.lineup.filter((x) => x.slot === GOALKEEPER);
  const gkOk = gkSlots.length === 1 && players.get(gkSlots[0]!.playerId)?.position === GOALKEEPER;
  const outfieldKeeper = s.lineup.some((x) => x.slot !== GOALKEEPER && players.get(x.playerId)?.position === GOALKEEPER);
  if (!gkOk || outfieldKeeper) out.push({ code: 'LINEUP_GOALKEEPER', message: 'O XI precisa de exatamente 1 goleiro, no gol' });
  const injured = ids.filter((id) => {
    const until = players.get(id)?.injuredUntil;
    return until != null && compareDates(until, s.date) >= 0;
  });
  if (injured.length) out.push({ code: 'LINEUP_INJURED', message: `Lesionado(s) no XI: ${injured.join(', ')}` });
  return out;
}

export function checkSnapshot(s: InvariantSnapshot): Violation[] {
  return [...pastFixturesPlayed(s), ...lineupValid(s)];
}

// ---------------------------------------------------------------------------
// Regras sobre uma transição (antes → depois de avançar o tempo ou agir)
// ---------------------------------------------------------------------------

/** B2: o tempo nunca anda para trás. */
export function dateNeverDecreases(prev: InvariantSnapshot, next: InvariantSnapshot): Violation[] {
  return compareDates(next.date, prev.date) < 0
    ? [{ code: 'DATE_REGRESSION', message: `Data voltou de ${prev.date} para ${next.date}` }]
    : [];
}

/** B1: a folha salarial é paga em todo mês iniciado dentro do avanço. */
export function payrollEveryMonth(prev: InvariantSnapshot, next: InvariantSnapshot): Violation[] {
  if (compareDates(next.date, prev.date) <= 0) return [];
  const paid = new Set(next.ledger.filter((e) => e.kind === 'payroll').map((e) => monthKey(e.date)));
  const missing = monthStartsBetween(prev.date, next.date).filter((d) => !paid.has(monthKey(d)));
  return missing.length
    ? [{ code: 'PAYROLL_MISSING', message: `Folha não paga em ${missing.length} mês(es): ${missing.map(monthKey).join(', ')}` }]
    : [];
}

function playedByCompetition(s: InvariantSnapshot): Map<string, number> {
  const out = new Map<string, number>();
  for (const f of s.fixtures) if (f.played) out.set(f.competitionId, (out.get(f.competitionId) ?? 0) + 1);
  return out;
}

/** B3/B11: competição em andamento não pode sumir nem perder resultados. */
export function competitionsNotDiscarded(prev: InvariantSnapshot, next: InvariantSnapshot): Violation[] {
  const before = playedByCompetition(prev);
  const after = playedByCompetition(next);
  const nextIds = new Set(next.competitions.map((c) => c.id));
  const out: Violation[] = [];
  for (const c of prev.competitions) {
    const played = before.get(c.id) ?? 0;
    if (c.finished || played === 0) continue;
    const now = nextIds.has(c.id) ? (after.get(c.id) ?? 0) : 0;
    if (now < played) {
      out.push({ code: 'COMPETITION_DISCARDED', message: `${c.id} descartada sem terminar (${played} → ${now} jogos)` });
    }
  }
  return out;
}

/** Caixa só muda por lançamento registrado; o extrato só cresce. */
export function budgetMatchesLedger(prev: InvariantSnapshot, next: InvariantSnapshot): Violation[] {
  if (next.ledger.length < prev.ledger.length) {
    return [{ code: 'LEDGER_NOT_APPEND_ONLY', message: 'Lançamentos financeiros foram apagados' }];
  }
  const added = next.ledger.slice(prev.ledger.length).reduce((s, e) => s + e.value, 0);
  const delta = next.budget - prev.budget;
  return Math.abs(delta - added) > 0.5
    ? [{ code: 'BUDGET_LEDGER_MISMATCH', message: `Caixa variou ${delta}, extrato registrou ${added}` }]
    : [];
}

export function checkTransition(prev: InvariantSnapshot, next: InvariantSnapshot): Violation[] {
  return [
    ...dateNeverDecreases(prev, next),
    ...payrollEveryMonth(prev, next),
    ...competitionsNotDiscarded(prev, next),
    ...budgetMatchesLedger(prev, next),
    ...checkSnapshot(next),
  ];
}

export function codes(violations: readonly Violation[]): ViolationCode[] {
  return [...new Set(violations.map((v) => v.code))];
}
