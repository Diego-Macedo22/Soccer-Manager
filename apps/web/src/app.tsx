/**
 * Interface do manager. Não guarda regra de jogo: envia comandos ao Worker e
 * desenha a `View` que ele devolve. Estado de tela (aba, seleção para troca)
 * vive aqui e nunca vai para o save (B5). Todo texto é renderizado pelo Preact,
 * que escapa HTML (B14).
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { LiveMatch } from './match.tsx';
import type { LiveMatchView, ClubOption, Command, CompetitionView, FixtureView, MarketPlayer, PlayerView, Reply, View, YouthView } from './protocol.ts';

const brl = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(n);
const fmtDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
const tier = (ovr: number) => (ovr >= 85 ? 'special' : ovr >= 78 ? 'gold' : ovr >= 70 ? 'silver' : 'bronze');

type Tab = 'painel' | 'elenco' | 'mercado' | 'base' | 'diretoria' | 'competicoes' | 'financas';
const TABS: [Tab, string, string][] = [
  ['painel', 'Painel', '🏠'],
  ['elenco', 'Elenco', '📋'],
  ['mercado', 'Mercado', '🔁'],
  ['base', 'Base', '🌱'],
  ['diretoria', 'Diretoria', '👔'],
  ['competicoes', 'Competições', '🏆'],
  ['financas', 'Finanças', '💰'],
];

function useWorker() {
  const worker = useMemo(() => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }), []);
  const [busy, setBusy] = useState(false);
  const listeners = useRef<((r: Reply) => void)[]>([]);
  useEffect(() => {
    worker.onmessage = (e: MessageEvent<Reply>) => {
      setBusy(false);
      listeners.current.forEach((l) => l(e.data));
    };
    return () => worker.terminate();
  }, [worker]);
  const send = (cmd: Command) => {
    setBusy(true);
    worker.postMessage(cmd);
  };
  const on = (l: (r: Reply) => void) => {
    listeners.current = [l];
  };
  return { send, on, busy };
}

export function App() {
  const { send, on, busy } = useWorker();
  const [clubs, setClubs] = useState<ClubOption[] | null>(null);
  const [hasSave, setHasSave] = useState(false);
  const [view, setView] = useState<View | null>(null);
  const [tab, setTab] = useState<Tab>('painel');
  const [toast, setToast] = useState<string | null>(null);
  const [match, setMatch] = useState<LiveMatchView | null>(null);

  on((r) => {
    if (r.type === 'init') {
      setClubs(r.clubs);
      setHasSave(r.hasSave);
    } else if (r.type === 'view') {
      setView(r.view);
      setMatch(null);
      if (r.toast) setToast(r.toast);
    } else if (r.type === 'match') setMatch(r.match);
    else setToast(r.message);
  });
  useEffect(() => send({ type: 'init' }), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (view) {
      document.documentElement.style.setProperty('--club', view.club.colors[0]);
      document.documentElement.style.setProperty('--club2', view.club.colors[1]);
    }
  }, [view?.club.id]);

  if (!view) return <Setup clubs={clubs} hasSave={hasSave} busy={busy} send={send} toast={toast} />;

  return (
    <div class="shell">
      <header class="topbar">
        <div class="club-badge" aria-hidden="true">{view.club.abbr}</div>
        <div class="top-title">
          <b>{view.club.name}</b>
          <span class="muted tiny">
            {view.manager}
            <span class="show-sm"> • {fmtDate(view.date)}</span>
          </span>
        </div>
        <div class="top-stats hide-sm">
          <span class="pill">{fmtDate(view.date)}</span>
          <span class="pill hide-sm">{brl(view.finance.balance)}</span>
        </div>
        <button class="primary continue" disabled={busy || !!match} onClick={() => send(view.next?.today ? { type: 'matchStart' } : { type: 'continue' })}>
          {busy ? 'Simulando…' : view.next?.today ? 'Jogar partida' : 'Continuar'}
        </button>
      </header>
      <nav class="tabs" aria-label="Seções">
        {TABS.map(([id, label, icon]) => (
          <button key={id} class={tab === id ? 'active' : ''} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>
            <span aria-hidden="true">{icon}</span> <span class="label">{label}</span>
          </button>
        ))}
      </nav>
      <main class="content">
        {match && <LiveMatch m={match} busy={busy} send={send} />}
        {!match && tab === 'painel' && <Dashboard view={view} busy={busy} send={send} />}
        {!match && tab === 'elenco' && <Squad view={view} busy={busy} send={send} />}
        {!match && tab === 'mercado' && <Market view={view} busy={busy} send={send} />}
        {!match && tab === 'base' && <Academy view={view} busy={busy} send={send} />}
        {!match && tab === 'diretoria' && <Board view={view} busy={busy} send={send} />}
        {!match && tab === 'competicoes' && <Competitions view={view} />}
        {!match && tab === 'financas' && <Finances view={view} />}
      </main>
      {toast && (
        <div class="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

function Setup({ clubs, hasSave, busy, send, toast }: { clubs: ClubOption[] | null; hasSave: boolean; busy: boolean; send: (c: Command) => void; toast: string | null }) {
  const [manager, setManager] = useState('');
  const [clubId, setClubId] = useState('corinthians');
  const leagues = [...new Set((clubs ?? []).map((c) => c.league))];
  return (
    <div class="setup">
      <div class="setup-card">
        <div class="setup-hero">
          <div class="brand">
            <span class="brand-mark" />
            <span>Soccer Manager</span>
          </div>
          <h1 class="setup-title">Modo Carreira</h1>
          <p class="muted">Assuma um clube, monte o elenco, escolha a tática e cumpra os objetivos temporada após temporada. Universo fictício: clubes e jogadores com nomes inspirados no futebol real.</p>
        </div>
        <form
          class="setup-form"
          onSubmit={(e) => {
            e.preventDefault();
            send({ type: 'new', clubId, manager });
          }}
        >
          <label class="field">
            <span>Nome do técnico</span>
            <input value={manager} maxLength={40} placeholder="Seu nome" onInput={(e) => setManager((e.target as HTMLInputElement).value)} />
          </label>
          <label class="field">
            <span>Clube</span>
            <select value={clubId} disabled={!clubs} onChange={(e) => setClubId((e.target as HTMLSelectElement).value)}>
              {leagues.map((l) => (
                <optgroup key={l} label={l}>
                  {clubs!.filter((c) => c.league === l).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <button class="primary wide" type="submit" disabled={!clubs || busy}>
            {busy ? 'Preparando…' : 'Nova carreira'}
          </button>
          {hasSave && (
            <button type="button" class="wide" disabled={busy} onClick={() => send({ type: 'load' })}>
              Continuar carreira salva
            </button>
          )}
          {toast && <p class="error">{toast}</p>}
        </form>
      </div>
    </div>
  );
}

function FixtureLine({ f }: { f: FixtureView }) {
  return (
    <div class="fixture">
      <span class="tiny muted">{fmtDate(f.date)}</span>
      <span class="teams">
        <b>{f.home.abbr}</b> {f.score ?? 'x'} <b>{f.away.abbr}</b>
      </span>
      <span class="tiny muted ellipsis">{f.competition}</span>
    </div>
  );
}

function Dashboard({ view, busy, send }: { view: View; busy: boolean; send: (c: Command) => void }) {
  return (
    <>
      <div class="page-head">
        <h1>Painel</h1>
        <p class="muted">{view.standing ? `${view.standing.competition} • ${view.standing.pos}º lugar • ${view.standing.points} pts` : 'Pré-temporada'}</p>
      </div>
      <div class="grid">
        <section class="card next">
          <h3>{view.next?.today ? 'Hoje tem jogo' : 'Próximo jogo'}</h3>
          {view.next ? (
            <>
              <div class="scoreline">
                <span>{view.next.home.name}</span>
                <b>x</b>
                <span>{view.next.away.name}</span>
              </div>
              <p class="muted small">
                {fmtDate(view.next.date)} • {view.next.competition} • {view.next.round}
              </p>
            </>
          ) : (
            <p class="muted">Sem jogos marcados.</p>
          )}
          {view.next?.today && (
            <div class="row">
              <button class="primary" disabled={busy} onClick={() => send({ type: 'matchStart' })}>▶ Jogar ao vivo</button>
              <button class="ghost" disabled={busy} onClick={() => send({ type: 'continue' })}>Simular resultado</button>
            </div>
          )}
          <div class="row">
            <button disabled={busy} onClick={() => send({ type: 'advanceDays', days: 7 })}>
              Avançar 1 semana
            </button>
            <button disabled={busy} onClick={() => send({ type: 'advanceDays', days: 30 })}>
              Avançar 1 mês
            </button>
          </div>
          <p class="tiny muted">O avanço sempre para no dia do seu próximo jogo.</p>
        </section>
        <section class="card">
          <h3>Próximos acontecimentos</h3>
          {view.upcoming.length ? (
            <ul class="upcoming">
              {view.upcoming.map((u, i) => (
                <li key={i}>
                  <span class={`when ${u.days <= 1 ? 'soon' : ''}`}>{u.days === 0 ? 'Hoje' : u.days === 1 ? 'Amanhã' : `${u.days} dias`}</span>
                  <span>
                    <b>{u.title}</b>
                    {u.detail && <span class="tiny muted block">{u.detail}</span>}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p class="muted">Nada marcado por enquanto.</p>
          )}
        </section>
        <section class="card">
          <h3>Últimos resultados</h3>
          {view.results.length ? view.results.map((f) => <FixtureLine key={f.id} f={f} />) : <p class="muted">A temporada ainda não começou.</p>}
        </section>
        <section class="card">
          <h3>Notícias</h3>
          <ul class="news">
            {view.news.map((n, i) => (
              <li key={i}>
                <span class="tiny muted">{fmtDate(n.date)}</span> <b>{n.title}</b> {n.body && <span class="muted">— {n.body}</span>}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}

function Squad({ view, busy, send }: { view: View; busy: boolean; send: (c: Command) => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  const byId = new Map(view.squad.map((p) => [p.id, p]));
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id].slice(-2)));
  const swap = () => {
    send({ type: 'swap', a: selected[0]!, b: selected[1]! });
    setSelected([]);
  };
  const chip = (id: string) => {
    const p = byId.get(id);
    if (!p) return null;
    return (
      <button key={id} class={`chip ${selected.includes(id) ? 'selected' : ''} ${p.injuredUntil ? 'injured' : ''}`} aria-pressed={selected.includes(id)} onClick={() => toggle(id)}>
        <span class="pos">{p.pos}</span>
        <span class="grow ellipsis">{p.name}</span>
        <span class={`ovr ${tier(p.ovr)}`}>{p.ovr}</span>
      </button>
    );
  };
  return (
    <>
      <div class="page-head">
        <h1>Elenco e tática</h1>
        <p class="muted">Toque em dois jogadores (campo, banco ou reservas) e use ⇄ para trocar.</p>
      </div>
      <div class="toolbar">
        <select value={view.lineup.formation} disabled={busy} aria-label="Formação" onChange={(e) => send({ type: 'formation', key: (e.target as HTMLSelectElement).value })}>
          {view.formations.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
        <button disabled={busy} onClick={() => send({ type: 'auto' })}>
          Escalar automático
        </button>
        <button class="primary" disabled={busy || selected.length !== 2} onClick={swap}>
          ⇄ Trocar {selected.length === 2 ? `${byId.get(selected[0]!)?.name} e ${byId.get(selected[1]!)?.name}` : `(${selected.length}/2)`}
        </button>
      </div>
      <div class="grid">
        <section class="card pitch-card">
          <div class="pitch">
            {view.lineup.xi.map((s, i) => {
              const p = s.playerId ? byId.get(s.playerId) : undefined;
              return (
                <button
                  key={i}
                  class={`slot ${p && selected.includes(p.id) ? 'selected' : ''}`}
                  style={{ left: `${s.x}%`, top: `${s.y}%` }}
                  disabled={!p}
                  onClick={() => p && toggle(p.id)}
                  aria-label={p ? `${s.pos}: ${p.name}` : `${s.pos} vazio`}
                >
                  <span class="slot-pos">{s.pos}</span>
                  <span class="slot-name">{p ? p.name.split(' ').slice(-1)[0] : '—'}</span>
                  {p && <span class={`ovr ${tier(p.ovr)}`}>{p.ovr}</span>}
                </button>
              );
            })}
          </div>
        </section>
        <section class="card">
          <h3>Banco ({view.lineup.bench.length})</h3>
          <div class="chips">{view.lineup.bench.map(chip)}</div>
          <h3>Reservas ({view.lineup.reserves.length})</h3>
          <div class="chips">{view.lineup.reserves.map(chip)}</div>
        </section>
        <section class="card span2">
          <h3>Jogadores</h3>
          <PlayersTable players={view.squad} />
        </section>
      </div>
    </>
  );
}

function PlayersTable({ players }: { players: PlayerView[] }) {
  return (
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>Pos</th>
            <th>Jogador</th>
            <th>Idade</th>
            <th>OVR</th>
            <th>POT</th>
            <th class="hide-sm">Energia</th>
            <th class="hide-sm">Jogos</th>
            <th class="hide-sm">Contrato</th>
          </tr>
        </thead>
        <tbody>
          {players.map((p) => (
            <tr key={p.id}>
              <td>
                <span class="pos">{p.pos}</span>
              </td>
              <td>
                <b>{p.name}</b>
                {p.injuredUntil && <div class="tiny danger-text">🏥 até {fmtDate(p.injuredUntil)}</div>}
                {p.positions.length > 1 && <div class="tiny muted">{p.positions.join(' / ')}</div>}
              </td>
              <td>{p.age}</td>
              <td>
                <span class={`ovr ${tier(p.ovr)}`}>{p.ovr}</span>
              </td>
              <td>{p.pot}</td>
              <td class="hide-sm">
                <div class="bar">
                  <span style={{ width: `${p.fitness}%` }} />
                </div>
              </td>
              <td class="hide-sm">{p.apps}</td>
              <td class="hide-sm">{p.contract}a</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Competitions({ view }: { view: View }) {
  const [id, setId] = useState(view.competitions[0]?.id ?? '');
  const c: CompetitionView | undefined = view.competitions.find((x) => x.id === id) ?? view.competitions[0];
  return (
    <>
      <div class="page-head">
        <h1>Competições</h1>
        <select value={c?.id} aria-label="Competição" onChange={(e) => setId((e.target as HTMLSelectElement).value)}>
          {view.competitions.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
              {x.status === 'finished' ? ' (encerrada)' : ''}
            </option>
          ))}
        </select>
      </div>
      {c && (
        <div class="grid">
          {c.champion && (
            <section class="card span2">
              <h3>Campeão</h3>
              <div class="metric">🏆 {c.champion}</div>
            </section>
          )}
          {c.groups.map((gr) => (
            <section class="card" key={gr.name}>
              <h3>Grupo {gr.name}</h3>
              <table class="table standings">
                <tbody>
                  {gr.table.map((r) => (
                    <tr key={r.club.id} class={`${r.user ? 'me' : ''} ${r.pos <= 2 ? 'top' : ''} ${r.pos === 3 && c.name.startsWith('Taça') ? 'third' : ''}`}>
                      <td>{r.pos}</td>
                      <td>{r.club.name}</td>
                      <td><b>{r.points}</b></td>
                      <td>{r.played}</td>
                      <td>{r.gd}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
          {c.groups.length > 0 && <p class="tiny muted span2">{c.name.startsWith('Taça') ? '1º e 2º às quartas • 3º cai para a Copa Sul-Continental' : '1º e 2º às quartas, contra os 3º colocados da Taça Continental'} • mata-mata em ida e volta, sem gol fora • final em jogo único</p>}
          {c.format === 'league' ? (
            <section class="card span2">
              <div class="table-wrap">
                <table class="table standings">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Clube</th>
                      <th>P</th>
                      <th>J</th>
                      <th class="hide-sm">V</th>
                      <th class="hide-sm">E</th>
                      <th class="hide-sm">D</th>
                      <th>SG</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.table.map((r) => (
                      <tr key={r.club.id} class={`${r.user ? 'me' : ''} ${r.pos <= 4 ? 'top' : ''} ${r.pos > c.table.length - 4 ? 'bottom' : ''}`}>
                        <td>{r.pos}</td>
                        <td>{r.club.name}</td>
                        <td>
                          <b>{r.points}</b>
                        </td>
                        <td>{r.played}</td>
                        <td class="hide-sm">{r.won}</td>
                        <td class="hide-sm">{r.drawn}</td>
                        <td class="hide-sm">{r.lost}</td>
                        <td>{r.gd}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : (
            <section class="card span2">
              <h3>Jogos</h3>
              {c.userFixtures.map((f) => (
                <FixtureLine key={f.id} f={f} />
              ))}
            </section>
          )}
          {c.scorers.length > 0 && (
            <section class="card span2">
              <h3>Artilharia</h3>
              <table class="table standings">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Jogador</th>
                    <th>Clube</th>
                    <th title="Gols">G</th>
                    <th title="Assistências">A</th>
                  </tr>
                </thead>
                <tbody>
                  {c.scorers.map((p, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>{p.name}</td>
                      <td class="muted">{p.club.abbr}</td>
                      <td>
                        <b>{p.goals}</b>
                      </td>
                      <td>{p.assists}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </div>
      )}
    </>
  );
}

const KIND_LABEL: Record<string, string> = { payroll: 'Folha salarial', gate: 'Bilheteria', merchandise: 'Produtos e camisas', board: 'Aporte da diretoria', transfer: 'Transferências', bonus: 'Luvas', release: 'Rescisões', facility: 'Instalações', other: 'Outros' };

function Finances({ view }: { view: View }) {
  const f = view.finance;
  return (
    <>
      <div class="page-head">
        <h1>Finanças</h1>
        <p class="muted">Todo movimento de caixa aparece no extrato.</p>
      </div>
      <div class="grid metrics">
        <section class="card">
          <div class={`metric ${f.balance < 0 ? 'danger-text' : ''}`}>{brl(f.balance)}</div>
          <div class="metric-label">Caixa</div>
        </section>
        <section class="card">
          <div class="metric">{brl(f.wages)}</div>
          <div class="metric-label">Folha mensal</div>
        </section>
        {Object.entries(f.totals).map(([k, v]) => (
          <section class="card" key={k}>
            <div class={`metric ${v < 0 ? 'danger-text' : ''}`}>{brl(v)}</div>
            <div class="metric-label">{KIND_LABEL[k] ?? k} no ano</div>
          </section>
        ))}
      </div>
      <section class="card">
        <h3>Extrato</h3>
        <div class="table-wrap">
          <table class="table">
            <tbody>
              {f.entries.map((e, i) => (
                <tr key={i}>
                  <td class="tiny muted">{fmtDate(e.date)}</td>
                  <td>
                    <b>{e.label}</b>
                    {e.detail && <div class="tiny muted">{e.detail}</div>}
                  </td>
                  <td class={`num ${e.value < 0 ? 'danger-text' : 'ok-text'}`}>{brl(e.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <p class="tiny muted">Save atual: {(view.saveSize / 1000).toFixed(0)} mil caracteres.</p>
    </>
  );
}

type Send = (c: Command) => void;
const POS_FILTER = ['', 'GOL', 'ZAG', 'LD', 'LE', 'VOL', 'MC', 'MAT', 'PE', 'PD', 'ATA'];

function Market({ view, busy, send }: { view: View; busy: boolean; send: Send }) {
  const m = view.market;
  const [mode, setMode] = useState<'comprar' | 'livres' | 'meus' | 'olheiros'>('comprar');
  const [pos, setPos] = useState('');
  const [q, setQ] = useState('');
  const [maxAsk, setMaxAsk] = useState(0);
  const [pick, setPick] = useState<MarketPlayer | null>(null);
  const [offer, setOffer] = useState(0);
  const list = m.players
    .filter((p) => (mode === 'livres' ? !p.club : !!p.club))
    .filter((p) => (!pos || p.pos === pos) && (!q || p.name.toLowerCase().includes(q.toLowerCase())) && (!maxAsk || p.ask <= maxAsk))
    .slice(0, 80);
  const choose = (p: MarketPlayer) => {
    setPick(p);
    setOffer(p.ask);
  };
  return (
    <>
      <div class="page-head">
        <h1>Mercado</h1>
        <p class="muted">
          Janela {m.windowOpen ? <b class="ok-text">aberta</b> : <b class="danger-text">fechada</b>} (janeiro e julho) • Caixa {brl(view.finance.balance)}
        </p>
      </div>
      {m.offers.length > 0 && (
        <section class="card">
          <h3>Propostas recebidas</h3>
          {m.offers.map((o) => (
            <div class="list-row" key={o.id}>
              <div class="grow">
                <b>{o.player}</b>
                <div class="tiny muted">
                  {o.club.name} • {o.type === 'loan' ? 'empréstimo' : 'compra'} por {brl(o.value)} • até {fmtDate(o.expires)}
                </div>
              </div>
              <button disabled={busy} onClick={() => send({ type: 'acceptOffer', id: o.id })}>Aceitar</button>
              <button class="ghost" disabled={busy} onClick={() => send({ type: 'rejectOffer', id: o.id })}>Recusar</button>
            </div>
          ))}
        </section>
      )}
      <div class="row">
        {(['comprar', 'livres', 'meus', 'olheiros'] as const).map((k) => (
          <button key={k} class={mode === k ? 'active' : 'ghost'} onClick={() => setMode(k)}>
            {{ comprar: 'Buscar jogadores', livres: 'Agentes livres', meus: 'Contratos do elenco', olheiros: 'Olheiros' }[k]}
          </button>
        ))}
      </div>
      {m.precontracts.length > 0 && (
        <section class="card">
          <h3>Pré-contratos assinados</h3>
          {m.precontracts.map((x) => (
            <div class="list-row" key={x.playerId}>
              <div class="grow"><b>{x.name}</b><div class="tiny muted">{x.club} • {brl(x.wage)}/mês • chega em {x.arrives ? fmtDate(x.arrives) : 'breve'}</div></div>
            </div>
          ))}
        </section>
      )}
      {mode === 'olheiros' ? (
        <Scouts view={view} busy={busy} send={send} open={(id) => { const p = m.players.find((x) => x.id === id); if (p) choose(p); }} />
      ) : mode === 'meus' ? (
        <section class="card">
          <div class="table-wrap">
            <table class="table">
              <tbody>
                {[...view.squad].sort((a, b) => a.contract - b.contract).map((p) => (
                  <tr key={p.id}>
                    <td><span class="pos">{p.pos}</span></td>
                    <td><b>{p.name}</b><div class="tiny muted">{p.age} anos • {brl(p.wage)}/mês • {p.contract} {p.contract === 1 ? 'temporada' : 'temporadas'}{m.loanedIn.includes(p.id) ? ' • emprestado' : ''}</div></td>
                    <td><span class={`ovr ${tier(p.ovr)}`}>{p.ovr}</span></td>
                    <td class="num">
                      {!m.loanedIn.includes(p.id) && (
                        <>
                          <button disabled={busy} onClick={() => send({ type: 'renew', id: p.id })}>Renovar</button>{' '}
                          <button class="ghost danger-text" disabled={busy} onClick={() => confirm(`Rescindir com ${p.name}? Custa metade dos salários restantes.`) && send({ type: 'release', id: p.id })}>Rescindir</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section class="card">
          <div class="row filters">
            <input placeholder="Nome" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
            <select value={pos} onChange={(e) => setPos((e.target as HTMLSelectElement).value)}>
              {POS_FILTER.map((p) => <option key={p} value={p}>{p || 'Todas as posições'}</option>)}
            </select>
            {mode === 'comprar' && (
              <select value={maxAsk} onChange={(e) => setMaxAsk(+(e.target as HTMLSelectElement).value)}>
                {[0, 1e6, 5e6, 15e6, 40e6].map((v) => <option key={v} value={v}>{v ? `Até ${brl(v)}` : 'Qualquer preço'}</option>)}
              </select>
            )}
          </div>
          <div class="table-wrap">
            <table class="table">
              <tbody>
                {list.map((p) => (
                  <tr key={p.id} class={pick?.id === p.id ? 'me' : ''} onClick={() => choose(p)} style="cursor:pointer">
                    <td><span class="pos">{p.pos}</span></td>
                    <td><b>{p.name}</b><div class="tiny muted">{p.club ? p.club.name : 'Sem clube'} • {p.age} anos • POT {p.pot}</div></td>
                    <td><span class={`ovr ${tier(p.ovr)}`}>{p.ovr}</span></td>
                    <td class="num small">{p.club ? brl(p.ask) : `${brl(p.wage)}/mês`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!list.length && <p class="muted">Ninguém encontrado com esses filtros.</p>}
        </section>
      )}
      {pick && mode !== 'meus' && (
        <section class="card sheet">
          <h3>{pick.name} <span class={`ovr ${tier(pick.ovr)}`}>{pick.ovr}</span></h3>
          <p class="tiny muted">
            {pick.pos} • {pick.age} anos • POT {pick.pot} • valor {brl(pick.value)} • contrato {pick.contract} • {pick.club?.name ?? 'agente livre'}
          </p>
          {pick.club ? (
            <>
              <label class="small">
                Oferta: <b>{brl(offer)}</b> ({Math.round((offer / pick.ask) * 100)}% do pedido de {brl(pick.ask)})
                <input type="range" min={Math.round(pick.ask * 0.5)} max={Math.round(pick.ask * 1.6)} step={10000} value={offer} onInput={(e) => setOffer(+(e.target as HTMLInputElement).value)} />
              </label>
              <div class="row">
                <button disabled={busy || !m.windowOpen} onClick={() => send({ type: 'buy', id: pick.id, offer })}>Fazer proposta</button>
                <button class="ghost" disabled={busy || !m.windowOpen} onClick={() => send({ type: 'loanIn', id: pick.id })}>Pedir empréstimo ({brl(Math.round(pick.value * 0.04))})</button>
                <button class="ghost" disabled={busy || !pick.preContract} title="Últimos 6 meses de contrato: chega de graça, com luvas de 6 salários" onClick={() => send({ type: 'preContract', id: pick.id })}>
                  Pré-contrato{pick.preContract ? " (luvas de 6 salários)" : " (só nos últimos 6 meses)"}
                </button>
                <button class="ghost" onClick={() => setPick(null)}>Fechar</button>
              </div>
            </>
          ) : (
            <div class="row">
              <button disabled={busy} onClick={() => send({ type: 'signFree', id: pick.id })}>Contratar sem custo de transferência</button>
              <button class="ghost" onClick={() => setPick(null)}>Fechar</button>
            </div>
          )}
        </section>
      )}
    </>
  );
}

function YouthRow({ y, children }: { y: YouthView; children: preact.ComponentChildren }) {
  return (
    <div class="list-row">
      <span class="pos">{y.pos}</span>
      <div class="grow">
        <b>{y.name}</b>
        <div class="tiny muted">{y.age} anos • POT <b>{y.pot}</b></div>
      </div>
      <span class={`ovr ${tier(y.ovr)}`}>{y.ovr}</span>
      {children}
    </div>
  );
}

function Academy({ view, busy, send }: { view: View; busy: boolean; send: Send }) {
  const a = view.market.academy;
  return (
    <>
      <div class="page-head">
        <h1>Base</h1>
        <p class="muted">Relatórios a cada 3 meses com jovens de 14 a 18 anos. Quanto melhor a instalação, maiores o OVR e o potencial.</p>
      </div>
      <div class="grid metrics">
        <section class="card"><div class="metric">{a.level}/{a.maxLevel}</div><div class="metric-label">Nível da base</div></section>
        <section class="card"><div class="metric">{a.roster.length}/{a.limit}</div><div class="metric-label">Elenco da base</div></section>
        <section class="card"><div class="metric">{a.lastIntake ? fmtDate(a.lastIntake) : '—'}</div><div class="metric-label">Último relatório</div></section>
        <section class="card">
          <button disabled={busy || a.level >= a.maxLevel} onClick={() => send({ type: 'upgradeAcademy' })}>
            {a.level >= a.maxLevel ? 'Nível máximo' : `Melhorar • ${brl(a.upgradeCost)}`}
          </button>
        </section>
      </div>
      <section class="card">
        <h3>Relatório atual</h3>
        {a.candidates.map((y) => (
          <YouthRow y={y} key={y.id}>
            <button disabled={busy} onClick={() => send({ type: 'signYouth', id: y.id })}>Contratar</button>
            <button class="ghost" disabled={busy} onClick={() => send({ type: 'dismissYouth', id: y.id })}>Dispensar</button>
          </YouthRow>
        ))}
        {!a.candidates.length && <p class="muted">Nenhum relatório pendente. O próximo chega no início de um mês, 3 meses após o último.</p>}
      </section>
      <section class="card">
        <h3>Elenco da base</h3>
        {a.roster.map((y) => (
          <YouthRow y={y} key={y.id}>
            <button disabled={busy} onClick={() => send({ type: 'promoteYouth', id: y.id })}>Subir ao profissional</button>
            <button class="ghost danger-text" disabled={busy} onClick={() => send({ type: 'releaseYouth', id: y.id })}>Dispensar</button>
          </YouthRow>
        ))}
        {!a.roster.length && <p class="muted">A base ainda não tem atletas contratados.</p>}
      </section>
    </>
  );
}

function Scouts({ view, busy, send, open }: { view: View; busy: boolean; send: Send; open: (id: string) => void }) {
  const b = view.board;
  const [region, setRegion] = useState('BR');
  const [months, setMonths] = useState(2);
  const names = new Map(view.market.players.map((p) => [p.id, p]));
  return (
    <>
      <section class="card">
        <div class="row filters">
          <select value={region} onChange={(e) => setRegion((e.target as HTMLSelectElement).value)}>
            {b.regions.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={months} onChange={(e) => setMonths(+(e.target as HTMLSelectElement).value)}>
            {[1, 2, 3, 4, 6].map((n) => <option key={n} value={n}>{n} {n === 1 ? 'mês' : 'meses'}</option>)}
          </select>
          <button disabled={busy || b.scouts.length >= b.scoutLimit} onClick={() => send({ type: 'hireScout' })}>
            Contratar olheiro • {brl(b.scoutCost)}
          </button>
        </div>
        <p class="tiny muted">Missões mais longas não trazem mais nomes: o tamanho do relatório depende do nível do olheiro. A precisão define o erro nas estimativas.</p>
      </section>
      {b.scouts.map((sc) => (
        <section class="card" key={sc.id}>
          <div class="list-row">
            <div class="grow">
              <b>{sc.name}</b>
              <div class="tiny muted">Nível {sc.level} • precisão {sc.accuracy}% • {sc.mission ? `em ${sc.mission.region} até ${fmtDate(sc.mission.end)}` : 'disponível'}</div>
            </div>
            <button disabled={busy || !!sc.mission} onClick={() => send({ type: 'sendScout', id: sc.id, region, months })}>Enviar</button>
          </div>
          {sc.reports.map((r) => {
            const p = names.get(r.playerId);
            return p ? (
              <div class="list-row" key={r.playerId} onClick={() => open(r.playerId)} style="cursor:pointer">
                <span class="pos">{p.pos}</span>
                <div class="grow"><b>{p.name}</b><div class="tiny muted">{p.club?.name ?? 'Sem clube'} • {p.age} anos • estimativa POT {r.pot}</div></div>
                <span class={`ovr ${tier(r.ovr)}`}>~{r.ovr}</span>
              </div>
            ) : null;
          })}
        </section>
      ))}
      {!b.scouts.length && <p class="muted">Nenhum olheiro contratado.</p>}
    </>
  );
}

const OUT: Record<string, [string, string]> = { win: ['V', 'ok-text'], draw: ['E', 'muted'], loss: ['D', 'danger-text'] };

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <section class="card">
      <div class={`metric ${value < 35 ? 'danger-text' : value >= 70 ? 'ok-text' : ''}`}>{value}%</div>
      <div class="metric-label">{label}</div>
      <div class="bar"><span style={{ width: `${value}%` }} /></div>
    </section>
  );
}

function Board({ view, busy, send }: { view: View; busy: boolean; send: Send }) {
  const b = view.board;
  return (
    <>
      <div class="page-head">
        <h1>Diretoria</h1>
        <p class="muted">A confiança depende dos objetivos, dos últimos resultados e do caixa. Avaliação no fim de cada liga.</p>
      </div>
      {b.sacked && <section class="card danger-text"><b>Você foi demitido.</b> Escolha um novo clube para continuar a carreira.</section>}
      {b.jobOffers.length > 0 && (
        <section class="card">
          <h3>Propostas de emprego</h3>
          {b.jobOffers.map((o) => (
            <div class="list-row" key={o.club.id}>
              <div class="grow"><b>{o.club.name}</b><div class="tiny muted">Reputação {o.rep} • até {fmtDate(o.expires)}</div></div>
              <button disabled={busy} onClick={() => confirm(`Assumir o ${o.club.name}? Você deixa o clube atual.`) && send({ type: 'takeJob', clubId: o.club.id })}>Assumir</button>
              {!(b.sacked && b.jobOffers.length === 1) && <button class="ghost" disabled={busy} onClick={() => send({ type: 'declineJob', clubId: o.club.id })}>Recusar</button>}
            </div>
          ))}
        </section>
      )}
      <div class="grid metrics">
        <Meter label="Confiança da diretoria" value={b.clubConfidence} />
        <Meter label="Confiança da torcida" value={b.fanConfidence} />
        <section class="card"><div class="metric">{b.rating.toFixed(2)}</div><div class="metric-label">Sua nota (1–10)</div></section>
        <section class="card">
          <div class="metric">{b.record.wins}-{b.record.draws}-{b.record.losses}</div>
          <div class="metric-label">V-E-D na carreira</div>
          <div class="small">{b.recent.map((r, i) => <b key={i} class={OUT[r]![1]}>{OUT[r]![0]} </b>)}</div>
        </section>
      </div>
      <section class="card">
        <h3>Objetivos da temporada • avaliação atual {b.score}/100</h3>
        {b.objectives.map((o) => (
          <div class="list-row" key={o.title}>
            <div class="grow"><b>{o.title}</b><div class="tiny muted">Peso {o.weight}%</div><div class="bar"><span style={{ width: `${o.status}%` }} /></div></div>
            <b class={o.status < 50 ? 'danger-text' : o.status >= 90 ? 'ok-text' : ''}>{o.status}</b>
          </div>
        ))}
      </section>
      {b.history.length > 0 && (
        <section class="card">
          <h3>Histórico</h3>
          {b.history.map((h, i) => (
            <div class="list-row" key={i}>
              <div class="grow"><b>{h.season} • {h.club}</b></div>
              <span class="small">{h.position}º • {h.score}/100</span>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
