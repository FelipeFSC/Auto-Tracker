import { Component, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import {
  DatabaseService,
  USUARIO_LOCAL_ID,
} from "../../services/database.service";

/** "fim": a tarefa dura esse tempo. "inicio": a tarefa começa depois desse intervalo (ex: almoço). */
type AplicarDuracao = "fim" | "inicio";

interface Atalho {
  id: string;
  nome: string;
  duracao_minutos: number;
  aplicar_duracao: AplicarDuracao;
  tipo_atividade_id: string | null;
  solicitante_id: string | null;
  os: string | null;
  observacoes: string | null;
  ordem: number;
  ativo: number;
}

interface TipoAtividade {
  id: string;
  nome: string;
}

interface Solicitante {
  id: string;
  nome: string;
}

interface FormularioAtalho {
  nome: string;
  duracaoMinutos: number | null;
  aplicarDuracao: AplicarDuracao;
  tipoAtividadeId: string;
  solicitanteId: string;
  os: string;
  observacoes: string;
}

function formularioVazio(): FormularioAtalho {
  return {
    nome: "",
    duracaoMinutos: null,
    aplicarDuracao: "fim",
    tipoAtividadeId: "",
    solicitanteId: "",
    os: "",
    observacoes: "",
  };
}

@Component({
  selector: "app-atalhos",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
  ],
  templateUrl: "./atalhos.component.html",
  styleUrl: "./atalhos.component.css",
})
export class AtalhosComponent implements OnInit {
  atalhos: Atalho[] = [];
  tiposAtividade: TipoAtividade[] = [];
  solicitantes: Solicitante[] = [];

  filtroStatus: "ativos" | "inativos" = "ativos";

  novo: FormularioAtalho = formularioVazio();

  editandoId: string | null = null;
  edicao: FormularioAtalho = formularioVazio();

  constructor(private db: DatabaseService) {}

  async ngOnInit() {
    await this.carregar();
  }

  async carregar() {
    [this.atalhos, this.tiposAtividade, this.solicitantes] = await Promise.all([
      this.db.query<Atalho>("SELECT * FROM atalhos ORDER BY ordem, nome"),
      this.db.query<TipoAtividade>(
        "SELECT id, nome FROM tipos_atividade WHERE ativo = 1 ORDER BY nome",
      ),
      this.db.query<Solicitante>(
        "SELECT id, nome FROM solicitantes WHERE ativo = 1 ORDER BY nome",
      ),
    ]);
  }

  atalhosFiltrados(): Atalho[] {
    return this.atalhos.filter((a) =>
      this.filtroStatus === "ativos" ? !!a.ativo : !a.ativo,
    );
  }

  definirFiltroStatus(status: "ativos" | "inativos") {
    this.filtroStatus = status;
  }

  nomeTipoAtividade(id: string | null): string | null {
    return this.tiposAtividade.find((t) => t.id === id)?.nome ?? null;
  }

  nomeSolicitante(id: string | null): string | null {
    return this.solicitantes.find((s) => s.id === id)?.nome ?? null;
  }

  private validar(form: FormularioAtalho): string | null {
    if (!form.nome.trim()) {
      return "Informe o nome do atalho.";
    }

    if (!form.duracaoMinutos || form.duracaoMinutos <= 0) {
      return "Informe a duração em minutos.";
    }

    return null;
  }

  async adicionar(event: Event) {
    event.preventDefault();

    const erro = this.validar(this.novo);
    if (erro) {
      alert(erro);
      return;
    }

    const proximaOrdem =
      this.atalhos.reduce((max, a) => Math.max(max, a.ordem), 0) + 1;

    await this.db.run(
      `INSERT INTO atalhos
        (id, usuario_id, nome, duracao_minutos, aplicar_duracao, tipo_atividade_id, solicitante_id, os, observacoes, ordem)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        this.db.gerarId(),
        USUARIO_LOCAL_ID,
        this.novo.nome.trim(),
        this.novo.duracaoMinutos,
        this.novo.aplicarDuracao,
        this.novo.tipoAtividadeId || null,
        this.novo.solicitanteId || null,
        this.novo.os.trim() || null,
        this.novo.observacoes.trim() || null,
        proximaOrdem,
      ],
    );

    this.novo = formularioVazio();
    await this.carregar();
  }

  editar(atalho: Atalho) {
    this.editandoId = atalho.id;
    this.edicao = {
      nome: atalho.nome,
      duracaoMinutos: atalho.duracao_minutos,
      aplicarDuracao: atalho.aplicar_duracao,
      tipoAtividadeId: atalho.tipo_atividade_id || "",
      solicitanteId: atalho.solicitante_id || "",
      os: atalho.os || "",
      observacoes: atalho.observacoes || "",
    };
  }

  cancelarEdicao() {
    this.editandoId = null;
  }

  async salvarEdicao(event: Event, atalho: Atalho) {
    event.preventDefault();

    const erro = this.validar(this.edicao);
    if (erro) {
      alert(erro);
      return;
    }

    await this.db.run(
      `UPDATE atalhos
       SET nome = ?, duracao_minutos = ?, aplicar_duracao = ?, tipo_atividade_id = ?, solicitante_id = ?, os = ?, observacoes = ?
       WHERE id = ?`,
      [
        this.edicao.nome.trim(),
        this.edicao.duracaoMinutos,
        this.edicao.aplicarDuracao,
        this.edicao.tipoAtividadeId || null,
        this.edicao.solicitanteId || null,
        this.edicao.os.trim() || null,
        this.edicao.observacoes.trim() || null,
        atalho.id,
      ],
    );

    this.cancelarEdicao();
    await this.carregar();
  }

  async remover(id: string) {
    if (!confirm("Tem certeza que deseja excluir este atalho?")) {
      return;
    }

    await this.db.run("UPDATE atalhos SET ativo = 0 WHERE id = ?", [id]);
    await this.carregar();
  }

  async reativar(id: string) {
    await this.db.run("UPDATE atalhos SET ativo = 1 WHERE id = ?", [id]);
    await this.carregar();
  }
}
