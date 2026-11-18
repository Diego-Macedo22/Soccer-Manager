/**
 * Interface do manager. Não guarda regra de jogo: envia comandos ao Worker e
 * desenha a `View` que ele devolve. Estado de tela (aba, seleção para troca)
 * vive aqui e nunca vai para o save (B5). Todo texto é renderizado pelo Preact,
 * que escapa HTML (B14).
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ClubOption, Command, CompetitionView, FixtureView, PlayerView, Reply, View } from './protocol.ts';

const brl = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(n);
const fmtDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
const tier = (ovr: number) => (ovr >= 85 ? 'special' : ovr >= 78 ? 'gold' : ovr >= 70 ? 'silver' : 'bronze');

type Tab = 'painel' | 'elenco' | 'competicoes' | 'financas';
const TABS: [Tab, string, string][] = [
  ['painel', 'Painel', '🏠'],
  ['elenco', 'Elenco', '📋'],
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

  on((r) => {
    if (r.type === 'init') {
      setClubs(r.clubs);
      setHasSave(r.hasSave);
    } else if (r.type === 'view') {
      setView(r.view);
      if (r.toast) setToast(r.toast);
    } else setToast(r.message);
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
        <button class="primary continue" disabled={busy} onClick={() => send({ type: 'continue' })}>
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
        {tab === 'painel' && <Dashboard view={view} busy={busy} send={send} />}
        {tab === 'elenco' && <Squad view={view} busy={busy} send={send} />}
        {tab === 'competicoes' && <Competitions view={view} />}
        {tab === 'financas' && <Finances view={view} />}
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
          <h3>Últimos resultados</h3>
          {view.results.length ? view.results.map((f) => <FixtureLine key={f.id} f={f} />) : <p class="muted">A temporada ainda não começou.</p>}
        </section>
        <section class="card span2">
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
