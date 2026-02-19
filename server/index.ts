import { WebSocketServer } from 'ws';
import type { ClientMessage, PlayerAction } from '../shared/types';
import {
  getRoom,
  createRoom,
  joinRoom,
  setRoomState,
  addSocket,
  removeSocket,
  getSockets,
  leaveRoom,
  canStartGame,
} from './room-manager';
import {
  startHand,
  applyAction,
  canAct,
} from './game-engine';

const PORT = Number(process.env.PORT) || 3001;
const wss = new WebSocketServer({ port: PORT });

function broadcast(roomCode: string, message: object): void {
  const sockets = getSockets(roomCode);
  const payload = JSON.stringify(message);
  for (const ws of sockets.values()) {
    if (ws.readyState === 1) ws.send(payload);
  }
}

wss.on('connection', (ws) => {
  let currentRoomCode: string | null = null;
  let currentPlayerId: string | null = null;

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString()) as ClientMessage;
      if (msg.type === 'create_room') {
        const playerId = `p_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const name = msg.playerName ?? 'Player';
        const state = createRoom(playerId, name, msg.config);
        currentRoomCode = state.roomCode;
        currentPlayerId = playerId;
        addSocket(state.roomCode, playerId, ws);
        ws.send(JSON.stringify({ type: 'room_created', roomCode: state.roomCode, playerId, state }));
        return;
      }

      if (msg.type === 'join_room') {
        const roomCode = (msg.roomCode ?? '').toUpperCase().trim();
        if (!roomCode) {
          ws.send(JSON.stringify({ type: 'error', error: 'Room code required' }));
          return;
        }
        const room = getRoom(roomCode);
        if (!room) {
          ws.send(JSON.stringify({ type: 'error', error: 'Room not found' }));
          return;
        }
        const playerId = `p_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const name = msg.playerName ?? 'Player';
        const state = joinRoom(roomCode, playerId, name);
        if (!state) {
          ws.send(JSON.stringify({ type: 'error', error: 'Could not join room' }));
          return;
        }
        currentRoomCode = roomCode;
        currentPlayerId = playerId;
        addSocket(roomCode, playerId, ws);
        broadcast(roomCode, { type: 'room_state', state });
        ws.send(JSON.stringify({ type: 'room_joined', roomCode, playerId, state }));
        return;
      }

      if (msg.type === 'start_game') {
        if (!currentRoomCode || !currentPlayerId) {
          ws.send(JSON.stringify({ type: 'error', error: 'Not in a room' }));
          return;
        }
        const room = getRoom(currentRoomCode);
        if (!room) {
          ws.send(JSON.stringify({ type: 'error', error: 'Room not found' }));
          return;
        }
        const isNewGame = room.state.game === null;
        const isFinished = room.state.game?.phase === 'finished';
        if (isNewGame) {
          if (room.state.hostId !== currentPlayerId) {
            ws.send(JSON.stringify({ type: 'error', error: 'Only host can start' }));
            return;
          }
          if (!canStartGame(currentRoomCode)) {
            ws.send(JSON.stringify({ type: 'error', error: 'Not enough players to start' }));
            return;
          }
        } else if (!isFinished) {
          ws.send(JSON.stringify({ type: 'error', error: 'Game already in progress' }));
          return;
        }
        const playerIds = [...room.playerIds];
        const handNumber = isFinished && room.state.game ? room.state.game.handNumber + 1 : 1;
        const game = startHand(
          playerIds,
          room.state.playerIdToName,
          room.state.config,
          handNumber
        );
        room.state.game = game;
        broadcast(currentRoomCode, { type: 'game_started', state: room.state });
        return;
      }

      if (msg.type === 'action') {
        if (!currentRoomCode || !currentPlayerId || !msg.action) {
          ws.send(JSON.stringify({ type: 'error', error: 'Invalid action' }));
          return;
        }
        const room = getRoom(currentRoomCode);
        if (!room?.state.game) {
          ws.send(JSON.stringify({ type: 'error', error: 'No game in progress' }));
          return;
        }
        const game = room.state.game;
        if (!canAct(game, currentPlayerId)) {
          ws.send(JSON.stringify({ type: 'error', error: 'Cannot act now' }));
          return;
        }
        const action = msg.action as PlayerAction;
        const { bigBlind, smallBlind } = room.state.config;
        try {
          applyAction(game, currentPlayerId, action, bigBlind, smallBlind);
        } catch (err) {
          ws.send(JSON.stringify({ type: 'error', error: (err as Error).message }));
          return;
        }
        broadcast(currentRoomCode, { type: 'room_state', state: room.state });
        return;
      }

      if (msg.type === 'leave_room') {
        if (currentRoomCode && currentPlayerId) {
          const state = leaveRoom(currentRoomCode, currentPlayerId);
          removeSocket(currentRoomCode, currentPlayerId);
          if (state) broadcast(currentRoomCode, { type: 'room_state', state });
          currentRoomCode = null;
          currentPlayerId = null;
        }
        return;
      }
    } catch (e) {
      ws.send(JSON.stringify({ type: 'error', error: 'Invalid message' }));
    }
  });

  ws.on('close', () => {
    if (currentRoomCode && currentPlayerId) {
      removeSocket(currentRoomCode, currentPlayerId);
      const room = getRoom(currentRoomCode);
      if (room) broadcast(currentRoomCode, { type: 'room_state', state: room.state });
    }
  });
});

console.log(`Poker server listening on port ${PORT}`);
