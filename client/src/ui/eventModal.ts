import {
  PLAYER_CLASSES,
  type EventOutcomePayload,
  type EventSource,
  type PublicPlayerState,
  type PublicRoomState,
} from '@tbd/shared';

export interface EventModalCallbacks {
  onVote: (choiceId: string) => void;
  onResolveNow: () => void;
  onOutcomeClosed: () => void;
}

const SOURCE_LABELS: Record<EventSource, { text: string; cls: string }> = {
  ai: { text: 'IA DM', cls: 'source-ai' },
  cache: { text: 'Caché', cls: 'source-cache' },
  fallback: { text: 'Crónica local', cls: 'source-fallback' },
};

export class EventModal {
  private readonly root: HTMLElement;
  private pendingOutcome: EventOutcomePayload | null = null;

  constructor(private readonly callbacks: EventModalCallbacks) {
    this.root = document.createElement('div');
    this.root.id = 'event-modal-root';
    document.body.appendChild(this.root);
  }

  public isOpen(): boolean {
    return this.root.childElementCount > 0;
  }

  public setOutcome(outcome: EventOutcomePayload): void {
    this.pendingOutcome = outcome;
  }

  public clearOutcome(): void {
    this.pendingOutcome = null;
  }

  public hide(): void {
    this.root.innerHTML = '';
  }

  public render(room: PublicRoomState | null, myPlayerId: string | null): void {
    if (!room) {
      this.hide();
      return;
    }

    if (room.phase === 'event' && room.activeEvent) {
      this.renderVotingModal(room, myPlayerId);
      return;
    }

    if (this.pendingOutcome) {
      this.renderOutcomeModal(this.pendingOutcome);
      return;
    }

    this.hide();
  }

