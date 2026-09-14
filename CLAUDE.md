# CLAUDE.md — Tracker

Este arquivo é o briefing completo do projeto **Tracker** para quem (IA ou humano) for iniciar o desenvolvimento. O projeto ainda não foi implementado com a arquitetura definitiva — este documento existe para que o desenvolvimento comece direto na direção certa, sem re-perguntar decisões já tomadas.

## O que é o Tracker

Sistema desktop de **controle de horas trabalhadas** — pessoal, single-user, sem login. O usuário registra blocos de tempo (início/fim) ao longo do dia, associando cada bloco a um tipo de atividade e a um solicitante/cliente, e depois consulta quanto tempo gastou por dia, por atividade e por solicitante.

## Arquitetura: copiar do GGastos

O Tracker deve usar **exatamente a mesma stack e os mesmos padrões** do projeto irmão GGastos (`D:\Projetos\GGastos`) — é o projeto de referência arquitetural. Antes de escrever qualquer código, leia `D:\Projetos\GGastos\CLAUDE.md` e o arquivo `D:\Projetos\GGastos\src\app\services\database.service.ts` para internalizar o estilo.

Resumo do que replicar:

- **Angular 20**, componentes standalone (`standalone: true`), **sem NgModules**. Rotas lazy via `loadComponent` em `app.routes.ts`.
- **Tauri 2** como shell desktop. Copiar a estrutura de `src-tauri/` do GGastos (plugins registrados em `src-tauri/src/lib.rs`: apenas `tauri-plugin-sql` e `tauri-plugin-opener`, sem comandos Rust customizados). `tauri.conf.json` aponta `beforeDevCommand`/`beforeBuildCommand` para `npm start`/`npm run build` e serve `../dist/<nome-app>/browser`.
- **SQLite via `@tauri-apps/plugin-sql`** — banco local (`sqlite:tracker.db`), sem backend, sem HTTP.
- **`package.json`**: mesmas dependências do GGastos (`@angular/*` ^20.1.4, `@tauri-apps/api` ^2, `@tauri-apps/plugin-opener` ^2, `@tauri-apps/plugin-sql` ^2.4.0, `echarts` ^6 + `ngx-echarts` ^20 para os gráficos da visão geral, `rxjs`, `zone.js`, `tslib`).
- **`DatabaseService`** como única fonte de persistência e regra de negócio, seguindo o mesmo esqueleto do GGastos:
  - `init()` idempotente (memoizado via `initPromise`), abre `Database.load("sqlite:tracker.db")`, roda `PRAGMA foreign_keys = ON`, depois `criarTabelas()` (`CREATE TABLE IF NOT EXISTS`), `migrarColunas()` (ALTER TABLE best-effort em try/catch), `criarIndices()`.
  - **Não existe arquivo de migration** — evolução de schema é feita editando `criarTabelas()`/`migrarColunas()` diretamente.
  - Sem tabela de login real: usar a mesma ideia de `USUARIO_LOCAL_ID` fixo (ex.: `"usuario-local"`) seedado uma vez, e toda tabela relevante tem `usuario_id`.
  - Escape hatches genéricos `query<T>(sql, params)` e `run(sql, params)` expostos para os componentes de página rodarem SQL ad-hoc diretamente (padrão das telas de CRUD simples) — só criar método dedicado no service quando a lógica for não-trivial (cálculo de duração, aplicar atalho, etc.).
  - `gerarId()` = `crypto.randomUUID()`.
  - Escritas multi-tabela usam transação manual (`BEGIN TRANSACTION` / `COMMIT` / `ROLLBACK` via `db.execute`, try/catch com rollback no erro) — não criar helper wrapper.
- **Idioma**: interface toda em português do Brasil, e o código também — nomes de variáveis, métodos, tabelas e colunas em português (`tarefas`, `tipos_atividade`, `solicitantes`, `atalhos`, `duracao_minutos`), do mesmo jeito que o GGastos faz. Não introduzir identificadores em inglês no código da aplicação.
- Sem `HttpClient`, sem chamadas de rede — app 100% local.

## O que aproveitar do protótipo `tracker-web`

Existe um protótipo em `D:\Projetos\Tracker\tracker-web` que já define **o design e o fluxo de telas** (foi ele que gerou os prints mostrados). Ele é útil como referência visual/funcional, mas **não deve ser copiado como código** — foi feito com Angular (NgModules, não standalone) + Angular Material + Dexie (IndexedDB), o que não bate com a arquitetura acima (SQLite/Tauri, standalone components).

Arquivos do protótipo que valem a pena olhar como referência de UX antes de implementar a tela equivalente:

