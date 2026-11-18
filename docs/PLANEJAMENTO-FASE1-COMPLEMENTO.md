# Soccer Manager: complemento da Fase 1

**Gameplay, visualização 3D e multiplataforma**

Data: 18/11/2026 · Base analisada: branch `v1`, commit `8f7c47d` + alterações locais (nomes fictícios) · Fase: pesquisa e planejamento. Nenhum arquivo do jogo foi alterado.

Este documento complementa o planejamento anterior, que está resumido em `README.md` → "Próximos passos". Ele trata das sete entregas pedidas. Quando este plano e o README discordarem, vale este plano. A mudança principal é que a migração para Godot 4 deixa de valer: o projeto continua na web.

---

## Sumário executivo

1. **Os bugs vêm da forma como o código foi crescendo, não de erros isolados.** O `app.js` (268 KB) empilha 7 camadas de versão (v0.2 → v0.3 → v0.3.2 → v0.4 → v0.5 → v0.5.0b → nomes fictícios). Cada camada substitui funções da anterior: 18 funções aparecem declaradas duas vezes, há cerca de 50 reatribuições e 35 cadeias de *wrappers*. Por isso uma correção numa camada desfaz o comportamento de outra.
2. **Cinco bugs graves foram confirmados executando o jogo**: salários nunca são cobrados, a data volta 7 meses em carreiras na Inglaterra ou na Espanha, as ligas europeias nunca terminam, a Copa trava e a troca de jogadores por clique não funciona. A Fase 1 encontrou mais três: B16, a Copa Nacional com clubes estrangeiros; B17, a evolução que derruba o OVR dos jovens; e B18, o mercado da IA parado.
3. **Correção:** não criar uma oitava camada de remendo. Primeiro vem uma rede de testes (RNG com semente, testes de caracterização e invariantes). Depois o código é extraído para módulos, um sistema por vez, cada um protegido por testes.
4. **Plataforma:** web com TypeScript + Vite. A lógica fica pura, sem DOM, e roda num Web Worker. Os saves vão para IndexedDB e a interface é responsiva e mobile-first. Uma PWA é o primeiro passo para o celular, e o Capacitor fica para depois, sem reescrever o jogo.
5. **Partidas:** um motor próprio, determinístico e baseado em *ticks*, gera uma **linha do tempo** (eventos + posições). Um visualizador em **Three.js** apenas reproduz essa linha do tempo, com melhores momentos. O motor também pode avançar passo a passo, o que já prepara o futuro modo jogável.
6. **Blender e Mixamo:** o Blender 5.3 já funciona aqui em modo *headless* e importa o pacote Mixamo que você baixou, com esqueleto único de 65 ossos e 30 fps. O que está faltando depende de você: baixar animações no Mixamo, que exige login Adobe, e decidir o modelo final do jogador.
7. **Controles:** uma camada de **ações abstratas** recebe teclado, gamepad (Gamepad API) e toque (joystick virtual + botões ou gestos). Nesta fase ela serve só para menus e para controlar o visualizador.

---

## 1. Diagnóstico dos bugs do projeto original

### 1.1 Como foi feita a análise

- Leitura das áreas de risco do `game/frontend/js/app.js`: estado, save, calendário, partida, temporada, finanças e táticas.
- Histórico do git: o calendário foi corrigido em v0.3.1 e v0.4 e continua instável.
- **Teste em execução** no navegador embutido, num servidor local separado (porta 3001; o `localStorage` foi limpo ao final):
  - Carreira com o Corintianos, avançando de 05/01/2026 a 20/12/2026 pelo calendário.
  - Carreira com um clube da Liga Inglesa (`pl_arsenal`), avançando até 30/06/2027 e atravessando a pós-temporada.

### 1.2 Causa principal: a arquitetura de "camadas de patch"

```text
v0.2 base ── function X(){...}            (declarações hoisted: a ÚLTIMA vence em todo o arquivo)
v0.3 patch ─ function X(){...}            (18 funções redeclaradas → a v0.2 vira código morto)
v0.3.2 ───── const _X031 = X; X = function(){ _X031(); ... }
v0.4 ─────── const _XV032 = X; X = function(){ ... }   (às vezes chama a anterior, às vezes NÃO)
v0.5 ─────── X = function(){ ... }        (substitui sem chamar a anterior → efeitos da v0.4 somem)
v0.5.0b ──── X = function(){ ... }        (mesma função redefinida 2x dentro da própria v0.5)
nomes ────── const _XV05 = X; X = function(){ ... }
```

Consequências:

| Problema | Efeito prático |
|---|---|
| Redeclarações com `function` (hoisting) | Editar a versão antiga não tem efeito, mas o código parece editável. |
| Substituição sem encadear (`X = function` que não chama `_X`) | Funcionalidades de versões anteriores **desligam em silêncio**. O bug B1 é o exemplo mais claro. |
| Estado global mutável (`state`) acessado por ~180 funções | Qualquer tela pode corromper dados de qualquer sistema. |
| `repairGameState()` chamado **dentro das renderizações** | Abrir uma tela altera o estado. Isso apaga seleções e reescala o time (B5, B6). |
| `try/catch` que mostra "Erro reparável" ou "estado reparado" | Esconde a causa real e impede o diagnóstico. |
| HTML montado por strings com `onclick="f('${id}')"` | Nomes com apóstrofo quebram os botões e permitem injeção de HTML pelo nome do técnico. |
| Sem testes e sem RNG com semente | Não há como verificar se uma correção quebrou outro sistema. |
| `backend/services/*` são stubs de 5–10 linhas | A "arquitetura Node" hoje só serve arquivos estáticos. Toda a lógica roda no navegador. |

### 1.3 Bugs encontrados

Legenda: **[C]** confirmado em execução · **[E]** evidência estática no código. Os números de linha referem-se a `game/frontend/js/app.js`.

