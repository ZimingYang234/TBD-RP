import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  COMBAT_TILE_COOLDOWN_MS,
  EVENT_TILE_COOLDOWN_MS,
  MAX_PLAYERS,
  MOVE_COOLDOWN_MS,
  PLAYER_CLASSES,
  PORTAL_COOLDOWN_MS,
  ROOM_CODE_LENGTH,
  SHOP_ITEMS,
  STARTING_GOLD,
  type ActiveEventState,
  type CombatEndedPayload,
  type CombatState,
  type CombatTurnEntry,
  type DiceRollBreakdown,
  type Direction,
  type EventOutcomePayload,
  type EventSource,
  type EventTriggerType,
  type PlayerClass,
  type PlayerState,
  type PublicPlayerState,
  type PublicRoomState,
  type RoomPhase,
} from '@tbd/shared';
import { generateEventForParty, type DmEvent } from './aiDm.js';
import { rollD20, rollDiceExpression } from './dice.js';
import { spawnEnemiesForParty } from './enemies.js';
import {
  REGIONS,
  STARTING_REGION_ID,
  findPortalAt,
  findWalkableNearby,
  getRegion,
  isTileWalkable,
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
      steppedOnShopTile: boolean;
      tileX: number;
      tileY: number;
    }
  | {
      type: 'teleported';
      room: InternalRoom;
      fromRegionName: string;
      toRegionName: string;
      triggeredByName: string;
    };

export type VoteOutcome =
  | { type: 'updated'; room: InternalRoom; activeEvent: ActiveEventState }
  | { type: 'resolved'; outcome: EventOutcomePayload };

