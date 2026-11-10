import { Component } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterOutlet, RouterLink, RouterLinkActive } from "@angular/router";
import { DatabaseService } from "./services/database.service";
import { TemaService } from "./services/tema.service";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: "./app.component.html",
  styleUrl: "./app.component.css",
})
export class AppComponent {
  menuAberto = false;

  constructor(
    private database: DatabaseService,
    private tema: TemaService,
  ) {
    this.database.init();
    this.tema.carregar();
  }
}