- `src/app/tracker/tracker.ts` / `tracker.html` — tela de listagem principal (filtro por mês com `<` `>`, busca por status/nome, botão "Nova Tarefa", tabela com linha expansível mostrando as tarefas do dia).
- `src/app/tracker/tracker-register/tracker-register.ts` / `.html` — formulário de registro de um dia: cada "tarefa" tem Hora Início, Hora Fim, Tipo de atividade, Solicitante, OS, Observações, botão "Remover"; rodapé com botões "Nova Tarefa" / "Almoço" / "X1" e "Salvar".
- `src/app/toolbar/*` (principal, navigation, action, table-expand) — top bar, ícones de navegação (home / pasta / novo) e o menu de ações da linha da tabela (editar/excluir).
- `src/app/task-template` e `src/app/register-task-template` — **stubs vazios**, deixados como intenção de telas de cadastro (tipo de atividade / solicitante) que nunca chegaram a ser implementadas. É exatamente o que este projeto novo precisa construir de verdade.
- `src/app/tracker/tracker.model.ts` — mostra os campos que a UI já assume que uma tarefa tem (`startTime`, `endTime`, `type`, `applicant`, `serviceOrder`, `description`).

Diferença importante de modelagem: no protótipo, um "tracker" (dia) é um documento Dexie com um array `tasks[]` embutido, e o nome de quem registrou vinha de uma sessão de login fake (`NOME_SESSAO` hard-coded em `tracker-register.ts`). No Tracker novo **não existe usuário logado nem essa coluna de nome** — e como o banco é relacional (SQLite), não devemos guardar um array embutido: a tabela de tarefas é **plana**, com uma coluna `data`, e o agrupamento "um dia = uma linha expansível" na listagem é feito por `GROUP BY data` em SQL (mesmo espírito de como o GGastos agrupa lançamentos por mês), não por um registro-pai artificial.

## Modelo de dados proposto

```sql
CREATE TABLE IF NOT EXISTS usuarios (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tipos_atividade (
  id TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL REFERENCES usuarios(id),
  nome TEXT NOT NULL,
  icone TEXT,
  cor TEXT,
  ativo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS solicitantes (
  id TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL REFERENCES usuarios(id),
  nome TEXT NOT NULL,
  -- OS padrão sugerida ao selecionar este solicitante numa tarefa (texto livre por
  -- enquanto; no futuro pode virar uma tabela `solicitantes_os` 1:N).
  os_padrao TEXT,
  ativo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS atalhos (
  id TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL REFERENCES usuarios(id),
  -- rótulo do botão, ex.: "Almoço", "X1"
  nome TEXT NOT NULL,
  duracao_minutos INTEGER NOT NULL,
  tipo_atividade_id TEXT REFERENCES tipos_atividade(id),
  solicitante_id TEXT REFERENCES solicitantes(id),
  os TEXT,
  observacoes TEXT,
  ordem INTEGER NOT NULL DEFAULT 0,
  ativo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS tarefas (
  id TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL REFERENCES usuarios(id),
  data TEXT NOT NULL,          -- 'YYYY-MM-DD'
  hora_inicio TEXT NOT NULL,   -- 'HH:MM'
  hora_fim TEXT,               -- 'HH:MM', pode ficar vazio (tarefa em andamento)
  tipo_atividade_id TEXT REFERENCES tipos_atividade(id),
  solicitante_id TEXT REFERENCES solicitantes(id),
  os TEXT,
  observacoes TEXT,
  criado_em TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tarefas_data ON tarefas(data);
```

Notas:

- **Duração** de uma tarefa (`hora_fim - hora_inicio`) e **total do dia** (soma das tarefas daquele `data`) são sempre **calculados**, nunca guardados em coluna — é exatamente o dado extra que falta nas telas atuais do protótipo e que o usuário pediu (ex.: reunião das 10:00 às 11:00 → mostrar "1h00" na listagem, e o total do dia somado na linha do dia).
- Reaproveitar `parseData`/`formatarData` e a lógica de hora do GGastos como inspiração, mas aqui hora é só `HH:MM` (sem fuso a resolver) — um helper simples de diferença em minutos resolve.
- `os` na tarefa continua **texto livre** por enquanto (como pedido); ao selecionar um `solicitante_id` no formulário, pré-preencher o campo OS com o `os_padrao` cadastrado nesse solicitante (só sugestão, o usuário pode sobrescrever). Quando a OS virar uma entidade de verdade, essa é a coluna que muda de `TEXT` pra `os_id REFERENCES` — o resto do modelo não precisa mudar.

## Regra dos atalhos (botões "Almoço", "X1", etc.)

Tela de cadastro (`atalhos`) é um CRUD simples (mesmo padrão de `contas`/`categorias`/`tags` do GGastos: `carregar()`, `adicionar()`, `salvarEdicao()`, `remover()`), onde o usuário define nome do botão, duração em minutos, e opcionalmente tipo de atividade / solicitante / OS / observações padrão.

