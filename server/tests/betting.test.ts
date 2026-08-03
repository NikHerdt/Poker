import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction } from '../game-engine';
import { playerById, startTestHand } from './helpers';

/** Hand 1 with three seats at 5/10: a dealer, b small blind, c big blind, a acts first. */
const hand = () => startTestHand(3);

describe('minimum raise', () => {
  it('requires a raise of at least the last bet on top of it', () => {
    const state = hand();
    assert.throws(() => applyAction(state, 'a', { type: 'raise', amount: 15 }), /Minimum raise is to 20/);
    applyAction(state, 'a', { type: 'raise', amount: 20 });
    assert.equal(state.currentBet, 20);
  });

  it('grows with the size of the last raise', () => {
    const state = hand();
    applyAction(state, 'a', { type: 'raise', amount: 40 }); // raise of 30 over the blind
    assert.equal(state.minRaise, 30);
    assert.throws(() => applyAction(state, 'b', { type: 'raise', amount: 60 }), /Minimum raise is to 70/);
    applyAction(state, 'b', { type: 'raise', amount: 70 });
    assert.equal(state.currentBet, 70);
  });

  it('lets a short stack shove for less than a full raise', () => {
    // c can beat the 40 bet but cannot make it all the way to a full raise (70).
    const state = startTestHand(3, { chips: { a: 200, b: 200, c: 55 } });
    applyAction(state, 'a', { type: 'raise', amount: 40 });
    applyAction(state, 'b', { type: 'call' });
    applyAction(state, 'c', { type: 'raise', amount: 55 });

    assert.equal(playerById(state, 'c').allIn, true);
    assert.equal(playerById(state, 'c').chips, 0);
    assert.equal(state.currentBet, 55);
  });

  it('does not let an all-in for less reopen the betting', () => {
    const state = startTestHand(3, { chips: { a: 200, b: 200, c: 55 } });
    applyAction(state, 'a', { type: 'raise', amount: 40 }); // a full raise of 30
    applyAction(state, 'b', { type: 'call' });
    applyAction(state, 'c', { type: 'raise', amount: 55 }); // only 15 more: not a full raise
    assert.equal(state.minRaise, 30, 'still the size of the last full raise');
  });

  it('makes a player who cannot cover the bet call all-in instead', () => {
    const state = startTestHand(3, { chips: { a: 200, b: 200, c: 25 } });
    applyAction(state, 'a', { type: 'raise', amount: 40 });
    applyAction(state, 'b', { type: 'call' });
    assert.throws(() => applyAction(state, 'c', { type: 'raise', amount: 25 }), /beat the current bet/);

    applyAction(state, 'c', { type: 'call' });
    assert.equal(playerById(state, 'c').allIn, true);
    assert.equal(playerById(state, 'c').totalBetThisHand, 25);
  });

  it('rejects a raise bigger than the stack', () => {
    const state = hand();
    assert.throws(() => applyAction(state, 'a', { type: 'raise', amount: 5000 }), /do not have that many chips/);
  });
});

describe('opening bet', () => {
  it('has to be at least one big blind', () => {
    const state = hand();
    applyAction(state, 'a', { type: 'call' });
    applyAction(state, 'b', { type: 'call' });
    applyAction(state, 'c', { type: 'check' });
    assert.equal(state.phase, 'flop');
    assert.equal(state.currentBet, 0);

    const first = state.players[state.actingPlayerIndex].id;
    assert.throws(() => applyAction(state, first, { type: 'raise', amount: 4 }), /Minimum bet is 10/);
    applyAction(state, first, { type: 'raise', amount: 10 });
    assert.equal(state.currentBet, 10);
  });

  it('resets the minimum to a big blind on each new street', () => {
    const state = hand();
    applyAction(state, 'a', { type: 'raise', amount: 80 }); // big preflop raise
    assert.equal(state.minRaise, 70);
    applyAction(state, 'b', { type: 'call' });
    applyAction(state, 'c', { type: 'call' });

    assert.equal(state.phase, 'flop');
    assert.equal(state.minRaise, state.bigBlind, 'a new street starts at the big blind again');
  });
});

describe('action labels', () => {
  it('calls the first wager a bet and the next one a raise', () => {
    const state = hand();
    applyAction(state, 'a', { type: 'raise', amount: 30 });
    assert.equal(playerById(state, 'a').lastActionLabel, 'raise', 'over the blind, so a raise');

    applyAction(state, 'b', { type: 'call' });
    assert.equal(playerById(state, 'b').lastActionLabel, 'call');
    applyAction(state, 'c', { type: 'call' });

    const first = state.players[state.actingPlayerIndex].id;
    applyAction(state, first, { type: 'raise', amount: 20 });
    assert.equal(playerById(state, first).lastActionLabel, 'bet', 'nothing to raise over on the flop');
  });

  it('labels a shove as all-in', () => {
    const state = startTestHand(3, { chips: { a: 60, b: 200, c: 200 } });
    applyAction(state, 'a', { type: 'raise', amount: 60 });
    assert.equal(playerById(state, 'a').lastActionLabel, 'all-in');
  });

  it('clears the labels when the street changes', () => {
    const state = hand();
    applyAction(state, 'a', { type: 'call' });
    applyAction(state, 'b', { type: 'call' });
    applyAction(state, 'c', { type: 'check' });
    assert.deepEqual(
      state.players.map((p) => p.lastActionLabel),
      [undefined, undefined, undefined]
    );
  });
});

describe('checking and calling', () => {
  it('refuses a check when there is a bet to answer', () => {
    const state = hand();
    assert.throws(() => applyAction(state, 'a', { type: 'check' }), /Cannot check/);
  });

  it('refuses a call when there is nothing to call', () => {
    const state = hand();
    applyAction(state, 'a', { type: 'call' });
    applyAction(state, 'b', { type: 'call' });
    assert.throws(() => applyAction(state, 'c', { type: 'call' }), /Nothing to call/);
  });
});