  private renderVotingModal(room: PublicRoomState, myPlayerId: string | null): void {
    const active = room.activeEvent!;
    const sourceMeta = SOURCE_LABELS[active.source] ?? SOURCE_LABELS.fallback;
    const triggerLabel =
      active.triggerType === 'portal'
        ? `Portal hacia ${room.map.name}`
        : `Evento en ${room.map.name}`;

    const playersById = new Map<string, PublicPlayerState>(
      room.players.map((p) => [p.id, p])
    );

    const votesByChoice = new Map<string, PublicPlayerState[]>();
    for (const c of active.choices) {
      votesByChoice.set(c.id, []);
    }

    let totalVotes = 0;
    for (const [playerId, choiceId] of Object.entries(active.votes)) {
      const voter = playersById.get(playerId);
      const list = votesByChoice.get(choiceId);
      if (voter && list) {
        list.push(voter);
        totalVotes += 1;
      }
    }

    const connectedPlayers = room.players.filter((p) => p.connected);
    const connectedVotes = connectedPlayers.filter((p) => Boolean(active.votes[p.id])).length;
    const myVote = myPlayerId ? active.votes[myPlayerId] : undefined;
    const isHost = room.hostId === myPlayerId;

    const choicesHtml = active.choices
      .map((choice, idx) => {
        const voters = votesByChoice.get(choice.id) ?? [];
        const isSelected = myVote === choice.id;
        const letter = String.fromCharCode(65 + idx);
        const voteWord = voters.length === 1 ? 'voto' : 'votos';

        const votersHtml =
          voters.length > 0
            ? `<div class="event-voters">
                ${voters
                  .map((v) => {
                    const clsCfg = PLAYER_CLASSES[v.playerClass];
                    const isMe = v.id === myPlayerId;
                    return `<span class="voter-chip">
                      <span class="class-dot" style="background:${clsCfg.colorHex}"></span>
                      ${this.escapeHtml(v.name)}${isMe ? ' (Tú)' : ''}
                    </span>`;
                  })
                  .join('')}
              </div>`
            : '';

        return `
          <button
            type="button"
            class="event-choice-btn ${isSelected ? 'selected' : ''}"
            data-choice-id="${this.escapeHtml(choice.id)}"
          >
            <div class="event-choice-top">
              <div class="event-choice-main">
                <span class="event-choice-letter">${letter}</span>
                <span class="event-choice-label">${this.escapeHtml(choice.label)}</span>
              </div>
              <span class="event-vote-count">${voters.length} ${voteWord}</span>
            </div>
            ${votersHtml}
          </button>
        `;
      })
      .join('');

    this.root.innerHTML = `
      <div class="event-overlay" role="dialog" aria-modal="true">
        <div class="event-modal card">
          <div class="event-badges">
            <span class="event-badge event-badge-trigger">${this.escapeHtml(triggerLabel)}</span>
            <span class="event-badge ${sourceMeta.cls}">${sourceMeta.text}</span>
          </div>
          <h2 class="event-title">${this.escapeHtml(active.title)}</h2>
          <div class="event-meta">
            Activado por <strong>${this.escapeHtml(active.triggeredByName)}</strong> •
            Votos: <strong>${connectedVotes}/${connectedPlayers.length}</strong> en línea
          </div>
          <p class="event-narration">${this.escapeHtml(active.narration)}</p>

          <div class="event-choices">${choicesHtml}</div>

          <div class="event-footer">
            <span class="event-hint">
              ${
                myVote
                  ? 'Voto registrado. Puedes cambiarlo hasta que todos voten.'
                  : 'Elige una opción. Se resolverá cuando vote todo el grupo.'
              }
            </span>
            ${
              isHost && totalVotes >= 1
                ? `<button type="button" id="resolve-event-now-btn" class="btn btn-secondary">
                    Resolver ahora (Líder)
                  </button>`
                : ''
            }
          </div>
        </div>
      </div>
    `;

    this.root.querySelectorAll<HTMLButtonElement>('.event-choice-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const choiceId = btn.dataset.choiceId;
        if (choiceId) {
          this.callbacks.onVote(choiceId);
        }
      });
    });

    this.root.querySelector('#resolve-event-now-btn')?.addEventListener('click', () => {
      this.callbacks.onResolveNow();
    });
  }

  private renderOutcomeModal(outcome: EventOutcomePayload): void {
    const pills: string[] = [];
    if (outcome.effects.hpDelta) {
      const sign = outcome.effects.hpDelta > 0 ? '+' : '';
      const cls = outcome.effects.hpDelta > 0 ? 'effect-pos' : 'effect-neg';
      pills.push(`<span class="effect-pill ${cls}">${sign}${outcome.effects.hpDelta} PV</span>`);
    }
    if (outcome.effects.xpDelta) {
      pills.push(`<span class="effect-pill effect-xp">+${outcome.effects.xpDelta} EXP</span>`);
    }
    if (outcome.effects.goldDelta) {
      const sign = outcome.effects.goldDelta > 0 ? '+' : '';
      const cls = outcome.effects.goldDelta > 0 ? 'effect-gold' : 'effect-neg';
      pills.push(`<span class="effect-pill ${cls}">${sign}${outcome.effects.goldDelta} Oro</span>`);
    }

    this.root.innerHTML = `
      <div class="event-overlay" role="dialog" aria-modal="true">
        <div class="event-modal card">
          <div class="event-badges">
            <span class="event-badge event-badge-outcome">Desenlace del evento</span>
          </div>
          <h2 class="event-title">${this.escapeHtml(outcome.eventTitle)}</h2>
          <div class="event-winning-choice">
            Decisión del grupo: <strong>${this.escapeHtml(outcome.winningChoiceLabel)}</strong>
          </div>
          <p class="event-narration">${this.escapeHtml(outcome.outcomeNarration)}</p>

          <div class="event-effects-box">
            <div class="event-effects-label">Efectos aplicados al grupo</div>
            ${pills.length > 0 ? `<div class="event-effect-pills">${pills.join('')}</div>` : ''}
            <div class="event-effects-summary">${this.escapeHtml(outcome.effects.summary)}</div>
          </div>

          <div class="event-footer" style="justify-content: flex-end;">
            <button type="button" id="close-outcome-btn" class="btn">Continuar aventura</button>
          </div>
        </div>
      </div>
    `;

    this.root.querySelector('#close-outcome-btn')?.addEventListener('click', () => {
      this.pendingOutcome = null;
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
