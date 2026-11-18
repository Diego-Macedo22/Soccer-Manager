/**
 * Evolução mensal dos jogadores (substitui v05DevelopmentMonth).
 *
 * Mantém a curva da v0.5 (idade, minutos, moral, forma, potencial), com três
 * diferenças:
 * - ganho de nível SEMPRE sobe o OVR em 1 (sobe atributos relevantes da posição);
 *   declínio sempre desce 1 — nunca há "ganho" que derruba o jogador (B17);
 * - minutos medidos como taxa (jogos ÷ jogos possíveis até agora), e não como
 *   número absoluto que deixava todos "inativos" no começo da temporada;
 * - emprestados não ganham jogos fictícios (o legado somava 1–4 por mês).
 * É determinística: mesmos dados, mesma evolução.
 */
import type { PlayerAttributes, Position } from '../squad/positions.ts';
import { ATTR_MAX, ATTR_MIN, OVR_MAX, OVR_MIN, attr, calibrateAttributes, computeOvr, weightedKeys, type AttributeKey } from './ratings.ts';

export interface DevelopingPlayer {
  pos: Position;
  age: number;
  ovr: number;
  /** Potencial. Acima dele a evolução fica duas vezes mais lenta. */
  pot: number;
  attrs: PlayerAttributes;
  form: number;
  morale: number;
  devProgress: number;
  declineProgress: number;
}

export interface MonthContext {
  /** Jogos disputados na temporada até agora. */
  appsThisSeason: number;
  /** Meses decorridos da temporada (≥ 1). */
  monthsIntoSeason: number;
  onLoan?: boolean;
}

const GAMES_PER_MONTH = 4;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function playRate(ctx: MonthContext): number {
  return clamp(ctx.appsThisSeason / Math.max(1, ctx.monthsIntoSeason * GAMES_PER_MONTH), 0, 1);
}

/** Pontos de evolução no mês (100 = +1 de OVR abaixo do potencial). */
export function growthPoints(p: DevelopingPlayer, ctx: MonthContext): number {
  const base = p.age <= 20 ? 30 : p.age <= 23 ? 25 : p.age <= 26 ? 19 : p.age <= 28 ? 12 : p.age <= 30 ? 5 : 0;
  if (base === 0) return 0;
  const loanBonus = ctx.onLoan && p.age <= 25 ? 9 : 0;
  const activity = clamp(0.35 + playRate(ctx) * 0.8 + (ctx.onLoan ? 0.25 : 0), 0.3, 1.35);
  return (base + loanBonus) * activity * (0.72 + (p.morale / 100) * 0.28) * (0.78 + (p.form / 100) * 0.22);
}

/** Pontos de declínio no mês (100 = −1 de OVR). Jogar com frequência e boa forma retardam o declínio. */
export function declinePoints(p: DevelopingPlayer, ctx: MonthContext): number {
  if (p.age < 30) return 0;
  const base = p.age === 30 ? 2 : p.age <= 33 ? 4 : p.age <= 36 ? 7 : 10;
  return base * (1 - playRate(ctx) * 0.65) * (p.form >= 78 ? 0.72 : 1);
}

/** Garante que o OVR guardado é o calculado pelos atributos (dados antigos são calibrados). */
export function ensureCoherent(p: DevelopingPlayer): void {
  if (computeOvr(p.attrs, p.pos) !== p.ovr) p.attrs = calibrateAttributes(p.attrs, p.pos, p.ovr);
  p.ovr = computeOvr(p.attrs, p.pos);
}

/** Muda um ponto de atributo por vez até o OVR andar exatamente 1. */
function step(p: DevelopingPlayer, dir: 1 | -1, groups: AttributeKey[][]): boolean {
  const target = p.ovr + dir;
  if (target > OVR_MAX || target < OVR_MIN) return false;
  for (let i = 0; i < 300 && computeOvr(p.attrs, p.pos) !== target; i++) {
    let k: AttributeKey | undefined;
    for (const group of groups) {
      const open = group.filter((key) => (dir > 0 ? attr(p.attrs, key) < ATTR_MAX : attr(p.attrs, key) > ATTR_MIN));
      // Subindo: o mais baixo do grupo (evolução equilibrada). Descendo: o mais alto.
      k = open.sort((x, y) => (dir > 0 ? attr(p.attrs, x) - attr(p.attrs, y) : attr(p.attrs, y) - attr(p.attrs, x)) || group.indexOf(x) - group.indexOf(y))[0];
      if (k) break;
    }
    if (!k) return false;
    p.attrs = { ...p.attrs, [k]: attr(p.attrs, k) + dir };
  }
  p.ovr = computeOvr(p.attrs, p.pos);
  return p.ovr === target;
}

/** +1 de OVR: evolui os 3 atributos mais importantes da posição; os demais só se esses estiverem no máximo. */
export function raiseOvr(p: DevelopingPlayer): boolean {
  const keys = weightedKeys(p.pos);
  return step(p, 1, [keys.slice(0, 3), keys]);
}

/** −1 de OVR: o declínio começa pelo físico (velocidade e força), depois os atributos principais. */
export function lowerOvr(p: DevelopingPlayer): boolean {
  const keys = weightedKeys(p.pos);
  const physical = (['vel', 'fis'] as AttributeKey[]).filter((k) => keys.includes(k));
  return step(p, -1, [physical, keys.slice(0, 3), keys]);
}

export interface MonthResult {
  before: number;
  after: number;
}

/** Aplica um mês de evolução/declínio. Muta o jogador. */
export function developMonth(p: DevelopingPlayer, ctx: MonthContext): MonthResult {
  ensureCoherent(p);
  const before = p.ovr;
  const gain = growthPoints(p, ctx);
  if (gain > 0) {
    p.devProgress += gain;
    for (;;) {
      const threshold = p.ovr >= p.pot ? 200 : 100;
      if (p.devProgress < threshold || p.ovr >= OVR_MAX) break;
      p.devProgress -= threshold;
      if (!raiseOvr(p)) break;
    }
  }
  const loss = declinePoints(p, ctx);
  if (loss > 0) {
    p.declineProgress += loss;
    while (p.declineProgress >= 100 && p.ovr > OVR_MIN) {
      p.declineProgress -= 100;
      if (!lowerOvr(p)) break;
    }
  }
  return { before, after: p.ovr };
}
