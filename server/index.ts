import http from 'node:http';
import { WebSocketServer } from 'ws';
import type { ClientMessage, PlayerAction, RoomState } from './shared/types';
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
  inSeatOrder,
  nextDealerId,
  seatPlayer,
  type Room,
} from './room-manager';
import { MIN_PLAYERS, MAX_PLO_PLAYERS, TURN_TIME_LIMIT_MS } from './shared/constants';
import { tournamentStateForHand } from './shared/blinds';
import { getTestScenario } from './shared/test-scenarios';
import {
  startHand,
  applyAction,
  canAct,
  canFieldGoal,
  reverseLastRaise,
  advanceIfBettingRoundComplete,
  removePlayerFromHand,
  applyTurnTimeout,
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

/** If no one can act (e.g. all remaining players all-in), run out the board to showdown. */
function ensureGameAdvanced(room: Room | null): void {
  const game = room?.state?.game;
  if (!game || game.phase === 'showdown' || game.phase === 'finished') return;
  advanceIfBettingRoundComplete(game);
}

/**
 * Arm (or clear) the countdown that acts for whoever is on the clock. The
 * deadline only restarts when the turn actually moves to someone else, so a
 * broadcast for an unrelated reason does not hand a player extra time.
 */
function updateTurnTimer(room: Room): void {
  const game = room.state.game;
  const acting =
    game && game.phase !== 'finished' && game.phase !== 'showdown'
      ? game.players[game.actingPlayerIndex]
      : undefined;
  const actingId = acting && !acting.folded && !acting.allIn ? acting.id : undefined;

  if (room.turnPlayerId === actingId) return;

  if (room.turnTimer) clearTimeout(room.turnTimer);
  room.turnTimer = undefined;
  room.turnPlayerId = actingId;

  if (!actingId || !game) {
    if (game) delete game.actingDeadlineMs;
    return;
  }

  game.actingDeadlineMs = Date.now() + TURN_TIME_LIMIT_MS;
  const roomCode = room.state.roomCode;
  room.turnTimer = setTimeout(() => {
    const current = getRoom(roomCode);
    if (!current?.state.game) return;
    const action = applyTurnTimeout(current.state.game, actingId);
    if (!action) return;
    ensureRoomStateBeforeSend(current);
    broadcast(roomCode, { type: 'room_state', state: current.state });
  }, TURN_TIME_LIMIT_MS);
  // Do not hold the process open just for a countdown.
  room.turnTimer.unref?.();
}

/** Run game advance then set rebuy state when finished so all clients see rebuy popup. */
function ensureRoomStateBeforeSend(room: Room | null): void {
  if (!room) return;
  ensureGameAdvanced(room);
  if (room.state.game?.phase === 'finished') ensureRebuyStateWhenFinished(room.state.roomCode);
  updateTurnTimer(room);
  room.state.serverNowMs = Date.now();
}

/**
 * The room as one player may see it: you always get your own hole cards, and
 * everyone else's only once they choose to show them. Hidden hands are sent as
 * a count so the table can still lay out the right number of card backs.
 */
function stateFor(state: RoomState, viewerId: string | null): RoomState {
  if (!state.game) return state;
  const revealed = new Set(state.game.revealedPlayerIds ?? []);
  return {
    ...state,
    game: {
      ...state.game,
      // The deck would otherwise tell anyone watching what is coming next.
      deck: [],
      players: state.game.players.map((p) =>
        p.id === viewerId || revealed.has(p.id)
          ? p
          : { ...p, holeCards: [], holeCardCount: p.holeCardCount ?? p.holeCards.length }
      ),
    },
  };
}

function broadcast(roomCode: string, message: { type: string; state?: RoomState }): void {
  const sockets = getSockets(roomCode);
  for (const [playerId, ws] of sockets.entries()) {
    if (ws.readyState !== 1) continue;
    const payload = message.state
      ? { ...message, state: stateFor(message.state, playerId) }
      : message;
    ws.send(JSON.stringify(payload));
  }
}

/**
 * A player left, or their connection dropped. There is no way back into the
 * same seat, so treat both the same: fold them out of the hand in progress and
 * free their seat, and let everyone still at the table carry on.
 */
function handleDeparture(roomCode: string, playerId: string): void {
  const room = getRoom(roomCode);
  if (!room) return;
  const game = room.state.game;
  if (game && game.phase !== 'finished' && game.phase !== 'showdown') {
    removePlayerFromHand(game, playerId);
  }
  leaveRoom(roomCode, playerId);
  removeSocket(roomCode, playerId);

  const remaining = getRoom(roomCode);
  if (!remaining) return; // room emptied out and was cleaned up
  ensureRoomStateBeforeSend(remaining);
  broadcast(roomCode, { type: 'room_state', state: remaining.state });
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
        ws.send(JSON.stringify({ type: 'room_joined', roomCode, playerId, state: stateFor(room.state, playerId) }));
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
          activePlayerIds = inSeatOrder(room.state, room.playerIds);
        } else {
          ensureRebuyStateWhenFinished(currentRoomCode);
          const prevGame = room.state.game!;
          const rebuy = room.state.rebuyDecisions ?? {};
          const requested = room.state.rebuyRequested ?? {};
          const buyInCounts = room.state.playerIdToBuyInCount ?? {};

          // Players who have left keep their seat in the finished hand for the
          // record, but they are not dealt into the next one.
          const stillHere = (id: string) => room.playerIds.has(id);
          const withChips = prevGame.players.filter((p) => p.chips > 0 && stillHere(p.id)).map((p) => p.id);
          const zeroRebuyYes = prevGame.players
            .filter((p) => p.chips <= 0 && rebuy[p.id] === 'yes' && stillHere(p.id))
            .map((p) => p.id);
          // Anyone seated but not in the last hand: spectators who asked to
          // rebuy, and approved joiners who have never bought in. Players who
          // sat out stay out until they ask back in.
          const returning = room.state.seatOrder.filter((id) => {
            if (!room.playerIds.has(id)) return false;
            if (prevGame.players.some((p) => p.id === id)) return false;
            if (room.state.joinRequests?.[id] !== undefined) return false;
            const neverBoughtIn = buyInCounts[id] === undefined;
            return requested[id] === true || neverBoughtIn;
          });

          // Seat order decides who sits where — never the order they rebought in.
          activePlayerIds = inSeatOrder(room.state, [...withChips, ...zeroRebuyYes, ...returning]);

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
          for (const id of returning) {
            previousChips[id] = buyIn;
            previousBuyInCounts[id] = (buyInCounts[id] ?? 0) + 1;
          }

          if (activePlayerIds.length < MIN_PLAYERS) {
            ws.send(JSON.stringify({ type: 'error', error: 'Not enough players to start next hand (need at least 2 with chips or rebuying)' }));
            return;
          }

          room.state.rebuyDecisions = undefined;
          room.state.rebuyRequested = undefined;
        }

        // Only the host opens the game, but once it is running anyone at the
        // table can deal the next hand — no waiting on one person.
        if (isFinished) {
          room.state.ploVote = undefined;
          room.state.ploVoteInitiator = undefined;
          delete room.state.ploVoteConcluded;
        }

        const dealerId = nextDealerId(room.state, activePlayerIds);
        const dealerIndex = Math.max(0, activePlayerIds.indexOf(dealerId));
        // Four hole cards each does not fit in a deck at a big table, so a PLO
        // round quietly reverts to Hold'em rather than dealing an invalid hand.
        if (room.state.ploRoundDealerId && activePlayerIds.length > MAX_PLO_PLAYERS) {
          delete room.state.ploRoundDealerId;
          delete room.state.ploRoundAnchorHasBeenDealer;
        }
        let isPlo = Boolean(room.state.ploRoundDealerId);
        if (room.state.ploRoundDealerId && dealerId === room.state.ploRoundDealerId) {
          if (room.state.ploRoundAnchorHasBeenDealer) {
            delete room.state.ploRoundDealerId;
            delete room.state.ploRoundAnchorHasBeenDealer;
            isPlo = false;
          } else {
            room.state.ploRoundAnchorHasBeenDealer = true;
            isPlo = true;
          }
        }

        const now = Date.now();
        const startedAtMs = room.state.tournament?.startedAtMs ?? now;
        const tournament = tournamentStateForHand(
          room.state.config,
          handNumber,
          startedAtMs,
          now,
          room.state.tournament
        );
        room.state.tournament = tournament;

        const scenario = room.state.config.testMode
          ? getTestScenario(room.state.pendingTestScenario)
          : undefined;

        const game = startHand({
          playerIds: activePlayerIds,
          playerNames: room.state.playerIdToName,
          config: room.state.config,
          handNumber,
          previousChips,
          previousBuyInCounts,
          isPlo,
          dealerIndex,
          smallBlind: tournament.smallBlind,
          bigBlind: tournament.bigBlind,
          blindLevel: tournament.level,
          rig: scenario?.deal,
          testScenario: scenario?.id,
        });
        room.state.pendingTestScenario = undefined;
        room.state.lastDealerId = dealerId;
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
        try {
          applyAction(game, currentPlayerId, action);
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
          advanceIfBettingRoundComplete(game);
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
        if (room.state.game.players.length > MAX_PLO_PLAYERS) {
          ws.send(
            JSON.stringify({
              type: 'error',
              error: `Pot Limit Omaha needs four cards each, so it only works with up to ${MAX_PLO_PLAYERS} players`,
            })
          );
          return;
        }
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

      if (msg.type === 'approve_join' || msg.type === 'deny_join') {
        if (!currentRoomCode || !currentPlayerId) return;
        const room = getRoom(currentRoomCode);
        if (!room) return;
        if (room.state.hostId !== currentPlayerId) {
          ws.send(JSON.stringify({ type: 'error', error: 'Only the host can admit players' }));
          return;
        }
        const target = msg.targetPlayerId;
        if (!target || room.state.joinRequests?.[target] !== 'pending') {
          ws.send(JSON.stringify({ type: 'error', error: 'No such join request' }));
          return;
        }
        if (msg.type === 'approve_join') {
          // Seated at the end of the order, so the button and the blinds carry
          // on exactly as they were. They are dealt in on the next hand.
          seatPlayer(room, target);
          delete room.state.joinRequests[target];
        } else {
          room.state.joinRequests[target] = 'denied';
        }
        ensureRoomStateBeforeSend(room);
        broadcast(currentRoomCode, { type: 'room_state', state: room.state });
        return;
      }

      if (msg.type === 'show_cards') {
        if (!currentRoomCode || !currentPlayerId) return;
        const room = getRoom(currentRoomCode);
        const game = room?.state.game;
        if (!room || !game) return;
        if (game.phase !== 'finished' && game.phase !== 'showdown') {
          ws.send(JSON.stringify({ type: 'error', error: 'You can only show your cards once the hand is over' }));
          return;
        }
        if (!game.players.some((p) => p.id === currentPlayerId)) return;
        if (!game.revealedPlayerIds) game.revealedPlayerIds = [];
        if (!game.revealedPlayerIds.includes(currentPlayerId)) {
          game.revealedPlayerIds.push(currentPlayerId);
        }
        ensureRoomStateBeforeSend(room);
        broadcast(currentRoomCode, { type: 'room_state', state: room.state });
        return;
      }

      if (msg.type === 'set_test_scenario') {
        if (!currentRoomCode || !currentPlayerId) return;
        const room = getRoom(currentRoomCode);
        if (!room) return;
        if (!room.state.config.testMode) {
          ws.send(JSON.stringify({ type: 'error', error: 'Test mode is not enabled for this room' }));
          return;
        }
        if (room.state.hostId !== currentPlayerId) {
          ws.send(JSON.stringify({ type: 'error', error: 'Only the host can queue a test scenario' }));
          return;
        }
        const requested = msg.testScenario ?? null;
        if (requested && !getTestScenario(requested)) {
          ws.send(JSON.stringify({ type: 'error', error: 'Unknown test scenario' }));
          return;
        }
        room.state.pendingTestScenario = requested ?? undefined;
        ensureRoomStateBeforeSend(room);
        broadcast(currentRoomCode, { type: 'room_state', state: room.state });
        return;
      }

      if (msg.type === 'leave_room') {
        if (currentRoomCode && currentPlayerId) {
          handleDeparture(currentRoomCode, currentPlayerId);
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
      handleDeparture(currentRoomCode, currentPlayerId);
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`Poker server listening on port ${PORT}`);
});
