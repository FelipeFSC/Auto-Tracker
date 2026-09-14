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

interface Solicitante {
  id: string;
  nome: string;
  os_padrao: string | null;
  ativo: number;
}

@Component({
  selector: "app-solicitantes",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
  ],
  templateUrl: "./solicitantes.component.html",
  styleUrl: "./solicitantes.component.css",
})
export class SolicitantesComponent implements OnInit {
  solicitantes: Solicitante[] = [];

  filtroStatus: "ativos" | "inativos" = "ativos";

  // NOVO
  nome = "";
  osPadrao = "";

  // EDIÇÃO
  editandoId: string | null = null;
  nomeEdicao = "";
  osPadraoEdicao = "";

  constructor(private db: DatabaseService) {}

  async ngOnInit() {
    await this.carregar();
  }

  async carregar() {
    this.solicitantes = await this.db.query<Solicitante>(
      "SELECT * FROM solicitantes ORDER BY nome",
    );
  }

  solicitantesFiltrados(): Solicitante[] {
    return this.solicitantes.filter((s) =>
      this.filtroStatus === "ativos" ? !!s.ativo : !s.ativo,
    );
  }

  definirFiltroStatus(status: "ativos" | "inativos") {
    this.filtroStatus = status;
  }

  async adicionar(event: Event) {
    event.preventDefault();

    if (!this.nome.trim()) {
      alert("Informe o nome do solicitante.");
      return;
    }

    await this.db.run(
      `INSERT INTO solicitantes (id, usuario_id, nome, os_padrao)
       VALUES (?, ?, ?, ?)`,
      [this.db.gerarId(), USUARIO_LOCAL_ID, this.nome.trim(), this.osPadrao.trim() || null],
    );

    this.nome = "";
    this.osPadrao = "";

    await this.carregar();
  }

  editar(solicitante: Solicitante) {
    this.editandoId = solicitante.id;
    this.nomeEdicao = solicitante.nome;
    this.osPadraoEdicao = solicitante.os_padrao || "";
  }

  cancelarEdicao() {
    this.editandoId = null;
  }

  async salvarEdicao(event: Event, solicitante: Solicitante) {
    event.preventDefault();

    if (!this.nomeEdicao.trim()) {
      alert("Informe o nome do solicitante.");
      return;
    }

    await this.db.run(
      `UPDATE solicitantes SET nome = ?, os_padrao = ? WHERE id = ?`,
      [this.nomeEdicao.trim(), this.osPadraoEdicao.trim() || null, solicitante.id],
    );

    this.cancelarEdicao();
    await this.carregar();
  }

  async remover(id: string) {
    if (!confirm("Tem certeza que deseja excluir este solicitante?")) {
      return;
    }

    await this.db.run("UPDATE solicitantes SET ativo = 0 WHERE id = ?", [id]);
    await this.carregar();
  }

  async reativar(id: string) {
    await this.db.run("UPDATE solicitantes SET ativo = 1 WHERE id = ?", [id]);
    await this.carregar();
  }
}
