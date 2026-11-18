/**
 * DOM mínimo para executar o legado em Node. Não renderiza nada: guarda o
 * `innerHTML`/`value` de cada seletor para que os testes possam inspecionar a
 * tela gerada (ex.: a barra de troca em Táticas, bug B5).
 *
 * Cada seletor (`#tactics`, `#dashboard .grid.grid-4`…) devolve sempre o mesmo
 * elemento falso; `querySelectorAll` devolve lista vazia.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
export class FakeClassList {
  private readonly set = new Set<string>();
  add(...c: string[]): void {
    c.forEach((x) => this.set.add(x));
  }
  remove(...c: string[]): void {
    c.forEach((x) => this.set.delete(x));
  }
  toggle(c: string, force?: boolean): boolean {
    const on = force ?? !this.set.has(c);
    if (on) this.set.add(c);
    else this.set.delete(c);
    return on;
  }
  contains(c: string): boolean {
    return this.set.has(c);
  }
}

export class FakeElement {
  [key: string]: any;
  id = '';
  className = '';
  textContent = '';
  innerHTML = '';
  value = '';
  checked = false;
  dataset: Record<string, string> = {};
  classList = new FakeClassList();
  children: FakeElement[] = [];
  style: Record<string, string> & { setProperty(k: string, v: string): void } = Object.assign(Object.create(null), {
    setProperty(this: Record<string, string>, k: string, v: string) {
      this[k] = v;
    },
  });

  private readonly doc: FakeDocument;

  constructor(doc: FakeDocument) {
    this.doc = doc;
  }

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }
  insertBefore(child: FakeElement): FakeElement {
    this.children.unshift(child);
    return child;
  }
  insertAdjacentElement(_where: string, child: FakeElement): FakeElement {
    return child;
  }
  get firstChild(): FakeElement | null {
    return this.children[0] ?? null;
  }
  remove(): void {}
  closest(): null {
    return null;
  }
  cloneNode(): FakeElement {
    return new FakeElement(this.doc);
  }
  querySelector(selector: string): FakeElement {
    return this.doc.querySelector(selector);
  }
  querySelectorAll(): FakeElement[] {
    return [];
  }
  addEventListener(): void {}
  removeEventListener(): void {}
  setPointerCapture(): void {}
  focus(): void {}
}

export class FakeDocument {
  private readonly bySelector = new Map<string, FakeElement>();
  readonly body = new FakeElement(this);
  readonly documentElement = new FakeElement(this);

  querySelector(selector: string): FakeElement {
    let el = this.bySelector.get(selector);
    if (!el) {
      el = new FakeElement(this);
      if (selector.startsWith('#') && !/[\s.>[]/.test(selector)) el.id = selector.slice(1);
      this.bySelector.set(selector, el);
    }
    return el;
  }
  querySelectorAll(): FakeElement[] {
    return [];
  }
  getElementById(id: string): FakeElement {
    return this.querySelector(`#${id}`);
  }
  createElement(): FakeElement {
    return new FakeElement(this);
  }
  elementFromPoint(): null {
    return null;
  }
  addEventListener(): void {}
}

/** `localStorage` em memória, com cota opcional para reproduzir QuotaExceededError (B7). */
export class FakeStorage {
  private readonly map = new Map<string, string>();
  readonly quotaChars: number;
  /** Quantas gravações foram feitas (para medir saves por minuto de partida, B8). */
  writes = 0;

  constructor(quotaChars = Number.POSITIVE_INFINITY) {
    this.quotaChars = quotaChars;
  }

  get length(): number {
    return this.map.size;
  }
  usedChars(): number {
    let n = 0;
    for (const [k, v] of this.map) n += k.length + v.length;
    return n;
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    const v = String(value);
    const projected = this.usedChars() - (this.map.has(key) ? key.length + this.map.get(key)!.length : 0) + key.length + v.length;
    if (projected > this.quotaChars) {
      const err = new Error(`Failed to execute 'setItem' on 'Storage': exceeded the quota.`);
      err.name = 'QuotaExceededError';
      throw err;
    }
    this.map.set(key, v);
    this.writes++;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
  key(i: number): string | null {
    return [...this.map.keys()][i] ?? null;
  }
}
