import { Component, HostListener, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatMenuModule } from "@angular/material/menu";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import {
  Configuracoes,
  DatabaseService,
  USUARIO_LOCAL_ID,
} from "../../services/database.service";

interface TarefaRow {
  id: string;
  data: string;
  hora_inicio: string;
  hora_fim: string | null;
  os: string | null;
  observacoes: string | null;
  tipo_atividade_nome: string | null;
  solicitante_nome: string | null;
}

interface TarefaExibicao extends TarefaRow {
  duracaoLabel: string;
}

/**
 * Uma "tarefa agrupada" junta todos os lançamentos do dia com o mesmo
 * tipo/solicitante/OS/observações (ex.: trabalhou no mesmo projeto antes
 * e depois do almoço, sem lançar o intervalo) numa única linha, somando
 * a duração — diferente da listagem detalhada, que mostra cada
 * lançamento separado.
 */
interface TarefaAgrupada {
  tipoAtividadeNome: string | null;
  solicitanteNome: string | null;
  os: string | null;
  observacoes: string | null;
  totalMinutos: number;
  totalLabel: string;
  /** Duração real em "1h40", exibida na visão PAIO ao lado das horas arredondadas. */
  totalLabelHoras: string;
  horasPaio: number;
  horasPaioLabel: string;
  quantidade: number;
}

interface DiaAgrupado {
  data: string;
  dataFormatada: string;
  tarefas: TarefaExibicao[];
  tarefasAgrupadas: TarefaAgrupada[];
  totalMinutos: number;
  totalLabel: string;
  totalLabelDecimal: string;
  /** Soma das horas PAIO já arredondadas de cada tarefa agrupada. */
  totalPaioLabel: string;
  saldoMinutos: number | null;
  saldoLabel: string;
}

/** "paio": igual à agrupada, mas com as horas arredondadas em meias horas como o PAIO exige. */
type ModoExibicao = "detalhada" | "agrupada" | "paio";

@Component({
  selector: "app-tarefas",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: "./tarefas.component.html",
  styleUrl: "./tarefas.component.css",
})
export class TarefasComponent implements OnInit {
  mesSelecionado = this.mesAtual();
  busca = "";
  modoExibicao: ModoExibicao = "detalhada";

  dias: DiaAgrupado[] = [];
  expandidos = new Set<string>();

  /** null quando não há jornada configurada — a coluna e o resumo de saldo ficam ocultos. */
  saldoMesMinutos: number | null = null;
  saldoMesLabel = "";

  private configuracoes!: Configuracoes;

  mostrarNovaData = false;
  novaData = this.hojeISO();

  constructor(
    private db: DatabaseService,
    private router: Router,
  ) {}

  async ngOnInit() {
    await this.carregar();
  }

  @HostListener("window:keydown", ["$event"])
  onAtalhoTeclado(event: KeyboardEvent) {
    if (!event.ctrlKey || event.shiftKey || event.altKey || event.key.toLowerCase() !== "n") {
      return;
    }

    event.preventDefault();

    if (!event.repeat) {
      this.abrirNovaTarefa();
    }
  }

  private mesAtual(): string {
    const hoje = new Date();
    return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
  }

  private hojeISO(): string {
    const hoje = new Date();
    const m = String(hoje.getMonth() + 1).padStart(2, "0");
    const d = String(hoje.getDate()).padStart(2, "0");
    return `${hoje.getFullYear()}-${m}-${d}`;
  }

  async carregar() {
    const [ano, mes] = this.mesSelecionado.split("-").map(Number);
    const inicio = `${this.mesSelecionado}-01`;
    const ultimoDia = new Date(ano, mes, 0).getDate();
    const fim = `${this.mesSelecionado}-${String(ultimoDia).padStart(2, "0")}`;

    this.configuracoes = await this.db.obterConfiguracoes();

    const linhas = await this.db.query<TarefaRow>(
      `SELECT
         t.id, t.data, t.hora_inicio, t.hora_fim, t.os, t.observacoes,
         ta.nome AS tipo_atividade_nome,
         s.nome AS solicitante_nome
       FROM tarefas t
       LEFT JOIN tipos_atividade ta ON ta.id = t.tipo_atividade_id
       LEFT JOIN solicitantes s ON s.id = t.solicitante_id
       WHERE t.usuario_id = ? AND t.data BETWEEN ? AND ?
       ORDER BY t.data, t.hora_inicio`,
      [USUARIO_LOCAL_ID, inicio, fim],
    );

    const porDia = new Map<string, TarefaRow[]>();
    for (const linha of linhas) {
      const lista = porDia.get(linha.data) ?? [];
      lista.push(linha);
      porDia.set(linha.data, lista);
    }

    this.dias = Array.from(porDia.entries())
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .map(([data, tarefas]) => this.montarDiaAgrupado(data, tarefas));

    this.saldoMesMinutos =
      this.configuracoes.jornada_minutos === null
        ? null
        : this.dias.reduce((soma, dia) => soma + (dia.saldoMinutos ?? 0), 0);
    this.saldoMesLabel = this.db.formatarSaldo(this.saldoMesMinutos ?? 0);
  }

