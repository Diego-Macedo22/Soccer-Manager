import { loadDatabase } from '@sm/data';
import { Game } from '@sm/game';
import { simulateMatch } from '@sm/core';
/** Calibração do motor: 1000 jogos da Série A comparados com faixas de ligas reais. Uso: npm run calibrate */
const db = loadDatabase();
const g = Game.create(db, { clubId: 'corinthians', manager: 'T', seed: 'calib' });
const clubs = db.clubs.filter((c) => c.division === 'A').map((c) => c.id);
const teams = new Map(clubs.map((c) => [c, g.matchTeam(c)]));
let n = 0, goals = 0, hw = 0, dr = 0, shots = 0, ot = 0, xg = 0, poss = 0, fouls = 0, yel = 0, red = 0, corners = 0, passes = 0;
const t0 = Date.now();
for (let i = 0; i < 1000; i++) {
  const h = clubs[i % 20]!, a = clubs[(i * 7 + 3) % 20]!; if (h === a) continue;
  const tl = simulateMatch({ seed: `c${i}`, home: teams.get(h)!, away: teams.get(a)! });
  n++; goals += tl.score.home + tl.score.away; if (tl.score.home > tl.score.away) hw++; else if (tl.score.home === tl.score.away) dr++;
  for (const s of ['home', 'away'] as const) { const st = tl.stats[s]; shots += st.shots; ot += st.onTarget; xg += st.xg; fouls += st.fouls; yel += st.yellows; red += st.reds; corners += st.corners; passes += st.passes; }
  poss += tl.stats.home.possession;
}
const f = (v: number) => (v / n).toFixed(2);
console.log({ n, ms: ((Date.now() - t0) / n).toFixed(2), goals: f(goals), homeWin: (hw / n).toFixed(2), draw: (dr / n).toFixed(2), shots: f(shots), onTarget: f(ot), xg: f(xg), conv: (goals / shots).toFixed(3), homePoss: f(poss), fouls: f(fouls), yellows: f(yel), reds: f(red), corners: f(corners), passes: f(passes) });
