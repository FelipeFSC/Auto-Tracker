import { Component, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatTooltipModule } from "@angular/material/tooltip";
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
  expandida: boolean;
}

interface TipoAtividade {
  id: string;
  nome: string;
}

interface Solicitante {
  id: string;
  nome: string;
  os_padrao: string | null;
  descricao: string | null;
}

interface Atalho {
  id: string;
  nome: string;
  duracao_minutos: number;
  aplicar_duracao: "fim" | "inicio";
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
    MatTooltipModule,
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

    const diaSemana = data.toLocaleDateString("pt-BR", { weekday: "long" });
    const diaFormatado = String(dia).padStart(2, "0");
    const mesFormatado = String(mes).padStart(2, "0");

    return `${diaSemana}, ${diaFormatado}/${mesFormatado}/${ano}`;
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
        "SELECT id, nome, os_padrao, descricao FROM solicitantes WHERE ativo = 1 ORDER BY nome",
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
      expandida: false,
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
  private calcularInicioProximaLinha(): string {
    const ultima = this.linhas[this.linhas.length - 1];

    if (!ultima) {
      return this.horaAtual();
    }

    if (ultima.horaFim) {
      return ultima.horaFim;
    }

    const inicio = this.horaAtual();
    ultima.horaFim = inicio;
    return inicio;
  }

  private somarMinutos(hora: string, minutos: number): string {
    const [h, m] = hora.split(":").map(Number);
    const total = h * 60 + m + minutos;

    return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }

  /** Recolhe todas as linhas atuais — usado antes de abrir uma linha nova. */
  private recolherTodas() {
    for (const linha of this.linhas) {
      linha.expandida = false;
    }
  }

  adicionarLinha() {
    const inicio = this.calcularInicioProximaLinha();
    this.recolherTodas();

    this.linhas.push({
      horaInicio: inicio,
      horaFim: "",
      tipoAtividadeId: "",
      solicitanteId: "",
      os: "",
      observacoes: "",
      expandida: true,
    });
  }

  removerLinha(index: number) {
    this.linhas.splice(index, 1);
  }

  aplicarAtalho(atalho: Atalho) {
    const base = this.calcularInicioProximaLinha();
    const depoisDaDuracao = this.somarMinutos(base, atalho.duracao_minutos);
    const duracaoNoInicio = atalho.aplicar_duracao === "inicio";

    this.recolherTodas();

    this.linhas.push({
      horaInicio: duracaoNoInicio ? depoisDaDuracao : base,
      horaFim: duracaoNoInicio ? "" : depoisDaDuracao,
      tipoAtividadeId: atalho.tipo_atividade_id || "",
      solicitanteId: atalho.solicitante_id || "",
      os: atalho.os || "",
      observacoes: atalho.observacoes || "",
      expandida: true,
    });
  }

  toggleLinha(linha: LinhaTarefa) {
    linha.expandida = !linha.expandida;
  }

  abrirTodas() {
    for (const linha of this.linhas) {
      linha.expandida = true;
    }
  }

  /** Resumo mostrado no cabeçalho da linha quando ela está recolhida. */
  resumoLinha(linha: LinhaTarefa): string {
    const partes = [`${linha.horaInicio || "—"} – ${linha.horaFim || "—"}`];

    const tipo = this.tiposAtividade.find((t) => t.id === linha.tipoAtividadeId);
    if (tipo) {
      partes.push(tipo.nome);
    }

    const solicitante = this.solicitantes.find((s) => s.id === linha.solicitanteId);
    if (solicitante) {
      partes.push(solicitante.nome);
    }

    return partes.join(" · ");
  }

  /** Ao trocar o solicitante, a OS passa a ser a padrão dele (ou fica vazia, se não houver) — o usuário ainda pode sobrescrever. */
  onSolicitanteAlterado(linha: LinhaTarefa) {
    const solicitante = this.solicitantes.find((s) => s.id === linha.solicitanteId);
    linha.os = solicitante?.os_padrao || "";
  }

  /** Descrição do solicitante da linha — só informativa, nunca vai para as observações da tarefa. */
  descricaoSolicitante(linha: LinhaTarefa): string {
    const solicitante = this.solicitantes.find((s) => s.id === linha.solicitanteId);
    return solicitante?.descricao || "";
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
