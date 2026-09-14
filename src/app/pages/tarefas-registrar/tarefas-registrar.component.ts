import { Component, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import {
  DatabaseService,
  USUARIO_LOCAL_ID,
  NovaTarefa,
} from "../../services/database.service";

interface LinhaTarefa {
  horaInicio: string;
  horaFim: string;
  tipoAtividadeId: string;
  solicitanteId: string;
  os: string;
  observacoes: string;
}

interface TipoAtividade {
  id: string;
  nome: string;
}

interface Solicitante {
  id: string;
  nome: string;
  os_padrao: string | null;
}

interface Atalho {
  id: string;
  nome: string;
  duracao_minutos: number;
  tipo_atividade_id: string | null;
  solicitante_id: string | null;
  os: string | null;
  observacoes: string | null;
}

@Component({
  selector: "app-tarefas-registrar",
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
  templateUrl: "./tarefas-registrar.component.html",
  styleUrl: "./tarefas-registrar.component.css",
})
export class TarefasRegistrarComponent implements OnInit {
  data = "";
  dataFormatada = "";

  linhas: LinhaTarefa[] = [];

  tiposAtividade: TipoAtividade[] = [];
  solicitantes: Solicitante[] = [];
  atalhos: Atalho[] = [];

  salvando = false;

  constructor(
    private db: DatabaseService,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  async ngOnInit() {
    this.data = this.route.snapshot.paramMap.get("data") || "";
    this.dataFormatada = this.formatarData(this.data);

    await this.carregarCadastros();
    await this.carregarTarefasExistentes();

    if (this.linhas.length === 0) {
      this.adicionarLinha();
    }
  }

  private formatarData(dataISO: string): string {
    const [ano, mes, dia] = dataISO.split("-").map(Number);
    const data = new Date(ano, mes - 1, dia);

    return data.toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  }

  private horaAtual(): string {
    const agora = new Date();
    return `${String(agora.getHours()).padStart(2, "0")}:${String(agora.getMinutes()).padStart(2, "0")}`;
  }

  private async carregarCadastros() {
    [this.tiposAtividade, this.solicitantes, this.atalhos] = await Promise.all([
      this.db.query<TipoAtividade>(
        "SELECT id, nome FROM tipos_atividade WHERE ativo = 1 ORDER BY nome",
      ),
      this.db.query<Solicitante>(
        "SELECT id, nome, os_padrao FROM solicitantes WHERE ativo = 1 ORDER BY nome",
      ),
      this.db.query<Atalho>(
        "SELECT * FROM atalhos WHERE ativo = 1 ORDER BY ordem, nome",
      ),
    ]);
  }

  private async carregarTarefasExistentes() {
    const tarefas = await this.db.query<any>(
      `SELECT hora_inicio, hora_fim, tipo_atividade_id, solicitante_id, os, observacoes
       FROM tarefas
       WHERE usuario_id = ? AND data = ?
       ORDER BY hora_inicio`,
      [USUARIO_LOCAL_ID, this.data],
    );

    this.linhas = tarefas.map((t) => ({
      horaInicio: t.hora_inicio,
      horaFim: t.hora_fim || "",
      tipoAtividadeId: t.tipo_atividade_id || "",
      solicitanteId: t.solicitante_id || "",
      os: t.os || "",
      observacoes: t.observacoes || "",
    }));
  }

  // =========================================================
  // LINHAS
  // =========================================================

  /**
   * A primeira tarefa do dia começa agora. As seguintes começam onde a
   * anterior terminou — só cai para a hora atual se a anterior ainda
   * estiver em aberto (sem hora fim preenchida).
   */
  adicionarLinha() {
    const ultima = this.linhas[this.linhas.length - 1];

    let inicio: string;
    if (!ultima) {
      inicio = this.horaAtual();
    } else if (ultima.horaFim) {
      inicio = ultima.horaFim;
    } else {
      inicio = this.horaAtual();
      ultima.horaFim = inicio;
    }

    this.linhas.push({
      horaInicio: inicio,
      horaFim: "",
      tipoAtividadeId: "",
      solicitanteId: "",
      os: "",
      observacoes: "",
    });
  }

  removerLinha(index: number) {
    this.linhas.splice(index, 1);
  }

  aplicarAtalho(atalho: Atalho) {
    const inicio = this.horaAtual();
    const [h, m] = inicio.split(":").map(Number);

    const totalMinutos = h * 60 + m + atalho.duracao_minutos;
    const fim = `${String(Math.floor(totalMinutos / 60) % 24).padStart(2, "0")}:${String(totalMinutos % 60).padStart(2, "0")}`;

    this.linhas.push({
      horaInicio: inicio,
      horaFim: fim,
      tipoAtividadeId: atalho.tipo_atividade_id || "",
      solicitanteId: atalho.solicitante_id || "",
      os: atalho.os || "",
      observacoes: atalho.observacoes || "",
    });
  }

  /** Ao escolher um solicitante, sugere a OS padrão cadastrada nele — só se o campo ainda estiver vazio. */
  onSolicitanteAlterado(linha: LinhaTarefa) {
    if (linha.os) {
      return;
    }

    const solicitante = this.solicitantes.find((s) => s.id === linha.solicitanteId);
    if (solicitante?.os_padrao) {
      linha.os = solicitante.os_padrao;
    }
  }

  duracaoLinha(linha: LinhaTarefa): string {
    if (!linha.horaFim) {
      return "—";
    }

    const minutos = this.db.calcularDuracaoMinutos(linha.horaInicio, linha.horaFim);
    return minutos !== null ? this.db.formatarDuracao(minutos) : "—";
  }

  // =========================================================
  // SALVAR
  // =========================================================

  async salvar() {
    if (this.linhas.length === 0) {
      alert("Adicione ao menos uma tarefa.");
      return;
    }

    for (const linha of this.linhas) {
      if (!linha.horaInicio) {
        alert("Toda tarefa precisa de uma hora de início.");
        return;
      }
    }

    this.salvando = true;

    try {
      const tarefas: NovaTarefa[] = this.linhas.map((linha) => ({
        hora_inicio: linha.horaInicio,
        hora_fim: linha.horaFim || null,
        tipo_atividade_id: linha.tipoAtividadeId || null,
        solicitante_id: linha.solicitanteId || null,
        os: linha.os || null,
        observacoes: linha.observacoes || null,
      }));

      await this.db.salvarTarefasDoDia(this.data, tarefas);

      this.router.navigate(["/tarefas"]);
    } finally {
      this.salvando = false;
    }
  }

  cancelar() {
    this.router.navigate(["/tarefas"]);
  }
}
