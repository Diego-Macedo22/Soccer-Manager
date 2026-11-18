/**
 * Liga as finanças do clube ao calendário: cada evento é lançado na data em
 * que acontece, qualquer que seja o tamanho do avanço (B1).
 *
 * As finanças não conhecem elenco nem base de dados: recebem um contexto com
 * funções que respondem "quanto é a folha hoje", "qual a torcida" etc.
 */
import type { CalendarEvent, CalendarState } from '../calendar/types.ts';
import { fromDayNumber, toDayNumber } from '../dates.ts';
import { gateIncome, seasonGrant, weeklyMerchandise } from './formulas.ts';
import { charge, receive, type FinanceState } from './ledger.ts';

export interface ClubEconomy {
  capacity: number;
  fanbase: number;
  rep: number;
  /** Orçamento-base do clube (usado no aporte de nova temporada). */
  baseBudget: number;
  /** Ciclo de temporada do clube (`BR`, `ENG`…), para saber quando há aporte. */
  cycleId: string;
}

export interface FinanceContext {
  club(): ClubEconomy;
  /** Soma dos salários mensais do elenco atual. */
  monthlyWages(): number;
  /** Confiança da torcida, 0–100. */
  fanConfidence(): number;
  clubRep(clubId: string): number;
}

const monthLabel = (date: string) => {
  // Folha paga no dia 1 refere-se ao mês anterior.
  const prev = fromDayNumber(toDayNumber(date) - 1);
  return `${prev.slice(5, 7)}/${prev.slice(0, 4)}`;
};

export function createFinanceListener(fin: FinanceState, ctx: FinanceContext): (event: CalendarEvent, state: CalendarState) => void {
  return (event, state) => {
    switch (event.type) {
      case 'tick': {
        if (event.tick === 'monthly') {
          charge(fin, {
            date: event.date,
            kind: 'payroll',
            label: 'Folha salarial',
            amount: ctx.monthlyWages(),
            detail: `Salários de ${monthLabel(event.date)}`,
            ref: `payroll:${event.date}`,
          });
        } else {
          const club = ctx.club();
          const conf = ctx.fanConfidence();
          receive(fin, {
            date: event.date,
            kind: 'merchandise',
            label: 'Produtos e camisas',
            amount: weeklyMerchandise(club.fanbase, conf),
            detail: `Confiança da torcida ${conf}%`,
            ref: `merch:${event.date}`,
          });
        }
        return;
      }
      case 'fixture-played': {
        const f = state.fixtures[event.fixtureId];
        if (!f || f.home !== fin.clubId) return;
        const club = ctx.club();
        const g = gateIncome({
          capacity: club.capacity,
          fanbase: club.fanbase,
          homeRep: club.rep,
          awayRep: ctx.clubRep(f.away),
          fanConfidence: ctx.fanConfidence(),
        });
        receive(fin, {
          date: event.date,
          kind: 'gate',
          label: 'Bilheteria',
          amount: g.income,
          detail: `${g.attendance.toLocaleString('pt-BR')} torcedores × R$ ${g.ticket}`,
          ref: `gate:${f.id}`,
        });
        return;
      }
      case 'season-opened': {
        const club = ctx.club();
        if (event.cycleId !== club.cycleId) return;
        // A primeira temporada do ciclo já começa com o caixa inicial da carreira.
        // Decidido pelo estado salvo (não por contador em memória), para funcionar após carregar um save.
        const hadPrevious = Object.values(state.competitions).some((c) => c.cycleId === event.cycleId && c.seasonKey !== event.seasonKey);
        if (!hadPrevious) return;
        receive(fin, {
          date: event.date,
          kind: 'board',
          label: 'Aporte da diretoria',
          amount: seasonGrant(club.baseBudget),
          detail: `Temporada ${event.seasonKey}`,
          ref: `board:${event.cycleId}:${event.seasonKey}`,
        });
        return;
      }
      default:
        return;
    }
  };
}
