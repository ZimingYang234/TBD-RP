import {
  PLAYER_CLASSES,
  SKILL_TREE,
  type CombatEndedPayload,
  type CombatState,
  type DiceRollBreakdown,
  type PublicRoomState,
} from '@tbd/shared';
import { ICON_HEART, ICON_LUCK, ICON_POTION, ICON_SHIELD, ICON_SWORD } from './icons';

export type CombatActionType =
  | 'attack'
  | 'luck'
  | 'special'
  | 'skill_safe'
  | 'skill_shield'
  | 'skill_pierce'
  | 'defend'
  | 'potion'
  | 'bomb';

export interface CombatModalCallbacks {
  onAction: (action: CombatActionType, targetId?: string) => void;
  onSkipTurn: () => void;
  onOutcomeClosed: () => void;
}

export class CombatModal {
  private overlayEl: HTMLElement | null = null;
  private outcome: CombatEndedPayload | null = null;
  private selectedTargetId: string | null = null;
  private lastAnimatedSignature: string | null = null;
  private diceTimer: number | null = null;

  constructor(private readonly callbacks: CombatModalCallbacks) {}

  public isOpen(): boolean {
    return Boolean(this.overlayEl);
  }

  public setOutcome(outcome: CombatEndedPayload): void {
    this.outcome = outcome;
  }

  public clearOutcome(): void {
    this.outcome = null;
  }

  public hide(): void {
    if (this.diceTimer !== null) {
      window.clearInterval(this.diceTimer);
      this.diceTimer = null;
    }
    if (this.overlayEl) {
      this.overlayEl.remove();
      this.overlayEl = null;
    }
  }

  private ensureOverlay(): HTMLElement {
    if (!this.overlayEl) {
      const el = document.createElement('div');
      el.id = 'combat-modal-overlay';
      el.className = 'modal-overlay';
      document.body.appendChild(el);
      this.overlayEl = el;
    }
    return this.overlayEl;
  }

  public render(room: PublicRoomState, myPlayerId: string | null): void {
    if (this.outcome) {
      this.renderOutcome(this.outcome);
      return;
    }

    if (room.phase !== 'combat' || !room.combat) {
      this.lastAnimatedSignature = null;
      this.hide();
      return;
    }

    this.renderCombat(room, room.combat, myPlayerId);
  }

