/** Converte o save do legado para a visão usada pelas invariantes do core. */

import type { InvariantSnapshot, LedgerKind } from '@sm/core';
import type { LegacyState } from './legacy-game.ts';

const LEDGER_KINDS: Record<string, LedgerKind> = {
  'Folha salarial': 'payroll',
  Bilheteria: 'gate',
  'Produtos e camisas': 'merchandise',
  'Luvas de renovação': 'bonus',
};

export function toSnapshot(s: LegacyState): InvariantSnapshot {
  const competitions = Object.values<any>(s.competitions ?? {}).filter((c) => c.type !== 'groups');
  return {
    date: s.date,
    clubId: s.clubId,
    budget: s.budget,
    ledger: (s.financeLedger ?? []).map((e: any) => ({
      date: e.date,
      kind: LEDGER_KINDS[e.type] ?? 'other',
      value: Number(e.value) || 0,
    })),
    fixtures: (s.fixtures ?? []).map((f: any) => ({
      id: f.id,
      competitionId: f.compId,
      date: f.date,
      played: !!f.played,
      home: f.home,
      away: f.away,
    })),
    competitions: competitions.map((c) => ({ id: c.id, finished: !!c.finished })),
    players: (s.db?.players ?? []).map((p: any) => ({
      id: p.id,
      clubId: p.clubId,
      position: p.pos,
      injuredUntil: p.injuryUntil ?? null,
    })),
    lineup: s.lineup?.xi ? s.lineup.xi.map((x: any) => ({ playerId: x.playerId, slot: x.slotPos })) : null,
  };
}
