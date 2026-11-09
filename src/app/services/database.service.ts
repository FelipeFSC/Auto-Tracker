import { Injectable } from "@angular/core";
import Database from "@tauri-apps/plugin-sql";

/** id fixo usado enquanto não existe tela de login/autenticação */
export const USUARIO_LOCAL_ID = "usuario-local";

export interface Tarefa {
  id: string;
  usuario_id: string;
  data: string;
  hora_inicio: string;
  hora_fim: string | null;
  tipo_atividade_id: string | null;
  solicitante_id: string | null;
  os: string | null;
  observacoes: string | null;
  criado_em: string;
}

export interface NovaTarefa {
  hora_inicio: string;
  hora_fim: string | null;
  tipo_atividade_id: string | null;
  solicitante_id: string | null;
  os: string | null;
  observacoes: string | null;
}

export interface Configuracoes {
  /** "HH:MM" sugerido como início da primeira tarefa de um dia novo. */
  hora_entrada: string | null;
  /** Sem jornada configurada, o saldo de horas não é calculado. */
  jornada_minutos: number | null;
  tolerancia_minutos: number;
}

@Injectable({
  providedIn: "root",
})
export class DatabaseService {
  private db: any;
  private initPromise: Promise<void> | null = null;

  /** Fila usada por serializarConexao() para garantir 1 operação por vez. */
  private filaOperacoes: Promise<any> = Promise.resolve();

  // =====================================================================
  // INICIALIZAÇÃO
  // =====================================================================

