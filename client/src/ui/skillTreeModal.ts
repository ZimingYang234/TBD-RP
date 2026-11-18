import {
  SKILL_TREE,
  type PublicRoomState,
  type SkillNodeId,
} from '@tbd/shared';

export interface SkillTreeModalCallbacks {
  onUnlock: (skillId: SkillNodeId) => void;
  onClosed: () => void;
}

const BRANCHES: Array<'Marcial' | 'Baluarte' | 'Arcano'> = ['Marcial', 'Baluarte', 'Arcano'];

export class SkillTreeModal {
  private overlayEl: HTMLElement | null = null;
  private open = false;

  constructor(private readonly callbacks: SkillTreeModalCallbacks) {}

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
      el.id = 'skilltree-modal-overlay';
      el.className = 'modal-overlay';
      document.body.appendChild(el);
      this.overlayEl = el;
    }

    const points = me.skillPoints ?? 0;
    const unlocked = new Set(me.unlockedSkills ?? []);

    const branchesHtml = BRANCHES.map((branch) => {
      const nodes = SKILL_TREE.filter((n) => n.branch === branch).sort((a, b) => a.tier - b.tier);
      const nodesHtml = nodes
        .map((node) => {
          const isUnlocked = unlocked.has(node.id);
          const reqMet = !node.requires || unlocked.has(node.requires);
          const canBuy = !isUnlocked && reqMet && points >= node.cost;
          const statusCls = isUnlocked ? 'unlocked' : canBuy ? 'available' : 'locked';

          return `
            <div class="skill-node-card ${statusCls}">
              <div class="skill-node-head">
                <strong>${this.escapeHtml(node.name)}</strong>
                <span class="shop-cat-pill">${node.kind === 'active' ? 'Habilidad' : 'Pasiva'}</span>
              </div>
              <div class="shop-item-desc">${this.escapeHtml(node.description)}</div>
              <div class="skill-node-foot">
                ${
                  isUnlocked
                    ? '<span class="skill-unlocked-tag">Desbloqueada</span>'
                    : `<button type="button" class="btn btn-sm skill-unlock-btn" data-skill-id="${node.id}" ${!canBuy ? 'disabled' : ''}>
                        ${reqMet ? `Desbloquear (${node.cost} pt)` : 'Requiere nivel anterior'}
                      </button>`
                }
              </div>
            </div>
          `;
        })
        .join('<div class="skill-arrow">↓</div>');

      return `
        <div class="skill-branch-col">
          <div class="skill-branch-title">Rama ${branch}</div>
          <div class="skill-branch-nodes">${nodesHtml}</div>
        </div>
      `;
    }).join('');

    this.overlayEl.innerHTML = `
      <div class="modal-card tutorial-modal-card" role="dialog" aria-modal="true" aria-labelledby="skilltree-title">
        <div class="modal-header">
          <div>
            <div class="modal-kicker">Progreso del Héroe • Nivel ${me.level ?? 1}</div>
            <h2 id="skilltree-title" class="modal-title">Árbol de Habilidades</h2>
          </div>
          <span class="gold-badge">${points} punto${points === 1 ? '' : 's'} disponible${points === 1 ? '' : 's'}</span>
        </div>

        <div class="skill-tree-grid">${branchesHtml}</div>

        <div class="modal-footer" style="justify-content: space-between; flex-wrap: wrap;">
          <span style="font-size:0.82rem; color: var(--muted);">Ganas +1 punto de habilidad cada vez que subes de nivel.</span>
          <button type="button" id="skilltree-close-btn" class="btn">Cerrar</button>
        </div>
      </div>
    `;

    this.overlayEl.querySelectorAll<HTMLButtonElement>('.skill-unlock-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const skillId = btn.dataset.skillId as SkillNodeId | undefined;
        if (skillId) this.callbacks.onUnlock(skillId);
      });
    });

    this.overlayEl.querySelector('#skilltree-close-btn')?.addEventListener('click', () => {
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
