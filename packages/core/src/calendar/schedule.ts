/** Geração de jogos: pontos corridos (método do círculo) e chaves de mata-mata. */
import { addDays, type IsoDate } from '../dates.ts';
import type { Rng } from '../rng.ts';

export interface Pairing {
  round: number;
  date: IsoDate;
  home: string;
  away: string;
}

/**
 * Pontos corridos: cada clube joga uma vez por rodada; no returno o mando se inverte.
 * A ordem dos clubes é sorteada pelo `rng` (mesma semente = mesma tabela).
 */
export function roundRobin(
  clubIds: readonly string[],
  firstDate: IsoDate,
  intervalDays: number,
  double: boolean,
  rng: Rng,
): Pairing[] {
  let cur: (string | null)[] = rng.shuffle([...clubIds]);
  if (cur.length % 2) cur.push(null);
  const n = cur.length;
  const rounds: [string, string][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = cur[i];
      const b = cur[n - 1 - i];
      if (a && b) pairs.push((r + i) % 2 === 1 ? [b, a] : [a, b]);
    }
    rounds.push(pairs);
    cur = [cur[0] ?? null, cur[n - 1] ?? null, ...cur.slice(1, n - 1)];
  }
  const out: Pairing[] = [];
  rounds.forEach((pairs, r) => {
    for (const [home, away] of pairs) out.push({ round: r + 1, date: addDays(firstDate, r * intervalDays), home, away });
  });
  if (double) {
    rounds.forEach((pairs, r) => {
      for (const [home, away] of pairs) {
        out.push({ round: r + n, date: addDays(firstDate, (r + n - 1) * intervalDays), home: away, away: home });
      }
    });
  }
  return out;
}

/** Sorteio de confrontos de mata-mata em jogo único. */
export function knockoutPairs(clubIds: readonly string[], rng: Rng): [string, string][] {
  if (clubIds.length < 2 || clubIds.length % 2) throw new RangeError(`Mata-mata precisa de número par de clubes (${clubIds.length})`);
  const order = rng.shuffle([...clubIds]);
  const out: [string, string][] = [];
  for (let i = 0; i < order.length; i += 2) out.push([order[i]!, order[i + 1]!]);
  return out;
}

const ROUND_NAMES: Record<number, string> = { 2: 'Final', 4: 'Semifinal', 8: 'Quartas', 16: 'Oitavas' };

export function knockoutRoundName(clubsInRound: number): string {
  return ROUND_NAMES[clubsInRound] ?? `Fase de ${clubsInRound}`;
}

/** Maior potência de 2 que cabe em `n`. */
export function floorPowerOfTwo(n: number): number {
  let p = 1;
  while (p * 2 <= n) p *= 2;
  return p;
}
