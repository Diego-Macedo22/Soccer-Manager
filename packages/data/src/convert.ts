/**
 * Conversão da base da v0.5 para o modelo novo. Roda uma única vez (script
 * `npm run extract-data`); o resultado fica congelado em src/data/*.json.
 *
 * Correções aplicadas na conversão:
 * - B15: ids `p00001…` independentes do nome + mapa id antigo → id novo;
 * - B17: atributos calibrados para reproduzir o OVR cadastrado;
 * - B19: elencos brasileiros com 12–17 jogadores e 1 goleiro são completados;
 * - B20: torcida dos clubes ingleses/espanhóis estava em índice 35–100;
 * - B21: o gerador de nomes trocou o sobrenome "Santos" por "Santista FC";
 * - países e nacionalidades misturavam português e inglês.
 */
import { POSITIONS, calibrateAttributes, computeOvr, createRng, type PlayerAttributes, type Position, type Rng } from '@sm/core';
import type { ClubData, Database, Division, PlayerData } from './types.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type LegacyDb = { clubs: any[]; players: any[] };

export const DATA_VERSION = 1;

const COUNTRY_CODES: Record<string, string> = {
  Brasil: 'BR',
  Brazil: 'BR',
  England: 'ENG',
  Inglaterra: 'ENG',
  Spain: 'ESP',
  Espanha: 'ESP',
  Argentina: 'ARG',
  Uruguai: 'URU',
  Uruguay: 'URU',
  Equador: 'ECU',
  Ecuador: 'ECU',
  Netherlands: 'NED',
  Norway: 'NOR',
  Portugal: 'POR',
  France: 'FRA',
  Algeria: 'ALG',
  Italy: 'ITA',
  'Cote d Ivoire': 'CIV',
};

export function countryCode(name: string | undefined): string {
  const code = name ? COUNTRY_CODES[name] : undefined;
  if (!code) throw new Error(`País sem código: "${name}"`);
  return code;
}

const TRAIT_LABEL: Record<string, string> = { vel: 'Velocidade', fin: 'Finalização', pas: 'Passe', dri: 'Drible', def: 'Marcação', fis: 'Força', gk: 'Reflexos' };

/** Torcida em índice 0–100 (clubes europeus da v0.5) → número de torcedores. */
export const FANBASE_PER_INDEX_POINT = 400_000;

const clampOvr = (v: number) => Math.max(40, Math.min(99, Math.round(v)));

/**
 * Nomes que o gerador fictício transformou no nome de um clube (B21):
 * "Santos" virou "Santista FC" e o apelido "Cuiabano" ficou igual ao clube "Coiabanno".
 */
const NAME_OVERRIDES: Record<string, string> = { Coiabanno: 'Coiabinho' };

export function fixName(name: string): string {
  return NAME_OVERRIDES[name] ?? name.replace(/\bSantista FC\b/g, 'Santana');
}

/** Clubes convidados da v0.5 tinham "irmãos" gerados com o mesmo nome no elenco. */
function dedupeNamesInClubs(db: Database, rng: Rng): number {
  const used = new Set(db.players.map((p) => p.name));
  const seen = new Set<string>();
  let renamed = 0;
  for (const p of db.players) {
    if (!p.clubId) continue;
    if (!seen.has(`${p.clubId}|${p.name}`)) {
      seen.add(`${p.clubId}|${p.name}`);
      continue;
    }
    const country = db.clubs.find((c) => c.id === p.clubId)?.country ?? 'BR';
    const names = NAMES[country] ?? NAMES.BR!;
    let name = '';
    for (let t = 0; t < 200 && (!name || used.has(name)); t++) name = `${rng.pick(names.first)} ${rng.pick(names.last)}`;
    used.add(name);
    p.name = name;
    seen.add(`${p.clubId}|${name}`);
    renamed++;
  }
  return renamed;
}

function convertClub(c: any): ClubData {
  const division = (['A', 'B', 'PL', 'LL'].includes(c.division) ? c.division : null) as Division | null;
  const fanbase = Number(c.fanbase) || 0;
  return {
    id: c.id,
    name: c.name,
    abbr: c.abbr,
    country: countryCode(c.country),
    division,
    guest: !!c.guest,
    rep: c.rep,
    baseBudget: Math.round(c.budget || 0),
    wageBudget: Math.round(c.wage || 0),
    colors: [c.color || '#888888', c.color2 || '#ffffff'],
    stadium: c.stadium ? { name: c.stadium, capacity: c.capacity || 0 } : null,
    fanbase: fanbase > 0 && fanbase <= 1_000 ? fanbase * FANBASE_PER_INDEX_POINT : fanbase,
  };
}

