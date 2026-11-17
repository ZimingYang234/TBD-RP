import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import cors from 'cors';
import express from 'express';
import { Server } from 'socket.io';
import {
  PLAYER_CLASSES,
  type ClientToServerEvents,
  type EventOutcomePayload,
  type ServerToClientEvents,
} from '@tbd/shared';
import { RoomManager } from './roomManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const PORT = Number(process.env.PORT ?? 3001);
const DATA_DIR = path.resolve(__dirname, '../data');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

const clientDistPath = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

const server = http.createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
  cors: {
    origin: true,
    methods: ['GET', 'POST'],
  },
  transports: ['polling', 'websocket'],
  allowUpgrades: true,
});

const roomManager = new RoomManager(DATA_DIR);
const enemyTurnTimers = new Map<string, NodeJS.Timeout>();

function scheduleEnemyTurnIfNeeded(roomCode: string): void {
  if (!roomManager.isEnemyTurnActive(roomCode)) return;
  if (enemyTurnTimers.has(roomCode)) return;

  const timer = setTimeout(() => {
    enemyTurnTimers.delete(roomCode);
    const outcome = roomManager.executeEnemyTurn(roomCode);
    if (!outcome) {
      scheduleEnemyTurnIfNeeded(roomCode);
      return;
    }

    if (outcome.type === 'ended') {
      io.to(roomCode).emit('combat_ended', outcome.outcome);
      io.to(roomCode).emit('system_notice', { message: outcome.outcome.summary });
      return;
    }

    io.to(roomCode).emit('combat_updated', {
      room: roomManager.toPublicRoom(outcome.room),
      roll: outcome.roll,
    });
    scheduleEnemyTurnIfNeeded(roomCode);
  }, 1100);

  enemyTurnTimers.set(roomCode, timer);
}

function emitEventResolved(roomCode: string, outcome: EventOutcomePayload): void {
  io.to(roomCode).emit('event_resolved', outcome);
  io.to(roomCode).emit('system_notice', {
    message: `Evento resuelto (${outcome.eventTitle}): "${outcome.winningChoiceLabel}" — ${outcome.effects.summary}.`,
  });
}

async function triggerAndBroadcastEvent(params: {
  roomCode: string;
  triggeredByName: string;
  triggerType: 'event' | 'portal';
  tileX?: number;
  tileY?: number;
  triggerContext?: string;
}): Promise<void> {
  try {
    const triggered = await roomManager.triggerEventForRoom(params);
    if (!triggered) return;

    const publicRoom = roomManager.toPublicRoom(triggered.room);
    if (!publicRoom.activeEvent) return;

    io.to(publicRoom.code).emit('event_started', { room: publicRoom });
    io.to(publicRoom.code).emit('system_notice', {
      message: `${params.triggeredByName} activó un evento: "${publicRoom.activeEvent.title}".`,
    });
  } catch (err) {
    console.error('[server] Failed to trigger room event:', err);
  }
}

