/**
 * Partida ao vivo em 2D. O resultado já foi decidido pelo motor no Worker; a
 * tela reproduz a linha do tempo (relógio acelerado, campo, narração e
 * estatísticas derivadas dos eventos). Substituições e mentalidade viram
 * `MatchChange`: o Worker roda o motor de novo, e tudo antes do minuto da
 * mudança permanece idêntico (determinismo).
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { FORMATIONS, MAX_SUBS, MAX_SUB_WINDOWS, MENTALITIES, applyToTable, clockLabel, clockMinute, positionsAt, sortTable, type MatchEvent, type Mentality, type Side, type StandingRow } from '@sm/core';
import type { Command, LiveMatchView } from './protocol.ts';

type Speed = 'lances' | 'normal' | 'rapido';
/** Segundos de jogo por segundo real. */
const SPEED: Record<Speed, number> = { lances: 300, normal: 60, rapido: 180 };

function narrate(e: MatchEvent, m: LiveMatchView): string | null {
  const n = (id?: string) => (id ? (m.names[id] ?? '—') : '—');
  const team = (s: Side) => m[s].name;
  switch (e.type) {
    case 'kickoff': return e.t === 0 ? `Rola a bola! ${team(e.side)} dá a saída.` : null;
    case 'goal': return `⚽ GOL do ${team(e.side)}! ${n(e.player)} marca${e.other ? `, com assistência de ${n(e.other)}` : ''}.`;
    case 'save': return (e.xg ?? 0) > 0.2 ? `🧤 Que defesa de ${n(e.player)}! Parou ${n(e.other)} cara a cara.` : `${n(e.player)} segura o chute de ${n(e.other)}.`;
    case 'miss': return (e.xg ?? 0) > 0.25 ? `😱 ${n(e.player)} perde chance incrível!` : null;
    case 'post': return `💥 Na trave! ${n(e.player)} quase marca.`;
    case 'penalty': return `Pênalti para o ${team(e.side)}! Falta em ${n(e.player)}.`;
    case 'yellow': return `🟨 Cartão amarelo para ${n(e.player)}.`;
    case 'red': return `🟥 Expulso! ${n(e.player)} deixa o ${team(e.side)} com um a menos.`;
    case 'sub': return `🔁 ${team(e.side)}: entra ${n(e.player)}, sai ${n(e.other)}.`;
    case 'tactics': return e.other ? `📋 ${team(e.side)} muda para o ${e.other}.` : `📋 ${team(e.side)} muda a postura.`;
    case 'injury': return `🚑 ${n(e.player)} se machuca e não tem condições de seguir.`;
    case 'halftime': return 'Fim do primeiro tempo.';
    case 'fulltime': return 'Fim de jogo!';
    default: return null;
  }
}

/** Minuto do relógio → segundos da linha do tempo (revela os gols dos outros jogos na hora certa). */
const minuteToT = (min: number, half2: number) => (min <= 45 ? (min - 0.5) * 60 : half2 + (min - 45.5) * 60);

type DayGame = LiveMatchView['day']['games'][number];

/** Placar de um jogo da rodada no instante `t` (jogos sem minutos, de saves antigos, já aparecem prontos). */
function dayScore(g: DayGame, t: number, half2: number, ended: boolean): [number, number] {
  if (ended || g.goals.length !== g.final[0] + g.final[1]) return g.final;
  const seen = g.goals.filter(([, mn]) => minuteToT(mn, half2) <= t);
  return [seen.filter(([s]) => s === 0).length, seen.filter(([s]) => s === 1).length];
}

const teamColor = (m: LiveMatchView, s: Side) => (s === 'away' && m.away.colors[0].toLowerCase() === m.home.colors[0].toLowerCase() ? m.away.colors[1] : m[s].colors[0]);

