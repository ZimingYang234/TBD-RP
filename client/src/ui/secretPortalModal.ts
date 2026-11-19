export interface SecretPortalReqs {
  hasFinalKey: boolean;
  hasSanctumKey: boolean;
  celestialDefeated: number;
}

export class SecretPortalModal {
  private overlayEl: HTMLElement | null = null;
  private open = false;

  constructor(private readonly onClosed: () => void) {}

  public isOpen(): boolean {
    return this.open;
  }

  public show(reqs: SecretPortalReqs): void {
    this.open = true;
    this.render(reqs);
  }

  public hide(): void {
    this.open = false;
    if (this.overlayEl) {
      this.overlayEl.remove();
      this.overlayEl = null;
    }
    this.onClosed();
  }

  private render(reqs: SecretPortalReqs): void {
    if (!this.overlayEl) {
      const el = document.createElement('div');
      el.id = 'secret-portal-overlay';
      el.className = 'modal-overlay';
      document.body.appendChild(el);
      this.overlayEl = el;
    }

    const row = (label: string, ok: boolean, detail?: string) => `
      <div class="inv-slot-card" style="border-left: 3px solid ${ok ? '#48b878' : '#e05a47'}">
        <div>
          <strong>${label}</strong>
          ${detail ? `<div class="shop-item-desc">${detail}</div>` : ''}
        </div>
        <span class="status-pill ${ok ? 'status-online' : 'status-offline'}">
          ${ok ? '✓ Listo' : '✗ Falta'}
        </span>
      </div>
    `;

    this.overlayEl.innerHTML = `
      <div class="modal-card shop-modal-card" role="dialog" aria-modal="true" aria-labelledby="sp-title">
        <div class="modal-header">
          <div>
            <div class="modal-kicker">Portal Sellado</div>
            <h2 id="sp-title" class="modal-title">Sala Secreta (?)</h2>
          </div>
          <button type="button" id="sp-close-x" class="btn btn-secondary">Cerrar</button>
        </div>

        <p class="modal-narration">Este portal está sellado. Necesitas reunir los 3 requisitos para abrirlo:</p>

        <div class="shop-items-list">
          ${row('1. Llave del Eclipse', reqs.hasSanctumKey, 'Se compra en la tienda por 10.000 monedas.')}
          ${row('2. Llave del Emperador', reqs.hasFinalKey, 'Se obtiene al derrotar al jefe final, nivel 30.')}
          ${row('3. Criaturas celestes', reqs.celestialDefeated >= 3, `${reqs.celestialDefeated}/3. Cada una es más fuerte y más difícil de encontrar.`)}
        </div>

        <div class="modal-footer" style="justify-content: flex-end;">
          <button type="button" id="sp-ok-btn" class="btn">Entendido</button>
        </div>
      </div>
    `;

    this.overlayEl.querySelector('#sp-close-x')?.addEventListener('click', () => this.hide());
    this.overlayEl.querySelector('#sp-ok-btn')?.addEventListener('click', () => this.hide());
  }
}
