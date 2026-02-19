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
  card: Card;
  faceDown?: boolean;
  size?: 'small' | 'medium' | 'large' | 'hand';
}

const SIZES = {
  small: { w: 48, h: 67 },
  medium: { w: 72, h: 100 },
  large: { w: 96, h: 134 },
  hand: { w: 100, h: 140 },
};

export function CardImage({ card, faceDown = false, size = 'medium' }: CardImageProps) {
  const { w, h } = SIZES[size === 'hand' ? 'hand' : size];
  const src = faceDown ? CARD_BACK_URL : cardImageUrl(card);
  return (
    <img
      src={src}
      alt={faceDown ? 'Card back' : `${card.rank} of ${card.suit}`}
      width={w}
      height={h}
      className={`card-image card-size-${size}`}
      style={{
        width: w,
        height: h,
        objectFit: 'contain',
        borderRadius: 6,
        boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
      }}
    />
  );
}