/** Dicas do auxiliar a partir das estatísticas (no máximo três). */
function tips(m: LiveMatchView): string[] {
  const me = m.userSide;
  const op: Side = me === 'home' ? 'away' : 'home';
  const a = m.timeline.stats[me];
  const b = m.timeline.stats[op];
  const won = m.timeline.score[me] > m.timeline.score[op];
  const lost = m.timeline.score[me] < m.timeline.score[op];
  const out: string[] = [];
  if (a.shots >= 10 && a.xg / a.shots < 0.08) out.push(`Chutamos muito de longe: ${a.shots} finalizações para só ${a.xg} de xG. Falta paciência para entrar na área.`);
  if (b.xg > a.xg + 0.7) out.push(`O adversário criou mais (${b.xg} xG contra ${a.xg}). Uma postura mais cautelosa ou mais pressão pode equilibrar.`);
  if (a.possession >= 58 && a.xg < 1) out.push(`Ficamos com a bola (${a.possession}%), mas criamos pouco. Mais ritmo ou uma mentalidade ofensiva ajudam a furar a defesa.`);
  if (a.yellows + a.reds * 2 >= 3) out.push(`${a.yellows} amarelos${a.reds ? ` e ${a.reds === 1 ? '1 expulsão' : `${a.reds} expulsões`}` : ''}: cuidado com as suspensões.`);
  if (lost && a.xg > b.xg + 0.3) out.push(`O placar não refletiu o jogo: criamos ${a.xg} xG contra ${b.xg}. Mantendo isso, as vitórias vêm.`);
  if (won && a.xg + 0.3 < b.xg) out.push('Vitória na eficiência: o adversário criou mais. Não dá para contar com isso toda semana.');
  if (!out.length) out.push(won ? 'Atuação sólida. O time está no caminho certo.' : 'Jogo equilibrado. Pequenos ajustes de tática podem fazer a diferença.');
  return out.slice(0, 3);
}

/** Mapa de chutes: cada círculo é uma finalização, do tamanho do xG; cheio = gol. */
function ShotMap({ m }: { m: LiveMatchView }) {
  const ev = m.timeline.events;
  return (
    <svg viewBox="0 0 105 68" class="shotmap" role="img" aria-label="Mapa de chutes">
      <rect x="0" y="0" width="105" height="68" fill="#1f6b35" />
      <g fill="none" stroke="rgba(255,255,255,.55)" stroke-width="0.4">
        <rect x="0.5" y="0.5" width="104" height="67" />
        <line x1="52.5" y1="0.5" x2="52.5" y2="67.5" />
        <circle cx="52.5" cy="34" r="9.15" />
        <rect x="0.5" y="13.85" width="16.5" height="40.3" />
        <rect x="88" y="13.85" width="16.5" height="40.3" />
        <rect x="0.5" y="24.85" width="5.5" height="18.3" />
        <rect x="99" y="24.85" width="5.5" height="18.3" />
      </g>
      {ev.map((e, i) => {
        if (e.type !== 'shot') return null;
        // O gol vem logo depois do chute que o originou.
        const goal = ev[i + 1]?.type === 'goal';
        return <circle key={i} cx={e.x} cy={e.y} r={0.9 + Math.sqrt(e.xg ?? 0.05) * 3.2} fill={goal ? teamColor(m, e.side) : 'rgba(0,0,0,.25)'} stroke={teamColor(m, e.side)} stroke-width={goal ? 0.8 : 0.5} />;
      })}
    </svg>
  );
}