export type CombatStepOutcome =
  | { type: 'updated'; room: InternalRoom; roll: DiceRollBreakdown }
  | { type: 'ended'; outcome: CombatEndedPayload };

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export class RoomManager {
  private rooms = new Map<string, InternalRoom>();
  private socketToBinding = new Map<string, SocketBinding>();
  private lastMoveAt = new Map<string, number>();
  private lastPortalAt = new Map<string, number>();
  private eventTileCooldowns = new Map<string, number>();
  private combatTileCooldowns = new Map<string, number>();
  private pendingEventRooms = new Set<string>();
  private saveTimer: NodeJS.Timeout | null = null;
  private readonly storePath: string;

  constructor(dataDir: string) {
    this.storePath = path.join(dataDir, 'rooms.json');
    this.loadFromDisk();
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
          return {
            ...p,
            regionId: room.regionId,
            x: safePos.x,
            y: safePos.y,
            gold: typeof p.gold === 'number' && Number.isFinite(p.gold) ? Math.max(0, p.gold) : STARTING_GOLD,
            xp: typeof p.xp === 'number' && Number.isFinite(p.xp) ? Math.max(0, p.xp) : 0,
            luckBonus: typeof p.luckBonus === 'number' && Number.isFinite(p.luckBonus) ? Math.max(0, p.luckBonus) : 0,
            inventory: p.inventory && typeof p.inventory === 'object' ? { ...p.inventory } : {},
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
      this.saveNow();
    }, 150);
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
      luckBonus: 0,
      inventory: {},
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
    this.scheduleSave();
    return {
      type: 'moved',
      room,
      player,
      steppedOnEventTile: landedTile === 'event',
      steppedOnCombatTile: landedTile === 'combat',
      steppedOnShopTile: landedTile === 'shop',
      tileX: nextX,
      tileY: nextY,
    };
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
        p.xp = Math.max(0, (p.xp ?? 0) + xpDelta);
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

  public startCombatForRoom(
    roomCode: string,
    tileX?: number,
    tileY?: number
  ): InternalRoom | null {
    const room = this.rooms.get(roomCode);
    if (!room || room.phase !== 'playing' || room.combat || room.activeInternalEvent) {
      return null;
    }

    const now = Date.now();
    if (tileX !== undefined && tileY !== undefined) {
      const tileKey = `${room.code}:${room.regionId}:${tileX},${tileY}`;
      const cooldownUntil = this.combatTileCooldowns.get(tileKey) ?? 0;
      if (now < cooldownUntil) return null;
      this.combatTileCooldowns.set(tileKey, now + COMBAT_TILE_COOLDOWN_MS);
    }

    const enemies = spawnEnemiesForParty(room.regionId, room.players.length);
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
    for (const p of room.players) {
      potionsLeftByPlayer[p.id] = 2;
    }

    const initSummary = turnEntries
      .map((t) => `${t.name} (${t.initiative})`)
      .join(', ');

    room.combat = {
      id: crypto.randomUUID(),
      mode: 'pve',
      round: 1,
      enemies,
      turnOrder: turnEntries,
      turnIndex: 0,
      defendingIds: [],
      potionsLeftByPlayer,
      lastRoll: null,
      log: [`¡Combate iniciado! Orden de iniciativa: ${initSummary}.`],
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

    for (const p of room.players) {
      p.hp = p.maxHp;
      potionsLeftByPlayer[p.id] = 2;
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
    action: 'attack' | 'luck' | 'defend' | 'potion' | 'bomb',
    targetId?: string
  ): CombatStepOutcome | { error: string } {
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
      } else {
        const headline = fumble ? '¡Pifia total!' : '¡Falló!';
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
          hit: false,
          critical: false,
          fumble,
          summary: fumble
            ? `¡Pifia total! ${player.name} pierde el equilibrio ante ${target.name}.`
            : `¡Falló! ${target.name} esquiva el ataque de ${player.name}.`,
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
    } else if (action === 'bomb') {
      const target = resolveTarget();
      if ('error' in target) return target;
      const owned = player.inventory?.bomb ?? 0;
      if (owned <= 0) {
        return { error: 'No tienes bombas arcanas. Cómpralas en la tienda.' };
      }
      player.inventory.bomb = owned - 1;
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

    const livingPlayers = room.players.filter((p) => p.hp > 0);
    if (livingPlayers.length === 0) {
      return { type: 'ended', outcome: this.finishCombat(room, false) };
    }

    const target = livingPlayers[Math.floor(Math.random() * livingPlayers.length)];
    const isDefending = combat.defendingIds.includes(target.id);
    const targetAc = target.ac + (isDefending ? 2 : 0);

    const d20 = rollD20();
    const attackTotal = d20 + enemy.attackMod;
    const critical = d20 === 20;
    const fumble = d20 === 1;
    const hit = critical || (!fumble && attackTotal >= targetAc);

    let roll: DiceRollBreakdown;
    if (hit) {
      const dmg = rollDiceExpression(enemy.damageDice, critical);
      target.hp = Math.max(0, target.hp - dmg.total);
      const headline = critical
        ? `¡Golpe crítico! ${dmg.total} de daño`
        : `¡Impacto enemigo! ${dmg.total} de daño`;
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
        damageTotal: dmg.total,
        summary: `${headline} — ${enemy.name} hiere a ${target.name}.`,
      };
    } else {
      const headline = fumble ? '¡Pifia enemiga!' : '¡Esquivado!';
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
        hit: false,
        critical: false,
        fumble,
        summary: `${headline} — ${target.name} evita el golpe de ${enemy.name}.`,
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

    if (victory && combat) {
      for (const e of combat.enemies) {
        xpGained += e.xpReward;
        goldGained += e.goldReward;
      }
      for (const p of room.players) {
        p.xp = (p.xp ?? 0) + xpGained;
        p.gold = (p.gold ?? 0) + goldGained;
        if (p.hp <= 0) p.hp = 1;
      }
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

    return {
      victory,
      xpGained,
      goldGained,
      summary: victory
        ? `¡Victoria! El grupo derrotó a los enemigos (+${xpGained} EXP, +${goldGained} Oro).`
        : 'El grupo cayó en combate y despertó a salvo en la entrada del reino con 50% de PV.',
      room: this.toPublicRoom(room),
    };
  }

  private finishPvpCombat(room: InternalRoom, winner: PlayerState | null): CombatEndedPayload {
    const xpGained = winner ? 30 : 0;
    const goldGained = winner ? 25 : 0;

    if (winner) {
      winner.xp = (winner.xp ?? 0) + xpGained;
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
    const owned = player.inventory[item.id] ?? 0;
    if (owned >= item.maxOwned) {
      return { error: `Ya alcanzaste el límite máximo de "${item.name}" (${item.maxOwned}).` };
    }

    player.gold -= item.price;
    player.inventory[item.id] = owned + 1;

    if (item.id === 'weapon_upgrade') {
      player.attackMod += 2;
    } else if (item.id === 'armor_upgrade') {
      player.ac += 2;
    } else if (item.id === 'luck_charm') {
      player.luckBonus = (player.luckBonus ?? 0) + 2;
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

    if (itemId !== 'potion') {
      return { error: 'Ese objeto se usa automáticamente o en combate.' };
    }

    const owned = player.inventory?.potion ?? 0;
    if (owned <= 0) {
      return { error: 'No tienes pociones en tu mochila.' };
    }
    if (player.hp >= player.maxHp) {
      return { error: 'Ya tienes todos tus PV al máximo.' };
    }

    player.inventory.potion = owned - 1;
    const heal = rollDiceExpression('1d6+4');
    const before = player.hp;
    player.hp = Math.min(player.maxHp, player.hp + heal.total);
    const healed = player.hp - before;

    this.scheduleSave();
    return {
      room,
      notice: `${player.name} usó una Poción de vida y recuperó ${healed} PV.`,
    };
  }
}
