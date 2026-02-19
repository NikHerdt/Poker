import { useEffect, useState } from 'react';
import type { RoomState, Card, Player, GameState } from 'shared/types';
import type { UseGameSocketResult } from '../hooks/useGameSocket';
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
  const facingAllIn = game.players.some((p: Player) => p.id !== playerId && p.allIn);
  const bigBlind = state.config.bigBlind;
  const raiseMin = Math.max(bigBlind, game.currentBet + 1);
  const raiseMax = me ? me.currentBet + me.chips : raiseMin;
  const canRaise = me && me.chips > 0 && raiseMax > game.currentBet && !facingAllIn;
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
    game.lastAction?.action === 'raise';
  const [showFieldGoalMinigame, setShowFieldGoalMinigame] = useState(false);

  const handleFieldGoalComplete = (success: boolean) => {
    socket.sendFieldGoalAttempt(success);
    setShowFieldGoalMinigame(false);
  };

  return (
    <div className="table-page">
      <div className="table-header">
        <span className="phase">Hand #{game.handNumber} – {game.phase}</span>
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
          <button type="button" className="next-btn" onClick={socket.startGame}>
            Next hand
          </button>
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
}: {
  player: Player;
  isYou: boolean;
  showCards: boolean;
  isActing: boolean;
  name: string;
  phase: GameState['phase'];
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
      {player.currentBet > 0 && phase !== 'finished' && (
        <div className="bet">Bet: {player.currentBet}</div>
      )}
      {status.length > 0 && <div className="status">{status.join(' · ')}</div>}
      <div className="cards-wrap">
        {player.holeCards.map((c: Card, i: number) => (
          <CardImage key={i} card={c} faceDown={!showCards} size="hand" />
        ))}
      </div>
    </div>
  );
}
