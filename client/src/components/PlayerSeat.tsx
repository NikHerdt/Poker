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
  isWinner: boolean;
  isDealer: boolean;
  /** Their cards are face up: it is you, or they chose to show. */
  revealed: boolean;
  handDescription: string | null;
  position: SeatPosition;
}

export function PlayerSeat({
  player,
  name,
  isYou,
  isActing,
  isWinner,
  isDealer,
  revealed,
  handDescription,
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
        <div className="seat-chips">{player.chips}</div>
        {(isDealer || player.isSmallBlind || player.isBigBlind) && (
          <div className="seat-markers">
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
          </div>
        )}
        {player.lastActionLabel && !player.folded && (
          <div className={`seat-action action-${player.lastActionLabel}`}>{player.lastActionLabel}</div>
        )}
        {player.folded && <div className="seat-action action-fold">folded</div>}
      </div>
      {handDescription && !player.folded && <div className="seat-hand">{handDescription}</div>}
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
