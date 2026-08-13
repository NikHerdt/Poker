import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createRoom,
  getRoom,
  joinRoom,
  leaveRoom,
  markDisconnected,
  isDisconnected,
  reclaimSeat,
  dropExpiredSeats,
  nextDealerId,
} from '../room-manager';
import { RECONNECT_GRACE_MS } from '../shared/constants';

function tableOfThree() {
  const state = createRoom('a', 'Ann');
  joinRoom(state.roomCode, 'b', 'Ben');
  joinRoom(state.roomCode, 'c', 'Cara');
  return getRoom(state.roomCode)!;
}

describe('a dropped connection', () => {
  it('holds the seat instead of giving it away', () => {
    const room = tableOfThree();
    markDisconnected(room.state.roomCode, 'b');

    assert.deepEqual(room.state.seatOrder, ['a', 'b', 'c'], 'still seated');
    assert.equal(isDisconnected(room.state, 'b'), true);
  });

  it('gives the same seat back on rejoin', () => {
    const room = tableOfThree();
    room.state.lastDealerId = 'a';
    markDisconnected(room.state.roomCode, 'b');

    const state = reclaimSeat(room.state.roomCode, 'b');

    assert.ok(state, 'seat was reclaimed');
    assert.equal(isDisconnected(room.state, 'b'), false);
    assert.deepEqual(room.state.seatOrder, ['a', 'b', 'c'], 'seat order untouched');
    assert.equal(nextDealerId(room.state, ['a', 'b', 'c']), 'b', 'blind order carries on');
  });

  it('will not hand a seat to someone who left on purpose', () => {
    const room = tableOfThree();
    leaveRoom(room.state.roomCode, 'b');
    assert.equal(reclaimSeat(room.state.roomCode, 'b'), null);
  });

  it('will not reclaim a seat that was never dropped', () => {
    const room = tableOfThree();
    assert.equal(reclaimSeat(room.state.roomCode, 'b'), null);
  });

  it('lets the seat go once the hold has run out', () => {
    const room = tableOfThree();
    markDisconnected(room.state.roomCode, 'b');
    room.state.disconnectedAtMs!.b = Date.now() - RECONNECT_GRACE_MS - 1000;

    assert.equal(reclaimSeat(room.state.roomCode, 'b'), null, 'too late to come back');
    assert.deepEqual(dropExpiredSeats(room.state.roomCode), ['b']);
    assert.deepEqual(room.state.seatOrder, ['a', 'c']);
  });

  it('keeps seats whose hold is still good', () => {
    const room = tableOfThree();
    markDisconnected(room.state.roomCode, 'b');
    assert.deepEqual(dropExpiredSeats(room.state.roomCode), []);
    assert.deepEqual(room.state.seatOrder, ['a', 'b', 'c']);
  });
});
