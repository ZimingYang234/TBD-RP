import { SHOP_ITEMS, type PublicRoomState } from '@tbd/shared';
import { ICON_COIN, ICON_ECLIPSE_KEY, ICON_HEART, ICON_LUCK, ICON_SHIELD, ICON_SWORD } from './icons';

export interface ShopModalCallbacks {
  onBuy: (itemId: string) => void;
  onUseItem: (itemId: string) => void;
  onClosed: () => void;
}

const CATEGORY_LABELS: Record<'consumable' | 'gear' | 'charm', string> = {
  consumable: 'Consumible',
  gear: 'Equipo',
  charm: 'Amuleto',
};

export class ShopModal {
  private overlayEl: HTMLElement | null = null;
  private open = false;

  constructor(private readonly callbacks: ShopModalCallbacks) {}

  public isOpen(): boolean {
    return this.open;
  }

  public show(room: PublicRoomState, myPlayerId: string | null): void {
    this.open = true;
    this.render(room, myPlayerId);
  }

  public hide(): void {
    this.open = false;
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
      el.id = 'shop-modal-overlay';
      el.className = 'modal-overlay';
      document.body.appendChild(el);
      this.overlayEl = el;
    }

    const myGold = me.gold ?? 0;
    const myInv = me.inventory ?? {};
    const myUpgrades = me.shopUpgrades ?? {};
    const potionsOwned = myInv.potion ?? 0;

    const itemsHtml = SHOP_ITEMS.map((item) => {
      const owned =
        item.id === 'sanctum_key'
          ? room.sanctumKey
            ? 1
            : 0
          : item.category === 'consumable'
            ? (myInv[item.id] ?? 0)
            : (myUpgrades[item.id] ?? 0);
      const maxed = owned >= item.maxOwned;
      const canAfford = myGold >= item.price;
      const disabled = maxed || !canAfford;
      const relic = item.id === 'sanctum_key';

      return `
        <div class="shop-item-row ${relic ? 'shop-relic' : ''}">
          <div class="shop-item-info">
            <div class="shop-item-head">
              <strong>${relic ? ICON_ECLIPSE_KEY : ''} ${this.escapeHtml(item.name)}</strong>
              <span class="shop-cat-pill">${CATEGORY_LABELS[item.category]}</span>
              <span class="shop-owned-pill">${owned}/${item.maxOwned}</span>
            </div>
            <div class="shop-item-desc">${this.escapeHtml(item.description)}</div>
          </div>
          <button
            type="button"
            class="btn shop-buy-btn"
            data-item-id="${item.id}"
            ${disabled ? 'disabled' : ''}
          >
            ${maxed ? 'Máximo' : `${item.price} monedas`}
          </button>
        </div>
      `;
    }).join('');

    this.overlayEl.innerHTML = `
      <div class="modal-card shop-modal-card" role="dialog" aria-modal="true" aria-labelledby="shop-title">
        <div class="modal-header">
          <div>
            <div class="modal-kicker">Mercader del Reino</div>
            <h2 id="shop-title" class="modal-title">Tienda de Objetos</h2>
          </div>
          <span class="gold-badge stat-row-inline">${ICON_COIN} ${myGold} monedas</span>
        </div>

        <div class="shop-stats-bar">
          <span class="stat-row-inline">${ICON_HEART} Vida: <strong>${me.hp}/${me.maxHp}</strong></span>
          <span class="stat-row-inline">${ICON_SWORD} Ataque: <strong>+${me.attackMod}</strong></span>
          <span class="stat-row-inline">${ICON_SHIELD} Defensa: <strong>${me.ac}</strong></span>
          <span class="stat-row-inline">${ICON_LUCK} Suerte: <strong>+${me.luckBonus ?? 0}</strong></span>
        </div>

        <div class="shop-items-list">${itemsHtml}</div>

        <div class="modal-footer" style="justify-content: space-between; flex-wrap: wrap;">
          ${
            potionsOwned > 0 && me.hp < me.maxHp
              ? `<button type="button" id="shop-use-potion-btn" class="btn btn-secondary">Beber poción (${potionsOwned})</button>`
              : '<span></span>'
          }
          <button type="button" id="shop-close-btn" class="btn">Cerrar tienda</button>
        </div>
      </div>
    `;

    this.overlayEl.querySelectorAll<HTMLButtonElement>('.shop-buy-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const itemId = btn.dataset.itemId;
        if (itemId) this.callbacks.onBuy(itemId);
      });
    });

    this.overlayEl.querySelector('#shop-use-potion-btn')?.addEventListener('click', () => {
      this.callbacks.onUseItem('potion');
    });

    this.overlayEl.querySelector('#shop-close-btn')?.addEventListener('click', () => {
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
