# Soccer Manager v0.4 — snapshot 02/10/2026

Atualização construída sobre a v0.3.2.

## Táticas
- Campo vertical corrigido: linha do meio horizontal, círculo central, duas áreas e dois gols.
- Troca de jogadores por clique: selecione dois atletas e use o botão ⇄.
- Troca por arrastar e soltar com mouse/toque entre titulares, banco e não relacionados.
- Jogador selecionado escurece o campo e exibe zonas/posições; posições naturais/secundárias aparecem em verde.
- É possível soltar/clicar em uma posição do campo para reposicionar um titular.
- Alterar a formação preserva os 11 atuais e tenta encaixá-los nas zonas mais adequadas, sem refazer o time a partir do elenco inteiro.
- Escalação permanece salva entre partidas.

## Banco e elencos
- Snapshot de referência: 02/10/2026.
- Corinthians refeito com elenco atual verificado e idades corrigidas.
- Flamengo e Santos também receberam atualização ampliada a partir de elencos atuais consultados.
- Fillers genéricos automáticos foram removidos dos clubes brasileiros; jogadores fictícios entram apenas pela categoria de base.
- Correção adicional de idades conhecidas, incluindo Neymar e Thiago Silva.
- OVR/potencial/salários continuam sendo parâmetros de gameplay e não ratings oficiais.

## Confiança, objetivos e menu
- Carreira nova começa com 100% de confiança da diretoria e 100% da torcida.
- Confiança da torcida reage às últimas partidas e à exigência/reputação do clube.
- Confiança da diretoria usa resultados, objetivos e finanças.
- Nova tela Objetivos.
- Menu lateral reorganizado em Início, Gestão e Carreira, com grupos animados de abrir/fechar.

## Estádios e finanças
- Estádios adicionados aos clubes brasileiros e exibidos na preparação/tela da partida.
- Bilheteria para jogos em casa calculada por capacidade, base de torcida e confiança.
- Receita semanal de produtos/camisas ligada à confiança da torcida.
- Folha salarial debitada mensalmente.
- Livro-caixa detalhado na tela Finanças.

## Base
- Relatório de jovens a cada mês.
- Até 45 jogadores aguardando decisão no relatório.
- Até 45 jogadores contratados na base.
- Jogadores da base podem ser promovidos ou dispensados.

## Evolução
- Progresso de evolução oculto e mensal.
- Jovens evoluem mais rápido com minutos, moral e boa fase.
- Ao alcançar o potencial, o limiar de evolução aumenta, mas ainda é possível ultrapassá-lo até OVR 99.
- Jogadores acima de 30 anos acumulam regressão gradualmente; minutos e bom desempenho retardam a queda.
- OVR de linha é recalculado a partir da média de Velocidade, Finalização, Passe, Drible, Marcação e Força.
- Idade sobe uma vez no começo de cada nova temporada.

## Contratos e energia
- Renovação pelo perfil do jogador, com 1–4 anos adicionais, salário e luvas.
- Aceitação depende principalmente de moral e proposta salarial.
- Cansaço passa a se acumular entre jogos; idade e físico influenciam desgaste/recuperação.

## Simulação
- Simulação de ligas dá peso maior à qualidade do XI, profundidade do banco, reputação, moral, forma e físico, reduzindo o excesso de equilíbrio artificial.
- Avançar calendário continua processando partidas do usuário e adversários, mantendo a próxima partida sincronizada.

## Save
- Nova chave de save: `soccerManagerV04`.
- Tenta migrar automaticamente saves da v0.3.2/v0.2.
