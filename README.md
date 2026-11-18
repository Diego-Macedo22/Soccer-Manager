# ⚽ Soccer Manager — Modo Carreira

Jogo de gerenciamento de futebol focado em **modo carreira**: você assume um clube, monta o elenco, define a tática, negocia no mercado e tenta cumprir os objetivos da diretoria temporada após temporada.

A proposta mistura a **profundidade de um manager** (tabelas densas, finanças, base, olheiros, calendário) com a **apresentação de um jogo de futebol moderno** (cartas de jogador, notas por nível, tipografia de transmissão, partidas ao vivo).

> **Universo fictício.** O jogo não tem licença de clubes, ligas, competições ou atletas. Todos os nomes são variações inspiradas no futebol real, no estilo dos jogos de futebol não licenciados: *Yuri Alberto* vira **Yuri Alpirto**, *Neymar* vira **Naimer**, *Corinthians* vira **Corintianos**. As cores dos clubes foram mantidas, mas escudos, patrocinadores e marcas não são usados.

---

## Versão atual: 0.6.0-dev

O jogo está sendo reconstruído sobre uma **base modular em TypeScript**. A v0.5 acumulou sete camadas de remendo no mesmo `app.js`, e cada correção numa camada desfazia outra. A nova base separa as regras do jogo da interface, roda a carreira num Web Worker e protege cada sistema com testes.

| Parte | Situação |
|---|---|
| **v0.6 (web, `apps/web`)** | MVP jogável: nova carreira, painel, elenco e tática, competições e finanças. |
| **v0.5 legado (`game/`)** | Congelada como referência e para os testes de regressão. Continua jogável. |

O diagnóstico, as decisões e o andamento de cada fase estão em [docs/PLANEJAMENTO-FASE1-COMPLEMENTO.md](docs/PLANEJAMENTO-FASE1-COMPLEMENTO.md).

## Modos de jogo

| Modo | Situação |
|---|---|
| **Carreira de Técnico** | Disponível. Escolha um dos clubes e gerencie tudo. |
| **Carreira de Jogador** | Planejado. Crie um atleta, evolua atributos, dispute posição no elenco e receba propostas. |

## O que já existe na v0.6

**Carreira (`packages/game`)**
- Calendário multi-temporada: Brasil de janeiro a dezembro e Europa de agosto a maio, com data global contínua (corrige a data que voltava 7 meses e as ligas europeias que nunca terminavam)
- Liga Nacional, Copa Nacional e ligas inglesa e espanhola simuladas em paralelo
- Finanças por mês: folha salarial cobrada (antes nunca era), bilheteria, produtos e aporte da diretoria, com extrato que bate com o caixa
- Elenco e escalação: formações, adequação à posição, escalação automática e troca de titular por clique
- Evolução mensal dos jogadores com OVR coerente com os atributos, lesões, desgaste, idade e contratos a cada temporada
- Save versionado, com migrações e conversão de saves da v0.5 (a importação pela interface ainda falta)
- Resultados pelo modelo rápido da v0.4 (Poisson pela força do XI), até o motor de partida da Fase 4 ficar pronto

**Interface web (`apps/web`, Vite + Preact)**
- Nova carreira e "continuar carreira salva"
- Painel com próximo jogo, posição, últimos resultados e notícias; avança 1 semana ou 1 mês e para no dia do jogo
- Elenco e tática com campo, banco e reservas; Competições com classificação e zonas; Finanças com caixa, folha e extrato
- A carreira roda num **Web Worker**, então a tela não trava
- Save no **IndexedDB**, gravado após cada ação
- Layout mobile-first: abas embaixo no celular e barra lateral a partir de 768 px; modo claro e escuro pelo sistema

**Base de dados (`packages/data`)**
- Clubes e jogadores com nomes fictícios, extraídos do legado e validados por testes

**Ainda falta na v0.6** (existe só na v0.5): mercado, olheiros, categoria de base, competições continentais, partida ao vivo com narração, PWA.

## O que existe na v0.5 legado

**Competições e temporada**
- Liga Nacional Séries A e B (20 + 20 clubes), com acesso e rebaixamento de 4 clubes
- Copa Nacional (mata-mata)
- Taça Continental e Copa Sul-Continental, com grupos e clubes convidados da América do Sul
- Liga Inglesa e Liga Espanhola (20 clubes cada) simuladas em paralelo
- Calendário completo, janelas de transferência, pré-temporada e virada de temporada com histórico

**Partidas**
- Partida ao vivo minuto a minuto, com posse, finalizações, fadiga e campo 2D
- 5 substituições em 3 janelas, intervalo automático e troca de formação durante o jogo
- Mentalidade em 5 níveis (Ultradefensivo → Ultraofensivo) com efeito real no ataque, na defesa e no ritmo
- Simulação rápida dos outros jogos (modelo de Poisson baseado na força dos elencos)
- Artilharia, assistências e melhores notas por competição

