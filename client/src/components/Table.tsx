import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RoomState, Card, Player } from 'shared/types';
import type { UseGameSocketResult } from '../hooks/useGameSocket';
import { evaluateHand, evaluateHandOmaha, formatHandDescription } from 'shared/hand-eval';
import { getTestScenario } from 'shared/test-scenarios';
import { MAX_PLO_PLAYERS } from 'shared/constants';
import { CardImage } from './CardImage';
import { PlayerSeat, SeatBet, type SeatPosition } from './PlayerSeat';
import { MyHand } from './MyHand';
import { BetControls } from './BetControls';
import { BlindLevelBadge } from './BlindLevelBadge';
import { TestScenarioPicker } from './TestScenarioPicker';
import { FieldGoalMinigame } from './FieldGoalMinigame';
import './Table.css';
import './FieldGoalMinigame.css';

interface TableProps {
  state: RoomState;
  playerId: string;
  socket: UseGameSocketResult;
}

/** Past this many seats the ring gets crowded, so seats and cards shrink. */
const TIGHT_SEAT_COUNT = 8;

/**
 * Seats laid out around an oval, with you at the bottom and everyone else
 * running clockwise from there, so the table reads the same for every player.
 * A full table pushes the ring out slightly to buy room between neighbours.
 */
function seatPositions(count: number): SeatPosition[] {
  const radiusX = count > TIGHT_SEAT_COUNT ? 41 : 39;
  const radiusY = count > TIGHT_SEAT_COUNT ? 44 : 40;
  return Array.from({ length: count }, (_, i) => {
    const angle = Math.PI / 2 + (i * 2 * Math.PI) / count;
    const outX = Math.cos(angle);
    const outY = Math.sin(angle);
    return { left: 50 + outX * radiusX, top: 50 + outY * radiusY, outX, outY };
  });
}

function betPosition(seat: SeatPosition): SeatPosition {
  return { ...seat, left: 50 + seat.outX * 19, top: 50 + seat.outY * 20 };
}

