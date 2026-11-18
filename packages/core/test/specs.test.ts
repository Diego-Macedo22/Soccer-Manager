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

// Evolução (B17): implementado na Fase 2 — ver test/development.test.ts e
// packages/legacy-harness/test/development-vs-legacy.test.ts.
describe('evolução: integrações futuras', () => {
  test.todo('evolução mensal ligada ao onTick do calendário, com jogos da temporada vindos das súmulas');
  test.todo('base (academia): evolução com teto de 75 e bônus da instalação, como na v0.5');
  test.todo('idade sobe uma vez por temporada, na abertura do ciclo do clube');
});

// Finanças (B1 e "toda variação de caixa tem lançamento"): implementado na
// Fase 2 — ver test/finance.test.ts.

describe('finanças: integrações futuras', () => {
  test.todo('mercado, luvas, rescisões e melhorias da base usam spend/receive (nunca alteram o saldo direto)');
  test.todo('extrato resumido por temporada no save, preservando a invariante de caixa (B7)');
});

// Elenco e escalação (B6 e a operação de troca de B5): implementado na Fase 2 —
// ver test/squad.test.ts.

describe('elenco: interface (Fase 3)', () => {
  test.todo('B5: a seleção para troca vive no estado da tela, nunca no save, e renderizar não a apaga');
  test.todo('as mudanças de reconcileLineup aparecem como aviso ao usuário (ex.: "lesionado → entra Fulano")');
});

describe('partida (match-engine)', () => {
  test.todo('B9: jogo ao vivo, simulado do usuário e IA × IA usam o mesmo motor');
  test.todo('B9: a simulação usa a formação e o XI escolhidos pelo usuário');
  test.todo('mesma seed + mesmas entradas = mesma partida');
});

// Persistência (B7): implementado na Fase 2 — ver packages/data/test/save.test.ts
// e packages/legacy-harness/test/legacy-save-import.test.ts.

describe('persistência: integração com o jogo (Fase 3)', () => {
  test.todo('compactCalendar roda automaticamente na abertura de cada temporada (sem ela, 3 temporadas ≈ 2,2 mi de caracteres)');
  test.todo('adaptador IndexedDB do SaveStore na web, com o mesmo contrato do MemoryStore');
  test.todo('B8: partida ao vivo salva apenas em pontos de controle (intervalo, fim), não a cada minuto');
});

// Dados e identidade (B15, B19, B20, B21): implementado na Fase 2 — ver
// packages/data/test/data.test.ts. Os nomes fictícios agora são dados
// congelados; o gerador da v0.5 não é mais reaplicado.

describe('dados: interface e editor (Fase 3+)', () => {
  test.todo('B14: nenhum texto vindo de dados é interpolado como HTML sem escape');
  test.todo('editor de dados valida com validateDatabase antes de salvar');
});
