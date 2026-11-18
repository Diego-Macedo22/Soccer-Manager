/**
 * OVR a partir dos atributos, com pesos por posição.
 *
 * Causa de B17: o legado recalculava o OVR como média simples dos 6 atributos,
 * mas os atributos foram gerados com perfil de posição (atacante com marcação
 * baixa, goleiro com finalização 20…). A média ficava em média 4,3 pontos
 * abaixo do OVR cadastrado (8 pontos nos goleiros), e o primeiro "ganho" de
 * evolução derrubava o jogador. Aqui o OVR é uma média ponderada pela posição,
 * e `calibrateAttributes` ajusta os atributos importados para reproduzir o OVR
 * cadastrado exatamente.
 */
import type { PlayerAttributes, Position } from '../squad/positions.ts';

export const ATTRIBUTE_KEYS = ['vel', 'fin', 'pas', 'dri', 'def', 'fis', 'gk'] as const;
export type AttributeKey = (typeof ATTRIBUTE_KEYS)[number];

export const ATTR_MIN = 20;
export const ATTR_MAX = 99;
export const OVR_MIN = 40;
export const OVR_MAX = 99;

/** Pesos por posição (somam 1). O goleiro mantém a fórmula da v0.4: (2·gk + pas + fis + vel) / 5. */
export const POSITION_WEIGHTS: Record<Position, Partial<Record<AttributeKey, number>>> = {
  GOL: { gk: 0.4, pas: 0.2, fis: 0.2, vel: 0.2 },
  ZAG: { def: 0.45, fis: 0.25, pas: 0.15, vel: 0.1, dri: 0.05 },
  LD: { def: 0.3, vel: 0.25, pas: 0.2, fis: 0.15, dri: 0.1 },
  LE: { def: 0.3, vel: 0.25, pas: 0.2, fis: 0.15, dri: 0.1 },
  VOL: { def: 0.35, pas: 0.3, fis: 0.2, dri: 0.1, vel: 0.05 },
  MC: { pas: 0.35, dri: 0.2, def: 0.15, fis: 0.1, fin: 0.1, vel: 0.1 },
  MLE: { vel: 0.25, pas: 0.25, dri: 0.25, def: 0.1, fin: 0.1, fis: 0.05 },
  MLD: { vel: 0.25, pas: 0.25, dri: 0.25, def: 0.1, fin: 0.1, fis: 0.05 },
  MAT: { pas: 0.3, dri: 0.3, fin: 0.25, vel: 0.1, fis: 0.05 },
  SA: { fin: 0.35, dri: 0.25, pas: 0.2, vel: 0.15, fis: 0.05 },
  PE: { vel: 0.3, dri: 0.3, fin: 0.2, pas: 0.15, fis: 0.05 },
  PD: { vel: 0.3, dri: 0.3, fin: 0.2, pas: 0.15, fis: 0.05 },
  ATA: { fin: 0.45, vel: 0.2, dri: 0.15, fis: 0.15, pas: 0.05 },
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function attr(a: PlayerAttributes, k: AttributeKey): number {
  return a[k] ?? 50;
}

/** Atributos que contam para a posição, do mais ao menos importante. */
export function weightedKeys(pos: Position): AttributeKey[] {
  const w = POSITION_WEIGHTS[pos];
  return ATTRIBUTE_KEYS.filter((k) => (w[k] ?? 0) > 0).sort((a, b) => (w[b] ?? 0) - (w[a] ?? 0));
}

/** Valor não arredondado (útil para saber quanto falta para o próximo ponto). */
export function weightedRating(a: PlayerAttributes, pos: Position): number {
  const w = POSITION_WEIGHTS[pos];
  let sum = 0;
  for (const k of ATTRIBUTE_KEYS) sum += (w[k] ?? 0) * attr(a, k);
  return sum;
}

export function computeOvr(a: PlayerAttributes, pos: Position): number {
  return clamp(Math.round(weightedRating(a, pos)), OVR_MIN, OVR_MAX);
}

/**
 * Ajusta os atributos para que `computeOvr` dê exatamente `targetOvr`, mantendo
 * o perfil do jogador (desloca todos os atributos relevantes por igual e depois
 * acerta o arredondamento um ponto por vez).
 */
export function calibrateAttributes(a: PlayerAttributes, pos: Position, targetOvr: number): PlayerAttributes {
  const target = clamp(Math.round(targetOvr), OVR_MIN, OVR_MAX);
  const keys = weightedKeys(pos);
  const out: PlayerAttributes = { ...a };
  if (keys.includes('gk') && out.gk === undefined) out.gk = 50;
  const shift = Math.round(target - weightedRating(out, pos));
  for (const k of keys) out[k] = clamp(attr(out, k) + shift, ATTR_MIN, ATTR_MAX);
  const w = POSITION_WEIGHTS[pos];
  for (let i = 0; i < 500 && computeOvr(out, pos) !== target; i++) {
    const up = computeOvr(out, pos) < target;
    const k = keys
      .filter((key) => (up ? attr(out, key) < ATTR_MAX : attr(out, key) > ATTR_MIN))
      .sort((x, y) => (up ? attr(out, x) - attr(out, y) : attr(out, y) - attr(out, x)) || (w[y] ?? 0) - (w[x] ?? 0))[0];
    if (!k) break;
    out[k] = attr(out, k) + (up ? 1 : -1);
  }
  return out;
}
