import { useEffect, useMemo, useState } from 'react';
import type { RoomState, Card, Player, GameState } from 'shared/types';
import type { UseGameSocketResult } from '../hooks/useGameSocket';
import { evaluateHand, evaluateHandOmaha, formatHandDescription } from 'shared/hand-eval';
import { CardImage } from './CardImage';
import { FieldGoalMinigame } from './FieldGoalMinigame';
import './Table.css';
import './FieldGoalMinigame.css';

const TURN_TIMER_SECONDS = 60;

interface TableProps {
  state: RoomState;
  playerId: string;
  socket: UseGameSocketResult;
}

export function Table({ state, playerId, socket }: TableProps) {
  const game = state.game!;
  const me = game.players.find((p: Player) => p.id === playerId);
  const isMyTurn = me && game.phase !== 'showdown' && game.phase !== 'finished' && game.actingPlayerIndex >= 0 && game.players[game.actingPlayerIndex]?.id === playerId && !me.folded && !me.allIn;
  const canAct = isMyTurn;
  const totalPot = game.pots.reduce((s: number, p: { amount: number }) => s + p.amount, 0);

  const [turnSecondsLeft, setTurnSecondsLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!isMyTurn) {
      setTurnSecondsLeft(null);
      return;
    }
    setTurnSecondsLeft(TURN_TIMER_SECONDS);
    const t = setInterval(() => {
      setTurnSecondsLeft((s) => (s == null || s <= 1 ? null : s - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [isMyTurn, game.actingPlayerIndex, game.phase]);
  const toCall = me ? Math.max(0, game.currentBet - me.currentBet) : 0;
  const anotherPlayerWithChips = game.players.some((p: Player) => p.id !== playerId && !p.folded && !p.allIn && p.chips > 0);
  const bigBlind = state.config.bigBlind;
  let raiseMin = Math.max(bigBlind, game.currentBet + 1);
  let raiseMax = me ? me.currentBet + me.chips : raiseMin;
  if (game.isPlo && me) {
    const currentBetsTotal = game.players.reduce((s: number, p: Player) => s + p.currentBet, 0);
    const potForLimit = totalPot + currentBetsTotal;
    const potLimitMax = me.currentBet + potForLimit;
    raiseMax = Math.min(potLimitMax, me.currentBet + me.chips);
    raiseMin = Math.max(raiseMin, game.currentBet + 1);
  }
  const canRaise = me && me.chips > 0 && raiseMax > game.currentBet && anotherPlayerWithChips;
  const effectiveRaiseMin = Math.min(raiseMin, raiseMax);
  const effectiveRaiseMax = Math.max(raiseMin, raiseMax);
  const showSlider = canRaise && effectiveRaiseMax > effectiveRaiseMin;
  const [raiseAmount, setRaiseAmount] = useState(effectiveRaiseMin);
  useEffect(() => {
    setRaiseAmount((prev) => Math.max(effectiveRaiseMin, Math.min(effectiveRaiseMax, prev)));
  }, [effectiveRaiseMin, effectiveRaiseMax]);
  const isAllIn = canRaise && (raiseAmount >= raiseMax || !showSlider);

  const canFieldGoal =
    me &&
    !me.folded &&
    game.phase !== 'showdown' &&
    game.phase !== 'finished' &&
    !(state.fieldGoalUsed ?? {})[playerId] &&
    game.lastAction?.action === 'raise' &&
    game.lastAction?.playerId !== playerId;
  const [showFieldGoalMinigame, setShowFieldGoalMinigame] = useState(false);

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

  return (
    <div className="table-page">
      <div className="table-header">
        <span className="phase">
          Hand #{game.handNumber}
          {game.isPlo ? ' – PLO – ' : ' – '}
          {game.phase}
        </span>
        <button type="button" className="leave-btn" onClick={socket.leaveRoom}>
          Leave
        </button>
      </div>

      <div className="table-felt">
        <div className="pot-area">
          <div className="pot-label">Pot</div>
          <div className="pot-amount">{totalPot}</div>
          <div className="community-cards">
            {game.communityCards.map((c: Card, i: number) => (
              <CardImage key={i} card={c} size="large" />
            ))}
          </div>
        </div>

        <div className="players-row">
          {game.players.map((p: Player) => (
            <PlayerSeat
              key={p.id}
              player={p}
              isYou={p.id === playerId}
              showCards={p.id === playerId || game.phase === 'showdown' || game.phase === 'finished'}
              isActing={game.actingPlayerIndex >= 0 && game.players[game.actingPlayerIndex]?.id === p.id}
              name={state.playerIdToName[p.id] ?? p.name}
              phase={game.phase}
              handDescription={p.id === playerId ? myHandDescription : null}
            />
          ))}
        </div>
      </div>

      {game.phase === 'finished' && (
        <div className="result-panel">
          {game.winnerIds?.length ? (
            <div className="winners">
              Winner{game.winnerIds.length > 1 ? 's' : ''}: {game.winnerIds.map((id: string) => state.playerIdToName[id] ?? id).join(', ')}
            </div>
          ) : null}
          {game.lastWinningHand && (
            <div className="hand-type">{game.lastWinningHand.rank.replace(/_/g, ' ')}</div>
          )}
          {game.houseRuleBonuses?.map((b: { playerId: string; type: '72' | '69'; amount: number }, i: number) => (
            <div key={i} className="bonus">
              House rule: {b.type === '72' ? '7-2' : '6-9'} bonus – +{b.amount} to {state.playerIdToName[b.playerId]}
            </div>
          ))}
          {me && me.chips <= 0 && state.rebuyDecisions?.[playerId] === 'pending' && (
            <div className="rebuy-prompt">
              <p>You are out of chips. Buy back in for the next hand?</p>
              <div className="rebuy-buttons">
                <button type="button" className="rebuy-yes-btn" onClick={socket.sendRebuyYes}>
                  Yes, buy in
                </button>
                <button type="button" className="rebuy-no-btn" onClick={socket.sendRebuyNo}>
                  No, sit out
                </button>
              </div>
            </div>
          )}
          {!me && game.phase === 'finished' && (
            <div className="rebuy-prompt spectator">
              <p>You are watching. You can buy back in to join at the start of the next hand.</p>
              {state.rebuyRequested?.[playerId] ? (
                <p className="rebuy-requested">Rebuy requested. You will be in when the host starts the next hand.</p>
              ) : (
                <button type="button" className="rebuy-yes-btn" onClick={socket.sendRequestRebuy}>
                  Buy back in
                </button>
              )}
            </div>
          )}
          {state.hostId === playerId && (() => {
            const zeroChipIds = game.players.filter((p: Player) => p.chips <= 0).map((p: Player) => p.id);
            const allDecided = zeroChipIds.every((id: string) => {
              const d = state.rebuyDecisions?.[id];
              return d === 'yes' || d === 'no';
            });
            const activeCount =
              game.players.filter((p: Player) => p.chips > 0).length +
              (zeroChipIds.filter((id: string) => state.rebuyDecisions?.[id] === 'yes').length) +
              (Object.keys(state.rebuyRequested ?? {}).filter((id: string) => !game.players.some((p: Player) => p.id === id)).length);
            const canStartNext = allDecided && activeCount >= 2;
            return (
              <button
                type="button"
                className="next-btn"
                onClick={socket.startGame}
                disabled={!canStartNext}
                title={!allDecided ? 'Waiting for rebuy decisions' : activeCount < 2 ? 'Need at least 2 players to start' : undefined}
              >
                Next hand
              </button>
            );
          })()}
          {state.hostId !== playerId && (() => {
            const zeroChipIds = game.players.filter((p: Player) => p.chips <= 0).map((p: Player) => p.id);
            const allDecided = zeroChipIds.every((id: string) => {
              const d = state.rebuyDecisions?.[id];
              return d === 'yes' || d === 'no';
            });
            if (allDecided) {
              return (
                <p className="waiting-host">Waiting for host to start next hand.</p>
              );
            }
            return null;
          })()}
          {!state.ploVoteConcluded && !state.ploVote && (
            <div className="plo-vote-section">
              <button type="button" className="plo-vote-btn" onClick={socket.sendPloVoteStart}>
                Start PLO vote
              </button>
            </div>
          )}
          {!state.ploVoteConcluded && state.ploVote && (
            <div className="plo-vote-section">
              <p className="plo-vote-label">
                Vote for next round to be PLO (Pot Limit Omaha). Majority wins.
                {state.ploVoteInitiator && state.playerIdToName[state.ploVoteInitiator] && (
                  <span> Started by {state.playerIdToName[state.ploVoteInitiator]}.</span>
                )}
              </p>
              <div className="plo-vote-tally">
                Yes: {game.players.filter((p: Player) => state.ploVote!.votes[p.id] === 'yes').length},{' '}
                No: {game.players.filter((p: Player) => state.ploVote!.votes[p.id] === 'no').length}
              </div>
              <div className="plo-vote-buttons">
                <button type="button" className="plo-vote-yes-btn" onClick={socket.sendPloVoteYes}>
                  Yes
                </button>
                <button type="button" className="plo-vote-no-btn" onClick={socket.sendPloVoteNo}>
                  No
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {showFieldGoalMinigame && (
        <FieldGoalMinigame onComplete={handleFieldGoalComplete} />
      )}

      {me && !me.folded && game.phase !== 'showdown' && game.phase !== 'finished' && (
        <div className="actions-bar">
          {canAct && turnSecondsLeft != null && (
            <div className="timer">Your turn – {turnSecondsLeft}s</div>
          )}
          <div className="buttons">
            <button
              type="button"
              className={`fieldgoal-btn ${!canFieldGoal ? 'fieldgoal-btn-disabled' : ''}`}
              onClick={() => canFieldGoal && setShowFieldGoalMinigame(true)}
              disabled={!canFieldGoal}
              title={
                (state.fieldGoalUsed ?? {})[playerId]
                  ? 'You already used your field goal'
                  : game.lastAction?.action !== 'raise'
                    ? 'Field goal only on a raise'
                    : game.lastAction?.playerId === playerId
                      ? 'You cannot field goal your own raise'
                      : 'Kick a field goal to reverse the last raise'
              }
            >
              Field Goal
            </button>
            {canAct && (
              <>
            <button type="button" className="fold-btn" onClick={() => socket.sendAction({ type: 'fold' })}>
              Fold
            </button>
            {toCall === 0 ? (
              <button type="button" className="check-call-btn" onClick={() => socket.sendAction({ type: 'check' })}>
                Check
              </button>
            ) : (
              <button type="button" className="check-call-btn" onClick={() => socket.sendAction({ type: 'call' })}>
                Call {toCall}
              </button>
            )}
            {canRaise && (
              <>
                {showSlider && (
                  <div className="raise-slider-wrap">
                    <label className="raise-slider-label">
                      Raise to: {raiseAmount >= raiseMax ? 'All-in' : raiseAmount}
                    </label>
                    <input
                      type="range"
                      className="raise-slider"
                      min={effectiveRaiseMin}
                      max={effectiveRaiseMax}
                      step={1}
                      value={Math.max(effectiveRaiseMin, Math.min(effectiveRaiseMax, raiseAmount))}
                      onChange={(e) => setRaiseAmount(Number(e.target.value))}
                    />
                  </div>
                )}
                <button
                  type="button"
                  className={isAllIn ? 'allin-btn' : 'raise-btn'}
                  onClick={() => socket.sendAction({ type: 'raise', amount: showSlider ? Math.max(effectiveRaiseMin, Math.min(effectiveRaiseMax, raiseAmount)) : raiseMax })}
                >
                  {isAllIn ? 'All-in' : `Raise to ${showSlider ? raiseAmount : raiseMax}`}
                </button>
              </>
            )}
            </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PlayerSeat({
  player,
  isYou,
  showCards,
  isActing,
  name,
  phase,
  handDescription,
}: {
  player: Player;
  isYou: boolean;
  showCards: boolean;
  isActing: boolean;
  name: string;
  phase: GameState['phase'];
  handDescription: string | null;
}) {
  const status: string[] = [];
  if (player.folded) status.push('Folded');
  if (player.allIn) status.push('All-in');

  return (
    <div
      className={`player-seat ${isYou ? 'is-you' : ''} ${isActing ? 'is-acting' : ''} ${player.folded ? 'folded' : ''}`}
    >
      <div className="name-row">
        <div className="name">
          {name}
          {isYou && <span className="you-badge">(you)</span>}
        </div>
        {(player.isSmallBlind || player.isBigBlind) && (
          <div className="blind-markers">
            {player.isSmallBlind && <span className="blind-chip sb">SB</span>}
            {player.isBigBlind && <span className="blind-chip bb">BB</span>}
          </div>
        )}
      </div>
      <div className="chips">{player.chips} chips</div>
      <div className="buy-in-count">Buy-ins: {player.buyInCount ?? 1}</div>
      {player.currentBet > 0 && phase !== 'finished' && (
        <div className="bet">Bet: {player.currentBet}</div>
      )}
      {status.length > 0 && <div className="status">{status.join(' · ')}</div>}
      <div className="cards-wrap">
        {player.holeCards.map((c: Card, i: number) => (
          <CardImage key={i} card={c} faceDown={!showCards} size="hand" />
        ))}
      </div>
      {handDescription && !player.folded && (
        <div className="hand-description">{handDescription}</div>
      )}
    </div>
  );
}
