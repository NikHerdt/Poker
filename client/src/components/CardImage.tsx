import type { Card } from 'shared/types';

const CARD_BASE = 'https://deckofcardsapi.com/static/img';
const RANK_IMG: Record<string, string> = {
  '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
  'T': '0', 'J': 'J', 'Q': 'Q', 'K': 'K', 'A': 'A',
};
const SUIT_IMG: Record<string, string> = { c: 'C', d: 'D', h: 'H', s: 'S' };

function cardImageUrl(card: Card): string {
  const r = RANK_IMG[card.rank] ?? card.rank;
  const s = SUIT_IMG[card.suit] ?? card.suit.toUpperCase();
  return `${CARD_BASE}/${r}${s}.png`;
}

const CARD_BACK_URL = `${CARD_BASE}/back.png`;

interface CardImageProps {
  /** Omit for a face-down card in a hand nobody has shown. */
  card?: Card;
  faceDown?: boolean;
  size?: 'community' | 'hand' | 'mine';
  /** Set on a freshly dealt card to make it sail in; stagger with the delay. */
  dealDelayMs?: number;
}

/**
 * Both faces are always rendered, back to back, so turning a card face up is a
 * real flip rather than a swap. Sizes come from CSS (see Table.css) so the
 * whole table can shrink to fit a phone.
 */
export function CardImage({ card, faceDown = false, size = 'hand', dealDelayMs }: CardImageProps) {
  const faceUp = !faceDown && !!card;
  const label = faceUp ? `${card!.rank} of ${card!.suit}` : 'Face-down card';

  return (
    <div
      className={`card card-${size}${dealDelayMs != null ? ' is-dealing' : ''}`}
      style={dealDelayMs != null ? { animationDelay: `${dealDelayMs}ms` } : undefined}
      role="img"
      aria-label={label}
    >
      <div className={`card-inner${faceUp ? ' is-face-up' : ''}`}>
        <img className="card-face card-back" src={CARD_BACK_URL} alt="" draggable={false} />
        {card && (
          <img className="card-face card-front" src={cardImageUrl(card)} alt="" draggable={false} />
        )}
      </div>
    </div>
  );
}
