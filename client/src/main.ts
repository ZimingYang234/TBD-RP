import Phaser from 'phaser';
import {
  GAME_TITLE,
  PLAYER_CLASSES,
  type Direction,
  type PublicRoomState,
} from '@tbd/shared';
import './style.css';
import {
  clearSession,
  createGameSocket,
  loadSavedSession,
  saveSession,
} from './network';
import { LobbyUI } from './ui/lobby';
import { EventModal } from './ui/eventModal';
import { CombatModal } from './ui/combatModal';
import { ShopModal } from './ui/shopModal';
import { TavernModal } from './ui/tavernModal';
import { TutorialModal } from './ui/tutorialModal';
import { ICON_COIN, ICON_HEART, ICON_LUCK, ICON_SHIELD, ICON_SWORD } from './ui/icons';
import { getSavedQuality, renderQualityControl } from './ui/quality';
import { createPhaserGame } from './game/phaserGame';
import type { OverworldScene } from './game/OverworldScene';

document.title = GAME_TITLE;

const appEl = document.querySelector<HTMLElement>('#app')!;
const socket = createGameSocket();

let currentRoom: PublicRoomState | null = null;
let myPlayerId: string | null = null;
let lastError: string | null = null;
const logs: string[] = [];

let phaserGame: Phaser.Game | null = null;
let overworldScene: OverworldScene | null = null;

function addLog(msg: string): void {
  const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  logs.push(`[${timestamp}] ${msg}`);
  if (logs.length > 40) logs.shift();
  renderLogs();
}