| # | Sev. | Bug | Evidência | Origem |
|---|---|---|---|---|
| **B1** | Crítica | **Salários e receita de produtos nunca são aplicados na v0.5.** O caixa só cresce. | [C] Corintianos, jan→dez/2026: 19 lançamentos, todos "Bilheteria", e nenhuma "Folha salarial". Caixa foi de R$ 78 mi para R$ 164 mi. | `advanceGameDays` da v0.5 (l. 955) substituiu a da v0.4 (l. 733) sem chamar `v04EconomyBetween`, `v04MonthlyDevelopment` e `v04RecalcConfidence`. Bug latente: mesmo na v0.4, a receita semanal reiniciava a contagem a cada avanço, então avanços de 3–4 dias nunca pagavam. |
| **B2** | Crítica | **A data volta no tempo em carreiras inglesas ou espanholas.** | [C] O fim da temporada em 30/06/2027 levou a nova temporada a começar em 05/01/2027. A carreira também começa em 05/01/2026, mas o primeiro jogo só acontece em 21/08/2026: são 7 meses parados. | `startNextSeasonBaseV02` (l. 753) fixa `date = AAAA-01-05`. O calendário único segue o ano brasileiro. |
| **B3** | Alta | **Ligas europeias nunca terminam** em carreiras no Brasil. | [C] Ao fim da temporada brasileira, a Liga Inglesa estava em 180/380 jogos e a Espanhola em 190/380. A virada de temporada apaga as duas. | `createSeasonStructure` (l. 122) faz `competitions = {}` e `fixtures = []`. Temporadas jan–dez e ago–mai ficam num único ciclo. |
| **B4** | Alta | **A Copa Nacional trava** ao avançar pelo calendário. | [C] No fim da temporada a Copa tinha 16 de 24 jogos disputados e `finished = false`. As oitavas ficaram no passado sem resultado. | A v0.5 (l. 955) monta a lista de jogos **antes** do laço. As fases criadas durante o laço por `maybeAdvanceCup` não entram nela, e depois o filtro `f.date > start` as ignora para sempre. `nextUserFixture` (l. 159) ainda pode devolver esse jogo antigo. |
| **B5** | Alta | **A troca por clique em Táticas não funciona** (o arrastar funciona). | [C] Depois de selecionar 2 jogadores, nenhum fica destacado e a barra "⇄ Trocar" não aparece. | `renderTactics` (l. 702) chama `repairGameState`, que chama `v04EnsureState` (l. 706), que faz `tacticSelection = []` em toda renderização. |
| B6 | Média | **A escalação do usuário é desfeita** sem aviso. | [E] | `repairGameState` (l. 431) refaz o time se `lineup.formation ≠ formation`. `v05InjuryTick` (l. 906) refaz o time a cada lesão. Contratação, venda e rescisão sempre chamam `autoLineup` (l. 270, 921, 934, 936, 937). |
| B7 | Média | **Save frágil.** Pode falhar no meio de uma ação. | [C] Save de 1,3 MB no início e 1,5 MB após uma temporada. [E] `save()` não tem `try/catch` (l. 986). Os saves das versões V02, V032, V04 e V05 convivem no mesmo `localStorage`, cujo limite é de cerca de 5 MB. `financeLedger`, `news` e `history` crescem sem limite. | Cada versão trocou a chave e fez migração por remendo. Ao estourar a cota, o estado em memória muda mas não é salvo. |
| B8 | Média | **Travamentos** de interface. | [C] Avançar 11 meses congelou a tela por 8,6 s. Cada `JSON.stringify` do estado leva 35 ms. [E] A partida ao vivo chama `save()` a cada minuto (l. 946), o que dá cerca de 90 gravações de 1,5 MB por jogo. `renderAll` redesenha 12 telas a cada avanço. | Lógica e interface rodam na mesma thread. Os saves não têm pontos de checagem. |
| B9 | Média | **Resultados diferentes conforme o modo** (ao vivo, simulado pelo usuário, IA × IA). | [E] Existem três modelos: `matchStep` por minuto (l. 946), Poisson com `v04TeamQuality` (l. 736) e Poisson genérico. `autoSimUserFixture` (l. 954) define `state.lineup`, mas `simulateFixture` usa `autoLineup(clube)` em 4-2-3-1 e ignora a formação e o XI do usuário. | Não existe um motor único. |
| B10 | Média | **Sistemas duplicados.** | [E] Há 3 funções de recuperação física (l. 267, 375/730, 953), 3 de evolução (l. 381, 726, 914) e 3 versões de `finishSeason` (l. 276, 959, 1003), das quais a de l. 959 é código morto. | As camadas não removem o que substituem. |
| B11 | Baixa | O fim de temporada olha só para a liga do usuário. | [E] `checkSeasonEnd` (l. 995). Copas e torneios continentais pendentes são apagados na virada. | Mesma causa de B3 e B4. |
| B12 | Baixa | A partida ao vivo continua rodando (e salvando) ao trocar de tela. | [E] `showPage` (l. 481) não pausa `matchTimer`. `repairAndReload` (l. 487) descarta a partida em andamento. | |
| B13 | Baixa | Erros mascarados. | [E] `renderAll` e `showPage` (l. 469–486) trocam a tela por "Erro reparável". | |
| B14 | Baixa | HTML sem escape. | [E] Nome do técnico e nomes de jogadores são interpolados em `innerHTML` e em `onclick`. | |
| **B16** | Alta | **A Copa Nacional é disputada por clubes ingleses e espanhóis.** Encontrado na Fase 1 pelo harness. | [C] Dos 32 clubes da Copa, 11 são da Liga Inglesa, 8 da Espanhola e só 13 são brasileiros. Um clube inglês do usuário disputa a Copa Nacional em março. | `createCup` (l. 113) escolhe os 32 melhores entre todos os clubes não convidados. Quando a v0.5 acrescentou as ligas europeias, os clubes delas entraram nesse filtro sem que ninguém percebesse. |
| **B17** | Alta | **A evolução mensal derruba o OVR dos jovens.** Encontrado na Fase 1. | [C] Os jogadores de até 21 anos perdem em média **2,7 de OVR** numa temporada, sem variação entre as 8 sementes. Para 1.167 de 1.431 jogadores de linha, a média dos atributos fica 3 ou mais pontos abaixo do OVR cadastrado (média −4,3). | Na primeira evolução, `v04AdjustAttrs` (l. 725) recalcula o OVR como média simples dos atributos (`v04OverallFromAttrs`, l. 724). Esses atributos foram gerados por perfil de posição em `buildAttrs` e não são coerentes com o OVR cadastrado. |
| B18 | Média | **O mercado da IA fica parado quando se avança pelo calendário.** Encontrado na Fase 1. | [C] Nenhuma transferência entre clubes da IA numa temporada avançada pelo calendário, nas 8 sementes. [E] Toda a IA de mercado está dentro de `if(open)` (l. 940–941), e `advanceGameDays` (l. 955) executa os sorteios semanais **depois** de mover a data para o fim do avanço. | Todas as semanas são avaliadas com a data final. Se essa data cai fora da janela, nenhuma semana tem mercado aberto. Mesmo padrão de B4: eventos processados fora da ordem cronológica. |
| **B19** | Alta | **Os elencos brasileiros têm de 12 a 17 jogadores e um só goleiro.** Encontrado na Fase 2. | [C] 57 clubes estavam abaixo de 18 jogadores ou de 2 goleiros, entre eles quase toda a Série A. Com uma lesão, o time não tinha reserva no gol. | A v0.4 removeu os "fillers" dos clubes brasileiros (l. 673) sem repor jogadores. |
| B20 | Média | **A torcida dos clubes ingleses e espanhóis estava em escala 35–100**, enquanto a dos brasileiros vinha em número de torcedores. Encontrado na Fase 2. | [C] O Arsenol FC tinha "100 torcedores": a bilheteria ficava em torno de R$ 150 por jogo e os produtos em R$ 3 por semana. | Unidades diferentes em `V05_FOREIGN_CLUBS` e `V04_STADIUMS`. |
| B21 | Baixa | **O gerador de nomes fictícios criou nomes de clube em jogadores.** Encontrado na Fase 2. | [C] O sobrenome "Santos" virou "Santista FC" (14 jogadores, também nas listas de nomes da base) e o apelido "Cuiabano" virou "Coiabanno", o mesmo nome do clube. Os convidados tinham 14 nomes repetidos dentro do mesmo elenco. | `tools/fictionalize.js` substitui texto sem distinguir clube de pessoa. |
| B15 | Baixa | Identidade de jogador baseada no nome. | [E] O id é `${clube}_${slug(nome)}_${idx}` (l. 72, 666, 864). `v04PatchExistingDb` (l. 679) casa jogadores pelo nome. `tools/fictionalize.js` não pode ser executado duas vezes. | Renomear, ou nomes fictícios repetidos, quebra a migração. |

Observações de equilíbrio do jogo (não são bugs, mas entram na revisão): apenas o time do usuário sofre lesões (l. 906), jogadores emprestados ganham jogos fictícios (l. 914) e o torneio continental é uma mini-liga só com o usuário e clubes convidados (l. 131).

Riscos de repositório:

- `blender-5.3.0-linux-x64/` tem **1,3 GB**, não está no `.gitignore` e pode ser commitado por acidente.
- `Soccer Game Pack.zip` (7 MB) e o zip da v0.5 também estão soltos no repositório.
- Os dois READMEs têm roteiros conflitantes: Godot + SQLite num, PostgreSQL + backend no outro.

### 1.4 Funcionalidades a preservar (checklist de aceitação)

Tudo o que está em `README.md` → "O que já existe" vira checklist de não-regressão:

- **Competições:** Séries A/B com acesso e rebaixamento, Copa, continentais, Liga Inglesa e Liga Espanhola.
- **Partida:** ao vivo, 5 substituições em 3 janelas, intervalo, troca de formação, mentalidade em 5 níveis.
- **Táticas:** arrastar e soltar, adequação de posição, pressão, ritmo e linha defensiva.
- **Gestão:** mercado (compra, empréstimo, pré-contrato, IA), passes livres, olheiros, base com 45 vagas e evolução mensal, finanças e estádio, objetivos e confiança, vagas de emprego.
- **Visual:** tema Modo Carreira, cartas por nível, modo claro e escuro.
- **Universo fictício:** gerador determinístico de nomes.

