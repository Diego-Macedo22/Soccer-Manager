/**
 * Posições e adaptação, portadas da v0.3 (adaptationScore/canPlay/effectiveOvr),
 * para manter a mesma sensação de "improvisar fora da posição".
 */

export const POSITIONS = ['GOL', 'ZAG', 'LD', 'LE', 'VOL', 'MC', 'MLE', 'MLD', 'MAT', 'SA', 'PE', 'PD', 'ATA'] as const;
export type Position = (typeof POSITIONS)[number];

export type Zone = 'gk' | 'def' | 'flank' | 'mid' | 'att';

export const ZONE: Record<Position, Zone> = {
  GOL: 'gk',
  ZAG: 'def',
  LD: 'flank',
  LE: 'flank',
  VOL: 'mid',
  MC: 'mid',
  MLE: 'flank',
  MLD: 'flank',
  MAT: 'mid',
  SA: 'att',
  PE: 'att',
  PD: 'att',
  ATA: 'att',
};

const ADJACENT: Record<Exclude<Zone, 'gk'>, Zone[]> = {
  def: ['flank', 'mid'],
  flank: ['def', 'mid', 'att'],
  mid: ['def', 'flank', 'att'],
  att: ['flank', 'mid'],
};

export interface PlayerAttributes {
  vel: number;
  fin: number;
  pas: number;
  dri: number;
  def: number;
  fis: number;
  gk?: number;
}

/** O que o elenco precisa saber de um jogador (o modelo completo vem do módulo de dados). */
export interface SquadPlayer {
  id: string;
  name: string;
  clubId: string;
  /** Posição principal. */
  pos: Position;
  /** Posições em que joga sem perda (inclui a principal). */
  positions: Position[];
  ovr: number;
  attrs: PlayerAttributes;
  form: number;
  morale: number;
  fitness: number;
  injuredUntil: string | null;
}

const NOT_ALLOWED = -99;

/** 1 = posição natural, 0 = secundária, −1 a −5 = improviso, −99 = proibido (goleiro ↔ linha). */
export function adaptation(p: Pick<SquadPlayer, 'pos' | 'positions' | 'attrs'>, slot: Position): number {
  if (slot === 'GOL') return p.pos === 'GOL' ? 1 : NOT_ALLOWED;
  if (p.pos === 'GOL') return NOT_ALLOWED;
  if (p.pos === slot) return 1;
  if (p.positions.includes(slot)) return 0;
  const from = ZONE[p.pos] as Exclude<Zone, 'gk'>;
  const to = ZONE[slot];
  let pen = from === to ? -1 : ADJACENT[from].includes(to) ? -3 : -5;
  const a = p.attrs;
  if (['LD', 'LE', 'MLE', 'MLD', 'PE', 'PD'].includes(slot) && a.vel >= 75) pen += 1;
  if (['VOL', 'ZAG'].includes(slot) && a.def >= 74) pen += 1;
  if (['MAT', 'SA', 'ATA'].includes(slot) && a.fin >= 74) pen += 1;
  if (['MC', 'MAT', 'VOL'].includes(slot) && a.pas >= 74) pen += 1;
  return Math.max(-5, Math.min(0, pen));
}

export function canPlay(p: Pick<SquadPlayer, 'pos' | 'positions' | 'attrs'>, slot: Position): boolean {
  return adaptation(p, slot) > NOT_ALLOWED;
}

/** OVR na função (o mesmo número mostrado na tela de táticas do legado). */
export function effectiveOvr(p: Pick<SquadPlayer, 'pos' | 'positions' | 'attrs' | 'ovr'>, slot: Position): number {
  return Math.max(40, Math.min(99, p.ovr + adaptation(p, slot)));
}

/** Multiplicador de rendimento na função (usado pelos modelos de partida). */
export function positionFit(p: Pick<SquadPlayer, 'pos' | 'positions' | 'attrs' | 'ovr'>, slot: Position): number {
  return effectiveOvr(p, slot) / Math.max(1, p.ovr);
}

export function isAvailable(p: Pick<SquadPlayer, 'injuredUntil'>, date: string): boolean {
  return p.injuredUntil == null || p.injuredUntil < date;
}