function convertPlayer(p: any, id: string): PlayerData {
  const pos = p.pos as Position;
  const ovr = clampOvr(p.ovr);
  const attrs = calibrateAttributes(p.attrs as PlayerAttributes, pos, ovr);
  const positions = [pos, ...((p.positions as Position[]) ?? []).filter((x) => x !== pos && (POSITIONS as readonly string[]).includes(x))];
  return {
    id,
    name: fixName(p.name),
    clubId: p.clubId === 'free_agents' ? null : p.clubId,
    nationality: countryCode(p.nationality),
    age: p.age,
    pos,
    positions,
    ovr: computeOvr(attrs, pos),
    pot: Math.max(ovr, Math.min(99, Math.round(p.pot ?? ovr))),
    attrs,
    wage: Math.round(p.wage || 0),
    value: Math.round(p.value || 0),
    contract: Math.max(0, Math.round(p.contract ?? 1)),
    traits: (p.traits as string[] | undefined)?.length ? [...(p.traits as string[])] : [],
    generated: !!p.generated,
  };
}

// ---------------------------------------------------------------------------
// Completar elencos (B19)
// ---------------------------------------------------------------------------

/** Mínimo por posição de um elenco de liga (22 jogadores, 3 goleiros). */
export const SQUAD_MINIMUM: Partial<Record<Position, number>> = { GOL: 3, ZAG: 4, LD: 2, LE: 2, VOL: 2, MC: 3, MAT: 1, PE: 1, PD: 1, ATA: 3 };

const NAMES: Record<string, { first: string[]; last: string[] }> = {
  BR: {
    first: ['Caeo', 'Davi', 'Enzo', 'Fellepe', 'Gapreel', 'Goilheme', 'Henrice', 'Icor', 'Kauã', 'Matteus', 'Murilo', 'Petro', 'Ravail', 'Renan', 'Arthur', 'Heitor', 'Luan', 'Danello', 'Brumo', 'Niculas'],
    last: ['Almeida', 'Barbosa', 'Cardoso', 'Fereera', 'Martins', 'Melo', 'Moura', 'Rocha', 'Tavares', 'Santana', 'Carvalho', 'Teixeira', 'Barus', 'Freitas', 'Correia', 'Nogueira', 'Batista', 'Peixoto', 'Rezende', 'Siqueira'],
  },
  ENG: {
    first: ['Alfie', 'Callum', 'Declan', 'Ewan', 'Freddie', 'Harvey', 'Jamie', 'Kieran', 'Liam', 'Mason', 'Noah', 'Ollie', 'Reece', 'Toby', 'Archie', 'Ellis'],
    last: ['Ashford', 'Barlow', 'Carver', 'Denton', 'Ellison', 'Fairley', 'Hartley', 'Kirby', 'Lowther', 'Marsden', 'Pryce', 'Thornley', 'Whitlock', 'Yardley', 'Brookes', 'Penrose'],
  },
  ESP: {
    first: ['Álvaro', 'Bruno', 'Diego', 'Gonzalo', 'Hugo', 'Iker', 'Javi', 'Marcos', 'Nico', 'Pablo', 'Rubén', 'Sergio', 'Unai', 'Adrián', 'Mario', 'Óscar'],
    last: ['Arrieta', 'Becerra', 'Calvo', 'Duarte', 'Escobar', 'Ferrer', 'Galindo', 'Herrera', 'Ibarra', 'Llorente', 'Medina', 'Navas', 'Ortega', 'Pizarro', 'Quintana', 'Salcedo'],
  },
};

/** Perfil de atributos por posição (mesmo formato do buildAttrs da v0.5), depois calibrado. */
function profile(pos: Position, ovr: number, rng: Rng): PlayerAttributes {
  const j = () => rng.int(-4, 4);
  let a: Record<string, number> = { vel: ovr - 4 + j(), fin: ovr - 8 + j(), pas: ovr - 5 + j(), dri: ovr - 5 + j(), def: ovr - 8 + j(), fis: ovr - 3 + j(), gk: 25 + j() };
  if (pos === 'GOL') a = { vel: ovr - 25, fin: 20, pas: ovr - 15, dri: ovr - 24, def: ovr - 18, fis: ovr - 4, gk: ovr + 2 };
  const bump: Partial<Record<Position, Record<string, number>>> = {
    ZAG: { def: 8, fis: 6, fin: -9, dri: -6 },
    LD: { vel: 6, def: 3, pas: 2, fin: -5 },
    LE: { vel: 6, def: 3, pas: 2, fin: -5 },
    VOL: { def: 6, pas: 5, fis: 3, fin: -4 },
    MC: { pas: 7, dri: 2, def: 1 },
    MAT: { pas: 7, dri: 6, fin: 4, def: -7 },
    PE: { vel: 8, dri: 7, fin: 3, def: -9 },
    PD: { vel: 8, dri: 7, fin: 3, def: -9 },
    ATA: { fin: 9, fis: 3, def: -12, pas: -2 },
  };
  for (const [k, v] of Object.entries(bump[pos] ?? {})) a[k] = (a[k] ?? 50) + v;
  for (const k of Object.keys(a)) a[k] = Math.max(20, Math.min(95, Math.round(a[k]!)));
  return calibrateAttributes(a as unknown as PlayerAttributes, pos, ovr);
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)]! : 0;
}

