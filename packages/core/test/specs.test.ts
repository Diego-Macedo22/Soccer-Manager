/**
 * Especificações do novo core derivadas dos bugs do legado (B1–B15).
 * Ficam como `todo` até o módulo correspondente existir (Fase 2). Ao implementar
 * um módulo, troque `test.todo` por `test` e escreva o teste ANTES do código.
 * Referência: docs/PLANEJAMENTO-FASE1-COMPLEMENTO.md, seção 1.3.
 */
import { describe, test } from 'node:test';

describe('calendário e temporada (core/calendar)', () => {
  test.todo('B2: a data global nunca diminui, inclusive na virada de temporada de ligas europeias');
  test.todo('B2: carreira na Liga Inglesa/Espanhola começa perto do primeiro jogo, sem meses parados');
  test.todo('B3: cada competição tem temporada própria (BR jan–dez, Europa ago–mai) e termina antes de ser recriada');
  test.todo('B4: jogos criados durante um avanço (fases de copa) são processados no mesmo avanço');
  test.todo('B11: a virada de temporada só acontece com todas as competições da temporada encerradas');
  test.todo('B16: cada competição define quem pode participar (Copa Nacional só com clubes do país)');
  test.todo('B18: eventos periódicos (mercado, olheiros, base) rodam na data de cada semana, não na data final do avanço');
});

describe('evolução (core/development)', () => {
  test.todo('B17: OVR e atributos são coerentes desde a geração; a evolução nunca reduz o OVR de um jovem ativo');
  test.todo('jovens com minutos evoluem em média; veteranos declinam gradualmente (comparar com a caracterização)');
});

describe('finanças (core/finance)', () => {
  test.todo('B1: folha salarial debitada uma vez por mês, qualquer que seja o tamanho do avanço');
  test.todo('B1: receitas de produtos por competência (semanal/mensal) independem da frequência de avanço');
  test.todo('toda variação de caixa tem lançamento no extrato (budgetMatchesLedger)');
});

describe('elenco e escalação (core/squad)', () => {
  test.todo('B6: a escalação do usuário só muda por ação do usuário ou com aviso explícito (lesão, venda)');
  test.todo('B6: lesão retira só o jogador afetado e sugere substituto, sem refazer o time');
  test.todo('B5: selecionar dois jogadores e trocar funciona (estado de seleção vive na UI, não no save)');
});

describe('partida (match-engine)', () => {
  test.todo('B9: jogo ao vivo, simulado do usuário e IA × IA usam o mesmo motor');
  test.todo('B9: a simulação usa a formação e o XI escolhidos pelo usuário');
  test.todo('mesma seed + mesmas entradas = mesma partida');
});

describe('persistência (core/save)', () => {
  test.todo('B7: save com schemaVersion e migrações encadeadas V02→V032→V04→V05→atual');
  test.todo('B7: save não guarda a base estática e tem limite de tamanho; notícias/extrato resumidos por temporada');
  test.todo('B7: falha de gravação não deixa o estado em memória divergente do salvo');
  test.todo('B8: partida ao vivo salva apenas em pontos de controle (intervalo, fim), não a cada minuto');
});

describe('dados e identidade (data)', () => {
  test.todo('B15: ids de jogador estáveis e independentes do nome; renomear não quebra referências');
  test.todo('B15: gerador de nomes fictícios idempotente e sem colisões');
  test.todo('B14: nenhum texto vindo de dados é interpolado como HTML sem escape');
});
