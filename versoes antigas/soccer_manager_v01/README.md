# Soccer Manager v0.1

Protótipo web offline, em um único `index.html`, inspirado nas ideias do documento do projeto.

## Como rodar
1. Abra `index.html` no navegador.
2. Crie uma carreira.
3. O save é persistido no `localStorage` do navegador.

## Já implementado
- criação de carreira com opções iniciais;
- modo claro/escuro;
- dashboard do clube;
- elenco com atributos, potencial, moral, forma física e características;
- formações e instruções táticas;
- mercado com compra, empréstimo e pré-contrato;
- tensão de negociação;
- olheiros e relatórios;
- calendário e avanço de data;
- finanças;
- ranking do técnico e vagas de emprego;
- eventos aleatórios;
- partida simulada com campo 2D animado, comentários e estatísticas;
- autosave/localStorage.

## Banco de dados
Nesta v0.1, o banco vem embutido em JavaScript dentro do próprio HTML. Clubes são usados como base do protótipo e os jogadores são gerados de forma fictícia ao carregar o arquivo. Isso evita configuração de servidor ou MySQL nesta fase.

## Próximas versões sugeridas
- banco persistente e maior de jogadores/clubes;
- editor de formação por drag-and-drop;
- IA de transferências entre clubes;
- calendário completo de múltiplas competições;
- categorias de base;
- contratos e janelas formais;
- entrevistas/diretoria;
- regras completas de competição;
- multiplayer/servidor futuramente.
