import {
  GAME_TITLE,
  MAX_PLAYERS,
  RACE_LIST,
  RACES,
  SUBCLASSES,
  type PublicRoomState,
  type Race,
} from '@tbd/shared';
import { getSavedQuality, renderQualityControl } from './quality';

export interface LobbyCallbacks {
  onCreateRoom: (playerName: string, race: Race) => void;
  onJoinRoom: (roomCode: string, playerName: string, race: Race) => void;
  onStartGame: () => void;
  onLeaveRoom: () => void;
  onOpenTutorial: () => void;
}

export class LobbyUI {
  private selectedRace: Race = 'Human';
  private playerName = '';
  private roomCodeInput = '';

  constructor(
    private readonly container: HTMLElement,
    private readonly callbacks: LobbyCallbacks
  ) {}

  public render(room: PublicRoomState | null, myPlayerId: string | null, errorMsg: string | null): void {
    if (room && room.phase === 'lobby') {
      this.renderWaitingRoom(room, myPlayerId, errorMsg);
      return;
    }
    this.renderEntryForm(errorMsg);
  }

  private renderEntryForm(errorMsg: string | null): void {
    const classCardsHtml = RACE_LIST.map((race) => {
      const cfg = RACES[race];
      const selected = race === this.selectedRace ? 'selected' : '';
      return `
        <button type="button" class="class-card ${selected}" data-race="${race}">
          <div class="class-name">
            <span class="class-dot" style="background:${cfg.colorHex}; color:${cfg.colorHex}"></span>
            <span>${cfg.name}</span>
          </div>
          <div class="class-desc">${cfg.perk}</div>
        </button>
      `;
    }).join('');

    this.container.innerHTML = `
      <div class="lobby-wrap">
        <div class="title-banner">
          <h1>${GAME_TITLE}</h1>
          <p>Aventura cooperativa y duelos PvP para hasta ${MAX_PLAYERS} jugadores</p>
        </div>

        ${errorMsg ? `<div class="error-banner">${this.escapeHtml(errorMsg)}</div>` : ''}

        <div class="card lobby-card">
          <div class="lobby-step">
            <label class="field-label" for="player-name-input">1. Nombre del héroe</label>
            <input
              id="player-name-input"
              class="input"
              type="text"
              maxlength="16"
              placeholder="Ej. Mateo, Lucía, Pip"
              value="${this.escapeHtml(this.playerName)}"
            />
          </div>

          <div class="lobby-step">
            <span class="field-label">2. Elige tu raza</span>
            <div class="class-grid">${classCardsHtml}</div>
          </div>

          <div class="lobby-step">
            <span class="field-label">3. Jugar</span>
            <div class="actions-row" style="margin-top: 6px;">
              <div class="action-box">
                <div class="action-box-title">Nueva partida</div>
                <p class="action-box-sub">Crea una sala y comparte el código con tu grupo.</p>
                <button type="button" id="create-room-btn" class="btn">Crear sala</button>
              </div>
              <div class="action-box">
                <div class="action-box-title">Unirse a una sala</div>
                <p class="action-box-sub">Ingresa el código de 4 letras.</p>
                <div class="join-row">
                  <input
                    id="room-code-input"
                    class="input code-input"
                    type="text"
                    maxlength="4"
                    placeholder="ABCD"
                    value="${this.escapeHtml(this.roomCodeInput)}"
                  />
                  <button type="button" id="join-room-btn" class="btn">Unirse</button>
                </div>
              </div>
            </div>
          </div>

          <div class="lobby-footer-row">
            <button type="button" class="btn btn-secondary lobby-tutorial-btn">? Cómo jugar</button>
            <div id="lobby-quality-slot"></div>
          </div>
        </div>
      </div>
    `;

    const nameInput = this.container.querySelector<HTMLInputElement>('#player-name-input');
    const codeInput = this.container.querySelector<HTMLInputElement>('#room-code-input');
    const qualitySlot = this.container.querySelector<HTMLElement>('#lobby-quality-slot');

    if (qualitySlot) {
      renderQualityControl(qualitySlot, getSavedQuality(), () => {});
    }

    nameInput?.addEventListener('input', () => {
      this.playerName = nameInput.value;
    });

    codeInput?.addEventListener('input', () => {
      codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
      this.roomCodeInput = codeInput.value;
    });

    this.container.querySelectorAll<HTMLButtonElement>('.class-card').forEach((btn) => {
      btn.addEventListener('click', () => {
        const race = btn.dataset.race as Race;
        if (race && RACES[race]) {
          this.selectedRace = race;
          this.renderEntryForm(null);
        }
      });
    });

    this.container.querySelector('#create-room-btn')?.addEventListener('click', () => {
      this.callbacks.onCreateRoom(this.playerName, this.selectedRace);
    });

    this.container.querySelector('#join-room-btn')?.addEventListener('click', () => {
      this.callbacks.onJoinRoom(this.roomCodeInput, this.playerName, this.selectedRace);
    });

    this.container.querySelector('.lobby-tutorial-btn')?.addEventListener('click', () => {
      this.callbacks.onOpenTutorial();
    });
  }

