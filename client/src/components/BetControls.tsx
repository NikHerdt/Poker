import { useEffect, useState } from 'react';
import type { GameState, Player } from 'shared/types';

interface BetControlsProps {
  game: GameState;
  me: Player;
  /** Chips in the middle plus every live bet. */
  totalPot: number;
  /** Room blind, used if the hand itself did not carry one. */
  configBigBlind: number;
  onAction: (action: { type: 'fold' | 'check' | 'call' | 'raise'; amount?: number }) => void;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
/** Never let a missing or malformed number reach the buttons as NaN. */
const positive = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;

/**
 * Betting controls that follow normal table rules: check or call, and open for
 * at least a big blind or raise by at least the size of the last raise. You can
 * always shove for less than that.
 */
export function BetControls({ game, me, totalPot, configBigBlind, onAction }: BetControlsProps) {
  const bigBlind = positive(game.bigBlind, positive(configBigBlind, 2));
  const minRaiseStep = positive(game.minRaise, bigBlind);
  const toCall = Math.max(0, game.currentBet - me.currentBet);
  const isOpeningBet = game.currentBet === 0;

  // Most you can put out in total this round: your stack, or the pot in PLO.
  const stackMax = me.currentBet + me.chips;
  const collectedPot = game.pots.reduce((sum, pot) => sum + pot.amount, 0);
  const liveBets = game.players.reduce((sum, p) => sum + p.currentBet, 0);
  const maxTo = game.isPlo
    ? Math.min(me.currentBet + collectedPot + liveBets, stackMax)
    : stackMax;
  const minTo = Math.min(isOpeningBet ? bigBlind : game.currentBet + minRaiseStep, maxTo);

  const someoneCanCall = game.players.some(
    (p) => p.id !== me.id && !p.folded && !p.allIn && p.chips > 0
  );
  const canAggress = me.chips > 0 && maxTo > game.currentBet && someoneCanCall;

  const [amount, setAmount] = useState(minTo);
  useEffect(() => {
    setAmount((prev) => clamp(prev, minTo, maxTo));
  }, [minTo, maxTo]);

  const value = clamp(amount, minTo, maxTo);
  const isAllIn = value >= stackMax;
  const step = Math.max(1, bigBlind);
  /**
   * A pot-sized raise is: call first, then raise by the pot that call creates.
   * `game.currentBet` already includes your call, so the raise on top is the
   * only part that scales with the fraction.
   */
  const potRaiseTo = (fraction: number) =>
    clamp(Math.round(game.currentBet + fraction * (totalPot + toCall)), minTo, maxTo);

  const shortcuts: { label: string; to: number }[] = [
    { label: isOpeningBet ? 'Min bet' : 'Min', to: minTo },
    { label: '½ pot', to: potRaiseTo(0.5) },
    { label: 'Pot', to: potRaiseTo(1) },
    { label: 'All-in', to: maxTo },
  ];

  return (
    <div className="bet-controls">
      <div className="bet-primary">
        <button type="button" className="btn fold" onClick={() => onAction({ type: 'fold' })}>
          Fold
        </button>
        {toCall === 0 ? (
          <button type="button" className="btn check" onClick={() => onAction({ type: 'check' })}>
            Check
          </button>
        ) : (
          <button type="button" className="btn call" onClick={() => onAction({ type: 'call' })}>
            Call <b>{Math.min(toCall, me.chips)}</b>
            {toCall >= me.chips && <span className="btn-note">all-in</span>}
          </button>
        )}
        {canAggress && (
          <button
            type="button"
            className={`btn ${isAllIn ? 'allin' : 'raise'}`}
            onClick={() => onAction({ type: 'raise', amount: value })}
          >
            {isAllIn ? 'All-in' : isOpeningBet ? 'Bet' : 'Raise to'} <b>{value}</b>
          </button>
        )}
      </div>

      {canAggress && maxTo > minTo && (
        <div className="bet-sizing">
          <div className="bet-stepper">
            <button
              type="button"
              className="step-btn"
              aria-label="Decrease"
              disabled={value <= minTo}
              onClick={() => setAmount(clamp(value - step, minTo, maxTo))}
            >
              −
            </button>
            <input
              type="range"
              className="bet-slider"
              min={minTo}
              max={maxTo}
              step={1}
              value={value}
              onChange={(e) => setAmount(Number(e.target.value))}
              aria-label={isOpeningBet ? 'Bet amount' : 'Raise to'}
            />
            <button
              type="button"
              className="step-btn"
              aria-label="Increase"
              disabled={value >= maxTo}
              onClick={() => setAmount(clamp(value + step, minTo, maxTo))}
            >
              +
            </button>
          </div>
          <div className="bet-shortcuts">
            {shortcuts.map((shortcut) => (
              <button
                key={shortcut.label}
                type="button"
                className={`chip-btn ${value === shortcut.to ? 'selected' : ''}`}
                onClick={() => setAmount(shortcut.to)}
              >
                {shortcut.label}
              </button>
            ))}
          </div>
          <div className="bet-hint">
            {isOpeningBet ? `Min bet ${minTo}` : `Min raise to ${minTo}`} · max {maxTo}
          </div>
        </div>
      )}
    </div>
  );
}
