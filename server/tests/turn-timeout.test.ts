import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, applyTurnTimeout } from '../game-engine';
import { playerById, startTestHand } from './helpers';

const acting = (state: { players: { id: string }[]; actingPlayerIndex: number }) =>
  state.players[state.actingPlayerIndex]?.id;

describe('running out of time', () => {
  it('folds a player who would have to pay to stay in', () => {
    // Hand 1 of three: a is dealer and first to act, facing the big blind.
    const state = startTestHand(3);
    assert.equal(acting(state), 'a');

    assert.equal(applyTurnTimeout(state, 'a'), 'fold');
    assert.equal(playerById(state, 'a').folded, true);
    assert.equal(playerById(state, 'a').chips, 200, 'no chips lost beyond what was already in');
    assert.equal(acting(state), 'b', 'the table moves on');
  });

  it('checks for a player who has nothing to call', () => {
    const state = startTestHand(3);
    applyAction(state, 'a', { type: 'call' });
    applyAction(state, 'b', { type: 'call' });
    // c is the big blind with the bet already matched, so a timeout is a check.
    assert.equal(acting(state), 'c');

    assert.equal(applyTurnTimeout(state, 'c'), 'check');
    assert.equal(playerById(state, 'c').folded, false);
    assert.equal(state.phase, 'flop', 'checking closed the round');
  });

  it('checks rather than folds a free option on a later street', () => {
    const state = startTestHand(3);
    applyAction(state, 'a', { type: 'call' });
    applyAction(state, 'b', { type: 'call' });
    applyAction(state, 'c', { type: 'check' });

    const first = acting(state)!;
    assert.equal(applyTurnTimeout(state, first), 'check');
    assert.equal(playerById(state, first).folded, false);
  });

  it('ignores a timeout for someone who is not on the clock', () => {
    const state = startTestHand(3);
    assert.equal(applyTurnTimeout(state, 'b'), null);
    assert.equal(playerById(state, 'b').folded, false);
    assert.equal(acting(state), 'a', 'still a to act');
  });

  it('ignores a timeout that lands after the hand is over', () => {
    const state = startTestHand(2);
    applyAction(state, 'b', { type: 'fold' });
    assert.equal(state.phase, 'finished');
    const chips = state.players.map((p) => p.chips);

    assert.equal(applyTurnTimeout(state, 'a'), null);
    assert.deepEqual(state.players.map((p) => p.chips), chips);
  });

  it('ends the hand when the last opponent times out', () => {
    const state = startTestHand(2);
    assert.equal(applyTurnTimeout(state, acting(state)!), 'fold');
    assert.equal(state.phase, 'finished');
    assert.equal(state.winnerIds?.length, 1);
    assert.equal(
      state.players.reduce((sum, p) => sum + p.chips, 0),
      400,
      'chips still add up'
    );
  });
});
