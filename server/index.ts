import http from 'node:http';
import { WebSocketServer } from 'ws';
import type { ClientMessage, PlayerAction } from './shared/types';
import {
  getRoom,
  createRoom,
  joinRoom,
  addSocket,
  removeSocket,
  getSockets,
  leaveRoom,
  canStartGame,
  ensureRebuyStateWhenFinished,
  type Room,
} from './room-manager';
import { MIN_PLAYERS } from './shared/constants';
import {
  startHand,
  applyAction,
  canAct,
  canFieldGoal,
  reverseLastRaise,
  advanceIfBettingRoundComplete,
} from './game-engine';

const PORT = Number(process.env.PORT) || 3001;

const httpServer = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/' && !req.headers.upgrade) {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Poker server');
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server: httpServer });

const DEFAULT_BIG_BLIND = 10;
const DEFAULT_SMALL_BLIND = 5;

/** If no one can act (e.g. all remaining players all-in), run out the board to showdown. */
function ensureGameAdvanced(room: Room | null): void {
  const game = room?.state?.game;
  if (!game || game.phase === 'showdown' || game.phase === 'finished') return;
  const bigBlind = room.state.config?.bigBlind ?? DEFAULT_BIG_BLIND;
  const smallBlind = room.state.config?.smallBlind ?? DEFAULT_SMALL_BLIND;
  advanceIfBettingRoundComplete(game, bigBlind, smallBlind);
}

