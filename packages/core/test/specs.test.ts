/**
 * Especificações do novo core derivadas dos bugs do legado (B1–B15).
 * Ficam como `todo` até o módulo correspondente existir (Fase 2). Ao implementar
 * um módulo, troque `test.todo` por `test` e escreva o teste ANTES do código.
 * Referência: docs/PLANEJAMENTO-FASE1-COMPLEMENTO.md, seção 1.3.
 */
import { describe, test } from 'node:test';

// Calendário (B2, B3, B4, B11, B16 e a parte de calendário de B18): implementado
// na Fase 2 — ver test/calendar.test.ts.

describe('sistemas periódicos (mercado, olheiros, base)', () => {
  test.todo('B18: IA de mercado, olheiros e base rodam no onTick do calendário, na data de cada semana/mês');
  test.todo('carreira começa na data de abertura do ciclo do clube escolhido (cycleOpenDate), com o mundo pré-simulado');
});

describe('evolução (core/development)', () => {
  test.todo('B17: OVR e atributos são coerentes desde a geração; a evolução nunca reduz o OVR de um jovem ativo');
  test.todo('jovens com minutos evoluem em média; veteranos declinam gradualmente (comparar com a caracterização)');
});

// Finanças (B1 e "toda variação de caixa tem lançamento"): implementado na
// Fase 2 — ver test/finance.test.ts.

describe('finanças: integrações futuras', () => {
  test.todo('mercado, luvas, rescisões e melhorias da base usam spend/receive (nunca alteram o saldo direto)');
  test.todo('extrato resumido por temporada no save, preservando a invariante de caixa (B7)');
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
