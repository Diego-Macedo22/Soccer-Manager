/** Classificação de ligas. */
import type { StandingRow } from './types.ts';

export function emptyTable(clubIds: readonly string[]): StandingRow[] {
  return clubIds.map((clubId) => ({ clubId, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 }));
}

export function applyToTable(table: StandingRow[], home: string, away: string, homeGoals: number, awayGoals: number): void {
  const h = table.find((r) => r.clubId === home);
  const a = table.find((r) => r.clubId === away);
  if (!h || !a) throw new Error(`Clube fora da tabela: ${!h ? home : away}`);
  h.played++;
  a.played++;
  h.goalsFor += homeGoals;
  h.goalsAgainst += awayGoals;
  a.goalsFor += awayGoals;
  a.goalsAgainst += homeGoals;
  if (homeGoals > awayGoals) {
    h.won++;
    a.lost++;
    h.points += 3;
  } else if (homeGoals < awayGoals) {
    a.won++;
    h.lost++;
    a.points += 3;
  } else {
    h.drawn++;
    a.drawn++;
    h.points++;
    a.points++;
  }
}

/** Pontos, saldo, gols pró, vitórias e, por fim, id (ordem sempre determinística). */
export function sortTable(table: readonly StandingRow[]): StandingRow[] {
  return [...table].sort(
    (x, y) =>
      y.points - x.points ||
      y.goalsFor - y.goalsAgainst - (x.goalsFor - x.goalsAgainst) ||
      y.goalsFor - x.goalsFor ||
      y.won - x.won ||
      x.clubId.localeCompare(y.clubId),
  );
}