No formulário de registro do dia, cada atalho cadastrado vira um botão extra ao lado de "Nova Tarefa" (cor diferente — azul, por exemplo — enquanto "Nova Tarefa" continua roxo/neutro). Comportamento ao clicar:

1. Pega a hora atual como `hora_inicio`.
2. Calcula `hora_fim = hora_inicio + duracao_minutos` do atalho.
3. Preenche `tipo_atividade_id`, `solicitante_id`, `os`, `observacoes` com o que estiver cadastrado no atalho (campos vazios no atalho ficam vazios na tarefa).
4. Adiciona essa tarefa **na lista em memória do formulário atual**, igual ao "Nova Tarefa" faz hoje no protótipo — não salva direto no banco. O usuário ainda revisa e clica "Salvar" pra persistir o dia inteiro. Isso é consistente com o fluxo já existente em `tracker-register.ts` (`addTask()` só mexe em `tracker.tasks` em memória).

"Nova Tarefa" continua criando uma linha em branco com `hora_inicio` = agora (comportamento atual do protótipo), só os atalhos entram com os campos pré-preenchidos.

## Telas / rotas propostas

- `visao-geral` (default) — dashboard com gráficos: horas trabalhadas por dia (linha/barra ao longo do mês), horas por tipo de atividade (pizza ou barra), horas por solicitante (pizza ou barra). Usar `echarts`/`ngx-echarts` do mesmo jeito que `relatorios.component.ts` do GGastos.
- `tarefas` (ou nome equivalente) — a tela principal: listagem por mês (nav `<` `>` igual ao protótipo), agrupada por dia via SQL, linha expansível mostrando as tarefas daquele dia + coluna de duração total do dia. Botão "Nova Tarefa" abre o formulário do dia (o modal de escolher a data, como no segundo print, ou direto a tela de registro).
- Formulário de registro do dia (pode ser rota própria `tarefas/registrar/:data` ou modal) — réplica de `tracker-register.html`, adaptada: sem `personName`/sessão fake, com os atalhos cadastrados aparecendo como botões extras, e mostrando a duração calculada de cada linha.
- Configurações (ícone de engrenagem no topo, como já é na tela atual) abre um menu/página com os 3 cadastros:
  - `tipos-atividade` — CRUD simples (nome, ícone, cor — reaproveitar `IconPickerButtonComponent`/`IconPickerModalComponent` do GGastos se fizer sentido visualmente).
  - `solicitantes` — CRUD simples (nome + OS padrão).
  - `atalhos` — CRUD conforme descrito acima.

O ícone de "sair" (porta) que aparece no topo do protótipo não tem função sem login — remover, ou trocar por algo com uso real (ex.: fechar o app) se fizer sentido.

## UI kit: Angular Material

Decidido: o Tracker usa **Angular Material** para os componentes de formulário/lista (`mat-form-field`, `mat-select`, `mat-raised-button`, etc.), diferente do GGastos (que tem CSS próprio, sem Material). Migrar os componentes do protótipo de NgModule para standalone (`imports: [MatFormFieldModule, MatSelectModule, ...]` direto no `@Component`), sem trocar o UI kit.

O objetivo é usar o Material só como base funcional dos componentes — a **identidade visual deve continuar a dos prints** (cores, espaçamentos, cantos arredondados dos botões, cara geral das telas), via `M3 theming`/overrides de CSS por cima do tema padrão do Material, não o visual "stock" do Material Design. Ajustar tema/paleta e estilos globais (`styles.css`) para reproduzir o que já está nos prints, em vez de aceitar a aparência default do Material.

## Passos sugeridos para começar

1. `npx @tauri-apps/cli create` (ou `ng new` + `tauri init`) gerando um novo Angular 20 + Tauri 2 na pasta do projeto definitivo.
2. Copiar `src-tauri/` do GGastos como base (ajustando nome do app/bundle) e as dependências do `package.json` listadas acima.
3. Criar `DatabaseService` do zero seguindo o esqueleto descrito (`init`/`criarTabelas`/`migrarColunas`/`criarIndices`/`query`/`run`/`gerarId`), com o schema de `tarefas`, `tipos_atividade`, `solicitantes`, `atalhos` acima.
4. Montar as rotas standalone (`app.routes.ts`) e o shell (`app.component.ts` chamando `database.init()`).
5. Implementar primeiro os 3 cadastros simples (tipos-atividade, solicitantes, atalhos) — são o CRUD padrão mais fácil de validar o `DatabaseService`.
6. Implementar a tela de tarefas (listagem + formulário do dia + atalhos), depois a visão geral com os gráficos.
