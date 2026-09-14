# Tracker

Sistema desktop de controle de horas trabalhadas — pessoal, single-user, sem login. Angular 20 (standalone components) + Angular Material rodando dentro de um shell Tauri 2, com SQLite (`@tauri-apps/plugin-sql`) como único datastore. 100% local, sem backend, sem chamadas de rede.

Veja [CLAUDE.md](./CLAUDE.md) para o briefing completo de arquitetura e modelo de dados.

## Comandos

- `npm start` — servidor de desenvolvimento Angular (porta 1420), sem o shell Tauri.
- `npm run build` — build de produção Angular (`ng build`), saída em `dist/tracker/browser`.
- `npx tauri dev` — app desktop completo: builda/serve o Angular e abre a janela Tauri. Forma normal de rodar e testar o app de ponta a ponta (APIs do Tauri, como o plugin SQL, só funcionam dentro do shell Tauri, não em uma aba de navegador comum).
- `npx tauri build` — bundle de produção do desktop (instalador/executável).

Não há test runner ou lint configurado neste repositório.