---

## 2. Estratégia de correção e prevenção de regressões

### 2.1 Princípios

1. **Nada de "v0.6 snapshot" por cima.** Cada correção altera a única definição ativa da função, ou leva o sistema para um módulo novo.
2. **Primeiro o teste, depois a correção.** Cada bug da tabela 1.3 vira um teste que falha antes da correção e passa depois.
3. **Sistemas isolados.** Calendário, finanças, partida, elenco e mercado só conversam por funções explícitas, sem mexer direto no estado global.
4. **Interface sem efeitos colaterais.** Renderizar nunca altera o estado. O reparo de save acontece **uma vez**, ao carregar, por migração versionada.

### 2.2 Ordem de trabalho

| Etapa | O que fazer | Saída verificável |
|---|---|---|
| 0. Congelar | Criar a tag `v0.5-legacy`, adicionar `blender-*/` e `*.zip` ao `.gitignore` e manter o legado jogável numa pasta separada. | Legado sempre disponível para comparação. |
| 1. Rede de segurança | RNG com semente (trocar `Math.random` por `rng()`). Executar o legado em Node com um DOM falso ou com o núcleo extraído. Gravar *golden masters* de cenários roteirizados: temporada completa BR, temporada PL, transferências, base. | `npm test` reproduz B1–B5 (vermelho). |
| 2. Invariantes | Checagens rodadas a cada dia simulado nos testes. | Testes de propriedade passam por 3 temporadas seguidas. |
| 3. Extração por risco | Calendário e temporada → finanças → motor de partida → elenco e escalação → mercado → base e olheiros → interface. Cada sistema vira um módulo com uma versão só da função, e o *golden master* é comparado a cada passo. | Diferenças apenas onde há bug corrigido e documentado. |
| 4. Save novo | IndexedDB, `schemaVersion` + cadeia de migrações, base estática fora do save, limites para notícias e lançamentos (resumo por temporada). | Carregar saves V02–V05 sem perda e com tamanho controlado. |
| 5. CI | GitHub Actions com `node --test`, ESLint (`no-func-assign`, `no-redeclare`, `no-implied-eval`) e TypeScript (`strict`). | Pull request bloqueado se algum teste falhar. |

**Invariantes mínimos** (cada um teria pegado um bug real):

- A data nunca diminui (B2).
- Todo jogo com data anterior a hoje está disputado (B4).
- A variação do caixa é igual à soma dos lançamentos financeiros, e há folha salarial a cada mês (B1).
- Toda competição iniciada termina antes de ser recriada (B3).
- O XI tem 11 jogadores do próprio clube, exatamente 1 goleiro e nenhum lesionado.
- `load(save(state))` reproduz o mesmo estado.
- O save cabe no limite definido.

**Processo por bug:** reproduzir num teste → corrigir na fonte única → rodar a suíte completa → registrar no CHANGELOG com o número do bug.

### 2.3 Decisão tomada: base modular direto (18/11/2026)

O legado **não recebe correções** (não haverá v0.5.1). Ele fica congelado na tag `v0.5-legacy` e tem três usos:

- **Referência de comportamento:** os *golden masters* registram só o que funciona corretamente no legado. Os bugs B1–B15 ficam de fora como resultado esperado.
- **Fonte dos dados:** clubes, elencos, estádios e nomes fictícios.
- **Fonte da interface:** o tema `theme-career.css` e o desenho das telas.

Os bugs B1–B15 viram **especificações** do novo `core`. Cada um é um teste escrito antes do módulo correspondente, que precisa falhar primeiro e passar depois.

---

## 3. Arquitetura web com adaptação futura para mobile

### 3.1 Pilha recomendada

| Camada | Escolha | Motivo |
|---|---|---|
| Linguagem | **TypeScript** (`strict`) | Os bugs atuais são de forma de dados e de contratos implícitos. Tipos pegam boa parte deles. |
| Build | **Vite** | Rápido, sem configuração pesada, faz *code-splitting* (o 3D só carrega quando a partida abre). |
| Interface | **Preact** (≈ 3 KB) | Componentes reaproveitáveis, sem custo de framework grande. `theme-career.css` é mantido. |
| Lógica | TS puro, **sem DOM**, num **Web Worker** | A tela não trava (resolve B8). O mesmo código roda em Node para testes e num servidor futuro. |
| Persistência | Interface `SaveStore` → **IndexedDB** (web) | Cota bem maior que `localStorage` e assíncrona. No mobile, troca-se apenas o adaptador. |
| 3D | **Three.js** (WebGL2) | Ver seção 4. |
| Servidor | O Node atual continua só servindo arquivos e `/api/health` | A lógica continua no cliente (jogo single-player e offline). O servidor só ganha função com save na nuvem. |

O roteiro com Godot 4 fica arquivado. Usar Godot significaria manter duas pilhas: a interface do manager em HTML e o runtime 3D em WebAssembly. O Three.js roda na mesma página e no mesmo pacote que o restante do jogo.

### 3.2 Estrutura de pastas proposta

```text
packages/
  core/          # regras, calendário, finanças, mercado, base (TS puro, determinístico)
  match-engine/  # motor de partida 2D baseado em ticks → MatchTimeline
  data/          # base de clubes/jogadores (JSON) + gerador de nomes fictícios
  match-viewer/  # visualização 2D (Canvas) e 3D (Three.js) da MatchTimeline
  input/         # camada de entrada (ações abstratas)
apps/
  web/           # interface do manager (Preact), PWA
  server/        # Node atual
tools/
  blender/       # scripts headless do pipeline de assets
  fictionalize/  # gerador de nomes (idempotente, por id e não por nome)
assets-src/      # FBX/Blender originais (fora do git ou via Git LFS)
```

### 3.3 Regras para manter a porta do mobile aberta

- Nenhum `window`, `document` ou `localStorage` dentro de `core` e `match-engine`. Esses recursos entram por **adaptadores** (save, relógio, RNG, áudio, vibração).
- Layout **mobile-first**:
  - Pontos de quebra em 360, 768, 1024 e 1440 px.
  - Alvos de toque com ≥ 44 px.
  - Nenhuma ação que dependa só de *hover*.
  - Pointer Events, que já são usados no arrastar.
  - Respeito às *safe areas* (`env(safe-area-inset-*)`).
- As tabelas densas ganham uma versão "cartão" em telas estreitas. O visualizador de partida funciona em paisagem e oferece rotação.
- **Orçamentos:**
  - JS inicial do manager < 300 KB comprimido.
  - Visualizador 3D carregado sob demanda.
  - Assets 3D < 8–10 MB no primeiro uso, com cache.
- **Caminho para o celular:**
  - **PWA**: manifest + service worker, instalável e offline.
  - **Capacitor** (Android/iOS), se e quando você decidir. Reaproveita o mesmo build e troca só os adaptadores (arquivos, vibração, tela cheia).

---

## 4. Simulação visual das partidas

### 4.1 Princípio

> **A simulação decide; a visualização representa.**

O resultado sai do motor, a partir dos atributos, das táticas, da energia e da moral. O 3D apenas reproduz a linha do tempo gerada. Uma partida assistida e uma simulada usam **o mesmo motor**, e por isso assistir não muda o resultado.

O que se toma como referência do Soccer Manager mobile é a ideia de **acompanhar o jogo por melhores momentos em 3D**, intercalados com placar, relógio acelerado e narração. Nenhum asset ou visual desse jogo deve ser copiado: o projeto tem universo e identidade próprios.

### 4.2 Arquitetura em três camadas

