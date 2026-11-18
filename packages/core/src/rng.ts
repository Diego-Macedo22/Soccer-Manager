/**
 * Gerador de números aleatórios com semente (mulberry32).
 *
 * Por que existe: o legado usa `Math.random` em ~200 pontos, o que torna
 * impossível reproduzir um bug ou provar que uma correção não mudou outra coisa.
 * Aqui toda aleatoriedade passa por um `Rng` com estado serializável (vai no save)
 * e por fluxos derivados (`derive`) independentes por sistema/partida: adicionar
 * um sorteio no mercado não muda o resultado de nenhuma partida.
 */

export interface Rng {
  /** Semente original (fluxos derivados partem dela, não do estado atual). */
  readonly seed: number;
  /** Número em [0, 1). */
  next(): number;
  /** Inteiro em [min, max], inclusive. */
  int(min: number, max: number): number;
  /** Número real em [min, max). */
  float(min: number, max: number): number;
  /** `true` com probabilidade `p` (0–1). */
  chance(p: number): boolean;
  /** Elemento aleatório. Lança erro em lista vazia (o legado devolvia `undefined` em silêncio). */
  pick<T>(items: readonly T[]): T;
  /** Embaralha no lugar (Fisher–Yates) e devolve a mesma lista. */
  shuffle<T>(items: T[]): T[];
  /** Escolha ponderada; pesos negativos contam como zero. */
  weighted<T>(items: readonly T[], weight: (item: T) => number): T;
  /** Amostra de Poisson (Knuth), adequada para lambda pequeno como gols por partida. */
  poisson(lambda: number): number;
  /** Fluxo independente e estável, identificado por um rótulo (ex.: `match:<id>`). */
  derive(label: string): Rng;
  /** Estado interno para salvar/restaurar a sequência exata. */
  getState(): number;
  setState(state: number): void;
}

/** Hash FNV-1a de 32 bits: estável entre plataformas e versões. */
export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function normalizeSeed(seed: number | string): number {
  if (typeof seed === 'string') return hashString(seed);
  if (!Number.isFinite(seed)) throw new RangeError(`Semente inválida: ${seed}`);
  return Math.trunc(seed) >>> 0;
}

export function createRng(seed: number | string): Rng {
  const root = normalizeSeed(seed);
  let state = root;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (min: number, max: number): number => {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
      throw new RangeError(`Intervalo inválido: [${min}, ${max}]`);
    }
    return min + Math.floor(next() * (max - min + 1));
  };

  const rng: Rng = {
    seed: root,
    next,
    int,
    float: (min, max) => min + next() * (max - min),
    chance: (p) => next() < p,
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new RangeError('pick() em lista vazia');
      return items[int(0, items.length - 1)] as T;
    },
    shuffle<T>(items: T[]): T[] {
      for (let i = items.length - 1; i > 0; i--) {
        const j = int(0, i);
        [items[i], items[j]] = [items[j] as T, items[i] as T];
      }
      return items;
    },
    weighted<T>(items: readonly T[], weight: (item: T) => number): T {
      if (items.length === 0) throw new RangeError('weighted() em lista vazia');
      const weights = items.map((it) => Math.max(0, weight(it)));
      const total = weights.reduce((s, w) => s + w, 0);
      if (total <= 0) return rng.pick(items);
      let roll = next() * total;
      for (let i = 0; i < items.length; i++) {
        roll -= weights[i] as number;
        if (roll < 0) return items[i] as T;
      }
      return items[items.length - 1] as T;
    },
    poisson(lambda: number): number {
      if (!(lambda >= 0) || lambda > 30) throw new RangeError(`lambda fora da faixa suportada: ${lambda}`);
      const limit = Math.exp(-lambda);
      let k = 0;
      let p = 1;
      do {
        k++;
        p *= next();
      } while (p > limit);
      return k - 1;
    },
    derive: (label) => createRng(hashString(`${root}:${label}`)),
    getState: () => state,
    setState: (s) => {
      state = s >>> 0;
    },
  };
  return rng;
}
