import {
  ITEMS_BY_ID,
  RARITY_COLORS,
  RARITY_LABELS,
  type ItemRarity,
} from '@tbd/shared';
import { ICON_COIN, ICON_SHIELD, ICON_SWORD } from './icons';

export interface ChestLootPayload {
  rarity: ItemRarity;
  gold: number;
  xp: number;
  itemId?: string;
  itemName?: string;
  inventoryFull?: boolean;
}

export interface ChestModalCallbacks {
  onEquip: (itemId: string) => void;
  onUse: (itemId: string) => void;
  onClosed: () => void;
}

export class ChestModal {
  private overlayEl: HTMLElement | null = null;
  private open = false;
  private animTimer: number | null = null;

  constructor(private readonly callbacks: ChestModalCallbacks) {}

  public isOpen(): boolean {
    return this.open;
  }

  public show(loot: ChestLootPayload): void {
    this.open = true;
    this.render(loot);
  }

  public hide(): void {
    this.open = false;
    if (this.animTimer !== null) {
      window.clearTimeout(this.animTimer);
      this.animTimer = null;
    }
    if (this.overlayEl) {
      this.overlayEl.remove();
      this.overlayEl = null;
    }
    this.callbacks.onClosed();
  }

  private render(loot: ChestLootPayload): void {
    if (!this.overlayEl) {
      const el = document.createElement('div');
      el.id = 'chest-modal-overlay';
      el.className = 'modal-overlay';
      document.body.appendChild(el);
      this.overlayEl = el;
    }

    const color = RARITY_COLORS[loot.rarity];
    const rarityLabel = RARITY_LABELS[loot.rarity];
    const itemDef = loot.itemId ? ITEMS_BY_ID[loot.itemId] : undefined;
    const isEquip = Boolean(itemDef && (itemDef.kind === 'weapon' || itemDef.kind === 'armor') && !loot.inventoryFull);
    const isUsable = Boolean(itemDef && (itemDef.id === 'potion' || itemDef.id === 'elixir') && !loot.inventoryFull);

    const itemIcon =
      itemDef?.kind === 'weapon' ? ICON_SWORD : itemDef?.kind === 'armor' ? ICON_SHIELD : '';

    this.overlayEl.innerHTML = `
      <div class="modal-card chest-modal-card" style="border-color:${color}" role="dialog" aria-modal="true" aria-labelledby="chest-title">
        <div class="modal-header">
          <div>
            <div class="modal-kicker" style="color:${color}">Cofre ${rarityLabel}</div>
            <h2 id="chest-title" class="modal-title">¡Tesoro encontrado!</h2>
          </div>
          <span class="shop-cat-pill" style="color:${color}; border-color:${color}66">${rarityLabel}</span>
        </div>

        <div class="chest-anim-stage">
          <div class="chest-graphic opening" id="chest-graphic-box" style="--chest-glow:${color}">
            <div class="chest-lid"></div>
            <div class="chest-body"><span class="chest-clasp"></span></div>
          </div>
        </div>

        <div class="chest-loot-reveal hidden" id="chest-loot-reveal">
          <div class="effects-row" style="justify-content:center;">
            <span class="effect-pill effect-gold stat-row-inline">${ICON_COIN} +${loot.gold} monedas</span>
            <span class="effect-pill effect-xp">+${loot.xp} EXP</span>
          </div>

          ${
            itemDef
              ? `
                <div class="chest-item-box" style="border-color:${color}">
                  <div class="chest-item-title stat-row-inline">
                    ${itemIcon}
                    <strong style="color:${color}">${this.escapeHtml(itemDef.name)}</strong>
                  </div>
                  <div class="shop-item-desc">${this.escapeHtml(itemDef.description)}</div>
                  ${
                    loot.inventoryFull
                      ? `<div class="chest-full-warn">Tu mochila (5/5) está llena: no se pudo guardar este objeto.</div>`
                      : ''
                  }
                </div>
              `
              : ''
          }
        </div>

        <div class="modal-footer" style="justify-content: flex-end; gap: 8px; flex-wrap: wrap;">
          ${
            isEquip && itemDef
              ? `<button type="button" id="chest-equip-btn" class="btn btn-secondary">Equipar ahora</button>`
              : ''
          }
          ${
            isUsable && itemDef
              ? `<button type="button" id="chest-use-btn" class="btn btn-secondary">Usar ahora</button>`
              : ''
          }
          <button type="button" id="chest-close-btn" class="btn">Recoger y cerrar</button>
        </div>
      </div>
    `;

    const box = this.overlayEl.querySelector('#chest-graphic-box');
    const reveal = this.overlayEl.querySelector('#chest-loot-reveal');
    if (this.animTimer !== null) window.clearTimeout(this.animTimer);
    this.animTimer = window.setTimeout(() => {
      box?.classList.remove('opening');
      box?.classList.add('opened');
      reveal?.classList.remove('hidden');
    }, 420);

    this.overlayEl.querySelector('#chest-equip-btn')?.addEventListener('click', () => {
      if (loot.itemId) this.callbacks.onEquip(loot.itemId);
      this.hide();
    });
    this.overlayEl.querySelector('#chest-use-btn')?.addEventListener('click', () => {
      if (loot.itemId) this.callbacks.onUse(loot.itemId);
      this.hide();
    });
    this.overlayEl.querySelector('#chest-close-btn')?.addEventListener('click', () => {
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