io.on('connection', (socket) => {
  socket.on('create_room', (payload) => {
    const result = roomManager.createRoom(socket.id, payload.playerName, payload.playerClass);
    if ('error' in result) {
      socket.emit('room_error', { message: result.error });
      return;
    }

    const { room, player } = result;
    socket.join(room.code);
    socket.emit('room_joined', {
      room: roomManager.toPublicRoom(room),
      playerId: player.id,
      playerToken: player.token,
    });
  });

  socket.on('join_room', (payload) => {
    const result = roomManager.joinRoom(
      socket.id,
      payload.roomCode,
      payload.playerName,
      payload.playerClass,
      payload.playerToken
    );
    if ('error' in result) {
      socket.emit('room_error', { message: result.error });
      return;
    }

    const { room, player, reconnected } = result;
    const classNameEs = PLAYER_CLASSES[player.playerClass].name;
    socket.join(room.code);
    socket.emit('room_joined', {
      room: roomManager.toPublicRoom(room),
      playerId: player.id,
      playerToken: player.token,
    });
    socket.to(room.code).emit('room_state', roomManager.toPublicRoom(room));
    socket.to(room.code).emit('system_notice', {
      message: reconnected
        ? `${player.name} se ha reconectado al grupo.`
        : `${player.name} (${classNameEs}) se unió al grupo.`,
    });
  });

  socket.on('reconnect_room', (payload) => {
    const result = roomManager.reconnectRoom(socket.id, payload.roomCode, payload.playerToken);
    if ('error' in result) {
      socket.emit('room_error', { message: result.error, code: 'RECONNECT_FAILED' });
      return;
    }

    const { room, player } = result;
    socket.join(room.code);
    socket.emit('room_joined', {
      room: roomManager.toPublicRoom(room),
      playerId: player.id,
      playerToken: player.token,
    });
    socket.to(room.code).emit('room_state', roomManager.toPublicRoom(room));
    socket.to(room.code).emit('system_notice', {
      message: `${player.name} se ha reconectado.`,
    });
    scheduleEnemyTurnIfNeeded(room.code);
  });

  socket.on('start_game', () => {
    const result = roomManager.startGame(socket.id);
    if ('error' in result) {
      socket.emit('room_error', { message: result.error });
      return;
    }

    const { room } = result;
    const publicRoom = roomManager.toPublicRoom(room);
    io.to(room.code).emit('room_state', publicRoom);
    io.to(room.code).emit('system_notice', {
      message: `¡Comienza la aventura en ${publicRoom.map.name}! Muévete con WASD o las flechas.`,
    });
  });

  socket.on('player_move', (payload) => {
    const outcome = roomManager.movePlayer(socket.id, payload.direction);
    if (!outcome) return;

    if (outcome.type === 'teleported') {
      const publicRoom = roomManager.toPublicRoom(outcome.room);
      io.to(outcome.room.code).emit('party_teleported', {
        room: publicRoom,
        fromRegionName: outcome.fromRegionName,
        toRegionName: outcome.toRegionName,
        triggeredByName: outcome.triggeredByName,
      });
      io.to(outcome.room.code).emit('system_notice', {
        message: `${outcome.triggeredByName} activó un portal: el grupo viajó a ${outcome.toRegionName}.`,
      });
      void triggerAndBroadcastEvent({
        roomCode: outcome.room.code,
        triggeredByName: outcome.triggeredByName,
        triggerType: 'portal',
        triggerContext: `El grupo acaba de cruzar un portal mágico desde ${outcome.fromRegionName} hacia ${outcome.toRegionName}.`,
      });
      return;
    }

    io.to(outcome.room.code).emit('player_moved', {
      playerId: outcome.player.id,
      x: outcome.player.x,
      y: outcome.player.y,
      regionId: outcome.player.regionId,
    });

    if (outcome.steppedOnEventTile) {
      void triggerAndBroadcastEvent({
        roomCode: outcome.room.code,
        triggeredByName: outcome.player.name,
        triggerType: 'event',
        tileX: outcome.tileX,
        tileY: outcome.tileY,
        triggerContext: 'Encuentro al pisar una casilla de evento en el mapa.',
      });
    } else if (outcome.steppedOnCombatTile) {
      const combatRoom = roomManager.startCombatForRoom(
        outcome.room.code,
        outcome.tileX,
        outcome.tileY
      );
      if (combatRoom) {
        const publicRoom = roomManager.toPublicRoom(combatRoom);
        io.to(publicRoom.code).emit('combat_started', { room: publicRoom });
        io.to(publicRoom.code).emit('system_notice', {
          message: `¡${outcome.player.name} encontró enemigos! Comienza el combate por turnos.`,
        });
        scheduleEnemyTurnIfNeeded(publicRoom.code);
      }
    } else if (outcome.steppedOnShopTile) {
      socket.emit('open_shop');
    }
  });

  socket.on('start_combat_encounter', () => {
    const result = roomManager.startCombatBySocket(socket.id);
    if ('error' in result) {
      socket.emit('room_error', { message: result.error });
      return;
    }

    const publicRoom = roomManager.toPublicRoom(result.room);
    io.to(publicRoom.code).emit('combat_started', { room: publicRoom });
    io.to(publicRoom.code).emit('system_notice', {
      message: '¡El grupo ha entrado en combate! Tirando iniciativa...',
    });
    scheduleEnemyTurnIfNeeded(publicRoom.code);
  });

  socket.on('start_pvp_duel', () => {
    const result = roomManager.startPvpDuel(socket.id);
    if ('error' in result) {
      socket.emit('room_error', { message: result.error });
      return;
    }

    const publicRoom = roomManager.toPublicRoom(result.room);
    io.to(publicRoom.code).emit('combat_started', { room: publicRoom });
    io.to(publicRoom.code).emit('system_notice', {
      message: '¡Duelo PvP iniciado! Tirando iniciativa...',
    });
  });

  socket.on('combat_action', (payload) => {
    if (!payload || !['attack', 'luck', 'defend', 'potion', 'bomb'].includes(payload.action)) return;
    const result = roomManager.performCombatAction(socket.id, payload.action, payload.targetId);
    if ('error' in result) {
      socket.emit('room_error', { message: result.error });
      return;
    }

    if (result.type === 'ended') {
      const roomCode = result.outcome.room.code;
      const t = enemyTurnTimers.get(roomCode);
      if (t) {
        clearTimeout(t);
        enemyTurnTimers.delete(roomCode);
      }
      io.to(roomCode).emit('combat_ended', result.outcome);
      io.to(roomCode).emit('system_notice', { message: result.outcome.summary });
      return;
    }

    const publicRoom = roomManager.toPublicRoom(result.room);
    io.to(publicRoom.code).emit('combat_updated', {
      room: publicRoom,
      roll: result.roll,
    });
    scheduleEnemyTurnIfNeeded(publicRoom.code);
  });

  socket.on('skip_combat_turn', () => {
    const result = roomManager.skipCombatTurn(socket.id);
    if ('error' in result) {
      socket.emit('room_error', { message: result.error });
      return;
    }

    if (result.type === 'ended') {
      io.to(result.outcome.room.code).emit('combat_ended', result.outcome);
      io.to(result.outcome.room.code).emit('system_notice', { message: result.outcome.summary });
      return;
    }

    const publicRoom = roomManager.toPublicRoom(result.room);
    io.to(publicRoom.code).emit('combat_updated', {
      room: publicRoom,
      roll: result.roll,
    });
    scheduleEnemyTurnIfNeeded(publicRoom.code);
  });

  socket.on('vote_event', (payload) => {
    if (!payload || typeof payload.choiceId !== 'string') return;
    const result = roomManager.voteEvent(socket.id, payload.choiceId);
    if (!result) return;

    if (result.type === 'resolved') {
      emitEventResolved(result.outcome.room.code, result.outcome);
      return;
    }

    io.to(result.room.code).emit('event_updated', {
      activeEvent: result.activeEvent,
    });
  });

  socket.on('resolve_event_now', () => {
    const result = roomManager.resolveEventNow(socket.id);
    if ('error' in result) {
      socket.emit('room_error', { message: result.error });
      return;
    }
    emitEventResolved(result.outcome.room.code, result.outcome);
  });

  socket.on('buy_item', (payload) => {
    if (!payload || typeof payload.itemId !== 'string') return;
    const result = roomManager.buyItem(socket.id, payload.itemId);
    if ('error' in result) {
      socket.emit('room_error', { message: result.error });
      return;
    }

    const publicRoom = roomManager.toPublicRoom(result.room);
    io.to(publicRoom.code).emit('room_state', publicRoom);
    io.to(publicRoom.code).emit('system_notice', { message: result.notice });
  });

  socket.on('use_item', (payload) => {
    if (!payload || typeof payload.itemId !== 'string') return;
    const result = roomManager.useItem(socket.id, payload.itemId);
    if ('error' in result) {
      socket.emit('room_error', { message: result.error });
      return;
    }

    const publicRoom = roomManager.toPublicRoom(result.room);
    io.to(publicRoom.code).emit('room_state', publicRoom);
    io.to(publicRoom.code).emit('system_notice', { message: result.notice });
  });

  socket.on('leave_room', () => {
    const result = roomManager.leaveRoom(socket.id);
    if (!result) return;

    socket.leave(result.roomCode);
    if (result.room) {
      io.to(result.roomCode).emit('room_state', roomManager.toPublicRoom(result.room));
      io.to(result.roomCode).emit('system_notice', {
        message: `${result.playerName} salió del grupo.`,
      });
      if (result.resolvedOutcome) {
        emitEventResolved(result.roomCode, result.resolvedOutcome);
      }
    }
  });

  socket.on('disconnect', () => {
    const result = roomManager.disconnectSocket(socket.id);
    if (!result) return;

    io.to(result.room.code).emit('room_state', roomManager.toPublicRoom(result.room));
    io.to(result.room.code).emit('system_notice', {
      message: `${result.playerName} se desconectó (su lugar sigue guardado).`,
    });
    if (result.resolvedOutcome) {
      emitEventResolved(result.room.code, result.resolvedOutcome);
    }
  });
});

process.on('SIGINT', () => {
  roomManager.saveNow();
  process.exit(0);
});
process.on('SIGTERM', () => {
  roomManager.saveNow();
  process.exit(0);
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