  private montarDiaAgrupado(data: string, tarefas: TarefaRow[]): DiaAgrupado {
    let totalMinutos = 0;

    const tarefasExibicao: TarefaExibicao[] = tarefas.map((tarefa) => {
      const minutos = this.db.calcularDuracaoMinutos(tarefa.hora_inicio, tarefa.hora_fim);

      if (minutos !== null) {
        totalMinutos += minutos;
      }

      return {
        ...tarefa,
        duracaoLabel: minutos !== null ? this.db.formatarDuracao(minutos) : "—",
      };
    });

    const saldoMinutos = this.db.calcularSaldoDiaMinutos(data, tarefas, this.configuracoes);
    const tarefasAgrupadas = this.agruparTarefasIguais(tarefasExibicao);
    const totalPaio = tarefasAgrupadas.reduce((soma, grupo) => soma + grupo.horasPaio, 0);

    return {
      data,
      dataFormatada: this.formatarDataExibicao(data),
      tarefas: tarefasExibicao,
      tarefasAgrupadas,
      totalPaioLabel: this.db.formatarHorasPaio(totalPaio),
      totalMinutos,
      totalLabel: this.db.formatarDuracao(totalMinutos),
      totalLabelDecimal: this.db.formatarDuracaoDecimal(totalMinutos),
      saldoMinutos,
      saldoLabel: saldoMinutos !== null ? this.db.formatarSaldo(saldoMinutos) : "—",
    };
  }

  /** Junta lançamentos com tipo/solicitante/OS/observações idênticos, somando a duração. */
  private agruparTarefasIguais(tarefas: TarefaExibicao[]): TarefaAgrupada[] {
    const mapa = new Map<string, TarefaAgrupada>();

    for (const tarefa of tarefas) {
      const chave = [
        tarefa.tipo_atividade_nome ?? "",
        tarefa.solicitante_nome ?? "",
        tarefa.os ?? "",
        tarefa.observacoes ?? "",
      ].join("\u0000");

      const minutos = this.db.calcularDuracaoMinutos(tarefa.hora_inicio, tarefa.hora_fim) ?? 0;

      const existente = mapa.get(chave);
      if (existente) {
        existente.totalMinutos += minutos;
        existente.quantidade += 1;
      } else {
        mapa.set(chave, {
          tipoAtividadeNome: tarefa.tipo_atividade_nome,
          solicitanteNome: tarefa.solicitante_nome,
          os: tarefa.os,
          observacoes: tarefa.observacoes,
          totalMinutos: minutos,
          totalLabel: "",
          totalLabelHoras: "",
          horasPaio: 0,
          horasPaioLabel: "",
          quantidade: 1,
        });
      }
    }

    const limitePaio = this.configuracoes.paio_arredondamento_minutos ?? 15;

    return Array.from(mapa.values())
      .map((grupo) => {
        // O PAIO arredonda o grupo já somado, não cada lançamento.
        const horasPaio = this.db.calcularHorasPaio(grupo.totalMinutos, limitePaio);

        return {
          ...grupo,
          totalLabel: this.db.formatarDuracaoDecimal(grupo.totalMinutos),
          totalLabelHoras: this.db.formatarDuracao(grupo.totalMinutos),
          horasPaio,
          horasPaioLabel: this.db.formatarHorasPaio(horasPaio),
        };
      })
      .sort((a, b) => b.totalMinutos - a.totalMinutos);
  }

  definirModoExibicao(modo: ModoExibicao) {
    this.modoExibicao = modo;
  }

  private formatarDataExibicao(dataISO: string): string {
    const [ano, mes, dia] = dataISO.split("-").map(Number);
    const data = new Date(ano, mes - 1, dia);

    const diaSemana = data.toLocaleDateString("pt-BR", { weekday: "long" });
    const diaFormatado = String(dia).padStart(2, "0");
    const mesFormatado = String(mes).padStart(2, "0");

    return `${diaSemana}, ${diaFormatado}/${mesFormatado}`;
  }

  diasFiltrados(): DiaAgrupado[] {
    const termo = this.busca.trim().toLowerCase();

    if (!termo) {
      return this.dias;
    }

    return this.dias.filter((dia) =>
      dia.tarefas.some((tarefa) =>
        [tarefa.tipo_atividade_nome, tarefa.solicitante_nome, tarefa.os, tarefa.observacoes]
          .filter((campo): campo is string => !!campo)
          .some((campo) => campo.toLowerCase().includes(termo)),
      ),
    );
  }

  async trocarMes(incremento: number) {
    const [ano, mes] = this.mesSelecionado.split("-").map(Number);
    const novaData = new Date(ano, mes - 1 + incremento, 1);

    this.mesSelecionado = `${novaData.getFullYear()}-${String(novaData.getMonth() + 1).padStart(2, "0")}`;

    await this.carregar();
  }

  async onMesAlterado() {
    await this.carregar();
  }

  toggleExpandido(data: string) {
    if (this.expandidos.has(data)) {
      this.expandidos.delete(data);
    } else {
      this.expandidos.add(data);
    }
  }

  estaExpandido(data: string): boolean {
    return this.expandidos.has(data);
  }

  abrirNovaTarefa() {
    this.novaData = this.hojeISO();
    this.mostrarNovaData = true;
  }

  confirmarNovaTarefa() {
    this.mostrarNovaData = false;
    this.router.navigate(["/tarefas/registrar", this.novaData]);
  }

  editarDia(data: string) {
    this.router.navigate(["/tarefas/registrar", data]);
  }

  async excluirDia(data: string) {
    if (!confirm(`Tem certeza que deseja excluir todas as tarefas de ${this.formatarDataExibicao(data)}?`)) {
      return;
    }

    await this.db.run("DELETE FROM tarefas WHERE usuario_id = ? AND data = ?", [
      USUARIO_LOCAL_ID,
      data,
    ]);

    await this.carregar();
  }
}