```text
┌───────────────┐   MatchInput (escalações, táticas, atributos, seed)
│ match-engine  │──────────────────────────────────────────────┐
│ (Worker)      │  step(dt, decisores) a 10 Hz                 │
└──────┬────────┘                                              │
       │ MatchTimeline (eventos + keyframes de 22 jogadores e bola)
       ▼                                                       │
┌───────────────┐   seleciona janelas importantes              │
│ highlights    │──► lista de "melhores momentos"              │
└──────┬────────┘                                              │
       ▼                                                       ▼
┌───────────────┐   reproduz, interpola, escolhe animações   estatísticas, notas,
│ match-viewer  │   2D (Canvas) ou 3D (Three.js)             narração (derivadas dos eventos)
└───────────────┘
```

**Motor (`match-engine`)**, um modelo híbrido de cadeias de posse com espaço contínuo:

- **Forma tática:** cada formação tem posições-base por fase (defesa, ataque e transição). Elas se deslocam conforme a posição da bola, a altura da linha, a largura e a pressão.
- **Portador da bola:** escolhe entre passe curto, passe em profundidade, lançamento, cruzamento, drible, condução, chute ou proteção. A escolha usa uma pontuação de utilidade que combina atributos, espaço livre, risco, mentalidade e uma variação aleatória com semente.
- **Resolução por duelos de atributos:** passe × interceptação, drible × desarme, chute × goleiro, cabeceio × marcação. A bola tem trajetória com altura (rasteira, alta, cruzada).
- **Jogadores sem bola:** *steering* (buscar a âncora tática, marcar, desmarcar, cobrir).
- **Energia, moral e forma** entram nos duelos e na velocidade. Substituições e mudança de formação alteram o estado do motor durante o jogo.
- **Determinismo:** a mesma `seed` e as mesmas entradas geram a mesma partida. Isso torna replays e testes reproduzíveis.
- **Dois níveis de fidelidade:**
  - Jogos da IA não assistidos usam um **modelo rápido**, estatístico e **calibrado com o motor completo** (milhares de partidas rodadas em Node), para que os dois produzam distribuições equivalentes.
  - O jogo do usuário sempre usa o motor completo.
- **Calibração:** rodar 10 mil partidas e comparar com faixas de ligas reais: gols por jogo, chutes, aproveitamento, posse e vantagem do mandante. Ajustar até ficar dentro das faixas.

**Contrato `MatchTimeline`** (versionado):

- `events[]`: tempo, tipo (`pass`, `dribble`, `tackle`, `shot`, `save`, `goal`, `foul`, `card`, `sub`, `injury`…), participantes, posições e parâmetros (força, altura, alvo).
- `frames`: posições de 22 jogadores e da bola, a 10 Hz nas janelas de melhores momentos e a 1–2 Hz no restante.
- Estatísticas, notas e narração são **derivadas** dos eventos. Isso elimina a inconsistência de B9.

**Melhores momentos:**

- Cada sequência recebe uma pontuação: gol = 1,0; pênalti, bola na trave, defesa difícil ou chance com xG > 0,3 = alta; cartão vermelho e lesão = média.
- Cada janela vai de 8–15 s antes do evento até 3 s depois.
- Entre as janelas aparecem placar, relógio acelerado, narração e o mini-campo 2D.
- O usuário pode **pular**, **rever** ou pedir **jogo completo em 2D**.

### 4.3 Visualizador 3D (Three.js)

| Tema | Solução |
|---|---|
| Movimento | Interpolação das posições entre keyframes (spline). A velocidade calculada escolhe a locomoção: parado, caminhada, trote, corrida, lateral ou de costas. A velocidade de reprodução se ajusta para evitar que o pé deslize. |
| Ações | O evento do motor dispara uma animação única (passe, chute, cabeceio, desarme, defesa, mergulho). Cada clipe tem um **frame de contato** nos metadados, alinhado ao instante do evento. |
| Goleiro | O alvo da bola em relação ao goleiro (lado e altura) escolhe o mergulho: baixo, alto, encaixe ou soco. O tempo de reação vem do atributo. |
| Bola | Segue a trajetória calculada pelo motor (parábola + efeito). O viewer não usa física própria. |
| Gol e comemoração | O autor do gol corre até a bandeira de escanteio ou para a torcida e faz uma comemoração sorteada. Os companheiros se aproximam e o adversário reage com uma animação de lamento. |
| Câmeras | Câmera de transmissão lateral, acompanhando a bola com amortecimento. Nos melhores momentos: atrás do gol, *close* no autor e replay em câmera lenta. |
| Desempenho | Geometria e esqueleto compartilhados (`SkeletonUtils.clone`), LOD por distância, material único por time (cores via *uniforms* + atlas para números), torcida com *billboards*/instâncias, sombra "blob" no mobile, qualidade adaptativa pelo FPS. |
| Metas | 60 fps em desktop e 30 fps em celular intermediário. No total, ≤ 100 *draw calls* e ≤ 150–250 mil triângulos. |
| Alternativa | **Visualizador 2D (Canvas)** com a mesma timeline: modo econômico, aparelhos fracos e primeira etapa de validação do motor. |

Three.js foi escolhido em vez de Babylon.js por ser menor, ter `GLTFLoader` e `AnimationMixer` (com *crossfade*) maduros e combinar bem com uma interface que não é um motor de jogo. Babylon.js continua sendo uma alternativa válida se surgirem necessidades de editor ou física pronta.

---

## 5. Pipeline de modelos e animações (Blender + Mixamo)

### 5.1 O que está disponível de fato (verificado)

| Recurso | Situação |
|---|---|
| **Blender 5.3.0** (`blender-5.3.0-linux-x64/`) | ✅ Roda em modo *headless* (`blender -b --python script.py`). No teste, a importação FBX e a exportação **glTF/GLB** funcionaram. |
| **Mixamo** | ❌ Sem acesso daqui. É um serviço web com login Adobe e não tem API pública oficial. **Nenhum download foi feito por mim.** |
| `Soccer Game Pack.zip` (baixado por você) | ✅ 55 FBX: **X Bot** + 54 clipes. Todos usam o mesmo esqueleto `mixamorig` (65 ossos, raiz `mixamorig:Hips`) a **30 fps**, e os clipes vêm **sem malha** (apenas animação). |
| Malha X Bot | ⚠️ 2 malhas e **49.112 triângulos**. É pesado para 22 jogadores no celular: precisa de LOD de cerca de 3–5 mil triângulos perto e cerca de 1–1,5 mil longe. |
| Movimento de raiz | ⚠️ "jog forward" **tem deslocamento de raiz** (cerca de 2,2 m em 26 frames, ≈ 2,5 m/s). Não é *In Place*. É preciso removê-lo por script e guardar a velocidade como metadado. |
| Teste de exportação | GLB com X Bot + 3 clipes = 2,1 MB sem compressão. |

**Clipes já disponíveis no pacote:**

- **Goleiro (21):** parado, passo lateral, encaixe, defesa com o corpo, mergulho, reposição com a mão e com o pé, colocar a bola, orientar a defesa, falhar.
- **Locomoção:** trote em 8 direções (frente, trás, laterais, diagonais), "offensive idle", "transition".
- **Ações com bola:** chute (2), embaixadinha, joelho (2), cabeceio (2), dominar, parar a bola (4), pênalti, bicicleta, lateral.
- **Defesa e quedas:** carrinho/desarme (3), rasteira, caído, levantar.

**Clipes que faltam:**

- Parado (jogador de linha, neutro).
- Caminhada.
- **Corrida rápida (sprint)**.
- Passe curto (o chute pode servir provisoriamente).
- **Drible e condução em corrida**.
- Virada de 90° e 180°.
- Domínio no peito.
- **Comemorações** (3–5 variações).
- Lamento ou frustração.
- Aplauso, para a reação da torcida ou do banco.
- Cumprimento.

### 5.2 O que depende de você

1. No Mixamo, com seu login Adobe, baixar os clipes que faltam:
   - Formato **FBX Binary**, **Without Skin**, **30 fps**, *Keyframe Reduction: none*.
   - Para locomoção, marcar **In Place** quando a opção existir.
   - Buscar por termos como *idle, walk, run, sprint, dribble, turn, celebration, victory, cheering, disappointed, clapping*. Os nomes exatos variam.
