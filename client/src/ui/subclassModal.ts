import { SUBCLASSES, type Race, type SubclassId } from '@tbd/shared';

const BY_RACE: Record<Race, SubclassId[]> = {
  Human: ['knight', 'rogue', 'mage'],
  Elf: ['explorer', 'summoner', 'dancer'],
  Dwarf: ['guardian', 'forgemaster', 'berserker'],
};

export class SubclassModal {
  private overlayEl: HTMLElement | null = null;
  private open = false;

  constructor(private readonly onChoose: (id: SubclassId) => void) {}

  public isOpen(): boolean {
    return this.open;
  }

  public show(race: Race): void {
    this.open = true;
    if (!this.overlayEl) {
      const el = document.createElement('div');
      el.id = 'subclass-overlay';
      el.className = 'modal-overlay';
      document.body.appendChild(el);
      this.overlayEl = el;
    }
    const cards = BY_RACE[race]
      .map((id) => {
        const def = SUBCLASSES[id];
        return `<button type="button" class="class-card" data-sub="${id}">
          <div class="class-name"><strong>${def.name}</strong></div>
          <div class="class-desc">${def.perk}</div>
        </button>`;
      })
      .join('');
    this.overlayEl.innerHTML = `
      <div class="modal-card" role="dialog" aria-modal="true">
        <div class="modal-kicker">Nivel 5</div>
        <h2 class="modal-title">Elige tu subclase</h2>
        <p class="modal-narration">Hace falta para salir de Valderroble. Solo puedes elegir una.</p>
        <div class="class-grid">${cards}</div>
      </div>
    `;
    this.overlayEl.querySelectorAll<HTMLButtonElement>('[data-sub]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.sub as SubclassId;
        this.hide();
        this.onChoose(id);
      });
    });
  }

  public hide(): void {
    this.open = false;
    this.overlayEl?.remove();
    this.overlayEl = null;
  }
}
