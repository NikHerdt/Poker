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
}

/**
 * Card sizes are set in CSS (see Table.css) rather than in pixels here, so the
 * whole table can shrink to fit a phone screen without scrolling.
 */
export function CardImage({ card, faceDown = false, size = 'hand' }: CardImageProps) {
  const hidden = faceDown || !card;
  const src = hidden ? CARD_BACK_URL : cardImageUrl(card);
  return (
    <img
      src={src}
      alt={hidden ? 'Face-down card' : `${card!.rank} of ${card!.suit}`}
      className={`card-image card-${size}`}
      draggable={false}
    />
  );
}
