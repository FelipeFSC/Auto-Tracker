import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import * as echarts from "echarts";
import {
  Configuracoes,
  DatabaseService,
  USUARIO_LOCAL_ID,
} from "../../services/database.service";

interface TarefaMes {
  data: string;
  hora_inicio: string;
  hora_fim: string | null;
  tipo_atividade_nome: string | null;
  solicitante_nome: string | null;
}

const PALETA = ["#6d4fe0", "#2f6fed", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899"];

@Component({
  selector: "app-visao-geral",
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: "./visao-geral.component.html",
  styleUrl: "./visao-geral.component.css",
})
export class VisaoGeralComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild("graficoDias") graficoDiasRef!: ElementRef<HTMLElement>;
  @ViewChild("graficoTipos") graficoTiposRef!: ElementRef<HTMLElement>;
  @ViewChild("graficoSolicitantes") graficoSolicitantesRef!: ElementRef<HTMLElement>;

  mesSelecionado = this.mesAtual();

  totalHorasMes = "0h00";
  totalTarefasMes = 0;

  /** null quando não há jornada configurada — o card de saldo fica oculto. */
  saldoMesMinutos: number | null = null;
  saldoMesLabel = "";

  private tarefas: TarefaMes[] = [];

  private charts: {
    dias: echarts.ECharts | null;
    tipos: echarts.ECharts | null;
    solicitantes: echarts.ECharts | null;
  } = { dias: null, tipos: null, solicitantes: null };

  constructor(private db: DatabaseService) {}

  private mesAtual(): string {
    const hoje = new Date();
    return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
  }

  async ngOnInit() {
    await this.carregar();
  }

  ngAfterViewInit() {
    this.renderizarGraficos();
  }

  @HostListener("window:resize")
  onResize() {
    this.charts.dias?.resize();
    this.charts.tipos?.resize();
    this.charts.solicitantes?.resize();
  }

  ngOnDestroy() {
    this.charts.dias?.dispose();
    this.charts.tipos?.dispose();
    this.charts.solicitantes?.dispose();
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

  private async carregar() {
    const [ano, mes] = this.mesSelecionado.split("-").map(Number);
    const inicio = `${this.mesSelecionado}-01`;
    const ultimoDia = new Date(ano, mes, 0).getDate();
    const fim = `${this.mesSelecionado}-${String(ultimoDia).padStart(2, "0")}`;

    this.tarefas = await this.db.query<TarefaMes>(
      `SELECT
         t.data, t.hora_inicio, t.hora_fim,
         ta.nome AS tipo_atividade_nome,
         s.nome AS solicitante_nome
       FROM tarefas t
       LEFT JOIN tipos_atividade ta ON ta.id = t.tipo_atividade_id
       LEFT JOIN solicitantes s ON s.id = t.solicitante_id
       WHERE t.usuario_id = ? AND t.data BETWEEN ? AND ?`,
      [USUARIO_LOCAL_ID, inicio, fim],
    );

    this.calcularResumo();
    this.calcularSaldoMes(await this.db.obterConfiguracoes());
    this.renderizarGraficos();
  }

  private calcularSaldoMes(configuracoes: Configuracoes) {
    if (configuracoes.jornada_minutos === null) {
      this.saldoMesMinutos = null;
      return;
    }

    const porDia = new Map<string, TarefaMes[]>();
    for (const tarefa of this.tarefas) {
      porDia.set(tarefa.data, [...(porDia.get(tarefa.data) ?? []), tarefa]);
    }

    let saldo = 0;
    for (const [data, tarefas] of porDia) {
      saldo += this.db.calcularSaldoDiaMinutos(data, tarefas, configuracoes) ?? 0;
    }

    this.saldoMesMinutos = saldo;
    this.saldoMesLabel = this.db.formatarSaldo(saldo);
  }

  private duracaoTarefa(tarefa: TarefaMes): number {
    return this.db.calcularDuracaoMinutos(tarefa.hora_inicio, tarefa.hora_fim) ?? 0;
  }

  private calcularResumo() {
    const totalMinutos = this.tarefas.reduce((soma, t) => soma + this.duracaoTarefa(t), 0);

    this.totalHorasMes = this.db.formatarDuracao(totalMinutos);
    this.totalTarefasMes = this.tarefas.length;
  }

  private agruparMinutosPor(chave: (t: TarefaMes) => string): Map<string, number> {
    const mapa = new Map<string, number>();

    for (const tarefa of this.tarefas) {
      const rotulo = chave(tarefa);
      mapa.set(rotulo, (mapa.get(rotulo) ?? 0) + this.duracaoTarefa(tarefa));
    }

    return mapa;
  }

  private renderizarGraficos() {
    this.renderizarGraficoDias();
    this.renderizarGraficoTipos();
    this.renderizarGraficoSolicitantes();
  }

  private renderizarGraficoDias() {
    const elemento = this.graficoDiasRef?.nativeElement;
    if (!elemento) {
      return;
    }

    const [ano, mes] = this.mesSelecionado.split("-").map(Number);
    const ultimoDia = new Date(ano, mes, 0).getDate();

    const minutosPorDia = new Array(ultimoDia).fill(0);
    for (const tarefa of this.tarefas) {
      const dia = Number(tarefa.data.split("-")[2]);
      minutosPorDia[dia - 1] += this.duracaoTarefa(tarefa);
    }

    const categorias = Array.from({ length: ultimoDia }, (_, i) => String(i + 1));
    const valores = minutosPorDia.map((m) => Math.round((m / 60) * 100) / 100);

    let chart = this.charts.dias;
    if (!chart) {
      chart = echarts.init(elemento);
      this.charts.dias = chart;
    }

    chart.setOption({
      grid: { left: 40, right: 16, top: 24, bottom: 28 },
      tooltip: {
        trigger: "axis",
        valueFormatter: (v: number) => this.db.formatarDuracao(Math.round(v * 60)),
      },
      xAxis: {
        type: "category",
        data: categorias,
        axisTick: { show: false },
        axisLine: { lineStyle: { color: "#dfe3e8" } },
      },
      yAxis: {
        type: "value",
        name: "horas",
        splitLine: { lineStyle: { color: "#f0f0f5" } },
      },
      series: [
        {
          type: "bar",
          data: valores,
          barMaxWidth: 18,
          itemStyle: { color: "#6d4fe0", borderRadius: [4, 4, 0, 0] },
        },
      ],
    });
  }

  private renderizarGraficoPizza(
    chartKey: "tipos" | "solicitantes",
    elemento: HTMLElement | undefined,
    mapa: Map<string, number>,
    rotuloVazio: string,
  ) {
    if (!elemento) {
      return;
    }

    const dados = Array.from(mapa.entries())
      .map(([nome, minutos]) => ({
        name: nome || rotuloVazio,
        value: Math.round((minutos / 60) * 100) / 100,
      }))
      .sort((a, b) => b.value - a.value);

    let chart = this.charts[chartKey];
    if (!chart) {
      chart = echarts.init(elemento);
      this.charts[chartKey] = chart;
    }

    chart.setOption({
      color: PALETA,
      tooltip: {
        trigger: "item",
        valueFormatter: (v: number) => this.db.formatarDuracao(Math.round(v * 60)),
      },
      legend: {
        orient: "vertical",
        right: 8,
        top: "middle",
        textStyle: { fontSize: 12 },
      },
      series: [
        {
          type: "pie",
          radius: ["45%", "70%"],
          center: ["38%", "50%"],
          itemStyle: { borderRadius: 6, borderColor: "#fff", borderWidth: 2 },
          label: { show: false },
          data: dados,
        },
      ],
    });
  }

  private renderizarGraficoTipos() {
    const mapa = this.agruparMinutosPor((t) => t.tipo_atividade_nome || "");
    this.renderizarGraficoPizza("tipos", this.graficoTiposRef?.nativeElement, mapa, "Sem tipo");
  }

  private renderizarGraficoSolicitantes() {
    const mapa = this.agruparMinutosPor((t) => t.solicitante_nome || "");
    this.renderizarGraficoPizza(
      "solicitantes",
      this.graficoSolicitantesRef?.nativeElement,
      mapa,
      "Sem solicitante",
    );
  }
}
