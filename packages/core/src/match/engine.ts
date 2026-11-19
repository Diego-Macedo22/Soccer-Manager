/**
 * Motor de partida (Fase 4): cadeias de posse com espaço contínuo.
 *
 * A simulação decide; a visualização representa. O motor gera uma linha do
 * tempo de eventos (tempo em segundos, posição da bola, jogador, tipo). Placar,
 * estatísticas, notas e narração são derivados dos eventos (corrige B9), e o
 * visualizador reconstrói as posições dos 22 jogadores a partir da bola
 * (`positionsAt`). Mesma seed + mesmas entradas + mesmas mudanças = mesma partida.
 *
 * Campo 105 × 68. Coordenadas absolutas: o mandante ataca para x = 105.
 */
import { createRng, type Rng } from '../rng.ts';
import { FORMATIONS } from '../squad/formations.ts';
import type { PlayerAttributes, Position } from '../squad/positions.ts';

export const MATCH_VERSION = 2;
export const PITCH = { w: 105, h: 68 } as const;
export const MAX_SUBS = 5;
/** Janelas de substituição fora do intervalo (regra IFAB desde 2022). */
export const MAX_SUB_WINDOWS = 3;
/** Chance de lesão por minuto, por time (cerca de 0,14 por time e por jogo; as leves são a maioria). */
export const INJURY_PER_MINUTE = 0.0015;

/** −2 ultradefensivo … +2 ultraofensivo (5 níveis, como na v0.5). */
export type Mentality = -2 | -1 | 0 | 1 | 2;
export const MENTALITIES: Record<Mentality, string> = { [-2]: 'Ultradefensivo', [-1]: 'Defensivo', 0: 'Equilibrado', 1: 'Ofensivo', 2: 'Ultraofensivo' };

export interface Tactics {
  mentality: Mentality;
  /** 0–100 */
  pressing: number;
  /** 0–100: altura da linha defensiva. */
  line: number;
  /** 0–100: ritmo (posse paciente × jogo direto). */
  tempo: number;
}

export const DEFAULT_TACTICS: Tactics = { mentality: 0, pressing: 55, line: 50, tempo: 55 };

export interface MatchPlayer {
  id: string;
  name: string;
  pos: Position;
  attrs: PlayerAttributes;
  ovr: number;
  fitness: number;
  morale: number;
}

export interface MatchTeam {
  clubId: string;
  formation: string;
  /** 11 titulares, na ordem dos slots da formação. */
  xi: MatchPlayer[];
  bench: MatchPlayer[];
  tactics: Tactics;
}

export interface MatchInput {
  seed: number | string;
  home: MatchTeam;
  away: MatchTeam;
  /** Jogo em campo neutro (final única): sem vantagem de mando. */
  neutral?: boolean;
  /** Lados controlados pelo usuário: sem substituições automáticas. */
  manual?: Side[];
}

/** Mudança feita durante o jogo (pelo usuário ou pela IA). */
export type MatchChange =
  | { minute: number; side: Side; type: 'sub'; out: string; in: string }
  | { minute: number; side: Side; type: 'tactics'; tactics: Partial<Tactics> }
  | { minute: number; side: Side; type: 'formation'; formation: string };

export type Side = 'home' | 'away';

export type EventType =
  | 'kickoff' | 'pass' | 'through' | 'cross' | 'long' | 'dribble' | 'tackle' | 'intercept' | 'shot' | 'save' | 'miss' | 'post'
  | 'goal' | 'foul' | 'yellow' | 'red' | 'corner' | 'penalty' | 'sub' | 'tactics' | 'halftime' | 'fulltime' | 'injury';

export interface MatchEvent {
  /** Segundos de jogo corrido (o 2º tempo começa em 45 × 60). */
  t: number;
  type: EventType;
  side: Side;
  /** Autor (ou quem sofreu, no caso de falta). */
  player?: string;
  /** Segundo jogador: recebedor do passe, assistente do gol, quem desarmou, quem saiu; na troca de formação, a nova formação. */
  other?: string;
  /** Posição da bola ao fim da ação. */
  x: number;
  y: number;
  xg?: number;
  /** Marcar como lance de melhores momentos (0–1). */
  weight?: number;
}

