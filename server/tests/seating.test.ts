import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { RoomState } from '../shared/types';
import { createRoom, getRoom, inSeatOrder, joinRoom, leaveRoom, nextDealerId } from '../room-manager';
import { startTestHand } from './helpers';

function room(seatOrder: string[], lastDealerId?: string): RoomState {
  return {
    roomCode: 'TEST',
    config: { smallBlind: 5, bigBlind: 10, buyIn: 200 },
    game: null,
    hostId: seatOrder[0],
    playerIdToName: Object.fromEntries(seatOrder.map((id) => [id, id])),
    seatOrder,
    lastDealerId,
  };
}

describe('the button', () => {
  it('starts at the first seat', () => {
    assert.equal(nextDealerId(room(['a', 'b', 'c']), ['a', 'b', 'c']), 'a');
  });

  it('moves one seat per hand and wraps around', () => {
    assert.equal(nextDealerId(room(['a', 'b', 'c'], 'a'), ['a', 'b', 'c']), 'b');
    assert.equal(nextDealerId(room(['a', 'b', 'c'], 'b'), ['a', 'b', 'c']), 'c');
    assert.equal(nextDealerId(room(['a', 'b', 'c'], 'c'), ['a', 'b', 'c']), 'a');
  });

  it('skips seats that are sitting this hand out', () => {
    assert.equal(nextDealerId(room(['a', 'b', 'c', 'd'], 'a'), ['a', 'c', 'd']), 'c');
  });

  it('does not jump when a player joins at the end of the order', () => {
    const before = nextDealerId(room(['a', 'b', 'c'], 'a'), ['a', 'b', 'c']);
    const after = nextDealerId(room(['a', 'b', 'c', 'd'], 'a'), ['a', 'b', 'c', 'd']);
    assert.equal(before, 'b');
    assert.equal(after, 'b', 'a new seat does not move the button');
  });

  it('does not jump when a busted player rebuys', () => {
    // b sat out hand 2 and rebought for hand 3; the button carries on regardless.
    assert.equal(nextDealerId(room(['a', 'b', 'c'], 'a'), ['a', 'c']), 'c');
    assert.equal(nextDealerId(room(['a', 'b', 'c'], 'c'), ['a', 'b', 'c']), 'a');
  });
});

describe('seat order', () => {
  it('keeps players in their seats whatever order they are handed in', () => {
    const state = room(['a', 'b', 'c', 'd']);
    assert.deepEqual(inSeatOrder(state, ['d', 'a', 'c']), ['a', 'c', 'd']);
  });

  it('puts anyone without a seat at the end', () => {
    const state = room(['a', 'b']);
    assert.deepEqual(inSeatOrder(state, ['b', 'z', 'a']), ['a', 'b', 'z']);
  });

  it('deals the hand in seat order, so rebuys do not reshuffle the table', () => {
    const state = room(['a', 'b', 'c']);
    // c busted and rebought, so the server hands the ids over rebuy-last.
    const order = inSeatOrder(state, ['a', 'b', 'c']);
    const hand = startTestHand(3, { playerIds: order, dealerIndex: order.indexOf('b') });
    assert.deepEqual(hand.players.map((p) => p.id), ['a', 'b', 'c']);
    assert.equal(hand.players[1].isDealer, true);
    assert.equal(hand.players[2].isSmallBlind, true);
    assert.equal(hand.players[0].isBigBlind, true);
  });
});

describe('leaving the room', () => {
  it('clears the rebuy prompt of a player who has gone', () => {
    // A busted player who leaves can never answer, and the host cannot deal the
    // next hand until every prompt is answered.
    const state = createRoom('host', 'Host');
    joinRoom(state.roomCode, 'busted', 'Busted');
    const room = getRoom(state.roomCode)!;
    room.state.rebuyDecisions = { busted: 'pending' };
    room.state.rebuyRequested = { busted: true };

    leaveRoom(state.roomCode, 'busted');

    assert.deepEqual(room.state.rebuyDecisions, {});
    assert.deepEqual(room.state.rebuyRequested, {});
    assert.deepEqual(room.state.seatOrder, ['host']);
  });

  it('drops their vote from a PLO poll in progress', () => {
    const state = createRoom('host', 'Host');
    joinRoom(state.roomCode, 'gone', 'Gone');
    const room = getRoom(state.roomCode)!;
    room.state.ploVote = { votes: { gone: 'yes' } };

    leaveRoom(state.roomCode, 'gone');
    assert.deepEqual(room.state.ploVote.votes, {});
  });
});

describe('blinds follow the button', () => {
  it('gives the small and big blind to the next seats along', () => {
    const first = startTestHand(4, { dealerIndex: 0 });
    assert.deepEqual(
      first.players.map((p) => [p.isDealer, p.isSmallBlind, p.isBigBlind]),
      [
        [true, false, false],
        [false, true, false],
        [false, false, true],
        [false, false, false],
      ]
    );

    const second = startTestHand(4, { dealerIndex: 1, handNumber: 2 });
    assert.equal(second.players[1].isDealer, true);
    assert.equal(second.players[2].isSmallBlind, true);
    assert.equal(second.players[3].isBigBlind, true);
  });
});
