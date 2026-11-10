import { Component, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import {
  DatabaseService,
  Tema,
  USUARIO_LOCAL_ID,
} from "../../services/database.service";
import { TemaService } from "../../services/tema.service";

@Component({
  selector: "app-configuracoes",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
  ],
  templateUrl: "./configuracoes.component.html",
  styleUrl: "./configuracoes.component.css",
})
export class ConfiguracoesComponent implements OnInit {
  horaEntrada = "";
  jornada = "";
  toleranciaMinutos: number | null = 0;
  paioArredondamentoMinutos: number | null = 15;

  salvo = false;

  readonly opcoesTema: { valor: Tema; rotulo: string; icone: string }[] = [
    { valor: "claro", rotulo: "Claro", icone: "light_mode" },
    { valor: "escuro", rotulo: "Escuro", icone: "dark_mode" },
    { valor: "sistema", rotulo: "Sistema", icone: "contrast" },
  ];

  constructor(
    private db: DatabaseService,
    public tema: TemaService,
  ) {}

  async ngOnInit() {
    const configuracoes = await this.db.obterConfiguracoes();

    this.horaEntrada = configuracoes.hora_entrada || "";
    this.jornada =
      configuracoes.jornada_minutos !== null
        ? this.minutosParaHora(configuracoes.jornada_minutos)
        : "";
    this.toleranciaMinutos = configuracoes.tolerancia_minutos;
    this.paioArredondamentoMinutos = configuracoes.paio_arredondamento_minutos ?? 15;
  }

  private minutosParaHora(minutos: number): string {
    const horas = String(Math.floor(minutos / 60)).padStart(2, "0");
    return `${horas}:${String(minutos % 60).padStart(2, "0")}`;
  }

  private horaParaMinutos(hora: string): number {
    const [h, m] = hora.split(":").map(Number);
    return h * 60 + m;
  }

  async salvar(event: Event) {
    event.preventDefault();

    const tolerancia = this.toleranciaMinutos ?? 0;

    if (!Number.isInteger(tolerancia) || tolerancia < 0) {
      alert("A tolerância deve ser um número inteiro de minutos, sem valores negativos.");
      return;
    }

    const paio = this.paioArredondamentoMinutos ?? 15;

    if (!Number.isInteger(paio) || paio < 1 || paio > 30) {
      alert("O arredondamento do PAIO deve ser um número inteiro de minutos entre 1 e 30.");
      return;
    }

    await this.db.run(
      `UPDATE configuracoes
       SET hora_entrada = ?, jornada_minutos = ?, tolerancia_minutos = ?,
           paio_arredondamento_minutos = ?
       WHERE usuario_id = ?`,
      [
        this.horaEntrada || null,
        this.jornada ? this.horaParaMinutos(this.jornada) : null,
        tolerancia,
        paio,
        USUARIO_LOCAL_ID,
      ],
    );

    this.toleranciaMinutos = tolerancia;
    this.paioArredondamentoMinutos = paio;
    this.salvo = true;
  }
}
