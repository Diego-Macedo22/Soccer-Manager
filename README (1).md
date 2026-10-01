# Soccer Manager v0.3

Atualização baseada na seção **MUDANÇAS PRA V0.3** do documento enviado pelo usuário.

## Principais mudanças

- Táticas personalizadas salvas na carreira, com posição e localização dos 11 slots e mentalidade padrão.
- Correção da movimentação entre banco e não relacionados.
- Energia física exibida de 100% para baixo durante a partida e recuperação progressiva entre jogos.
- Novo sistema de adaptação posicional com OVR efetivo: posição principal +1, secundária mantém, adaptações próximas têm penalidades pequenas e funções distantes recebem penalidade maior. Somente goleiros podem atuar no gol.
- Mentalidades: Ultradefensivo, Defensivo, Equilibrado, Ofensivo e Ultraofensivo, com impacto real em criação/concessão de chances.
- Sequências de vitórias/derrotas passam a influenciar levemente o ritmo da simulação.
- Evolução dinâmica por idade, utilização, moral, empréstimo e potencial; queda gradual para jogadores mais velhos.
- Moral e fase passam a reagir mais diretamente a resultados, gols e assistências.
- Mercado de IA: outros clubes renovam contratos e fazem transferências entre si.
- Pesquisa de todos os jogadores do banco, lista de observação e perfil completo clicável.
- Compra, empréstimo e pré-contrato agora usam tela de negociação com salário, luvas, taxa/oferta, concorrência e, no empréstimo, duração e opção de compra.
- Nova aba Base, com instalações nível 1–10, relatórios periódicos, jovens de 14–18 anos, potencial variável, contratação, dispensa e promoção ao profissional.
- Olheiros têm nomes próprios, custos progressivos, viagens de 3/6/9/12 meses, relatórios e integração com a lista de observação.
- Resumo de clube ao clicar no nome/ícone, com elenco, OVR médio, posição e valor do plantel.
- Configurações de desenvolvedor protegidas pelo código definido pelo usuário, permitindo editar orçamento, nível da base e ranking do manager.
- Calendário permite navegar por meses e avançar para uma data específica, simulando partidas intermediárias.
- Correções pontuais de idade conhecidas no snapshot 2026 (ex.: Neymar, Arrascaeta, Breno Bidon e Cauly), sem impedir o envelhecimento nas temporadas seguintes.

## Banco e save

O jogo continua **standalone**, em um único `index.html`, sem exigir Node.js ou MySQL. O save usa `localStorage` e mantém compatibilidade com a chave usada pela v0.2.

O banco é um snapshot de gameplay. OVR, potencial, atributos, valores e salários são parâmetros do jogo e não equivalem a bases oficiais/licenciadas.