  private renderCombat(
    room: PublicRoomState,
    combat: CombatState,
    myPlayerId: string | null
  ): void {
    const overlay = this.ensureOverlay();
    const isPvp = combat.mode === 'pvp';
    const activeTurn = combat.turnOrder[combat.turnIndex];
    const isMyTurn = activeTurn?.kind === 'player' && activeTurn.id === myPlayerId;
    const isHost = room.hostId === myPlayerId;
    const me = room.players.find((p) => p.id === myPlayerId);

    if (isPvp) {
      const livingRivals = room.players.filter((p) => p.id !== myPlayerId && p.hp > 0);
      if (!this.selectedTargetId || !livingRivals.some((p) => p.id === this.selectedTargetId)) {
        this.selectedTargetId = livingRivals[0]?.id ?? null;
      }
    } else {
      const livingEnemies = combat.enemies.filter((e) => e.hp > 0);
      if (!this.selectedTargetId || !livingEnemies.some((e) => e.id === this.selectedTargetId)) {
        this.selectedTargetId = livingEnemies[0]?.id ?? null;
      }
    }

    const turnPillsHtml = combat.turnOrder
      .map((entry, idx) => {
        const isCurrent = idx === combat.turnIndex;
        const alive =
          entry.kind === 'player'
            ? (room.players.find((p) => p.id === entry.id)?.hp ?? 0) > 0
            : (combat.enemies.find((e) => e.id === entry.id)?.hp ?? 0) > 0;
        const cls = [
          'turn-pill',
          isCurrent ? 'active' : '',
          entry.kind === 'enemy' ? 'enemy' : 'player',
          !alive ? 'ko' : '',
        ]
          .filter(Boolean)
          .join(' ');
        return `<span class="${cls}">${this.escapeHtml(entry.name)} <small>(${entry.initiative})</small></span>`;
      })
      .join('');

    let targetsHtml = '';
    let statusHtml = '';

    if (isPvp) {
      const rivals = room.players.filter((p) => p.id !== myPlayerId);
      targetsHtml = rivals
        .map((rival) => {
          const cfg = PLAYER_CLASSES[rival.playerClass];
          const hpPct = Math.max(0, Math.min(100, Math.round((rival.hp / rival.maxHp) * 100)));
          const isSelected = rival.id === this.selectedTargetId && rival.hp > 0;
          const isDead = rival.hp <= 0;
          const isDefending = combat.defendingIds.includes(rival.id);
          return `
            <button
              type="button"
              class="combat-enemy-card ${isSelected ? 'selected' : ''} ${isDead ? 'dead' : ''}"
              data-target-id="${rival.id}"
              ${isDead ? 'disabled' : ''}
            >
              <div class="combat-card-head">
                <span style="display:flex; align-items:center; gap:7px;">
                  <span class="class-dot" style="background:${cfg.colorHex}; color:${cfg.colorHex}"></span>
                  <strong>${this.escapeHtml(rival.name)}</strong>
                </span>
                <span class="badge badge-icon">${ICON_SHIELD} ${rival.ac}${isDefending ? ' +2' : ''}</span>
              </div>
              <div class="combat-hp-text stat-row-inline">${ICON_HEART} ${rival.hp}/${rival.maxHp} • ${ICON_SWORD} +${rival.attackMod}${isDefending ? ' • Defendiendo' : ''}</div>
              <div class="hp-bar"><div class="hp-fill enemy-hp" style="width:${hpPct}%"></div></div>
              ${isSelected ? '<div class="target-tag">Objetivo seleccionado</div>' : ''}
              ${isDead ? '<div class="target-tag dead-tag">Derrotado</div>' : ''}
            </button>
          `;
        })
        .join('');

      const selfList = me ? [me] : room.players;
      statusHtml = selfList
        .map((p) => {
          const cfg = PLAYER_CLASSES[p.playerClass];
          const hpPct = Math.max(0, Math.min(100, Math.round((p.hp / p.maxHp) * 100)));
          const isDefending = combat.defendingIds.includes(p.id);
          const isTurn = activeTurn?.kind === 'player' && activeTurn.id === p.id;
          return `
            <div class="combat-ally-card ${isTurn ? 'active-turn' : ''} ${p.hp <= 0 ? 'dead' : ''}">
              <div class="combat-card-head">
                <span style="display:flex; align-items:center; gap:7px;">
                  <span class="class-dot" style="background:${cfg.colorHex}; color:${cfg.colorHex}"></span>
                  <strong>${this.escapeHtml(p.name)} (Tú)</strong>
                </span>
                <span class="badge badge-icon">${ICON_SHIELD} ${p.ac}${isDefending ? ' +2' : ''}</span>
              </div>
              <div class="combat-hp-text stat-row-inline">${ICON_HEART} ${p.hp}/${p.maxHp}${isDefending ? ' • Defendiendo' : ''}</div>
              <div class="hp-bar"><div class="hp-fill" style="width:${hpPct}%"></div></div>
            </div>
          `;
        })
        .join('');
    } else {
      targetsHtml = combat.enemies
        .map((enemy) => {
          const hpPct = Math.max(0, Math.min(100, Math.round((enemy.hp / enemy.maxHp) * 100)));
          const isSelected = enemy.id === this.selectedTargetId && enemy.hp > 0;
          const isDead = enemy.hp <= 0;
          return `
            <button
              type="button"
              class="combat-enemy-card ${isSelected ? 'selected' : ''} ${isDead ? 'dead' : ''}"
              data-target-id="${enemy.id}"
              ${isDead ? 'disabled' : ''}
            >
              <div class="combat-card-head">
                <strong>${this.escapeHtml(enemy.name)}</strong>
                <span class="badge badge-icon">${ICON_SHIELD} ${enemy.ac}</span>
              </div>
              <div class="combat-hp-text stat-row-inline">${ICON_HEART} ${enemy.hp}/${enemy.maxHp} • ${ICON_SWORD} +${enemy.attackMod}</div>
              <div class="hp-bar"><div class="hp-fill enemy-hp" style="width:${hpPct}%"></div></div>
              ${isSelected ? '<div class="target-tag">Objetivo seleccionado</div>' : ''}
              ${isDead ? '<div class="target-tag dead-tag">Derrotado</div>' : ''}
            </button>
          `;
        })
        .join('');

      statusHtml = room.players
        .map((p) => {
          const cfg = PLAYER_CLASSES[p.playerClass];
          const hpPct = Math.max(0, Math.min(100, Math.round((p.hp / p.maxHp) * 100)));
          const isDefending = combat.defendingIds.includes(p.id);
          const isTurn = activeTurn?.kind === 'player' && activeTurn.id === p.id;
          return `
            <div class="combat-ally-card ${isTurn ? 'active-turn' : ''} ${p.hp <= 0 ? 'dead' : ''}">
              <div class="combat-card-head">
                <span style="display:flex; align-items:center; gap:7px;">
                  <span class="class-dot" style="background:${cfg.colorHex}; color:${cfg.colorHex}"></span>
                  <strong>${this.escapeHtml(p.name)}${p.id === myPlayerId ? ' (Tú)' : ''}</strong>
                </span>
                <span class="badge badge-icon">${ICON_SHIELD} ${p.ac}${isDefending ? ' +2' : ''}</span>
              </div>
              <div class="combat-hp-text stat-row-inline">${ICON_HEART} ${p.hp}/${p.maxHp}${isDefending ? ' • Defendiendo' : ''}</div>
              <div class="hp-bar"><div class="hp-fill" style="width:${hpPct}%"></div></div>
            </div>
          `;
        })
        .join('');
    }

    const freePotions = myPlayerId ? combat.potionsLeftByPlayer[myPlayerId] ?? 0 : 0;
    const bagPotions = me?.inventory?.potion ?? 0;
    const potionsLeft = freePotions + bagPotions;
    const bombsLeft = me?.inventory?.bomb ?? 0;
    const specialUsed = myPlayerId ? Boolean(combat.specialUsedByPlayer?.[myPlayerId]) : true;
    const unlockedSpecialsUsed = myPlayerId
      ? combat.unlockedSpecialsUsedByPlayer?.[myPlayerId] ?? []
      : [];
    const unlockedTreeActives = SKILL_TREE.filter(
      (n) =>
        n.kind === 'active' &&
        n.combatAction &&
        (me?.unlockedSkills ?? []).includes(n.id)
    );
    const myClassCfg = me ? PLAYER_CLASSES[me.playerClass] : null;
    const roll = combat.lastRoll;
    const logHtml = combat.log
      .slice(-5)
      .map((line) => `<div>${this.escapeHtml(line)}</div>`)
      .join('');

    overlay.innerHTML = `
      <div class="modal-card combat-modal-card" role="dialog" aria-modal="true" aria-labelledby="combat-title">
        <div class="modal-header">
          <div>
            <div class="modal-kicker">${
              isPvp ? 'Duelo PvP' : combat.isBoss ? 'Jefe del Reino' : 'Combate PvE'
            } • Ronda ${combat.round}</div>
            <h2 id="combat-title" class="modal-title">
              ${
                isMyTurn
                  ? '¡TU TURNO! Elige objetivo y acción'
                  : activeTurn
                    ? `Turno de ${this.escapeHtml(activeTurn.name)}`
                    : 'Combate'
              }
            </h2>
          </div>
          <span class="source-pill ${isMyTurn ? 'source-ai' : 'source-cache'}">
            ${isMyTurn ? 'Tu turno' : activeTurn?.kind === 'enemy' ? 'Turno enemigo' : 'Esperando'}
          </span>
        </div>

        <div class="turn-bar">${turnPillsHtml}</div>

        <div class="combat-arena-grid">
          <div>
            <div class="field-label">${isPvp ? 'Rivales (haz clic para elegir objetivo)' : 'Enemigos (haz clic para elegir objetivo)'}</div>
            <div class="combat-enemies-list">${targetsHtml}</div>
          </div>
          <div>
            <div class="field-label">${isPvp ? 'Tu estado' : 'Grupo'}</div>
            <div class="combat-allies-list">${statusHtml}</div>
          </div>
        </div>

        <div class="dice-stage" id="combat-dice-stage">
          ${this.renderDiceStageHtml(roll)}
        </div>

        <div class="combat-actions-bar">
          <div class="combat-actions-grid">
            <button type="button" id="combat-attack-btn" class="btn combat-action-btn" ${!isMyTurn || !this.selectedTargetId ? 'disabled' : ''}>
              <span class="combat-btn-title stat-row-inline">${ICON_SWORD} Atacar</span>
              <span class="combat-btn-sub">Golpe normal</span>
            </button>
            <button type="button" id="combat-luck-btn" class="btn btn-luck combat-action-btn" ${!isMyTurn || !this.selectedTargetId ? 'disabled' : ''}>
              <span class="combat-btn-title stat-row-inline">${ICON_LUCK} Suerte (50/50)</span>
              <span class="combat-btn-sub">¡Doble daño o tropiezo!</span>
            </button>
            ${
              myClassCfg
                ? `<button type="button" id="combat-special-btn" class="btn btn-special combat-action-btn" ${!isMyTurn || specialUsed || !this.selectedTargetId ? 'disabled' : ''}>
                    <span class="combat-btn-title">${this.escapeHtml(myClassCfg.specialName)}</span>
                    <span class="combat-btn-sub">${specialUsed ? 'Usada' : this.escapeHtml(myClassCfg.specialDesc)}</span>
                  </button>`
                : ''
            }
            <button type="button" id="combat-defend-btn" class="btn btn-secondary combat-action-btn" ${!isMyTurn ? 'disabled' : ''}>
              <span class="combat-btn-title stat-row-inline">${ICON_SHIELD} Defender</span>
              <span class="combat-btn-sub">+2 Defensa</span>
            </button>
            <button type="button" id="combat-potion-btn" class="btn btn-secondary combat-action-btn" ${!isMyTurn || potionsLeft <= 0 ? 'disabled' : ''}>
              <span class="combat-btn-title stat-row-inline">${ICON_POTION} Poción (${potionsLeft})</span>
              <span class="combat-btn-sub">Recuperar vida</span>
            </button>
            ${
              unlockedTreeActives
                .map((node) => {
                  const used = unlockedSpecialsUsed.includes(node.id);
                  const needsTarget = node.combatAction !== 'skill_shield';
                  const disabled = !isMyTurn || used || (needsTarget && !this.selectedTargetId);
                  return `<button type="button" class="btn btn-special combat-action-btn combat-tree-skill-btn" data-action="${node.combatAction}" ${disabled ? 'disabled' : ''}>
                    <span class="combat-btn-title">${this.escapeHtml(node.name)}</span>
                    <span class="combat-btn-sub">${used ? 'Usada' : 'Sin fallo (1/combate)'}</span>
                  </button>`;
                })
                .join('')
            }
            ${
              bombsLeft > 0
                ? `<button type="button" id="combat-bomb-btn" class="btn btn-danger-outline combat-action-btn" ${!isMyTurn || !this.selectedTargetId ? 'disabled' : ''}>
                    <span class="combat-btn-title">Bomba (${bombsLeft})</span>
                    <span class="combat-btn-sub">Daño directo</span>
                  </button>`
                : ''
            }
          </div>
          ${
            isHost && activeTurn?.kind === 'player' && !isMyTurn
              ? `<button type="button" id="combat-skip-btn" class="btn btn-secondary">Saltar turno (Líder)</button>`
              : ''
          }
        </div>

        <div class="combat-mini-log">${logHtml}</div>
      </div>
    `;

    overlay.querySelectorAll<HTMLButtonElement>('.combat-enemy-card').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.targetId;
        if (id) {
          this.selectedTargetId = id;
          this.renderCombat(room, combat, myPlayerId);
        }
      });
    });

    overlay.querySelector('#combat-attack-btn')?.addEventListener('click', () => {
      this.callbacks.onAction('attack', this.selectedTargetId ?? undefined);
    });
    overlay.querySelector('#combat-luck-btn')?.addEventListener('click', () => {
      this.callbacks.onAction('luck', this.selectedTargetId ?? undefined);
    });
    overlay.querySelector('#combat-special-btn')?.addEventListener('click', () => {
      this.callbacks.onAction('special', this.selectedTargetId ?? undefined);
    });
    overlay.querySelector('#combat-defend-btn')?.addEventListener('click', () => {
      this.callbacks.onAction('defend');
    });
    overlay.querySelector('#combat-potion-btn')?.addEventListener('click', () => {
      this.callbacks.onAction('potion');
    });
    overlay.querySelector('#combat-bomb-btn')?.addEventListener('click', () => {
      this.callbacks.onAction('bomb', this.selectedTargetId ?? undefined);
    });
    overlay.querySelectorAll<HTMLButtonElement>('.combat-tree-skill-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action as CombatActionType | undefined;
        if (action) this.callbacks.onAction(action, this.selectedTargetId ?? undefined);
      });
    });
    overlay.querySelector('#combat-skip-btn')?.addEventListener('click', () => {
      this.callbacks.onSkipTurn();
    });

    if (roll) {
      const signature = `${combat.round}:${combat.turnIndex}:${roll.summary}`;
      if (signature !== this.lastAnimatedSignature) {
        this.lastAnimatedSignature = signature;
        this.animateDice(roll);
      }
    }
  }

  private renderDiceStageHtml(roll: DiceRollBreakdown | null): string {
    if (!roll) {
      return `
        <div class="dice-placeholder">
          Elige una acción para lanzar los dados del turno.
        </div>
      `;
    }

    if (roll.actionType === 'defend' || roll.actionType === 'skip') {
      return `<div class="dice-summary-text"><strong>${this.escapeHtml(roll.headline ?? '')}</strong> ${this.escapeHtml(roll.summary)}</div>`;
    }

    if (roll.actionType === 'potion') {
      return `
        <div class="dice-visual-row">
          <div class="die-box die-dmg rolling" id="anim-die-dmg">+${roll.healAmount ?? '?'}</div>
          <div class="dice-detail">
            <div class="dice-headline">${this.escapeHtml(roll.headline ?? `¡Curación! +${roll.healAmount ?? 0} PV`)}</div>
            <div class="dice-formula">${this.escapeHtml(roll.summary)}</div>
          </div>
        </div>
      `;
    }

    if (
      roll.actionType === 'bomb' ||
      roll.actionType === 'special' ||
      roll.actionType === 'skill_safe' ||
      roll.actionType === 'skill_shield' ||
      roll.actionType === 'skill_pierce'
    ) {
      const badgeText =
        roll.actionType === 'bomb'
          ? '¡BOMBA!'
          : roll.actionType === 'skill_shield'
            ? '¡ESCUDO!'
            : roll.hit
              ? '¡HABILIDAD!'
              : '¡ESQUIVADO!';
      const badgeCls = roll.hit ? 'crit' : 'miss';
      const boxVal =
        roll.actionType === 'skill_shield'
          ? `+${roll.healAmount ?? 8}`
          : roll.hit
            ? String(roll.damageTotal ?? '?')
            : String(roll.d20 ?? '?');
      return `
        <div class="dice-visual-row">
          <div class="die-box ${roll.hit ? 'die-dmg crit' : 'die-d20 miss'}" id="anim-die-dmg">${boxVal}</div>
          <div class="dice-detail">
            <div class="dice-headline">
              <span class="roll-badge ${badgeCls}">${badgeText}</span>
              <span>${this.escapeHtml(roll.headline ?? '')}</span>
            </div>
            <div class="dice-formula">${this.escapeHtml(roll.actorName)}${roll.targetName ? ` → ${this.escapeHtml(roll.targetName)}` : ''}</div>
          </div>
        </div>
      `;
    }

    if (roll.actionType === 'luck') {
      const isJackpot = roll.luckOutcome === 'jackpot';
      const outcomeCls = roll.critical ? 'crit' : isJackpot ? 'hit' : 'fumble';
      const outcomeText = roll.critical
        ? '¡SUERTE LEGENDARIA!'
        : isJackpot
          ? '¡GOLPE DE SUERTE!'
          : '¡MALA SUERTE!';

      return `
        <div class="dice-visual-row">
          <div class="die-box die-d20 ${outcomeCls}" id="anim-die-d20">${roll.d20 ?? '?'}</div>
          <div class="die-box die-dmg ${isJackpot ? '' : 'fumble'}" id="anim-die-dmg">${roll.damageTotal ?? '?'}</div>
          <div class="dice-detail">
            <div class="dice-headline">
              <span class="roll-badge ${outcomeCls}">${outcomeText}</span>
              <span>${this.escapeHtml(roll.headline ?? '')}</span>
            </div>
            <div class="dice-formula">
              ${this.escapeHtml(roll.actorName)} → ${this.escapeHtml(roll.targetName ?? '')}
            </div>
          </div>
        </div>
      `;
    }

    const outcomeCls = roll.critical ? 'crit' : roll.fumble ? 'fumble' : roll.hit ? 'hit' : 'miss';
    const outcomeText = roll.critical
      ? '¡CRÍTICO!'
      : roll.fumble
        ? '¡PIFIA!'
        : roll.hit
          ? '¡GOLPE CERTERO!'
          : '¡FALLÓ!';

    return `
      <div class="dice-visual-row">
        <div class="die-box die-d20 ${outcomeCls}" id="anim-die-d20">${roll.d20 ?? '?'}</div>
        ${
          roll.hit
            ? `<div class="die-box die-dmg" id="anim-die-dmg">${roll.damageTotal ?? '?'}</div>`
            : ''
        }
        <div class="dice-detail">
          <div class="dice-headline">
            <span class="roll-badge ${outcomeCls}">${outcomeText}</span>
            <span>${this.escapeHtml(roll.headline ?? '')}</span>
          </div>
          <div class="dice-formula">
            ${this.escapeHtml(roll.actorName)} → ${this.escapeHtml(roll.targetName ?? '')}
          </div>
        </div>
      </div>
    `;
  }

  private animateDice(roll: DiceRollBreakdown): void {
    if (this.diceTimer !== null) {
      window.clearInterval(this.diceTimer);
      this.diceTimer = null;
    }

    const d20El = this.overlayEl?.querySelector<HTMLElement>('#anim-die-d20');
    const dmgEl = this.overlayEl?.querySelector<HTMLElement>('#anim-die-dmg');
    if (!d20El && !dmgEl) return;

    d20El?.classList.add('rolling');
    dmgEl?.classList.add('rolling');

    let ticks = 0;
    this.diceTimer = window.setInterval(() => {
      ticks += 1;
      if (d20El) d20El.textContent = String(Math.floor(Math.random() * 20) + 1);
      if (dmgEl) dmgEl.textContent = String(Math.floor(Math.random() * 10) + 1);

      if (ticks >= 7) {
        if (this.diceTimer !== null) {
          window.clearInterval(this.diceTimer);
          this.diceTimer = null;
        }
        if (d20El) {
          d20El.classList.remove('rolling');
          d20El.textContent = String(roll.d20 ?? '?');
        }
        if (dmgEl) {
          dmgEl.classList.remove('rolling');
          dmgEl.textContent = String(roll.damageTotal ?? roll.healAmount ?? '?');
        }
      }
    }, 55);
  }

  private renderOutcome(outcome: CombatEndedPayload): void {
    const overlay = this.ensureOverlay();
    overlay.innerHTML = `
      <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="combat-end-title">
        <div class="modal-header">
          <div>
            <div class="modal-kicker">Fin del combate</div>
            <h2 id="combat-end-title" class="modal-title">
              ${outcome.victory ? '¡Victoria!' : 'Retirada forzosa'}
            </h2>
          </div>
          <span class="source-pill ${outcome.victory ? 'source-ai' : 'source-fallback'}">
            ${outcome.victory ? 'Victoria' : 'Derrota'}
          </span>
        </div>

        <p class="modal-narration">${this.escapeHtml(outcome.summary)}</p>

        ${
          outcome.victory && (outcome.xpGained > 0 || outcome.goldGained > 0)
            ? `
          <div class="effects-row">
            <span class="effect-pill effect-xp">+${outcome.xpGained} EXP</span>
            <span class="effect-pill effect-gold">+${outcome.goldGained} Oro</span>
          </div>
        `
            : ''
        }

        <div class="modal-footer" style="justify-content: flex-end;">
          <button type="button" id="combat-continue-btn" class="btn">Continuar aventura</button>
        </div>
      </div>
    `;

    overlay.querySelector('#combat-continue-btn')?.addEventListener('click', () => {
      this.clearOutcome();
      this.hide();
      this.callbacks.onOutcomeClosed();
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
