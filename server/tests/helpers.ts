import type { GameState, RoomConfig } from '../shared/types';
import type { RiggedDeal } from '../shared/test-scenarios';
import { formatCardCode } from '../shared/test-scenarios';
import { applyAction, startHand, type StartHandOptions } from '../game-engine';

export const TEST_CONFIG: RoomConfig = { smallBlind: 5, bigBlind: 10, buyIn: 200 };

/** Start a hand with sensible test defaults; seats are named a, b, c, ... */
export function startTestHand(
  seats: number,
  overrides: Partial<StartHandOptions> & { rig?: RiggedDeal; chips?: Record<string, number> } = {}
): GameState {
  const playerIds =
    overrides.playerIds ?? Array.from({ length: seats }, (_, i) => String.fromCharCode(97 + i));
  const playerNames = Object.fromEntries(playerIds.map((id) => [id, id.toUpperCase()]));
  const { chips, ...rest } = overrides;
  return startHand({
    playerIds,
    playerNames,
    config: TEST_CONFIG,
    handNumber: 1,
    previousChips: chips,
    ...rest,
  });
}

/** Everyone checks or calls until the hand is over — enough to reach showdown. */
export function playPassivelyToEnd(state: GameState): void {
  for (let guard = 0; guard < 200; guard++) {
    if (state.phase === 'finished' || state.phase === 'showdown') return;
    const player = state.players[state.actingPlayerIndex];
    const toCall = state.currentBet - player.currentBet;
    applyAction(state, player.id, toCall > 0 ? { type: 'call' } : { type: 'check' });
  }
  throw new Error(`Hand did not finish (phase ${state.phase})`);
}

export function totalChips(state: GameState): number {
  return state.players.reduce((sum, p) => sum + p.chips, 0);
}

export function holeCodes(state: GameState, seat: number): string[] {
  return state.players[seat].holeCards.map(formatCardCode);
}

export function boardCodes(state: GameState): string[] {
  return state.communityCards.map(formatCardCode);
}

export function playerById(state: GameState, id: string) {
  const player = state.players.find((p) => p.id === id);
  if (!player) throw new Error(`No player ${id}`);
  return player;
}
