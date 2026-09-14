import { Routes } from "@angular/router";

export const routes: Routes = [
  {
    path: "",
    redirectTo: "visao-geral",
    pathMatch: "full",
  },

  {
    path: "visao-geral",
    loadComponent: () =>
      import("./pages/visao-geral/visao-geral.component")
        .then((m) => m.VisaoGeralComponent),
  },

  {
    path: "tarefas",
    loadComponent: () =>
      import("./pages/tarefas/tarefas.component")
        .then((m) => m.TarefasComponent),
  },

  {
    path: "tarefas/registrar/:data",
    loadComponent: () =>
      import("./pages/tarefas-registrar/tarefas-registrar.component")
        .then((m) => m.TarefasRegistrarComponent),
  },

  {
    path: "tipos-atividade",
    loadComponent: () =>
      import("./pages/tipos-atividade/tipos-atividade.component")
        .then((m) => m.TiposAtividadeComponent),
  },

  {
    path: "solicitantes",
    loadComponent: () =>
      import("./pages/solicitantes/solicitantes.component")
        .then((m) => m.SolicitantesComponent),
  },

  {
    path: "atalhos",
    loadComponent: () =>
      import("./pages/atalhos/atalhos.component")
        .then((m) => m.AtalhosComponent),
  },
];
