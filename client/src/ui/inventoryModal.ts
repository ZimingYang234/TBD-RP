import {
  ITEMS_BY_ID,
  MAX_INVENTORY_SLOTS,
  RARITY_COLORS,
  RARITY_LABELS,
  type PublicRoomState,
} from '@tbd/shared';
import { ICON_SHIELD, ICON_SWORD } from './icons';

export interface InventoryModalCallbacks {
  onEquip: (itemId: string) => void;
  onUnequip: (slot: 'weapon' | 'armor') => void;
  onUse: (itemId: string) => void;
  onDrop: (itemId: string) => void;
  onClosed: () => void;
}

export class InventoryModal {
  private overlayEl: HTMLElement | null = null;
  private open = false;

  constructor(private readonly callbacks: InventoryModalCallbacks) {}

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
      el.id = 'inventory-modal-overlay';
      el.className = 'modal-overlay';
      document.body.appendChild(el);
      this.overlayEl = el;
    }

    const weaponDef = me.equippedWeaponId ? ITEMS_BY_ID[me.equippedWeaponId] : null;
    const armorDef = me.equippedArmorId ? ITEMS_BY_ID[me.equippedArmorId] : null;

    const entries = Object.entries(me.inventory ?? {}).filter(([, qty]) => qty > 0);
    const slotsHtml: string[] = [];

    for (let i = 0; i < MAX_INVENTORY_SLOTS; i++) {
      const entry = entries[i];
      if (!entry) {
        slotsHtml.push(`
          <div class="inv-slot-card empty">
            <span class="inv-empty-label">Espacio ${i + 1} — Vacío</span>
          </div>
        `);
        continue;
      }

      const [itemId, qty] = entry;
      const def = ITEMS_BY_ID[itemId];
      const name = def?.name ?? itemId;
      const rarity = def?.rarity ?? 'comun';
      const rarityColor = RARITY_COLORS[rarity];
      const desc = def?.description ?? '';
      const isEquip = def?.kind === 'weapon' || def?.kind === 'armor';
      const isUsable = itemId === 'potion' || itemId === 'elixir';

      slotsHtml.push(`
        <div class="inv-slot-card" style="border-left: 3px solid ${rarityColor}">
          <div class="inv-slot-info">
            <div class="shop-item-head">
              <strong>${this.escapeHtml(name)}</strong>
              <span class="shop-cat-pill" style="color:${rarityColor}; border-color:${rarityColor}55">${RARITY_LABELS[rarity]}</span>
              <span class="shop-owned-pill">×${qty}</span>
            </div>
            <div class="shop-item-desc">${this.escapeHtml(desc)}</div>
          </div>
          <div class="inv-slot-actions">
            ${isEquip ? `<button type="button" class="btn btn-sm inv-equip-btn" data-item-id="${itemId}">Equipar</button>` : ''}
            ${isUsable ? `<button type="button" class="btn btn-sm inv-use-btn" data-item-id="${itemId}">Usar</button>` : ''}
            <button type="button" class="btn btn-secondary btn-sm inv-drop-btn" data-item-id="${itemId}">Soltar</button>
          </div>
        </div>
      `);
    }

    this.overlayEl.innerHTML = `
      <div class="modal-card shop-modal-card" role="dialog" aria-modal="true" aria-labelledby="inv-title">
        <div class="modal-header">
          <div>
            <div class="modal-kicker">Equipo y Mochila</div>
            <h2 id="inv-title" class="modal-title">Mochila (${entries.length}/${MAX_INVENTORY_SLOTS})</h2>
          </div>
          <span class="badge">Nivel ${me.level ?? 1}</span>
        </div>

        <div class="equip-grid">
          <div class="equip-box">
            <div class="field-label stat-row-inline">${ICON_SWORD} Arma equipada</div>
            <div class="equip-value" style="color:${weaponDef ? RARITY_COLORS[weaponDef.rarity] : 'var(--muted)'}">
              ${weaponDef ? this.escapeHtml(weaponDef.name) : 'Ninguna'}
            </div>
            ${weaponDef ? `<div class="shop-item-desc">${this.escapeHtml(weaponDef.description)}</div>` : ''}
            ${weaponDef ? `<button type="button" id="unequip-weapon-btn" class="btn btn-secondary btn-sm" style="margin-top:6px;">Desequipar</button>` : ''}
          </div>
          <div class="equip-box">
            <div class="field-label stat-row-inline">${ICON_SHIELD} Armadura equipada</div>
            <div class="equip-value" style="color:${armorDef ? RARITY_COLORS[armorDef.rarity] : 'var(--muted)'}">
              ${armorDef ? this.escapeHtml(armorDef.name) : 'Ninguna'}
            </div>
            ${armorDef ? `<div class="shop-item-desc">${this.escapeHtml(armorDef.description)}</div>` : ''}
            ${armorDef ? `<button type="button" id="unequip-armor-btn" class="btn btn-secondary btn-sm" style="margin-top:6px;">Desequipar</button>` : ''}
          </div>
        </div>

        <div class="shop-items-list">${slotsHtml.join('')}</div>

        <div class="modal-footer" style="justify-content: flex-end;">
          <button type="button" id="inv-close-btn" class="btn">Cerrar mochila</button>
        </div>
      </div>
    `;

    this.overlayEl.querySelectorAll<HTMLButtonElement>('.inv-equip-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.itemId) this.callbacks.onEquip(btn.dataset.itemId);
      });
    });
    this.overlayEl.querySelectorAll<HTMLButtonElement>('.inv-use-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.itemId) this.callbacks.onUse(btn.dataset.itemId);
      });
    });
    this.overlayEl.querySelectorAll<HTMLButtonElement>('.inv-drop-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.itemId) this.callbacks.onDrop(btn.dataset.itemId);
      });
    });
    this.overlayEl.querySelector('#unequip-weapon-btn')?.addEventListener('click', () => {
      this.callbacks.onUnequip('weapon');
    });
    this.overlayEl.querySelector('#unequip-armor-btn')?.addEventListener('click', () => {
      this.callbacks.onUnequip('armor');
    });
    this.overlayEl.querySelector('#inv-close-btn')?.addEventListener('click', () => {
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
