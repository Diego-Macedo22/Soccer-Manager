# Soccer Manager v0.2

Protótipo web standalone de simulador de técnico/manager de futebol.

## Como executar

1. Extraia o ZIP (se estiver usando o pacote completo).
2. Abra `index.html` no Chrome, Firefox ou Edge.
3. Crie uma carreira e escolha um dos 40 clubes brasileiros disponíveis.

Não é necessário instalar Node.js, MySQL, servidor local ou configurar banco de dados. A base inicial está embutida no próprio `index.html` e o save é armazenado no `localStorage` do navegador, sob a chave `soccerManagerV02`.

> O save da v0.1 é separado do save da v0.2.

## Principais novidades da v0.2

- Brasileirão Série A e Série B com 20 clubes cada.
- Banco inicial com 545 nomes de jogadores reais associados aos 40 clubes brasileiros, complementado automaticamente até 24 atletas por clube com jogadores de base gerados para manter o simulador funcional.
- 8 clubes sul-americanos convidados no banco para competições continentais: Boca Juniors, River Plate, Racing, Estudiantes, Peñarol, Nacional, LDU Quito e Independiente del Valle.
- Cores próprias por clube.
- Página de competições com tabela, artilharia, assistências e média de avaliação.
- Tabela contextual durante as partidas.
- Destaques visuais de campeão, vagas continentais e zona de rebaixamento.
- Cansaço acumulado em porcentagem durante a partida.
- Partida 2D animada com cronômetro, eventos, posse, chutes, xG e comentários.
- Substituições em partida: até 5 jogadores em até 3 janelas; intervalo não consome janela.
- Pausa automática no intervalo com painel de substituições.
- Alteração de formação durante a partida, respeitando a compatibilidade do XI.
- Formações: 4-2-3-1, 4-3-3, 4-4-2, 3-5-2, 5-3-2 e 4-1-4-1.
- Versatilidade posicional baseada nos atributos.
- Restrições de posição na escalação (por exemplo, jogador de linha não pode ser escalado como goleiro).
- Perfil lateral do atleta no elenco e nas táticas com atributos, características, estatísticas e alternativas para a posição.
- Mercado com compra, empréstimo, pré-contrato e propostas recebidas.
- Janela pós-temporada de 30 dias.
- Promoção e rebaixamento entre as Séries A e B ao fim da temporada.
- Classificação para Libertadores/Sul-Americana e módulo continental simplificado nas temporadas seguintes.
- Avanço de temporada, envelhecimento, desenvolvimento/regressão, contratos, retorno de empréstimos e execução de pré-contratos.
- Avaliação do técnico, vagas de emprego, olheiros, calendário, finanças e eventos aleatórios.
- Modo claro/escuro.

## Sobre os elencos

A base foi montada como um **snapshot de desenvolvimento em 30/09/2026** usando informações públicas atuais da CBF e referências de escalações/elencos. Os nomes e vínculos foram usados para aproximar os elencos da temporada 2026.

Atributos, OVR, potencial, valor de mercado, salário e parte das idades/posições são **estimativas para gameplay**, não ratings oficiais. Como este protótipo não possui sincronização com uma API esportiva, transferências reais posteriores a esse snapshot não são atualizadas automaticamente.

Quando uma equipe não tinha jogadores suficientes no núcleo coletado, o jogo completa o elenco com atletas fictícios identificados como `Base gerada V0.2`, evitando times sem reservas ou posições necessárias.

## Limitações atuais

- Não usa escudos, fotos ou marcas licenciadas.
- O motor de partida é estatístico/2D, não um simulador 3D.
- Libertadores e Sul-Americana usam uma estrutura simplificada nesta versão.
- Copa do Brasil usa um mata-mata simplificado de 32 clubes para a carreira.
- A base de jogadores reais ainda pode ser expandida e refinada em versões futuras.

## Arquivo principal

Toda a aplicação necessária para jogar está em `index.html`.
