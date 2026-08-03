import type { Card, Player } from 'shared/types';
import { CardImage } from './CardImage';

export interface SeatPosition {
  /** Percentage coordinates within the table area. */
  left: number;
  top: number;
  /** Unit vector pointing from the table centre out towards this seat. */
  outX: number;
  outY: number;
}

interface PlayerSeatProps {
  player: Player;
  name: string;
  isYou: boolean;
  isActing: boolean;
  /** Seconds left on this player's clock, when it is their turn. */
  secondsLeft: number | null;
  isWinner: boolean;
  isDealer: boolean;
  /** Their cards are face up: it is you, or they chose to show. */
  revealed: boolean;
  position: SeatPosition;
}

export function PlayerSeat({
  player,
  name,
  isYou,
  isActing,
  secondsLeft,
  isWinner,
  isDealer,
  revealed,
  position,
}: PlayerSeatProps) {
  const cardCount = player.holeCards.length || player.holeCardCount || 2;
  const cards: (Card | undefined)[] = revealed
    ? player.holeCards
    : Array.from({ length: cardCount }, () => undefined);

  const className = [
    'seat',
    isYou && 'is-you',
    isActing && 'is-acting',
    isWinner && 'is-winner',
    player.folded && 'is-folded',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={className} style={{ left: `${position.left}%`, top: `${position.top}%` }}>
      {isWinner && <div className="seat-winner-tag">Winner</div>}
      <div className="seat-cards">
        {cards.map((card, i) => (
          <CardImage key={i} card={card} faceDown={!revealed} size={isYou ? 'mine' : 'hand'} />
        ))}
      </div>
      <div className="seat-body">
        <div className="seat-name">
          {name}
          {isYou && <span className="seat-you">you</span>}
        </div>
        {/* Chips, blind markers and last action share one line to keep seats
            short enough that a full ring of them does not collide. */}
        <div className="seat-meta">
          <span className="seat-chips">{player.chips}</span>
          {isDealer && (
            <span className="marker dealer" title="Dealer button">
              D
            </span>
          )}
          {player.isSmallBlind && (
            <span className="marker sb" title="Small blind">
              SB
            </span>
          )}
          {player.isBigBlind && (
            <span className="marker bb" title="Big blind">
              BB
            </span>
          )}
          {player.folded ? (
            <span className="seat-action action-fold">folded</span>
          ) : isActing && secondsLeft != null ? (
            <span className={`seat-clock ${secondsLeft <= 10 ? 'urgent' : ''}`}>{secondsLeft}s</span>
          ) : (
            player.lastActionLabel && (
              <span className={`seat-action action-${player.lastActionLabel}`}>{player.lastActionLabel}</span>
            )
          )}
        </div>
      </div>
    </div>
  );
}

/** The chips a player has pushed out this betting round, sitting on the felt. */
export function SeatBet({ amount, position }: { amount: number; position: SeatPosition }) {
  return (
    <div
      className="seat-bet"
      style={{
        left: `${position.left}%`,
        top: `${position.top}%`,
        // The chips animate in from the player's side of the table.
        ['--from-x' as string]: `${position.outX * 26}px`,
        ['--from-y' as string]: `${position.outY * 26}px`,
      }}
    >
      <span className="bet-chip" />
      {amount}
    </div>
  );
}
