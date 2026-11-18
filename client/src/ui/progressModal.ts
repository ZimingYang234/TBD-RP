import type { PublicRoomState } from '@tbd/shared';

const LOCAL_SAVE_KEY = 'tbd_rpg_saved_progress_v1';

export interface ProgressModalCallbacks {
  onRequestSaveCode: () => void;
  onLoadSaveCode: (saveCode: string) => void;
  onResetProgress: () => void;
  onClosed: () => void;
}

export class ProgressModal {
  private overlayEl: HTMLElement | null = null;
  private open = false;
  private generatedCode = '';
  private statusMsg: string | null = null;
  private confirmReset = false;

  constructor(private readonly callbacks: ProgressModalCallbacks) {}

  public isOpen(): boolean {
    return this.open;
  }

  public show(room: PublicRoomState, myPlayerId: string | null): void {
    this.open = true;
    this.statusMsg = null;
    this.confirmReset = false;
    this.render(room, myPlayerId);
  }

  public setGeneratedCode(code: string, room: PublicRoomState | null, myPlayerId: string | null): void {
    this.generatedCode = code;
    try {
      window.localStorage.setItem(LOCAL_SAVE_KEY, code);
      this.statusMsg = 'Progreso guardado en este navegador y código generado.';
    } catch {
      this.statusMsg = 'Código de guardado generado. ¡Cópialo para no perderlo!';
    }
    if (this.open && room) {
      this.render(room, myPlayerId);
    }
  }

  public hide(): void {
    this.open = false;
    this.confirmReset = false;
    if (this.overlayEl) {
      this.overlayEl.remove();
      this.overlayEl = null;
    }
    this.callbacks.onClosed();
  }

  private getLocalSavedCode(): string {
    try {
      return window.localStorage.getItem(LOCAL_SAVE_KEY) ?? '';
    } catch {
      return '';
    }
  }

  public render(room: PublicRoomState | null, myPlayerId: string | null): void {
    if (!this.open || !room || !myPlayerId) return;
    if (room.phase !== 'playing') {
      this.hide();
      return;
    }

    const me = room.players.find((p) => p.id === myPlayerId);
    if (!me) {
      this.hide();
      return;
    }

    if (!this.overlayEl) {
      const el = document.createElement('div');
      el.id = 'progress-modal-overlay';
      el.className = 'modal-overlay';
      document.body.appendChild(el);
      this.overlayEl = el;
    }

    const localSaved = this.getLocalSavedCode();

    this.overlayEl.innerHTML = `
      <div class="modal-card shop-modal-card" role="dialog" aria-modal="true" aria-labelledby="prog-title">
        <div class="modal-header">
          <div>
            <div class="modal-kicker">Personaje • Nivel ${me.level ?? 1}</div>
            <h2 id="prog-title" class="modal-title">Guardar y Reiniciar Progreso</h2>
          </div>
          <button type="button" id="prog-close-x" class="btn btn-secondary">Cerrar</button>
        </div>

        ${this.statusMsg ? `<div class="qte-banner qte-success">${this.escapeHtml(this.statusMsg)}</div>` : ''}

        <div class="tutorial-section">
          <h3>1. Guardar Progreso (Código portátil)</h3>
          <p style="font-size:0.86rem; color:var(--muted);">Guarda tu nivel, monedas, mochila, armas y habilidades. Puedes usar este código otro día o en otro Chromebook.</p>
          <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px;">
            <button type="button" id="prog-gen-btn" class="btn">Guardar progreso</button>
            ${
              this.generatedCode
                ? `<button type="button" id="prog-copy-btn" class="btn btn-secondary">Copiar código</button>`
                : ''
            }
          </div>
          ${
            this.generatedCode
              ? `<input id="prog-code-out" class="input" type="text" readonly value="${this.escapeHtml(this.generatedCode)}" style="margin-top:8px; font-size:0.82rem;" />`
              : ''
          }
        </div>

        <div class="tutorial-section">
          <h3>2. Cargar Progreso</h3>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <input id="prog-code-in" class="input" type="text" placeholder="Pega tu código TBD1-..." style="flex:1; min-width:180px; font-size:0.85rem;" />
            <button type="button" id="prog-load-btn" class="btn btn-secondary">Cargar</button>
          </div>
          ${
            localSaved
              ? `<button type="button" id="prog-load-local-btn" class="btn btn-secondary btn-sm" style="margin-top:8px;">Cargar último guardado de este navegador</button>`
              : ''
          }
        </div>

        <div class="tutorial-section" style="border-color: rgba(224,90,71,0.4);">
          <h3 style="color:#ff9c8d;">3. Reiniciar Progreso</h3>
          <p style="font-size:0.84rem; color:var(--muted);">Vuelve tu personaje a Nivel 1, 20 monedas y mochila vacía.</p>
          <button type="button" id="prog-reset-btn" class="btn btn-danger-outline" style="margin-top:6px;">
            ${this.confirmReset ? '¿Seguro? Pulsa otra vez para reiniciar' : 'Reiniciar progreso'}
          </button>
        </div>
      </div>
    `;

    this.overlayEl.querySelector('#prog-close-x')?.addEventListener('click', () => this.hide());
    this.overlayEl.querySelector('#prog-gen-btn')?.addEventListener('click', () => {
      this.callbacks.onRequestSaveCode();
    });
    this.overlayEl.querySelector('#prog-copy-btn')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(this.generatedCode);
        const btn = this.overlayEl?.querySelector('#prog-copy-btn');
        if (btn) btn.textContent = '¡Copiado!';
      } catch {
        // ignore
      }
    });
    this.overlayEl.querySelector('#prog-load-btn')?.addEventListener('click', () => {
      const input = this.overlayEl?.querySelector<HTMLInputElement>('#prog-code-in');
      const code = input?.value.trim() ?? '';
      if (!code) return;
      this.callbacks.onLoadSaveCode(code);
      this.hide();
    });
    this.overlayEl.querySelector('#prog-load-local-btn')?.addEventListener('click', () => {
      if (!localSaved) return;
      this.callbacks.onLoadSaveCode(localSaved);
      this.hide();
    });
    this.overlayEl.querySelector('#prog-reset-btn')?.addEventListener('click', () => {
      if (!this.confirmReset) {
        this.confirmReset = true;
        this.render(room, myPlayerId);
        return;
      }
      this.callbacks.onResetProgress();
      this.hide();
    });
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
