import type { Card, GameState, Player, Pot, RoomConfig } from './shared/types';
import {
  RANKS,
  SUITS,
  MIN_PLAYERS,
  DEFAULT_SMALL_BLIND,
  DEFAULT_BIG_BLIND,
  DEFAULT_BUY_IN,
} from './shared/constants';
import {
  evaluateHand,
  evaluateHandOmaha,
  compareHandResults,
  holdsSevenDeuce,
  holdsSixNine,
} from './hand-eval';
import { parseCardCode, sameCard, type RiggedDeal } from './shared/test-scenarios';

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const rank of RANKS) {
    for (const suit of SUITS) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

export function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function createPlayer(
  id: string,
  name: string,
  chips: number,
  isDealer: boolean,
  isSB: boolean,
  isBB: boolean,
  buyInCount: number = 1
): Player {
  return {
    id,
    name,
    chips,
    holeCards: [],
    folded: false,
    currentBet: 0,
    totalBetThisHand: 0,
    isDealer,
    isSmallBlind: isSB,
    isBigBlind: isBB,
    connected: true,
    allIn: false,
    hasActedThisRound: false,
    buyInCount,
  };
}

/**
 * Build a deck whose deal order produces the cards a rigged deal asks for.
 * Cards are dealt with `pop()`, so the planned sequence is appended reversed.
 * Unspecified slots fall through to the shuffled remainder.
 */
export function stackDeck(deck: Card[], plan: (Card | null)[]): Card[] {
  const wanted = plan.filter((c): c is Card => c != null);
  const remaining = deck.filter((c) => !wanted.some((w) => sameCard(w, c)));
  const sequence = plan.map((c) => {
    if (c != null) return c;
    const next = remaining.shift();
    if (!next) throw new Error('Not enough cards to stack deck');
    return next;
  });
  return [...remaining, ...sequence.reverse()];
}

/**
 * Deal order for a hand: hole cards round by round, then burn + flop,
 * burn + turn, burn + river. Returns the planned pop sequence with `null`
 * wherever the rig does not care.
 */
function planFromRig(rig: RiggedDeal, playerCount: number, holeCardCount: number): (Card | null)[] {
  const plan: (Card | null)[] = [];
  for (let cardIdx = 0; cardIdx < holeCardCount; cardIdx++) {
    for (let seat = 0; seat < playerCount; seat++) {
      const code = rig.holeCards?.[seat]?.[cardIdx];
      plan.push(code ? parseCardCode(code) : null);
    }
  }
  const board = (rig.board ?? []).map(parseCardCode);
  plan.push(null); // burn
  plan.push(board[0] ?? null, board[1] ?? null, board[2] ?? null);
  plan.push(null); // burn
  plan.push(board[3] ?? null);
  plan.push(null); // burn
  plan.push(board[4] ?? null);
  return plan;
}

export interface StartHandOptions {
  playerIds: string[];
  playerNames: Record<string, string>;
  config: Partial<RoomConfig>;
  handNumber: number;
  previousChips?: Record<string, number>;
  previousBuyInCounts?: Record<string, number>;
  isPlo?: boolean;
  /** Blinds for this hand once the blind level is applied; defaults to the config blinds. */
  smallBlind?: number;
  bigBlind?: number;
  blindLevel?: number;
  /** Test mode: stack the deck for this hand. */
  rig?: RiggedDeal;
  testScenario?: string;
}

export function startHand(options: StartHandOptions): GameState {
  const {
    playerIds,
    playerNames,
    config,
    handNumber,
    previousChips,
    previousBuyInCounts,
    isPlo,
    rig,
    testScenario,
  } = options;

  const levelSmallBlind = options.smallBlind ?? config.smallBlind ?? DEFAULT_SMALL_BLIND;
  const levelBigBlind = options.bigBlind ?? config.bigBlind ?? DEFAULT_BIG_BLIND;
  const smallBlind = isPlo ? 2 * levelSmallBlind : levelSmallBlind;
  const bigBlind = isPlo ? 2 * levelBigBlind : levelBigBlind;
  const buyIn = config.buyIn ?? DEFAULT_BUY_IN;

  if (playerIds.length < MIN_PLAYERS) {
    throw new Error('Not enough players to start');
  }

  const holeCardCount = isPlo ? 4 : 2;
  let deck = shuffle(createDeck());
  if (rig) deck = stackDeck(deck, planFromRig(rig, playerIds.length, holeCardCount));
  const dealerIndex = (handNumber - 1) % playerIds.length;
  const sbIndex = (dealerIndex + 1) % playerIds.length;
  const bbIndex = (dealerIndex + 2) % playerIds.length;

  const players: Player[] = playerIds.map((id, i) => {
    const chips = previousChips != null ? (previousChips[id] ?? buyIn) : buyIn;
    const buyInCount = previousBuyInCounts != null ? (previousBuyInCounts[id] ?? 1) : 1;
    return createPlayer(
      id,
      playerNames[id] ?? 'Player',
      chips,
      i === dealerIndex,
      i === sbIndex,
      i === bbIndex,
      buyInCount
    );
  });

  for (let i = 0; i < holeCardCount; i++) {
    for (let p = 0; p < players.length; p++) {
      const card = deck.pop()!;
      players[p].holeCards.push(card);
    }
  }

  if (isPlo) {
    for (const p of players) {
      const post = Math.min(bigBlind, p.chips);
      p.chips -= post;
      p.currentBet = post;
      p.totalBetThisHand = post;
      if (p.chips <= 0) p.allIn = true;
    }
    const potAmount = players.reduce((sum, p) => sum + p.totalBetThisHand, 0);
    deck.pop();
    const communityCards: Card[] = [deck.pop()!, deck.pop()!, deck.pop()!];
    for (const p of players) {
      p.currentBet = 0;
      p.hasActedThisRound = false;
    }
    let firstToAct = (dealerIndex + 1) % players.length;
    while (players[firstToAct].folded && players.some((p) => !p.folded)) {
      firstToAct = (firstToAct + 1) % players.length;
    }
    let actingIndex = firstToAct;
    do {
      const p = players[actingIndex];
      if (!p.folded && !p.allIn && p.chips > 0) break;
      actingIndex = (actingIndex + 1) % players.length;
    } while (actingIndex !== firstToAct);
    if (players[actingIndex].folded || players[actingIndex].allIn || players[actingIndex].chips <= 0) {
      actingIndex = firstToAct;
    }
    return {
      phase: 'flop',
      communityCards,
      players,
      pots: [{ amount: potAmount, eligiblePlayerIds: playerIds }],
      currentBet: 0,
      minRaise: bigBlind,
      actingPlayerIndex: actingIndex,
      firstToActThisRound: firstToAct,
      deck,
      handNumber,
      isPlo: true,
      smallBlind,
      bigBlind,
      blindLevel: options.blindLevel ?? 1,
      testScenario,
    };
  }

  /** A player shorter than the blind posts what they have and is all-in. */
  const postBlind = (player: Player, blind: number) => {
    const post = Math.min(blind, player.chips);
    player.chips -= post;
    player.currentBet = post;
    player.totalBetThisHand = post;
    if (player.chips <= 0) player.allIn = true;
  };
  postBlind(players[sbIndex], smallBlind);
  postBlind(players[bbIndex], bigBlind);

  const currentBet = bigBlind;
  const minRaise = bigBlind;
  const actingIndex = (bbIndex + 1) % players.length;

  const potAmount =
    players.reduce((sum, p) => sum + p.totalBetThisHand, 0);
  const pots: Pot[] = [
    {
      amount: potAmount,
      eligiblePlayerIds: playerIds,
    },
  ];

  const firstToActThisRound = actingIndex;

  return {
    phase: 'preflop',
    communityCards: [],
    players,
    pots,
    currentBet,
    minRaise,
    actingPlayerIndex: actingIndex,
    firstToActThisRound,
    deck,
    handNumber,
    isPlo: false,
    smallBlind,
    bigBlind,
    blindLevel: options.blindLevel ?? 1,
    testScenario,
  };
}

/**
 * Pay a house rule bonus to `winnerId`: every other player dealt into the hand
 * pays, capped at the chips they have left so the table's chip total is
 * unchanged. Folding does not get you out of it.
 */
function collectHouseRuleBonus(state: GameState, winnerId: string, blind: number): number {
  const winner = state.players.find((p) => p.id === winnerId);
  if (!winner) return 0;
  let collected = 0;
  for (const payer of state.players) {
    if (payer.id === winnerId) continue;
    const pay = Math.min(blind, Math.max(0, payer.chips));
    payer.chips -= pay;
    collected += pay;
  }
  winner.chips += collected;
  return collected;
}

/** Apply the 7-2 / 6-9 bonuses for each winner flagged as holding them. */
function applyHouseRuleBonuses(
  state: GameState,
  flagsByWinner: Map<string, { is72?: boolean; is69?: boolean }>
): void {
  const bonuses: NonNullable<GameState['houseRuleBonuses']> = [];
  for (const [winnerId, flags] of flagsByWinner) {
    if (flags.is72) {
      const amount = collectHouseRuleBonus(state, winnerId, state.bigBlind);
      if (amount > 0) bonuses.push({ playerId: winnerId, type: '72', amount });
    }
    if (flags.is69) {
      const amount = collectHouseRuleBonus(state, winnerId, state.smallBlind);
      if (amount > 0) bonuses.push({ playerId: winnerId, type: '69', amount });
    }
  }
  state.houseRuleBonuses = bonuses.length > 0 ? bonuses : undefined;
}

function collectBets(state: GameState): void {
  const total = state.players.reduce((s, p) => s + p.totalBetThisHand, 0);
  state.players.forEach((p) => {
    p.currentBet = 0;
    p.hasActedThisRound = false;
  });
  state.pots = [
    { amount: total, eligiblePlayerIds: state.players.filter((p) => !p.folded).map((p) => p.id) },
  ];
  state.currentBet = 0;
  // The round is closed: its raises have been matched and folded into the pot,
  // so there is nothing left for a field goal to reverse.
  state.lastAction = undefined;
}

function buildSidePots(state: GameState): Pot[] {
  const ordered = state.players
    .filter((p) => !p.folded && p.totalBetThisHand > 0)
    .sort((a, b) => a.totalBetThisHand - b.totalBetThisHand);

  const levels = [...new Set(ordered.map((p) => p.totalBetThisHand))].sort((a, b) => a - b);
  const pots: Pot[] = [];
  let prevLevel = 0;

  for (const level of levels) {
    const add = (level - prevLevel) * state.players.filter((p) => p.totalBetThisHand >= level).length;
    const eligible = ordered.filter((p) => p.totalBetThisHand >= level).map((p) => p.id);
    if (add > 0 && eligible.length > 0) {
      pots.push({ amount: add, eligiblePlayerIds: eligible });
    }
    prevLevel = level;
  }

  const mainTotal = state.players.reduce((s, p) => s + p.totalBetThisHand, 0);
  const potTotal = pots.reduce((s, p) => s + p.amount, 0);
  if (mainTotal > potTotal && pots.length > 0) {
    pots[pots.length - 1].amount += mainTotal - potTotal;
  } else if (pots.length === 0 && mainTotal > 0) {
    pots.push({
      amount: mainTotal,
      eligiblePlayerIds: state.players.filter((p) => !p.folded).map((p) => p.id),
    });
  }
  return pots;
}

export function dealFlop(state: GameState): void {
  state.deck.pop();
  state.communityCards.push(state.deck.pop()!, state.deck.pop()!, state.deck.pop()!);
  state.phase = 'flop';
  collectBets(state);
  let idx = state.players.findIndex((p) => p.isDealer);
  idx = (idx + 1) % state.players.length;
  while (state.players[idx].folded && state.players.some((p) => !p.folded)) {
    idx = (idx + 1) % state.players.length;
  }
  state.firstToActThisRound = idx;
  state.actingPlayerIndex = firstPlayerWhoCanAct(state, idx);
  if (state.actingPlayerIndex < 0) state.actingPlayerIndex = idx;
}

export function dealTurn(state: GameState): void {
  state.deck.pop();
  state.communityCards.push(state.deck.pop()!);
  state.phase = 'turn';
  collectBets(state);
  let idx = state.players.findIndex((p) => p.isDealer);
  idx = (idx + 1) % state.players.length;
  while (state.players[idx].folded) {
    idx = (idx + 1) % state.players.length;
  }
  state.firstToActThisRound = idx;
  state.actingPlayerIndex = firstPlayerWhoCanAct(state, idx);
  if (state.actingPlayerIndex < 0) state.actingPlayerIndex = idx;
}

export function dealRiver(state: GameState): void {
  state.deck.pop();
  state.communityCards.push(state.deck.pop()!);
  state.phase = 'river';
  collectBets(state);
  let idx = state.players.findIndex((p) => p.isDealer);
  idx = (idx + 1) % state.players.length;
  while (state.players[idx].folded) {
    idx = (idx + 1) % state.players.length;
  }
  state.firstToActThisRound = idx;
  state.actingPlayerIndex = firstPlayerWhoCanAct(state, idx);
  if (state.actingPlayerIndex < 0) state.actingPlayerIndex = idx;
}

function nextActingPlayer(state: GameState): number {
  const start = state.actingPlayerIndex;
  let i = (start + 1) % state.players.length;
  while (i !== start) {
    const p = state.players[i];
    if (!p.folded && !p.allIn && p.chips > 0) return i;
    i = (i + 1) % state.players.length;
  }
  return -1;
}

function noPlayerCanAct(state: GameState): boolean {
  return !state.players.some((p) => !p.folded && !p.allIn && p.chips > 0);
}

/** True when exactly one player can act and that player can check (no bet to call). */
function onlyOneCanActAndCanCheck(state: GameState): boolean {
  const actable = state.players.filter((p) => !p.folded && !p.allIn && p.chips > 0);
  if (actable.length !== 1) return false;
  const idx = state.players.indexOf(actable[0]);
  if (state.players[idx].currentBet < state.currentBet) return false;
  return state.actingPlayerIndex === idx;
}

function firstPlayerWhoCanAct(state: GameState, fromIndex: number): number {
  let i = fromIndex;
  const start = i;
  do {
    const p = state.players[i];
    if (!p.folded && !p.allIn && p.chips > 0) return i;
    i = (i + 1) % state.players.length;
  } while (i !== start);
  return -1;
}

function bettingRoundComplete(state: GameState): boolean {
  const active = state.players.filter((p) => !p.folded && !p.allIn);
  if (active.length === 0) return true;
  const target = Math.max(...state.players.map((p) => p.currentBet));
  const allMatched = state.players
    .filter((p) => !p.folded && !p.allIn)
    .every((p) => p.currentBet === target || p.chips === 0);
  const next = nextActingPlayer(state);
  const noOneLeftToAct = next === -1;
  const everyoneActed = active.every((p) => p.hasActedThisRound === true);
  const roundComplete = noOneLeftToAct || (allMatched && everyoneActed);
  return allMatched && roundComplete;
}

export function applyAction(
  state: GameState,
  playerId: string,
  action: { type: 'fold' | 'check' | 'call' | 'raise' | 'all_in'; amount?: number }
): void {
  const idx = state.players.findIndex((p) => p.id === playerId);
  if (idx < 0 || idx !== state.actingPlayerIndex) throw new Error('Not your turn');
  const player = state.players[idx];

  player.hasActedThisRound = true;

  if (action.type === 'fold') {
    player.folded = true;
    player.lastAction = 'fold';
    state.lastAction = { playerId: player.id, action: 'fold' };
    const remaining = state.players.filter((p) => !p.folded);
    if (remaining.length === 1) {
      const winner = remaining[0];
      const totalPot = state.players.reduce((s, p) => s + p.totalBetThisHand, 0);
      winner.chips += totalPot;
      state.winnerIds = [winner.id];
      // Winning without a showdown still pays the 7-2 / 6-9 bonus: there is no
      // board to rank, so holding the cards is the whole rule.
      applyHouseRuleBonuses(
        state,
        new Map([
          [winner.id, { is72: holdsSevenDeuce(winner.holeCards), is69: holdsSixNine(winner.holeCards) }],
        ])
      );
      state.phase = 'finished';
      return;
    }
  } else if (action.type === 'check') {
    if (player.currentBet < state.currentBet) throw new Error('Cannot check');
    player.lastAction = 'check';
    state.lastAction = { playerId: player.id, action: 'check' };
  } else if (action.type === 'call') {
    const toCall = state.currentBet - player.currentBet;
    const pay = Math.min(toCall, player.chips);
    player.chips -= pay;
    player.currentBet += pay;
    player.totalBetThisHand += pay;
    if (player.chips <= 0) player.allIn = true;
    player.lastAction = 'call';
    state.lastAction = { playerId: player.id, action: 'call' };
  } else if (action.type === 'raise' || action.type === 'all_in') {
    const oldCurrentBet = state.currentBet;
    const minRaiseTo = state.currentBet + state.minRaise;
    let maxRaiseTo = player.currentBet + player.chips;
    if (state.isPlo) {
      const potTotal = state.pots.reduce((s, pot) => s + pot.amount, 0);
      const currentBetsTotal = state.players.reduce((s, p) => s + p.currentBet, 0);
      const potForLimit = potTotal + currentBetsTotal;
      const potMaxRaiseTo = player.currentBet + potForLimit;
      maxRaiseTo = Math.min(potMaxRaiseTo, player.currentBet + player.chips);
    }
    const raiseTo = action.amount ?? Math.min(maxRaiseTo, action.type === 'all_in' ? maxRaiseTo : minRaiseTo);
    if (raiseTo > maxRaiseTo) throw new Error('Raise exceeds pot limit');
    const toPay = Math.min(Math.max(raiseTo - player.currentBet, 0), player.chips);
    player.chips -= toPay;
    player.currentBet += toPay;
    player.totalBetThisHand += toPay;
    if (player.chips <= 0) player.allIn = true;
    state.currentBet = Math.max(state.currentBet, player.currentBet);
    const raiseSize = state.currentBet - oldCurrentBet;
    state.minRaise = Math.max(state.minRaise, raiseSize);
    player.lastAction = 'raise';
    state.lastAction = { playerId: player.id, action: 'raise', amount: state.currentBet, previousBet: oldCurrentBet };
  }

  const next = nextActingPlayer(state);
  if (next >= 0) {
    state.actingPlayerIndex = next;
  }

  if (bettingRoundComplete(state)) {
    state.pots = buildSidePots(state);
    const activeCount = state.players.filter((p) => !p.folded).length;
    if (activeCount <= 1) {
      state.phase = 'showdown';
      runShowdown(state);
      return;
    }
    if (state.phase === 'preflop') dealFlop(state);
    else if (state.phase === 'flop') dealTurn(state);
    else if (state.phase === 'turn') dealRiver(state);
    else if (state.phase === 'river') {
      state.phase = 'showdown';
      runShowdown(state);
      return;
    }
    advanceStreetsUntilSomeoneCanActOrShowdown(state);
  }
}

function advanceStreetsUntilSomeoneCanActOrShowdown(state: GameState): void {
  while (state.phase !== 'showdown' && state.phase !== 'finished') {
    if (noPlayerCanAct(state)) {
      if (state.phase === 'preflop') dealFlop(state);
      else if (state.phase === 'flop') dealTurn(state);
      else if (state.phase === 'turn') dealRiver(state);
      else if (state.phase === 'river') {
        state.phase = 'showdown';
        runShowdown(state);
        return;
      }
      continue;
    }
    if (onlyOneCanActAndCanCheck(state)) {
      const idx = state.actingPlayerIndex;
      state.players[idx].hasActedThisRound = true;
      state.players[idx].lastAction = 'check';
      state.lastAction = { playerId: state.players[idx].id, action: 'check' };
      if (bettingRoundComplete(state)) {
        state.pots = buildSidePots(state);
        const activeCount = state.players.filter((p) => !p.folded).length;
        if (activeCount <= 1) {
          state.phase = 'showdown';
          runShowdown(state);
          return;
        }
        if (state.phase === 'preflop') dealFlop(state);
        else if (state.phase === 'flop') dealTurn(state);
        else if (state.phase === 'turn') dealRiver(state);
        else if (state.phase === 'river') {
          state.phase = 'showdown';
          runShowdown(state);
          return;
        }
        continue;
      }
    }
    break;
  }
}

function runShowdown(state: GameState): void {
  state.pots = buildSidePots(state);

  const inHand = state.players.filter((p) => !p.folded);
  const handResults = new Map<string, ReturnType<typeof evaluateHand>>();
  const evaluator = state.isPlo ? evaluateHandOmaha : evaluateHand;
  for (const p of inHand) {
    handResults.set(p.id, evaluator(p.holeCards, state.communityCards));
  }

  const winnerIds: string[] = [];
  let lastWinningHand: typeof state.lastWinningHand = undefined;

  for (const pot of state.pots) {
    const eligible = pot.eligiblePlayerIds.filter((id) => state.players.find((p) => p.id === id)?.folded === false);
    if (eligible.length === 0) continue;
    if (eligible.length === 1) {
      const id = eligible[0];
      const player = state.players.find((p) => p.id === id)!;
      player.chips += pot.amount;
      if (!winnerIds.includes(id)) winnerIds.push(id);
      continue;
    }

    const bestEligible = eligible
      .map((id) => ({ id, result: handResults.get(id)! }))
      .sort((a, b) => compareHandResults(b.result, a.result));

    const bestResult = bestEligible[0].result;
    const winners = bestEligible.filter((w) => compareHandResults(w.result, bestResult) === 0);
    const share = Math.floor(pot.amount / winners.length);
    const remainder = pot.amount - share * winners.length;

    winners.forEach((w, i) => {
      const player = state.players.find((p) => p.id === w.id)!;
      player.chips += share + (i < remainder ? 1 : 0);
      if (!winnerIds.includes(w.id)) winnerIds.push(w.id);
    });

    if (winners.length > 0) lastWinningHand = bestEligible[0].result;
  }

  state.winnerIds = winnerIds;
  state.lastWinningHand = lastWinningHand;

  // At a showdown the 7-2 / 6-9 hand has to be the one that actually won, as
  // high card — see holdsSevenDeuce vs. HandResult.is72.
  applyHouseRuleBonuses(
    state,
    new Map(winnerIds.map((id) => [id, handResults.get(id)!]))
  );
  state.phase = 'finished';
}

export function canAct(state: GameState, playerId: string): boolean {
  if (state.phase !== 'preflop' && state.phase !== 'flop' && state.phase !== 'turn' && state.phase !== 'river') return false;
  const idx = state.players.findIndex((p) => p.id === playerId);
  if (idx < 0 || idx !== state.actingPlayerIndex) return false;
  const p = state.players[idx];
  return !p.folded && !p.allIn;
}

export function canFieldGoal(state: GameState, playerId: string, fieldGoalUsed: Record<string, boolean> | undefined): boolean {
  if (state.phase !== 'preflop' && state.phase !== 'flop' && state.phase !== 'turn' && state.phase !== 'river') {
    return false;
  }
  if (!state.lastAction || state.lastAction.action !== 'raise') return false;
  if (state.lastAction.playerId === playerId) return false;
  if (fieldGoalUsed?.[playerId]) return false;
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.folded) return false;
  return true;
}

