import { ICON_COIN, ICON_HEART, ICON_LUCK, ICON_SHIELD, ICON_SWORD } from './icons';

export class TutorialModal {
  private overlayEl: HTMLElement | null = null;
  private open = false;

  constructor(private readonly onClosed: () => void) {}

  public isOpen(): boolean {
    return this.open;
  }

  public show(): void {
    this.open = true;
    this.render();
  }

  public hide(): void {
    this.open = false;
    if (this.overlayEl) {
      this.overlayEl.remove();
      this.overlayEl = null;
    }
    this.onClosed();
  }

  private render(): void {
    if (!this.overlayEl) {
      const el = document.createElement('div');
      el.id = 'tutorial-modal-overlay';
      el.className = 'modal-overlay';
      document.body.appendChild(el);
      this.overlayEl = el;
    }

    this.overlayEl.innerHTML = `
      <div class="modal-card tutorial-modal-card" role="dialog" aria-modal="true" aria-labelledby="tutorial-title">
        <div class="modal-header">
          <div>
            <div class="modal-kicker">Guía Rápida</div>
            <h2 id="tutorial-title" class="modal-title">¿Cómo se juega?</h2>
          </div>
          <button type="button" id="tutorial-x-btn" class="btn btn-secondary">Cerrar</button>
        </div>

        <div class="tutorial-grid">
          <div class="tutorial-section">
            <h3>1. Moverse y Explorar</h3>
            <p>Haz <strong>clic</strong> en cualquier casilla del mapa o usa <strong>WASD / Flechas</strong>.</p>
            <div class="tutorial-legend-list">
              <div><span class="legend-dot dot-portal"></span> <strong>Portal morado:</strong> lleva a todo el grupo a otro reino.</div>
              <div><span class="legend-dot dot-event"></span> <strong>Runa dorada:</strong> evento con 3 opciones para votar juntos.</div>
              <div><span class="legend-dot dot-combat"></span> <strong>Espadas rojas:</strong> batalla por turnos contra monstruos.</div>
              <div><span class="legend-dot dot-shop"></span> <strong>Moneda turquesa:</strong> abre la tienda de objetos.</div>
            </div>
          </div>

          <div class="tutorial-section">
            <h3>2. Qué significa cada icono</h3>
            <div class="tutorial-legend-list">
              <div>${ICON_HEART} <strong>Vida (PV):</strong> tu salud. Si llega a 0 caes en combate.</div>
              <div>${ICON_SWORD} <strong>Ataque:</strong> mejora tu puntería al atacar enemigos.</div>
              <div>${ICON_SHIELD} <strong>Defensa (Escudo):</strong> cuanto más alta, más difícil es que te den.</div>
              <div>${ICON_LUCK} <strong>Suerte:</strong> sube tu probabilidad en <em>Suerte (50/50)</em>.</div>
              <div>${ICON_COIN} <strong>Monedas:</strong> gástalas en la <strong>Tienda</strong> o en la <strong>Taberna</strong>.</div>
            </div>
          </div>

          <div class="tutorial-section">
            <h3>3. Combate por turnos</h3>
            <p>Al empezar, se ordenan los turnos automáticamente. En tu turno elige objetivo y pulsa:</p>
            <div class="tutorial-legend-list">
              <div>${ICON_SWORD} <strong>Atacar:</strong> golpe normal fiable.</div>
              <div>${ICON_LUCK} <strong>Suerte (50/50):</strong> doble daño si aciertas, o tropiezo si fallas.</div>
              <div><strong>Habilidad especial:</strong> 1 uso gratis por combate según tu clase.</div>
              <div>${ICON_SHIELD} <strong>Defender:</strong> sube tu Defensa (+2) hasta tu siguiente turno.</div>
            </div>
          </div>

          <div class="tutorial-section">
            <h3>4. Modos extra y consejos</h3>
            <div class="tutorial-legend-list">
              <div><strong>Jefe:</strong> batalla difícil en equipo con gran recompensa.</div>
              <div><strong>Duelo PvP:</strong> pelea amistosa entre amigos (al terminar recuperáis toda la vida).</div>
              <div><strong>Taberna:</strong> apuesta monedas tirando 2 dados (7–11 paga 2×, 12 paga 4×).</div>
              <div><strong>Chromebooks:</strong> si va lento, cambia <strong>Calidad</strong> arriba a <strong>Baja</strong>.</div>
            </div>
          </div>
        </div>

        <div class="modal-footer" style="justify-content: flex-end;">
          <button type="button" id="tutorial-ok-btn" class="btn">¡Entendido, a jugar!</button>
        </div>
      </div>
    `;

    this.overlayEl.querySelector('#tutorial-x-btn')?.addEventListener('click', () => this.hide());
    this.overlayEl.querySelector('#tutorial-ok-btn')?.addEventListener('click', () => this.hide());
  }
}
