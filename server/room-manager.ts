import type { RoomState, RoomConfig } from './shared/types';
import {
  ROOM_CODE_LENGTH,
  MIN_PLAYERS,
  MAX_PLAYERS,
  DEFAULT_SMALL_BLIND,
  DEFAULT_BIG_BLIND,
  DEFAULT_BUY_IN,
} from './shared/constants';

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return code;
}

export interface Room {
  state: RoomState;
  playerIds: Set<string>;
  sockets: Map<string, import('ws').WebSocket>;
}

const rooms = new Map<string, Room>();

export function createRoom(hostId: string, hostName: string, config?: Partial<RoomConfig>): RoomState {
  let code = generateRoomCode();
  while (rooms.has(code)) code = generateRoomCode();

  const state: RoomState = {
    roomCode: code,
    config: {
      smallBlind: config?.smallBlind ?? DEFAULT_SMALL_BLIND,
      bigBlind: config?.bigBlind ?? DEFAULT_BIG_BLIND,
      buyIn: config?.buyIn ?? DEFAULT_BUY_IN,
    },
    game: null,
    hostId,
    playerIdToName: { [hostId]: hostName },
    fieldGoalUsed: { [hostId]: false },
  };

  const room: Room = {
    state,
    playerIds: new Set([hostId]),
    sockets: new Map(),
  };
  rooms.set(code, room);
  return state;
}

export function joinRoom(roomCode: string, playerId: string, playerName: string): RoomState | null {
  const room = rooms.get(roomCode.toUpperCase());
  if (!room) return null;
  if (room.playerIds.size >= MAX_PLAYERS) return null;
  /* Allow join during game; joiner is a spectator until next hand (and only plays if position does not split dealer/SB/BB). */

  room.playerIds.add(playerId);
  room.state.playerIdToName[playerId] = playerName;
  if (!room.state.fieldGoalUsed) room.state.fieldGoalUsed = {};
  room.state.fieldGoalUsed[playerId] = false;
  return room.state;
}

export function getRoom(roomCode: string): Room | null {
  return rooms.get(roomCode.toUpperCase()) ?? null;
}

export function setRoomState(roomCode: string, state: RoomState): void {
  const room = rooms.get(roomCode.toUpperCase());
  if (room) room.state = state;
}

export function addSocket(roomCode: string, playerId: string, ws: import('ws').WebSocket): void {
  const room = rooms.get(roomCode.toUpperCase());
  if (room) room.sockets.set(playerId, ws);
}

export function removeSocket(roomCode: string, playerId: string): void {
  const room = rooms.get(roomCode.toUpperCase());
  if (room) {
    room.sockets.delete(playerId);
    const player = room.state.game?.players.find((p) => p.id === playerId);
    if (player) player.connected = false;
  }
}

export function getSockets(roomCode: string): Map<string, import('ws').WebSocket> {
  const room = rooms.get(roomCode.toUpperCase());
  return room?.sockets ?? new Map();
}

export function leaveRoom(roomCode: string, playerId: string): RoomState | null {
  const room = rooms.get(roomCode.toUpperCase());
  if (!room) return null;
  room.playerIds.delete(playerId);
  room.sockets.delete(playerId);
  delete room.state.playerIdToName[playerId];
  if (room.state.game) {
    const p = room.state.game.players.find((x) => x.id === playerId);
    if (p) p.connected = false;
  }
  if (room.playerIds.size === 0) {
    rooms.delete(roomCode.toUpperCase());
    return null;
  }
  if (room.state.hostId === playerId) {
    const next = [...room.playerIds][0];
    room.state.hostId = next;
  }
  return room.state;
}

export function canStartGame(roomCode: string): boolean {
  const room = rooms.get(roomCode.toUpperCase());
  if (!room) return false;
  return room.playerIds.size >= MIN_PLAYERS && room.state.game === null;
}

/** When game just finished, set rebuyDecisions for 0-chip players and persist buy-in counts. */
export function ensureRebuyStateWhenFinished(roomCode: string): void {
  const room = rooms.get(roomCode.toUpperCase());
  if (!room?.state.game || room.state.game.phase !== 'finished') return;
  const game = room.state.game;
  if (room.state.rebuyDecisions && Object.keys(room.state.rebuyDecisions).length > 0) return;

  if (!room.state.playerIdToBuyInCount) room.state.playerIdToBuyInCount = {};
  for (const p of game.players) {
    room.state.playerIdToBuyInCount[p.id] = p.buyInCount ?? 1;
  }
  room.state.rebuyDecisions = {};
  for (const p of game.players) {
    if (p.chips <= 0) room.state.rebuyDecisions![p.id] = 'pending';
  }
}
