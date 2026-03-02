import { HAND_RANK_ORDER } from './constants';

export type Rank = (typeof import('./constants').RANKS)[number];
export type Suit = (typeof import('./constants').SUITS)[number];
export type HandRankName = (typeof HAND_RANK_ORDER)[number];

export interface Card {
  rank: Rank;
  suit: Suit;
}

export interface HandResult {
  rank: HandRankName;
  rankValue: number;
  tiebreak: number[]; // descending values for comparison
  cards: Card[];
  is72?: boolean;
  is69?: boolean;
  pairCountIn7?: number; // number of distinct pairs in 7 cards (for three-pair rule)
}

export type GamePhase =
  | 'lobby'
  | 'preflop'
  | 'flop'
  | 'turn'
  | 'river'
  | 'showdown'
  | 'finished';

export type PlayerActionType = 'fold' | 'check' | 'call' | 'raise' | 'all_in';

export interface PlayerAction {
  type: PlayerActionType;
  amount?: number;
}

export interface Player {
  id: string;
  name: string;
  chips: number;
  holeCards: Card[];
  folded: boolean;
  currentBet: number;
  totalBetThisHand: number;
  isDealer: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
  connected: boolean;
  lastAction?: PlayerActionType;
  allIn: boolean;
  hasActedThisRound?: boolean;
  /** Number of buy-ins this player has taken (1 = initial buy-in). */
  buyInCount?: number;
}

export interface Pot {
  amount: number;
  eligiblePlayerIds: string[];
}

export interface RoomConfig {
  smallBlind: number;
  bigBlind: number;
  buyIn: number;
}

export interface LastActionInfo {
  playerId: string;
  action: 'check' | 'call' | 'raise' | 'fold';
  amount?: number;
  previousBet?: number;
}

export interface GameState {
  phase: GamePhase;
  communityCards: Card[];
  players: Player[];
  pots: Pot[];
  currentBet: number;
  minRaise: number;
  actingPlayerIndex: number;
  firstToActThisRound: number;
  deck: Card[];
  handNumber: number;
  winnerIds?: string[];
  lastWinningHand?: HandResult;
  houseRuleBonuses?: { playerId: string; type: '72' | '69'; amount: number }[];
  lastAction?: LastActionInfo;
  /** This hand is Pot Limit Omaha (4 cards, pot limit, Omaha eval). */
  isPlo?: boolean;
}

export interface RoomState {
  roomCode: string;
  config: RoomConfig;
  game: GameState | null;
  hostId: string;
  playerIdToName: Record<string, string>;
  fieldGoalUsed?: Record<string, boolean>;
  /** For players with 0 chips at end of hand: pending until they send rebuy_yes/rebuy_no. */
  rebuyDecisions?: Record<string, 'pending' | 'yes' | 'no'>;
  /** Spectators who requested to rebuy and will join at start of next hand. */
  rebuyRequested?: Record<string, boolean>;
  /** Persisted buy-in count when player is not in current hand (e.g. spectator). */
  playerIdToBuyInCount?: Record<string, number>;
  /** PLO vote in progress when hand is finished. */
  ploVote?: { votes: Record<string, 'yes' | 'no'> };
  ploVoteInitiator?: string;
  /** When set, next hand(s) are PLO until this player would be dealer again (then cleared; that hand is Hold'em). */
  ploRoundDealerId?: string;
  /** True once the first PLO hand (where anchor is dealer) has started; used to detect second time anchor is dealer. */
  ploRoundAnchorHasBeenDealer?: boolean;
}

export type ClientMessageType =
  | 'create_room'
  | 'join_room'
  | 'start_game'
  | 'action'
  | 'leave_room'
  | 'field_goal_attempt'
  | 'rebuy_yes'
  | 'rebuy_no'
  | 'request_rebuy'
  | 'plo_vote_start'
  | 'plo_vote_yes'
  | 'plo_vote_no';

export type ServerMessageType =
  | 'room_created'
  | 'room_joined'
  | 'room_state'
  | 'error'
  | 'game_started';

export interface ClientMessage {
  type: ClientMessageType;
  roomCode?: string;
  playerName?: string;
  config?: Partial<RoomConfig>;
  action?: PlayerAction;
  fieldGoalSuccess?: boolean;
}

export interface ServerMessage {
  type: ServerMessageType;
  roomCode?: string;
  playerId?: string;
  state?: RoomState;
  error?: string;
}