2. Escolher o **modelo base**: X Bot ou Y Bot como provisório, ou um personagem *low-poly* próprio, modelado ou comprado, com *rig* compatível com o Mixamo (pode ser feito pelo auto-rigger do próprio Mixamo).
3. Conferir os **termos atuais de uso da Adobe/Mixamo** antes de publicar. O uso em projetos costuma ser permitido, mas a redistribuição dos arquivos brutos não.
4. Colocar os arquivos em `assets-src/mixamo/` (fora do pacote publicado) e decidir entre **Git LFS** e manter os arquivos fora do git.

### 5.3 O que pode ser automatizado (scripts Blender headless + Node)

| Etapa | Ferramenta |
|---|---|
| Importação em lote, renomeação para nomes canônicos (`loc_jog_fwd`, `act_kick_r`, `gk_dive_l_high`…) e escala de cm para m | Python no Blender |
| Remoção do deslocamento de raiz (XZ do `Hips`) e registro de velocidade, duração e laço | Python no Blender |
| Espelhamento esquerda/direita (`mixamorig:Left*` ↔ `Right*`) para gerar variações | Python no Blender |
| Detecção do **frame de contato** (pico de velocidade do pé ou da mão), com revisão manual | Python no Blender + `animations.json` |
| Ajuste de laço dos ciclos de locomoção | Python no Blender |
| LODs da malha (*Decimate*) e união de malha + todos os clipes num **GLB** com um esqueleto | Python no Blender |
| Compressão (meshopt/Draco), reamostragem de keyframes e remoção de dados não usados | `@gltf-transform/cli` (Node) |
| Validação: ossos, fps, duração, escala e tamanho final, rodando no CI | Node + Python |
| Folha de contato: renderizar um GIF ou PNG de cada clipe para revisão visual | Blender (Eevee/Workbench) |

### 5.4 Variações visuais dos jogadores

Todos os jogadores partem de **um esqueleto e uma malha base**. As variações são geradas de forma **determinística a partir do id do jogador**:

- **Altura:** escala do esqueleto entre 0,92 e 1,08. No futuro, pode vir de um atributo de altura.
- **Tom de pele, cabelo e barba:** parâmetros de material + malhas de cabelo presas ao osso da cabeça.
- **Uniforme:**
  - O *shader* recebe as cores do clube, que já existem em `color` e `color2`, e uma máscara de padrão (liso, listras, faixas).
  - Número e nome nas costas vêm de um atlas gerado em `canvas`.
  - Goleiro usa paleta própria, e a chuteira tem cor variável.
- **Evolução visual:** trocar a malha base por uma melhor não muda o código, desde que mantenha o esqueleto `mixamorig` e os nomes de material.

### 5.5 Transições entre animações

- **Máquina de estados por jogador:** `Locomoção` → `Ação` (única, com bloqueio até o frame de recuperação) → `Reação` (queda, levantar) → `Comemoração`.
- **Locomoção por *blend*:** 1D pela velocidade (parado → caminhada → trote → corrida) e 2D pela direção (frente, lateral, costas), para defensores que acompanham de frente.
- ***Crossfade*** de 0,15 a 0,30 s com `AnimationAction.crossFadeTo`. A animação de ação começa antes do evento para que o frame de contato coincida com ele.
- No futuro: camadas aditivas de tronco (olhar para a bola) e IK de pé para acabar com o deslize.

---

## 6. Controles: teclado, gamepad e touchscreen

### 6.1 Camada de entrada (`packages/input`)

```text
Dispositivos ──► Bindings (JSON, remapeáveis) ──► Ações abstratas ──► Consumidores
Teclado/mouse      por contexto: menu,               Move(x,y), Sprint(0..1),     interface (menus)
Gamepad API        viewer, gameplay                  Pass, Shoot(carga), ...      visualizador (câmera, pular)
Toque (Pointer)                                                                   [futuro] jogador controlado
```

- **Teclado:** usar `KeyboardEvent.code` (tecla física), que independe do layout ABNT2, US ou outro.
- **Gamepad:** Gamepad API com *mapping* `standard`, lida a cada `requestAnimationFrame`. *Dead zone* radial e conexão e desconexão a qualquer momento.
- **Toque:** Pointer Events com vários toques simultâneos.
- **Estado por frame:** valores analógicos, pressionado, solto e tempo segurado (para "segurar para carregar força"), mais um **buffer de entrada** de cerca de 150 ms.
- **Ícones dinâmicos:** a interface mostra os ícones do último dispositivo usado (tecla, Xbox, PlayStation ou toque).
- **Nesta fase:** a camada só atende **menus** e o **visualizador** (pausar, acelerar, pular lance, câmera, substituição rápida).

### 6.2 Mapeamento proposto para o futuro modo jogável

O mapeamento segue a convenção consagrada dos jogos de futebol de console. Os botões têm função de ataque e de defesa conforme o contexto.

| Ação (ataque / defesa) | Gamepad (*standard*) | Teclado | Touch, modo botões |
|---|---|---|---|
| Mover | Analógico esquerdo | WASD / setas | Joystick virtual flutuante (metade esquerda) |
| Correr | RT (analógico) | Shift | Botão "Correr" ou joystick empurrado até a borda |
| Passe curto / pressionar | A | J | Botão "Passe" / "Pressão" |
| Chute (segurar = força) / desarme | B | K | Botão grande "Chute" / "Desarme" |
| Passe em profundidade / chamar goleiro | Y | L | Botão "Profundidade" |
| Cruzamento ou lançamento / carrinho | X | I | Botão "Lançamento" / "Carrinho" |
| Trocar jogador | LB | Q | Tocar no jogador ou botão "Trocar" |
| Modificador de finalização colocada / cobertura | RB | E | Gesto (deslizar curvo) |
| Proteger bola / acompanhar marcando | LT | Ctrl | Segurar o joystick com 2º dedo ou botão contextual |
| Drible ou habilidade | Analógico direito | Setas + Alt | Deslizar na metade direita |
| Pausa e táticas rápidas | Start / D-pad | Esc / F1–F4 | Ícone de pausa e menu radial |

**Touchscreen (referência: eFootball mobile):**

- Dois esquemas:
  - **Botões:** joystick + 4 a 6 botões em arco, com rótulos que mudam entre ataque e defesa.
  - **Gestos:** tocar no companheiro para passar, deslizar para chutar ou lançar, tocar no espaço para passe em profundidade.
- Joystick **flutuante**, que aparece onde o polegar toca.
- Botões de 48–56 px.
- Layout **editável** (posição, tamanho, opacidade) e salvo por aparelho.
- Vibração quando disponível.
- **Acessibilidade:**
  - Correr segurando ou alternando com um toque.
  - Níveis de assistência de passe e chute.
  - Layout espelhado para canhotos.
  - Remapeamento completo em todos os dispositivos.

### 6.3 Como a arquitetura prepara o modo jogável

O motor de partida trabalha com `step(dt, decisores)`. Cada jogador recebe um **decisor**:

- Hoje, todos os decisores são **IA** (função de utilidade).
- No futuro, o jogador controlado recebe um **decisor humano**, que lê as ações da camada de entrada.
- O restante (física da bola, duelos, IA dos outros 21) não muda.

No modo manager, o motor roda acelerado e grava a timeline. No modo jogável, ele roda em tempo real e o viewer desenha o estado vivo. **Um único motor serve os dois modos.**

---

## 7. Etapas de implementação