/** Run game advance then set rebuy state when finished so all clients see rebuy popup. */
function ensureRoomStateBeforeSend(room: Room | null): void {
  if (!room) return;
  ensureGameAdvanced(room);
  if (room.state.game?.phase === 'finished') ensureRebuyStateWhenFinished(room.state.roomCode);
}

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
        ensureRoomStateBeforeSend(room);
        broadcast(roomCode, { type: 'room_state', state: room.state });
        ws.send(JSON.stringify({ type: 'room_joined', roomCode, playerId, state: room.state }));
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

        let activePlayerIds: string[];
        let previousChips: Record<string, number> | undefined;
        let previousBuyInCounts: Record<string, number> | undefined;
        const buyIn = room.state.config.buyIn ?? 200;
        const handNumber = isFinished && room.state.game ? room.state.game.handNumber + 1 : 1;

        if (isNewGame) {
          activePlayerIds = [...room.playerIds];
        } else {
          ensureRebuyStateWhenFinished(currentRoomCode);
          const prevGame = room.state.game!;
          const rebuy = room.state.rebuyDecisions ?? {};
          const requested = room.state.rebuyRequested ?? {};
          const buyInCounts = room.state.playerIdToBuyInCount ?? {};

          const withChips = prevGame.players.filter((p) => p.chips > 0).map((p) => p.id);
          const zeroRebuyYes = prevGame.players.filter((p) => p.chips <= 0 && rebuy[p.id] === 'yes').map((p) => p.id);
          const spectatorRebuy = [...room.playerIds].filter(
            (id) => !prevGame.players.some((p) => p.id === id) && requested[id]
          );
          const newJoiners = [...room.playerIds].filter(
            (id) => !prevGame.players.some((p) => p.id === id) && !spectatorRebuy.includes(id)
          );

          activePlayerIds = [...withChips, ...zeroRebuyYes, ...spectatorRebuy];

          previousChips = {};
          previousBuyInCounts = {};
          for (const id of withChips) {
            const p = prevGame.players.find((x) => x.id === id)!;
            previousChips[id] = p.chips;
            previousBuyInCounts[id] = p.buyInCount ?? 1;
          }
          for (const id of zeroRebuyYes) {
            previousChips[id] = buyIn;
            const p = prevGame.players.find((x) => x.id === id)!;
            previousBuyInCounts[id] = (p.buyInCount ?? 1) + 1;
          }
          for (const id of spectatorRebuy) {
            previousChips[id] = buyIn;
            previousBuyInCounts[id] = (buyInCounts[id] ?? 0) + 1;
          }

          for (const id of newJoiners) {
            const n = activePlayerIds.length + 1;
            const newPlayerIndex = n - 1;
            const dealerIdx = (handNumber - 1) % n;
            const sbIdx = (dealerIdx + 1) % n;
            const bbIdx = (dealerIdx + 2) % n;
            if (newPlayerIndex === dealerIdx || newPlayerIndex === sbIdx || newPlayerIndex === bbIdx) continue;
            activePlayerIds.push(id);
            previousChips[id] = buyIn;
            previousBuyInCounts[id] = buyInCounts[id] ?? 1;
          }

          if (activePlayerIds.length < MIN_PLAYERS) {
            ws.send(JSON.stringify({ type: 'error', error: 'Not enough players to start next hand (need at least 2 with chips or rebuying)' }));
            return;
          }

          room.state.rebuyDecisions = undefined;
          room.state.rebuyRequested = undefined;
        }

        if (isFinished && room.state.hostId !== currentPlayerId) {
          ws.send(JSON.stringify({ type: 'error', error: 'Only host can start next hand' }));
          return;
        }

        if (isFinished) {
          room.state.ploVote = undefined;
          room.state.ploVoteInitiator = undefined;
          delete room.state.ploVoteConcluded;
        }

        const nextDealerIndex = (handNumber - 1) % activePlayerIds.length;
        const nextDealerId = activePlayerIds[nextDealerIndex];
        let isPlo = Boolean(room.state.ploRoundDealerId);
        if (room.state.ploRoundDealerId && nextDealerId === room.state.ploRoundDealerId) {
          if (room.state.ploRoundAnchorHasBeenDealer) {
            delete room.state.ploRoundDealerId;
            delete room.state.ploRoundAnchorHasBeenDealer;
            isPlo = false;
          } else {
            room.state.ploRoundAnchorHasBeenDealer = true;
            isPlo = true;
          }
        }

        const game = startHand(
          activePlayerIds,
          room.state.playerIdToName,
          room.state.config,
          handNumber,
          previousChips,
          previousBuyInCounts,
          isPlo
        );
        room.state.game = game;
        if (!room.state.playerIdToBuyInCount) room.state.playerIdToBuyInCount = {};
        for (const p of game.players) {
          room.state.playerIdToBuyInCount[p.id] = p.buyInCount ?? 1;
        }
        ensureRoomStateBeforeSend(room);
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
        ensureRebuyStateWhenFinished(currentRoomCode);
        ensureRoomStateBeforeSend(room);
        broadcast(currentRoomCode, { type: 'room_state', state: room.state });
        return;
      }

      if (msg.type === 'field_goal_attempt') {
        if (!currentRoomCode || !currentPlayerId) {
          ws.send(JSON.stringify({ type: 'error', error: 'Not in a room' }));
          return;
        }
        const room = getRoom(currentRoomCode);
        if (!room?.state.game) {
          ws.send(JSON.stringify({ type: 'error', error: 'No game in progress' }));
          return;
        }
        const game = room.state.game;
        const used = room.state.fieldGoalUsed ?? {};
        if (!canFieldGoal(game, currentPlayerId, used)) {
          ws.send(JSON.stringify({ type: 'error', error: 'Cannot use field goal now' }));
          return;
        }
        const success = msg.fieldGoalSuccess === true;
        if (success) {
          reverseLastRaise(game);
          const { bigBlind, smallBlind } = room.state.config;
          advanceIfBettingRoundComplete(game, bigBlind, smallBlind);
          if (!room.state.fieldGoalUsed) room.state.fieldGoalUsed = {};
          room.state.fieldGoalUsed[currentPlayerId] = true;
        }
        ensureRebuyStateWhenFinished(currentRoomCode);
        ensureRoomStateBeforeSend(room);
        broadcast(currentRoomCode, { type: 'room_state', state: room.state });
        return;
      }

      if (msg.type === 'rebuy_yes') {
        if (!currentRoomCode || !currentPlayerId) return;
        const room = getRoom(currentRoomCode);
        if (!room?.state.game || room.state.game.phase !== 'finished') return;
        if (room.state.rebuyDecisions?.[currentPlayerId] === 'pending') {
          room.state.rebuyDecisions[currentPlayerId] = 'yes';
          ensureRoomStateBeforeSend(room);
          broadcast(currentRoomCode, { type: 'room_state', state: room.state });
        }
        return;
      }

      if (msg.type === 'rebuy_no') {
        if (!currentRoomCode || !currentPlayerId) return;
        const room = getRoom(currentRoomCode);
        if (!room?.state.game || room.state.game.phase !== 'finished') return;
        if (room.state.rebuyDecisions?.[currentPlayerId] === 'pending') {
          room.state.rebuyDecisions[currentPlayerId] = 'no';
          ensureRoomStateBeforeSend(room);
          broadcast(currentRoomCode, { type: 'room_state', state: room.state });
        }
        return;
      }

      if (msg.type === 'request_rebuy') {
        if (!currentRoomCode || !currentPlayerId) return;
        const room = getRoom(currentRoomCode);
        if (!room?.state.game) return;
        const inGame = room.state.game.players.some((p) => p.id === currentPlayerId);
        if (!inGame) {
          if (!room.state.rebuyRequested) room.state.rebuyRequested = {};
          room.state.rebuyRequested[currentPlayerId] = true;
          ensureRoomStateBeforeSend(room);
          broadcast(currentRoomCode, { type: 'room_state', state: room.state });
        }
        return;
      }

      if (msg.type === 'plo_vote_start') {
        if (!currentRoomCode || !currentPlayerId) return;
        const room = getRoom(currentRoomCode);
        if (!room?.state.game || room.state.game.phase !== 'finished') {
          ws.send(JSON.stringify({ type: 'error', error: 'PLO vote only when hand is finished' }));
          return;
        }
        if (room.state.ploVote) return;
        room.state.ploVote = { votes: {} };
        room.state.ploVoteInitiator = currentPlayerId;
        ensureRoomStateBeforeSend(room);
        broadcast(currentRoomCode, { type: 'room_state', state: room.state });
        return;
      }

      if (msg.type === 'plo_vote_yes' || msg.type === 'plo_vote_no') {
        if (!currentRoomCode || !currentPlayerId) return;
        const room = getRoom(currentRoomCode);
        if (!room?.state.game || room.state.game.phase !== 'finished' || !room.state.ploVote) return;
        const vote = msg.type === 'plo_vote_yes' ? 'yes' : 'no';
        room.state.ploVote.votes[currentPlayerId] = vote;
        const gamePlayers = room.state.game.players;
        const total = gamePlayers.length;
        const yesCount = gamePlayers.filter((p) => room.state.ploVote!.votes[p.id] === 'yes').length;
        const noCount = gamePlayers.filter((p) => room.state.ploVote!.votes[p.id] === 'no').length;
        const voted = yesCount + noCount;
        if (voted === total) {
          room.state.ploVoteConcluded = true;
          if (yesCount > total / 2) {
            const nextHandNumber = room.state.game!.handNumber + 1;
            const nextDealerIdx = (nextHandNumber - 1) % gamePlayers.length;
            room.state.ploRoundDealerId = gamePlayers[nextDealerIdx].id;
            room.state.ploRoundAnchorHasBeenDealer = false;
          }
          room.state.ploVote = undefined;
          room.state.ploVoteInitiator = undefined;
        }
        ensureRoomStateBeforeSend(room);
        broadcast(currentRoomCode, { type: 'room_state', state: room.state });
        return;
      }

      if (msg.type === 'leave_room') {
        if (currentRoomCode && currentPlayerId) {
          leaveRoom(currentRoomCode, currentPlayerId);
          removeSocket(currentRoomCode, currentPlayerId);
          const room = getRoom(currentRoomCode);
          if (room) {
            ensureRoomStateBeforeSend(room);
            broadcast(currentRoomCode, { type: 'room_state', state: room.state });
          }
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
      if (room) {
        ensureRoomStateBeforeSend(room);
        broadcast(currentRoomCode, { type: 'room_state', state: room.state });
      }
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`Poker server listening on port ${PORT}`);
});
