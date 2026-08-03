import type { Card } from 'shared/types';
import { CardImage } from './CardImage';

const SUIT_SYMBOL: Record<string, string> = { c: '♣', d: '♦', h: '♥', s: '♠' };

/**
 * Your own cards, shown next to the action buttons rather than only in your
 * seat. The seat has to stay small so a full ring of players fits, but this has
 * the room to be read at a glance — with the ranks spelled out underneath for
 * when the card faces themselves are small.
 */
export function MyHand({
  cards,
  description,
  folded,
}: {
  cards: Card[];
  description: string | null;
  folded: boolean;
}) {
  if (!cards.length) return null;

  return (
    <div className={`my-hand ${folded ? 'is-folded' : ''}`}>
      <div className="my-hand-cards">
        {cards.map((card, i) => (
          <CardImage key={i} card={card} size="mine" />
        ))}
      </div>
      <div className="my-hand-text">
        <div className="my-hand-codes">
          {cards.map((card, i) => (
            <span key={i} className={`card-code suit-${card.suit}`}>
              {card.rank === 'T' ? '10' : card.rank}
              {SUIT_SYMBOL[card.suit] ?? card.suit}
            </span>
          ))}
        </div>
        {folded ? (
          <div className="my-hand-desc muted">Folded</div>
        ) : (
          description && <div className="my-hand-desc">{description}</div>
        )}
      </div>
    </div>
  );
}
