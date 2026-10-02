# Soccer Manager v0.5 — arquitetura Node.js

Esta é a primeira versão de transição do Soccer Manager de um `index.html` monolítico para uma aplicação web organizada em frontend + backend Node.js.

## Estrutura

```text
soccer_manager_node_v050/
├── frontend/
│   ├── index.html
│   ├── css/main.css
│   ├── js/app.js
│   ├── js/api.js
│   └── assets/
├── backend/
│   ├── server.js
│   ├── routes/api.js
│   ├── services/
│   │   ├── matchEngine.js
│   │   ├── transferEngine.js
│   │   ├── developmentEngine.js
│   │   └── calendarEngine.js
│   └── database/
├── package.json
├── render.yaml
└── .gitignore
```

## O que já mudou

- HTML, CSS e JavaScript foram separados.
- Node.js passou a servir o jogo.
- A API já possui `/api/health` e `/api/version`.
- Há módulos reservados para migrar simulação, mercado, evolução e calendário.
- O deploy no Render pode usar o `render.yaml` da raiz.

A lógica de gameplay da V0.5 continua no `frontend/js/app.js` nesta etapa para não quebrar o jogo durante a mudança de arquitetura. A partir daqui, cada atualização pode retirar um sistema do arquivo principal e movê-lo para módulos próprios/backend.

## Rodar localmente

Requer Node.js 20 ou superior.

```bash
npm start
```

Abra:

```text
http://localhost:3000
```

Não há dependências npm externas nesta versão.

## GitHub + Render

1. Extraia o ZIP.
2. Entre na pasta extraída.
3. Faça `git init` caso ainda não seja um repositório.
4. Adicione e faça commit de toda a estrutura.
5. Envie ao GitHub.
6. No Render, crie um **Web Service** usando esse repositório.
7. O Render pode detectar o `render.yaml`. Se configurar manualmente:
   - Build Command: `npm run check`
   - Start Command: `npm start`
   - Health Check: `/api/health`

## Próxima etapa recomendada

Migrar primeiro o banco e os saves para PostgreSQL; depois mover, em ordem, `matchEngine`, `calendarEngine`, `developmentEngine` e `transferEngine` para o backend. Isso reduz bastante o risco de bugs em cascata.