export function reverseLastRaise(state: GameState): void {
  const last = state.lastAction;
  if (!last || last.action !== 'raise' || last.previousBet === undefined) return;
  const player = state.players.find((p) => p.id === last.playerId);
  if (!player) return;
  const amountToReverse = player.currentBet - last.previousBet;
  player.currentBet = last.previousBet;
  player.totalBetThisHand -= amountToReverse;
  player.chips += amountToReverse;
  if (player.chips > 0) player.allIn = false;
  // `pots` only holds chips from rounds that have already closed, and a raise
  // is reversible only inside its own round, so there is nothing to subtract.
  state.currentBet = Math.max(0, ...state.players.map((p) => p.currentBet));

  const raiserIdx = state.players.findIndex((p) => p.id === last.playerId);
  if (player.currentBet >= state.currentBet) {
    player.lastAction = 'check';
    state.lastAction = { playerId: last.playerId, action: 'check' };
  } else {
    const toCall = state.currentBet - player.currentBet;
    const pay = Math.min(toCall, player.chips);
    player.chips -= pay;
    player.currentBet += pay;
    player.totalBetThisHand += pay;
    if (player.chips <= 0) player.allIn = true;
    player.lastAction = 'call';
    state.lastAction = { playerId: last.playerId, action: 'call' };
  }
  player.hasActedThisRound = true;

  const next = nextActingPlayerFrom(state, raiserIdx);
  state.actingPlayerIndex = next >= 0 ? next : raiserIdx;
}

export function advanceIfBettingRoundComplete(state: GameState): void {
  if (!bettingRoundComplete(state)) return;
  state.pots = buildSidePots(state);
  const activeCount = state.players.filter((p) => !p.folded).length;
  if (activeCount <= 1) {
    state.phase = 'showdown';
    runShowdown(state);
    return;
  }
  if (state.phase === 'preflop') dealFlop(state);
  else if (state.phase === 'flop') dealTurn(state);
  else if (state.phase === 'turn') dealRiver(state);
  else if (state.phase === 'river') {
    state.phase = 'showdown';
    runShowdown(state);
    return;
  }
  advanceStreetsUntilSomeoneCanActOrShowdown(state);
}

function nextActingPlayerFrom(state: GameState, fromIndex: number): number {
  const start = fromIndex;
  let i = (start + 1) % state.players.length;
  while (i !== start) {
    const p = state.players[i];
    if (!p.folded && !p.allIn && p.chips > 0) return i;
    i = (i + 1) % state.players.length;
  }
  return -1;
}
