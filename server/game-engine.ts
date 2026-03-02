import type { Card, GameState, Player, Pot, RoomConfig, LastActionInfo } from '../shared/types';
import {
  RANKS,
  SUITS,
  MIN_PLAYERS,
  DEFAULT_SMALL_BLIND,
  DEFAULT_BIG_BLIND,
  DEFAULT_BUY_IN,
} from '../shared/constants';
import { evaluateHand, evaluateHandOmaha, compareHandResults } from './hand-eval';

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

export function startHand(
  playerIds: string[],
  playerNames: Record<string, string>,
  config: Partial<RoomConfig>,
  handNumber: number,
  previousChips?: Record<string, number>,
  previousBuyInCounts?: Record<string, number>,
  isPlo?: boolean
): GameState {
  const configSmallBlind = config.smallBlind ?? DEFAULT_SMALL_BLIND;
  const configBigBlind = config.bigBlind ?? DEFAULT_BIG_BLIND;
  const smallBlind = isPlo ? 2 * configSmallBlind : configSmallBlind;
  const bigBlind = isPlo ? 2 * configBigBlind : configBigBlind;
  const buyIn = config.buyIn ?? DEFAULT_BUY_IN;

  if (playerIds.length < MIN_PLAYERS) {
    throw new Error('Not enough players to start');
  }

  const deck = shuffle(createDeck());
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

  const holeCardCount = isPlo ? 4 : 2;
  for (let i = 0; i < holeCardCount; i++) {
    for (let p = 0; p < players.length; p++) {
      const card = deck.pop()!;
      players[p].holeCards.push(card);
    }
  }

  if (isPlo) {
    const doubleBb = 2 * configBigBlind;
    for (const p of players) {
      const post = Math.min(doubleBb, p.chips);
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
    };
  }

  const sbPlayer = players[sbIndex];
  const bbPlayer = players[bbIndex];
  sbPlayer.chips -= Math.min(smallBlind, sbPlayer.chips);
  sbPlayer.currentBet = Math.min(smallBlind, sbPlayer.chips + smallBlind);
  sbPlayer.totalBetThisHand = sbPlayer.currentBet;
  if (sbPlayer.chips <= 0) sbPlayer.allIn = true;

  bbPlayer.chips -= Math.min(bigBlind, bbPlayer.chips);
  bbPlayer.currentBet = Math.min(bigBlind, bbPlayer.chips + bigBlind);
  bbPlayer.totalBetThisHand = bbPlayer.currentBet;
  if (bbPlayer.chips <= 0) bbPlayer.allIn = true;

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
  };
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
  action: { type: 'fold' | 'check' | 'call' | 'raise' | 'all_in'; amount?: number },
  bigBlind: number,
  smallBlind: number
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
      const totalPot = state.players.reduce((s, p) => s + p.totalBetThisHand, 0);
      remaining[0].chips += totalPot;
      state.winnerIds = [remaining[0].id];
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
      runShowdown(state, bigBlind, smallBlind);
      return;
    }
    if (state.phase === 'preflop') dealFlop(state);
    else if (state.phase === 'flop') dealTurn(state);
    else if (state.phase === 'turn') dealRiver(state);
    else if (state.phase === 'river') {
      state.phase = 'showdown';
      runShowdown(state, bigBlind, smallBlind);
      return;
    }
    advanceStreetsUntilSomeoneCanActOrShowdown(state, bigBlind, smallBlind);
  }
}

function advanceStreetsUntilSomeoneCanActOrShowdown(state: GameState, bigBlind: number, smallBlind: number): void {
  while (state.phase !== 'showdown' && state.phase !== 'finished' && noPlayerCanAct(state)) {
    if (state.phase === 'preflop') dealFlop(state);
    else if (state.phase === 'flop') dealTurn(state);
    else if (state.phase === 'turn') dealRiver(state);
    else if (state.phase === 'river') {
      state.phase = 'showdown';
      runShowdown(state, bigBlind, smallBlind);
      return;
    }
  }
}

function runShowdown(state: GameState, bigBlind: number, smallBlind: number): void {
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

  const bonuses: GameState['houseRuleBonuses'] = [];
  const effectiveBigBlind = state.isPlo ? bigBlind * 2 : bigBlind;
  const effectiveSmallBlind = state.isPlo ? smallBlind * 2 : smallBlind;
  const bigBlindCfg = state.players[0] ? (state.players[0].isBigBlind ? effectiveBigBlind : 0) : 0;
  const smallBlindCfg = effectiveSmallBlind;
  for (const wid of winnerIds) {
    const player = state.players.find((p) => p.id === wid)!;
    const result = handResults.get(wid)!;
    if (result.is72) {
      const payers = state.players.filter((p) => p.id !== wid && !p.folded);
      const total = payers.length * bigBlind;
      player.chips += total;
      bonuses.push({ playerId: wid, type: '72', amount: total });
    }
    if (result.is69) {
      const payers = state.players.filter((p) => p.id !== wid && !p.folded);
      const total = payers.length * smallBlind;
      player.chips += total;
      bonuses.push({ playerId: wid, type: '69', amount: total });
    }
  }
  state.houseRuleBonuses = bonuses.length > 0 ? bonuses : undefined;
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
  if (state.pots.length > 0 && state.pots[0].amount >= amountToReverse) {
    state.pots[0].amount -= amountToReverse;
  }
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

export function advanceIfBettingRoundComplete(state: GameState, bigBlind: number, smallBlind: number): void {
  if (!bettingRoundComplete(state)) return;
  state.pots = buildSidePots(state);
  const activeCount = state.players.filter((p) => !p.folded).length;
  if (activeCount <= 1) {
    state.phase = 'showdown';
    runShowdown(state, bigBlind, smallBlind);
    return;
  }
  if (state.phase === 'preflop') dealFlop(state);
  else if (state.phase === 'flop') dealTurn(state);
  else if (state.phase === 'turn') dealRiver(state);
  else if (state.phase === 'river') {
    state.phase = 'showdown';
    runShowdown(state, bigBlind, smallBlind);
    return;
  }
  advanceStreetsUntilSomeoneCanActOrShowdown(state, bigBlind, smallBlind);
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