function renderLogs(): void {
  const logEl = document.querySelector<HTMLElement>('#game-log');
  if (!logEl) return;
  logEl.innerHTML = logs.map((line) => `<div>${escapeHtml(line)}</div>`).join('');
  logEl.scrollTop = logEl.scrollHeight;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const lobbyUI = new LobbyUI(appEl, {
  onCreateRoom: (playerName, playerClass) => {
    lastError = null;
    socket.emit('create_room', { playerName, playerClass });
  },
  onJoinRoom: (roomCode, playerName, playerClass) => {
    lastError = null;
    const saved = loadSavedSession();
    socket.emit('join_room', {
      roomCode,
      playerName,
      playerClass,
      playerToken: saved?.roomCode === roomCode.trim().toUpperCase() ? saved.playerToken : undefined,
    });
  },
  onStartGame: () => {
    socket.emit('start_game');
  },
  onLeaveRoom: () => {
    clearSession();
    socket.emit('leave_room');
    eventModal.clearOutcome();
    eventModal.hide();
    combatModal.clearOutcome();
    combatModal.hide();
    destroyPhaser();
    currentRoom = null;
    myPlayerId = null;
    renderApp();
  },
  onOpenTutorial: () => {
    tutorialModal.show();
  },
});

const tutorialModal = new TutorialModal(() => {
  syncInputLock();
});

const eventModal = new EventModal({
  onVote: (choiceId) => {
    socket.emit('vote_event', { choiceId });
  },
  onResolveNow: () => {
    socket.emit('resolve_event_now');
  },
  onOutcomeClosed: () => {
    syncInputLock();
  },
});

const combatModal = new CombatModal({
  onAction: (action, targetId) => {
    socket.emit('combat_action', { action, targetId });
  },
  onSkipTurn: () => {
    socket.emit('skip_combat_turn');
  },
  onOutcomeClosed: () => {
    syncInputLock();
  },
});

const shopModal = new ShopModal({
  onBuy: (itemId) => {
    socket.emit('buy_item', { itemId });
  },
  onUseItem: (itemId) => {
    socket.emit('use_item', { itemId });
  },
  onClosed: () => {
    syncInputLock();
  },
});

const tavernModal = new TavernModal({
  onPlay: (bet) => {
    socket.emit('play_tavern_dice', { bet });
  },
  onClosed: () => {
    syncInputLock();
  },
});

function syncInputLock(): void {
  const blocked =
    eventModal.isOpen() ||
    combatModal.isOpen() ||
    shopModal.isOpen() ||
    tavernModal.isOpen() ||
    tutorialModal.isOpen() ||
    currentRoom?.phase !== 'playing';
  overworldScene?.setInputBlocked(blocked);
}

function requestMove(dir: Direction): void {
  if (
    eventModal.isOpen() ||
    combatModal.isOpen() ||
    shopModal.isOpen() ||
    tavernModal.isOpen() ||
    tutorialModal.isOpen() ||
    currentRoom?.phase !== 'playing'
  ) {
    return;
  }
  socket.emit('player_move', { direction: dir });
}

function destroyPhaser(): void {
  if (phaserGame) {
    phaserGame.destroy(true);
    phaserGame = null;
    overworldScene = null;
  }
}

function getTransportLabel(): string {
  const transportName = socket.io.engine?.transport?.name ?? 'conectando';
  return socket.connected ? `Conectado (${transportName})` : 'Reconectando...';
}

function renderGameShell(room: PublicRoomState): void {
  if (!document.querySelector('#game-shell')) {
    appEl.innerHTML = `
      <div id="game-shell" class="game-shell">
        <div class="topbar">
          <div class="topbar-left">
            <span class="topbar-title">${GAME_TITLE}</span>
            <button type="button" id="hud-copy-code-btn" class="badge topbar-code-btn" title="Copiar código de sala">
              Sala: <strong id="hud-room-code"></strong>
            </button>
            <span class="badge" id="hud-region-name"></span>
          </div>
          <div class="topbar-right">
            <button type="button" id="hud-tutorial-btn" class="btn btn-secondary">? Tutorial</button>
            <div id="hud-quality-slot"></div>
            <span class="badge" id="hud-net-status"></span>
            <button type="button" id="hud-leave-btn" class="btn btn-secondary">Salir</button>
          </div>
        </div>
        <div class="game-main">
          <div id="phaser-host" class="canvas-host"></div>
          <aside class="sidebar">
            <div id="hud-quest-box" class="quest-box"></div>
            <h3>Grupo</h3>
            <div id="hud-party-cards" class="party-cards"></div>
            <div class="hud-combat-row">
              <button type="button" id="hud-combat-btn" class="btn btn-danger-outline">Combate PvE</button>
              <button type="button" id="hud-boss-btn" class="btn btn-boss-outline">Jefe</button>
            </div>
            <div class="hud-combat-row">
              <button type="button" id="hud-pvp-btn" class="btn btn-pvp-outline">Duelo PvP</button>
              <button type="button" id="hud-tavern-btn" class="btn btn-tavern-outline">Taberna</button>
            </div>
            <button type="button" id="hud-shop-btn" class="btn btn-shop-outline">Tienda de Objetos</button>
            <div class="map-legend">
              <span class="legend-chip"><span class="legend-dot dot-portal"></span>Portal</span>
              <span class="legend-chip"><span class="legend-dot dot-event"></span>Evento</span>
              <span class="legend-chip"><span class="legend-dot dot-combat"></span>Combate</span>
              <span class="legend-chip"><span class="legend-dot dot-shop"></span>Tienda</span>
            </div>
            <div class="redeem-box">
              <input
                id="hud-code-input"
                class="input redeem-input"
                type="text"
                maxlength="20"
                placeholder="Código de premio..."
              />
              <button type="button" id="hud-code-btn" class="btn btn-secondary">Canjear</button>
            </div>
            <h3>Registro</h3>
            <div id="game-log" class="log-box"></div>
            <div class="controls-hint">
              <strong>Clic</strong> en el mapa, <strong>WASD</strong> o <strong>Flechas</strong> para moverte.
            </div>
          </aside>
        </div>
      </div>
    `;

    document.querySelector('#hud-copy-code-btn')?.addEventListener('click', async () => {
      if (!currentRoom) return;
      try {
        await navigator.clipboard.writeText(currentRoom.code);
        const codeEl = document.querySelector('#hud-room-code');
        if (codeEl) {
          const original = currentRoom.code;
          codeEl.textContent = '¡Copiado!';
          window.setTimeout(() => {
            if (currentRoom?.code === original) {
              codeEl.textContent = original;
            }
          }, 1500);
        }
      } catch {
        // Ignore clipboard errors on restricted environments
      }
    });

    document.querySelector('#hud-combat-btn')?.addEventListener('click', () => {
      socket.emit('start_combat_encounter');
    });

    document.querySelector('#hud-boss-btn')?.addEventListener('click', () => {
      socket.emit('start_boss_fight');
    });

    document.querySelector('#hud-pvp-btn')?.addEventListener('click', () => {
      socket.emit('start_pvp_duel');
    });

    document.querySelector('#hud-tavern-btn')?.addEventListener('click', () => {
      if (currentRoom && currentRoom.phase === 'playing') {
        tavernModal.show(currentRoom, myPlayerId);
        syncInputLock();
      }
    });

    document.querySelector('#hud-shop-btn')?.addEventListener('click', () => {
      if (currentRoom && currentRoom.phase === 'playing') {
        shopModal.show(currentRoom, myPlayerId);
        syncInputLock();
      }
    });

    const redeemInput = document.querySelector<HTMLInputElement>('#hud-code-input');
    const submitRedeem = () => {
      if (!redeemInput) return;
      const code = redeemInput.value.trim();
      if (!code) return;
      socket.emit('redeem_code', { code });
      redeemInput.value = '';
    };
    document.querySelector('#hud-code-btn')?.addEventListener('click', submitRedeem);
    redeemInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitRedeem();
      }
    });

    document.querySelector('#hud-tutorial-btn')?.addEventListener('click', () => {
      tutorialModal.show();
      syncInputLock();
    });

    document.querySelector('#hud-leave-btn')?.addEventListener('click', () => {
      clearSession();
      socket.emit('leave_room');
      eventModal.clearOutcome();
      eventModal.hide();
      combatModal.clearOutcome();
      combatModal.hide();
      destroyPhaser();
      currentRoom = null;
      myPlayerId = null;
      renderApp();
    });

    const host = document.querySelector<HTMLElement>('#phaser-host')!;
    const initialQuality = getSavedQuality();
    const created = createPhaserGame(host, room, initialQuality);
    phaserGame = created.game;
    overworldScene = created.scene;
    if (myPlayerId) {
      overworldScene.configure(room, myPlayerId, requestMove);
    }

    const hudQualitySlot = document.querySelector<HTMLElement>('#hud-quality-slot');
    if (hudQualitySlot) {
      renderQualityControl(hudQualitySlot, initialQuality, (q) => {
        overworldScene?.setQuality(q);
      });
    }
  }

  updateGameHud(room);
  renderLogs();
  eventModal.render(room, myPlayerId);
  combatModal.render(room, myPlayerId);
  shopModal.render(room, myPlayerId);
  tavernModal.render(room, myPlayerId);
  syncInputLock();
}

