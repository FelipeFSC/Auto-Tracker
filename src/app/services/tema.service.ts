import { Injectable, signal } from "@angular/core";
import { DatabaseService, Tema, USUARIO_LOCAL_ID } from "./database.service";

/** Cópia local do tema, só para aplicar antes do banco abrir (evita piscar claro ao iniciar). */
const CHAVE_CACHE = "tracker.tema";

/**
 * Aplica o tema claro/escuro colocando data-tema="claro|escuro" no <html>
 * — o styles.scss troca as variáveis de cor e o color-scheme do Material
 * a partir desse atributo. A preferência fica salva em `configuracoes.tema`.
 */
@Injectable({
  providedIn: "root",
})
export class TemaService {
  /** Preferência escolhida pelo usuário. */
  readonly tema = signal<Tema>(this.lerCache());

  /** Tema realmente aplicado ("sistema" já resolvido) — os gráficos observam este. */
  readonly escuro = signal(false);

  private midiaEscuro = window.matchMedia("(prefers-color-scheme: dark)");

  constructor(private db: DatabaseService) {
    this.midiaEscuro.addEventListener("change", () => this.aplicar());
    this.aplicar();
  }

  async carregar(): Promise<void> {
    const configuracoes = await this.db.obterConfiguracoes();
    this.tema.set(configuracoes.tema || "claro");
    this.salvarCache();
    this.aplicar();
  }

  async definir(tema: Tema): Promise<void> {
    this.tema.set(tema);
    this.salvarCache();
    this.aplicar();

    await this.db.run(`UPDATE configuracoes SET tema = ? WHERE usuario_id = ?`, [
      tema,
      USUARIO_LOCAL_ID,
    ]);
  }

  private aplicar() {
    const tema = this.tema();
    const escuro = tema === "escuro" || (tema === "sistema" && this.midiaEscuro.matches);

    document.documentElement.dataset["tema"] = escuro ? "escuro" : "claro";
    this.escuro.set(escuro);
  }

  private lerCache(): Tema {
    try {
      const valor = localStorage.getItem(CHAVE_CACHE);
      return valor === "escuro" || valor === "sistema" ? valor : "claro";
    } catch {
      return "claro";
    }
  }

  private salvarCache() {
    try {
      localStorage.setItem(CHAVE_CACHE, this.tema());
    } catch {
      // Sem cache só significa um instante no tema claro ao abrir o app.
    }
  }
}