**Elenco e tática**
- Formações com arrastar e soltar, adequação do jogador à posição e escalação automática
- Pressão, ritmo e altura da linha defensiva
- Atributos (velocidade, finalização, passe, drible, marcação, físico e reflexos), OVR, potencial e características
- Energia, moral, forma, lesões e contratos

**Gestão do clube**
- Mercado: compra, empréstimo, pré-contrato, lances de clubes rivais e mercado da IA
- Agentes livres
- Olheiros com missões e relatórios
- Categoria de base com geração de jovens e evolução mensal
- Finanças com extrato (bilheteria, produtos, salários), estádios e orçamento
- Objetivos da diretoria, confiança da torcida, nota do técnico e propostas de outros clubes

**Base de dados**
- 88 clubes e mais de 1.300 jogadores com nomes fictícios, além dos jovens gerados pela base
- Data de referência dos elencos: 02/10/2026

## Visual

O tema **Modo Carreira** (`game/frontend/css/theme-career.css`) traz:
- Cor do clube atual aplicada na barra superior, no menu e nos destaques
- Notas no estilo carta: **especial** (85+), **ouro** (78+), **prata** (70+) e **bronze**
- Ficha do jogador em formato de carta, com tipografia condensada de transmissão
- Tabelas compactas, com faixas de classificação e rebaixamento
- Modo escuro (padrão) e claro

A v0.6 reaproveita os mesmos tokens do tema (cores, tipografia condensada e níveis de OVR).

## Como rodar

Requer **Node.js 24+**.

```bash
npm install
```

**v0.6 (interface web):**

```bash
npm run web:dev
```

Abra `http://localhost:5173`. Para gerar a versão de produção em `apps/web/dist`:

```bash
npm run web:build
```

**v0.5 legado:**

```bash
npm run legacy:start
```

Abra `http://localhost:3000`. O save da v0.5 fica no `localStorage`.

**Testes e verificações:**

| Comando | O que faz |
|---|---|
| `npm test` | Todos os testes (cerca de 1 min) |
| `npm run test:core` | Só as regras do jogo (rápido) |
| `npm run test:legacy` | Reproduções dos bugs do legado |
| `npm run typecheck` | Tipos em modo `strict` nos pacotes e na web |
| `npm run characterize` | Regera o golden master do legado |
| `npm run extract-data` | Extrai clubes e jogadores do legado para `packages/data` |

O CI (`.github/workflows/ci.yml`) roda tipos, testes, build da web e sintaxe do legado a cada push.

## Nomes fictícios

Os nomes são gerados por regras determinísticas, como troca de consoantes (t↔d, p↔b), queda de letras, troca de vogais e variações de grafia. O mesmo nome real sempre gera o mesmo nome fictício.

| Arquivo | Função |
|---|---|
| `game/frontend/js/fictional-names.js` | Regras de geração, nomes dos clubes, estádios e competições definidos à mão |
| `game/tools/fictionalize.js` | Script que aplicou os nomes na base do jogo (`app.js`) |

- Saves antigos, com nomes reais, são convertidos automaticamente ao carregar a carreira.
- Para ajustar o nome de um clube ou estádio, edite `FN.CLUBS` em `fictional-names.js`. O jogo usa esse mapa nos saves antigos. Em carreiras novas o nome vem de `app.js`, então altere nos dois lugares, ou restaure o `app.js` original pelo git e rode o script de novo.
- O script deve ser executado **uma única vez** sobre a base real. Rodar de novo sobre nomes já fictícios gera uma nova variação.

## Estrutura

```text
apps/
└── web/                    # interface v0.6 (Vite + Preact)
    └── src/
        ├── app.tsx         # telas
        ├── worker.ts       # carreira no Web Worker
        ├── protocol.ts     # comandos e View trocados com o worker
        └── idb-store.ts    # save no IndexedDB
packages/
├── core/                   # regras puras, sem DOM e determinísticas
│   └── src/                # calendar, finance, squad, development, save, rng, invariants
├── data/                   # base de clubes e jogadores + adaptadores de save
├── game/                   # classe Game: liga todos os módulos ao calendário
└── legacy-harness/         # roda a v0.5 em Node com semente, para testes de regressão
game/                       # v0.5 legado (congelada)
docs/
└── PLANEJAMENTO-FASE1-COMPLEMENTO.md   # diagnóstico, arquitetura e status das fases
```

## Próximos passos

1. **Fase 3, restante:** telas de mercado, olheiros e base, importação de save da v0.5 pela interface e PWA.
2. **Fase 4:** motor de partida próprio, determinístico, que gera uma linha do tempo de eventos, com melhores momentos em 2D e narração.
3. **Fases 5 a 7:** partidas em 3D com **Three.js**, usando modelos e animações do Blender + Mixamo, com câmera de transmissão e replays.
4. **Fase 8:** controles por teclado, gamepad e toque.
5. **Depois:** Carreira de Jogador, app para celular (Capacitor) e saves na nuvem.