function updateGameHud(room: PublicRoomState): void {
  const codeEl = document.querySelector('#hud-room-code');
  const regionEl = document.querySelector('#hud-region-name');
  const netEl = document.querySelector('#hud-net-status');
  const partyEl = document.querySelector('#hud-party-cards');

  if (codeEl) codeEl.textContent = room.code;
  if (regionEl) regionEl.textContent = room.map.name;
  if (netEl) netEl.textContent = getTransportLabel();

  const combatBtn = document.querySelector<HTMLButtonElement>('#hud-combat-btn');
  if (combatBtn) {
    combatBtn.disabled = room.phase !== 'playing';
  }

  const bossBtn = document.querySelector<HTMLButtonElement>('#hud-boss-btn');
  if (bossBtn) {
    bossBtn.disabled = room.phase !== 'playing';
  }

  const tavernBtn = document.querySelector<HTMLButtonElement>('#hud-tavern-btn');
  if (tavernBtn) {
    tavernBtn.disabled = room.phase !== 'playing';
  }

  const shopBtn = document.querySelector<HTMLButtonElement>('#hud-shop-btn');
  if (shopBtn) {
    shopBtn.disabled = room.phase !== 'playing';
  }

  const questEl = document.querySelector<HTMLElement>('#hud-quest-box');
  if (questEl) {
    if (room.quest) {
      questEl.innerHTML = `
        <div class="quest-title">Misión: ${escapeHtml(room.quest.title)}</div>
        <div class="quest-meta">Progreso ${room.quest.progress}/${room.quest.target} • +${room.quest.rewardGold} monedas</div>
      `;
    } else {
      questEl.innerHTML = '';
    }
  }

  const pvpBtn = document.querySelector<HTMLButtonElement>('#hud-pvp-btn');
  if (pvpBtn) {
    const canPvp = room.phase === 'playing' && room.players.length >= 2;
    pvpBtn.disabled = !canPvp;
    pvpBtn.title =
      room.players.length < 2
        ? 'Necesitas al menos 2 jugadores en la sala para un duelo PvP'
        : 'Iniciar duelo PvP contra tus compañeros';
  }

  if (partyEl) {
    partyEl.innerHTML = room.players
      .map((p) => {
        const cfg = PLAYER_CLASSES[p.playerClass];
        const hpPct = Math.max(0, Math.min(100, Math.round((p.hp / p.maxHp) * 100)));
        const isMe = p.id === myPlayerId;
        return `
          <div class="party-card ${isMe ? 'me' : ''}">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span>
                <span class="class-dot" style="background:${cfg.colorHex}; margin-right:6px;"></span>
                <strong>${escapeHtml(p.name)}</strong>${isMe ? ' (Tú)' : ''}
              </span>
              <span style="font-size:0.78rem; color:${p.connected ? '#7ee0a8' : '#ff9c8d'}">
                ${p.connected ? 'En línea' : 'Desconectado'}
              </span>
            </div>
            <div class="party-stats-inline">
              <span class="stat-row-inline">${ICON_HEART} ${p.hp}/${p.maxHp}</span>
              <span class="stat-row-inline">${ICON_SWORD} +${p.attackMod}</span>
              <span class="stat-row-inline">${ICON_SHIELD} ${p.ac}</span>
              ${(p.luckBonus ?? 0) > 0 ? `<span class="stat-row-inline">${ICON_LUCK} +${p.luckBonus}</span>` : ''}
            </div>
            <div class="party-stats-inline" style="color: #cbd5e8; margin-top: 3px;">
              <span class="stat-row-inline">${ICON_COIN} <strong>${p.gold ?? 0}</strong></span>
              <span>EXP: <strong>${p.xp ?? 0}</strong></span>
            </div>
            <div class="hp-bar">
              <div class="hp-fill" style="width:${hpPct}%"></div>
            </div>
          </div>
        `;
      })
      .join('');
  }
}

