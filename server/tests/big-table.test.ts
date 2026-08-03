import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_PLAYERS, MAX_PLO_PLAYERS } from '../shared/constants';
import { createRoom, joinRoom } from '../room-manager';
import { formatCardCode } from '../shared/test-scenarios';
import { playPassivelyToEnd, startTestHand, totalChips, TEST_CONFIG } from './helpers';

const seatIds = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);

describe('table size', () => {
  it('seats up to a dozen players', () => {
    assert.equal(MAX_PLAYERS, 12);

    const state = createRoom('host', 'Host');
    for (let i = 1; i < MAX_PLAYERS; i++) {
      assert.ok(joinRoom(state.roomCode, `p${i}`, `P${i}`), `player ${i} should get a seat`);
    }
    assert.equal(state.seatOrder.length, MAX_PLAYERS);
    assert.equal(joinRoom(state.roomCode, 'overflow', 'Overflow'), null, 'the table is full');
  });

  it('plays a full twelve-handed hand with a clean deck', () => {
    const ids = seatIds(12);
    const state = startTestHand(12, { playerIds: ids, dealerIndex: 0 });
    playPassivelyToEnd(state);

    const dealt = [...state.players.flatMap((p) => p.holeCards), ...state.communityCards];
    assert.equal(dealt.length, 12 * 2 + 5);
    assert.equal(new Set(dealt.map(formatCardCode)).size, dealt.length, 'no card dealt twice');
    assert.equal(state.communityCards.length, 5);
    assert.equal(state.phase, 'finished');
    assert.equal(totalChips(state), 12 * TEST_CONFIG.buyIn);
  });

  it('keeps the blinds in seat order at a full table', () => {
    const state = startTestHand(12, { dealerIndex: 7 });
    assert.equal(state.players[7].isDealer, true);
    assert.equal(state.players[8].isSmallBlind, true);
    assert.equal(state.players[9].isBigBlind, true);
    assert.equal(state.players[state.actingPlayerIndex].id, state.players[10].id);
  });

  it('wraps the blinds around the last seat', () => {
    const state = startTestHand(12, { dealerIndex: 11 });
    assert.equal(state.players[11].isDealer, true);
    assert.equal(state.players[0].isSmallBlind, true);
    assert.equal(state.players[1].isBigBlind, true);
  });
});

describe('Pot Limit Omaha at a big table', () => {
  it('deals four each up to its limit', () => {
    const state = startTestHand(MAX_PLO_PLAYERS, { isPlo: true, dealerIndex: 0 });
    const dealt = [...state.players.flatMap((p) => p.holeCards), ...state.communityCards];
    assert.equal(MAX_PLO_PLAYERS, 11);
    assert.equal(dealt.length, 11 * 4 + 3);
    assert.equal(new Set(dealt.map(formatCardCode)).size, dealt.length);
  });

  it('refuses a hand that would need more than a deck, with a readable reason', () => {
    assert.throws(
      () => startTestHand(12, { isPlo: true, dealerIndex: 0 }),
      /more than a deck holds.*tops out at 11 players/s
    );
  });

  it('still deals Hold\'em to a table too big for Omaha', () => {
    const state = startTestHand(12, { dealerIndex: 0 });
    assert.equal(state.players[0].holeCards.length, 2);
    assert.equal(state.isPlo, false);
  });
});
