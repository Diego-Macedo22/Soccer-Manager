/**
 * Caixa e extrato de um clube.
 *
 * Regra central (corrige B1 e a falta de registro das compras no legado): o
 * saldo só muda por um lançamento no extrato. Não existe "budget -= x" solto;
 * `spend`/`receive` são as únicas portas de entrada e saída de dinheiro.
 * Valores em reais inteiros.
 */
import type { IsoDate } from '../dates.ts';
import type { LedgerKind, SnapshotLedgerEntry } from '../invariants.ts';

export interface LedgerEntry {
  /** Sequencial dentro do clube. */
  id: number;
  date: IsoDate;
  kind: LedgerKind;
  /** Texto exibido no extrato (ex.: "Folha salarial"). */
  label: string;
  /** Positivo = entrada; negativo = saída. */
  value: number;
  detail?: string;
  /** Chave única opcional para impedir lançamento em dobro (ex.: `gate:<jogo>`). */
  ref?: string;
}

export interface FinanceState {
  clubId: string;
  balance: number;
  ledger: LedgerEntry[];
  /** Refs já lançadas → id do lançamento. */
  refs: Record<string, number>;
}

export interface Movement {
  date: IsoDate;
  kind: LedgerKind;
  label: string;
  amount: number;
  detail?: string;
  ref?: string;
}

export type MoneyResult =
  | { ok: true; entry: LedgerEntry | null }
  | { ok: false; reason: 'insufficient-funds'; shortfall: number };

export function createFinance(clubId: string, openingBalance: number): FinanceState {
  return { clubId, balance: toMoney(openingBalance), ledger: [], refs: {} };
}

function toMoney(value: number): number {
  if (!Number.isFinite(value)) throw new RangeError(`Valor inválido: ${value}`);
  return Math.round(value);
}

function post(fin: FinanceState, m: Movement, sign: 1 | -1): LedgerEntry | null {
  const amount = toMoney(m.amount);
  if (amount < 0) throw new RangeError(`Use o sinal pela função (spend/receive), não pelo valor: ${m.label} ${m.amount}`);
  if (m.ref && fin.refs[m.ref] !== undefined) return null;
  const entry: LedgerEntry = { id: fin.ledger.length + 1, date: m.date, kind: m.kind, label: m.label, value: sign * amount };
  if (m.detail) entry.detail = m.detail;
  if (m.ref) {
    entry.ref = m.ref;
    fin.refs[m.ref] = entry.id;
  }
  fin.ledger.push(entry);
  fin.balance += entry.value;
  return entry;
}

/** Entrada de dinheiro. Com `ref` repetida, não lança de novo (`entry: null`). */
export function receive(fin: FinanceState, m: Movement): LedgerEntry | null {
  return post(fin, m, 1);
}

/**
 * Saída que exige caixa (contratação, luvas, rescisão…). Sem saldo, nada muda
 * (o legado chegava a pagar luvas parciais em silêncio).
 */
export function spend(fin: FinanceState, m: Movement): MoneyResult {
  const amount = toMoney(m.amount);
  if (amount > fin.balance) return { ok: false, reason: 'insufficient-funds', shortfall: amount - fin.balance };
  return { ok: true, entry: post(fin, { ...m, amount }, -1) };
}

/** Saída obrigatória (folha salarial): acontece mesmo deixando o caixa negativo. */
export function charge(fin: FinanceState, m: Movement): LedgerEntry | null {
  return post(fin, m, -1);
}

/** Parte financeira do snapshot de invariantes. */
export function financeSnapshot(fin: FinanceState): { budget: number; ledger: SnapshotLedgerEntry[] } {
  return { budget: fin.balance, ledger: fin.ledger.map((e) => ({ date: e.date, kind: e.kind, value: e.value })) };
}

/** Totais por tipo de lançamento num intervalo (para a tela de finanças). */
export function totalsByKind(fin: FinanceState, from?: IsoDate, to?: IsoDate): Partial<Record<LedgerKind, number>> {
  const out: Partial<Record<LedgerKind, number>> = {};
  for (const e of fin.ledger) {
    if ((from && e.date < from) || (to && e.date > to)) continue;
    out[e.kind] = (out[e.kind] ?? 0) + e.value;
  }
  return out;
}