  private renderWaitingRoom(
    room: PublicRoomState,
    myPlayerId: string | null,
    errorMsg: string | null
  ): void {
    const isHost = room.hostId === myPlayerId;
    const rosterHtml = room.players
      .map((p) => {
        const race = RACES[p.race ?? 'Human'];
        const sub = p.subclass ? SUBCLASSES[p.subclass].name : 'Sin subclase';
        const hostTag = p.id === room.hostId ? ' • Líder' : '';
        const meTag = p.id === myPlayerId ? ' • Tú' : '';
        const statusCls = p.connected ? 'status-online' : 'status-offline';
        const statusLabel = p.connected ? 'Conectado' : 'Desconectado';
        return `
          <li class="roster-item">
            <div class="roster-left">
              <span class="class-dot" style="background:${race.colorHex}; color:${race.colorHex}"></span>
              <div>
                <strong>${this.escapeHtml(p.name)}</strong><span style="color: var(--muted); font-size: 0.85rem;">${hostTag}${meTag}</span>
                <div style="font-size: 0.8rem; color: var(--muted)">
                  ${race.name} • ${sub} • ${p.hp}/${p.maxHp} PV • CA ${p.ac}
                </div>
              </div>
            </div>
            <span class="status-pill ${statusCls}">${statusLabel}</span>
          </li>
        `;
      })
      .join('');

    this.container.innerHTML = `
      <div class="lobby-wrap">
        <div class="title-banner">
          <h1>${GAME_TITLE}</h1>
          <p>Sala de espera • Prepara al grupo antes de partir</p>
        </div>

        ${errorMsg ? `<div class="error-banner">${this.escapeHtml(errorMsg)}</div>` : ''}

        <div class="card lobby-card">
          <div class="room-code-box">
            <div>
              <div class="field-label" style="margin-bottom: 2px;">Código de sala</div>
              <div class="room-code-value">${room.code}</div>
            </div>
            <button type="button" id="copy-code-btn" class="btn btn-secondary">Copiar código</button>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; gap: 10px; flex-wrap: wrap;">
            <div class="field-label" style="margin-bottom: 0;">Grupo (${room.players.length}/${MAX_PLAYERS})</div>
            <div id="lobby-quality-slot"></div>
          </div>
          <ul class="roster-list">${rosterHtml}</ul>

          <div style="display: flex; justify-content: space-between; gap: 10px; align-items: center; flex-wrap: wrap;">
            <button type="button" id="leave-room-btn" class="btn btn-secondary">Salir de la sala</button>
            ${
              isHost
                ? `<button type="button" id="start-game-btn" class="btn">Comenzar aventura</button>`
                : `<span style="color: var(--muted); font-size: 0.9rem;">Esperando a que el líder inicie la partida…</span>`
            }
          </div>
        </div>
      </div>
    `;

    const qualitySlot = this.container.querySelector<HTMLElement>('#lobby-quality-slot');
    if (qualitySlot) {
      renderQualityControl(qualitySlot, getSavedQuality(), () => {});
    }

    this.container.querySelector('#copy-code-btn')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(room.code);
        const btn = this.container.querySelector('#copy-code-btn');
        if (btn) {
          btn.textContent = '¡Copiado!';
          window.setTimeout(() => {
            btn.textContent = 'Copiar código';
          }, 1800);
        }
      } catch {
        // Ignore clipboard errors on restricted environments
      }
    });

    this.container.querySelector('#leave-room-btn')?.addEventListener('click', () => {
      this.callbacks.onLeaveRoom();
    });

    this.container.querySelector('#start-game-btn')?.addEventListener('click', () => {
      this.callbacks.onStartGame();
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
