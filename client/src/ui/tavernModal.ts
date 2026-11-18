import {
  TAVERN_MAX_PLAYS,
  TAVERN_WINDOW_MS,
  type PublicRoomState,
  type TavernResultPayload,
} from '@tbd/shared';

export interface TavernModalCallbacks {
  onPlay: (bet: number) => void;
  onClosed: () => void;
}

const BET_OPTIONS = [5, 10, 20, 50];

export class TavernModal {
  private overlayEl: HTMLElement | null = null;
  private open = false;
  private lastResult: TavernResultPayload | null = null;

  constructor(private readonly callbacks: TavernModalCallbacks) {}

  public isOpen(): boolean {
    return this.open;
  }

  public show(room: PublicRoomState, myPlayerId: string | null): void {
    this.open = true;
    this.lastResult = null;
    this.render(room, myPlayerId);
  }

  public setResult(result: TavernResultPayload, myPlayerId: string | null): void {
    this.lastResult = result;
    if (this.open) {
      this.render(result.room, myPlayerId);
    }
  }

  public hide(): void {
    this.open = false;
    this.lastResult = null;
    if (this.overlayEl) {
      this.overlayEl.remove();
      this.overlayEl = null;
    }
    this.callbacks.onClosed();
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
      el.id = 'tavern-modal-overlay';
      el.className = 'modal-overlay';
      document.body.appendChild(el);
      this.overlayEl = el;
    }

    const myGold = me.gold ?? 0;
    const now = Date.now();
    const recentPlays = (me.tavernPlays ?? []).filter((ts) => now - ts < TAVERN_WINDOW_MS);
    const playsLeft = Math.max(0, TAVERN_MAX_PLAYS - recentPlays.length);
    const waitMin =
      playsLeft === 0 && recentPlays.length > 0
        ? Math.max(1, Math.ceil((Math.min(...recentPlays) + TAVERN_WINDOW_MS - now) / 60_000))
        : 0;

    const betButtonsHtml = BET_OPTIONS.map((bet) => {
      const disabled = myGold < bet || playsLeft <= 0;
      return `
        <button type="button" class="btn tavern-bet-btn" data-bet="${bet}" ${disabled ? 'disabled' : ''}>
          Apostar ${bet}
        </button>
      `;
    }).join('');

    const r = this.lastResult;
    const resultHtml = r
      ? `
        <div class="dice-stage">
          <div class="dice-visual-row">
            <div class="die-box ${r.net > 0 ? 'hit' : 'miss'}">${r.die1}</div>
            <div class="die-box ${r.net > 0 ? 'hit' : 'miss'}">${r.die2}</div>
            <div class="dice-detail">
              <div class="dice-headline">
                <span class="roll-badge ${r.total === 12 ? 'crit' : r.net > 0 ? 'hit' : 'miss'}">
                  ${r.total === 12 ? '¡BOTE x4!' : r.net > 0 ? '¡GANASTE x2!' : 'PERDISTE'}
                </span>
                <span>${this.escapeHtml(r.headline)}</span>
              </div>
              <div class="dice-formula">Total: ${r.total} (apostaste ${r.bet} monedas)</div>
            </div>
          </div>
        </div>
      `
      : `
        <div class="dice-stage">
          <div class="dice-placeholder">
            Tira 2 dados: <strong>7–11</strong> paga <strong>2x</strong> • <strong>12</strong> paga <strong>4x</strong> • <strong>2–6</strong> gana la taberna.
          </div>
        </div>
      `;

    this.overlayEl.innerHTML = `
      <div class="modal-card shop-modal-card" role="dialog" aria-modal="true" aria-labelledby="tavern-title">
        <div class="modal-header">
          <div>
            <div class="modal-kicker">Minijuego de Taberna</div>
            <h2 id="tavern-title" class="modal-title">Dados de la Fortuna</h2>
          </div>
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            <span class="badge">Tiradas: ${playsLeft}/${TAVERN_MAX_PLAYS}</span>
            <span class="gold-badge">${myGold} monedas</span>
          </div>
        </div>

        ${
          playsLeft === 0
            ? `<div class="error-banner" style="margin-bottom:0;">Has usado tus ${TAVERN_MAX_PLAYS} tiradas (15 min). Podrás volver a tirar en ~${waitMin} min.</div>`
            : ''
        }

        ${resultHtml}

        <div class="tavern-bets-grid">${betButtonsHtml}</div>

        <div class="modal-footer" style="justify-content: flex-end;">
          <button type="button" id="tavern-close-btn" class="btn btn-secondary">Salir de la taberna</button>
        </div>
      </div>
    `;

    this.overlayEl.querySelectorAll<HTMLButtonElement>('.tavern-bet-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const bet = Number(btn.dataset.bet);
        if (bet > 0) this.callbacks.onPlay(bet);
      });
    });

    this.overlayEl.querySelector('#tavern-close-btn')?.addEventListener('click', () => {
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
