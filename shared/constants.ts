export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as const;
export const SUITS = ['c', 'd', 'h', 's'] as const; // clubs, diamonds, hearts, spades

export const HAND_RANK_ORDER = [
  'high_card',
  'pair',
  'two_pair',
  'three_of_a_kind',
  'straight',
  'flush',
  'full_house',
  'four_of_a_kind',
  'straight_flush',
] as const;

/**
 * Bumped whenever the client needs a server that understands newer messages or
 * state. The server stamps it on everything it sends; a client that sees a
 * different (or missing) version says so instead of misbehaving quietly.
 */
export const PROTOCOL_VERSION = 3;

export const ROOM_CODE_LENGTH = 6;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 12;

/**
 * A hand needs `cardsPerPlayer * n` hole cards plus 8 for the three burns and
 * the five board cards, and there are only 52 in the deck. That caps Hold'em at
 * 22 players and Pot Limit Omaha, which deals four each, at 11.
 */
export const BOARD_AND_BURN_CARDS = 8;
export const MAX_PLO_PLAYERS = Math.floor((52 - BOARD_AND_BURN_CARDS) / 4);
/**
 * How long a player has to act before the table acts for them: check if there
 * is nothing to call, otherwise fold. Enforced by the server, so a closed tab
 * or a slow phone cannot hold the table up.
 */
export const TURN_TIME_LIMIT_MS = 60_000;

/** Breathing room after a hand ends so everyone can read the result. */
export const NEXT_HAND_DELAY_MS = 6_000;

/**
 * How long a seat is held for someone whose connection dropped. They keep their
 * chips and their place in the blind order, and sit out until they are back.
 */
export const RECONNECT_GRACE_MS = 5 * 60_000;

export const DEFAULT_SMALL_BLIND = 5;
export const DEFAULT_BIG_BLIND = 10;
export const DEFAULT_BUY_IN = 200;
