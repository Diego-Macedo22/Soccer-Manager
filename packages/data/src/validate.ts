/** Regras que a base de dados precisa cumprir (rodam nos testes e ao carregar dados editados). */
import { ATTRIBUTE_KEYS, POSITIONS, computeOvr, type Position } from '@sm/core';
import { SQUAD_MINIMUM } from './convert.ts';
import type { DataIssue, Database } from './types.ts';

const LEAGUE_SIZE = 20;

export function validateDatabase(db: Database): DataIssue[] {
  const issues: DataIssue[] = [];
  const add = (code: string, message: string) => issues.push({ code, message });

  const clubIds = new Set<string>();
  for (const c of db.clubs) {
    if (clubIds.has(c.id)) add('CLUB_DUPLICATE_ID', c.id);
    clubIds.add(c.id);
    if (!/^[A-Z]{2,3}$/.test(c.country)) add('CLUB_COUNTRY', `${c.id}: ${c.country}`);
    if (c.division && c.fanbase < 50_000) add('CLUB_FANBASE', `${c.id}: ${c.fanbase}`);
  }
  for (const division of ['A', 'B', 'PL', 'LL'] as const) {
    const n = db.clubs.filter((c) => c.division === division).length;
    if (n !== LEAGUE_SIZE) add('LEAGUE_SIZE', `${division}: ${n} clubes`);
  }

  const playerIds = new Set<string>();
  const namesInClub = new Set<string>();
  const clubNames = db.clubs.map((c) => c.name);
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Nome igual ao de um clube, ou contendo um nome de clube com mais de uma palavra ("Santista FC").
  const clubNameIn = (name: string) =>
    clubNames.some((n) => name === n || (n.includes(' ') && new RegExp(`(^|\\s)${escape(n)}($|\\s)`).test(name)));
  for (const p of db.players) {
    if (!/^p\d{5}$/.test(p.id)) add('PLAYER_ID_FORMAT', p.id);
    if (playerIds.has(p.id)) add('PLAYER_DUPLICATE_ID', p.id);
    playerIds.add(p.id);
    if (p.clubId !== null && !clubIds.has(p.clubId)) add('PLAYER_CLUB', `${p.id}: ${p.clubId}`);
    if (!(POSITIONS as readonly string[]).includes(p.pos) || !p.positions.includes(p.pos)) add('PLAYER_POSITION', `${p.id}: ${p.pos}`);
    if (p.ovr !== computeOvr(p.attrs, p.pos)) add('PLAYER_OVR_INCOHERENT', `${p.id}: ${p.ovr} ≠ ${computeOvr(p.attrs, p.pos)}`);
    if (p.pot < p.ovr) add('PLAYER_POTENTIAL', `${p.id}: pot ${p.pot} < ovr ${p.ovr}`);
    for (const k of ATTRIBUTE_KEYS) {
      const v = p.attrs[k];
      if (v !== undefined && (v < 20 || v > 99)) add('PLAYER_ATTRIBUTE', `${p.id}.${k}: ${v}`);
    }
    if (!/^[A-Z]{2,3}$/.test(p.nationality)) add('PLAYER_NATIONALITY', `${p.id}: ${p.nationality}`);
    if (clubNameIn(p.name)) add('PLAYER_NAME_HAS_CLUB', `${p.id}: ${p.name}`);
    const key = `${p.clubId}|${p.name}`;
    if (p.clubId && namesInClub.has(key)) add('PLAYER_NAME_DUPLICATE_IN_CLUB', key);
    namesInClub.add(key);
  }

  for (const c of db.clubs.filter((x) => x.division)) {
    const squad = db.players.filter((p) => p.clubId === c.id);
    for (const [pos, min] of Object.entries(SQUAD_MINIMUM)) {
      const n = squad.filter((p) => p.positions.includes(pos as Position)).length;
      if (n < (min ?? 0)) add('SQUAD_MINIMUM', `${c.id}: ${n} ${pos} (mínimo ${min})`);
    }
  }
  return issues;
}
