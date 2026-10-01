# Soccer Manager v0.3.1 — Hotfix de estabilidade

Esta revisão corrige a navegação e o estado de carreira que podiam quebrar as telas de **Elenco**, **Táticas** e **Partida**.

## Correções
- reconstrução automática da escalação quando um save antigo contém IDs inválidos;
- migração defensiva de saves da v0.2/v0.3;
- correção de `tacticTarget` antigo que podia apontar para um slot inexistente;
- validação de titulares, banco e não relacionados antes de renderizar táticas;
- reparo automático de partidas antigas/incompatíveis;
- `renderAll` isolado por tela: um erro numa aba não derruba as outras;
- tela de elenco protegida contra jogador selecionado que já não pertence ao clube;
- nova chave de save `soccerManagerV031`, preservando a possibilidade de importar o save anterior;
- botão de reparo aparece caso uma tela ainda encontre um estado inconsistente.

Abra `index.html` diretamente no navegador.
