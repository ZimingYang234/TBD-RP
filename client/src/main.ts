import type Phaser from 'phaser';
import {
  GAME_TITLE,
  MAX_INVENTORY_SLOTS,
  PLAYER_CLASSES,
  xpForNextLevel,
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
import { InventoryModal } from './ui/inventoryModal';
import { ChestModal } from './ui/chestModal';
import { SkillTreeModal } from './ui/skillTreeModal';
import { MinigameModal } from './ui/minigameModal';
import { ArenaModal } from './ui/arenaModal';
import { ProgressModal } from './ui/progressModal';
import { SecretQuestionModal } from './ui/secretQuestionModal';
import { SecretPortalModal } from './ui/secretPortalModal';
import { ICON_COIN, ICON_HEART, ICON_LUCK, ICON_SHIELD, ICON_SWORD } from './ui/icons';
import { getSavedQuality, renderQualityControl } from './ui/quality';
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
let phaserLoading = false;

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
  onAction: (action, targetId, qteScore) => {
    socket.emit('combat_action', { action, targetId, qteScore });
  },
  onDodge: (quality) => {
    socket.emit('combat_dodge', { quality });
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

const inventoryModal = new InventoryModal({
  onEquip: (itemId) => {
    socket.emit('equip_item', { itemId });
  },
  onUnequip: (slot) => {
    socket.emit('unequip_item', { slot });
  },
  onUse: (itemId) => {
    socket.emit('use_item', { itemId });
  },
  onDrop: (itemId) => {
    socket.emit('drop_item', { itemId });
  },
  onGive: (itemId, targetPlayerId) => {
    socket.emit('give_item', { itemId, targetPlayerId });
  },
  onClosed: () => {
    syncInputLock();
  },
});

const chestModal = new ChestModal({
  onEquip: (itemId) => {
    socket.emit('equip_item', { itemId });
  },
  onUse: (itemId) => {
    socket.emit('use_item', { itemId });
  },
  onClosed: () => {
    syncInputLock();
  },
});

const skillTreeModal = new SkillTreeModal({
  onUnlock: (skillId) => {
    socket.emit('unlock_skill', { skillId });
  },
  onClosed: () => {
    syncInputLock();
  },
});

const minigameModal = new MinigameModal({
  onComplete: (payload) => {
    socket.emit('complete_minigame', payload);
  },
  onClosed: () => {
    syncInputLock();
  },
});

const arenaModal = new ArenaModal({
  onComplete: (score, difficulty) => {
    socket.emit('complete_minigame', { game: 'arena', difficulty, score });
  },
  onBossComplete: (victory, regionId) => {
    socket.emit('complete_boss_arena', { victory, regionId });
  },
  onClosed: () => {
    syncInputLock();
  },
});

const progressModal = new ProgressModal({
  onRequestSaveCode: () => {
    socket.emit('export_save_code');
  },
  onLoadSaveCode: (saveCode) => {
    socket.emit('load_save_code', { saveCode });
  },
  onResetProgress: () => {
    socket.emit('reset_progress');
  },
  onClosed: () => {
    syncInputLock();
  },
});

const secretQuestionModal = new SecretQuestionModal({
  onAnswer: (choiceIndex) => {
    socket.emit('answer_secret_question', { choiceIndex });
  },
  onSetCustomQuestion: (payload) => {
    socket.emit('set_secret_question', payload);
  },
  onClosed: () => {
    syncInputLock();
  },
});

const secretPortalModal = new SecretPortalModal(() => {
  syncInputLock();
});

function syncInputLock(): void {
  const blocked =
    eventModal.isOpen() ||
    combatModal.isOpen() ||
    shopModal.isOpen() ||
    tavernModal.isOpen() ||
    tutorialModal.isOpen() ||
    inventoryModal.isOpen() ||
    chestModal.isOpen() ||
    skillTreeModal.isOpen() ||
    minigameModal.isOpen() ||
    arenaModal.isOpen() ||
    progressModal.isOpen() ||
    secretQuestionModal.isOpen() ||
    secretPortalModal.isOpen() ||
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
    inventoryModal.isOpen() ||
    chestModal.isOpen() ||
    skillTreeModal.isOpen() ||
    minigameModal.isOpen() ||
    arenaModal.isOpen() ||
    progressModal.isOpen() ||
    secretQuestionModal.isOpen() ||
    secretPortalModal.isOpen() ||
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
            <button type="button" id="hud-progress-btn" class="btn btn-secondary">Guardar / Reiniciar</button>
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
            <div class="hud-combat-row">
              <button type="button" id="hud-shop-btn" class="btn btn-shop-outline">Tienda</button>
              <button type="button" id="hud-bag-btn" class="btn btn-secondary">Mochila (0/5)</button>
            </div>
            <button type="button" id="hud-skills-btn" class="btn btn-special-outline">Árbol de Habilidades</button>
            <div class="map-legend">
              <span class="legend-chip"><span class="legend-dot dot-portal"></span>Portal</span>
              <span class="legend-chip"><span class="legend-dot dot-event"></span>Evento</span>
              <span class="legend-chip"><span class="legend-dot dot-combat"></span>Combate</span>
              <span class="legend-chip"><span class="legend-dot dot-shop"></span>Tienda</span>
              <span class="legend-chip"><span class="legend-dot dot-chest"></span>Cofre</span>
              <span class="legend-chip"><span class="legend-dot dot-minigame"></span>Minijuego</span>
              <span class="legend-chip"><span class="legend-dot dot-spring"></span>Fuente</span>
              <span class="legend-chip"><span class="legend-dot dot-trap"></span>Trampa</span>
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
      if (!currentRoom || currentRoom.phase !== 'playing') return;
      const bossNames: Record<string, { name: string; hp: number }> = {
        valderroble: { name: 'Rey Trasgo Gruk', hp: 28 },
        solceniza: { name: 'Dragón Menor de Ceniza', hp: 34 },
        ventisca: { name: 'Señor de la Escarcha', hp: 36 },
        'plano-astral': { name: 'Titán del Vacío', hp: 42 },
        'pantano-bruma': { name: 'Hidra del Pantano', hp: 34 },
        'ruinas-olvido': { name: 'Coloso de Piedra', hp: 38 },
        'archipielago-coral': { name: 'Leviatán de Coral', hp: 40 },
        'abismo-cristal': { name: 'Dragón de Cristal', hp: 44 },
        'camara-final': { name: 'Emperador del Abismo', hp: 60 },
      };
      const meta = bossNames[currentRoom.regionId] ?? { name: 'Jefe del Reino', hp: 30 };
      arenaModal.showBossBattle(meta.name, meta.hp, currentRoom.regionId);
      syncInputLock();
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

    document.querySelector('#hud-bag-btn')?.addEventListener('click', () => {
      if (currentRoom && currentRoom.phase === 'playing') {
        inventoryModal.show(currentRoom, myPlayerId);
        syncInputLock();
      }
    });

    document.querySelector('#hud-skills-btn')?.addEventListener('click', () => {
      if (currentRoom && currentRoom.phase === 'playing') {
        skillTreeModal.show(currentRoom, myPlayerId);
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

    document.querySelector('#hud-progress-btn')?.addEventListener('click', () => {
      if (currentRoom && currentRoom.phase === 'playing') {
        progressModal.show(currentRoom, myPlayerId);
        syncInputLock();
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
    if (!phaserLoading) {
      phaserLoading = true;
      void import('./game/phaserGame').then(({ createPhaserGame }) => {
        phaserLoading = false;
        if (!currentRoom || !document.querySelector('#phaser-host')) return;
        const created = createPhaserGame(host, currentRoom, initialQuality);
        phaserGame = created.game;
        overworldScene = created.scene;
        if (myPlayerId) {
          overworldScene.configure(currentRoom, myPlayerId, requestMove);
        }
        syncInputLock();
      });
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
  inventoryModal.render(room, myPlayerId);
  skillTreeModal.render(room, myPlayerId);
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

  const bagBtn = document.querySelector<HTMLButtonElement>('#hud-bag-btn');
  if (bagBtn) {
    const me = room.players.find((p) => p.id === myPlayerId);
    const usedSlots = Object.values(me?.inventory ?? {}).filter((q) => q > 0).length;
    bagBtn.textContent = `Mochila (${usedSlots}/${MAX_INVENTORY_SLOTS})`;
    bagBtn.disabled = room.phase !== 'playing';
  }

  const skillsBtn = document.querySelector<HTMLButtonElement>('#hud-skills-btn');
  if (skillsBtn) {
    const me = room.players.find((p) => p.id === myPlayerId);
    const pts = me?.skillPoints ?? 0;
    skillsBtn.textContent = pts > 0 ? `Habilidades (${pts} pt${pts === 1 ? '' : 's'})` : 'Árbol de Habilidades';
    skillsBtn.disabled = room.phase !== 'playing';
  }

  const questEl = document.querySelector<HTMLElement>('#hud-quest-box');
  if (questEl) {
    const keysCount = room.bossKeys?.length ?? 0;
    const modHtml = room.map.modifierLabel
      ? `<div class="quest-meta" style="color:#93c5fd;">Reino: ${escapeHtml(room.map.modifierLabel)}</div>`
      : '';
    const questHtml = room.quest
      ? `
        <div class="quest-title">Misión: ${escapeHtml(room.quest.title)}</div>
        <div class="quest-meta">Progreso ${room.quest.progress}/${room.quest.target} • +${room.quest.rewardGold} monedas</div>
      `
      : '';
    questEl.innerHTML = `
      ${questHtml}
      <div class="quest-keys-row">🔑 Llaves: <strong>${keysCount}/4</strong></div>
      ${modHtml}
    `;
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
              <span><strong>Niv. ${p.level ?? 1}</strong> (${p.xp ?? 0}/${xpForNextLevel(p.level ?? 1)} EXP)</span>
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
  inventoryModal.hide();
  chestModal.hide();
  skillTreeModal.hide();
  minigameModal.hide();
  arenaModal.hide();
  progressModal.hide();
  secretQuestionModal.hide();
  secretPortalModal.hide();
  destroyPhaser();
  lobbyUI.render(currentRoom, myPlayerId, lastError);
}

// Socket lifecycle
socket.on('connect', () => {
  const saved = loadSavedSession();
  if (saved) {
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
});

socket.on('roaming_moved', (monsters) => {
  if (!currentRoom) return;
  currentRoom.roamingMonsters = monsters;
  overworldScene?.syncRoamingMonsters(monsters);
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

socket.on('enemy_telegraph', ({ enemyName, targetPlayerId, targetPlayerName, windowMs }) => {
  combatModal.showDodgePrompt(enemyName, targetPlayerId, targetPlayerName, windowMs);
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

socket.on('chest_opened', (payload) => {
  currentRoom = payload.room;
  updateGameHud(payload.room);
  inventoryModal.render(payload.room, myPlayerId);
  if (payload.playerId === myPlayerId) {
    chestModal.show({
      rarity: payload.rarity,
      gold: payload.gold,
      xp: payload.xp,
      itemId: payload.itemId,
      itemName: payload.itemName,
      inventoryFull: payload.inventoryFull,
    });
    syncInputLock();
  }
});

socket.on('blue_creature_moved', (creature) => {
  if (!currentRoom) return;
  currentRoom.blueCreature = creature;
  overworldScene?.syncBlueCreature(creature);
});

socket.on('open_secret_question', (payload) => {
  if (currentRoom && currentRoom.phase === 'playing') {
    secretQuestionModal.show(payload);
    syncInputLock();
  }
});

socket.on('secret_question_result', (payload) => {
  secretQuestionModal.setResult(payload);
});

socket.on('open_secret_portal_reqs', (reqs) => {
  if (currentRoom && currentRoom.phase === 'playing') {
    secretPortalModal.show(reqs);
    syncInputLock();
  }
});

socket.on('save_code_generated', ({ saveCode }) => {
  progressModal.setGeneratedCode(saveCode, currentRoom, myPlayerId);
});

socket.on('open_shop', () => {
  if (currentRoom && currentRoom.phase === 'playing') {
    shopModal.show(currentRoom, myPlayerId);
    syncInputLock();
  }
});

socket.on('open_minigame', ({ game }) => {
  if (currentRoom && currentRoom.phase === 'playing') {
    if (game === 'arena') {
      arenaModal.show('normal');
    } else {
      minigameModal.show(game);
    }
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
