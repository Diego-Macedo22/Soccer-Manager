# ⚽ Soccer Manager — Modo Carreira

Jogo de gerenciamento de futebol focado em **modo carreira**: você assume um clube, monta o elenco, define a tática, negocia no mercado e tenta cumprir os objetivos da diretoria temporada após temporada.

A proposta mistura a **profundidade de um manager** (tabelas densas, finanças, base, olheiros, calendário) com a **apresentação de um jogo de futebol moderno** (cartas de jogador, notas por nível, tipografia de transmissão, partidas ao vivo).

> **Universo fictício.** O jogo não tem licença de clubes, ligas, competições ou atletas. Todos os nomes são variações inspiradas no futebol real, no estilo dos jogos de futebol não licenciados: *Yuri Alberto* vira **Yuri Alpirto**, *Neymar* vira **Naimer**, *Corinthians* vira **Corintianos**. As cores dos clubes foram mantidas, mas escudos, patrocinadores e marcas não são usados.

---

## Modos de jogo

| Modo | Situação |
|---|---|
| **Carreira de Técnico** | Disponível. Escolha um dos 40 clubes brasileiros e gerencie tudo. |
| **Carreira de Jogador** | Planejado. Crie um atleta, evolua atributos, dispute posição no elenco e receba propostas. |

## O que já existe no jogo

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

## Como rodar

Requer **Node.js 20+**. Não há dependências npm.

```bash
cd game
npm start
```

Abra `http://localhost:3000`. O save fica no navegador (`localStorage`).

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
game/
├── frontend/
│   ├── index.html
│   ├── css/main.css            # estilos base
│   ├── css/theme-career.css    # tema Modo Carreira
│   └── js/
│       ├── fictional-names.js  # gerador de nomes fictícios
│       ├── api.js
│       └── app.js              # jogo (dados + lógica + telas)
├── backend/                    # servidor Node (estático + /api/health)
└── tools/fictionalize.js
```

## Próximos passos

1. **Carreira de Jogador**: criação do atleta, treino, minutos jogados e propostas.
2. Migração para **Godot 4**, com o banco de dados em SQLite e a simulação separada da interface.
3. Atributos mais completos (escala 1–20: técnicos, mentais e físicos) e contratos detalhados.
4. Editor de dados, para que o jogador possa renomear clubes e atletas.
5. Partidas em 3D no estilo melhores momentos (Blender + Mixamo + Godot).
