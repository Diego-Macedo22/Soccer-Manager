/** Formações pré-definidas (mesmas coordenadas da v0.5; x/y em % do campo). */
import type { Position } from './positions.ts';

export interface SlotDef {
  pos: Position;
  x: number;
  y: number;
}

const s = (pos: Position, x: number, y: number): SlotDef => ({ pos, x, y });

export const FORMATIONS: Record<string, readonly SlotDef[]> = {
  '4-2-3-1': [s('GOL', 50, 91), s('LE', 17, 78), s('ZAG', 39, 80), s('ZAG', 61, 80), s('LD', 83, 78), s('VOL', 39, 63), s('VOL', 61, 63), s('PE', 18, 43), s('MAT', 50, 45), s('PD', 82, 43), s('ATA', 50, 19)],
  '4-3-3': [s('GOL', 50, 91), s('LE', 17, 78), s('ZAG', 39, 80), s('ZAG', 61, 80), s('LD', 83, 78), s('VOL', 50, 64), s('MC', 35, 51), s('MC', 65, 51), s('PE', 20, 29), s('PD', 80, 29), s('ATA', 50, 18)],
  '4-4-2': [s('GOL', 50, 91), s('LE', 17, 78), s('ZAG', 39, 80), s('ZAG', 61, 80), s('LD', 83, 78), s('MLE', 18, 52), s('MC', 40, 55), s('MC', 60, 55), s('MLD', 82, 52), s('ATA', 39, 23), s('ATA', 61, 23)],
  '3-5-2': [s('GOL', 50, 91), s('ZAG', 28, 78), s('ZAG', 50, 81), s('ZAG', 72, 78), s('MLE', 12, 56), s('VOL', 37, 61), s('MC', 63, 61), s('MLD', 88, 56), s('MAT', 50, 43), s('ATA', 38, 21), s('ATA', 62, 21)],
  '5-3-2': [s('GOL', 50, 91), s('LE', 11, 69), s('ZAG', 31, 79), s('ZAG', 50, 82), s('ZAG', 69, 79), s('LD', 89, 69), s('VOL', 50, 60), s('MC', 34, 48), s('MAT', 66, 48), s('ATA', 39, 21), s('ATA', 61, 21)],
  '4-1-4-1': [s('GOL', 50, 91), s('LE', 17, 78), s('ZAG', 39, 80), s('ZAG', 61, 80), s('LD', 83, 78), s('VOL', 50, 65), s('MLE', 18, 48), s('MC', 39, 51), s('MC', 61, 51), s('MLD', 82, 48), s('ATA', 50, 20)],
};

export const DEFAULT_FORMATION = '4-2-3-1';

/** Slots de uma formação pré-definida ou personalizada; valida 11 slots e 1 goleiro. */
export function formationSlots(key: string, custom: Record<string, readonly SlotDef[]> = {}): readonly SlotDef[] {
  const slots = custom[key] ?? FORMATIONS[key];
  if (!slots) throw new Error(`Formação desconhecida: ${key}`);
  if (slots.length !== 11 || slots.filter((x) => x.pos === 'GOL').length !== 1) {
    throw new Error(`Formação ${key} precisa de 11 posições e exatamente 1 goleiro`);
  }
  return slots;
}
