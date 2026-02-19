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
}

export interface RoomState {
  roomCode: string;
  config: RoomConfig;
  game: GameState | null;
  hostId: string;
  playerIdToName: Record<string, string>;
}

export type ClientMessageType =
  | 'create_room'
  | 'join_room'
  | 'start_game'
  | 'action'
  | 'leave_room';

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
}

export interface ServerMessage {
  type: ServerMessageType;
  roomCode?: string;
  playerId?: string;
  state?: RoomState;
  error?: string;
}