| Fase | Entregas | Critério de pronto | Depende de você |
|---|---|---|---|
| **0. Planejamento** (agora) | Este documento | Aprovação | Decisões da seção 8 |
| **1. Rede de segurança** | Tag `v0.5-legacy`, `.gitignore`, esqueleto Vite + TS + `node --test`, RNG com semente, *golden masters* do comportamento correto do legado, B1–B15 como testes de especificação, invariantes | Testes rodam no CI; especificações de B1–B15 em vermelho, aguardando os módulos | — |
| **2. Fundação modular** | Vite + TS, `core` extraído por sistema, calendário multi-temporada (BR jan–dez, Europa ago–mai, data global contínua, fila de eventos processada até esvaziar), finanças por competência mensal, save IndexedDB com migrações, Worker | B1–B15 corrigidos, invariantes verdes por 5 temporadas, saves V02–V05 carregam | Testar jogando |
| **3. Interface portada** | Telas em Preact com o tema atual, responsivas, sem `onclick` em string, sem reparo durante a renderização | Checklist 1.4 completo em desktop e celular (navegador) | Feedback visual |
| **4. Motor de partida + viewer 2D** | `match-engine` com timeline, modelo rápido calibrado, melhores momentos em 2D, narração e estatísticas derivadas | 10 mil jogos dentro das faixas de referência; ao vivo, simulado e IA usam o mesmo motor | — |
| **5. Pipeline de assets** | Scripts Blender, `animations.json`, GLB com LODs e compressão, validação no CI | GLB < 8–10 MB com todos os clipes; folha de contato aprovada | Downloads do Mixamo e escolha do modelo |
| **6. Viewer 3D MVP** | Campo, 22 jogadores, locomoção com *blend*, passes, chutes e defesas do goleiro, câmera de transmissão, carregamento sob demanda | 60 fps no desktop e ≥ 30 fps num celular intermediário; os lances 3D batem com os eventos | Celular para teste |
| **7. Melhores momentos completos** | Câmeras de replay, comemorações, uniformes e variações, estádio e torcida, qualidade adaptativa, PWA | Partida assistível do início ao fim por melhores momentos | Avaliação visual |
| **8. Camada de entrada** | Teclado, gamepad e toque para menus e viewer; protótipo isolado de "controlar 1 jogador" atrás de *feature flag* | Navegação completa por gamepad; protótipo jogável em ambiente de teste | Testar com controle físico |
| **9. Futuro** | Capacitor (Android/iOS), modo jogável completo, saves na nuvem | — | Decisão de plataforma |

---

## 7.1 Status da Fase 1 (rede de segurança)

| Item | Onde | Situação |
|---|---|---|
| `.gitignore` (Blender, zip do pacote, `assets-src/`, `node_modules/`) | `.gitignore` | ✅ |
| Workspace TS (TypeScript 7, `strict`), testes com `node --test` sem build | `package.json`, `tsconfig.json` | ✅ |
| RNG com semente, serializável, com fluxos derivados | `packages/core/src/rng.ts` | ✅ |
| Datas ISO em UTC (meses atravessados, diferenças) | `packages/core/src/dates.ts` | ✅ |
| Invariantes (data, folha, jogos passados, competições, caixa × extrato, escalação) | `packages/core/src/invariants.ts` | ✅ |
| Harness que roda o legado em Node com semente, sem alterá-lo | `packages/legacy-harness/` | ✅ |
| Reproduções automáticas de B1–B5, B7, B8, B16–B18 | `packages/legacy-harness/test/legacy-bugs.test.ts` | ✅ |
| Golden master estatístico (8 sementes) + guarda de "legado congelado" | `packages/legacy-harness/fixtures/characterization.json` | ✅ |
| Especificações do novo core (B1–B18) como `todo` | `packages/core/test/specs.test.ts` | ✅ |
| CI (tipos + testes + sintaxe do legado) | `.github/workflows/ci.yml` | ✅ (roda após o push) |
| Tag `v0.5-legacy` | git | ⏳ depende do commit das alterações pendentes do legado |
| Vite | — | Adiado para a Fase 3 (só é necessário com a interface) |

**Comandos:**

- `npm test`: tudo, cerca de 1 min.
- `npm run test:core`: rápido.
- `npm run test:legacy`: reproduções do legado.
- `npm run characterize`: regera o golden master.

## 7.2 Status da Fase 2 (fundação modular)

### Calendário (`packages/core/src/calendar/`): ✅

**Modelo:**

- O mundo é organizado em **ciclos de temporada** independentes:
  - Brasil: temporada "2026", abertura em 10/01, com Série A, Série B e Copa Nacional.
  - Inglaterra e Espanha: temporada "2026/27", abertura em 01/07.
- Cada temporada de competição tem um id próprio (`brA@2026`, `pl@2026/27`) e só é arquivada depois de terminar.
- Tudo passa por uma **fila de eventos** processada em ordem cronológica: abertura de temporada, eventos mensais e semanais, e jogos. Os jogos criados durante um avanço, como as fases da copa, entram na mesma fila.
- O placar vem de um `ResultProvider` injetado. O calendário não depende do motor de partida.
- Cada partida tem um fluxo de sorteio próprio (`match:<id>`).
- Os ids dos jogos são estáveis e legíveis: `copa@2026/r1/bra03-brb07`.

**Bugs resolvidos e cobertos por testes** (`packages/core/test/calendar.test.ts`):

| Bug | Como foi resolvido |
|---|---|
| B2 | `advanceTo` recusa datas anteriores. A carreira pode começar na abertura do ciclo do clube; numa carreira inglesa, o primeiro jogo vem em até 60 dias e o Brasil já está em andamento. |
| B3 | A temporada europeia termina com campeão e a seguinte abre sozinha, sem depender da virada brasileira. |
| B4 | A Copa termina no mesmo salto em que suas fases são criadas (31 jogos e campeão). |
| B11 | A abertura de uma temporada espera a anterior terminar. Se abrir atrasada, os jogos são remarcados para depois. |
| B16 | A Copa Nacional só aceita clubes do país. |
| B18 (calendário) | Os eventos semanais e mensais rodam na própria data. |

**Propriedades verificadas:**

- Saltar de uma vez ou avançar em passos aleatórios produz **o mesmo mundo**.
- Ao longo de três temporadas, as invariantes valem a cada passo e nenhum clube joga duas vezes no mesmo dia.
- A pausa no jogo do usuário nunca pula nem deixa jogo no passado.
- O acesso e o rebaixamento (4 × 4) acontecem na abertura da temporada brasileira seguinte.

**Ainda não incluído:** as competições continentais e a qualificação para elas, que o legado só criava para o clube do usuário.

### Finanças (`packages/core/src/finance/`): ✅

**Extrato:**

- O saldo só muda por `receive`, `spend` ou `charge`, e cada chamada gera um lançamento. Não existe alteração solta do saldo.
- `spend` recusa a operação quando falta caixa e não altera nada. O legado chegava a pagar luvas parciais em silêncio.
- `charge` é para saídas obrigatórias, como a folha, que pode deixar o caixa negativo.
- Uma `ref` única por lançamento impede cobrança em dobro (ex.: `gate:<jogo>`).

**Fórmulas:** bilheteria, produtos e aporte da diretoria usam os mesmos números da v0.5. Os testes conferem os valores exatos.

**Integração com o calendário:**

- O calendário ganhou o gancho `onEvent`, que avisa no instante de cada evento, e `recordResult` passou a aceitar o mesmo ouvinte.
- `createFinanceListener` faz os lançamentos de cada evento:

  | Evento | Lançamento |
  |---|---|
  | Dia 1 do mês | Folha salarial |
  | Toda semana | Produtos e camisas |
  | Jogo em casa | Bilheteria |
  | Nova temporada do ciclo do clube | Aporte da diretoria (só a partir da segunda) |

- O aporte é decidido pelo estado salvo, e por isso continua correto depois de carregar um save.

**Testes** (`packages/core/test/finance.test.ts`):

- B1 numa temporada inteira, com as invariantes completas a cada passo: 11 folhas pagas e o caixa batendo com o extrato.
- Avançar de 3 em 4 dias dá o mesmo extrato que avançar de uma vez. Esse era o bug latente da receita semanal na v0.4.
- O aporte vem só a partir da segunda temporada e continua correto depois de recarregar.
- A bilheteria do jogo ao vivo entra na data do jogo.

### Elenco e escalação (`packages/core/src/squad/`): ✅

**Regras portadas da v0.3 e da v0.4:**