export interface MatchStats {
  goals: number;
  shots: number;
  onTarget: number;
  xg: number;
  passes: number;
  passesOk: number;
  possession: number;
  corners: number;
  fouls: number;
  yellows: number;
  reds: number;
}

export interface MatchTimeline {
  version: number;
  events: MatchEvent[];
  score: { home: number; away: number };
  stats: Record<Side, MatchStats>;
  /** Nota 3–10 por jogador que entrou em campo. */
  ratings: Record<string, number>;
  /** Escalação em campo ao fim (após substituições e expulsões). */
  final: Record<Side, string[]>;
  /** Segundo em que começa o 2º tempo (após os acréscimos do 1º). */
  secondHalfStart: number;
  duration: number;
}

/** Minuto exibido no relógio (45+ nos acréscimos do 1º tempo). */
export function clockMinute(t: number, secondHalfStart: number): number {
  return t < secondHalfStart ? Math.min(45, Math.floor(t / 60)) : Math.min(90, 45 + Math.floor((t - secondHalfStart) / 60));
}

/** Texto do relógio: 12', 45+2', 90+4'. */
export function clockLabel(t: number, secondHalfStart: number): string {
  if (t < secondHalfStart) return t >= HALF ? `45+${Math.floor((t - HALF) / 60) + 1}'` : `${Math.floor(t / 60) + 1}'`;
  const m = (t - secondHalfStart) / 60;
  return m >= 45 ? `90+${Math.floor(m - 45) + 1}'` : `${Math.floor(m) + 46}'`;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');
const HALF = 45 * 60;

interface Live {
  team: MatchTeam;
  onPitch: (MatchPlayer & { slot: number; energy: number; yellow: boolean })[];
  bench: MatchPlayer[];
  subs: number;
  windows: Set<number>;
  tactics: Tactics;
  formation: string;
}

/** Fator de energia sobre os atributos: 100% → 1; 40% → 0,85. */
const energyFactor = (e: number) => 0.75 + 0.25 * (e / 100);

function attr(p: Live['onPitch'][number], k: keyof PlayerAttributes): number {
  const v = (k === 'gk' ? (p.attrs.gk ?? 30) : p.attrs[k]) as number;
  return v * energyFactor(p.energy) * (0.97 + (p.morale - 50) / 1000);
}

/** Âncora tática (coordenadas absolutas) de um slot, dada a posição da bola. */
export function anchor(formation: string, slot: number, side: Side, ballX: number, ballY: number, attacking: boolean, line = 50): { x: number; y: number } {
  const def = (FORMATIONS[formation] ?? FORMATIONS['4-2-3-1']!)[slot];
  if (!def) return { x: PITCH.w / 2, y: PITCH.h / 2 };
  // Profundidade no próprio campo (0 = linha do próprio gol) e largura.
  let depth = ((100 - def.y) / 100) * PITCH.w;
  const width = (def.x / 100) * PITCH.h;
  const prog = side === 'home' ? ballX : PITCH.w - ballX;
  if (def.pos !== 'GOL') {
    // O bloco acompanha a bola: compacto, mais alto atacando e com a linha escolhida.
    depth = depth * 0.62 + prog * 0.42 + (attacking ? 6 : -4) + (line - 50) * 0.12;
    depth = clamp(depth, 4, PITCH.w - 4);
  } else depth = clamp(4 + Math.max(0, prog - 60) * 0.06, 2, 12);
  const y = def.pos === 'GOL' ? PITCH.h / 2 : width * 0.85 + (side === 'home' ? ballY : PITCH.h - ballY) * 0.15;
  const x = side === 'home' ? depth : PITCH.w - depth;
  return { x, y: side === 'home' ? y : PITCH.h - y };
}

/** Roda a partida inteira (com as mudanças já conhecidas). */
export function simulateMatch(input: MatchInput, changes: readonly MatchChange[] = []): MatchTimeline {
  const rng: Rng = createRng(input.seed).derive('match');
  // Lesões têm fluxo próprio: uma partida sem lesão é idêntica à de antes delas.
  const injuryRng: Rng = createRng(input.seed).derive('injury');
  const live: Record<Side, Live> = {
    home: start(input.home),
    away: start(input.away),
  };
  const events: MatchEvent[] = [];
  const score = { home: 0, away: 0 };
  const possessionTime = { home: 0, away: 0 };
  const pending = [...changes].sort((a, b) => a.minute - b.minute);
  const stoppage1 = rng.int(1, 4) * 60;
  const stoppage2 = rng.int(2, 7) * 60;
  let secondStart = HALF + stoppage1;
  let end = secondStart + HALF + stoppage2;

  let side: Side = 'home';
  let t = 0;
  let ball = { x: PITCH.w / 2, y: PITCH.h / 2 };
  let carrier = pickCarrier(live[side], side, ball.x, rng);
  let half = 1;
  const push = (e: Omit<MatchEvent, 'x' | 'y'> & { x?: number; y?: number }) => events.push({ x: ball.x, y: ball.y, ...e });
  push({ t, type: 'kickoff', side, player: carrier.id });

  const applyChanges = (minute: number) => {
    while (pending.length && pending[0]!.minute <= minute) {
      const c = pending.shift()!;
      const L = live[c.side];
      if (c.type === 'tactics') {
        L.tactics = { ...L.tactics, ...c.tactics };
        push({ t, type: 'tactics', side: c.side });
      } else if (c.type === 'formation' && FORMATIONS[c.formation]) {
        L.formation = c.formation;
        push({ t, type: 'tactics', side: c.side, other: c.formation });
      } else if (c.type === 'sub') doSub(L, c.side, c.out, c.in, c.minute, t);
    }
  };

  const doSub = (L: Live, s: Side, outId: string, inId: string, minute: number, at: number) => {
    const i = L.onPitch.findIndex((p) => p.id === outId);
    const b = L.bench.findIndex((p) => p.id === inId);
    const window = at === secondStart ? -1 : minute; // intervalo não conta como janela
    const newWindow = window !== -1 && !L.windows.has(window);
    if (i < 0 || b < 0 || L.subs >= MAX_SUBS || (newWindow && L.windows.size >= MAX_SUB_WINDOWS)) return;
    const incoming = L.bench.splice(b, 1)[0]!;
    const slot = L.onPitch[i]!.slot;
    L.onPitch[i] = { ...incoming, slot, energy: incoming.fitness, yellow: false };
    L.subs++;
    if (window !== -1) L.windows.add(window);
    push({ t: at, type: 'sub', side: s, player: inId, other: outId });
  };

  while (t < end) {
    const minute = clockMinute(t, half === 1 ? Infinity : secondStart);
    applyChanges(half === 1 ? Math.min(44, minute) : minute);
    autoSubs(live, rng, minute, t, doSub, input, side);
    const L = live[side];
    const D = live[other(side)];
    const dir = side === 'home' ? 1 : -1;
    const prog = side === 'home' ? ball.x : PITCH.w - ball.x;
    const m = L.tactics.mentality;
    const homeEdge = input.neutral ? 0 : side === 'home' ? 0.8 : -0.8;
    const pressure = (D.tactics.pressing - 50) * 0.12 + (D.onPitch.length - L.onPitch.length) * 4;
    const dt = rng.int(3, 7) * (1.25 - L.tactics.tempo / 200);
    t += dt;
    possessionTime[side] += dt;
    for (const s of ['home', 'away'] as const) {
      for (const p of live[s].onPitch) p.energy = clamp(p.energy - dt / 60 * (0.28 + live[s].tactics.pressing / 400) * (1.2 - attrOf(p, 'fis') / 250), 20, 100);
    }
    for (const s of ['home', 'away'] as const) {
      if (!injuryRng.chance(INJURY_PER_MINUTE * dt / 60)) continue;
      const T = live[s];
      // Goleiro e quem está com a bola ficam de fora (o lance segue).
      const pool = T.onPitch.filter((p) => p.pos !== 'GOL' && p.id !== carrier.id && !p.id.startsWith('vazio-'));
      if (!pool.length) continue;
      const victim = injuryRng.pick(pool);
      push({ t, type: 'injury', side: s, player: victim.id, weight: 0.5 });
      // Troca automática pelo melhor reserva da posição; sem trocas disponíveis, o time fica com um a menos.
      const repl = T.bench.filter((b) => b.pos !== 'GOL').sort((a, b) => Number(b.pos === victim.pos) - Number(a.pos === victim.pos) || b.ovr - a.ovr)[0];
      if (repl) doSub(T, s, victim.id, repl.id, minute, t);
      T.onPitch = T.onPitch.filter((p) => p.id !== victim.id);
    }

    if (half === 1 && t >= secondStart) {
      half = 2;
      // Lance em andamento no fim dos acréscimos (gol, escanteio) empurra o apito.
      secondStart = Math.max(secondStart, events[events.length - 1]!.t);
      end = secondStart + HALF + stoppage2;
      t = secondStart;
      push({ t, type: 'halftime', side });
      applyChanges(45);
      side = 'away';
      ball = { x: PITCH.w / 2, y: PITCH.h / 2 };
      carrier = pickCarrier(live[side], side, ball.x, rng);
      for (const s of ['home', 'away'] as const) for (const p of live[s].onPitch) p.energy = clamp(p.energy + 6, 0, 100);
      push({ t, type: 'kickoff', side, player: carrier.id });
      continue;
    }

    const dist = Math.hypot(PITCH.w - prog, (ball.y - PITCH.h / 2) * 0.9);
    const xgHere = shotXg(prog, ball.y);
    const flank = Math.abs(ball.y - PITCH.h / 2) > 20;
    const opts: [string, number][] = [
      ['pass', 5.5 - m * 0.4 + (L.tactics.tempo < 45 ? 1 : 0)],
      ['through', prog > 35 && prog < 88 ? 1.3 + m * 0.35 + L.tactics.tempo / 100 : 0],
      ['long', prog < 50 ? 0.7 + L.tactics.tempo / 120 - m * 0.1 : 0],
      ['dribble', 1.1 + attr(carrier, 'dri') / 70 + m * 0.15],
      ['cross', flank && prog > 72 ? 2.4 + m * 0.3 : 0],
      ['shot', dist < 30 ? (0.17 + xgHere * 3.5) * (1 + m * 0.22) : 0],
    ];
    const action = weighted(opts, rng);

    if (action === 'shot') {
      shoot(xgHere, false);
      continue;
    }
    if (action === 'cross') {
      const target = pickRole(L, ['ATA', 'SA', 'MAT', 'PE', 'PD', 'ZAG'], carrier.id, rng);
      const ok = rng.chance(clamp(0.3 + (attr(carrier, 'pas') - 60) / 180 - pressure / 200, 0.12, 0.55));
      ball = { x: side === 'home' ? rng.float(92, 101) : rng.float(4, 13), y: rng.float(24, 44) };
      push({ t, type: 'cross', side, player: carrier.id, other: ok ? target.id : undefined });
      if (ok && rng.chance(0.45)) {
        const head = clamp(0.05 + (attr(target, 'fis') + attr(target, 'fin') - 2 * avgDef(D)) / 900, 0.02, 0.14);
        const assister = carrier;
        carrier = target;
        shoot(head, false, assister.id);
      } else turnover(D, rng.chance(0.25) ? 'corner' : 'intercept');
      continue;
    }

    const defender = pickDefender(D, other(side), ball.x, rng);
    const defScore = attr(defender, 'def') + pressure * 2 + rng.float(-40, 40);
    let success: boolean;
    let gain: number;
    switch (action) {
      case 'pass':
        success = rng.chance(clamp(0.86 + (attr(carrier, 'pas') - attr(defender, 'def')) / 400 - pressure / 160 - prog / 1100 + homeEdge / 100, 0.6, 0.97));
        gain = rng.float(-4, 14) + m * 1.2;
        break;
      case 'through':
        success = rng.chance(clamp(0.38 + (attr(carrier, 'pas') - attr(defender, 'def')) / 320 - pressure / 220 + homeEdge / 100, 0.15, 0.7));
        gain = rng.float(14, 28);
        break;
      case 'long':
        success = rng.chance(clamp(0.44 + (attr(carrier, 'pas') - 65) / 220 - pressure / 300, 0.25, 0.62));
        gain = rng.float(22, 38);
        break;
      default: // dribble
        success = attr(carrier, 'dri') + attr(carrier, 'vel') / 3 + rng.float(-40, 40) + homeEdge * 2 > defScore + 22;
        gain = rng.float(4, 12);
    }
    const nx = clamp(ball.x + dir * gain, 1, PITCH.w - 1);
    const ny = clamp(ball.y + rng.float(-14, 14), 2, PITCH.h - 2);
    if (success) {
      ball = { x: nx, y: ny };
      const newProg = side === 'home' ? ball.x : PITCH.w - ball.x;
      if (action === 'dribble') push({ t, type: 'dribble', side, player: carrier.id });
      else {
        const receiver = pickCarrier(L, side, ball.x, rng, carrier.id);
        push({ t, type: action === 'pass' ? 'pass' : action === 'through' ? 'through' : 'long', side, player: carrier.id, other: receiver.id });
        // Bola em profundidade que sai limpa vira chance clara.
        if (action === 'through' && newProg > 80 && rng.chance(0.16)) {
          const assister = carrier;
          carrier = receiver;
          shoot(clamp(shotXg(newProg, ball.y) * 1.15, 0.05, 0.35), false, assister.id);
          continue;
        }
        carrier = receiver;
      }
      continue;
    }
    // Perdeu a bola: falta, desarme ou interceptação.
    const foulChance = action === 'dribble' ? 0.12 : 0.025;
    if (rng.chance(foulChance + D.tactics.pressing / 2000)) {
      const inBox = prog > 88 && Math.abs(ball.y - PITCH.h / 2) < 20;
      push({ t, type: 'foul', side, player: carrier.id, other: defender.id });
      card(D, other(side), defender);
      if (inBox && rng.chance(0.09)) {
        push({ t, type: 'penalty', side, player: carrier.id, weight: 0.8 });
        ball = { x: side === 'home' ? PITCH.w - 11 : 11, y: PITCH.h / 2 };
        const taker = pickRole(L, ['ATA', 'MAT', 'SA', 'PE', 'PD', 'MC'], '', rng);
        carrier = taker;
        shoot(0.76, true);
      } else if (prog > 70 && rng.chance(0.25)) {
        shoot(clamp(0.03 + (attr(carrier, 'fin') - 60) / 1000, 0.02, 0.09), false);
      }
      continue;
    }
    push({ t, type: action === 'dribble' ? 'tackle' : 'intercept', side: other(side), player: defender.id, other: carrier.id, x: nx - dir * gain * 0.5, y: ny });
    ball = { x: nx - dir * gain * 0.5, y: ny };
    side = other(side);
    carrier = defender;
  }
  end = Math.max(end, events[events.length - 1]!.t);
  push({ t: end, type: 'fulltime', side });
  return finalize();

  function shoot(xg: number, penalty: boolean, assist?: string): void {
    const L = live[side];
    const D = live[other(side)];
    const gk = D.onPitch.find((p) => p.pos === 'GOL') ?? D.onPitch[0]!;
    const shooter = carrier;
    const q = clamp(xg * (1 + (attr(shooter, 'fin') - 70) / 150) * (1 - (attr(gk, 'gk') - 70) / 300), 0.01, 0.9);
    const onTarget = penalty || rng.chance(clamp(0.18 + attr(shooter, 'fin') / 500 + xg * 0.5, 0.2, 0.75));
    const goalX = side === 'home' ? PITCH.w : 0;
    if (onTarget && rng.chance(penalty ? q : q / clamp(0.18 + attr(shooter, 'fin') / 500 + xg * 0.5, 0.2, 0.75))) {
      score[side]++;
      // O chute fica onde foi batido (mapa de chutes); a bola leva um segundo até a rede.
      push({ t, type: 'shot', side, player: shooter.id, xg });
      ball = { x: goalX, y: PITCH.h / 2 + rng.float(-3, 3) };
      push({ t: t + 1, type: 'goal', side, player: shooter.id, other: assist, xg, weight: 1 });
      // Saída de bola do adversário no meio-campo.
      side = other(side);
      ball = { x: PITCH.w / 2, y: PITCH.h / 2 };
      carrier = pickCarrier(live[side], side, ball.x, rng);
      t += 30;
      push({ t, type: 'kickoff', side, player: carrier.id });
      void L;
      return;
    }
    push({ t, type: 'shot', side, player: shooter.id, xg });
    if (onTarget) {
      ball = { x: side === 'home' ? PITCH.w - 2 : 2, y: PITCH.h / 2 + rng.float(-4, 4) };
      push({ t, type: 'save', side: other(side), player: gk.id, other: shooter.id, xg, weight: xg > 0.25 ? 0.7 : 0.35 });
      if (rng.chance(0.35)) return turnover(D, 'corner');
      side = other(side);
      carrier = gk;
      return;
    }
    if (rng.chance(0.06)) push({ t, type: 'post', side, player: shooter.id, xg, weight: 0.6 });
    else push({ t, type: 'miss', side, player: shooter.id, xg, weight: xg > 0.3 ? 0.5 : 0 });
    ball = { x: side === 'home' ? PITCH.w - 5 : 5, y: PITCH.h / 2 };
    side = other(side);
    carrier = gk;
  }

  function turnover(D: Live, kind: 'corner' | 'intercept'): void {
    if (kind === 'corner') {
      const L = live[side];
      ball = { x: side === 'home' ? PITCH.w - 0.5 : 0.5, y: rng.chance(0.5) ? 0.5 : PITCH.h - 0.5 };
      push({ t, type: 'corner', side, player: carrier.id });
      // Escanteio: cruzamento na área, cabeceio contra a marcação.
      if (rng.chance(0.3)) {
        const target = pickRole(L, ['ZAG', 'ATA', 'VOL'], '', rng);
        const taker = carrier;
        carrier = target;
        ball = { x: side === 'home' ? rng.float(94, 100) : rng.float(5, 11), y: rng.float(28, 40) };
        t += 20;
        shoot(clamp(0.045 + (attr(target, 'fis') - avgDef(D)) / 800, 0.02, 0.11), false, taker.id);
        return;
      }
    }
    const d = pickDefender(D, other(side), ball.x, rng);
    push({ t, type: 'intercept', side: other(side), player: d.id });
    side = other(side);
    carrier = d;
  }

  function card(D: Live, s: Side, p: Live['onPitch'][number]): void {
    const r = rng.next();
    if (r < 0.003 || (r < 0.06 && p.yellow)) {
      push({ t, type: 'red', side: s, player: p.id, weight: 0.5 });
      D.onPitch = D.onPitch.filter((x) => x.id !== p.id);
    } else if (r < 0.19) {
      p.yellow = true;
      push({ t, type: 'yellow', side: s, player: p.id });
    }
  }

  function finalize(): MatchTimeline {
    const stats = { home: emptyStats(), away: emptyStats() };
    const total = possessionTime.home + possessionTime.away || 1;
    stats.home.possession = Math.round((possessionTime.home / total) * 100);
    stats.away.possession = 100 - stats.home.possession;
    const ratings: Record<string, number> = {};
    const bump = (id: string | undefined, v: number) => {
      if (id) ratings[id] = (ratings[id] ?? 6.2) + v;
    };
    for (const s of ['home', 'away'] as const) for (const p of [...input[s].xi]) ratings[p.id] = 6.2;
    for (const e of events) {
      const st = stats[e.side];
      switch (e.type) {
        case 'pass': case 'through': case 'long': st.passes++; st.passesOk++; bump(e.player, e.type === 'through' ? 0.05 : 0.01); break;
        case 'intercept': case 'tackle': stats[other(e.side)].passes += e.type === 'intercept' && e.other ? 1 : 0; bump(e.player, 0.08); bump(e.other, -0.03); break;
        case 'shot': st.shots++; st.xg += e.xg ?? 0; break;
        case 'save': stats[other(e.side)].onTarget++; bump(e.player, 0.25); break;
        case 'goal': st.goals++; st.onTarget++; bump(e.player, 1.1); bump(e.other, 0.6); for (const p of live[other(e.side)].onPitch) if (p.pos === 'GOL' || p.pos === 'ZAG') bump(p.id, -0.2); break;
        case 'corner': st.corners++; break;
        case 'foul': stats[other(e.side)].fouls++; break;
        case 'yellow': st.yellows++; bump(e.player, -0.3); break;
        case 'red': st.reds++; bump(e.player, -1.5); break;
        case 'dribble': bump(e.player, 0.05); break;
        case 'sub': ratings[e.player!] ??= 6.2; break;
        default: break;
      }
    }
    for (const s of ['home', 'away'] as const) {
      const won = score[s] > score[other(s)] ? 0.4 : score[s] < score[other(s)] ? -0.3 : 0;
      for (const p of [...input[s].xi, ...input[s].bench]) if (ratings[p.id] !== undefined) ratings[p.id] = Math.round(clamp(ratings[p.id]! + won, 3, 10) * 10) / 10;
      stats[s].xg = Math.round(stats[s].xg * 100) / 100;
    }
    return {
      version: MATCH_VERSION,
      events,
      score,
      stats,
      ratings,
      final: { home: live.home.onPitch.map((p) => p.id), away: live.away.onPitch.map((p) => p.id) },
      secondHalfStart: secondStart,
      duration: end,
    };
  }
}

function attrOf(p: MatchPlayer, k: keyof PlayerAttributes): number {
  return (k === 'gk' ? p.attrs.gk ?? 30 : p.attrs[k]) as number;
}

function start(team: MatchTeam): Live {
  return {
    team,
    onPitch: team.xi.map((p, slot) => ({ ...p, slot, energy: p.fitness, yellow: false })),
    bench: [...team.bench],
    subs: 0,
    windows: new Set(),
    tactics: { ...team.tactics },
    formation: team.formation,
  };
}

function emptyStats(): MatchStats {
  return { goals: 0, shots: 0, onTarget: 0, xg: 0, passes: 0, passesOk: 0, possession: 50, corners: 0, fouls: 0, yellows: 0, reds: 0 };
}

function weighted<T extends string>(opts: [T, number][], rng: Rng): T {
  const total = opts.reduce((s, [, w]) => s + Math.max(0, w), 0);
  let r = rng.next() * total;
  for (const [k, w] of opts) {
    r -= Math.max(0, w);
    if (r <= 0) return k;
  }
  return opts[0]![0];
}

/** xG de uma finalização pela distância e pelo ângulo. */
export function shotXg(prog: number, y: number): number {
  const dx = PITCH.w - prog;
  const dy = Math.abs(y - PITCH.h / 2);
  const dist = Math.hypot(dx, dy);
  const angle = Math.atan2(7.32 * dx, dx * dx + dy * dy - 13.4);
  return clamp(0.26 * Math.exp(-dist / 9) * (0.4 + Math.abs(angle)), 0.01, 0.5);
}

function zoneWeight(pos: Position, prog: number): number {
  const zone: Record<string, number> = { GOL: 5, ZAG: 22, LD: 32, LE: 32, VOL: 42, MC: 52, MLE: 55, MLD: 55, MAT: 66, SA: 74, PE: 72, PD: 72, ATA: 82 };
  const z = zone[pos] ?? 50;
  return Math.exp(-((z - prog) ** 2) / 700) + (pos === 'GOL' ? 0 : 0.05);
}

function pickCarrier(L: Live, side: Side, ballX: number, rng: Rng, exclude = ''): Live['onPitch'][number] {
  const prog = side === 'home' ? ballX : PITCH.w - ballX;
  const pool = L.onPitch.filter((p) => p.id !== exclude);
  const w = pool.map((p) => [p, zoneWeight(p.pos, prog) * (p.pos === 'GOL' && prog > 25 ? 0 : 1)] as const);
  const total = w.reduce((s, [, x]) => s + x, 0);
  let r = rng.next() * total;
  for (const [p, x] of w) {
    r -= x;
    if (r <= 0) return p;
  }
  return pool[0] ?? L.onPitch[0]!;
}

function pickDefender(D: Live, side: Side, ballX: number, rng: Rng): Live['onPitch'][number] {
  // Quem defende está na zona espelhada da bola.
  const prog = side === 'home' ? ballX : PITCH.w - ballX;
  return pickCarrier(D, side, side === 'home' ? prog : PITCH.w - prog, rng);
}

function pickRole(L: Live, roles: Position[], exclude: string, rng: Rng): Live['onPitch'][number] {
  const pool = L.onPitch.filter((p) => roles.includes(p.pos) && p.id !== exclude);
  if (!pool.length) return L.onPitch.filter((p) => p.pos !== 'GOL' && p.id !== exclude)[0] ?? L.onPitch[0]!;
  const w = pool.map((p) => [p, roles.length - roles.indexOf(p.pos) + p.attrs.fin / 40] as const);
  const total = w.reduce((s, [, x]) => s + x, 0);
  let r = rng.next() * total;
  for (const [p, x] of w) {
    r -= x;
    if (r <= 0) return p;
  }
  return pool[0]!;
}

function avgDef(D: Live): number {
  const out = D.onPitch.filter((p) => p.pos !== 'GOL');
  return out.reduce((s, p) => s + p.attrs.def, 0) / Math.max(1, out.length);
}

/**
 * Substituições automáticas da IA (e do usuário que não mexeu): a partir dos
 * 60', troca os mais cansados por reservas da mesma posição, em até 3 janelas.
 */
function autoSubs(live: Record<Side, Live>, rng: Rng, minute: number, t: number, doSub: (L: Live, s: Side, o: string, i: string, m: number, at: number) => void, input: MatchInput, _side: Side): void {
  if (minute < 58 || minute % 9 !== 0 || t % 60 > 8) return;
  for (const s of ['home', 'away'] as const) {
    if (input.manual?.includes(s)) continue;
    const L = live[s];
    if (L.subs >= MAX_SUBS || L.windows.size >= MAX_SUB_WINDOWS || L.windows.has(minute)) continue;
    const tired = L.onPitch.filter((p) => p.pos !== 'GOL' && p.energy < 62).sort((a, b) => a.energy - b.energy).slice(0, 2);
    for (const p of tired) {
      const repl = L.bench.filter((b) => b.pos !== 'GOL').sort((a, b) => Number(b.pos === p.pos) - Number(a.pos === p.pos) || b.ovr - a.ovr)[0];
      if (repl && rng.chance(0.85)) doSub(L, s, p.id, repl.id, minute, t);
    }
  }
}

/**
 * Posições dos 22 jogadores e da bola no instante `t` (para o visualizador).
 * A bola segue os eventos; os jogadores, as âncoras táticas.
 */
export function positionsAt(input: MatchInput, tl: MatchTimeline, t: number): { ball: { x: number; y: number }; players: { id: string; side: Side; x: number; y: number }[] } {
  const ev = tl.events;
  let i = 0;
  while (i < ev.length - 1 && ev[i + 1]!.t <= t) i++;
  const a = ev[i]!;
  const b = ev[i + 1] ?? a;
  const k = b.t > a.t ? clamp((t - a.t) / (b.t - a.t), 0, 1) : 0;
  const ball = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
  const attacking = b.side;
  const players: { id: string; side: Side; x: number; y: number }[] = [];
  for (const s of ['home', 'away'] as const) {
    const ids = lineupAt(input, tl, s, t);
    let formation = input[s].formation;
    for (const e of ev) {
      if (e.t > t) break;
      if (e.side === s && e.type === 'tactics' && e.other && FORMATIONS[e.other]) formation = e.other;
    }
    ids.forEach((id, slot) => {
      if (!id) return;
      const p = anchor(formation, slot, s, ball.x, ball.y, attacking === s, input[s].tactics.line);
      players.push({ id, side: s, ...p });
    });
  }
  // Quem está com a bola fica nela.
  const holder = players.find((p) => p.id === (b.type === 'pass' || b.type === 'through' || b.type === 'long' ? a.other ?? a.player : b.player));
  if (holder) {
    holder.x = ball.x + (holder.side === 'home' ? -1 : 1);
    holder.y = ball.y;
  }
  return { ball, players };
}

/** Quem ocupa cada slot no instante `t` (considera substituições, expulsões e lesões sem troca). */
function lineupAt(input: MatchInput, tl: MatchTimeline, s: Side, t: number): (string | null)[] {
  const ids: (string | null)[] = input[s].xi.map((p) => p.id);
  for (const e of tl.events) {
    if (e.t > t) break;
    if (e.side !== s) continue;
    if (e.type === 'sub') {
      const i = ids.indexOf(e.other!);
      if (i >= 0) ids[i] = e.player!;
    } else if (e.type === 'red' || (e.type === 'injury' && !tl.events.some((x) => x.t === e.t && x.type === 'sub' && x.other === e.player))) {
      const i = ids.indexOf(e.player!);
      if (i >= 0) ids[i] = null;
    }
  }
  return ids;
}
