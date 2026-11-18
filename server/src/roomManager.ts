import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  BOSS_KEY_BY_REGION,
  CHEST_RESPAWN_MS,
  COMBAT_TILE_COOLDOWN_MS,
  EVENT_TILE_COOLDOWN_MS,
  ITEMS_BY_ID,
  MAX_INVENTORY_SLOTS,
  MAX_PLAYERS,
  MINIGAME_COOLDOWN_MS,
  MOVE_COOLDOWN_MS,
  PLAYER_CLASSES,
  PORTAL_COOLDOWN_MS,
  RARITY_LABELS,
  ROOM_CODE_LENGTH,
  SHOP_ITEMS,
  SKILL_TREE,
  STARTING_GOLD,
  TAVERN_MAX_PLAYS,
  TAVERN_WINDOW_MS,
  xpForNextLevel,
  type ActiveEventState,
  type BlueCreatureState,
  type CombatEndedPayload,
  type CombatState,
  type CombatStatus,
  type CombatTurnEntry,
  type DiceRollBreakdown,
  type Direction,
  type EventOutcomePayload,
  type EventSource,
  type EventTriggerType,
  type ItemRarity,
  type PlayerClass,
  type PlayerState,
  type PublicPlayerState,
  type PublicRoomState,
  type QuestState,
  type RoamingMonster,
  type RoomPhase,
  type SecretQuestionState,
  type SkillNodeId,
  type StatusKind,
  type TavernResultPayload,
} from '@tbd/shared';
import { generateEventForParty, type DmEvent } from './aiDm.js';
import { rollD20, rollDiceExpression, rollDie } from './dice.js';
import { spawnBlueCreatureEnemy, spawnBossForRegion, spawnEnemiesForParty } from './enemies.js';
import {
  REGIONS,
  STARTING_REGION_ID,
  findChestAt,
  findPortalAt,
  findWalkableNearby,
  getRegion,
  isTileWalkable,
  spawnBlueCreature,
  spawnRoamingMonstersForRegion,
} from './worldMap.js';

export interface InternalActiveEvent {
  event: DmEvent;
  votes: Record<string, string>;
  triggeredByName: string;
  triggerType: EventTriggerType;
  source: EventSource;
  startedAt: number;
  tileKey?: string;
}

export interface InternalRoom {
  code: string;
  hostId: string;
  phase: RoomPhase;
  regionId: string;
  players: PlayerState[];
  createdAt: number;
  activeInternalEvent: InternalActiveEvent | null;
  combat: CombatState | null;
  quest: QuestState | null;
  bossKeys: string[];
  roamingMonsters?: RoamingMonster[];
  blueCreature?: BlueCreatureState | null;
  secretRoomUnlocked?: boolean;
  recentEventIds?: string[];
}

interface SocketBinding {
  roomCode: string;
  playerId: string;
}

export type MoveOutcome =
  | {
      type: 'moved';
      room: InternalRoom;
      player: PlayerState;
      steppedOnEventTile: boolean;
      steppedOnCombatTile: boolean;
      isBossCombatTile: boolean;
      steppedOnShopTile: boolean;
      steppedOnMinigameTile: boolean;
      steppedOnSecretQuestionTile: boolean;
      secretPortalPrompt: {
        hasFinalKey: boolean;
        hasBlueEssence: boolean;
        hasCoins: boolean;
        coins: number;
      } | null;
      hitBlueCreature: boolean;
      mapNotice?: string;
      openedChest: {
        playerId: string;
        playerName: string;
        rarity: ItemRarity;
        gold: number;
        xp: number;
        itemId?: string;
        itemName?: string;
        inventoryFull?: boolean;
      } | null;
      tileX: number;
      tileY: number;
    }
  | {
      type: 'teleported';
      room: InternalRoom;
      fromRegionName: string;
      toRegionName: string;
      triggeredByName: string;
    }
  | {
      type: 'portal_blocked';
      room: InternalRoom;
      message: string;
    };

export type VoteOutcome =
  | { type: 'updated'; room: InternalRoom; activeEvent: ActiveEventState }
  | { type: 'resolved'; outcome: EventOutcomePayload };

export type CombatStepOutcome =
  | { type: 'updated'; room: InternalRoom; roll: DiceRollBreakdown }
  | { type: 'ended'; outcome: CombatEndedPayload };

const QUEST_ROTATION: Omit<QuestState, 'progress'>[] = [
  {
    id: 'quest-combat',
    title: 'Cazador de Monstruos',
    type: 'combat',
    target: 2,
    rewardGold: 50,
    rewardXp: 60,
  },
  {
    id: 'quest-portal',
    title: 'Viajero de Reinos',
    type: 'portal',
    target: 2,
    rewardGold: 45,
    rewardXp: 55,
  },
  {
    id: 'quest-event',
    title: 'Explorador Curioso',
    type: 'event',
    target: 2,
    rewardGold: 45,
    rewardXp: 55,
  },
];

