import type { Card, HandResult } from './types';
import { RANKS, HAND_RANK_ORDER } from './constants';

const RANK_VALUES: Record<string, number> = {};
RANKS.forEach((r, i) => {
  RANK_VALUES[r] = i + 2;
});

function rankValue(rank: string): number {
  return RANK_VALUES[rank] ?? 0;
}

function cardValue(c: Card): number {
  return rankValue(c.rank);
}

function sortByValue(cards: Card[], desc = true): Card[] {
  const out = [...cards].sort((a, b) => cardValue(b) - cardValue(a));
  return desc ? out : out.reverse();
}

function countByRank(cards: Card[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const c of cards) {
    const v = rankValue(c.rank);
    m.set(v, (m.get(v) ?? 0) + 1);
  }
  return m;
}

function countBySuit(cards: Card[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of cards) {
    m.set(c.suit, (m.get(c.suit) ?? 0) + 1);
  }
  return m;
}

function isStraight(values: number[]): number | null {
  const uniq = [...new Set(values)].sort((a, b) => b - a);
  if (uniq.length < 5) return null;
  for (let i = 0; i <= uniq.length - 5; i++) {
    const slice = uniq.slice(i, i + 5);
    if (slice[0] - slice[4] === 4) return slice[0];
    if (slice[0] === 14 && slice[1] === 5 && slice[4] === 2) return 5;
  }
  return null;
}

function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const rest = combinations(arr.slice(1), k - 1).map((c) => [arr[0], ...c]);
  return [...rest, ...combinations(arr.slice(1), k)];
}

