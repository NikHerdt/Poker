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

/** How (if at all) blinds go up over the course of a session. */
export type BlindIncreaseMode = 'none' | 'hands' | 'time';

export interface BlindStructure {
  mode: BlindIncreaseMode;
  /** Hands played per level, when mode is 'hands'. */
  handsPerLevel?: number;
  /** Minutes per level, when mode is 'time'. */
  minutesPerLevel?: number;
  /** Blinds are multiplied by this for each level above 1. Default 2. */
  multiplier?: number;
  /** Blinds stop increasing at this level. Default 12. */
  maxLevel?: number;
}

export interface RoomConfig {
  smallBlind: number;
  bigBlind: number;
  buyIn: number;
  /** Optional tournament-style blind increases. */
  blindStructure?: BlindStructure;
  /** Test mode: host can deal rigged hands to verify house rules. */
  testMode?: boolean;
}

/** Blind-level bookkeeping for the room; recomputed when each hand starts. */
export interface TournamentState {
  /** 1-based level used by the current hand. */
  level: number;
  smallBlind: number;
  bigBlind: number;
  /** Epoch ms when the first hand of the session started (time mode). */
  startedAtMs: number;
  /** Hand number the current level started on. */
  levelStartedAtHand: number;
  /** Hand number the next level starts on ('hands' mode). */
  nextLevelAtHand?: number;
  /** Epoch ms when the next level starts ('time' mode). */
  nextLevelAtMs?: number;
  /** Server clock at broadcast time, so clients can render an unskewed countdown. */
  serverNowMs?: number;
  /** True once maxLevel has been reached and blinds no longer increase. */
  atMaxLevel?: boolean;
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
  /** Blinds actually posted this hand (after blind level and any PLO doubling). */
  smallBlind: number;
  bigBlind: number;
  /** Blind level this hand was dealt at (1 when no blind structure is configured). */
  blindLevel?: number;
  /** Set when the hand was dealt by test mode with a rigged deck. */
  testScenario?: string;
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
  /** True after a PLO vote was concluded this hand; hide PLO vote UI until next hand. */
  ploVoteConcluded?: boolean;
  /** Blind level tracking; present once the first hand has been dealt. */
  tournament?: TournamentState;
  /** Test mode only: scenario the host queued for the next hand. */
  pendingTestScenario?: string;
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
  | 'plo_vote_no'
  | 'set_test_scenario';

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
  /** Test mode: id of the scenario to deal next hand, or null to clear. */
  testScenario?: string | null;
}

export interface ServerMessage {
  type: ServerMessageType;
  roomCode?: string;
  playerId?: string;
  state?: RoomState;
  error?: string;
}