/** Pressão ao longo do jogo: xG acumulado de cada time; os pontos são os gols. */
function Momentum({ m }: { m: LiveMatchView }) {
  const tl = m.timeline;
  const W = 300;
  const H = 90;
  const P = 6;
  const shots = tl.events.filter((e) => e.type === 'shot');
  const max = Math.max(1, tl.stats.home.xg, tl.stats.away.xg);
  const x = (t: number) => P + (t / tl.duration) * (W - 2 * P);
  const y = (v: number) => H - P - (v / max) * (H - 2 * P);
  const cumAt = (s: Side, t: number) => shots.filter((e) => e.side === s && e.t <= t).reduce((v, e) => v + (e.xg ?? 0), 0);
  const line = (s: Side) => {
    let cum = 0;
    const pts = [`${x(0)},${y(0)}`];
    for (const e of shots) {
      if (e.side !== s) continue;
      pts.push(`${x(e.t)},${y(cum)}`);
      cum += e.xg ?? 0;
      pts.push(`${x(e.t)},${y(cum)}`);
    }
    pts.push(`${x(tl.duration)},${y(cum)}`);
    return pts.join(' ');
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} class="momentum" role="img" aria-label="xG acumulado ao longo do jogo">
      <line x1={x(tl.secondHalfStart)} y1={P} x2={x(tl.secondHalfStart)} y2={H - P} stroke="var(--line)" stroke-dasharray="3 3" />
      {(['home', 'away'] as const).map((s) => (
        <polyline key={s} points={line(s)} fill="none" stroke={teamColor(m, s)} stroke-width="2" />
      ))}
      {tl.events
        .filter((e) => e.type === 'goal')
        .map((e, i) => (
          <circle key={i} cx={x(e.t)} cy={y(cumAt(e.side, e.t))} r="3.5" fill={teamColor(m, e.side)} stroke="var(--panel)" />
        ))}
    </svg>
  );
}

/** Resumo de fim de jogo: xG, mapa de chutes, pressão, notas e dicas do auxiliar. */
function PostMatch({ m }: { m: LiveMatchView }) {
  const tl = m.timeline;
  const mine = new Set([...m.input[m.userSide].xi, ...m.input[m.userSide].bench].map((p) => p.id));
  const rated = Object.entries(tl.ratings)
    .filter(([id]) => m.names[id] && m.names[id] !== '—')
    .sort((a, b) => b[1] - a[1]);
  const star = rated[0];
  return (
    <section class="card span2 post">
      <h3>Resumo da partida</h3>
      <p class="small">
        xG <b>{tl.stats.home.xg}</b> – <b>{tl.stats.away.xg}</b>
        {star && (
          <>
            {' '}• Craque do jogo: <b>{m.names[star[0]]}</b> ({star[1].toFixed(1)})
          </>
        )}
      </p>
      <div class="post-grid">
        <div>
          <p class="tiny muted">Finalizações ({m.home.abbr} ataca para a direita) • círculo cheio = gol</p>
          <ShotMap m={m} />
        </div>
        <div>
          <p class="tiny muted">xG acumulado ({m.home.abbr} e {m.away.abbr})</p>
          <Momentum m={m} />
          <p class="tiny muted">Melhores notas do seu time</p>
          <ul class="news">
            {rated
              .filter(([id]) => mine.has(id))
              .slice(0, 3)
              .map(([id, r]) => (
                <li key={id}>
                  {m.names[id]} <b>{r.toFixed(1)}</b>
                </li>
              ))}
          </ul>
        </div>
      </div>
      <h3>Auxiliar técnico</h3>
      <ul class="news">
        {tips(m).map((s, i) => (
          <li key={i}>💬 {s}</li>
        ))}
      </ul>
    </section>
  );
}