function evaluateFive(cards: Card[]): Omit<HandResult, 'is72' | 'is69' | 'pairCountIn7'> {
  const values = cards.map(cardValue);
  const byRank = countByRank(cards);
  const bySuit = countBySuit(cards);
  const counts = [...byRank.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const flushSuit = [...bySuit.entries()].find(([, n]) => n >= 5)?.[0];
  const flushCards = flushSuit ? cards.filter((c) => c.suit === flushSuit) : [];
  const straightHigh = flushCards.length >= 5
    ? isStraight(flushCards.map(cardValue))
    : isStraight(values);

  if (flushSuit && straightHigh !== null) {
    const flushVals = sortByValue(flushCards).map(cardValue);
    const sh = flushCards.length >= 5 ? isStraight(flushVals) ?? straightHigh : straightHigh;
    return {
      rank: 'straight_flush',
      rankValue: HAND_RANK_ORDER.indexOf('straight_flush'),
      tiebreak: [sh === 5 ? 5 : sh],
      cards,
    };
  }

  if (counts[0][1] === 4) {
    const kicker = counts.find(([v]) => v !== counts[0][0])?.[0] ?? 0;
    return {
      rank: 'four_of_a_kind',
      rankValue: HAND_RANK_ORDER.indexOf('four_of_a_kind'),
      tiebreak: [counts[0][0], kicker],
      cards,
    };
  }

  if (counts[0][1] === 3 && counts[1][1] >= 2) {
    return {
      rank: 'full_house',
      rankValue: HAND_RANK_ORDER.indexOf('full_house'),
      tiebreak: [counts[0][0], counts[1][0]],
      cards,
    };
  }

  if (flushSuit && flushCards.length >= 5) {
    const tiebreak = sortByValue(flushCards)
      .slice(0, 5)
      .map(cardValue);
    return {
      rank: 'flush',
      rankValue: HAND_RANK_ORDER.indexOf('flush'),
      tiebreak,
      cards,
    };
  }

  if (straightHigh !== null) {
    return {
      rank: 'straight',
      rankValue: HAND_RANK_ORDER.indexOf('straight'),
      tiebreak: [straightHigh === 5 ? 5 : straightHigh],
      cards,
    };
  }

  if (counts[0][1] === 3) {
    const kickers = counts.filter(([v]) => v !== counts[0][0]).map(([v]) => v);
    return {
      rank: 'three_of_a_kind',
      rankValue: HAND_RANK_ORDER.indexOf('three_of_a_kind'),
      tiebreak: [counts[0][0], ...kickers.slice(0, 2)],
      cards,
    };
  }

  if (counts[0][1] === 2 && counts[1][1] === 2) {
    const high = Math.max(counts[0][0], counts[1][0]);
    const low = Math.min(counts[0][0], counts[1][0]);
    const kicker = counts.find(([v]) => v !== counts[0][0] && v !== counts[1][0])?.[0] ?? 0;
    return {
      rank: 'two_pair',
      rankValue: HAND_RANK_ORDER.indexOf('two_pair'),
      tiebreak: [high, low, kicker],
      cards,
    };
  }

  if (counts[0][1] === 2) {
    const kickers = counts.filter(([v]) => v !== counts[0][0]).map(([v]) => v);
    return {
      rank: 'pair',
      rankValue: HAND_RANK_ORDER.indexOf('pair'),
      tiebreak: [counts[0][0], ...kickers.slice(0, 3)],
      cards,
    };
  }

  const high = sortByValue(cards).slice(0, 5).map(cardValue);
  return {
    rank: 'high_card',
    rankValue: HAND_RANK_ORDER.indexOf('high_card'),
    tiebreak: high,
    cards,
  };
}

/** Hole cards containing both a 7 and a 2 — the 7-2 house rule, board aside. */
export function holdsSevenDeuce(holeCards: Card[]): boolean {
  const values = new Set(holeCards.map(cardValue));
  return values.has(7) && values.has(2);
}

/** Hole cards containing both a 6 and a 9 — the 6-9 house rule, board aside. */
export function holdsSixNine(holeCards: Card[]): boolean {
  const values = new Set(holeCards.map(cardValue));
  return values.has(6) && values.has(9);
}

function countPairsInSeven(cards: Card[]): number {
  const byRank = countByRank(cards);
  let pairs = 0;
  for (const [, n] of byRank) {
    if (n >= 2) pairs++;
  }
  return pairs;
}

export function evaluateHand(holeCards: Card[], communityCards: Card[]): HandResult {
  const all = [...holeCards, ...communityCards];
  if (all.length < 5) {
    return {
      rank: 'high_card',
      rankValue: HAND_RANK_ORDER.indexOf('high_card'),
      tiebreak: sortByValue(holeCards).map(cardValue),
      cards: holeCards,
      pairCountIn7: countPairsInSeven(all),
    };
  }

  const combos = combinations(all, 5);
  let best: HandResult | null = null;

  for (const five of combos) {
    const ev = evaluateFive(five) as HandResult;
    ev.pairCountIn7 = countPairsInSeven(all);

    if (!best || compareHandResults(ev, best) > 0) {
      best = { ...ev, cards: five };
    }
  }

  if (!best) throw new Error('No hand evaluated');

  best.is72 = holdsSevenDeuce(holeCards) && best.rank === 'high_card';
  best.is69 = holdsSixNine(holeCards) && best.rank === 'high_card';

  return best;
}

export function evaluateHandOmaha(holeCards: Card[], communityCards: Card[]): HandResult {
  if (holeCards.length < 2 || communityCards.length < 3) {
    return {
      rank: 'high_card',
      rankValue: HAND_RANK_ORDER.indexOf('high_card'),
      tiebreak: sortByValue(holeCards.slice(0, 2)).map(cardValue),
      cards: holeCards.slice(0, 2),
      pairCountIn7: holeCards.length + communityCards.length >= 7 ? countPairsInSeven([...holeCards, ...communityCards]) : undefined,
    };
  }
  const holeCombos = combinations(holeCards, 2);
  const boardCombos = combinations(communityCards, 3);
  let best: HandResult | null = null;

  for (const twoFromHole of holeCombos) {
    for (const threeFromBoard of boardCombos) {
      const five = [...twoFromHole, ...threeFromBoard];
      const ev = evaluateFive(five) as HandResult;
      const sevenForPairs = [...twoFromHole, ...communityCards];
      ev.pairCountIn7 = countPairsInSeven(sevenForPairs);

      if (!best || compareHandResults(ev, best) > 0) {
        best = { ...ev, cards: five };
      }
    }
  }

  if (!best) throw new Error('No hand evaluated');

  best.is72 = holdsSevenDeuce(holeCards) && best.rank === 'high_card';
  best.is69 = holdsSixNine(holeCards) && best.rank === 'high_card';

  return best;
}

export function compareHandResults(a: HandResult, b: HandResult): number {
  if (a.rankValue !== b.rankValue) return a.rankValue - b.rankValue;

  if (a.rank === 'two_pair' && b.rank === 'two_pair') {
    if (
      a.tiebreak[0] === b.tiebreak[0] &&
      a.tiebreak[1] === b.tiebreak[1]
    ) {
      const aPairs = a.pairCountIn7 ?? 2;
      const bPairs = b.pairCountIn7 ?? 2;
      if (aPairs !== bPairs) return aPairs - bPairs;
    }
  }

  for (let i = 0; i < Math.max(a.tiebreak.length, b.tiebreak.length); i++) {
    const va = a.tiebreak[i] ?? 0;
    const vb = b.tiebreak[i] ?? 0;
    if (va !== vb) return va - vb;
  }
  return 0;
}

export function is72Hand(holeCards: Card[], communityCards: Card[]): boolean {
  const res = evaluateHand(holeCards, communityCards);
  return res.is72 === true;
}

export function is69Hand(holeCards: Card[], communityCards: Card[]): boolean {
  const res = evaluateHand(holeCards, communityCards);
  return res.is69 === true;
}

function valueToRank(v: number): string {
  if (v >= 2 && v <= 14) return RANKS[v - 2];
  return String(v);
}

export function formatHandDescription(r: HandResult): string {
  const rn = (v: number) => valueToRank(v);
  const high = r.tiebreak[0] != null ? rn(r.tiebreak[0]) : '';
  switch (r.rank) {
    case 'high_card':
      return high ? `High card, ${high}` : 'High card';
    case 'pair':
      return `Pair of ${high}s`;
    case 'two_pair':
      return `Two pair, ${high}s and ${r.tiebreak[1] != null ? rn(r.tiebreak[1]) : '?'}s`;
    case 'three_of_a_kind':
      return `Three of a kind, ${high}s`;
    case 'straight':
      return `Straight, ${high} high`;
    case 'flush':
      return `Flush, ${high} high`;
    case 'full_house':
      return `Full house, ${high}s full of ${r.tiebreak[1] != null ? rn(r.tiebreak[1]) : '?'}s`;
    case 'four_of_a_kind':
      return `Four of a kind, ${high}s`;
    case 'straight_flush':
      return `Straight flush, ${high} high`;
    default:
      return String(r.rank).replace(/_/g, ' ');
  }
}
