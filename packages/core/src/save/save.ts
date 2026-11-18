/**
 * Save da carreira (corrige B7).
 *
 * - Um envelope com `schemaVersion` e uma cadeia de migrações (v1 → v2 → …),
 *   em vez de uma chave nova de localStorage a cada versão.
 * - Só o estado dinâmico vai no save: a base estática (nomes, atributos
 *   originais, estádios) vem de @sm/data.
 * - Limite de tamanho verificado antes de gravar; falha de gravação nunca
 *   apaga o save anterior nem altera o estado em memória.
 * - Competições antigas são compactadas (tabela e campeão ficam, jogos saem).
 */
import type { CalendarState } from '../calendar/types.ts';
import type { IsoDate } from '../dates.ts';
import type { FinanceState } from '../finance/ledger.ts';
import type { PlayerAttributes, Position } from '../squad/positions.ts';
import type { Lineup } from '../squad/lineup.ts';
import { createMarket, type MarketState } from '../market/market.ts';
import { createBoard, type BoardState } from '../board/board.ts';

export const SCHEMA_VERSION = 3;
export const SAVE_FORMAT = 'soccer-manager-save';
/** ~2,5 milhões de caracteres: metade da cota típica de localStorage, folgado para IndexedDB. */
export const MAX_SAVE_CHARS = 2_500_000;
export const MAX_NEWS = 200;

/** Parte do jogador que muda durante a carreira. */
export interface PlayerDynamic {
  clubId: string | null;
  pos: Position;
  age: number;
  ovr: number;
  pot: number;
  attrs: PlayerAttributes;
  wage: number;
  contract: number;
  form: number;
  morale: number;
  fitness: number;
  injuredUntil: IsoDate | null;
  devProgress: number;
  declineProgress: number;
  appsThisSeason: number;
}

export interface NewsItem {
  date: IsoDate;
  title: string;
  body: string;
}

export interface CareerState {
  schemaVersion: number;
  seed: number;
  manager: string;
  userClubId: string;
  calendar: CalendarState;
  finance: FinanceState;
  lineup: Lineup;
  players: Record<string, PlayerDynamic>;
  news: NewsItem[];
  market: MarketState;
  board: BoardState;
}