function renderApp(): void {
  if (
    currentRoom &&
    (currentRoom.phase === 'playing' ||
      currentRoom.phase === 'event' ||
      currentRoom.phase === 'combat')
  ) {
    renderGameShell(currentRoom);
    return;
  }

  eventModal.clearOutcome();
  eventModal.hide();
  combatModal.clearOutcome();
  combatModal.hide();
  shopModal.hide();
  tavernModal.hide();
  destroyPhaser();
  lobbyUI.render(currentRoom, myPlayerId, lastError);
}

// Socket lifecycle
socket.on('connect', () => {
  const saved = loadSavedSession();
  if (saved && !currentRoom) {
    socket.emit('reconnect_room', {
      roomCode: saved.roomCode,
      playerToken: saved.playerToken,
    });
  }
  if (
    currentRoom &&
    (currentRoom.phase === 'playing' ||
      currentRoom.phase === 'event' ||
      currentRoom.phase === 'combat')
  ) {
    updateGameHud(currentRoom);
  }
});

socket.on('disconnect', () => {
  if (
    currentRoom &&
    (currentRoom.phase === 'playing' ||
      currentRoom.phase === 'event' ||
      currentRoom.phase === 'combat')
  ) {
    updateGameHud(currentRoom);
  }
});

socket.on('room_joined', (payload) => {
  lastError = null;
  currentRoom = payload.room;
  myPlayerId = payload.playerId;
  saveSession({
    roomCode: payload.room.code,
    playerId: payload.playerId,
    playerToken: payload.playerToken,
  });
  renderApp();
  if (overworldScene && myPlayerId) {
    overworldScene.configure(payload.room, myPlayerId, requestMove);
  }
  syncInputLock();
});