- Posições, zonas e adaptação: posição natural (+1), secundária (0), improviso (−1 a −5, aliviado por atributos), goleiro ↔ linha proibido.
- OVR na função, com piso de 40.
- As 6 formações com as mesmas coordenadas.
- Pontuação da escalação automática: a posição natural vale mais que um OVR maior improvisado.

**Escalação:**

- `Lineup` tem XI, banco de 9 e reservas. Todo jogador do elenco aparece exatamente uma vez, e os lesionados ficam nas reservas.
- `autoLineup` só roda quando pedido.
- `reconcileLineup` (correção de B6) mexe apenas no que ficou inválido:
  1. Tira quem saiu do clube ou se lesionou.
  2. Preenche o slot vago com o melhor do banco para aquela posição; se ninguém do banco serve, usa as reservas.
  3. Repõe no banco só as vagas abertas agora.
  4. Coloca contratações nas reservas.

  Ela devolve a lista de mudanças para a interface avisar o usuário. Uma escalação válida não muda.
- `swapPlayers` é a operação do "⇄ Trocar" (B5). Recusa lesionado no time, goleiro na linha e jogador fora do elenco.
- `changeFormation` mantém os mesmos titulares sempre que possível.

**Testes** (`packages/core/test/squad.test.ts`):

- Paridade das regras de adaptação.
- Uma lesão troca só o slot afetado, usando o reserva natural da posição.
- A escolha do usuário sobrevive a uma venda em outra posição. O legado voltaria a escalar o time "ideal".
- Contratação entra nas reservas.
- Reconciliar duas vezes dá o mesmo resultado.
- Propriedade com 300 eventos aleatórios (lesões, vendas, contratações, trocas, passagem de tempo): a escalação nunca fica inválida e cada jogador aparece uma vez.
- A troca de 4-2-3-1 para 4-4-2 mantém os titulares.

**Fica para a Fase 3:** guardar a seleção do "⇄ Trocar" no estado da tela e mostrar as mudanças como aviso.

### Evolução (`packages/core/src/development/`): ✅

**Causa de B17 (confirmada com os dados reais):**

- O legado recalculava o OVR como média simples dos atributos.
- Os atributos foram gerados com perfil de posição, então mais de 70% dos jogadores perdiam 3 pontos ou mais no primeiro "ganho" de evolução. Os goleiros perdiam 8.

**Correção:**

- O OVR passa a ser uma média ponderada por posição (`POSITION_WEIGHTS`). O goleiro mantém a fórmula da v0.4.
- `calibrateAttributes` ajusta os atributos importados para reproduzir o OVR cadastrado, preservando o perfil do jogador.
- `developMonth` mantém a curva da v0.5 (idade, minutos, moral, forma, potencial). Cada nível sobe exatamente +1, evoluindo os 3 atributos principais da posição.
- O declínio começa pelo físico.
- Minutos são medidos como taxa de participação.
- Emprestados não ganham mais jogos fictícios.

**Testes:**

- `packages/core/test/development.test.ts`: pesos, calibração em 500 casos aleatórios, jovem ativo × inativo, curva por idade, veterano ativo × parado, efeito do potencial e o goleiro com perfil da v0.5.
- `packages/legacy-harness/test/development-vs-legacy.test.ts`: os 1.564 jogadores reais da v0.5 calibrados com o OVR exato. Numa temporada, os jovens até 21 anos ganham em média **+2,35**, contra −2,70 no legado, e nenhum jovem cai.

**Observação de equilíbrio:** com a curva da v0.5, veteranos de 32+ quase não declinam na primeira temporada (média 0,0, igual ao legado). Se quiser um declínio mais visível, isso é um ajuste de parâmetro.

### Dados (`packages/data/`): ✅

**Extração:**

- `npm run extract-data` roda a v0.5 no harness e converte a base final (todas as camadas aplicadas, nomes fictícios) para `src/data/*.json`, com um registro por linha para os diffs ficarem legíveis.
- O teste `data-extraction.test.ts` garante que os arquivos são exatamente reproduzíveis a partir do legado.
- O potencial, que era sorteado a cada carreira, fica fixo com a semente 1.

**Modelo:**

- `ClubData`: país em código (BR, ENG, ESP…), divisão, cores, estádio e torcida.
- `PlayerData`: id `p00001…`, nacionalidade em código, atributos calibrados, salário, valor, contrato e a flag `generated`.
- `legacy-id-map.json`: id antigo → id novo, para migrar saves (B7).

**Correções feitas na conversão:**

| Bug | Correção |
|---|---|
| B15 | Ids independentes do nome. Renomear todos os jogadores não quebra nenhuma referência. |
| B17 | OVR coerente com os atributos em todos os jogadores. |
| B19 | 303 jogadores gerados completam 73 elencos de liga (mínimo de 3 goleiros e cobertura de todas as posições). Eles têm OVR um pouco abaixo da média do clube, salário proporcional e nomes fictícios únicos por país. |
| B20 | A torcida em índice foi convertida para torcedores (× 400 mil; 100 → 40 milhões). |
| B21 | "Santista FC" → "Santana" e "Coiabanno" (jogador) → "Coiabinho". Os nomes repetidos nos convidados foram trocados. |

Também foram padronizados os países e as nacionalidades, que misturavam português e inglês ("Brasil"/"Brazil", "Uruguai"/"Uruguay").

**Validação:** `validateDatabase` cobre ids, referências, posições, OVR × atributos, potencial, faixa de atributos, nacionalidade, nome de clube em jogador, nome repetido no elenco, tamanho das ligas e mínimo por posição.

**Adaptadores:** `calendarClubs`, `squadOf` e `clubEconomy` ligam os dados ao calendário, à escalação e às finanças.

**Teste de integração:** uma temporada inteira com os 80 clubes e elencos reais respeita as invariantes. Todos os clubes escalam um XI válido, o campeão da Série A está entre os mais fortes e a Copa só tem clubes brasileiros.

### Save (`packages/core/src/save/` e `packages/data/src/career.ts`): ✅

**Formato:**

- Envelope `soccer-manager-save` com `schemaVersion` e uma cadeia de migrações (v1 → v2 → …). Acaba a troca de chave de `localStorage` a cada versão.
- Saves corrompidos, de versão futura ou sem migração são recusados com o motivo.
- O save guarda só o estado dinâmico: calendário, extrato, escalação, o que muda nos jogadores e as notícias (até 200). Nomes e dados de base vêm de `@sm/data`.

**Gravação segura:** `writeSave` verifica o limite de 2,5 milhões de caracteres antes de gravar. Se o armazenamento falhar (cota), o save anterior continua intacto e o estado em memória não muda. `SaveStore` é a interface; `MemoryStore` existe para os testes, e o adaptador de IndexedDB vem na Fase 3.

**Compactação:** `compactCalendar` remove os jogos de temporadas encerradas e mantém tabelas e campeões.

| Situação | Tamanho do save |
|---|---|
| Carreira nova | 0,53 milhão de caracteres (v0.5: 1,3 milhão) |
| Após 3 temporadas, sem compactar | 2,2 milhões |
| Após 3 temporadas, compactado | 1,08 milhão |

Por isso a compactação precisa rodar a cada abertura de temporada, o que fica para a integração da Fase 3.

**Carreira e importação:**

- `createCareer` monta uma carreira nova a partir da base.
- `importLegacySave` converte um save da v0.5 usando o `legacy-id-map`. Preserva clube, técnico, caixa, divisões, transferências, estado dos jogadores e a escalação, reconciliada.

**Limitação assumida:** a temporada em andamento no save antigo não é reconstruída, porque o calendário antigo tinha B2–B4. A carreira importada continua na temporada seguinte. O caixa vem como está, inflado pelo B1.

**Testes:**

- Ida e volta sem perda.
- Save sem a base estática.
- Migração em cadeia.
- Recusa de save inválido.
- Limite de tamanho.
- Cota estourada preservando o save anterior.
- Compactação após 3 temporadas com as invariantes valendo.
- Importação de um save real da v0.5 (Flamengo, junho de 2026): elenco completo, XI válido e save novo menor que o antigo.

### Próximos módulos da Fase 2

