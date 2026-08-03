import type { Card, Rank, Suit } from './types';
import { RANKS, SUITS } from './constants';

/**
 * Test mode: a rigged deal used to verify house rules without waiting for the
 * right cards to show up naturally. Cards are written as rank+suit, e.g. "7c",
 * "Td", "As". Anything left unspecified is dealt from the shuffled remainder.
 */
export interface RiggedDeal {
  /** Hole cards keyed by seat index (0-based, in seating order). */
  holeCards?: Record<number, string[]>;
  /** Board in deal order: flop, flop, flop, turn, river. */
  board?: string[];
}

export interface TestScenario {
  id: string;
  label: string;
  /** What the scenario is meant to prove. */
  expectation: string;
  minPlayers: number;
  deal: RiggedDeal;
}

export const TEST_SCENARIOS: TestScenario[] = [
  {
    id: 'seven_deuce',
    label: '7-2 bonus',
    expectation: 'Seat 1 wins with 7-high and collects a big blind from every other player still in the hand.',
    minPlayers: 2,
    deal: {
      holeCards: { 0: ['7c', '2d'], 1: ['3d', '4c'] },
      board: ['As', 'Kd', 'Qc', '9h', '5s'],
    },
  },
  {
    id: 'six_nine',
    label: '6-9 bonus',
    expectation: 'Seat 1 wins with 9-high and collects a small blind from every other player still in the hand.',
    minPlayers: 2,
    deal: {
      holeCards: { 0: ['6c', '9d'], 1: ['2s', '3h'] },
      board: ['As', 'Kd', 'Qc', 'Jh', '4d'],
    },
  },
  {
    id: 'three_pair',
    label: 'Three pair beats two pair',
    expectation: 'Both seats play tens-and-eights with an ace kicker; seat 2 wins because its seven cards hold a third pair.',
    minPlayers: 2,
    deal: {
      holeCards: { 0: ['Ad', 'Kc'], 1: ['As', '3d'] },
      board: ['8c', '8d', 'Th', 'Ts', '3c'],
    },
  },
  {
    id: 'split_pot',
    label: 'Split pot',
    expectation: 'The board plays for both seats, so the pot is split (odd chips go to the earlier seat).',
    minPlayers: 2,
    deal: {
      holeCards: { 0: ['2c', '3d'], 1: ['2s', '3h'] },
      board: ['As', 'Ad', 'Kc', 'Kh', 'Qd'],
    },
  },
];

export function getTestScenario(id: string | undefined | null): TestScenario | undefined {
  if (!id) return undefined;
  return TEST_SCENARIOS.find((s) => s.id === id);
}

/** Parse a card code such as "7c" or "Td". Case-insensitive on the rank. */
export function parseCardCode(code: string): Card {
  const trimmed = code.trim();
  const rank = trimmed.slice(0, -1).toUpperCase() as Rank;
  const suit = trimmed.slice(-1).toLowerCase() as Suit;
  if (!RANKS.includes(rank) || !SUITS.includes(suit)) {
    throw new Error(`Invalid card code: ${code}`);
  }
  return { rank, suit };
}

export function formatCardCode(card: Card): string {
  return `${card.rank}${card.suit}`;
}

export function sameCard(a: Card, b: Card): boolean {
  return a.rank === b.rank && a.suit === b.suit;
}
