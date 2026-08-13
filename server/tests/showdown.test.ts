import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction } from '../game-engine';
import { getTestScenario } from '../shared/test-scenarios';
import { NEXT_HAND_DELAY_MS } from '../shared/constants';
import { playPassivelyToEnd, startTestHand } from './helpers';

describe('showing hands at the end', () => {
  it('turns every hand that reached the showdown face up', () => {
    const state = startTestHand(3, { rig: getTestScenario('seven_deuce')!.deal });
    playPassivelyToEnd(state);

    assert.equal(state.wasShowdown, true);
    assert.deepEqual([...(state.revealedPlayerIds ?? [])].sort(), ['a', 'b', 'c']);
  });

  it('leaves folded hands face down at a showdown', () => {
    const state = startTestHand(3);
    applyAction(state, 'a', { type: 'fold' });
    applyAction(state, 'b', { type: 'call' });
    applyAction(state, 'c', { type: 'check' });
    playPassivelyToEnd(state);

    assert.equal(state.wasShowdown, true);
    const revealed = state.revealedPlayerIds ?? [];
    assert.ok(!revealed.includes('a'), 'the player who folded keeps their cards');
    assert.deepEqual([...revealed].sort(), ['b', 'c']);
  });

  it('shows nothing when the hand ends on a fold', () => {
    const state = startTestHand(2);
    applyAction(state, 'b', { type: 'fold' });

    assert.equal(state.phase, 'finished');
    assert.equal(state.wasShowdown, false);
    assert.equal(state.revealedPlayerIds, undefined, 'the winner does not have to show');
  });
});

describe('the pause after a hand', () => {
  it('stamps when the hand ended so clients can hold on the result', () => {
    const before = Date.now();
    const state = startTestHand(2);
    applyAction(state, 'b', { type: 'fold' });

    assert.ok(state.endedAtMs != null, 'end time recorded');
    assert.ok(state.endedAtMs! >= before && state.endedAtMs! <= Date.now());
    assert.ok(NEXT_HAND_DELAY_MS > 0, 'there is a pause to enforce');
  });

  it('stamps a showdown finish too', () => {
    const state = startTestHand(2, { rig: getTestScenario('split_pot')!.deal });
    playPassivelyToEnd(state);
    assert.ok(state.endedAtMs != null);
  });
});