1. ~~**Finanças**~~ ✅
2. ~~**Elenco e escalação**~~ ✅
3. ~~**Evolução**~~ ✅
4. ~~**Dados**~~ ✅
5. ~~**Save**~~ ✅

**A Fase 2 está concluída.** Ainda faltam:

- O motor de partida (Fase 4). Por enquanto o placar vem de um `ResultProvider`.
- Mercado, olheiros e base.
- Competições continentais.
- A "camada de jogo" que liga tudo no `onEvent`.

O próximo passo natural é a **Fase 3 (interface)** ou a camada de jogo que ela vai usar.

### Camada de jogo (`packages/game/`): ✅

A classe `Game` é a única peça que a interface precisa usar. Ela oferece `Game.create`, `advance(data, { stopAtUserMatch })`, `playUserMatch`, `squad`, `snapshot`, `save` e `Game.load`.

Todos os módulos reagem ao calendário (`onEvent`) na data de cada evento:

| Evento | O que acontece |
|---|---|
| Jogo disputado | Bilheteria, jogos na temporada e desgaste dos titulares |
| Toda semana | Produtos e camisas; lesões no elenco do usuário (taxa da v0.5), com escalação reconciliada e aviso nas notícias |
| Todo mês | Folha salarial, recuperação física e evolução de todos os jogadores |
| Nova temporada do ciclo | Idade +1 e contratos −1 (exceto na primeira temporada da carreira), jogos zerados, aporte da diretoria e compactação do save |
| Competição encerrada | Notícia com o campeão |

Os resultados usam o modelo rápido da v0.4 (Poisson pela força do XI). O time do usuário entra com a escalação escolhida; os outros, com a automática. Esse modelo será substituído pelo motor da Fase 4.

**Testes** (`packages/game/test/game.test.ts`, com a base real):

- Uma temporada com as invariantes **completas** a cada passo: data, jogos, folha, caixa × extrato e escalação.
- Os jovens de todos os clubes evoluem, as lesões acontecem e os titulares acumulam jogos.
- Um salto único e passos variados geram a **mesma carreira**.
- Após 3 temporadas: idade +3, 3 aportes e save compactado abaixo de 1,3 milhão de caracteres.
- Jogo ao vivo: o avanço para no dia, o resultado é registrado, e salvar → carregar continua a carreira de forma idêntica.

**Desempenho:** cerca de 2,8 s por temporada em Node. Na web, isso vai rodar num Web Worker (Fase 3).
3. **Evolução:** OVR coerente com os atributos (B17).
4. **Dados:** extrair clubes e jogadores do legado para `packages/data` (B15).
5. **Save:** versão de schema e migrações (B7).

## 7.3 Status da Fase 3 (interface web)

### MVP jogável (`apps/web/`, Vite 8 + Preact 10): ✅

```bash
npm run web:dev    # http://localhost:5173
npm run web:build  # apps/web/dist
```

**Arquitetura:**

- A carreira (`@sm/game`) roda num **Web Worker** (`src/worker.ts`). A tela só envia comandos e desenha a `View` que recebe (`src/protocol.ts`), então a interface não trava (B8).
- O save fica no **IndexedDB** (`src/idb-store.ts`, mesmo contrato do `MemoryStore`) e é gravado após cada ação: só em pontos de controle.
- O estado de tela (aba ativa e seleção para troca) vive no Preact e nunca vai para o save (B5). Todo texto passa pelo Preact, que escapa HTML (B14).

**Telas:**

| Tela | Conteúdo |
|---|---|
| Nova carreira / continuar | Nome do técnico, clube agrupado por liga, carreira salva |
| Painel | Próximo jogo, posição, últimos resultados, notícias, avançar 1 semana ou 1 mês. O botão **Continuar** para no dia do jogo e vira **Jogar partida** |
| Elenco e tática | Campo com o XI, banco e reservas. Tocar em dois jogadores e "⇄ Trocar"; formação; escalar automático; tabela de jogadores |
| Competições | Classificação com zonas e o clube do usuário destacado; jogos das copas; campeões |
| Finanças | Caixa, folha, totais do ano por tipo, extrato e tamanho do save |

**Visual:** tokens do tema Modo Carreira da v0.5 (cores, tipografia condensada, OVR em níveis especial/ouro/prata/bronze), cor do clube aplicada à interface, modo claro e escuro pelo sistema.

**Layout mobile-first:** abas embaixo no celular e barra lateral a partir de 768 px; alvos de toque de pelo menos 44 px; sem rolagem horizontal em 375 px.

**Verificado no navegador:**

- Carreira nova com o Corintianos.
- Avanço parando no dia do jogo, com a partida simulada (2 × 0).
- Troca por clique entre titular e reserva funcionando (B5).
- Folha salarial no extrato (B1).
- Recarregar a página → "Continuar carreira salva" volta ao mesmo ponto.
- Classificação na liga do usuário.
- Layouts de 375 px e de desktop.

**Bundles:** tela com 26 KB (10 KB gzip); worker com 631 KB, quase tudo a base de dados.

**O CI agora também checa os tipos e faz o build da interface.**

### Mercado e base (`packages/core/src/market/`, `Game`): ✅

Portados da v0.5 com as mesmas fórmulas: chance de compra pela oferta, empréstimo por 4% do valor, propostas recebidas de 80% a 125% do valor, mercado da IA, relatório da base a cada 90 dias com OVR/POT pelo nível (1–10). Novos: contratos vencem (usuário perde o jogador, IA renova), rescisão paga metade dos salários restantes, empréstimos voltam na abertura da temporada. Save v2 (migração v1 → v2 cria o mercado). Testes em `packages/game/test/market.test.ts` com invariantes de transição em cada ação.

### Diretoria e olheiros (`packages/core/src/board/`, `Game`): ✅

Da v0.5: objetivos com pesos (liga 45, copa 25, finanças 20, elenco 10), confiança da diretoria (objetivos × .45 + últimos 8 jogos × .4 + caixa × .15) e da torcida, nota do técnico por resultado, exigência mínima de nota por clube, olheiros com custo crescente e relatório de 4 + nível nomes. Novos: avaliação no fim da liga com demissão (avaliação < 45 e confiança < 45) e propostas de emprego; a confiança da torcida alimenta bilheteria e produtos; troca de clube recria caixa, elenco e objetivos. Save v3. Testes em `packages/game/test/board.test.ts`.

### Copas continentais, Copa Nacional em ida e volta e pré-contrato: ✅

Bugs de regulamento da v0.5 corrigidos: a Taça Continental era um pontos corridos entre o clube do usuário e 5 convidados; a Sul-Continental tinha grupos fixos no código; a vaga ia do 1º ao 4º (Taça) e do 5º ao 8º (Sul), sem vaga para o campeão da Copa; a Copa Nacional era em jogo único. Agora (`packages/core/src/calendar/continental.ts`): vagas pela ordem da CBF, grupos por potes, 3º da Taça caindo na Sul-Continental, ida e volta sem gol fora e final única. Escala reduzida (16 e 8 clubes) por causa do universo de 48 clubes sul-americanos. Pré-contrato nos últimos 6 meses (Lei Pelé/Bosman). Testes em `packages/game/test/continental.test.ts`.

**Falta na Fase 3:**

- Nada do legado além da partida ao vivo (Fase 4).
- Partida ao vivo com narração (depende do motor da Fase 4).
- Importar save da v0.5 pela interface.
- PWA (manifest e service worker).
- Avisos de mudança de escalação como toast.

## 8. Decisões que dependem de você

1. ~~**Legado:** v0.5.1 ou base modular~~ → **Decidido: base modular direto** (ver 2.3).
2. **Assets:** guardar os arquivos do Blender e do Mixamo com Git LFS ou fora do repositório.
3. **Modelo do jogador:** X Bot provisório ou personagem *low-poly* próprio desde o início.
4. **Nome do projeto:** "Soccer Manager" coincide com uma franquia comercial existente. Se houver intenção de publicar, vale escolher outro nome antes da identidade visual.