socket.on('room_state', (room) => {
  currentRoom = room;
  renderApp();
  if (overworldScene && myPlayerId) {
    overworldScene.configure(room, myPlayerId, requestMove);
  }
  syncInputLock();
});

socket.on('player_moved', ({ playerId, x, y, regionId }) => {
  if (!currentRoom) return;
  const target = currentRoom.players.find((p) => p.id === playerId);
  if (target) {
    target.x = x;
    target.y = y;
    target.regionId = regionId;
  }
  overworldScene?.movePlayerSprite(playerId, x, y);
  if (currentRoom.phase === 'playing' || currentRoom.phase === 'event') {
    updateGameHud(currentRoom);
  }
});

socket.on('party_teleported', (payload) => {
  currentRoom = payload.room;
  renderApp();
  if (overworldScene && myPlayerId) {
    overworldScene.configure(payload.room, myPlayerId, requestMove);
    overworldScene.showRegionBanner(payload.room.map.name, payload.room.map.subtitle);
  }
  syncInputLock();
});

socket.on('event_started', (payload) => {
  currentRoom = payload.room;
  eventModal.clearOutcome();
  renderApp();
  if (overworldScene && myPlayerId) {
    overworldScene.configure(payload.room, myPlayerId, requestMove);
  }
  syncInputLock();
});

socket.on('event_updated', ({ activeEvent }) => {
  if (!currentRoom) return;
  currentRoom.activeEvent = activeEvent;
  eventModal.render(currentRoom, myPlayerId);
  syncInputLock();
});

socket.on('event_resolved', (payload) => {
  currentRoom = payload.room;
  eventModal.setOutcome(payload);
  addLog(
    `[Evento: ${payload.eventTitle}] "${payload.winningChoiceLabel}" — ${payload.outcomeNarration} (${payload.effects.summary})`
  );
  renderApp();
  if (overworldScene && myPlayerId) {
    overworldScene.configure(payload.room, myPlayerId, requestMove);
  }
  syncInputLock();
});

socket.on('combat_started', ({ room }) => {
  currentRoom = room;
  combatModal.clearOutcome();
  renderApp();
  if (overworldScene && myPlayerId) {
    overworldScene.configure(room, myPlayerId, requestMove);
  }
  syncInputLock();
});

socket.on('combat_updated', ({ room, roll }) => {
  currentRoom = room;
  addLog(`[Combate] ${roll.summary}`);
  renderApp();
  if (overworldScene && myPlayerId) {
    overworldScene.configure(room, myPlayerId, requestMove);
  }
  syncInputLock();
});

socket.on('combat_ended', (payload) => {
  currentRoom = payload.room;
  combatModal.setOutcome(payload);
  addLog(`[Combate] ${payload.summary}`);
  renderApp();
  if (overworldScene && myPlayerId) {
    overworldScene.configure(payload.room, myPlayerId, requestMove);
  }
  syncInputLock();
});

socket.on('tavern_result', (payload) => {
  currentRoom = payload.room;
  tavernModal.setResult(payload, myPlayerId);
  updateGameHud(payload.room);
});

socket.on('open_shop', () => {
  if (currentRoom && currentRoom.phase === 'playing') {
    shopModal.show(currentRoom, myPlayerId);
    syncInputLock();
  }
});

socket.on('room_error', ({ message, code }) => {
  if (code === 'RECONNECT_FAILED') {
    clearSession();
    return;
  }
  if (currentRoom && currentRoom.phase !== 'lobby') {
    addLog(`Aviso: ${message}`);
    return;
  }
  lastError = message;
  renderApp();
});

socket.on('system_notice', ({ message }) => {
  addLog(message);
});

renderApp();