  /**
   * Inicializa a conexão com o banco SQLite e garante que todas as
   * tabelas do sistema existam.
   *
   * Seguro chamar várias vezes.
   */
  init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.reallyInit();
    }

    return this.initPromise;
  }

  private async reallyInit(): Promise<void> {
    const conexao = await Database.load("sqlite:tracker.db");

    this.db = this.serializarConexao(conexao);

    // SQLite vem com foreign_keys desabilitado por padrão.
    await this.db.execute("PRAGMA foreign_keys = ON;");

    await this.criarTabelas();
    await this.migrarColunas();
    await this.criarIndices();
    await this.seedUsuarioLocal();

    console.log("Banco SQLite inicializado!");
  }

  /**
   * Serializa todas as chamadas execute/select numa fila única.
   *
   * Necessário porque as transações do app são mandadas como statements
   * SQL soltos (BEGIN/COMMIT/ROLLBACK via este mesmo execute, não existe
   * uma API de transação no plugin). Se duas operações do banco rodarem
   * concorrentemente, uma delas pode tentar abrir uma transação por cima
   * da outra que ainda está aberta. Enfileirando tudo aqui garantimos só
   * 1 operação em voo por vez na conexão.
   */
  private serializarConexao(conexao: any): any {
    const enfileirar = <T>(operacao: () => Promise<T>): Promise<T> => {
      const resultado = this.filaOperacoes.then(operacao, operacao);

      this.filaOperacoes = resultado.then(
        () => undefined,
        () => undefined,
      );

      return resultado;
    };

    return {
      execute: (sql: string, params?: any[]) =>
        enfileirar(() => conexao.execute(sql, params)),
      select: (sql: string, params?: any[]) =>
        enfileirar(() => conexao.select(sql, params)),
    };
  }

  // =====================================================================
  // USUÁRIO LOCAL
  // =====================================================================

  private async seedUsuarioLocal(): Promise<void> {
    await this.db.execute(
      `INSERT OR IGNORE INTO usuarios (id, nome) VALUES (?, 'Usuário Local')`,
      [USUARIO_LOCAL_ID],
    );

    await this.db.execute(
      `INSERT OR IGNORE INTO configuracoes (usuario_id) VALUES (?)`,
      [USUARIO_LOCAL_ID],
    );
  }

  // =====================================================================
  // QUERY / RUN
  // =====================================================================

  /**
   * SELECT genérico.
   */
  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    await this.init();

    return this.db.select(sql, params);
  }

  /**
   * INSERT / UPDATE / DELETE genérico.
   */
  async run(sql: string, params: any[] = []): Promise<void> {
    await this.init();

    await this.db.execute(sql, params);
  }

  // =====================================================================
  // TABELAS
  // =====================================================================

  private async criarTabelas(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id TEXT PRIMARY KEY,
        nome TEXT NOT NULL
      )
    `);

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS configuracoes (
        usuario_id TEXT PRIMARY KEY,
        hora_entrada TEXT,
        jornada_minutos INTEGER,
        tolerancia_minutos INTEGER NOT NULL DEFAULT 0,

        FOREIGN KEY (usuario_id)
          REFERENCES usuarios (id)
          ON DELETE CASCADE
      )
    `);

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS tipos_atividade (
        id TEXT PRIMARY KEY,
        usuario_id TEXT NOT NULL,
        nome TEXT NOT NULL,
        icone TEXT,
        cor TEXT,
        ativo INTEGER NOT NULL DEFAULT 1,

        FOREIGN KEY (usuario_id)
          REFERENCES usuarios (id)
          ON DELETE CASCADE
      )
    `);

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS solicitantes (
        id TEXT PRIMARY KEY,
        usuario_id TEXT NOT NULL,
        nome TEXT NOT NULL,
        os_padrao TEXT,
        descricao TEXT,
        ativo INTEGER NOT NULL DEFAULT 1,

        FOREIGN KEY (usuario_id)
          REFERENCES usuarios (id)
          ON DELETE CASCADE
      )
    `);

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS atalhos (
        id TEXT PRIMARY KEY,
        usuario_id TEXT NOT NULL,
        nome TEXT NOT NULL,
        duracao_minutos INTEGER NOT NULL,
        aplicar_duracao TEXT NOT NULL DEFAULT 'fim',
        tipo_atividade_id TEXT,
        solicitante_id TEXT,
        os TEXT,
        observacoes TEXT,
        ordem INTEGER NOT NULL DEFAULT 0,
        ativo INTEGER NOT NULL DEFAULT 1,

        FOREIGN KEY (usuario_id)
          REFERENCES usuarios (id)
          ON DELETE CASCADE,

        FOREIGN KEY (tipo_atividade_id)
          REFERENCES tipos_atividade (id)
          ON DELETE SET NULL,

        FOREIGN KEY (solicitante_id)
          REFERENCES solicitantes (id)
          ON DELETE SET NULL
      )
    `);

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS tarefas (
        id TEXT PRIMARY KEY,
        usuario_id TEXT NOT NULL,
        data TEXT NOT NULL,
        hora_inicio TEXT NOT NULL,
        hora_fim TEXT,
        tipo_atividade_id TEXT,
        solicitante_id TEXT,
        os TEXT,
        observacoes TEXT,
        criado_em TEXT NOT NULL,

        FOREIGN KEY (usuario_id)
          REFERENCES usuarios (id)
          ON DELETE CASCADE,

        FOREIGN KEY (tipo_atividade_id)
          REFERENCES tipos_atividade (id)
          ON DELETE SET NULL,

        FOREIGN KEY (solicitante_id)
          REFERENCES solicitantes (id)
          ON DELETE SET NULL
      )
    `);
  }

  // =====================================================================
  // MIGRAÇÕES
  // =====================================================================

  private async migrarColunas(): Promise<void> {
    const tentativas: [string, string][] = [
      ["solicitantes", "descricao TEXT"],
      ["atalhos", "aplicar_duracao TEXT NOT NULL DEFAULT 'fim'"],
    ];

    for (const [tabela, colunaDef] of tentativas) {
      try {
        await this.db.execute(`ALTER TABLE ${tabela} ADD COLUMN ${colunaDef}`);
      } catch {
        // A coluna provavelmente já existe.
      }
    }
  }

  // =====================================================================
  // ÍNDICES
  // =====================================================================

  private async criarIndices(): Promise<void> {
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_tarefas_data
      ON tarefas(data)
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_tarefas_usuario
      ON tarefas(usuario_id)
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_tipos_atividade_usuario
      ON tipos_atividade(usuario_id)
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_solicitantes_usuario
      ON solicitantes(usuario_id)
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_atalhos_usuario
      ON atalhos(usuario_id)
    `);
  }

  // =====================================================================
  // UTILITÁRIOS
  // =====================================================================

  /**
   * Gera UUID v4.
   */
  gerarId(): string {
    return crypto.randomUUID();
  }

  /**
   * Diferença em minutos entre duas horas "HH:MM". Retorna null se
   * `horaFim` ainda não estiver preenchida (tarefa em andamento) ou se o
   * fim vier antes do início.
   */
  calcularDuracaoMinutos(horaInicio: string, horaFim: string | null): number | null {
    if (!horaFim) {
      return null;
    }

    const [hIni, mIni] = horaInicio.split(":").map(Number);
    const [hFim, mFim] = horaFim.split(":").map(Number);

    const minutos = hFim * 60 + mFim - (hIni * 60 + mIni);

    return minutos >= 0 ? minutos : null;
  }

  /**
   * Formata uma duração em minutos como "1h30" (ou "45min" quando < 1h).
   */
  formatarDuracao(minutos: number): string {
    const horas = Math.floor(minutos / 60);
    const min = minutos % 60;

    if (horas === 0) {
      return `${min}min`;
    }

    return `${horas}h${String(min).padStart(2, "0")}`;
  }

  /**
   * Formata uma duração em minutos como horas decimais com vírgula, ex.:
   * "1,50". Equivalente à fórmula usada na planilha do sistema para o qual
   * os dados são enviados: =((hora_fim - hora_inicio) * 1440/60).
   */
  formatarDuracaoDecimal(minutos: number): string {
    return (minutos / 60).toFixed(2).replace(".", ",");
  }

  /**
   * Formata um saldo em minutos com sinal, ex.: "+1h30", "-45min".
   */
  formatarSaldo(minutos: number): string {
    if (minutos === 0) {
      return "0h00";
    }

    return `${minutos > 0 ? "+" : "-"}${this.formatarDuracao(Math.abs(minutos))}`;
  }

  // =====================================================================
  // CONFIGURAÇÕES
  // =====================================================================

  async obterConfiguracoes(): Promise<Configuracoes> {
    const [configuracoes] = await this.query<Configuracoes>(
      `SELECT hora_entrada, jornada_minutos, tolerancia_minutos
       FROM configuracoes
       WHERE usuario_id = ?`,
      [USUARIO_LOCAL_ID],
    );

    return configuracoes;
  }

  /**
   * Saldo de um dia em relação à jornada. Sábado e domingo não têm jornada,
   * então todo o tempo trabalhado conta como positivo. Uma diferença dentro
   * da tolerância vale zero; acima dela, conta a diferença inteira.
   *
   * Retorna null quando não há jornada configurada ou quando alguma tarefa
   * ainda está em aberto (o total do dia ainda não é definitivo).
   */
  calcularSaldoDiaMinutos(
    data: string,
    tarefas: { hora_inicio: string; hora_fim: string | null }[],
    configuracoes: Configuracoes,
  ): number | null {
    if (configuracoes.jornada_minutos === null || tarefas.some((t) => !t.hora_fim)) {
      return null;
    }

    const totalMinutos = tarefas.reduce(
      (soma, t) => soma + (this.calcularDuracaoMinutos(t.hora_inicio, t.hora_fim) ?? 0),
      0,
    );

    const [ano, mes, dia] = data.split("-").map(Number);
    const diaSemana = new Date(ano, mes - 1, dia).getDay();
    const fimDeSemana = diaSemana === 0 || diaSemana === 6;

    const diferenca = totalMinutos - (fimDeSemana ? 0 : configuracoes.jornada_minutos);

    return Math.abs(diferenca) <= configuracoes.tolerancia_minutos ? 0 : diferenca;
  }

  // =====================================================================
  // TAREFAS
  // =====================================================================

  /**
   * Substitui todas as tarefas de um dia pela lista informada — o
   * formulário de registro do dia trabalha com a lista inteira em
   * memória (edições e remoções incluídas) e só grava no banco quando o
   * usuário clica "Salvar", então apagar-e-reinserir é mais simples e
   * seguro do que tentar diffar linha a linha.
   */
  async salvarTarefasDoDia(data: string, tarefas: NovaTarefa[]): Promise<void> {
    await this.init();

    await this.db.execute("BEGIN TRANSACTION");

    try {
      await this.db.execute(
        `DELETE FROM tarefas WHERE usuario_id = ? AND data = ?`,
        [USUARIO_LOCAL_ID, data],
      );

      const agora = new Date().toISOString();

      for (const tarefa of tarefas) {
        await this.db.execute(
          `INSERT INTO tarefas
            (id, usuario_id, data, hora_inicio, hora_fim, tipo_atividade_id, solicitante_id, os, observacoes, criado_em)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            this.gerarId(),
            USUARIO_LOCAL_ID,
            data,
            tarefa.hora_inicio,
            tarefa.hora_fim || null,
            tarefa.tipo_atividade_id || null,
            tarefa.solicitante_id || null,
            tarefa.os || null,
            tarefa.observacoes || null,
            agora,
          ],
        );
      }

      await this.db.execute("COMMIT");
    } catch (erro) {
      await this.db.execute("ROLLBACK");
      throw erro;
    }
  }
}