export function Table({ state, playerId, socket }: TableProps) {
  const game = state.game!;
  const me = game.players.find((p: Player) => p.id === playerId);
  const isMyTurn =
    !!me &&
    game.phase !== 'showdown' &&
    game.phase !== 'finished' &&
    game.actingPlayerIndex >= 0 &&
    game.players[game.actingPlayerIndex]?.id === playerId &&
    !me.folded &&
    !me.allIn;
  const handOver = game.phase === 'finished';

  // Everything committed this hand: `pots` only covers rounds that have closed.
  const totalPot = game.players.reduce((s: number, p: Player) => s + p.totalBetThisHand, 0);
  const revealed = new Set(game.revealedPlayerIds ?? []);
  const winners = new Set(game.winnerIds ?? []);

  // The countdown belongs to the server: it is the one that will check or fold
  // for you when it runs out, so the display is anchored to its deadline.
  const deadline = game.actingDeadlineMs;
  const clockBase = useRef({ serverNowMs: Date.now(), localNowMs: Date.now() });
  const serverNowMs = state.serverNowMs;
  useEffect(() => {
    if (serverNowMs != null) clockBase.current = { serverNowMs, localNowMs: Date.now() };
  }, [serverNowMs]);

  const secondsLeft = useCallback(() => {
    if (deadline == null) return null;
    const estimatedNow = clockBase.current.serverNowMs + (Date.now() - clockBase.current.localNowMs);
    return Math.max(0, Math.ceil((deadline - estimatedNow) / 1000));
  }, [deadline]);

  const [turnSecondsLeft, setTurnSecondsLeft] = useState<number | null>(secondsLeft);
  useEffect(() => {
    setTurnSecondsLeft(secondsLeft());
    if (deadline == null) return;
    const t = setInterval(() => setTurnSecondsLeft(secondsLeft()), 500);
    return () => clearInterval(t);
  }, [deadline, secondsLeft]);

  // Rotate the table so you are always the bottom seat.
  const seats = useMemo(() => {
    const players = game.players;
    const myIndex = players.findIndex((p: Player) => p.id === playerId);
    const start = myIndex >= 0 ? myIndex : 0;
    return players.map((_: Player, i: number) => players[(start + i) % players.length]);
  }, [game.players, playerId]);
  const positions = useMemo(() => seatPositions(seats.length), [seats.length]);

  const canFieldGoal =
    !!me &&
    !me.folded &&
    !me.allIn &&
    me.chips > 0 &&
    game.phase !== 'showdown' &&
    game.phase !== 'finished' &&
    !(state.fieldGoalUsed ?? {})[playerId] &&
    game.lastAction?.action === 'raise' &&
    game.lastAction?.playerId !== playerId &&
    me.currentBet < game.currentBet;
  const [showFieldGoalMinigame, setShowFieldGoalMinigame] = useState(false);

  const fieldGoalReason = (state.fieldGoalUsed ?? {})[playerId]
    ? 'You already used your field goal'
    : game.lastAction?.action !== 'raise'
      ? 'Only a live raise can be field goaled'
      : game.lastAction?.playerId === playerId
        ? 'You cannot field goal your own raise'
        : me && me.currentBet >= game.currentBet
          ? 'You have already matched that bet'
          : 'Kick a field goal to reverse the last raise';

  const myHandDescription = useMemo(() => {
    if (!me?.holeCards?.length || me.folded) return null;
    const community = game.communityCards ?? [];
    try {
      const result = game.isPlo
        ? evaluateHandOmaha(me.holeCards, community)
        : evaluateHand(me.holeCards, community);
      return formatHandDescription(result);
    } catch {
      return null;
    }
  }, [me?.id, me?.holeCards, me?.folded, game.communityCards, game.isPlo]);

  const handleFieldGoalComplete = (success: boolean) => {
    socket.sendFieldGoalAttempt(success);
    setShowFieldGoalMinigame(false);
  };

  const pendingJoins = Object.entries(state.joinRequests ?? {}).filter(
    ([, status]) => status === 'pending'
  );
  const isHost = state.hostId === playerId;
  const myJoinStatus = state.joinRequests?.[playerId];

  return (
    <div className="table-page">
      <header className="table-header">
        <span className="phase">
          Hand #{game.handNumber}
          {game.isPlo ? ' · PLO · ' : ' · '}
          {game.phase}
        </span>
        <BlindLevelBadge state={state} game={game} />
        {state.config.testMode && <span className="test-mode-chip">Test mode</span>}
        <button type="button" className="leave-btn" onClick={socket.leaveRoom}>
          Leave
        </button>
      </header>

      {game.testScenario && (
        <div className="test-banner">Rigged hand: {getTestScenario(game.testScenario)?.expectation}</div>
      )}

      {myJoinStatus === 'pending' && (
        <div className="notice">Waiting for the host to let you in. You will be dealt in next hand.</div>
      )}
      {myJoinStatus === 'denied' && (
        <div className="notice">The host declined your request to join.</div>
      )}
      {isHost && pendingJoins.length > 0 && (
        <div className="notice join-requests">
          {pendingJoins.map(([id]) => (
            <div key={id} className="join-request">
              <span>
                <b>{state.playerIdToName[id] ?? 'A player'}</b> wants to join.
              </span>
              <span className="join-actions">
                <button type="button" className="btn admit" onClick={() => socket.approveJoin(id)}>
                  Admit
                </button>
                <button type="button" className="btn decline" onClick={() => socket.denyJoin(id)}>
                  Decline
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="table-area" data-density={seats.length > TIGHT_SEAT_COUNT ? 'tight' : 'roomy'}>
        <div className="table-felt" />

        <div className="table-center">
          <div className="pot">
            <span className="pot-label">Pot</span>
            <span className="pot-amount">{totalPot}</span>
          </div>
          <div className="community-cards">
            {game.communityCards.map((c: Card, i: number) => (
              <CardImage key={i} card={c} size="community" />
            ))}
          </div>
          {handOver && game.winnerIds?.length ? (
            <div className="center-result">
              {game.winnerIds.map((id: string) => state.playerIdToName[id] ?? id).join(' & ')} wins
              {game.lastWinningHand && (
                <span className="center-hand"> · {game.lastWinningHand.rank.replace(/_/g, ' ')}</span>
              )}
            </div>
          ) : null}
        </div>

        {seats.map((p: Player, i: number) => (
          <PlayerSeat
            key={p.id}
            player={p}
            name={state.playerIdToName[p.id] ?? p.name}
            isYou={p.id === playerId}
            isActing={game.players[game.actingPlayerIndex]?.id === p.id && !handOver}
            secondsLeft={
              game.players[game.actingPlayerIndex]?.id === p.id && !handOver ? turnSecondsLeft : null
            }
            isWinner={handOver && winners.has(p.id)}
            isDealer={p.isDealer}
            revealed={p.id === playerId || revealed.has(p.id)}
            position={positions[i]}
          />
        ))}

        {/* Once the hand is over the chips are in the pot, so the felt clears. */}
        {!handOver &&
          seats.map((p: Player, i: number) =>
            p.currentBet > 0 ? (
              <SeatBet key={`bet-${p.id}`} amount={p.currentBet} position={betPosition(positions[i])} />
            ) : null
          )}
      </div>

      {showFieldGoalMinigame && <FieldGoalMinigame onComplete={handleFieldGoalComplete} />}

      <div className="table-actions">
        {me && !handOver && game.phase !== 'showdown' && (
          <>
            <div className="action-meta">
              <MyHand cards={me.holeCards} description={myHandDescription} folded={me.folded} />
              <div className="action-status">
                {isMyTurn && turnSecondsLeft != null && (
                  <span className={`timer ${turnSecondsLeft <= 10 ? 'urgent' : ''}`}>
                    Your turn · {turnSecondsLeft}s
                  </span>
                )}
                {!isMyTurn && !me.folded && <span className="waiting">Waiting…</span>}
                {!me.folded && (
                  <button
                    type="button"
                    className={`btn fieldgoal ${!canFieldGoal ? 'is-disabled' : ''}`}
                    onClick={() => canFieldGoal && setShowFieldGoalMinigame(true)}
                    disabled={!canFieldGoal}
                    title={fieldGoalReason}
                  >
                    Field Goal
                  </button>
                )}
              </div>
            </div>
            {isMyTurn && !me.folded && (
              <BetControls game={game} me={me} totalPot={totalPot} onAction={socket.sendAction} />
            )}
          </>
        )}

        {handOver && (
          <ResultPanel
            state={state}
            game={game}
            playerId={playerId}
            me={me}
            revealed={revealed}
            socket={socket}
          />
        )}
      </div>
    </div>
  );
}

function ResultPanel({
  state,
  game,
  playerId,
  me,
  revealed,
  socket,
}: {
  state: RoomState;
  game: NonNullable<RoomState['game']>;
  playerId: string;
  me: Player | undefined;
  revealed: Set<string>;
  socket: UseGameSocketResult;
}) {
  const isHost = state.hostId === playerId;
  // Players who left are still shown in the finished hand, but they neither owe
  // a rebuy answer nor count towards starting the next hand.
  const stillHere = (id: string) => state.playerIdToName[id] !== undefined;
  const zeroChipIds = game.players
    .filter((p: Player) => p.chips <= 0 && stillHere(p.id))
    .map((p: Player) => p.id);
  const allDecided = zeroChipIds.every((id: string) => {
    const d = state.rebuyDecisions?.[id];
    return d === 'yes' || d === 'no';
  });
  const activeCount =
    game.players.filter((p: Player) => p.chips > 0 && stillHere(p.id)).length +
    zeroChipIds.filter((id: string) => state.rebuyDecisions?.[id] === 'yes').length +
    Object.keys(state.rebuyRequested ?? {}).filter(
      (id: string) => !game.players.some((p: Player) => p.id === id)
    ).length;

  return (
    <div className="result-panel">
      {game.houseRuleBonuses?.map((b: { playerId: string; type: '72' | '69'; amount: number }, i: number) => (
        <div key={i} className="bonus">
          House rule: {b.type === '72' ? '7-2' : '6-9'} bonus · +{b.amount} to{' '}
          {state.playerIdToName[b.playerId]}
        </div>
      ))}

      <div className="result-actions">
        {me &&
          (revealed.has(playerId) ? (
            <span className="shown-note">Your cards are face up.</span>
          ) : (
            <button type="button" className="btn show-cards" onClick={socket.sendShowCards}>
              Show my cards
            </button>
          ))}
        {/* Anyone at the table can deal the next hand. */}
        <button
          type="button"
          className="btn next-hand"
          onClick={socket.startGame}
          disabled={!allDecided || activeCount < 2}
          title={
            !allDecided
              ? 'Waiting for rebuy decisions'
              : activeCount < 2
                ? 'Need at least 2 players to start'
                : 'Deal the next hand'
          }
        >
          Next hand
        </button>
        {!state.ploVoteConcluded && !state.ploVote && game.players.length <= MAX_PLO_PLAYERS && (
          <button type="button" className="btn plo-vote" onClick={socket.sendPloVoteStart}>
            PLO vote
          </button>
        )}
        {!state.ploVoteConcluded && !state.ploVote && game.players.length > MAX_PLO_PLAYERS && (
          <span className="plo-unavailable">
            PLO needs four cards each, so it is off above {MAX_PLO_PLAYERS} players
          </span>
        )}
      </div>

      {me && me.chips <= 0 && state.rebuyDecisions?.[playerId] === 'pending' && (
        <div className="rebuy-prompt">
          <p>You are out of chips. Buy back in for the next hand?</p>
          <div className="rebuy-buttons">
            <button type="button" className="btn rebuy-yes" onClick={socket.sendRebuyYes}>
              Yes, buy in
            </button>
            <button type="button" className="btn rebuy-no" onClick={socket.sendRebuyNo}>
              No, sit out
            </button>
          </div>
        </div>
      )}

      {!me && (
        <div className="rebuy-prompt spectator">
          <p>You are watching. Buy in to join at the start of the next hand.</p>
          {state.rebuyRequested?.[playerId] ? (
            <p className="rebuy-requested">You are in as soon as the host starts the next hand.</p>
          ) : (
            <button type="button" className="btn rebuy-yes" onClick={socket.sendRequestRebuy}>
              Buy back in
            </button>
          )}
        </div>
      )}

      {state.config.testMode && (
        <TestScenarioPicker
          isHost={isHost}
          pendingScenario={state.pendingTestScenario}
          onSelect={socket.sendTestScenario}
        />
      )}

      {!state.ploVoteConcluded && state.ploVote && (
        <div className="plo-vote-section">
          <p className="plo-vote-label">
            Vote for the next round to be Pot Limit Omaha. Majority wins.
            {state.ploVoteInitiator && state.playerIdToName[state.ploVoteInitiator] && (
              <span> Started by {state.playerIdToName[state.ploVoteInitiator]}.</span>
            )}
          </p>
          <div className="plo-vote-tally">
            Yes: {game.players.filter((p: Player) => state.ploVote!.votes[p.id] === 'yes').length} · No:{' '}
            {game.players.filter((p: Player) => state.ploVote!.votes[p.id] === 'no').length}
          </div>
          <div className="plo-vote-buttons">
            <button type="button" className="btn rebuy-yes" onClick={socket.sendPloVoteYes}>
              Yes
            </button>
            <button type="button" className="btn rebuy-no" onClick={socket.sendPloVoteNo}>
              No
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
