import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { GameState } from '../shared/types';
import { applyAction, canFieldGoal, reverseLastRaise } from '../game-engine';
import { playerById, startTestHand } from './helpers';

/** Every chip committed to the hand so far — what the table shows as the pot. */
const committed = (state: GameState) =>
  state.players.reduce((sum, p) => sum + p.totalBetThisHand, 0);

/** Hand 1 with three seats: a is dealer, b the small blind, c the big blind. */
function handWithRaise() {
  const state = startTestHand(3);
  assert.equal(state.players[state.actingPlayerIndex].id, 'a');
  applyAction(state, 'a', { type: 'raise', amount: 30 });
  return state;
}

describe('field goal eligibility', () => {
  it('is available to another player right after a raise', () => {
    const state = handWithRaise();
    assert.equal(canFieldGoal(state, 'b', {}), true);
    assert.equal(canFieldGoal(state, 'c', {}), true);
  });

  it('is not available to the raiser', () => {
    const state = handWithRaise();
    assert.equal(canFieldGoal(state, 'a', {}), false);
  });

  it('is not available when the last action was not a raise', () => {
    const state = startTestHand(3);
    applyAction(state, 'a', { type: 'call' });
    assert.equal(canFieldGoal(state, 'b', {}), false);
  });

  it('is once per player per room', () => {
    const state = handWithRaise();
    assert.equal(canFieldGoal(state, 'b', { b: true }), false);
    assert.equal(canFieldGoal(state, 'c', { b: true }), true);
  });

  it('is not available once the betting round has closed', () => {
    // a raises, everyone calls: the raise is matched and folded into the pot,
    // so there is nothing left to reverse on the flop.
    const state = handWithRaise();
    applyAction(state, 'b', { type: 'call' });
    applyAction(state, 'c', { type: 'call' });

    assert.equal(state.phase, 'flop');
    assert.equal(state.lastAction, undefined);
    assert.equal(canFieldGoal(state, 'b', {}), false);
  });

  it('is not available after the hand is over', () => {
    const state = handWithRaise();
    applyAction(state, 'b', { type: 'fold' });
    applyAction(state, 'c', { type: 'fold' });
    assert.equal(state.phase, 'finished');
    assert.equal(canFieldGoal(state, 'b', {}), false);
  });

  it('is not available to a folded player', () => {
    // Four seats: a is dealer, b small blind, c big blind, so d acts first.
    const state = startTestHand(4);
    assert.equal(state.players[state.actingPlayerIndex].id, 'd');
    applyAction(state, 'd', { type: 'fold' });
    applyAction(state, 'a', { type: 'raise', amount: 30 });
    assert.equal(canFieldGoal(state, 'd', {}), false);
    assert.equal(canFieldGoal(state, 'b', {}), true);
  });
});

describe('reversing a raise', () => {
  it('gives the raiser their chips back and rewinds the bet', () => {
    const state = handWithRaise();
    const raiser = playerById(state, 'a');
    assert.equal(raiser.chips, 170);
    assert.equal(state.currentBet, 30);

    reverseLastRaise(state);

    assert.equal(raiser.chips, 190, 'raise is refunded down to the big blind');
    assert.equal(raiser.currentBet, 10);
    assert.equal(raiser.totalBetThisHand, 10);
    assert.equal(state.currentBet, 10, 'the table is back to the big blind');
    assert.equal(state.lastAction?.action, 'check');
    assert.equal(raiser.hasActedThisRound, true);
  });

  it('takes the reversed chips back out of the pot', () => {
    const state = handWithRaise();
    assert.equal(committed(state), 45, 'blinds plus the raise');

    reverseLastRaise(state);

    assert.equal(committed(state), 25, 'back to the blinds');
    assert.equal(
      state.players.reduce((sum, p) => sum + p.chips, 0) + committed(state),
      600,
      'chips are either in a stack or in the pot'
    );
  });

  it('passes the action to the next player still to act', () => {
    const state = handWithRaise();
    reverseLastRaise(state);
    assert.equal(state.players[state.actingPlayerIndex].id, 'b');
  });

  it('rewinds a re-raise to the bet it was made over, not to zero', () => {
    // a raises to 30, b calls, c re-raises to 80. Reversing c's raise leaves c
    // matching a's 30 rather than getting the whole bet back.
    const state = handWithRaise();
    applyAction(state, 'b', { type: 'call' });
    applyAction(state, 'c', { type: 'raise', amount: 80 });
    const reraiser = playerById(state, 'c');
    assert.equal(reraiser.chips, 120);

    reverseLastRaise(state);

    assert.equal(reraiser.currentBet, 30);
    assert.equal(reraiser.totalBetThisHand, 30);
    assert.equal(reraiser.chips, 170);
    assert.equal(state.currentBet, 30, 'a and b keep the bet they already matched');
    assert.equal(state.lastAction?.action, 'check');
  });

  it('does nothing when the last action was not a raise', () => {
    const state = startTestHand(3);
    applyAction(state, 'a', { type: 'call' });
    const before = state.players.map((p) => p.chips);
    reverseLastRaise(state);
    assert.deepEqual(state.players.map((p) => p.chips), before);
  });

  it('keeps chips conserved through a reversal and showdown', () => {
    const state = handWithRaise();
    reverseLastRaise(state);
    while (state.phase !== 'finished' && state.phase !== 'showdown') {
      const player = state.players[state.actingPlayerIndex];
      const toCall = state.currentBet - player.currentBet;
      applyAction(state, player.id, toCall > 0 ? { type: 'call' } : { type: 'check' });
    }
    assert.equal(state.players.reduce((s, p) => s + p.chips, 0), 600);
  });
});
