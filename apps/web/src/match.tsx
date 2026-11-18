/**
 * Partida ao vivo em 2D. O resultado já foi decidido pelo motor no Worker; a
 * tela reproduz a linha do tempo (relógio acelerado, campo, narração e
 * estatísticas derivadas dos eventos). Substituições e mentalidade viram
 * `MatchChange`: o Worker roda o motor de novo, e tudo antes do minuto da
 * mudança permanece idêntico (determinismo).
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { MAX_SUBS, MAX_SUB_WINDOWS, MENTALITIES, clockLabel, clockMinute, positionsAt, type MatchEvent, type Mentality, type Side } from '@sm/core';
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
    case 'tactics': return `📋 ${team(e.side)} muda a postura.`;
    case 'halftime': return 'Fim do primeiro tempo.';
    case 'fulltime': return 'Fim de jogo!';
    default: return null;
  }
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
  const feed = past.map((e) => [e, narrate(e, m)] as const).filter(([, s]) => s).reverse().slice(0, 30);
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
    } else if (e.type === 'red') onPitch.delete(e.player!);
  }
  const subsDone = past.filter((e) => e.side === me && e.type === 'sub').length;
  const bench = m.input[me].bench.filter((p) => !used.has(p.id));
  const atHalftime = t === halftime;
  const canSub = !ended && subsDone < MAX_SUBS && (atHalftime || windows.size < MAX_SUB_WINDOWS);
  const mentality = ([...m.changes].reverse().find((c) => c.type === 'tactics' && c.tactics.mentality !== undefined) as { tactics: { mentality: Mentality } } | undefined)?.tactics.mentality ?? m.input[me].tactics.mentality;
  const changeMinute = atHalftime ? 45 : minute + 1;

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
            {feed.map(([e, s], i) => (
              <p key={i} class={e.type === 'goal' ? 'goal' : ''}><b class="tiny muted">{clockLabel(e.t, halftime)}</b> {s}</p>
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
      </div>
    </div>
  );
}
