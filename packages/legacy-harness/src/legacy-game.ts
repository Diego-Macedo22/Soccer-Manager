/**
 * Executa o jogo legado v0.5 (`game/frontend/js/app.js`) em Node, sem navegador.
 *
 * - `Math.random` vem de um RNG com semente e `Date.now` de um contador: a mesma
 *   semente reproduz a mesma carreira, jogo a jogo.
 * - O estado do legado vive dentro de uma closure; ele é lido pelo save que o
 *   próprio jogo grava no `localStorage` falso.
 * - Os arquivos do legado são apenas lidos, nunca alterados.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRng, type IsoDate } from '@sm/core';
import { FakeDocument, FakeStorage, type FakeElement } from './dom-stub.ts';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const LEGACY_APP_PATH = `${REPO_ROOT}game/frontend/js/app.js`;
export const LEGACY_NAMES_PATH = `${REPO_ROOT}game/frontend/js/fictional-names.js`;
export const LEGACY_SAVE_KEY = 'soccerManagerV05';

/** Estado salvo pelo legado (formato livre, sem tipos). */
export type LegacyState = Record<string, any>;

export interface LegacyOptions {
  seed: number | string;
  /** Limite do localStorage em caracteres (o Chrome aceita ~5,2 milhões). */
  storageQuotaChars?: number;
  /** Saves pré-existentes, ex.: de versões anteriores na mesma origem. */
  preloadStorage?: Record<string, string>;
}

const scriptCache = new Map<string, vm.Script>();
function script(path: string): vm.Script {
  let s = scriptCache.get(path);
  if (!s) {
    s = new vm.Script(readFileSync(path, 'utf8'), { filename: path });
    scriptCache.set(path, s);
  }
  return s;
}

export class LegacyGame {
  readonly document = new FakeDocument();
  readonly storage: FakeStorage;
  readonly logs: string[] = [];
  private readonly ctx: Record<string, any>;
  private readonly intervals = new Map<number, () => void>();

  private constructor(opts: LegacyOptions) {
    this.storage = new FakeStorage(opts.storageQuotaChars);
    for (const [k, v] of Object.entries(opts.preloadStorage ?? {})) this.storage.setItem(k, v);
    const rng = createRng(opts.seed);
    let clock = Date.UTC(2026, 0, 5);
    let nextId = 1;
    const log = (...a: unknown[]) => this.logs.push(a.map(String).join(' '));
    this.ctx = {
      document: this.document,
      localStorage: this.storage,
      console: { log, info: log, warn: log, error: log, debug: log },
      setTimeout: () => 0,
      clearTimeout: () => {},
      setInterval: (fn: () => void) => {
        const id = nextId++;
        this.intervals.set(id, fn);
        return id;
      },
      clearInterval: (id: number) => {
        this.intervals.delete(id);
      },
      confirm: () => true,
      alert: log,
      __smRandom: () => rng.next(),
      __smNow: () => clock++,
    };
    this.ctx.window = this.ctx;
    vm.createContext(this.ctx);
    vm.runInContext('Math.random = __smRandom; Date.now = __smNow;', this.ctx);
    script(LEGACY_NAMES_PATH).runInContext(this.ctx);
    script(LEGACY_APP_PATH).runInContext(this.ctx);
  }

  static load(opts: LegacyOptions): LegacyGame {
    return new LegacyGame(opts);
  }

  /** Elemento falso de um seletor (o mesmo objeto que o legado usa). */
  el(selector: string): FakeElement {
    return this.document.querySelector(selector);
  }

  html(selector: string): string {
    return this.el(selector).innerHTML;
  }

  toasts(): string[] {
    return this.el('#toastRoot').children.map((c) => c.textContent);
  }

  /** Clubes oferecidos na tela inicial: `{ id, label }`. */
  clubOptions(): { id: string; label: string }[] {
    return [...this.html('#clubSelect').matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g)].map((m) => ({
      id: m[1]!,
      label: m[2]!,
    }));
  }

  startCareer(clubId: string, managerName = 'Teste'): void {
    this.el('#managerName').value = managerName;
    this.el('#clubSelect').value = clubId;
    this.el('#moneyBoost').checked = false;
    this.el('#realistic').checked = false;
    this.el('#startCareer').onclick();
  }

  /** Mesmo caminho do calendário: "avançar até a data" (inclui os jogos do usuário). */
  advanceTo(date: IsoDate): void {
    this.el('#targetDate').value = date;
    this.call('advanceToDate');
  }

  advanceToNextEvent(): void {
    this.call('advanceToNextEvent');
  }

  /** Avança a pós-temporada (7 dias por vez) até a nova temporada começar. */
  finishOffseason(maxSteps = 12): void {
    for (let i = 0; i < maxSteps && this.state().offseason?.active; i++) this.advanceToNextEvent();
  }

  /** Chama uma função exposta em `window` pelo legado. */
  call(name: string, ...args: unknown[]): unknown {
    const fn = this.ctx[name];
    if (typeof fn !== 'function') throw new Error(`O legado não expõe window.${name}`);
    return fn(...args);
  }

  /** Executa os timers de partida ao vivo (`setInterval`) `times` vezes. */
  tick(times = 1): void {
    for (let i = 0; i < times; i++) for (const fn of [...this.intervals.values()]) fn();
  }

  state(): LegacyState {
    const raw = this.storage.getItem(LEGACY_SAVE_KEY);
    if (!raw) throw new Error('O legado ainda não gravou um save');
    return JSON.parse(raw) as LegacyState;
  }

  saveSizeChars(): number {
    return this.storage.getItem(LEGACY_SAVE_KEY)?.length ?? 0;
  }
}
