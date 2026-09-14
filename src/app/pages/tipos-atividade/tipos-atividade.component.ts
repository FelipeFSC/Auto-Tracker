import { Component, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import {
  DatabaseService,
  USUARIO_LOCAL_ID,
} from "../../services/database.service";

interface TipoAtividade {
  id: string;
  nome: string;
  icone: string | null;
  cor: string | null;
  ativo: number;
}

@Component({
  selector: "app-tipos-atividade",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
  ],
  templateUrl: "./tipos-atividade.component.html",
  styleUrl: "./tipos-atividade.component.css",
})
export class TiposAtividadeComponent implements OnInit {
  tipos: TipoAtividade[] = [];

  filtroStatus: "ativos" | "inativos" = "ativos";

  // NOVO TIPO
  nome = "";
  icone = "";
  cor = "#6d4fe0";

  // EDIÇÃO
  editandoId: string | null = null;
  nomeEdicao = "";
  iconeEdicao = "";
  corEdicao = "#6d4fe0";

  constructor(private db: DatabaseService) {}

  async ngOnInit() {
    await this.carregar();
  }

  async carregar() {
    this.tipos = await this.db.query<TipoAtividade>(
      "SELECT * FROM tipos_atividade ORDER BY nome",
    );
  }

  tiposFiltrados(): TipoAtividade[] {
    return this.tipos.filter((t) =>
      this.filtroStatus === "ativos" ? !!t.ativo : !t.ativo,
    );
  }

  definirFiltroStatus(status: "ativos" | "inativos") {
    this.filtroStatus = status;
  }

  async adicionar(event: Event) {
    event.preventDefault();

    if (!this.nome.trim()) {
      alert("Informe o nome do tipo de atividade.");
      return;
    }

    await this.db.run(
      `INSERT INTO tipos_atividade (id, usuario_id, nome, icone, cor)
       VALUES (?, ?, ?, ?, ?)`,
      [
        this.db.gerarId(),
        USUARIO_LOCAL_ID,
        this.nome.trim(),
        this.icone || null,
        this.cor || null,
      ],
    );

    this.nome = "";
    this.icone = "";
    this.cor = "#6d4fe0";

    await this.carregar();
  }

  editar(tipo: TipoAtividade) {
    this.editandoId = tipo.id;
    this.nomeEdicao = tipo.nome;
    this.iconeEdicao = tipo.icone || "";
    this.corEdicao = tipo.cor || "#6d4fe0";
  }

  cancelarEdicao() {
    this.editandoId = null;
  }

  async salvarEdicao(event: Event, tipo: TipoAtividade) {
    event.preventDefault();

    if (!this.nomeEdicao.trim()) {
      alert("Informe o nome do tipo de atividade.");
      return;
    }

    await this.db.run(
      `UPDATE tipos_atividade SET nome = ?, icone = ?, cor = ? WHERE id = ?`,
      [this.nomeEdicao.trim(), this.iconeEdicao || null, this.corEdicao || null, tipo.id],
    );

    this.cancelarEdicao();
    await this.carregar();
  }

  async remover(id: string) {
    if (!confirm("Tem certeza que deseja excluir este tipo de atividade?")) {
      return;
    }

    await this.db.run("UPDATE tipos_atividade SET ativo = 0 WHERE id = ?", [id]);
    await this.carregar();
  }

  async reativar(id: string) {
    await this.db.run("UPDATE tipos_atividade SET ativo = 1 WHERE id = ?", [id]);
    await this.carregar();
  }
}