export interface SaveEnvelope {
  format: typeof SAVE_FORMAT;
  schemaVersion: number;
  savedAt: IsoDate;
  data: CareerState;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Migrações conhecidas. v1 → v2: mercado e base; v2 → v3: diretoria e olheiros. */
export const MIGRATIONS: Record<number, (data: any) => any> = {
  1: (d) => ({ ...d, market: createMarket() }),
  // v2 → v3: diretoria e olheiros. Os objetivos são definidos pelo Game ao carregar (dependem do clube).
  2: (d) => ({ ...d, board: { ...createBoard({ rep: 70, division: null }), objectives: [] } }),
};

/** Migração da versão `n` para `n + 1`, sobre JSON cru. */
export type Migration = (data: any) => any;

export type EncodeResult = { ok: true; text: string; size: number } | { ok: false; reason: 'too-large'; size: number };
export type DecodeResult =
  | { ok: true; state: CareerState; migratedFrom: number | null }
  | { ok: false; reason: 'corrupt' | 'not-a-save' | 'newer-version' | 'missing-migration'; detail: string };

export function encodeSave(state: CareerState, maxChars = MAX_SAVE_CHARS): EncodeResult {
  const envelope: SaveEnvelope = { format: SAVE_FORMAT, schemaVersion: state.schemaVersion, savedAt: state.calendar.date, data: state };
  const text = JSON.stringify(envelope);
  return text.length > maxChars ? { ok: false, reason: 'too-large', size: text.length } : { ok: true, text, size: text.length };
}

export function decodeSave(text: string, migrations: Record<number, Migration> = MIGRATIONS, target = SCHEMA_VERSION): DecodeResult {
  let env: any;
  try {
    env = JSON.parse(text);
  } catch (e) {
    return { ok: false, reason: 'corrupt', detail: String(e) };
  }
  if (env?.format !== SAVE_FORMAT || typeof env.schemaVersion !== 'number' || !env.data) {
    return { ok: false, reason: 'not-a-save', detail: 'Formato desconhecido (saves da v0.5 usam importLegacySave)' };
  }
  if (env.schemaVersion > target) return { ok: false, reason: 'newer-version', detail: `Save v${env.schemaVersion}, jogo v${target}` };
  let data = env.data;
  const from = env.schemaVersion as number;
  for (let v = from; v < target; v++) {
    const m = migrations[v];
    if (!m) return { ok: false, reason: 'missing-migration', detail: `Sem migração v${v} → v${v + 1}` };
    data = m(structuredClone(data));
    data.schemaVersion = v + 1;
  }
  return { ok: true, state: data as CareerState, migratedFrom: from === target ? null : from };
}

// ---------------------------------------------------------------------------
// Armazenamento
// ---------------------------------------------------------------------------

/** Onde os saves ficam (IndexedDB na web, arquivo no celular, memória nos testes). */
export interface SaveStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export class MemoryStore implements SaveStore {
  readonly data = new Map<string, string>();
  readonly quotaChars: number;
  constructor(quotaChars = Number.POSITIVE_INFINITY) {
    this.quotaChars = quotaChars;
  }
  async get(key: string): Promise<string | null> {
    return this.data.get(key) ?? null;
  }
  async set(key: string, value: string): Promise<void> {
    let used = value.length;
    for (const [k, v] of this.data) if (k !== key) used += v.length;
    if (used > this.quotaChars) throw Object.assign(new Error('Cota de armazenamento excedida'), { name: 'QuotaExceededError' });
    this.data.set(key, value);
  }
  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }
}

export type WriteResult = { ok: true; size: number } | { ok: false; reason: 'too-large' | 'storage-error'; detail: string };

/** Grava a carreira. Em qualquer falha, o save anterior continua intacto e o estado não é tocado. */
export async function writeSave(store: SaveStore, slot: string, state: CareerState, maxChars = MAX_SAVE_CHARS): Promise<WriteResult> {
  const enc = encodeSave(state, maxChars);
  if (!enc.ok) return { ok: false, reason: 'too-large', detail: `${enc.size} caracteres (limite ${maxChars})` };
  try {
    await store.set(slot, enc.text);
  } catch (e) {
    return { ok: false, reason: 'storage-error', detail: e instanceof Error ? `${e.name}: ${e.message}` : String(e) };
  }
  return { ok: true, size: enc.size };
}

export async function readSave(store: SaveStore, slot: string, migrations: Record<number, Migration> = MIGRATIONS): Promise<DecodeResult | null> {
  const text = await store.get(slot);
  return text === null ? null : decodeSave(text, migrations);
}

// ---------------------------------------------------------------------------
// Compactação
// ---------------------------------------------------------------------------

/**
 * Remove os jogos de competições encerradas de temporadas anteriores à
 * `keepSeasons` mais recente de cada ciclo. Tabela final e campeão continuam.
 */
export function compactCalendar(cal: CalendarState, keepSeasons = 1): number {
  let removed = 0;
  for (const comp of Object.values(cal.competitions)) {
    const opened = cal.cycles[comp.cycleId]?.openedYear ?? comp.startYear;
    if (comp.status !== 'finished' || comp.startYear > opened - keepSeasons || comp.fixtureIds.length === 0) continue;
    for (const id of comp.fixtureIds) {
      delete cal.fixtures[id];
      removed++;
    }
    comp.fixtureIds = [];
  }
  return removed;
}

/** Mantém só as notícias mais recentes. */
export function capNews(state: CareerState, max = MAX_NEWS): void {
  if (state.news.length > max) state.news = state.news.slice(-max);
}
