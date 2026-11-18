/**
 * Métricas de uma temporada do legado, usadas como "golden master estatístico".
 *
 * O novo core não vai reproduzir a sequência exata de sorteios do legado, então a
 * comparação futura é por distribuição (média/mín/máx entre várias sementes) nos
 * comportamentos considerados corretos. Finanças ficam de fora: estão quebradas
 * no legado (B1).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { LegacyState } from './legacy-game.ts';

export interface LeagueMetrics {
  games: number;
  goalsPerGame: number;
  homeWinRate: number;
  drawRate: number;
  awayWinRate: number;
  championPoints: number;
  /** Pontos do primeiro clube na zona de rebaixamento (17º de 20). */
  firstRelegatedPoints: number;
  topScorerGoals: number;
}

export interface SeasonMetrics {
  leagues: Record<string, LeagueMetrics>;
  cup: { finished: boolean; played: number; total: number };
  development: { youngCount: number; youngAvgOvrDelta: number; veteranCount: number; veteranAvgOvrDelta: number };
  market: { aiPlayersChangedClub: number };
  user: { position: number; points: number; played: number };
  academy: { candidates: number };
  saveSizeChars: number;
}

const round = (x: number, d = 3) => Math.round(x * 10 ** d) / 10 ** d;

function sortedTable(state: LegacyState, compId: string): any[] {
  return [...(state.competitions?.[compId]?.table ?? [])].sort(
    (a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf,
  );
}

function leagueMetrics(state: LegacyState, compId: string): LeagueMetrics {
  const games = (state.fixtures as any[]).filter((f) => f.compId === compId && f.played && f.score);
  const n = Math.max(1, games.length);
  const goals = games.reduce((s, f) => s + f.score.home + f.score.away, 0);
  const home = games.filter((f) => f.score.home > f.score.away).length;
  const away = games.filter((f) => f.score.home < f.score.away).length;
  const table = sortedTable(state, compId);
  const topScorerGoals = Math.max(0, ...(state.db.players as any[]).map((p) => p.compStats?.[compId]?.goals ?? 0));
  return {
    games: games.length,
    goalsPerGame: round(goals / n),
    homeWinRate: round(home / n),
    drawRate: round((games.length - home - away) / n),
    awayWinRate: round(away / n),
    championPoints: table[0]?.pts ?? 0,
    firstRelegatedPoints: table[table.length - 4]?.pts ?? 0,
    topScorerGoals,
  };
}

function avg(xs: number[]): number {
  return xs.length ? round(xs.reduce((s, x) => s + x, 0) / xs.length) : 0;
}

/** `start` = save logo após criar a carreira; `end` = save no fim da temporada. */
export function seasonMetrics(start: LegacyState, end: LegacyState, saveSizeChars: number): SeasonMetrics {
  const before = new Map<string, any>((start.db.players as any[]).map((p) => [p.id, p]));
  const young: number[] = [];
  const veteran: number[] = [];
  let changed = 0;
  for (const p of end.db.players as any[]) {
    const b = before.get(p.id);
    if (!b) continue;
    if (b.age <= 21) young.push(p.ovr - b.ovr);
    if (b.age >= 32) veteran.push(p.ovr - b.ovr);
    if (b.clubId !== p.clubId && b.clubId !== end.clubId && p.clubId !== end.clubId) changed++;
  }
  const userComp = end.db.clubs.find((c: any) => c.id === end.clubId)?.division === 'B' ? 'brB' : 'brA';
  const table = sortedTable(start.clubId === end.clubId ? end : start, userComp);
  const idx = table.findIndex((r) => r.clubId === end.clubId);
  const cupFixtures = (end.fixtures as any[]).filter((f) => f.compId === 'copa');
  return {
    leagues: { brA: leagueMetrics(end, 'brA'), brB: leagueMetrics(end, 'brB') },
    cup: {
      finished: !!end.competitions?.copa?.finished,
      played: cupFixtures.filter((f) => f.played).length,
      total: cupFixtures.length,
    },
    development: {
      youngCount: young.length,
      youngAvgOvrDelta: avg(young),
      veteranCount: veteran.length,
      veteranAvgOvrDelta: avg(veteran),
    },
    market: { aiPlayersChangedClub: changed },
    user: { position: idx + 1, points: table[idx]?.pts ?? 0, played: table[idx]?.p ?? 0 },
    academy: { candidates: end.academy?.candidates?.length ?? 0 },
    saveSizeChars,
  };
}
