import type { SecretQuestionState } from '@tbd/shared';

export interface SecretQuestionModalCallbacks {
  onAnswer: (choiceIndex: number) => void;
  onSetCustomQuestion: (payload: {
    question: string;
    options: [string, string, string];
    correctIndex: number;
  }) => void;
  onClosed: () => void;
}

export class SecretQuestionModal {
  private overlayEl: HTMLElement | null = null;
  private open = false;
  private data: SecretQuestionState | null = null;
  private feedback: { correct: boolean; message: string; canCustomize: boolean } | null = null;

  constructor(private readonly callbacks: SecretQuestionModalCallbacks) {}

  public isOpen(): boolean {
    return this.open;
  }

  public show(data: SecretQuestionState): void {
    this.data = data;
    this.feedback = null;
    this.open = true;
    this.render();
  }

  public setResult(result: { correct: boolean; message: string; canCustomize: boolean }): void {
    this.feedback = result;
    if (this.open) {
      this.render();
    }
  }

  public hide(): void {
    this.open = false;
    this.feedback = null;
    if (this.overlayEl) {
      this.overlayEl.remove();
      this.overlayEl = null;
    }
    this.callbacks.onClosed();
  }

  private render(): void {
    if (!this.open || !this.data) return;
    if (!this.overlayEl) {
      const el = document.createElement('div');
      el.id = 'secret-question-overlay';
      el.className = 'modal-overlay';
      document.body.appendChild(el);
      this.overlayEl = el;
    }

    if (this.feedback?.correct && this.feedback.canCustomize) {
      this.overlayEl.innerHTML = `
        <div class="modal-card shop-modal-card" role="dialog" aria-modal="true" aria-labelledby="sq-title">
          <div class="modal-header">
            <div>
              <div class="modal-kicker">Santuario Secreto</div>
              <h2 id="sq-title" class="modal-title">¡Enigma Resuelto!</h2>
            </div>
            <button type="button" id="sq-close-btn" class="btn btn-secondary">Cerrar</button>
          </div>

          <div class="qte-banner qte-success">${this.escapeHtml(this.feedback.message)}</div>

          <div class="tutorial-section">
            <h3>Escribe tu propia pregunta secreta</h3>
            <p style="font-size:0.84rem; color:var(--muted);">Los próximos jugadores que completen el laberinto tendrán que responder tu pregunta:</p>
            <input id="sq-custom-q" class="input" type="text" maxlength="140" placeholder="Escribe tu pregunta..." style="margin-top:8px;" />
            <div style="display:grid; gap:6px; margin-top:8px;">
              <input id="sq-opt-0" class="input" type="text" maxlength="60" placeholder="a) Opción 1" />
              <input id="sq-opt-1" class="input" type="text" maxlength="60" placeholder="b) Opción 2" />
              <input id="sq-opt-2" class="input" type="text" maxlength="60" placeholder="c) Opción 3" />
            </div>
            <div style="margin-top:8px; display:flex; align-items:center; gap:8px;">
              <label for="sq-correct-sel" style="font-size:0.85rem; color:var(--muted);">Respuesta correcta:</label>
              <select id="sq-correct-sel" class="input" style="max-width:160px;">
                <option value="0">a) Opción 1</option>
                <option value="1">b) Opción 2</option>
                <option value="2">c) Opción 3</option>
              </select>
            </div>
          </div>

          <div class="modal-footer" style="justify-content: flex-end;">
            <button type="button" id="sq-save-btn" class="btn">Guardar nueva pregunta</button>
          </div>
        </div>
      `;

      this.overlayEl.querySelector('#sq-close-btn')?.addEventListener('click', () => this.hide());
      this.overlayEl.querySelector('#sq-save-btn')?.addEventListener('click', () => {
        const q = this.overlayEl?.querySelector<HTMLInputElement>('#sq-custom-q')?.value.trim() ?? '';
        const o0 = this.overlayEl?.querySelector<HTMLInputElement>('#sq-opt-0')?.value.trim() ?? '';
        const o1 = this.overlayEl?.querySelector<HTMLInputElement>('#sq-opt-1')?.value.trim() ?? '';
        const o2 = this.overlayEl?.querySelector<HTMLInputElement>('#sq-opt-2')?.value.trim() ?? '';
        const sel = Number(this.overlayEl?.querySelector<HTMLSelectElement>('#sq-correct-sel')?.value ?? '0');
        if (!q || !o0 || !o1 || !o2) return;
        this.callbacks.onSetCustomQuestion({
          question: q,
          options: [o0, o1, o2],
          correctIndex: sel,
        });
        this.hide();
      });
      return;
    }

    const optsHtml = this.data.options
      .map(
        (opt, idx) =>
          `<button type="button" class="choice-btn sq-opt-btn" data-idx="${idx}">${this.escapeHtml(opt)}</button>`
      )
      .join('');

    this.overlayEl.innerHTML = `
      <div class="modal-card shop-modal-card" role="dialog" aria-modal="true" aria-labelledby="sq-title">
        <div class="modal-header">
          <div>
            <div class="modal-kicker">Enigma de ${this.escapeHtml(this.data.authorName)}</div>
            <h2 id="sq-title" class="modal-title">La Pregunta Secreta</h2>
          </div>
          <button type="button" id="sq-close-btn" class="btn btn-secondary">Salir</button>
        </div>

        ${
          this.feedback && !this.feedback.correct
            ? `<div class="error-banner" style="margin-bottom:0;">${this.escapeHtml(this.feedback.message)}</div>`
            : ''
        }

        <p class="modal-narration">${this.escapeHtml(this.data.question)}</p>
        <div class="choice-list">${optsHtml}</div>
      </div>
    `;

    this.overlayEl.querySelector('#sq-close-btn')?.addEventListener('click', () => this.hide());
    this.overlayEl.querySelectorAll<HTMLButtonElement>('.sq-opt-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.idx);
        this.callbacks.onAnswer(idx);
      });
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
