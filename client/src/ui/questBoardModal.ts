import type { QuestBoardPayload } from '@tbd/shared';

export class QuestBoardModal {
  private overlayEl: HTMLElement | null = null;
  private open = false;
  private data: QuestBoardPayload | null = null;

  constructor(
    private readonly onAccept: (portalKey: string, kind: 'combat' | 'event') => void,
    private readonly onClosed: () => void
  ) {}

  public isOpen(): boolean {
    return this.open;
  }

  public show(data: QuestBoardPayload): void {
    this.data = data;
    this.open = true;
    this.render();
  }

  public hide(): void {
    if (!this.open) return;
    this.open = false;
    this.data = null;
    this.overlayEl?.remove();
    this.overlayEl = null;
    this.onClosed();
  }

  private render(): void {
    if (!this.open || !this.data) return;
    if (!this.overlayEl) {
      const el = document.createElement('div');
      el.id = 'quest-board-overlay';
      el.className = 'modal-overlay';
      document.body.appendChild(el);
      this.overlayEl = el;
    }
    const data = this.data;
    const body =
      data.status === 'done'
        ? `<p class="board-copy">El camino hacia ${this.escape(data.destination)} ya está abierto.</p>`
        : data.status === 'active'
          ? `<p class="board-copy">Llevas ${data.progress ?? 0} de ${data.target ?? 0} ${data.kind === 'event' ? 'eventos' : 'combates'} para abrir ${this.escape(data.destination)}.</p>`
          : `<p class="board-copy">Elige cómo abrir el camino. Si cierras esto, el portal sigue cerrado.</p>
            <div class="board-options">
              <button type="button" class="board-option" id="board-combat">
                <strong>Misión</strong>
                <span>Gana ${data.combatTarget} combate${data.combatTarget === 1 ? '' : 's'} en este reino.</span>
              </button>
              <button type="button" class="board-option" id="board-event">
                <strong>Evento</strong>
                <span>Resuelve ${data.eventTarget} evento${data.eventTarget === 1 ? '' : 's'} en este reino.</span>
              </button>
            </div>`;

    this.overlayEl.innerHTML = `
      <div class="modal-card" role="dialog" aria-modal="true">
        <div class="modal-header">
          <div>
            <div class="modal-kicker">Tablón del camino</div>
            <h2 class="modal-title">${this.escape(data.destination)}</h2>
          </div>
          <button type="button" id="board-close" class="btn btn-secondary">Rechazar</button>
        </div>
        ${body}
      </div>
    `;
    this.overlayEl.querySelector('#board-close')?.addEventListener('click', () => this.hide());
    this.overlayEl.querySelector('#board-combat')?.addEventListener('click', () => {
      this.onAccept(data.portalKey, 'combat');
      this.hide();
    });
    this.overlayEl.querySelector('#board-event')?.addEventListener('click', () => {
      this.onAccept(data.portalKey, 'event');
      this.hide();
    });
  }

  private escape(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