function createQuestByIndex(idx: number): QuestState {
  const tpl = QUEST_ROTATION[idx % QUEST_ROTATION.length];
  return { ...tpl, progress: 0 };
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export class RoomManager {
  private rooms = new Map<string, InternalRoom>();
  private socketToBinding = new Map<string, SocketBinding>();
  private lastMoveAt = new Map<string, number>();
  private lastPortalAt = new Map<string, number>();
  private eventTileCooldowns = new Map<string, number>();
  private combatTileCooldowns = new Map<string, number>();
  private chestTileCooldowns = new Map<string, number>();
  private minigameCooldowns = new Map<string, number>();
  private springCooldowns = new Map<string, number>();
  private surpriseCooldowns = new Map<string, number>();
  private secretPortalCooldowns = new Map<string, number>();
  private pendingEventRooms = new Set<string>();
  private pendingEnemyTarget = new Map<string, { targetId: string; dodgeReduction: 0 | 15 | 30 }>();
  private saveTimer: NodeJS.Timeout | null = null;
  private readonly storePath: string;
  private readonly secretQuestionPath: string;
  private secretQuestion: SecretQuestionState = {
    question: '¿Cuál es la carta Pokémon que más vale que tiene Ziming?',
    options: ['a) Bulbasaur', 'b) Leafeon', 'c) Mew'],
    correctIndex: 1,
    authorName: 'Ziming',
  };

  constructor(dataDir: string) {
    this.storePath = path.join(dataDir, 'rooms.json');
    this.secretQuestionPath = path.join(dataDir, 'secretQuestion.json');
    this.loadFromDisk();
    this.loadSecretQuestion();
  }

  private loadSecretQuestion(): void {
    try {
      if (!fs.existsSync(this.secretQuestionPath)) return;
      const raw = fs.readFileSync(this.secretQuestionPath, 'utf-8');
      const parsed = JSON.parse(raw) as SecretQuestionState;
      if (
        parsed &&
        typeof parsed.question === 'string' &&
        Array.isArray(parsed.options) &&
        parsed.options.length === 3 &&
        typeof parsed.correctIndex === 'number'
      ) {
        this.secretQuestion = parsed;
      }
    } catch {
      // keep default
    }
  }

  private saveSecretQuestion(): void {
    try {
      fs.mkdirSync(path.dirname(this.secretQuestionPath), { recursive: true });
      fs.writeFileSync(this.secretQuestionPath, JSON.stringify(this.secretQuestion, null, 2), 'utf-8');
    } catch {
      // ignore
    }
  }

  private loadFromDisk(): void {
    try {
      if (!fs.existsSync(this.storePath)) return;
      const raw = fs.readFileSync(this.storePath, 'utf-8');
      const parsed = JSON.parse(raw) as InternalRoom[];
      if (!Array.isArray(parsed)) return;

      for (const room of parsed) {
        if (!room?.code || !Array.isArray(room.players)) continue;
        if (!REGIONS[room.regionId]) {
          room.regionId = STARTING_REGION_ID;
        }
        const map = getRegion(room.regionId);
        // On server restart, nobody has an active socket yet
        room.players = room.players.map((p, idx) => {
          const safePos =
            p.regionId === room.regionId && isTileWalkable(map, p.x, p.y)
              ? { x: p.x, y: p.y }
              : findWalkableNearby(map, map.spawn.x, map.spawn.y, idx);
          const cleanInv: Record<string, number> = {};
          const upgrades: Record<string, number> =
            p.shopUpgrades && typeof p.shopUpgrades === 'object' ? { ...p.shopUpgrades } : {};
          if (p.inventory && typeof p.inventory === 'object') {
            for (const [k, v] of Object.entries(p.inventory)) {
              if (k === 'weapon_upgrade' || k === 'armor_upgrade' || k === 'luck_charm') {
                upgrades[k] = Math.max(upgrades[k] ?? 0, Number(v) || 0);
              } else if (typeof v === 'number' && v > 0) {
                cleanInv[k] = v;
              }
            }
          }
          return {
            ...p,
            regionId: room.regionId,
            x: safePos.x,
            y: safePos.y,
            gold: typeof p.gold === 'number' && Number.isFinite(p.gold) ? Math.max(0, p.gold) : STARTING_GOLD,
            xp: typeof p.xp === 'number' && Number.isFinite(p.xp) ? Math.max(0, p.xp) : 0,
            level: typeof p.level === 'number' && Number.isFinite(p.level) ? Math.max(1, p.level) : 1,
            skillPoints: typeof p.skillPoints === 'number' && Number.isFinite(p.skillPoints) ? Math.max(0, p.skillPoints) : 1,
            unlockedSkills: Array.isArray(p.unlockedSkills) ? [...p.unlockedSkills] : [],
            luckBonus: typeof p.luckBonus === 'number' && Number.isFinite(p.luckBonus) ? Math.max(0, p.luckBonus) : 0,
            inventory: cleanInv,
            shopUpgrades: upgrades,
            equippedWeaponId: typeof p.equippedWeaponId === 'string' ? p.equippedWeaponId : null,
            equippedArmorId: typeof p.equippedArmorId === 'string' ? p.equippedArmorId : null,
            redeemedCodes: Array.isArray(p.redeemedCodes) ? [...p.redeemedCodes] : [],
            tavernPlays: Array.isArray(p.tavernPlays) ? p.tavernPlays.filter((t) => typeof t === 'number') : [],
            connected: false,
          };
        });

        const hasValidActiveEvent = Boolean(
          room.activeInternalEvent?.event?.choices &&
            room.activeInternalEvent.event.choices.length === 3
        );
        room.activeInternalEvent = hasValidActiveEvent ? room.activeInternalEvent : null;
        const hasValidCombat = Boolean(
          room.combat && Array.isArray(room.combat.enemies) && Array.isArray(room.combat.turnOrder)
        );
        room.combat = hasValidCombat ? room.combat : null;
        if (room.combat && !room.combat.mode) {
          room.combat.mode = 'pve';
        }

        if (
          room.phase !== 'lobby' &&
          room.phase !== 'playing' &&
          room.phase !== 'event' &&
          room.phase !== 'combat'
        ) {
          room.phase = 'lobby';
        }
        if (room.phase === 'event' && !room.activeInternalEvent) {
          room.phase = 'playing';
        }
        if (room.phase === 'combat' && !room.combat) {
          room.phase = 'playing';
        }
        room.recentEventIds = Array.isArray(room.recentEventIds) ? room.recentEventIds : [];
        room.bossKeys = Array.isArray(room.bossKeys) ? [...room.bossKeys] : [];
        room.roamingMonsters = Array.isArray(room.roamingMonsters)
          ? room.roamingMonsters
          : spawnRoamingMonstersForRegion(map);
        room.blueCreature = room.blueCreature ?? spawnBlueCreature();
        room.secretRoomUnlocked = Boolean(room.secretRoomUnlocked);
        if (!room.quest || typeof room.quest.target !== 'number') {
          room.quest = createQuestByIndex(0);
        }

        this.rooms.set(room.code, room);
      }
      console.log(`[RoomManager] Loaded ${this.rooms.size} room(s) from ${this.storePath}`);
    } catch (err) {
      console.error('[RoomManager] Failed to load rooms from disk:', err);
    }
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      void this.saveAsync();
    }, 200);
  }

  private async saveAsync(): Promise<void> {
    try {
      await fs.promises.mkdir(path.dirname(this.storePath), { recursive: true });
      const data = Array.from(this.rooms.values());
      await fs.promises.writeFile(this.storePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[RoomManager] Failed to save rooms to disk:', err);
    }
  }

  public saveNow(): void {
    try {
      fs.mkdirSync(path.dirname(this.storePath), { recursive: true });
      const data = Array.from(this.rooms.values());
      fs.writeFileSync(this.storePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[RoomManager] Failed to save rooms to disk:', err);
    }
  }

  private generateRoomCode(): string {
    for (let attempt = 0; attempt < 50; attempt++) {
      let code = '';
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
        code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      }
      if (!this.rooms.has(code)) return code;
    }
    throw new Error('No se pudo generar un código de sala único.');
  }

  private sanitizeName(name: string): string {
    return name.trim().replace(/\s+/g, ' ').slice(0, 16);
  }

  private createPlayer(
    name: string,
    playerClass: PlayerClass,
    regionId: string,
    indexInRoom: number
  ): PlayerState {
    const template = PLAYER_CLASSES[playerClass];
    const region = getRegion(regionId);
    const pos = findWalkableNearby(region, region.spawn.x, region.spawn.y, indexInRoom);

    return {
      id: crypto.randomUUID(),
      token: crypto.randomUUID(),
      name,
      playerClass,
      x: pos.x,
      y: pos.y,
      regionId: region.id,
      hp: template.maxHp,
      maxHp: template.maxHp,
      ac: template.ac,
      attackMod: template.attackMod,
      damageDice: template.damageDice,
      gold: STARTING_GOLD,
      xp: 0,
      level: 1,
      skillPoints: 1,
      unlockedSkills: [],
      luckBonus: 0,
      inventory: {},
      shopUpgrades: {},
      equippedWeaponId: null,
      equippedArmorId: null,
      redeemedCodes: [],
      tavernPlays: [],
      connected: true,
    };
  }

  private toPublicActiveEvent(active: InternalActiveEvent | null): ActiveEventState | null {
    if (!active) return null;
    return {
      id: active.event.id,
      title: active.event.title,
      narration: active.event.narration,
      choices: active.event.choices.map((c) => ({
        id: c.id,
        label: c.label,
      })),
      votes: { ...active.votes },
      triggeredByName: active.triggeredByName,
      triggerType: active.triggerType,
      source: active.source,
      startedAt: active.startedAt,
    };
  }

  public toPublicRoom(room: InternalRoom): PublicRoomState {
    const publicPlayers: PublicPlayerState[] = room.players.map(({ token: _token, ...rest }) => rest);
    return {
      code: room.code,
      hostId: room.hostId,
      phase: room.phase,
      regionId: room.regionId,
      players: publicPlayers,
      map: getRegion(room.regionId),
      activeEvent: this.toPublicActiveEvent(room.activeInternalEvent),
      combat: room.combat,
      quest: room.quest ?? null,
      bossKeys: [...(room.bossKeys ?? [])],
      roamingMonsters: room.roamingMonsters ?? [],
      blueCreature: room.blueCreature ?? null,
      secretRoomUnlocked: Boolean(room.secretRoomUnlocked),
    };
  }

  public getBinding(socketId: string): SocketBinding | undefined {
    return this.socketToBinding.get(socketId);
  }

  public getRoom(code: string): InternalRoom | undefined {
    return this.rooms.get(code.trim().toUpperCase());
  }

  public createRoom(
    socketId: string,
    rawName: string,
    playerClass: PlayerClass
  ): { room: InternalRoom; player: PlayerState } | { error: string } {
    const name = this.sanitizeName(rawName);
    if (!name) return { error: 'Por favor, escribe un nombre para tu personaje.' };
    if (!PLAYER_CLASSES[playerClass]) return { error: 'Clase seleccionada no válida.' };

    this.detachSocket(socketId);

    const code = this.generateRoomCode();
    const player = this.createPlayer(name, playerClass, STARTING_REGION_ID, 0);
    const room: InternalRoom = {
      code,
      hostId: player.id,
      phase: 'lobby',
      regionId: STARTING_REGION_ID,
      players: [player],
      createdAt: Date.now(),
      activeInternalEvent: null,
      combat: null,
      quest: createQuestByIndex(0),
      bossKeys: [],
      roamingMonsters: spawnRoamingMonstersForRegion(getRegion(STARTING_REGION_ID)),
      blueCreature: spawnBlueCreature(),
      secretRoomUnlocked: false,
      recentEventIds: [],
    };

    this.rooms.set(code, room);
    this.socketToBinding.set(socketId, { roomCode: code, playerId: player.id });
    this.scheduleSave();
    return { room, player };
  }

  public joinRoom(
    socketId: string,
    rawCode: string,
    rawName: string,
    playerClass: PlayerClass,
    playerToken?: string
  ): { room: InternalRoom; player: PlayerState; reconnected: boolean } | { error: string } {
    const code = rawCode.trim().toUpperCase();
    if (code.length !== ROOM_CODE_LENGTH) {
      return { error: 'El código de sala debe tener 4 letras.' };
    }

    const room = this.rooms.get(code);
    if (!room) {
      return { error: `No se encontró la sala "${code}".` };
    }

    // 1. Check reconnect by token
    if (playerToken) {
      const existingByToken = room.players.find((p) => p.token === playerToken);
      if (existingByToken) {
        this.detachSocket(socketId);
        existingByToken.connected = true;
        this.socketToBinding.set(socketId, { roomCode: room.code, playerId: existingByToken.id });
        this.scheduleSave();
        return { room, player: existingByToken, reconnected: true };
      }
    }

    const name = this.sanitizeName(rawName);
    if (!name) return { error: 'Por favor, escribe un nombre para tu personaje.' };
    if (!PLAYER_CLASSES[playerClass]) return { error: 'Clase seleccionada no válida.' };

    // 2. Check reconnect by matching disconnected player name
    const disconnectedMatch = room.players.find(
      (p) => !p.connected && p.name.toLowerCase() === name.toLowerCase()
    );
    if (disconnectedMatch) {
      this.detachSocket(socketId);
      disconnectedMatch.connected = true;
      this.socketToBinding.set(socketId, { roomCode: room.code, playerId: disconnectedMatch.id });
      this.scheduleSave();
      return { room, player: disconnectedMatch, reconnected: true };
    }

    // 3. Otherwise joining as a new player
    if (room.players.length >= MAX_PLAYERS) {
      return { error: `La sala "${code}" está llena (máximo ${MAX_PLAYERS} jugadores).` };
    }

    const duplicateName = room.players.some(
      (p) => p.name.toLowerCase() === name.toLowerCase()
    );
    if (duplicateName) {
      return { error: `El nombre "${name}" ya está en uso en esta sala.` };
    }

    this.detachSocket(socketId);
    const player = this.createPlayer(name, playerClass, room.regionId, room.players.length);
    room.players.push(player);
    this.socketToBinding.set(socketId, { roomCode: room.code, playerId: player.id });
    this.scheduleSave();
    return { room, player, reconnected: false };
  }

  public reconnectRoom(
    socketId: string,
    rawCode: string,
    playerToken: string
  ): { room: InternalRoom; player: PlayerState } | { error: string } {
    const code = rawCode.trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) {
      return { error: `La sala "${code}" ya no existe.` };
    }

    const player = room.players.find((p) => p.token === playerToken);
    if (!player) {
      return { error: 'No se encontró tu personaje en esa sala.' };
    }

    this.detachSocket(socketId);
    player.connected = true;
    this.socketToBinding.set(socketId, { roomCode: room.code, playerId: player.id });
    this.scheduleSave();
    return { room, player };
  }

  private detachSocket(socketId: string): void {
    const binding = this.socketToBinding.get(socketId);
    if (!binding) return;
    this.socketToBinding.delete(socketId);

    const room = this.rooms.get(binding.roomCode);
    if (!room) return;
    const player = room.players.find((p) => p.id === binding.playerId);
    if (player) {
      player.connected = false;
      this.ensureConnectedHost(room);
      this.scheduleSave();
    }
  }

  private ensureConnectedHost(room: InternalRoom): void {
    const currentHost = room.players.find((p) => p.id === room.hostId);
    if (currentHost && currentHost.connected) return;
    const nextConnected = room.players.find((p) => p.connected);
    if (nextConnected) {
      room.hostId = nextConnected.id;
    }
  }

  private maybeAutoResolveAfterPlayerExit(room: InternalRoom): EventOutcomePayload | null {
    if (room.phase !== 'event' || !room.activeInternalEvent) return null;
    const connectedPlayers = room.players.filter((p) => p.connected);
    if (connectedPlayers.length === 0) return null;
    const allConnectedVoted = connectedPlayers.every(
      (p) => Boolean(room.activeInternalEvent!.votes[p.id])
    );
    if (!allConnectedVoted) return null;
    return this.resolveActiveEvent(room);
  }

  public disconnectSocket(
    socketId: string
  ): { room: InternalRoom; playerName: string; resolvedOutcome: EventOutcomePayload | null } | null {
    const binding = this.socketToBinding.get(socketId);
    if (!binding) return null;

    this.socketToBinding.delete(socketId);
    const room = this.rooms.get(binding.roomCode);
    if (!room) return null;

    const player = room.players.find((p) => p.id === binding.playerId);
    if (!player) return null;

    player.connected = false;
    this.ensureConnectedHost(room);
    const resolvedOutcome = this.maybeAutoResolveAfterPlayerExit(room);
    this.scheduleSave();
    return { room, playerName: player.name, resolvedOutcome };
  }

  public leaveRoom(socketId: string): {
    room: InternalRoom | null;
    roomCode: string;
    playerName: string;
    resolvedOutcome: EventOutcomePayload | null;
  } | null {
    const binding = this.socketToBinding.get(socketId);
    if (!binding) return null;

    this.socketToBinding.delete(socketId);
    const room = this.rooms.get(binding.roomCode);
    if (!room) return null;

    const idx = room.players.findIndex((p) => p.id === binding.playerId);
    if (idx === -1) return null;

    const [removed] = room.players.splice(idx, 1);
    if (room.players.length === 0) {
      this.rooms.delete(room.code);
      this.pendingEventRooms.delete(room.code);
      this.scheduleSave();
      return { room: null, roomCode: room.code, playerName: removed.name, resolvedOutcome: null };
    }

    if (room.activeInternalEvent) {
      delete room.activeInternalEvent.votes[removed.id];
    }

    if (room.hostId === removed.id) {
      const next = room.players.find((p) => p.connected) ?? room.players[0];
      room.hostId = next.id;
    }

    const resolvedOutcome = this.maybeAutoResolveAfterPlayerExit(room);
    this.scheduleSave();
    return { room, roomCode: room.code, playerName: removed.name, resolvedOutcome };
  }

  public startGame(socketId: string): { room: InternalRoom } | { error: string } {
    const binding = this.socketToBinding.get(socketId);
    if (!binding) return { error: 'No estás en ninguna sala.' };

    const room = this.rooms.get(binding.roomCode);
    if (!room) return { error: 'Sala no encontrada.' };

    if (room.hostId !== binding.playerId) {
      return { error: 'Solo el líder del grupo puede iniciar la aventura.' };
    }

    if (room.phase === 'lobby') {
      room.phase = 'playing';
      this.scheduleSave();
    }
    return { room };
  }

  public movePlayer(socketId: string, direction: Direction): MoveOutcome | null {
    const binding = this.socketToBinding.get(socketId);
    if (!binding) return null;

    const room = this.rooms.get(binding.roomCode);
    if (!room || room.phase !== 'playing') return null;

    const player = room.players.find((p) => p.id === binding.playerId);
    if (!player) return null;

    const now = Date.now();
    const prevMove = this.lastMoveAt.get(player.id) ?? 0;
    if (now - prevMove < MOVE_COOLDOWN_MS) return null;

    const delta: Record<Direction, { dx: number; dy: number }> = {
      up: { dx: 0, dy: -1 },
      down: { dx: 0, dy: 1 },
      left: { dx: -1, dy: 0 },
      right: { dx: 1, dy: 0 },
    };
    const d = delta[direction];
    if (!d) return null;

    const currentMap = getRegion(room.regionId);
    const nextX = player.x + d.dx;
    const nextY = player.y + d.dy;

    if (!isTileWalkable(currentMap, nextX, nextY)) {
      return null;
    }

    this.lastMoveAt.set(player.id, now);
    player.x = nextX;
    player.y = nextY;

    const portal = findPortalAt(currentMap, nextX, nextY);
    if (portal) {
      if (portal.requiredKey && !(room.bossKeys ?? []).includes(portal.requiredKey)) {
        const keyLabel = portal.requiredKeyLabel ?? portal.requiredKey;
        return {
          type: 'portal_blocked',
          room,
          message: `Necesitas la ${keyLabel} (derrota al Jefe de este reino).`,
        };
      }

      if (portal.minLevel) {
        const missing = room.players.filter((p) => (p.level ?? 1) < portal.minLevel!);
        if (missing.length > 0) {
          const names = missing.map((p) => `${p.name} (Nv.${p.level ?? 1})`).join(', ');
          return {
            type: 'portal_blocked',
            room,
            message: `Este portal requiere que todo el grupo sea Nivel ${portal.minLevel}+. Faltan: ${names}.`,
          };
        }
      }

      if (portal.requiresFinalUnlock && !room.secretRoomUnlocked) {
        const hasFinalKey = (room.bossKeys ?? []).includes('key_final_boss');
        const hasBlueEssence = (room.bossKeys ?? []).includes('key_blue_creature');
        const hasCoins = (player.gold ?? 0) >= 1000;
        if (!hasFinalKey || !hasBlueEssence || !hasCoins) {
          return {
            type: 'moved',
            room,
            player,
            steppedOnEventTile: false,
            steppedOnCombatTile: false,
            isBossCombatTile: false,
            steppedOnShopTile: false,
            steppedOnMinigameTile: false,
            steppedOnSecretQuestionTile: false,
            secretPortalPrompt: {
              hasFinalKey,
              hasBlueEssence,
              hasCoins,
              coins: player.gold ?? 0,
            },
            openedChest: null,
            hitBlueCreature: false,
            tileX: nextX,
            tileY: nextY,
          };
        }
        player.gold -= 1000;
        room.secretRoomUnlocked = true;
      }

      const prevPortal = this.lastPortalAt.get(room.code) ?? 0;
      if (now - prevPortal >= PORTAL_COOLDOWN_MS) {
        this.lastPortalAt.set(room.code, now);
        const targetMap = getRegion(portal.targetRegionId);
        room.regionId = targetMap.id;

        room.players.forEach((p, idx) => {
          const pos = findWalkableNearby(targetMap, portal.targetX, portal.targetY, idx);
          p.regionId = targetMap.id;
          p.x = pos.x;
          p.y = pos.y;
        });

        room.roamingMonsters = spawnRoamingMonstersForRegion(targetMap);
        this.advanceQuest(room, 'portal');
        this.scheduleSave();
        return {
          type: 'teleported',
          room,
          fromRegionName: currentMap.name,
          toRegionName: targetMap.name,
          triggeredByName: player.name,
        };
      }
    }

    const landedTile = currentMap.tiles[nextY]?.[nextX];
    let openedChest: Extract<MoveOutcome, { type: 'moved' }>['openedChest'] = null;
    if (landedTile === 'chest') {
      const chest = findChestAt(currentMap, nextX, nextY);
      if (chest) {
        openedChest = this.tryOpenChest(room, player, chest.rarity, nextX, nextY, now);
      }
    }

    // Check roaming monster collision
    let hitRoamingMonster = false;
    const roamingIdx = (room.roamingMonsters ?? []).findIndex(
      (m) => m.x === nextX && m.y === nextY
    );
    if (roamingIdx !== -1) {
      hitRoamingMonster = true;
      room.roamingMonsters!.splice(roamingIdx, 1);
      const fresh = spawnRoamingMonstersForRegion(currentMap);
      if (fresh[0]) room.roamingMonsters!.push(fresh[0]);
    }

    let mapNotice: string | undefined;
    if (landedTile === 'spring') {
      const springKey = `${room.code}:${room.regionId}:${nextX},${nextY}`;
      const readyAt = this.springCooldowns.get(springKey) ?? 0;
      if (now >= readyAt) {
        this.springCooldowns.set(springKey, now + 30_000);
        const before = player.hp;
        player.hp = Math.min(player.maxHp, player.hp + 8);
        const healed = player.hp - before;
        mapNotice =
          healed > 0
            ? `Fuente Curativa: ${player.name} recuperó +${healed} de Vida.`
            : `Fuente Curativa: ${player.name} ya tiene la Vida al máximo.`;
      }
    } else if (landedTile === 'trap') {
      const trapKey = `${room.code}:${room.regionId}:${nextX},${nextY}`;
      const readyAt = this.springCooldowns.get(trapKey) ?? 0;
      if (now >= readyAt) {
        this.springCooldowns.set(trapKey, now + 20_000);
        if (rollD20() + (player.luckBonus ?? 0) >= 13) {
          mapNotice = `¡Trampa esquivada! ${player.name} saltó justo a tiempo.`;
        } else {
          player.hp = Math.max(1, player.hp - 4);
          mapNotice = `¡Trampa oculta! ${player.name} pisó unos pinchos (-4 Vida).`;
        }
      }
    } else if ((landedTile === 'grass' || landedTile === 'path') && !hitRoamingMonster) {
      const surpriseReadyAt = this.surpriseCooldowns.get(room.code) ?? 0;
      if (now >= surpriseReadyAt && Math.random() < 0.06) {
        this.surpriseCooldowns.set(room.code, now + 35_000);
        if (Math.random() < 0.6) {
          player.gold = (player.gold ?? 0) + 6;
          mapNotice = `¡Hallazgo en el camino! ${player.name} encontró una bolsita con +6 monedas.`;
        } else {
          player.hp = Math.min(player.maxHp, player.hp + 3);
          mapNotice = `¡Fruta silvestre! ${player.name} recuperó +3 de Vida.`;
        }
      }
    }

    let hitBlueCreature = false;
    if (
      room.blueCreature &&
      room.blueCreature.regionId === currentMap.id &&
      room.blueCreature.x === nextX &&
      room.blueCreature.y === nextY
    ) {
      hitBlueCreature = true;
    }

    let secretPortalPrompt: Extract<MoveOutcome, { type: 'moved' }>['secretPortalPrompt'] = null;
    if (
      currentMap.id === 'valderroble' &&
      !room.secretRoomUnlocked &&
      Math.abs(nextX - 17) + Math.abs(nextY - 13) <= 2
    ) {
      const spKey = `${room.code}:${player.id}`;
      const readyAt = this.secretPortalCooldowns.get(spKey) ?? 0;
      if (now >= readyAt) {
        this.secretPortalCooldowns.set(spKey, now + 10_000);
        secretPortalPrompt = {
          hasFinalKey: (room.bossKeys ?? []).includes('key_final_boss'),
          hasBlueEssence: (room.bossKeys ?? []).includes('key_blue_creature'),
          hasCoins: (player.gold ?? 0) >= 1000,
          coins: player.gold ?? 0,
        };
      }
    }

    this.scheduleSave();
    return {
      type: 'moved',
      room,
      player,
      steppedOnEventTile: landedTile === 'event',
      steppedOnCombatTile: landedTile === 'combat' || hitRoamingMonster || hitBlueCreature,
      isBossCombatTile: currentMap.id === 'camara-final' && landedTile === 'combat',
      steppedOnShopTile: landedTile === 'shop',
      steppedOnMinigameTile: landedTile === 'minigame',
      steppedOnSecretQuestionTile: landedTile === 'secret_question',
      secretPortalPrompt,
      hitBlueCreature,
      mapNotice,
      openedChest,
      tileX: nextX,
      tileY: nextY,
    };
  }

  private grantXp(player: PlayerState, amount: number): number {
    if (amount <= 0) return 0;
    player.xp = (player.xp ?? 0) + amount;
    player.level = player.level ?? 1;
    let gainedLevels = 0;

    while (player.xp >= xpForNextLevel(player.level)) {
      player.xp -= xpForNextLevel(player.level);
      player.level += 1;
      player.skillPoints = (player.skillPoints ?? 0) + 1;
      player.maxHp += 2;
      player.hp = Math.min(player.maxHp, player.hp + 2);
      player.attackMod += 1;
      player.ac += 1;
      gainedLevels += 1;
    }
    return gainedLevels;
  }

  private countInventorySlots(player: PlayerState): number {
    return Object.values(player.inventory ?? {}).filter((qty) => qty > 0).length;
  }

  private addItemToInventory(player: PlayerState, itemId: string): boolean {
    player.inventory = player.inventory ?? {};
    if ((player.inventory[itemId] ?? 0) > 0) {
      player.inventory[itemId] += 1;
      return true;
    }
    if (this.countInventorySlots(player) >= MAX_INVENTORY_SLOTS) {
      return false;
    }
    player.inventory[itemId] = 1;
    return true;
  }

  private grantChestReward(player: PlayerState, rarity: ItemRarity) {
    const rewards: Record<ItemRarity, { gold: number; xp: number; items: string[] }> = {
      comun: { gold: 15, xp: 30, items: ['potion', 'weapon_rusty', 'armor_leather'] },
      raro: { gold: 30, xp: 60, items: ['bomb', 'weapon_elven', 'armor_steel', 'potion'] },
      epico: { gold: 55, xp: 100, items: ['elixir', 'weapon_fiery', 'armor_glacial', 'bomb'] },
      legendario: { gold: 100, xp: 180, items: ['weapon_astral', 'armor_eternal', 'elixir'] },
    };

    const table = rewards[rarity];
    player.gold = (player.gold ?? 0) + table.gold;
    this.grantXp(player, table.xp);

    const pickedId = table.items[Math.floor(Math.random() * table.items.length)];
    const itemDef = ITEMS_BY_ID[pickedId];
    const added = itemDef ? this.addItemToInventory(player, pickedId) : false;

    return {
      playerId: player.id,
      playerName: player.name,
      rarity,
      gold: table.gold,
      xp: table.xp,
      itemId: itemDef?.id,
      itemName: itemDef?.name,
      inventoryFull: itemDef ? !added : false,
    };
  }

  private tryOpenChest(
    room: InternalRoom,
    player: PlayerState,
    rarity: ItemRarity,
    x: number,
    y: number,
    now: number
  ) {
    const chestKey = `${room.code}:${room.regionId}:${x},${y}`;
    const readyAt = this.chestTileCooldowns.get(chestKey) ?? 0;
    if (now < readyAt) return null;
    this.chestTileCooldowns.set(chestKey, now + CHEST_RESPAWN_MS);

    return this.grantChestReward(player, rarity);
  }

  public completeMinigame(
    socketId: string,
    payload: {
      game: 'memory' | 'reflex' | 'chest_guess' | 'riddle' | 'arena';
      difficulty: 'normal' | 'dificil';
      score: number;
    }
  ):
    | {
        room: InternalRoom;
        chest: {
          playerId: string;
          playerName: string;
          rarity: ItemRarity;
          gold: number;
          xp: number;
          itemId?: string;
          itemName?: string;
          inventoryFull?: boolean;
        };
      }
    | { error: string } {
    const binding = this.socketToBinding.get(socketId);
    if (!binding) return { error: 'No estás en ninguna sala.' };

    const room = this.rooms.get(binding.roomCode);
    if (!room || room.phase !== 'playing') {
      return { error: 'Solo puedes completar minijuegos mientras exploras.' };
    }

    const player = room.players.find((p) => p.id === binding.playerId);
    if (!player) return { error: 'Personaje no encontrado.' };

    const now = Date.now();
    const lastAt = this.minigameCooldowns.get(player.id) ?? 0;
    if (now - lastAt < MINIGAME_COOLDOWN_MS) {
      const waitSec = Math.max(1, Math.ceil((MINIGAME_COOLDOWN_MS - (now - lastAt)) / 1000));
      return { error: `Debes esperar ${waitSec}s antes de jugar otro minijuego.` };
    }
    this.minigameCooldowns.set(player.id, now);

    const score = Math.max(0, Math.floor(Number(payload.score) || 0));
    const isHard = payload.difficulty === 'dificil';
    let rarity: ItemRarity = 'comun';

    if (payload.game === 'memory') {
      if (isHard) {
        if (score >= 3) rarity = 'legendario';
        else if (score === 2) rarity = 'epico';
        else if (score === 1) rarity = 'raro';
      } else {
        if (score >= 3) rarity = 'epico';
        else if (score === 2) rarity = 'raro';
      }
    } else {
      if (isHard) {
        if (score >= 12) rarity = 'legendario';
        else if (score >= 8) rarity = 'epico';
        else if (score >= 5) rarity = 'raro';
      } else {
        if (score >= 12) rarity = 'epico';
        else if (score >= 8) rarity = 'raro';
      }
    }

    const chest = this.grantChestReward(player, rarity);
    this.scheduleSave();
    return { room, chest };
  }

  public async triggerEventForRoom(params: {
    roomCode: string;
    triggeredByName: string;
    triggerType: EventTriggerType;
    tileX?: number;
    tileY?: number;
    triggerContext?: string;
  }): Promise<{ room: InternalRoom } | null> {
    const initialRoom = this.rooms.get(params.roomCode);
    if (!initialRoom || initialRoom.phase !== 'playing' || initialRoom.activeInternalEvent) {
      return null;
    }
    if (this.pendingEventRooms.has(initialRoom.code)) {
      return null;
    }

    const now = Date.now();
    let tileKey: string | undefined;
    if (
      params.triggerType === 'event' &&
      params.tileX !== undefined &&
      params.tileY !== undefined
    ) {
      tileKey = `${initialRoom.code}:${initialRoom.regionId}:${params.tileX},${params.tileY}`;
      const cooldownUntil = this.eventTileCooldowns.get(tileKey) ?? 0;
      if (now < cooldownUntil) {
        return null;
      }
      this.eventTileCooldowns.set(tileKey, now + EVENT_TILE_COOLDOWN_MS);
    }

    const expectedRegionId = initialRoom.regionId;
    this.pendingEventRooms.add(initialRoom.code);

    try {
      const region = getRegion(expectedRegionId);
      const result = await generateEventForParty({
        regionId: region.id,
        regionName: region.name,
        regionSubtitle: region.subtitle,
        tileX: params.tileX,
        tileY: params.tileY,
        triggerContext: params.triggerContext,
        party: initialRoom.players.map((p) => ({
          name: p.name,
          playerClass: p.playerClass,
          hp: p.hp,
          maxHp: p.maxHp,
        })),
        avoidEventIds: initialRoom.recentEventIds ?? [],
      });

      const currentRoom = this.rooms.get(params.roomCode);
      if (
        !currentRoom ||
        currentRoom.players.length === 0 ||
        currentRoom.phase !== 'playing' ||
        currentRoom.activeInternalEvent
      ) {
        return null;
      }
      if (params.triggerType === 'event' && currentRoom.regionId !== expectedRegionId) {
        return null;
      }

      currentRoom.activeInternalEvent = {
        event: result.event,
        votes: {},
        triggeredByName: params.triggeredByName,
        triggerType: params.triggerType,
        source: result.source,
        startedAt: Date.now(),
        tileKey,
      };
      currentRoom.phase = 'event';
      currentRoom.recentEventIds = [
        result.event.id,
        ...(currentRoom.recentEventIds ?? []).filter((id) => id !== result.event.id),
      ].slice(0, 12);

      this.scheduleSave();
      return { room: currentRoom };
    } finally {
      this.pendingEventRooms.delete(initialRoom.code);
    }
  }

  public voteEvent(socketId: string, choiceId: string): VoteOutcome | null {
    const binding = this.socketToBinding.get(socketId);
    if (!binding) return null;

    const room = this.rooms.get(binding.roomCode);
    if (!room || room.phase !== 'event' || !room.activeInternalEvent) return null;

    const player = room.players.find((p) => p.id === binding.playerId);
    if (!player) return null;

    const active = room.activeInternalEvent;
    const isValidChoice = active.event.choices.some((c) => c.id === choiceId);
    if (!isValidChoice) return null;

    active.votes[player.id] = choiceId;

    const connectedPlayers = room.players.filter((p) => p.connected);
    const allConnectedVoted =
      connectedPlayers.length > 0 &&
      connectedPlayers.every((p) => Boolean(active.votes[p.id]));

    if (allConnectedVoted) {
      const outcome = this.resolveActiveEvent(room);
      return { type: 'resolved', outcome };
    }

    this.scheduleSave();
    return {
      type: 'updated',
      room,
      activeEvent: this.toPublicActiveEvent(active)!,
    };
  }

  public resolveEventNow(
    socketId: string
  ): { outcome: EventOutcomePayload } | { error: string } {
    const binding = this.socketToBinding.get(socketId);
    if (!binding) return { error: 'No estás en ninguna sala.' };

    const room = this.rooms.get(binding.roomCode);
    if (!room) return { error: 'Sala no encontrada.' };

    if (room.hostId !== binding.playerId) {
      return { error: 'Solo el líder del grupo puede resolver el evento antes de tiempo.' };
    }

    if (room.phase !== 'event' || !room.activeInternalEvent) {
      return { error: 'No hay ningún evento activo para resolver.' };
    }

    const outcome = this.resolveActiveEvent(room);
    return { outcome };
  }

  private resolveActiveEvent(room: InternalRoom): EventOutcomePayload {
    const active = room.activeInternalEvent!;
    const choices = active.event.choices;
    const counts = new Map<string, number>();
    for (const c of choices) {
      counts.set(c.id, 0);
    }

    let totalValidVotes = 0;
    for (const votedChoiceId of Object.values(active.votes)) {
      if (counts.has(votedChoiceId)) {
        counts.set(votedChoiceId, (counts.get(votedChoiceId) ?? 0) + 1);
        totalValidVotes += 1;
      }
    }

    let winningChoice = choices[0];
    if (totalValidVotes > 0) {
      let maxVotes = -1;
      for (const count of counts.values()) {
        if (count > maxVotes) maxVotes = count;
      }
      const tied = choices.filter((c) => (counts.get(c.id) ?? 0) === maxVotes);
      winningChoice = tied[Math.floor(Math.random() * tied.length)];
    }

    const hpDelta = winningChoice.effects.hpDelta ?? 0;
    const xpDelta = winningChoice.effects.xpDelta ?? 0;
    const goldDelta = winningChoice.effects.goldDelta ?? 0;

    for (const p of room.players) {
      if (hpDelta !== 0) {
        p.hp = Math.max(1, Math.min(p.maxHp, p.hp + hpDelta));
      }
      if (xpDelta !== 0) {
        this.grantXp(p, xpDelta);
      }
      if (goldDelta !== 0) {
        p.gold = Math.max(0, (p.gold ?? 0) + goldDelta);
      }
    }

    if (active.tileKey) {
      this.eventTileCooldowns.set(active.tileKey, Date.now() + EVENT_TILE_COOLDOWN_MS);
    }

    room.activeInternalEvent = null;
    room.phase = 'playing';
    this.advanceQuest(room, 'event');
    this.scheduleSave();

    return {
      eventTitle: active.event.title,
      winningChoiceLabel: winningChoice.label,
      outcomeNarration: winningChoice.outcomeNarration,
      effects: {
        hpDelta: winningChoice.effects.hpDelta,
        xpDelta: winningChoice.effects.xpDelta,
        goldDelta: winningChoice.effects.goldDelta,
        summary: winningChoice.effects.summary,
      },
      room: this.toPublicRoom(room),
    };
  }

  private advanceQuest(room: InternalRoom, type: 'combat' | 'portal' | 'event'): string | null {
    if (!room.quest || room.quest.type !== type) return null;
    room.quest.progress += 1;
    if (room.quest.progress < room.quest.target) {
      return null;
    }

    const completed = room.quest;
    for (const p of room.players) {
      p.gold = (p.gold ?? 0) + completed.rewardGold;
      this.grantXp(p, completed.rewardXp);
    }

    const currentIdx = QUEST_ROTATION.findIndex((q) => q.id === completed.id);
    room.quest = createQuestByIndex((currentIdx + 1) % QUEST_ROTATION.length);
    return `¡Misión completada: "${completed.title}"! (+${completed.rewardGold} monedas, +${completed.rewardXp} EXP). Nueva misión: "${room.quest.title}".`;
  }

  public startCombatBySocket(socketId: string): { room: InternalRoom } | { error: string } {
    const binding = this.socketToBinding.get(socketId);
    if (!binding) return { error: 'No estás en ninguna sala.' };

    const room = this.rooms.get(binding.roomCode);
    if (!room) return { error: 'Sala no encontrada.' };

    if (room.phase !== 'playing' || room.combat) {
      return { error: 'No se puede iniciar un combate ahora mismo.' };
    }

    const started = this.startCombatForRoom(room.code);
    if (!started) return { error: 'No se pudo iniciar el combate.' };
    return { room: started };
  }

  public startBossFightBySocket(socketId: string): { room: InternalRoom } | { error: string } {
    const binding = this.socketToBinding.get(socketId);
    if (!binding) return { error: 'No estás en ninguna sala.' };

    const room = this.rooms.get(binding.roomCode);
    if (!room) return { error: 'Sala no encontrada.' };

    if (room.phase !== 'playing' || room.combat) {
      return { error: 'No se puede desafiar al jefe ahora mismo.' };
    }

    const started = this.startCombatForRoom(room.code, undefined, undefined, true);
    if (!started) return { error: 'No se pudo iniciar el combate contra el jefe.' };
    return { room: started };
  }

  public startCombatForRoom(
    roomCode: string,
    tileX?: number,
    tileY?: number,
    isBoss = false,
    isBlueCreature = false
  ): InternalRoom | null {
    const room = this.rooms.get(roomCode);
    if (!room || room.phase !== 'playing' || room.combat || room.activeInternalEvent) {
      return null;
    }

    const now = Date.now();
    if (!isBlueCreature && tileX !== undefined && tileY !== undefined) {
      const tileKey = `${room.code}:${room.regionId}:${tileX},${tileY}`;
      const cooldownUntil = this.combatTileCooldowns.get(tileKey) ?? 0;
      if (now < cooldownUntil) return null;
      this.combatTileCooldowns.set(tileKey, now + COMBAT_TILE_COOLDOWN_MS);
    }

    const avgLevel =
      room.players.reduce((sum, p) => sum + (p.level ?? 1), 0) /
      Math.max(1, room.players.length);
    const enemies = isBlueCreature
      ? [spawnBlueCreatureEnemy()]
      : isBoss
        ? [spawnBossForRegion(room.regionId, room.players.length, Math.round(avgLevel))]
        : spawnEnemiesForParty(room.regionId, room.players.length, Math.round(avgLevel));
    const turnEntries: CombatTurnEntry[] = [];

    for (const p of room.players) {
      if (p.hp <= 0) p.hp = Math.max(1, Math.ceil(p.maxHp * 0.5));
      const d20 = rollD20();
      const mod = PLAYER_CLASSES[p.playerClass].initiativeMod;
      turnEntries.push({
        id: p.id,
        kind: 'player',
        name: p.name,
        initiativeRoll: d20,
        initiative: d20 + mod,
      });
    }

    for (const enemy of enemies) {
      const d20 = rollD20();
      turnEntries.push({
        id: enemy.id,
        kind: 'enemy',
        name: enemy.name,
        initiativeRoll: d20,
        initiative: d20 + enemy.initiativeMod,
      });
    }

    turnEntries.sort((a, b) => b.initiative - a.initiative || b.initiativeRoll - a.initiativeRoll);

    const potionsLeftByPlayer: Record<string, number> = {};
    const specialUsedByPlayer: Record<string, boolean> = {};
    for (const p of room.players) {
      potionsLeftByPlayer[p.id] = 2;
      specialUsedByPlayer[p.id] = false;
    }

    const initSummary = turnEntries
      .map((t) => `${t.name} (${t.initiative})`)
      .join(', ');

    room.combat = {
      id: crypto.randomUUID(),
      mode: 'pve',
      isBoss,
      isBlueCreature,
      round: 1,
      enemies,
      turnOrder: turnEntries,
      turnIndex: 0,
      defendingIds: [],
      potionsLeftByPlayer,
      specialUsedByPlayer,
      unlockedSpecialsUsedByPlayer: {},
      lastRoll: null,
      log: [
        isBoss
          ? `¡JEFE DEL REINO! Aparece ${enemies[0].name}. Iniciativa: ${initSummary}.`
          : `¡Combate iniciado! Orden de iniciativa: ${initSummary}.`,
      ],
    };
    room.phase = 'combat';
    this.scheduleSave();
    return room;
  }

  public startPvpDuel(socketId: string): { room: InternalRoom } | { error: string } {
    const binding = this.socketToBinding.get(socketId);
    if (!binding) return { error: 'No estás en ninguna sala.' };

    const room = this.rooms.get(binding.roomCode);
    if (!room) return { error: 'Sala no encontrada.' };

    if (room.phase !== 'playing' || room.combat || room.activeInternalEvent) {
      return { error: 'No se puede iniciar un duelo PvP ahora mismo.' };
    }

    if (room.players.length < 2) {
      return { error: 'Se necesitan al menos 2 jugadores en la sala para un duelo PvP.' };
    }

    const turnEntries: CombatTurnEntry[] = [];
    const potionsLeftByPlayer: Record<string, number> = {};
    const specialUsedByPlayer: Record<string, boolean> = {};

    for (const p of room.players) {
      p.hp = p.maxHp;
      potionsLeftByPlayer[p.id] = 2;
      specialUsedByPlayer[p.id] = false;
      const d20 = rollD20();
      const mod = PLAYER_CLASSES[p.playerClass].initiativeMod;
      turnEntries.push({
        id: p.id,
        kind: 'player',
        name: p.name,
        initiativeRoll: d20,
        initiative: d20 + mod,
      });
    }

    turnEntries.sort((a, b) => b.initiative - a.initiative || b.initiativeRoll - a.initiativeRoll);

    const initSummary = turnEntries
      .map((t) => `${t.name} (${t.initiative})`)
      .join(', ');

    room.combat = {
      id: crypto.randomUUID(),
      mode: 'pvp',
      round: 1,
      enemies: [],
      turnOrder: turnEntries,
      turnIndex: 0,
      defendingIds: [],
      potionsLeftByPlayer,
      specialUsedByPlayer,
      unlockedSpecialsUsedByPlayer: {},
      lastRoll: null,
      log: [`¡Duelo PvP iniciado! Orden de iniciativa: ${initSummary}.`],
    };
    room.phase = 'combat';
    this.scheduleSave();
    return { room };
  }

  public isEnemyTurnActive(roomCode: string): boolean {
    const room = this.rooms.get(roomCode);
    if (!room || room.phase !== 'combat' || !room.combat) return false;
    const entry = room.combat.turnOrder[room.combat.turnIndex];
    return entry?.kind === 'enemy';
  }

  private isCombatantAlive(room: InternalRoom, entry: CombatTurnEntry): boolean {
    if (entry.kind === 'player') {
      const p = room.players.find((pl) => pl.id === entry.id);
      return Boolean(p && p.hp > 0);
    }
    const e = room.combat?.enemies.find((en) => en.id === entry.id);
    return Boolean(e && e.hp > 0);
  }

  private advanceTurnIndex(room: InternalRoom): void {
    const combat = room.combat;
    if (!combat || combat.turnOrder.length === 0) return;

    const total = combat.turnOrder.length;
    for (let step = 1; step <= total; step++) {
      const nextIdx = (combat.turnIndex + step) % total;
      if (combat.turnIndex + step >= total) {
        combat.round += 1;
      }
      const candidate = combat.turnOrder[nextIdx];
      if (this.isCombatantAlive(room, candidate)) {
        combat.turnIndex = nextIdx;
        return;
      }
    }
  }

  public performCombatAction(
    socketId: string,
    action:
      | 'attack'
      | 'luck'
      | 'special'
      | 'skill_safe'
      | 'skill_shield'
      | 'skill_pierce'
      | 'defend'
      | 'potion'
      | 'bomb',
    targetId?: string,
    qteScore = 0
  ): CombatStepOutcome | { error: string } {
    const qte = Math.max(0, Math.min(3, Math.floor(Number(qteScore) || 0)));
    const qteBonusDmg = qte * 3;
    const binding = this.socketToBinding.get(socketId);
    if (!binding) return { error: 'No estás en ninguna sala.' };

    const room = this.rooms.get(binding.roomCode);
    if (!room || room.phase !== 'combat' || !room.combat) {
      return { error: 'No hay un combate activo.' };
    }

    const combat = room.combat;
    const activeTurn = combat.turnOrder[combat.turnIndex];
    if (!activeTurn || activeTurn.kind !== 'player' || activeTurn.id !== binding.playerId) {
      return { error: 'Aún no es tu turno.' };
    }

    const player = room.players.find((p) => p.id === binding.playerId);
    if (!player || player.hp <= 0) {
      return { error: 'Tu personaje no puede actuar ahora.' };
    }

    // Clear previous defending stance when player's new turn begins
    combat.defendingIds = combat.defendingIds.filter((id) => id !== player.id);

    // Kingdom modifier: Valderroble healing breeze
    if (room.regionId === 'valderroble' && player.hp < player.maxHp) {
      player.hp = Math.min(player.maxHp, player.hp + 1);
    }

    // Tick player status effects (burn/poison) at start of turn
    combat.playerStatuses = combat.playerStatuses ?? {};
    const myStatuses = combat.playerStatuses[player.id] ?? [];
    if (myStatuses.length > 0) {
      let dotTotal = 0;
      const nextStatuses: CombatStatus[] = [];
      for (const st of myStatuses) {
        if (st.kind === 'burn') dotTotal += 3;
        else if (st.kind === 'poison') dotTotal += 2;
        if (st.turns - 1 > 0) nextStatuses.push({ ...st, turns: st.turns - 1 });
      }
      combat.playerStatuses[player.id] = nextStatuses;
      if (dotTotal > 0) {
        player.hp = Math.max(1, player.hp - dotTotal);
        combat.log = [...combat.log, `${player.name} sufre ${dotTotal} de daño por estado.`].slice(-20);
      }
    }

    const resolveTarget = (): { id: string; name: string; ac: number; applyDamage: (dmg: number) => void } | { error: string } => {
      if (combat.mode === 'pvp') {
        const livingRivals = room.players.filter((p) => p.id !== player.id && p.hp > 0);
        const target = livingRivals.find((p) => p.id === targetId) ?? livingRivals[0];
        if (!target) return { error: 'No quedan rivales en pie.' };
        const isDefending = combat.defendingIds.includes(target.id);
        return {
          id: target.id,
          name: target.name,
          ac: target.ac + (isDefending ? 2 : 0),
          applyDamage: (dmg: number) => {
            target.hp = Math.max(0, target.hp - dmg);
          },
        };
      }

      const livingEnemies = combat.enemies.filter((e) => e.hp > 0);
      const target = livingEnemies.find((e) => e.id === targetId) ?? livingEnemies[0];
      if (!target) return { error: 'No quedan enemigos vivos.' };
      return {
        id: target.id,
        name: target.name,
        ac: target.ac,
        applyDamage: (dmg: number) => {
          target.hp = Math.max(0, target.hp - dmg);
        },
      };
    };

    let roll: DiceRollBreakdown;

    if (action === 'attack') {
      const target = resolveTarget();
      if ('error' in target) return target;

      const d20 = rollD20();
      const attackTotal = d20 + player.attackMod;
      const critical = d20 === 20;
      const fumble = d20 === 1;
      const hit = critical || (!fumble && attackTotal >= target.ac);

      if (hit) {
        const dmg = rollDiceExpression(player.damageDice, critical);
        target.applyDamage(dmg.total);
        const headline = critical
          ? `¡Crítico devastador! ${dmg.total} de daño`
          : `¡Golpe certero! ${dmg.total} de daño`;
        roll = {
          actorId: player.id,
          actorName: player.name,
          actorKind: 'player',
          targetId: target.id,
          targetName: target.name,
          actionType: 'attack',
          headline,
          d20,
          attackMod: player.attackMod,
          attackTotal,
          targetAc: target.ac,
          hit: true,
          critical,
          fumble: false,
          damageDice: player.damageDice,
          damageRolls: dmg.rolls,
          damageMod: dmg.modifier,
          damageTotal: dmg.total,
          summary: `${headline} — ${player.name} golpea a ${target.name}.`,
        };
      } else if (!fumble) {
        // Consistent grazing damage on non-fumble misses so combat never stalls on bad RNG
        const grazeDmg = Math.max(2, Math.floor(player.attackMod / 2) + 1);
        target.applyDamage(grazeDmg);
        const headline = `¡Roce! ${grazeDmg} de daño`;
        roll = {
          actorId: player.id,
          actorName: player.name,
          actorKind: 'player',
          targetId: target.id,
          targetName: target.name,
          actionType: 'attack',
          headline,
          d20,
          attackMod: player.attackMod,
          attackTotal,
          targetAc: target.ac,
          hit: true,
          critical: false,
          fumble: false,
          damageDice: 'roce',
          damageRolls: [grazeDmg],
          damageMod: 0,
          damageTotal: grazeDmg,
          summary: `¡Roce! ${target.name} intentó esquivar, pero ${player.name} le rasguña con ${grazeDmg} de daño.`,
        };
      } else {
        const missChoices = [
          {
            headline: '¡Pifia legendaria!',
            summary: `¡Pifia legendaria! ${player.name} tropezó con su propia sombra y saludó al suelo.`,
          },
          {
            headline: '¡Desastre total!',
            summary: `¡Desastre total! ${player.name} cerró los ojos para concentrarse y atacó a un árbol.`,
          },
          {
            headline: '¡Ridículo absoluto!',
            summary: `¡Ridículo absoluto! A ${player.name} se le resbaló el arma y le pidió perdón a ${target.name}.`,
          },
        ];
        const chosen = missChoices[Math.floor(Math.random() * missChoices.length)];
        roll = {
          actorId: player.id,
          actorName: player.name,
          actorKind: 'player',
          targetId: target.id,
          targetName: target.name,
          actionType: 'attack',
          headline: chosen.headline,
          d20,
          attackMod: player.attackMod,
          attackTotal,
          targetAc: target.ac,
          hit: false,
          critical: false,
          fumble: true,
          summary: chosen.summary,
        };
      }
    } else if (action === 'luck') {
      const target = resolveTarget();
      if ('error' in target) return target;

      const d20 = rollD20();
      const luckTotal = d20 + (player.luckBonus ?? 0);
      if (luckTotal >= 11) {
        const isNat20 = d20 === 20;
        const baseDmg = rollDiceExpression(player.damageDice, true);
        let rolls = [...baseDmg.rolls];
        let totalDmg = baseDmg.total;
        if (isNat20) {
          const extra = rollDiceExpression(player.damageDice, false);
          rolls = [...rolls, ...extra.rolls];
          totalDmg += extra.rolls.reduce((acc, n) => acc + n, 0);
          player.gold = (player.gold ?? 0) + 5;
        }
        target.applyDamage(totalDmg);
        const headline = isNat20
          ? `¡Suerte legendaria! ${totalDmg} de daño (+5 monedas)`
          : `¡Golpe de suerte! ${totalDmg} de daño`;
        roll = {
          actorId: player.id,
          actorName: player.name,
          actorKind: 'player',
          targetId: target.id,
          targetName: target.name,
          actionType: 'luck',
          luckOutcome: 'jackpot',
          headline,
          d20,
          targetAc: target.ac,
          hit: true,
          critical: isNat20,
          fumble: false,
          damageDice: player.damageDice,
          damageRolls: rolls,
          damageMod: baseDmg.modifier,
          damageTotal: totalDmg,
          summary: isNat20
            ? `¡Suerte legendaria! ${player.name} arrasa a ${target.name} con ${totalDmg} de daño y gana +5 monedas.`
            : `¡Golpe de suerte! ${player.name} acierta de lleno a ${target.name} con ${totalDmg} de daño.`,
        };
      } else {
        const selfDmg = rollDiceExpression('1d4');
        player.hp =
          combat.mode === 'pvp'
            ? Math.max(0, player.hp - selfDmg.total)
            : Math.max(1, player.hp - selfDmg.total);
        const headline = `¡Mala suerte! ${selfDmg.total} de daño propio`;
        roll = {
          actorId: player.id,
          actorName: player.name,
          actorKind: 'player',
          targetId: target.id,
          targetName: target.name,
          actionType: 'luck',
          luckOutcome: 'backfire',
          headline,
          d20,
          targetAc: target.ac,
          hit: false,
          critical: false,
          fumble: true,
          damageDice: '1d4',
          damageRolls: selfDmg.rolls,
          damageMod: 0,
          damageTotal: selfDmg.total,
          summary: `¡Mala suerte! ${player.name} tropieza y recibe ${selfDmg.total} de daño.`,
        };
      }
    } else if (action === 'special') {
      combat.specialUsedByPlayer = combat.specialUsedByPlayer ?? {};
      if (combat.specialUsedByPlayer[player.id]) {
        return { error: 'Ya usaste tu habilidad especial en este combate.' };
      }
      combat.specialUsedByPlayer[player.id] = true;

      if (player.playerClass === 'Fighter') {
        const dmg = rollDiceExpression('1d8+4');
        const total = dmg.total + qteBonusDmg;
        if (combat.mode === 'pvp') {
          const target = resolveTarget();
          if ('error' in target) return target;
          target.applyDamage(total);
          const headline = `¡Tajo Sísmico! ${total} de daño`;
          roll = {
            actorId: player.id,
            actorName: player.name,
            actorKind: 'player',
            targetId: target.id,
            targetName: target.name,
            actionType: 'special',
            headline,
            hit: true,
            damageDice: '1d8+4',
            damageRolls: dmg.rolls,
            damageMod: dmg.modifier,
            damageTotal: total,
            summary: `${headline} — ${player.name} sacude el suelo bajo ${target.name}.`,
          };
        } else {
          const living = combat.enemies.filter((e) => e.hp > 0);
          for (const e of living) {
            e.hp = Math.max(0, e.hp - total);
          }
          const headline = `¡Tajo Sísmico! ${total} a todos`;
          roll = {
            actorId: player.id,
            actorName: player.name,
            actorKind: 'player',
            targetName: `${living.length} enemigo(s)`,
            actionType: 'special',
            headline,
            hit: true,
            damageDice: '1d8+4',
            damageRolls: dmg.rolls,
            damageMod: dmg.modifier,
            damageTotal: total,
            summary: `${headline} — ${player.name} golpea la tierra e impacta a todos los enemigos.`,
          };
        }
      } else if (player.playerClass === 'Wizard') {
        const target = resolveTarget();
        if ('error' in target) return target;
        const dmg = rollDiceExpression('2d8+3');
        const total = dmg.total + qteBonusDmg;
        target.applyDamage(total);
        const headline = `¡Bola de Fuego! ${total} de daño`;
        roll = {
          actorId: player.id,
          actorName: player.name,
          actorKind: 'player',
          targetId: target.id,
          targetName: target.name,
          actionType: 'special',
          headline,
          hit: true,
          critical: true,
          damageDice: '2d8+3',
          damageRolls: dmg.rolls,
          damageMod: dmg.modifier,
          damageTotal: total,
          summary: `${headline} — ${player.name} incinera a ${target.name} sin piedad.`,
        };
      } else {
        const target = resolveTarget();
        if ('error' in target) return target;
        const d20 = rollD20();
        const isCrit = d20 >= 15;
        const hit = isCrit || d20 + player.attackMod >= target.ac;
        if (hit) {
          const dmg = rollDiceExpression('2d6+5', isCrit);
          const total = dmg.total + qteBonusDmg;
          target.applyDamage(total);
          const headline = isCrit
            ? `¡Golpe Furtivo Letal! ${total} de daño`
            : `¡Golpe Furtivo! ${total} de daño`;
          roll = {
            actorId: player.id,
            actorName: player.name,
            actorKind: 'player',
            targetId: target.id,
            targetName: target.name,
            actionType: 'special',
            headline,
            d20,
            hit: true,
            critical: isCrit,
            damageDice: '2d6+5',
            damageRolls: dmg.rolls,
            damageMod: dmg.modifier,
            damageTotal: total,
            summary: `${headline} — ${player.name} aparece por la espalda de ${target.name}.`,
          };
        } else {
          const headline = '¡Esquivado por los pelos!';
          roll = {
            actorId: player.id,
            actorName: player.name,
            actorKind: 'player',
            targetId: target.id,
            targetName: target.name,
            actionType: 'special',
            headline,
            d20,
            hit: false,
            summary: `${headline} — ${target.name} detectó la sombra de ${player.name}.`,
          };
        }
      }
    } else if (action === 'skill_safe' || action === 'skill_shield' || action === 'skill_pierce') {
      const node = SKILL_TREE.find((n) => n.combatAction === action);
      if (!node || !(player.unlockedSkills ?? []).includes(node.id)) {
        return { error: 'No has desbloqueado esa habilidad en el Árbol de Habilidades.' };
      }
      combat.unlockedSpecialsUsedByPlayer = combat.unlockedSpecialsUsedByPlayer ?? {};
      const usedList = combat.unlockedSpecialsUsedByPlayer[player.id] ?? [];
      if (usedList.includes(node.id)) {
        return { error: `Ya usaste "${node.name}" en este combate.` };
      }
      combat.unlockedSpecialsUsedByPlayer[player.id] = [...usedList, node.id];

      if (action === 'skill_safe') {
        const target = resolveTarget();
        if ('error' in target) return target;
        const fixedDmg = 10 + player.attackMod + qteBonusDmg;
        target.applyDamage(fixedDmg);
        const headline = `¡Golpe Seguro! ${fixedDmg} de daño`;
        roll = {
          actorId: player.id,
          actorName: player.name,
          actorKind: 'player',
          targetId: target.id,
          targetName: target.name,
          actionType: 'skill_safe',
          headline,
          hit: true,
          damageTotal: fixedDmg,
          summary: `${headline} — ${player.name} impacta con precisión total a ${target.name}.`,
        };
      } else if (action === 'skill_shield') {
        const healVal = 8 + qte * 2;
        if (combat.mode === 'pvp') {
          player.hp = Math.min(player.maxHp, player.hp + healVal);
          combat.defendingIds.push(player.id);
        } else {
          for (const ally of room.players) {
            if (ally.hp > 0) {
              ally.hp = Math.min(ally.maxHp, ally.hp + healVal);
              if (!combat.defendingIds.includes(ally.id)) {
                combat.defendingIds.push(ally.id);
              }
            }
          }
        }
        const headline = `¡Escudo de Grupo! +${healVal} Vida y +2 Defensa`;
        roll = {
          actorId: player.id,
          actorName: player.name,
          actorKind: 'player',
          actionType: 'skill_shield',
          headline,
          hit: true,
          healAmount: healVal,
          summary: `${headline} — ${player.name} protege y sana al grupo.`,
        };
      } else {
        const target = resolveTarget();
        if ('error' in target) return target;
        const fixedDmg = 14 + Math.floor(player.attackMod / 2) + qteBonusDmg;
        target.applyDamage(fixedDmg);
        const headline = `¡Descarga Certera! ${fixedDmg} de daño`;
        roll = {
          actorId: player.id,
          actorName: player.name,
          actorKind: 'player',
          targetId: target.id,
          targetName: target.name,
          actionType: 'skill_pierce',
          headline,
          hit: true,
          critical: true,
          damageTotal: fixedDmg,
          summary: `${headline} — ${player.name} atraviesa la defensa de ${target.name}.`,
        };
      }
    } else if (action === 'bomb') {
      const target = resolveTarget();
      if ('error' in target) return target;
      const owned = player.inventory?.bomb ?? 0;
      if (owned <= 0) {
        return { error: 'No tienes bombas arcanas. Cómpralas en la tienda.' };
      }
      player.inventory.bomb = owned - 1;
      if (player.inventory.bomb <= 0) delete player.inventory.bomb;
      const dmg = rollDiceExpression('2d6+4');
      target.applyDamage(dmg.total);
      const headline = `¡Explosión arcana! ${dmg.total} de daño`;
      roll = {
        actorId: player.id,
        actorName: player.name,
        actorKind: 'player',
        targetId: target.id,
        targetName: target.name,
        actionType: 'bomb',
        headline,
        hit: true,
        critical: false,
        fumble: false,
        damageDice: '2d6+4',
        damageRolls: dmg.rolls,
        damageMod: dmg.modifier,
        damageTotal: dmg.total,
        summary: `¡Explosión arcana! ${player.name} lanza una bomba a ${target.name} e inflige ${dmg.total} de daño.`,
      };
    } else if (action === 'defend') {
      combat.defendingIds.push(player.id);
      roll = {
        actorId: player.id,
        actorName: player.name,
        actorKind: 'player',
        actionType: 'defend',
        headline: '¡Guardia alta! (+2 CA)',
        summary: `${player.name} adopta postura defensiva (+2 CA hasta su próximo turno).`,
      };
    } else {
      const freeLeft = combat.potionsLeftByPlayer[player.id] ?? 0;
      const bagLeft = player.inventory?.potion ?? 0;
      if (freeLeft <= 0 && bagLeft <= 0) {
        return { error: 'No te quedan pociones.' };
      }
      if (freeLeft > 0) {
        combat.potionsLeftByPlayer[player.id] = freeLeft - 1;
      } else {
        player.inventory.potion = bagLeft - 1;
        if (player.inventory.potion <= 0) delete player.inventory.potion;
      }
      const heal = rollDiceExpression('1d6+4');
      const before = player.hp;
      player.hp = Math.min(player.maxHp, player.hp + heal.total);
      const healed = player.hp - before;
      roll = {
        actorId: player.id,
        actorName: player.name,
        actorKind: 'player',
        actionType: 'potion',
        headline: `¡Curación! +${healed} PV`,
        damageDice: '1d6+4',
        damageRolls: heal.rolls,
        damageMod: heal.modifier,
        healAmount: healed,
        summary: `¡Curación! ${player.name} bebe una poción y recupera ${healed} PV.`,
      };
    }

    // Apply Co-op Combos & Statuses on hit
    if (combat.mode === 'pve' && roll.hit && roll.targetId) {
      const hitEnemy = combat.enemies.find((e) => e.id === roll.targetId);
      if (hitEnemy && hitEnemy.hp > 0) {
        hitEnemy.statuses = hitEnemy.statuses ?? [];
        const hasMarkOrBurn = hitEnemy.statuses.some(
          (s) => s.kind === 'marked' || s.kind === 'burn'
        );
        if (hasMarkOrBurn && (roll.actionType === 'attack' || roll.actionType === 'special')) {
          const comboBonus = player.playerClass === 'Rogue' ? 6 : 3;
          hitEnemy.hp = Math.max(0, hitEnemy.hp - comboBonus);
          roll.damageTotal = (roll.damageTotal ?? 0) + comboBonus;
          roll.headline = `${roll.headline ?? ''} (+${comboBonus} Combo!)`;
          roll.summary = `${roll.summary} ¡Combo cooperativo (+${comboBonus} daño)!`;
        }
        if (
          player.playerClass === 'Fighter' &&
          (roll.actionType === 'special' || roll.actionType === 'skill_safe')
        ) {
          hitEnemy.statuses = [
            ...hitEnemy.statuses.filter((s) => s.kind !== 'marked'),
            { kind: 'marked', turns: 2 },
          ];
        } else if (
          player.playerClass === 'Wizard' &&
          (roll.actionType === 'special' || roll.actionType === 'skill_pierce')
        ) {
          hitEnemy.statuses = [
            ...hitEnemy.statuses.filter((s) => s.kind !== 'burn'),
            { kind: 'burn', turns: 2 },
          ];
        }
      }
    }

    // Check Boss Phase 2 transition
    if (combat.mode === 'pve') {
      for (const e of combat.enemies) {
        if (e.isBoss && e.hp > 0 && e.hp <= e.maxHp * 0.5 && e.bossPhase !== 2) {
          e.bossPhase = 2;
          e.attackMod += 2;
          e.ac += 2;
          combat.log = [
            ...combat.log,
            `¡FASE 2! ${e.name} entra en furia (+2 Ataque, +2 Defensa y ataques en área).`,
          ].slice(-20);
        }
      }
    }

    combat.lastRoll = roll;
    combat.log = [...combat.log, roll.summary].slice(-20);

    if (combat.mode === 'pvp') {
      const livingPlayers = room.players.filter((p) => p.hp > 0);
      if (livingPlayers.length <= 1) {
        return {
          type: 'ended',
          outcome: this.finishPvpCombat(room, livingPlayers[0] ?? null),
        };
      }
    } else {
      const anyEnemyAlive = combat.enemies.some((e) => e.hp > 0);
      if (!anyEnemyAlive) {
        return { type: 'ended', outcome: this.finishCombat(room, true) };
      }
    }

    this.advanceTurnIndex(room);
    this.scheduleSave();
    return { type: 'updated', room, roll };
  }

  public skipCombatTurn(socketId: string): CombatStepOutcome | { error: string } {
    const binding = this.socketToBinding.get(socketId);
    if (!binding) return { error: 'No estás en ninguna sala.' };

    const room = this.rooms.get(binding.roomCode);
    if (!room || room.phase !== 'combat' || !room.combat) {
      return { error: 'No hay un combate activo.' };
    }

    if (room.hostId !== binding.playerId) {
      return { error: 'Solo el líder del grupo puede saltar un turno.' };
    }

    const combat = room.combat;
    const activeTurn = combat.turnOrder[combat.turnIndex];
    if (!activeTurn || activeTurn.kind !== 'player') {
      return { error: 'Solo se puede saltar el turno de un jugador.' };
    }

    const roll: DiceRollBreakdown = {
      actorId: activeTurn.id,
      actorName: activeTurn.name,
      actorKind: 'player',
      actionType: 'skip',
      summary: `Se saltó el turno de ${activeTurn.name}.`,
    };
    combat.lastRoll = roll;
    combat.log = [...combat.log, roll.summary].slice(-20);
    this.advanceTurnIndex(room);
    this.scheduleSave();
    return { type: 'updated', room, roll };
  }

  public prepareEnemyTelegraph(roomCode: string): {
    enemyName: string;
    targetPlayerId: string;
    targetPlayerName: string;
  } | null {
    const room = this.rooms.get(roomCode);
    if (!room || room.phase !== 'combat' || !room.combat) return null;

    const activeTurn = room.combat.turnOrder[room.combat.turnIndex];
    if (!activeTurn || activeTurn.kind !== 'enemy') return null;

    const enemy = room.combat.enemies.find((e) => e.id === activeTurn.id && e.hp > 0);
    const livingPlayers = room.players.filter((p) => p.hp > 0);
    if (!enemy || livingPlayers.length === 0) return null;

    const target = livingPlayers[Math.floor(Math.random() * livingPlayers.length)];
    this.pendingEnemyTarget.set(roomCode, { targetId: target.id, dodgeReduction: 0 });
    return {
      enemyName: enemy.name,
      targetPlayerId: target.id,
      targetPlayerName: target.name,
    };
  }

  public markPlayerDodged(socketId: string, quality: 'perfect' | 'medium' | 'bad'): boolean {
    const binding = this.socketToBinding.get(socketId);
    if (!binding) return false;
    const pending = this.pendingEnemyTarget.get(binding.roomCode);
    if (!pending || pending.targetId !== binding.playerId) return false;
    pending.dodgeReduction = quality === 'perfect' ? 30 : quality === 'medium' ? 15 : 0;
    return true;
  }

  public completeBossArena(
    socketId: string,
    victory: boolean,
    regionId: string
  ): { outcome: CombatEndedPayload } | { error: string } {
    const binding = this.socketToBinding.get(socketId);
    if (!binding) return { error: 'No estás en ninguna sala.' };

    const room = this.rooms.get(binding.roomCode);
    if (!room || room.phase !== 'playing') {
      return { error: 'No se pudo completar el combate de Jefe.' };
    }

    const avgLevel =
      room.players.reduce((sum, p) => sum + (p.level ?? 1), 0) /
      Math.max(1, room.players.length);
    const boss = spawnBossForRegion(regionId || room.regionId, room.players.length, Math.round(avgLevel));

    if (!victory) {
      const map = getRegion(room.regionId);
      room.players.forEach((p, idx) => {
        const pos = findWalkableNearby(map, map.spawn.x, map.spawn.y, idx);
        p.x = pos.x;
        p.y = pos.y;
        p.hp = Math.max(1, Math.ceil(p.maxHp * 0.5));
      });
      this.scheduleSave();
      return {
        outcome: {
          victory: false,
          xpGained: 0,
          goldGained: 0,
          summary: `${boss.name} os derrotó en la Arena. Despertáis con 50% de Vida.`,
          room: this.toPublicRoom(room),
        },
      };
    }

    for (const p of room.players) {
      this.grantXp(p, boss.xpReward);
      p.gold = (p.gold ?? 0) + boss.goldReward;
      p.hp = Math.max(1, p.hp);
    }

    const BOSS_KEY_BY_REGION: Record<string, { id: string; label: string }> = {
      valderroble: { id: 'key_valderroble', label: 'Llave del Roble' },
      solceniza: { id: 'key_solceniza', label: 'Llave de Ceniza' },
      ventisca: { id: 'key_ventisca', label: 'Llave de Escarcha' },
      'plano-astral': { id: 'key_astral', label: 'Llave Astral' },
      'camara-final': { id: 'key_final_boss', label: 'Llave del Emperador' },
    };
    const keyDef = BOSS_KEY_BY_REGION[room.regionId];
    let keyNotice = '';
    if (keyDef && !(room.bossKeys ?? []).includes(keyDef.id)) {
      room.bossKeys = [...(room.bossKeys ?? []), keyDef.id];
      keyNotice = ` ¡Conseguisteis la ${keyDef.label}!`;
    }

    this.advanceQuest(room, 'combat');
    this.scheduleSave();

    return {
      outcome: {
        victory: true,
        xpGained: boss.xpReward,
        goldGained: boss.goldReward,
        summary: `¡Victoria en Tiempo Real! Derrotasteis a ${boss.name} (+${boss.xpReward} EXP, +${boss.goldReward} monedas).${keyNotice}`,
        room: this.toPublicRoom(room),
      },
    };
  }

  public executeEnemyTurn(roomCode: string): CombatStepOutcome | null {
    const room = this.rooms.get(roomCode);
    if (!room || room.phase !== 'combat' || !room.combat) return null;

    const combat = room.combat;
    const activeTurn = combat.turnOrder[combat.turnIndex];
    if (!activeTurn || activeTurn.kind !== 'enemy') return null;

    const enemy = combat.enemies.find((e) => e.id === activeTurn.id && e.hp > 0);
    if (!enemy) {
      this.advanceTurnIndex(room);
      this.scheduleSave();
      return null;
    }

    // Tick enemy status effects (burn/poison) at start of enemy turn
    if (enemy.statuses && enemy.statuses.length > 0) {
      let dot = 0;
      const next: CombatStatus[] = [];
      for (const st of enemy.statuses) {
        if (st.kind === 'burn') dot += 3;
        else if (st.kind === 'poison') dot += 2;
        if (st.turns - 1 > 0) next.push({ ...st, turns: st.turns - 1 });
      }
      enemy.statuses = next;
      if (dot > 0) {
        enemy.hp = Math.max(0, enemy.hp - dot);
        combat.log = [...combat.log, `${enemy.name} sufre ${dot} de daño por quemadura/veneno.`].slice(-20);
        if (enemy.hp <= 0) {
          const anyAlive = combat.enemies.some((e) => e.hp > 0);
          if (!anyAlive) {
            return { type: 'ended', outcome: this.finishCombat(room, true) };
          }
          this.advanceTurnIndex(room);
          this.scheduleSave();
          return {
            type: 'updated',
            room,
            roll: {
              actorId: enemy.id,
              actorName: enemy.name,
              actorKind: 'enemy',
              actionType: 'skip',
              headline: `¡Derrotado por estado!`,
              summary: `${enemy.name} cae por quemadura/veneno.`,
            },
          };
        }
      }
    }

    const livingPlayers = room.players.filter((p) => p.hp > 0);
    if (livingPlayers.length === 0) {
      return { type: 'ended', outcome: this.finishCombat(room, false) };
    }

    // Boss Phase 2 Area Attack (35% chance)
    if (enemy.isBoss && enemy.bossPhase === 2 && Math.random() < 0.35) {
      const aoeDmg = rollDiceExpression('1d6+3');
      for (const lp of livingPlayers) {
        lp.hp = Math.max(0, lp.hp - aoeDmg.total);
        combat.playerStatuses = combat.playerStatuses ?? {};
        const cur = combat.playerStatuses[lp.id] ?? [];
        combat.playerStatuses[lp.id] = [
          ...cur.filter((s) => s.kind !== 'burn'),
          { kind: 'burn', turns: 2 },
        ];
      }
      const roll: DiceRollBreakdown = {
        actorId: enemy.id,
        actorName: enemy.name,
        actorKind: 'enemy',
        targetName: 'todo el grupo',
        actionType: 'attack',
        headline: `¡Furia del Jefe! ${aoeDmg.total} a todos + Quemadura`,
        hit: true,
        critical: true,
        damageTotal: aoeDmg.total,
        summary: `¡Furia del Jefe! ${enemy.name} golpea a todo el grupo (${aoeDmg.total} de daño y Quemadura).`,
      };
      combat.lastRoll = roll;
      combat.log = [...combat.log, roll.summary].slice(-20);
      if (!room.players.some((p) => p.hp > 0)) {
        return { type: 'ended', outcome: this.finishCombat(room, false) };
      }
      this.advanceTurnIndex(room);
      this.scheduleSave();
      return { type: 'updated', room, roll };
    }

    const pending = this.pendingEnemyTarget.get(roomCode);
    this.pendingEnemyTarget.delete(roomCode);

    const target =
      (pending ? livingPlayers.find((p) => p.id === pending.targetId) : undefined) ??
      livingPlayers[Math.floor(Math.random() * livingPlayers.length)];
    const dodgeReduction = pending && pending.targetId === target.id ? pending.dodgeReduction : 0;

    const isDefending = combat.defendingIds.includes(target.id);
    const frostBonus = room.regionId === 'ventisca' ? 1 : 0;
    const targetAc = target.ac + (isDefending ? 2 : 0) + frostBonus;

    const d20 = rollD20();
    const attackTotal = d20 + enemy.attackMod;
    const critical = d20 === 20;
    const fumble = d20 === 1;
    const hit = critical || (!fumble && attackTotal >= targetAc);

    let roll: DiceRollBreakdown;
    if (hit) {
      const dmg = rollDiceExpression(enemy.damageDice, critical);
      const finalDmg =
        dodgeReduction > 0
          ? Math.max(1, Math.round(dmg.total * (1 - dodgeReduction / 100)))
          : dmg.total;
      target.hp = Math.max(0, target.hp - finalDmg);
      let statusNote = '';
      if (Math.random() < 0.25) {
        const applied: StatusKind =
          room.regionId === 'pantano-bruma'
            ? 'poison'
            : room.regionId === 'solceniza'
              ? 'burn'
              : Math.random() < 0.5
                ? 'poison'
                : 'burn';
        combat.playerStatuses = combat.playerStatuses ?? {};
        const cur = combat.playerStatuses[target.id] ?? [];
        combat.playerStatuses[target.id] = [
          ...cur.filter((s) => s.kind !== applied),
          { kind: applied, turns: 2 },
        ];
        statusNote = applied === 'poison' ? ' (+Veneno)' : ' (+Quemadura)';
      }
      const dodgeNote =
        dodgeReduction === 30
          ? ' (Esquiva perfecta -30%)'
          : dodgeReduction === 15
            ? ' (Esquiva media -15%)'
            : '';
      const headline = critical
        ? `¡Golpe crítico! ${finalDmg} de daño${dodgeNote}${statusNote}`
        : `¡Impacto enemigo! ${finalDmg} de daño${dodgeNote}${statusNote}`;
      roll = {
        actorId: enemy.id,
        actorName: enemy.name,
        actorKind: 'enemy',
        targetId: target.id,
        targetName: target.name,
        actionType: 'attack',
        headline,
        d20,
        attackMod: enemy.attackMod,
        attackTotal,
        targetAc,
        hit: true,
        critical,
        fumble: false,
        damageDice: enemy.damageDice,
        damageRolls: dmg.rolls,
        damageMod: dmg.modifier,
        damageTotal: finalDmg,
        summary: `${headline} — ${enemy.name} hiere a ${target.name}.`,
      };
    } else {
      const enemyMisses = fumble
        ? [
            {
              headline: '¡Pifia enemiga!',
              summary: `¡Qué papelón! ${enemy.name} se tropezó solo y casi se noquea.`,
            },
            {
              headline: '¡Torpeza máxima!',
              summary: `¡Torpeza máxima! ${enemy.name} atacó con furia a una piedra pensando que era ${target.name}.`,
            },
          ]
        : [
            {
              headline: '¡Esquivado con estilo!',
              summary: `¡Esquivado! ${target.name} bostezó, dio un pasito al lado y ${enemy.name} golpeó la nada.`,
            },
            {
              headline: '¡Aire fresco!',
              summary: `¡Jajaja! ${enemy.name} se mareó dando vueltas y le pegó al viento.`,
            },
            {
              headline: '¡Ni lo tocó!',
              summary: `¡Fallo cómico! ${enemy.name} apuntó tan mal que asustó a una ardilla.`,
            },
          ];
      const chosen = enemyMisses[Math.floor(Math.random() * enemyMisses.length)];
      roll = {
        actorId: enemy.id,
        actorName: enemy.name,
        actorKind: 'enemy',
        targetId: target.id,
        targetName: target.name,
        actionType: 'attack',
        headline: chosen.headline,
        d20,
        attackMod: enemy.attackMod,
        attackTotal,
        targetAc,
        hit: false,
        critical: false,
        fumble,
        summary: chosen.summary,
      };
    }

    combat.lastRoll = roll;
    combat.log = [...combat.log, roll.summary].slice(-20);

    const anyPlayerAlive = room.players.some((p) => p.hp > 0);
    if (!anyPlayerAlive) {
      return { type: 'ended', outcome: this.finishCombat(room, false) };
    }

    this.advanceTurnIndex(room);
    this.scheduleSave();
    return { type: 'updated', room, roll };
  }

  private finishCombat(room: InternalRoom, victory: boolean): CombatEndedPayload {
    const combat = room.combat;
    let xpGained = 0;
    let goldGained = 0;
    let earnedBossKeyLabel: string | null = null;

    if (victory && combat) {
      for (const e of combat.enemies) {
        xpGained += e.xpReward;
        goldGained += e.goldReward;
      }
      for (const p of room.players) {
        this.grantXp(p, xpGained);
        p.gold = (p.gold ?? 0) + goldGained;
        if (p.hp <= 0) p.hp = 1;
      }
      if (combat.isBlueCreature) {
        room.bossKeys = room.bossKeys ?? [];
        if (!room.bossKeys.includes('key_blue_creature')) {
          room.bossKeys.push('key_blue_creature');
          earnedBossKeyLabel = '?';
        }
        room.blueCreature = spawnBlueCreature(room.regionId);
      } else if (combat.isBoss) {
        if (room.regionId === 'camara-final') {
          room.bossKeys = room.bossKeys ?? [];
          if (!room.bossKeys.includes('key_final_boss')) {
            room.bossKeys.push('key_final_boss');
            earnedBossKeyLabel = 'Llave del Emperador';
          }
        } else {
          const keyDef = BOSS_KEY_BY_REGION[room.regionId];
          if (keyDef) {
            room.bossKeys = room.bossKeys ?? [];
            if (!room.bossKeys.includes(keyDef.id)) {
              room.bossKeys.push(keyDef.id);
              earnedBossKeyLabel = keyDef.label;
            }
          }
        }
      }
      this.advanceQuest(room, 'combat');
    } else {
      const map = getRegion(room.regionId);
      room.players.forEach((p, idx) => {
        const pos = findWalkableNearby(map, map.spawn.x, map.spawn.y, idx);
        p.x = pos.x;
        p.y = pos.y;
        p.hp = Math.max(1, Math.ceil(p.maxHp * 0.5));
      });
    }

    room.combat = null;
    room.phase = 'playing';
    this.scheduleSave();

    const keyPart = earnedBossKeyLabel ? ` ¡Obtuvieron la ${earnedBossKeyLabel}!` : '';
    return {
      victory,
      xpGained,
      goldGained,
      summary: victory
        ? `¡Victoria! El grupo derrotó a los enemigos (+${xpGained} EXP, +${goldGained} Oro).${keyPart}`
        : 'El grupo cayó en combate y despertó a salvo en la entrada del reino con 50% de PV.',
      room: this.toPublicRoom(room),
    };
  }

  private finishPvpCombat(room: InternalRoom, winner: PlayerState | null): CombatEndedPayload {
    const xpGained = winner ? 30 : 0;
    const goldGained = winner ? 25 : 0;

    if (winner) {
      this.grantXp(winner, xpGained);
      winner.gold = (winner.gold ?? 0) + goldGained;
    }

    for (const p of room.players) {
      p.hp = p.maxHp;
    }

    room.combat = null;
    room.phase = 'playing';
    this.scheduleSave();

    return {
      victory: true,
      xpGained,
      goldGained,
      summary: winner
        ? `¡${winner.name} ganó el duelo PvP! (+${xpGained} EXP, +${goldGained} monedas). Todos recuperan sus PV.`
        : 'El duelo PvP terminó en empate. Todos recuperan sus PV.',
      room: this.toPublicRoom(room),
    };
  }

  public buyItem(
    socketId: string,
    itemId: string
  ): { room: InternalRoom; notice: string } | { error: string } {
    const binding = this.socketToBinding.get(socketId);
    if (!binding) return { error: 'No estás en ninguna sala.' };

    const room = this.rooms.get(binding.roomCode);
    if (!room) return { error: 'Sala no encontrada.' };
    if (room.phase !== 'playing') {
      return { error: 'Solo puedes comprar cuando no estás en combate o en un evento.' };
    }

    const player = room.players.find((p) => p.id === binding.playerId);
    if (!player) return { error: 'Personaje no encontrado.' };

    const item = SHOP_ITEMS.find((i) => i.id === itemId);
    if (!item) return { error: 'Objeto no encontrado en la tienda.' };

    if ((player.gold ?? 0) < item.price) {
      return { error: `No tienes suficientes monedas (cuesta ${item.price}).` };
    }

    player.inventory = player.inventory ?? {};
    player.shopUpgrades = player.shopUpgrades ?? {};

    if (item.category === 'consumable') {
      const owned = player.inventory[item.id] ?? 0;
      if (owned >= item.maxOwned) {
        return { error: `Ya alcanzaste el límite máximo de "${item.name}" (${item.maxOwned}).` };
      }
      if (owned === 0 && this.countInventorySlots(player) >= MAX_INVENTORY_SLOTS) {
        return { error: `Tu mochila (${MAX_INVENTORY_SLOTS}/${MAX_INVENTORY_SLOTS}) está llena. Usa o suelta algo antes.` };
      }
      player.gold -= item.price;
      player.inventory[item.id] = owned + 1;
    } else {
      const ownedUpgrades = player.shopUpgrades[item.id] ?? 0;
      if (ownedUpgrades >= item.maxOwned) {
        return { error: `Ya alcanzaste el límite máximo de "${item.name}" (${item.maxOwned}).` };
      }
      player.gold -= item.price;
      player.shopUpgrades[item.id] = ownedUpgrades + 1;
      if (item.id === 'weapon_upgrade') {
        player.attackMod += 2;
      } else if (item.id === 'armor_upgrade') {
        player.ac += 2;
      } else if (item.id === 'luck_charm') {
        player.luckBonus = (player.luckBonus ?? 0) + 2;
      }
    }

    this.scheduleSave();
    return {
      room,
      notice: `${player.name} compró ${item.name} por ${item.price} monedas.`,
    };
  }

  public useItem(
    socketId: string,
    itemId: string
  ): { room: InternalRoom; notice: string } | { error: string } {
    const binding = this.socketToBinding.get(socketId);
    if (!binding) return { error: 'No estás en ninguna sala.' };

    const room = this.rooms.get(binding.roomCode);
    if (!room || room.phase !== 'playing') {
      return { error: 'Solo puedes usar objetos fuera de combate desde aquí.' };
    }

    const player = room.players.find((p) => p.id === binding.playerId);
    if (!player) return { error: 'Personaje no encontrado.' };

    if (itemId === 'elixir') {
      const owned = player.inventory?.elixir ?? 0;
      if (owned <= 0) return { error: 'No tienes Elixir Dorado en tu mochila.' };
      player.inventory.elixir = owned - 1;
      if (player.inventory.elixir <= 0) delete player.inventory.elixir;
      player.hp = player.maxHp;
      this.grantXp(player, 30);
      this.scheduleSave();
      return {
        room,
        notice: `${player.name} bebió un Elixir Dorado: ¡Vida al máximo y +30 EXP!`,
      };
    }

    if (itemId !== 'potion') {
      return { error: 'Ese objeto se equipa o se usa en combate.' };
    }

    const owned = player.inventory?.potion ?? 0;
    if (owned <= 0) {
      return { error: 'No tienes pociones en tu mochila.' };
    }
    if (player.hp >= player.maxHp) {
      return { error: 'Ya tienes toda tu Vida al máximo.' };
    }

    player.inventory.potion = owned - 1;
    if (player.inventory.potion <= 0) delete player.inventory.potion;
    const heal = rollDiceExpression('1d6+4');
    const before = player.hp;
    player.hp = Math.min(player.maxHp, player.hp + heal.total);
    const healed = player.hp - before;

    this.scheduleSave();
    return {
      room,
      notice: `${player.name} usó una Poción de vida y recuperó ${healed} de Vida.`,
    };
  }

  private applyItemStats(player: PlayerState, itemId: string, sign: 1 | -1): void {
    const def = ITEMS_BY_ID[itemId];
    if (!def) return;
    if (def.attackBonus) player.attackMod += sign * def.attackBonus;
    if (def.defenseBonus) player.ac += sign * def.defenseBonus;
    if (def.luckBonus) player.luckBonus = Math.max(0, (player.luckBonus ?? 0) + sign * def.luckBonus);
    if (def.hpBonus) {
      player.maxHp = Math.max(1, player.maxHp + sign * def.hpBonus);
      player.hp = Math.min(player.maxHp, Math.max(1, player.hp + (sign > 0 ? def.hpBonus : 0)));
    }
  }

  public equipItem(
    socketId: string,
    itemId: string
  ): { room: InternalRoom; notice: string } | { error: string } {
    const binding = this.socketToBinding.get(socketId);
    if (!binding) return { error: 'No estás en ninguna sala.' };

    const room = this.rooms.get(binding.roomCode);
    if (!room || room.phase !== 'playing') {
      return { error: 'Solo puedes cambiar de equipo fuera de combate.' };
    }

    const player = room.players.find((p) => p.id === binding.playerId);
    if (!player) return { error: 'Personaje no encontrado.' };

    const def = ITEMS_BY_ID[itemId];
    if (!def || (def.kind !== 'weapon' && def.kind !== 'armor')) {
      return { error: 'Ese objeto no se puede equipar.' };
    }

    const owned = player.inventory?.[itemId] ?? 0;
    if (owned <= 0) return { error: 'No tienes ese objeto en tu mochila.' };

    // Remove 1 of new item from bag first, then return previously equipped item if any
    player.inventory[itemId] = owned - 1;
    if (player.inventory[itemId] <= 0) delete player.inventory[itemId];

    if (def.kind === 'weapon') {
      if (player.equippedWeaponId) {
        this.applyItemStats(player, player.equippedWeaponId, -1);
        this.addItemToInventory(player, player.equippedWeaponId);
      }
      player.equippedWeaponId = itemId;
    } else {
      if (player.equippedArmorId) {
        this.applyItemStats(player, player.equippedArmorId, -1);
        this.addItemToInventory(player, player.equippedArmorId);
      }
      player.equippedArmorId = itemId;
    }

    this.applyItemStats(player, itemId, 1);
    this.scheduleSave();
    return {
      room,
      notice: `${player.name} equipó ${def.name} (${RARITY_LABELS[def.rarity]}).`,
    };
  }

  public unequipItem(
    socketId: string,
    slot: 'weapon' | 'armor'
  ): { room: InternalRoom; notice: string } | { error: string } {
    const binding = this.socketToBinding.get(socketId);
    if (!binding) return { error: 'No estás en ninguna sala.' };

    const room = this.rooms.get(binding.roomCode);
    if (!room || room.phase !== 'playing') {
      return { error: 'Solo puedes desequipar fuera de combate.' };
    }

    const player = room.players.find((p) => p.id === binding.playerId);
    if (!player) return { error: 'Personaje no encontrado.' };

    const itemId = slot === 'weapon' ? player.equippedWeaponId : player.equippedArmorId;
    if (!itemId) return { error: 'No llevas nada equipado en ese espacio.' };

    if (!this.addItemToInventory(player, itemId)) {
      return { error: `Tu mochila (${MAX_INVENTORY_SLOTS}/${MAX_INVENTORY_SLOTS}) está llena. Suelta algo antes.` };
    }

    this.applyItemStats(player, itemId, -1);
    if (slot === 'weapon') player.equippedWeaponId = null;
    else player.equippedArmorId = null;

    this.scheduleSave();
    const def = ITEMS_BY_ID[itemId];
    return {
      room,
      notice: `${player.name} guardó ${def?.name ?? itemId} en su mochila.`,
    };
  }

  public dropItem(
    socketId: string,
    itemId: string
  ): { room: InternalRoom; notice: string } | { error: string } {
    const binding = this.socketToBinding.get(socketId);
    if (!binding) return { error: 'No estás en ninguna sala.' };

    const room = this.rooms.get(binding.roomCode);
    if (!room || room.phase !== 'playing') {
      return { error: 'Solo puedes soltar objetos fuera de combate.' };
    }

    const player = room.players.find((p) => p.id === binding.playerId);
    if (!player) return { error: 'Personaje no encontrado.' };

    const owned = player.inventory?.[itemId] ?? 0;
    if (owned <= 0) return { error: 'No tienes ese objeto en tu mochila.' };

    delete player.inventory[itemId];
    this.scheduleSave();
    const def = ITEMS_BY_ID[itemId];
    return {
      room,
      notice: `${player.name} soltó ${def?.name ?? itemId}.`,
    };
  }

  public tickRoamingMonsters(): Array<{ code: string; monsters: RoamingMonster[] }> {
    const updated: Array<{ code: string; monsters: RoamingMonster[] }> = [];
    const dirs = [
      { dx: 0, dy: -1 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 1, dy: 0 },
    ];

    for (const room of this.rooms.values()) {
      if (room.phase !== 'playing') continue;
      const connectedCount = room.players.filter((p) => p.connected).length;
      if (connectedCount === 0) continue;

      const map = getRegion(room.regionId);
      if (!room.roamingMonsters || room.roamingMonsters.length === 0) {
        room.roamingMonsters = spawnRoamingMonstersForRegion(map);
        if (room.roamingMonsters.length > 0) {
          updated.push({ code: room.code, monsters: room.roamingMonsters });
        }
        continue;
      }

      let moved = false;
      for (const m of room.roamingMonsters) {
        const d = dirs[Math.floor(Math.random() * dirs.length)];
        const nx = m.x + d.dx;
        const ny = m.y + d.dy;
        const tile = map.tiles[ny]?.[nx];
        if (
          (tile === 'grass' || tile === 'path') &&
          !room.players.some((p) => p.x === nx && p.y === ny)
        ) {
          m.x = nx;
          m.y = ny;
          moved = true;
        }
      }
      if (moved) updated.push({ code: room.code, monsters: room.roamingMonsters });
    }
    return updated;
  }

  public giveItem(
    socketId: string,
    itemId: string,
    targetPlayerId: string
  ): { room: InternalRoom; notice: string } | { error: string } {
    const binding = this.socketToBinding.get(socketId);
    if (!binding) return { error: 'No estás en ninguna sala.' };

    const room = this.rooms.get(binding.roomCode);
    if (!room || room.phase !== 'playing') {
      return { error: 'Solo puedes regalar objetos fuera de combate.' };
    }

    const sender = room.players.find((p) => p.id === binding.playerId);
    const receiver = room.players.find((p) => p.id === targetPlayerId && p.id !== binding.playerId);
    if (!sender || !receiver) return { error: 'Jugador destino no encontrado.' };

    const owned = sender.inventory?.[itemId] ?? 0;
    if (owned <= 0) return { error: 'No tienes ese objeto en tu mochila.' };

    if (!this.addItemToInventory(receiver, itemId)) {
      return { error: `La mochila de ${receiver.name} (5/5) está llena.` };
    }

    sender.inventory[itemId] = owned - 1;
    if (sender.inventory[itemId] <= 0) delete sender.inventory[itemId];

    this.scheduleSave();
    const def = ITEMS_BY_ID[itemId];
    return {
      room,
      notice: `${sender.name} le regaló ${def?.name ?? itemId} a ${receiver.name}.`,
    };
  }

  public unlockSkill(
    socketId: string,
    skillId: SkillNodeId
  ): { room: InternalRoom; notice: string } | { error: string } {
    const binding = this.socketToBinding.get(socketId);
    if (!binding) return { error: 'No estás en ninguna sala.' };

    const room = this.rooms.get(binding.roomCode);
    if (!room) return { error: 'Sala no encontrada.' };

    const player = room.players.find((p) => p.id === binding.playerId);
    if (!player) return { error: 'Personaje no encontrado.' };

    const node = SKILL_TREE.find((n) => n.id === skillId);
    if (!node) return { error: 'Habilidad no encontrada.' };

    player.unlockedSkills = player.unlockedSkills ?? [];
    if (player.unlockedSkills.includes(node.id)) {
      return { error: `Ya desbloqueaste "${node.name}".` };
    }

    if (node.requires && !player.unlockedSkills.includes(node.requires)) {
      const reqNode = SKILL_TREE.find((n) => n.id === node.requires);
      return { error: `Primero debes desbloquear "${reqNode?.name ?? node.requires}".` };
    }

    if ((player.skillPoints ?? 0) < node.cost) {
      return { error: 'No tienes suficientes puntos de habilidad (sube de nivel para ganar más).' };
    }

    player.skillPoints -= node.cost;
    player.unlockedSkills.push(node.id);

    if (node.id === 'martial_1') {
      player.attackMod += 2;
    } else if (node.id === 'guard_1') {
      player.ac += 2;
      player.maxHp += 4;
      player.hp = Math.min(player.maxHp, player.hp + 4);
    } else if (node.id === 'focus_1') {
      player.attackMod += 1;
      player.luckBonus = (player.luckBonus ?? 0) + 3;
    }

    this.scheduleSave();
    return {
      room,
      notice: `${player.name} desbloqueó "${node.name}" en el Árbol de Habilidades.`,
    };
  }

  private signSavePayload(encoded: string): string {
    const secret = process.env.SAVE_SECRET || 'tbd_rpg_save_v1_salt';
    return crypto.createHmac('sha256', secret).update(encoded).digest('hex').slice(0, 10);
  }

  public exportSaveCode(socketId: string): { saveCode: string } | { error: string } {
    const binding = this.socketToBinding.get(socketId);
    if (!binding) return { error: 'No estás en ninguna sala.' };

    const room = this.rooms.get(binding.roomCode);
    const player = room?.players.find((p) => p.id === binding.playerId);
    if (!player) return { error: 'Personaje no encontrado.' };

    const payload = {
      v: 1,
      c: player.playerClass,
      lv: player.level ?? 1,
      xp: player.xp ?? 0,
      g: player.gold ?? 0,
      sp: player.skillPoints ?? 0,
      sk: player.unlockedSkills ?? [],
      lk: player.luckBonus ?? 0,
      inv: player.inventory ?? {},
      up: player.shopUpgrades ?? {},
      ew: player.equippedWeaponId ?? null,
      ea: player.equippedArmorId ?? null,
      hp: player.hp,
      mhp: player.maxHp,
      ac: player.ac,
      atk: player.attackMod,
      rc: player.redeemedCodes ?? [],
    };
    const encoded = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
    const sig = this.signSavePayload(encoded);
    return { saveCode: `TBD1-${encoded}.${sig}` };
  }

  public loadSaveCode(
    socketId: string,
    rawCode: string
  ): { room: InternalRoom; notice: string } | { error: string } {
    const binding = this.socketToBinding.get(socketId);
    if (!binding) return { error: 'No estás en ninguna sala.' };

    const room = this.rooms.get(binding.roomCode);
    if (!room || room.phase !== 'playing') {
      return { error: 'Solo puedes cargar progreso mientras exploras (fuera de combate).' };
    }

    const player = room.players.find((p) => p.id === binding.playerId);
    if (!player) return { error: 'Personaje no encontrado.' };

    const trimmed = rawCode.trim();
    if (!trimmed.startsWith('TBD1-')) {
      return { error: 'Código de guardado inválido (debe empezar por TBD1-).' };
    }

    const body = trimmed.slice(5);
    const dotIdx = body.lastIndexOf('.');
    if (dotIdx <= 0) {
      return { error: 'Formato de código de guardado incorrecto.' };
    }

    const encoded = body.slice(0, dotIdx);
    const sig = body.slice(dotIdx + 1);
    if (sig !== this.signSavePayload(encoded)) {
      return { error: 'El código de guardado está dañado o no es válido.' };
    }

    try {
      const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8')) as Record<string, unknown>;
      if (parsed.v !== 1) return { error: 'Versión de guardado incompatible.' };

      const cls = parsed.c as PlayerClass;
      if (PLAYER_CLASSES[cls]) {
        player.playerClass = cls;
        player.damageDice = PLAYER_CLASSES[cls].damageDice;
      }
      player.level = Math.max(1, Number(parsed.lv) || 1);
      player.xp = Math.max(0, Number(parsed.xp) || 0);
      player.gold = Math.max(0, Number(parsed.g) || 0);
      player.skillPoints = Math.max(0, Number(parsed.sp) || 0);
      player.unlockedSkills = Array.isArray(parsed.sk) ? (parsed.sk as SkillNodeId[]) : [];
      player.luckBonus = Math.max(0, Number(parsed.lk) || 0);
      player.inventory =
        parsed.inv && typeof parsed.inv === 'object' ? { ...(parsed.inv as Record<string, number>) } : {};
      player.shopUpgrades =
        parsed.up && typeof parsed.up === 'object' ? { ...(parsed.up as Record<string, number>) } : {};
      player.equippedWeaponId = typeof parsed.ew === 'string' ? parsed.ew : null;
      player.equippedArmorId = typeof parsed.ea === 'string' ? parsed.ea : null;
      player.maxHp = Math.max(1, Number(parsed.mhp) || player.maxHp);
      player.hp = Math.max(1, Math.min(player.maxHp, Number(parsed.hp) || player.maxHp));
      player.ac = Number(parsed.ac) || player.ac;
      player.attackMod = Number(parsed.atk) || player.attackMod;
      player.redeemedCodes = Array.isArray(parsed.rc) ? (parsed.rc as string[]) : [];

      this.scheduleSave();
      return {
        room,
        notice: `${player.name} cargó su progreso guardado (Nivel ${player.level}).`,
      };
    } catch {
      return { error: 'No se pudo leer el código de guardado.' };
    }
  }

  public resetProgress(socketId: string): { room: InternalRoom; notice: string } | { error: string } {
    const binding = this.socketToBinding.get(socketId);
    if (!binding) return { error: 'No estás en ninguna sala.' };

    const room = this.rooms.get(binding.roomCode);
    if (!room || room.phase !== 'playing') {
      return { error: 'Solo puedes reiniciar tu progreso fuera de combate.' };
    }

    const player = room.players.find((p) => p.id === binding.playerId);
    if (!player) return { error: 'Personaje no encontrado.' };

    const tpl = PLAYER_CLASSES[player.playerClass];
    player.maxHp = tpl.maxHp;
    player.hp = tpl.maxHp;
    player.ac = tpl.ac;
    player.attackMod = tpl.attackMod;
    player.damageDice = tpl.damageDice;
    player.level = 1;
    player.xp = 0;
    player.gold = STARTING_GOLD;
    player.skillPoints = 1;
    player.unlockedSkills = [];
    player.luckBonus = 0;
    player.inventory = {};
    player.shopUpgrades = {};
    player.equippedWeaponId = null;
    player.equippedArmorId = null;
    player.redeemedCodes = [];
    player.tavernPlays = [];

    this.scheduleSave();
    return {
      room,
      notice: `${player.name} reinició su progreso a Nivel 1.`,
    };
  }

  public redeemCode(
    socketId: string,
    rawCode: string
  ): { room: InternalRoom; notice: string } | { error: string } {
    const binding = this.socketToBinding.get(socketId);
    if (!binding) return { error: 'No estás en ninguna sala.' };

    const room = this.rooms.get(binding.roomCode);
    if (!room) return { error: 'Sala no encontrada.' };

    const player = room.players.find((p) => p.id === binding.playerId);
    if (!player) return { error: 'Personaje no encontrado.' };

    const code = rawCode.replace(/\s+/g, '').toUpperCase();
    if (!code) return { error: 'Escribe un código para canjear.' };

    player.redeemedCodes = player.redeemedCodes ?? [];
    if (player.redeemedCodes.includes(code)) {
      return { error: `Ya canjeaste el código "${code}".` };
    }

    if (code === 'ASTRA9') {
      player.luckBonus = (player.luckBonus ?? 0) + 100;
      player.redeemedCodes.push(code);
      this.scheduleSave();
      return {
        room,
        notice: `¡Código ${code} canjeado! ${player.name} recibe +100 de Suerte.`,
      };
    }

    if (code === 'BRUMA3') {
      player.ac -= 100;
      player.redeemedCodes.push(code);
      this.scheduleSave();
      return {
        room,
        notice: `¡Código ${code} canjeado! La CA de ${player.name} bajó -100 (CA actual: ${player.ac}).`,
      };
    }

    return { error: `Código "${code}" no válido.` };
  }

  public playTavernDice(
    socketId: string,
    rawBet: number
  ): { payload: TavernResultPayload } | { error: string } {
    const binding = this.socketToBinding.get(socketId);
    if (!binding) return { error: 'No estás en ninguna sala.' };

    const room = this.rooms.get(binding.roomCode);
    if (!room || room.phase !== 'playing') {
      return { error: 'Solo puedes jugar en la taberna mientras exploras.' };
    }

    const player = room.players.find((p) => p.id === binding.playerId);
    if (!player) return { error: 'Personaje no encontrado.' };

    const bet = Math.floor(Number(rawBet));
    if (![5, 10, 20, 50].includes(bet)) {
      return { error: 'Apuesta no válida (elige 5, 10, 20 o 50 monedas).' };
    }
    if ((player.gold ?? 0) < bet) {
      return { error: `No tienes suficientes monedas para apostar ${bet}.` };
    }

    const now = Date.now();
    const recentPlays = (player.tavernPlays ?? []).filter((ts) => now - ts < TAVERN_WINDOW_MS);
    if (recentPlays.length >= TAVERN_MAX_PLAYS) {
      const oldest = Math.min(...recentPlays);
      const waitMin = Math.max(1, Math.ceil((oldest + TAVERN_WINDOW_MS - now) / 60_000));
      return {
        error: `Has agotado tus ${TAVERN_MAX_PLAYS} tiradas de Taberna. Vuelve en ${waitMin} min.`,
      };
    }

    recentPlays.push(now);
    player.tavernPlays = recentPlays;

    const die1 = rollDie(6);
    const die2 = rollDie(6);
    const total = die1 + die2;

    let payout = 0;
    let headline = '';
    if (total === 12) {
      payout = bet * 4;
      headline = `¡BOTE REAL! +${payout - bet} monedas`;
    } else if (total >= 7) {
      payout = bet * 2;
      headline = `¡Ganaste! +${payout - bet} monedas`;
    } else {
      payout = 0;
      headline = `¡La taberna gana! -${bet} monedas`;
    }

    const net = payout - bet;
    player.gold = Math.max(0, (player.gold ?? 0) + net);
    this.scheduleSave();

    const summary = `${player.name} apostó ${bet} monedas en la Taberna (sacó ${die1}+${die2}=${total}) → ${headline}.`;
    return {
      payload: {
        die1,
        die2,
        total,
        bet,
        payout,
        net,
        headline,
        summary,
        room: this.toPublicRoom(room),
      },
    };
  }

  private blueCreatureTicks = 0;

  public tickBlueCreature(): Array<{ code: string; creature: BlueCreatureState }> {
    this.blueCreatureTicks += 1;
    const shouldJumpWorld = this.blueCreatureTicks % 6 === 0;
    const updated: Array<{ code: string; creature: BlueCreatureState }> = [];
    const dirs = [
      { dx: 0, dy: -1 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 1, dy: 0 },
    ];

    for (const room of this.rooms.values()) {
      if (room.phase !== 'playing') continue;
      if (!room.players.some((p) => p.connected)) continue;

      if (!room.blueCreature || shouldJumpWorld) {
        room.blueCreature = spawnBlueCreature(room.blueCreature?.regionId);
        updated.push({ code: room.code, creature: room.blueCreature });
        continue;
      }

      const map = getRegion(room.blueCreature.regionId);
      const d = dirs[Math.floor(Math.random() * dirs.length)];
      const nx = room.blueCreature.x + d.dx;
      const ny = room.blueCreature.y + d.dy;
      const tile = map.tiles[ny]?.[nx];
      if (tile === 'grass' || tile === 'path') {
        room.blueCreature.x = nx;
        room.blueCreature.y = ny;
        updated.push({ code: room.code, creature: room.blueCreature });
      }
    }
    return updated;
  }

  public getSecretQuestion(): SecretQuestionState {
    return this.secretQuestion;
  }

  public answerSecretQuestion(
    socketId: string,
    choiceIndex: number
  ):
    | {
        room: InternalRoom;
        correct: boolean;
        message: string;
        teleported?: {
          fromRegionName: string;
          toRegionName: string;
          triggeredByName: string;
        };
      }
    | { error: string } {
    const binding = this.socketToBinding.get(socketId);
    if (!binding) return { error: 'No estás en ninguna sala.' };

    const room = this.rooms.get(binding.roomCode);
    const player = room?.players.find((p) => p.id === binding.playerId);
    if (!room || !player) return { error: 'Sala o personaje no encontrado.' };

    const correct = choiceIndex === this.secretQuestion.correctIndex;
    if (correct) {
      player.gold = (player.gold ?? 0) + 500;
      this.grantXp(player, 300);

      const fromMap = getRegion(room.regionId);
      const shipMap = getRegion('nave-rota');
      room.regionId = shipMap.id;
      room.players.forEach((p, idx) => {
        const pos = findWalkableNearby(shipMap, shipMap.spawn.x, shipMap.spawn.y, idx);
        p.regionId = shipMap.id;
        p.x = pos.x;
        p.y = pos.y;
      });
      room.roamingMonsters = spawnRoamingMonstersForRegion(shipMap);
      this.scheduleSave();

      return {
        room,
        correct: true,
        message:
          '¡Correcto! +500 monedas y +300 EXP. Habéis encontrado los restos de una nave rota... soon...',
        teleported: {
          fromRegionName: fromMap.name,
          toRegionName: shipMap.name,
          triggeredByName: player.name,
        },
      };
    }

    return {
      room,
      correct: false,
      message: '¡Respuesta incorrecta! Vuelve a intentarlo.',
    };
  }

  public setSecretQuestion(
    socketId: string,
    payload: { question: string; options: [string, string, string]; correctIndex: number }
  ): { notice: string } | { error: string } {
    const binding = this.socketToBinding.get(socketId);
    if (!binding) return { error: 'No estás en ninguna sala.' };

    const room = this.rooms.get(binding.roomCode);
    const player = room?.players.find((p) => p.id === binding.playerId);
    if (!room || !player) return { error: 'Sala o personaje no encontrado.' };

    const q = payload.question.trim().slice(0, 140);
    const opts = payload.options.map((o) => o.trim().slice(0, 60)) as [string, string, string];
    if (!q || opts.some((o) => !o)) {
      return { error: 'Escribe la pregunta y las 3 opciones.' };
    }
    const idx = Math.max(0, Math.min(2, Math.floor(payload.correctIndex)));
    this.secretQuestion = {
      question: q,
      options: opts,
      correctIndex: idx,
      authorName: player.name,
    };
    this.saveSecretQuestion();
    return {
      notice: `${player.name} dejó una nueva pregunta secreta para los próximos aventureros.`,
    };
  }
}