export function LiveMatch({ m, busy, send }: { m: LiveMatchView; busy: boolean; send: (c: Command) => void }) {
  const tl = m.timeline;
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<Speed>('normal');
  const [subOut, setSubOut] = useState('');
  const [subIn, setSubIn] = useState('');
  const tRef = useRef(0);
  tRef.current = t;
  const canvas = useRef<HTMLCanvasElement>(null);
  const highlights = useMemo(() => tl.events.filter((e) => (e.weight ?? 0) >= 0.5).map((e) => e.t), [tl]);
  const halftime = tl.secondHalfStart;
  const ended = t >= tl.duration;

  // Relógio: avança o tempo de jogo; nos lances importantes, desacelera.
  useEffect(() => {
    if (!playing || ended) return;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const cur = tRef.current;
      const near = speed === 'lances' && highlights.some((h) => cur > h - 12 && cur < h + 3);
      let next = cur + dt * (near ? 6 : SPEED[speed]);
      // Pausa automática no intervalo, para mexer no time.
      if (cur < halftime && next >= halftime) {
        next = halftime;
        setPlaying(false);
      }
      setT(Math.min(next, tl.duration));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, tl, ended]);

  // Campo 2D.
  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const W = c.width;
    const H = c.height;
    const sx = W / 105;
    const sy = H / 68;
    ctx.fillStyle = '#1f6b35';
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 10; i += 2) {
      ctx.fillStyle = 'rgba(255,255,255,0.035)';
      ctx.fillRect((i * W) / 10, 0, W / 10, H);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(2, 2, W - 4, H - 4);
    ctx.beginPath();
    ctx.moveTo(W / 2, 2);
    ctx.lineTo(W / 2, H - 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, 9.15 * sx, 0, Math.PI * 2);
    ctx.stroke();
    for (const x0 of [0, 105 - 16.5]) ctx.strokeRect(x0 * sx + (x0 ? 0 : 2), (34 - 20.15) * sy, 16.5 * sx - 2, 40.3 * sy);
    for (const x0 of [0, 105 - 5.5]) ctx.strokeRect(x0 * sx + (x0 ? 0 : 2), (34 - 9.15) * sy, 5.5 * sx - 2, 18.3 * sy);
    const pos = positionsAt(m.input, tl, t);
    for (const p of pos.players) {
      const club = m[p.side];
      ctx.beginPath();
      ctx.arc(p.x * sx, p.y * sy, 6, 0, Math.PI * 2);
      ctx.fillStyle = club.colors[0];
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = club.colors[1];
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(pos.ball.x * sx, pos.ball.y * sy, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 1;
    ctx.stroke();
  }, [t, tl]);

  const past = tl.events.filter((e) => e.t <= t);
  const score = { home: past.filter((e) => e.type === 'goal' && e.side === 'home').length, away: past.filter((e) => e.type === 'goal' && e.side === 'away').length };
  // Os gols dos outros jogos entram na narração como num plantão de rádio.
  const radio = m.day.games.flatMap((g) =>
    g.goals.length !== g.final[0] + g.final[1]
      ? []
      : g.goals.map(([s, mn], k) => {
          const upTo = g.goals.slice(0, k + 1);
          const h = upTo.filter(([x]) => x === 0).length;
          return { t: minuteToT(mn, halftime), i: -1, text: `📻 Gol do ${s === 0 ? g.home.name : g.away.name}! ${g.home.abbr} ${h} x ${upTo.length - h} ${g.away.abbr}`, cls: 'radio' };
        }),
  );
  const feed = [
    ...past.map((e, i) => ({ t: e.t, i, text: narrate(e, m), cls: e.type === 'goal' ? 'goal' : e.type === 'injury' ? 'warn' : '' })),
    ...radio.filter((x) => x.t <= t),
  ]
    .filter((x): x is { t: number; i: number; text: string; cls: string } => !!x.text)
    .sort((a, b) => b.t - a.t || b.i - a.i)
    .slice(0, 30);
  const count = (side: Side, ...types: MatchEvent['type'][]) => past.filter((e) => e.side === side && types.includes(e.type)).length;
  const minute = clockMinute(t, halftime);
  const me = m.userSide;

  // Quem está em campo e no banco do usuário agora (considera trocas e expulsões).
  const onPitch = new Set(m.input[me].xi.map((p) => p.id));
  const used = new Set<string>();
  const windows = new Set<number>();
  for (const e of past) {
    if (e.side !== me) continue;
    if (e.type === 'sub') {
      onPitch.delete(e.other!);
      onPitch.add(e.player!);
      used.add(e.player!);
      if (e.t !== halftime) windows.add(clockMinute(e.t, halftime));
    } else if (e.type === 'red' || e.type === 'injury') onPitch.delete(e.player!);
  }
  const subsDone = past.filter((e) => e.side === me && e.type === 'sub').length;
  const bench = m.input[me].bench.filter((p) => !used.has(p.id));
  const atHalftime = t === halftime;
  const canSub = !ended && subsDone < MAX_SUBS && (atHalftime || windows.size < MAX_SUB_WINDOWS);
  const mentality = ([...m.changes].reverse().find((c) => c.type === 'tactics' && c.tactics.mentality !== undefined) as { tactics: { mentality: Mentality } } | undefined)?.tactics.mentality ?? m.input[me].tactics.mentality;
  const changeMinute = atHalftime ? 45 : minute + 1;
  const formation = ([...m.changes].reverse().find((c) => c.type === 'formation') as { formation: string } | undefined)?.formation ?? m.input[me].formation;

  // Classificação ao vivo: a tabela de antes da rodada mais os placares de agora.
  let table: StandingRow[] | null = null;
  const before = new Map<string, number>();
  if (m.day.table) {
    sortTable(m.day.table).forEach((r, i) => before.set(r.clubId, i));
    const rows = m.day.table.map((r) => ({ ...r }));
    for (const g of m.day.games) {
      const [h, a] = dayScore(g, t, halftime, ended);
      applyToTable(rows, g.home.id, g.away.id, h, a);
    }
    applyToTable(rows, m.home.id, m.away.id, score.home, score.away);
    table = sortTable(rows);
  }

  return (
    <div class="match">
      <div class="scoreboard">
        <span class="team" style={{ '--c': m.home.colors[0] }}>{m.home.abbr}</span>
        <b class="score">{score.home} – {score.away}</b>
        <span class="team" style={{ '--c': m.away.colors[0] }}>{m.away.abbr}</span>
        <span class="clock">{ended ? 'Fim' : atHalftime ? 'Intervalo' : clockLabel(t, halftime)}</span>
      </div>
      <p class="tiny muted center">{m.competition} • {m.round}</p>
      <canvas ref={canvas} width={630} height={408} class="pitch2d" aria-label="Campo 2D da partida" />
      <div class="row">
        {!ended && <button onClick={() => setPlaying(!playing)}>{playing ? '⏸ Pausar' : '▶ Continuar'}</button>}
        {(['lances', 'normal', 'rapido'] as const).map((s) => (
          <button key={s} class={speed === s ? 'active' : 'ghost'} onClick={() => setSpeed(s)}>{{ lances: 'Melhores momentos', normal: '1×', rapido: '3×' }[s]}</button>
        ))}
        {!ended && <button class="ghost" onClick={() => setT(tl.duration)}>Ir para o fim</button>}
        {ended && <button class="primary" disabled={busy} onClick={() => send({ type: 'matchFinish' })}>Encerrar partida</button>}
      </div>
      <div class="grid match-grid">
        <section class="card">
          <h3>Narração</h3>
          <div class="feed">
            {feed.map((x) => (
              <p key={`${x.t}:${x.i}:${x.text}`} class={x.cls}><b class="tiny muted">{clockLabel(x.t, halftime)}</b> {x.text}</p>
            ))}
          </div>
        </section>
        <section class="card">
          <h3>Estatísticas</h3>
          <table class="table stats">
            <tbody>
              {([
                ['Finalizações', count('home', 'shot'), count('away', 'shot')],
                ['No alvo', count('home', 'goal') + count('away', 'save'), count('away', 'goal') + count('home', 'save')],
                ['Escanteios', count('home', 'corner'), count('away', 'corner')],
                ['Faltas', count('away', 'foul'), count('home', 'foul')],
                ['Cartões', count('home', 'yellow', 'red'), count('away', 'yellow', 'red')],
              ] as const).map(([k, a, b]) => (
                <tr key={k}><td class="num">{a}</td><td class="center muted small">{k}</td><td>{b}</td></tr>
              ))}
              {ended && <tr><td class="num">{tl.stats.home.possession}%</td><td class="center muted small">Posse</td><td>{tl.stats.away.possession}%</td></tr>}
              {ended && <tr><td class="num">{tl.stats.home.xg}</td><td class="center muted small">xG</td><td>{tl.stats.away.xg}</td></tr>}
            </tbody>
          </table>
        </section>
        {!ended && (
          <section class="card">
            <h3>Seu time</h3>
            <label class="small">
              Mentalidade
              <select value={mentality} disabled={busy} onChange={(e) => send({ type: 'matchChange', change: { minute: changeMinute, side: me, type: 'tactics', tactics: { mentality: +(e.target as HTMLSelectElement).value as Mentality } } })}>
                {([-2, -1, 0, 1, 2] as Mentality[]).map((k) => <option key={k} value={k}>{MENTALITIES[k]}</option>)}
              </select>
            </label>
            <label class="small">
              Formação
              <select value={formation} disabled={busy} onChange={(e) => send({ type: 'matchChange', change: { minute: changeMinute, side: me, type: 'formation', formation: (e.target as HTMLSelectElement).value } })}>
                {Object.keys(FORMATIONS).map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </label>
            <p class="tiny muted">Substituições: {subsDone}/{MAX_SUBS} • janelas {windows.size}/{MAX_SUB_WINDOWS} (o intervalo não conta)</p>
            <div class="row filters">
              <select value={subOut} onChange={(e) => setSubOut((e.target as HTMLSelectElement).value)}>
                <option value="">Sai…</option>
                {[...onPitch].map((id) => <option key={id} value={id}>{m.names[id]}</option>)}
              </select>
              <select value={subIn} onChange={(e) => setSubIn((e.target as HTMLSelectElement).value)}>
                <option value="">Entra…</option>
                {bench.map((p) => <option key={p.id} value={p.id}>{p.pos} {p.name} ({p.ovr})</option>)}
              </select>
              <button
                disabled={busy || !canSub || !subOut || !subIn}
                onClick={() => {
                  send({ type: 'matchChange', change: { minute: changeMinute, side: me, type: 'sub', out: subOut, in: subIn } });
                  setSubOut('');
                  setSubIn('');
                }}
              >
                Substituir
              </button>
            </div>
          </section>
        )}
        {m.day.games.length > 0 && (
          <section class="card">
            <h3>Rodada ao vivo</h3>
            {m.day.games.map((g, i) => {
              const [h, a] = dayScore(g, t, halftime, ended);
              const recent = !ended && g.goals.some(([, mn]) => minuteToT(mn, halftime) <= t && minuteToT(mn, halftime) > t - 90);
              return (
                <div key={i} class={`day-game ${recent ? 'flash' : ''}`}>
                  <span>{g.home.abbr}</span>
                  <b>{h} x {a}</b>
                  <span>{g.away.abbr}</span>
                </div>
              );
            })}
          </section>
        )}
        {table && (
          <section class="card">
            <h3>Classificação ao vivo</h3>
            <div class="live-table">
              <table class="table standings">
                <tbody>
                  {table.map((r, i) => {
                    const moved = (before.get(r.clubId) ?? i) - i;
                    return (
                      <tr key={r.clubId} class={`${r.clubId === m[me].id ? 'me' : ''} ${i < 4 ? 'top' : ''} ${i >= table!.length - 4 ? 'bottom' : ''}`}>
                        <td>
                          {i + 1}
                          {moved > 0 && <span class="up"> ▲</span>}
                          {moved < 0 && <span class="down"> ▼</span>}
                        </td>
                        <td>{m.day.clubs[r.clubId]?.abbr ?? r.clubId}</td>
                        <td>
                          <b>{r.points}</b>
                        </td>
                        <td class="muted">{r.goalsFor - r.goalsAgainst}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
        {ended && <PostMatch m={m} />}
      </div>
    </div>
  );
}
