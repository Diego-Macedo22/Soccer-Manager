/**
 * Datas do jogo no formato ISO `AAAA-MM-DD`, sempre em UTC.
 *
 * O legado mistura horário local (`new Date(y, m, 1, 12)`) com `toISOString()` (UTC);
 * em fusos a leste de UTC+12 isso muda o dia. Aqui a aritmética é feita em
 * "número de dias" UTC, sem objetos Date com hora.
 */

export type IsoDate = string;

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

export function isIsoDate(value: string): boolean {
  const m = ISO_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

function assertIso(value: string): void {
  if (!isIsoDate(value)) throw new RangeError(`Data inválida: "${value}" (esperado AAAA-MM-DD)`);
}

/** Dias desde 1970-01-01 (UTC). */
export function toDayNumber(date: IsoDate): number {
  assertIso(date);
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

export function fromDayNumber(day: number): IsoDate {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return fromDayNumber(toDayNumber(date) + days);
}

/** `b - a` em dias. */
export function diffDays(a: IsoDate, b: IsoDate): number {
  return toDayNumber(b) - toDayNumber(a);
}

export function compareDates(a: IsoDate, b: IsoDate): number {
  return toDayNumber(a) - toDayNumber(b);
}

/** `AAAA-MM`. */
export function monthKey(date: IsoDate): string {
  assertIso(date);
  return date.slice(0, 7);
}

/**
 * Primeiros dias de mês atravessados no intervalo (from, to] — usados para
 * cobrar a folha salarial uma vez por mês, independentemente do tamanho do avanço.
 */
export function monthStartsBetween(from: IsoDate, to: IsoDate): IsoDate[] {
  assertIso(from);
  assertIso(to);
  const out: IsoDate[] = [];
  let [y, m] = from.split('-').map(Number) as [number, number];
  for (;;) {
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    const first = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-01`;
    if (compareDates(first, to) > 0) break;
    out.push(first);
  }
  return out;
}
