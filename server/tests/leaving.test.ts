import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, removePlayerFromHand } from '../game-engine';
import { playerById, startTestHand } from './helpers';

const acting = (state: { players: { id: string }[]; actingPlayerIndex: number }) =>
  state.players[state.actingPlayerIndex]?.id;

describe('a player leaving mid-hand', () => {
  it('folds them and passes the action on so the table keeps playing', () => {
    // Seats a b c d, hand 1: a dealer, b small blind, c big blind, d acts first.
    const state = startTestHand(4);
    assert.equal(acting(state), 'd');
    applyAction(state, 'd', { type: 'call' });
    applyAction(state, 'a', { type: 'call' });
    assert.equal(acting(state), 'b');

    removePlayerFromHand(state, 'b');

    assert.equal(playerById(state, 'b').folded, true);
    assert.equal(playerById(state, 'b').connected, false);
    assert.equal(acting(state), 'c', 'action moves to the next live player');
    assert.equal(state.phase, 'preflop');
  });

  it('lets everyone still in the hand act on the next street', () => {
    const state = startTestHand(4);
    applyAction(state, 'd', { type: 'call' });
    applyAction(state, 'a', { type: 'call' });
    removePlayerFromHand(state, 'b');
    applyAction(state, 'c', { type: 'check' }); // big blind closes the round

    assert.equal(state.phase, 'flop');

    // First to act after the button (a) is b, who left, so it starts on c.
    const order: string[] = [];
    while (state.phase === 'flop') {
      const id = acting(state)!;
      order.push(id);
      applyAction(state, id, { type: 'check' });
    }
    assert.deepEqual(order, ['c', 'd', 'a'], 'nobody is skipped');
  });

  it('awards the pot when everyone else leaves', () => {
    const state = startTestHand(3);
    const potBefore = state.players.reduce((s, p) => s + p.totalBetThisHand, 0);
    removePlayerFromHand(state, 'b');
    removePlayerFromHand(state, 'c');

    assert.equal(state.phase, 'finished');
    assert.deepEqual(state.winnerIds, ['a']);
    assert.equal(playerById(state, 'a').chips, 200 - 0 + potBefore - 0);
  });

  it('does nothing once the hand is already over', () => {
    const state = startTestHand(2);
    applyAction(state, 'b', { type: 'fold' });
    const chips = state.players.map((p) => p.chips);
    removePlayerFromHand(state, 'a');
    assert.deepEqual(state.players.map((p) => p.chips), chips);
  });
});
