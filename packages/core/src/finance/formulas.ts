/**
 * Fórmulas de receita, iguais às da v0.5 (v04GateIncome e v04EconomyBetween),
 * para preservar o equilíbrio econômico que já existia.
 */

export interface StadiumContext {
  capacity: number;
  fanbase: number;
  homeRep: number;
  awayRep: number;
  /** Confiança da torcida, 0–100. */
  fanConfidence: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Taxa de ocupação: torcida confiante e adversário grande enchem o estádio. */
export function occupancy(c: StadiumContext): number {
  return clamp(0.48 + (c.fanConfidence / 100) * 0.48 + (c.awayRep - c.homeRep) / 400, 0.35, 1);
}

export function attendance(c: StadiumContext): number {
  return Math.round(Math.min(c.capacity, c.fanbase * 0.015) * occupancy(c));
}

export function ticketPrice(homeRep: number): number {
  return Math.round(55 + homeRep * 0.5);
}

export function gateIncome(c: StadiumContext): { attendance: number; ticket: number; income: number } {
  const a = attendance(c);
  const ticket = ticketPrice(c.homeRep);
  return { attendance: a, ticket, income: a * ticket };
}

/** Receita semanal de produtos e camisas. */
export function weeklyMerchandise(fanbase: number, fanConfidence: number): number {
  return Math.round(fanbase * (0.012 + (0.018 * fanConfidence) / 100));
}

/** Aporte da diretoria a cada nova temporada (35% do orçamento-base do clube). */
export function seasonGrant(clubBaseBudget: number): number {
  return Math.round(clubBaseBudget * 0.35);
}
