import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@tbd/shared';

const SESSION_KEY = 'tbd_rpg_session_v1';

export interface SavedSession {
  roomCode: string;
  playerId: string;
  playerToken: string;
}

export function loadSavedSession(): SavedSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedSession;
    if (!parsed.roomCode || !parsed.playerToken || !parsed.playerId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(session: SavedSession): void {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
}

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function createGameSocket(): GameSocket {
  return io({
    // Start with HTTP long-polling and upgrade to WebSocket if allowed
    transports: ['polling', 'websocket'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });
}
