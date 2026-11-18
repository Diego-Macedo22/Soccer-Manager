/**
 * Mercado e categoria de base: regras puras, portadas da v0.5.
 *
 * Fórmulas do legado preservadas: chance de aceitar compra
 * (`.18 + razão × .62 + bônus`), empréstimo por 4% do valor, propostas
 * recebidas entre 80% e 125% do valor, relatórios da base a cada 90 dias com
 * 5–8 jovens de 14–18 anos e OVR/POT ligados ao nível da instalação (1–10).
 */
import type { IsoDate } from '../dates.ts';
import type { Rng } from '../rng.ts';
import type { PlayerAttributes, Position } from '../squad/positions.ts';

export const ACADEMY_MAX_LEVEL = 10;
export const ACADEMY_LIMIT = 45;
export const YOUTH_INTAKE_DAYS = 90;
export const MIN_SQUAD = 16;
export const MAX_SQUAD = 40;
export const LOAN_FEE_RATE = 0.04;
export const MAX_OFFERS = 6;
export const OFFER_DAYS = 14;

export type OfferType = 'sale' | 'loan';

/** Proposta de outro clube por um jogador do usuário. */
export interface IncomingOffer {
  id: string;
  playerId: string;
  fromClubId: string;
  type: OfferType;
  value: number;
  expires: IsoDate;
}

export interface YouthCandidate {
  id: string;
  name: string;
  age: number;
  pos: Position;
  ovr: number;
  pot: number;
  attrs: PlayerAttributes;
}

export interface Loan {
  playerId: string;
  /** Dono do jogador. */
  from: string;
  to: string;
  /** Volta ao dono na primeira abertura de temporada do clube que o recebeu, passados 60 dias. */
  since: IsoDate;
}

export interface MarketState {
  offers: IncomingOffer[];
  loans: Loan[];
  /** Jogadores criados durante a carreira (base): nome e posições, que não estão na base estática. */
  extra: Record<string, { name: string; positions: Position[] }>;
  academy: { level: number; lastIntake: IsoDate | null; candidates: YouthCandidate[]; roster: string[] };
  /** Contador para ids estáveis. */
  seq: number;
}

export function createMarket(): MarketState {
  return { offers: [], loans: [], extra: {}, academy: { level: 1, lastIntake: null, candidates: [], roster: [] }, seq: 0 };
}

/** Janelas de transferência: janeiro e julho (como na v0.5). */
export function transferWindowOpen(date: IsoDate): boolean {
  const m = Number(date.slice(5, 7));
  return m === 1 || m === 7;
}

/** Valor de mercado: cresce com o OVR, com prêmio para potencial em jovens e desconto para veteranos. */
export function marketValue(p: { ovr: number; pot: number; age: number }): number {
  const base = Math.max(0, p.ovr - 35) ** 2 * 12_000;
  const youth = p.age <= 23 ? 1 + Math.max(0, p.pot - p.ovr) * 0.025 : 1;
  const old = p.age >= 30 ? Math.max(0.35, 1 - (p.age - 29) * 0.12) : 1;
  return Math.round((base * youth * old) / 10_000) * 10_000;
}

/** Salário pedido (mensal) por um jogador do OVR dado. */
export function wageDemand(ovr: number): number {
  return Math.round((ovr * ovr * 2.5 * (ovr >= 75 ? 1.6 : 1)) / 100) * 100;
}

/** Chance do clube vendedor aceitar a oferta (fórmula da v0.5). */
export function buyChance(offer: number, ask: number, p: { contract: number }): number {
  const ratio = ask > 0 ? offer / ask : 2;
  return Math.max(0.04, Math.min(0.93, 0.18 + ratio * 0.62 + (p.contract <= 1 ? 0.08 : 0)));
}

export function academyUpgradeCost(level: number): number {
  return level >= ACADEMY_MAX_LEVEL ? 0 : 2_000_000 + level * 1_750_000;
}

export function youthIntakeDue(a: MarketState['academy'], date: IsoDate): boolean {
  return !a.lastIntake || (Date.parse(date) - Date.parse(a.lastIntake)) / 86_400_000 >= YOUTH_INTAKE_DAYS;
}

/** OVR e POT de um jovem do relatório (fórmulas da v0.5). */
export function youthRatings(rng: Rng, level: number): { age: number; ovr: number; pot: number } {
  const ovr = Math.max(45, Math.min(65, rng.int(45, 57) + Math.floor(level * 0.8)));
  const pot = Math.max(40, Math.min(99, ovr + rng.int(0, 34) + Math.floor(level * 1.2)));
  return { age: rng.int(14, 18), ovr, pot };
}
