import type { BlindStructure, RoomState, RoomConfig } from './shared/types';
import { DEFAULT_BLIND_MULTIPLIER, DEFAULT_MAX_BLIND_LEVEL } from './shared/blinds';
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
  /** Countdown that acts for the player whose turn it is if they run out of time. */
  turnTimer?: NodeJS.Timeout;
  /** Player the current turnTimer belongs to. */
  turnPlayerId?: string;
}

const rooms = new Map<string, Room>();

/** Clamp a client-supplied blind structure into something the level math accepts. */
export function sanitizeBlindStructure(structure: BlindStructure | undefined): BlindStructure | undefined {
  if (!structure || structure.mode === 'none') return undefined;
  if (structure.mode !== 'hands' && structure.mode !== 'time') return undefined;

  const multiplier = Number(structure.multiplier);
  const maxLevel = Number(structure.maxLevel);
  const sanitized: BlindStructure = {
    mode: structure.mode,
    multiplier: Number.isFinite(multiplier) && multiplier > 1 ? multiplier : DEFAULT_BLIND_MULTIPLIER,
    maxLevel:
      Number.isFinite(maxLevel) && maxLevel >= 1
        ? Math.min(Math.floor(maxLevel), 50)
        : DEFAULT_MAX_BLIND_LEVEL,
  };

  if (structure.mode === 'hands') {
    const hands = Math.floor(Number(structure.handsPerLevel));
    if (!Number.isFinite(hands) || hands < 1) return undefined;
    sanitized.handsPerLevel = hands;
  } else {
    const minutes = Number(structure.minutesPerLevel);
    if (!Number.isFinite(minutes) || minutes <= 0) return undefined;
    sanitized.minutesPerLevel = minutes;
  }
  return sanitized;
}

export function createRoom(hostId: string, hostName: string, config?: Partial<RoomConfig>): RoomState {
  let code = generateRoomCode();
  while (rooms.has(code)) code = generateRoomCode();

  const state: RoomState = {
    roomCode: code,
    config: {
      smallBlind: config?.smallBlind ?? DEFAULT_SMALL_BLIND,
      bigBlind: config?.bigBlind ?? DEFAULT_BIG_BLIND,
      buyIn: config?.buyIn ?? DEFAULT_BUY_IN,
      blindStructure: sanitizeBlindStructure(config?.blindStructure),
      testMode: config?.testMode === true,
    },
    game: null,
    hostId,
    playerIdToName: { [hostId]: hostName },
    seatOrder: [hostId],
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

/**
 * Join a room. Before the game starts everyone is seated straight away; once a
 * game is running the joiner watches and waits for the host to approve them,
 * and is only seated (at the end of the order, so the button is undisturbed)
 * once approved.
 */
export function joinRoom(roomCode: string, playerId: string, playerName: string): RoomState | null {
  const room = rooms.get(roomCode.toUpperCase());
  if (!room) return null;
  if (room.playerIds.size >= MAX_PLAYERS) return null;

  room.playerIds.add(playerId);
  room.state.playerIdToName[playerId] = playerName;
  if (!room.state.fieldGoalUsed) room.state.fieldGoalUsed = {};
  room.state.fieldGoalUsed[playerId] = false;

  if (room.state.game === null) {
    seatPlayer(room, playerId);
  } else {
    if (!room.state.joinRequests) room.state.joinRequests = {};
    room.state.joinRequests[playerId] = 'pending';
  }
  return room.state;
}

/** Give a player a seat at the end of the order, if they do not have one. */
export function seatPlayer(room: Room, playerId: string): void {
  if (!room.state.seatOrder.includes(playerId)) room.state.seatOrder.push(playerId);
}

/** Ids in seat order, keeping only those present in `ids`. */
export function inSeatOrder(state: RoomState, ids: Iterable<string>): string[] {
  const wanted = new Set(ids);
  const ordered = state.seatOrder.filter((id) => wanted.has(id));
  // Anything without a seat yet (shouldn't happen) goes on the end, in order.
  for (const id of wanted) {
    if (!ordered.includes(id)) ordered.push(id);
  }
  return ordered;
}

/**
 * The next player to take the button: one seat on from whoever had it last,
 * skipping seats that are not in this hand. Seat-based, so a player leaving,
 * rebuying or joining never rewinds or jumps the blinds.
 */
export function nextDealerId(state: RoomState, activeIds: string[]): string {
  const active = new Set(activeIds);
  const seats = state.seatOrder;
  const previous = state.lastDealerId;
  if (previous && seats.includes(previous)) {
    const start = seats.indexOf(previous);
    for (let step = 1; step <= seats.length; step++) {
      const candidate = seats[(start + step) % seats.length];
      if (active.has(candidate)) return candidate;
    }
  }
  return seats.find((id) => active.has(id)) ?? activeIds[0];
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
  // If the button was on the player leaving, hand it back a seat so the next
  // hand still moves it forward by one rather than jumping to the top.
  const seatIndex = room.state.seatOrder.indexOf(playerId);
  if (seatIndex >= 0 && room.state.lastDealerId === playerId) {
    const previousSeat = room.state.seatOrder.length > 1
      ? room.state.seatOrder[(seatIndex - 1 + room.state.seatOrder.length) % room.state.seatOrder.length]
      : undefined;
    room.state.lastDealerId = previousSeat === playerId ? undefined : previousSeat;
  }
  room.state.seatOrder = room.state.seatOrder.filter((id) => id !== playerId);
  if (room.state.joinRequests) delete room.state.joinRequests[playerId];
  // Someone who has left is never going to answer their rebuy prompt, and the
  // host cannot deal the next hand until every prompt is answered.
  if (room.state.rebuyDecisions) delete room.state.rebuyDecisions[playerId];
  if (room.state.rebuyRequested) delete room.state.rebuyRequested[playerId];
  if (room.state.ploVote) delete room.state.ploVote.votes[playerId];
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