export interface CompletionReport {
  clubsCompleted: number;
  playersAdded: number;
}

export function completeSquads(db: Database, rng: Rng, nextId: () => string): CompletionReport {
  const usedNames = new Set(db.players.map((p) => p.name));
  let clubsCompleted = 0;
  let playersAdded = 0;
  for (const club of db.clubs.filter((c) => c.division !== null)) {
    const squad = db.players.filter((p) => p.clubId === club.id);
    const top = [...squad].sort((a, b) => b.ovr - a.ovr).slice(0, 18);
    const baseOvr = top.length ? top.reduce((s, p) => s + p.ovr, 0) / top.length : 60;
    const medWage = median(squad.map((p) => p.wage)) || club.wageBudget / 30;
    const medValue = median(squad.map((p) => p.value)) || 1_000_000;
    const medOvr = median(squad.map((p) => p.ovr)) || baseOvr;
    const names = NAMES[club.country] ?? NAMES.BR!;
    let added = 0;
    for (const pos of POSITIONS) {
      // Conta quem cobre a posição (principal ou secundária); goleiro sempre conta pela posição principal.
      const need = (SQUAD_MINIMUM[pos] ?? 0) - squad.filter((p) => p.positions.includes(pos)).length;
      for (let i = 0; i < need; i++) {
        let name = '';
        for (let tries = 0; tries < 200 && (!name || usedNames.has(name)); tries++) name = `${rng.pick(names.first)} ${rng.pick(names.last)}`;
        usedNames.add(name);
        const ovr = Math.max(45, Math.min(80, Math.round(baseOvr - rng.int(6, 12))));
        const scale = 2 ** ((ovr - medOvr) / 5);
        const attrs = profile(pos, ovr, rng);
        const top2 = Object.entries(attrs)
          .filter(([k]) => pos === 'GOL' || k !== 'gk')
          .sort((x, y) => (y[1] as number) - (x[1] as number))
          .slice(0, 2)
          .map(([k]) => TRAIT_LABEL[k]!);
        const p: PlayerData = {
          id: nextId(),
          name,
          clubId: club.id,
          nationality: club.country,
          age: rng.int(18, 23),
          pos,
          positions: [pos],
          ovr: computeOvr(attrs, pos),
          pot: Math.min(92, ovr + rng.int(2, 14)),
          attrs,
          wage: Math.round(medWage * 0.5 * scale),
          value: Math.round(medValue * 0.5 * scale),
          contract: 2,
          traits: top2,
          generated: true,
        };
        db.players.push(p);
        squad.push(p);
        added++;
        playersAdded++;
      }
    }
    if (added) clubsCompleted++;
  }
  return { clubsCompleted, playersAdded };
}

export interface ConversionResult {
  db: Database;
  legacyIdMap: Record<string, string>;
  report: CompletionReport & { renamed: number; fanbaseScaled: number };
}

export function convertLegacyDatabase(legacy: LegacyDb, seed: string | number = 'data-v1'): ConversionResult {
  const clubs = legacy.clubs.filter((c) => c.id !== 'free_agents').map(convertClub);
  const clubOrder = new Map(clubs.map((c, i) => [c.id, i]));
  let seq = 0;
  const nextId = () => `p${String(++seq).padStart(5, '0')}`;
  // Ordem estável: clubes na ordem da base, passes livres por último, depois a ordem original.
  const ordered = legacy.players
    .map((p, i) => ({ p, i }))
    .sort((a, b) => (clubOrder.get(a.p.clubId) ?? 1e9) - (clubOrder.get(b.p.clubId) ?? 1e9) || a.i - b.i);
  const legacyIdMap: Record<string, string> = {};
  const players = ordered.map(({ p }) => {
    const id = nextId();
    legacyIdMap[p.id] = id;
    return convertPlayer(p, id);
  });
  const db: Database = { version: DATA_VERSION, clubs, players };
  const rng = createRng(seed);
  const deduped = dedupeNamesInClubs(db, rng);
  const completion = completeSquads(db, rng, nextId);
  return {
    db,
    legacyIdMap,
    report: {
      ...completion,
      renamed: legacy.players.filter((p) => fixName(p.name) !== p.name).length + deduped,
      fanbaseScaled: legacy.clubs.filter((c) => c.fanbase > 0 && c.fanbase <= 1_000).length,
    },
  };
}
