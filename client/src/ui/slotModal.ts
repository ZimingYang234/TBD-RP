import {
  BOSS_KEY_BY_REGION,
  LOCAL_BOSS_KEY_IDS,
  MYTHICS,
  SLOT_COST_GOLD,
  SLOT_ODDS,
  type MythicId,
  type PublicRoomState,
  type SlotRarity,
  type SlotSpinPayload,
} from '@tbd/shared';
import { ICON_BOSS_KEY, ICON_COIN, ICON_RAPHAEL, ICON_URIEL } from './icons';

const REEL_FACE: Record<SlotRarity, string> = {
  comun: 'C',
  raro: 'R',
  epico: 'E',
  legendario: 'L',
  mitico: 'M',
};

export class SlotModal {
  private overlayEl: HTMLElement | null = null;
  private open = false;
  private spinning = false;
  private room: PublicRoomState | null = null;
  private myPlayerId: string | null = null;

  constructor(private readonly onSpin: () => void, private readonly onClosed: () => void) {}

  public isOpen(): boolean {
    return this.open;
  }

  public show(room: PublicRoomState, myPlayerId: string | null): void {
    this.room = room;
    this.myPlayerId = myPlayerId;
    this.open = true;
    this.spinning = false;
    this.renderShell();
  }

  public play(result: SlotSpinPayload): void {
    this.room = result.room;
    if (!this.open) this.open = true;
    this.spinning = true;
    this.renderShell();
    const faces = [REEL_FACE[result.rarity], REEL_FACE[result.rarity], REEL_FACE[result.rarity]];
    window.setTimeout(() => this.stopReel(0, faces[0]), 700);
    window.setTimeout(() => this.stopReel(1, faces[1]), 1100);
    window.setTimeout(() => this.stopReel(2, faces[2]), 1500);
    window.setTimeout(() => {
      this.spinning = false;
      this.renderShell(result);
    }, result.jackpot ? 2300 : 1750);
  }

  public hide(): void {
    this.open = false;
    this.spinning = false;
    this.overlayEl?.remove();
    this.overlayEl = null;
    this.onClosed();
  }

  private stopReel(index: number, face: string): void {
    const el = this.overlayEl?.querySelector<HTMLElement>(`#slot-reel-${index}`);
    if (!el) return;
    el.classList.remove('spinning');
    el.textContent = face;
  }

  private renderShell(result?: SlotSpinPayload): void {
    if (!this.open) return;
    if (!this.overlayEl) {
      const el = document.createElement('div');
      el.id = 'slot-overlay';
      el.className = 'modal-overlay';
      document.body.appendChild(el);
      this.overlayEl = el;
    }

    const me = this.room?.players.find((p) => p.id === this.myPlayerId);
    const gold = me?.gold ?? 0;
    const keys = (this.room?.bossKeys ?? []).filter((id) =>
      (LOCAL_BOSS_KEY_IDS as readonly string[]).includes(id)
    );
    const keyLabels = Object.values(BOSS_KEY_BY_REGION)
      .filter((key) => keys.includes(key.id))
      .map((key) => key.label);
    const canSpin = !this.spinning && gold >= SLOT_COST_GOLD && keys.length > 0;
    const owned = me?.unlockedMythics ?? [];
    const odds = SLOT_ODDS.map(
      (row) =>
        `<li class="slot-odd slot-odd-${row.id}"><span>${row.label}</span><strong>${row.pct}%</strong></li>`
    ).join('');
    const mythicLine =
      owned.length > 0
        ? owned
            .map((id) => `${MYTHICS[id].name}`)
            .join(' · ')
        : 'Ninguno';

    const resultHtml = result
      ? `<div class="slot-result ${result.jackpot ? 'jackpot' : ''}">
          ${result.jackpot ? `<div class="slot-jackpot">JACKPOT</div>` : ''}
          <p>${this.escape(result.summary)}</p>
          ${result.mythicId ? `<div class="slot-mythic-badge">${this.mythicIcon(result.mythicId)} ${this.escape(MYTHICS[result.mythicId].title)}</div>` : ''}
        </div>`
      : '';

    this.overlayEl.innerHTML = `
      <div class="modal-card slot-card ${result?.jackpot ? 'slot-card-jackpot' : ''}" role="dialog" aria-modal="true">
        <div class="modal-header">
          <div>
            <div class="modal-kicker">Sala de la Fortuna</div>
            <h2 class="modal-title">Tragaperras</h2>
          </div>
          <button type="button" id="slot-close-btn" class="btn btn-secondary">Cerrar</button>
        </div>
        <p class="slot-cost">Una tirada cuesta <strong>100 monedas</strong> y <strong>1 llave de jefe local</strong>.</p>
        <div class="slot-layout">
          <div class="slot-machine">
            <div class="slot-reels" aria-hidden="true">
              <div class="slot-reel ${this.spinning ? 'spinning' : ''}" id="slot-reel-0">${result ? REEL_FACE[result.rarity] : '?'}</div>
              <div class="slot-reel ${this.spinning ? 'spinning' : ''}" id="slot-reel-1">${result ? REEL_FACE[result.rarity] : '?'}</div>
              <div class="slot-reel ${this.spinning ? 'spinning' : ''}" id="slot-reel-2">${result ? REEL_FACE[result.rarity] : '?'}</div>
            </div>
            ${resultHtml}
            <button type="button" id="slot-spin-btn" class="btn" ${canSpin ? '' : 'disabled'}>Tirar</button>
            <p class="slot-status">
              <span class="stat-row-inline">${ICON_COIN} ${gold}</span>
              <span class="stat-row-inline">${ICON_BOSS_KEY} ${keys.length}</span>
            </p>
            <p class="slot-keys">${keyLabels.length ? this.escape(keyLabels.join(' · ')) : 'Sin llaves locales.'}</p>
            <p class="slot-owned">Míticos: ${this.escape(mythicLine)}</p>
          </div>
          <aside class="slot-odds">
            <h3>Probabilidades</h3>
            <ul>${odds}</ul>
          </aside>
        </div>
      </div>
    `;

    this.overlayEl.querySelector('#slot-close-btn')?.addEventListener('click', () => this.hide());
    this.overlayEl.querySelector('#slot-spin-btn')?.addEventListener('click', () => {
      if (!canSpin) return;
      this.onSpin();
    });
  }

  private mythicIcon(id: MythicId): string {
    return id === 'uriel' ? ICON_URIEL : ICON_RAPHAEL;
  }

  private escape(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
