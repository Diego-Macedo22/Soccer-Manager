# Soccer Manager v0.5

Snapshot de desenvolvimento: **02/10/2026**.

Esta versão continua sendo um protótipo web **standalone**: o jogo roda a partir do `index.html` e salva a carreira no navegador.

## Principais mudanças da v0.5

### Evolução de jogadores e base
- Evolução profissional recalibrada para ser mais perceptível em jogadores jovens e promissores.
- Progresso mensal oculto baseado em idade, uso, desempenho, moral e potencial.
- Jogadores podem ultrapassar o potencial original por desempenho excepcional; OVR máximo 99.
- Regressão gradual para jogadores veteranos, especialmente com baixa utilização.
- Empréstimos passam a contar como rodagem para evolução.
- Jogadores contratados para a base também evoluem internamente, simulando participação em categorias Sub-14/Sub-16/Sub-18/Sub-21.
- Relatórios de base continuam mensais, com limite de 45 atletas pendentes e 45 atletas contratados na base.

### Gestão de elenco
- Renovação de contrato.
- Adicionar/remover jogador da lista de transferências.
- Adicionar/remover jogador da lista de empréstimos.
- Rescisão com confirmação e custo de 50% dos salários restantes do contrato.
- Jogador rescindido passa para a lista de agentes livres.
- Bandeiras de nacionalidade no perfil dos jogadores quando o dado está disponível no banco.

### Mercado de transferências
- Filtros por posição e situação contratual.
- Categorias: listado para transferência, listado para empréstimo, sem contrato e fim de contrato.
- Negociação de compra com taxa, salário, duração e luvas.
- Pré-contrato com salário, duração e luvas.
- Empréstimo com duração, taxa, salário, luvas e opção de compra.
- Contratação de agente livre sem taxa de transferência.
- Mercado de IA mais ativo: clubes podem listar, vender, emprestar e contratar atletas.
- Jogadores listados pelo usuário tendem a receber mais propostas.

### Dificuldade e lesões
- Dificuldades: Fácil, Normal e Difícil.
- A dificuldade afeta partidas e negociações sem tornar resultados absurdos por definição.
- Opção de ativar/desativar lesões.
- Sistema de lesões com diferentes gravidades e tempos de recuperação.
- Jogadores lesionados ficam indisponíveis para titulares e banco.

### Partidas, energia e simulação
- Consumo de energia durante a partida foi bastante reduzido.
- Idade e físico influenciam o ritmo de desgaste.
- Energia permanece acumulada entre partidas e se recupera com o passar dos dias.
- Simulação pelo calendário faz rotação inteligente de jogadores cansados e lesionados.
- Força, profundidade, moral, forma e energia do elenco têm peso maior na simulação.

### Carreira
- Estatísticas por temporada ficam arquivadas além das estatísticas gerais da carreira.
- Tela de fim de temporada usa a divisão atual do clube do técnico, inclusive Série B.
- Promoção e rebaixamento entre Série A e Série B continuam funcionando.
- Confiança da diretoria e torcida seguem influenciadas pelos resultados e gestão.

### Novas ligas e competições
- Premier League 2026/27 adicionada.
- LaLiga 2026/27 adicionada.
- CONMEBOL Sudamericana 2026 adicionada como competição consultável, com os grupos de 2026.
- Clubes ingleses e espanhóis podem ser escolhidos no início da carreira.
- Vagas de treinador podem incluir clubes de elite conforme o ranking do manager.

## Escopo e precisão do banco

O banco desta versão é um **snapshot de desenvolvimento de 02/10/2026**.

- A composição dos clubes da Premier League foi montada a partir de listas públicas atuais da temporada 2026/27.
- Os 20 clubes da LaLiga 2026/27 foram atualizados conforme a composição atual da competição; os principais elencos e jogadores receberam uma atualização mais detalhada.
- A Sudamericana usa os grupos oficiais de 2026.
- A lista de agentes livres foi revisada com notícias recentes do fim de setembro/início de outubro de 2026.
- Alguns jogadores receberam correções explícitas de idade, incluindo veteranos que estavam sendo rejuvenescidos incorretamente pelo banco anterior.

**Importante:** OVR, potencial, valor de mercado e salário são parâmetros de gameplay criados para o jogo. Eles não são ratings oficiais/licenciados. Nem todo jogador secundário de todas as ligas estrangeiras teve data de nascimento, nacionalidade e posição auditadas individualmente nesta build; quando faltava dado confiável, o jogo usa estimativas/fallbacks consistentes. A intenção é continuar refinando o banco por snapshots.

## Limitações desta build

- A base evolui internamente, mas ainda não existem campeonatos Sub-14/Sub-16/Sub-18/Sub-21 jogáveis.
- A Sudamericana ainda não possui um motor completo de mata-mata real; esta versão prioriza grupos, visualização e qualificação.
- Copas domésticas de Inglaterra e Espanha ainda não foram adicionadas.
- Esta versão continua sendo um único HTML e usa armazenamento local do navegador, não um servidor MySQL.

## Arquivos

- `index.html` — jogo completo.
- `README.md` — este documento.

