import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  addSocket,
  createRoom,
  getRoom,
  joinRoom,
  leaveRoom,
  markDisconnected,
  isDisconnected,
  isCurrentSocket,
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

  it('reclaims a seat whose drop has not registered yet', () => {
    // Refreshing a page usually reconnects before the old socket's close is
    // noticed, so the seat is still the player's to take back.
    const room = tableOfThree();
    assert.equal(isDisconnected(room.state, 'b'), false, 'the drop has not landed');

    const state = reclaimSeat(room.state.roomCode, 'b');

    assert.ok(state, 'the seat is still theirs');
    assert.deepEqual(room.state.seatOrder, ['a', 'b', 'c']);
  });

  it('will not hand out a seat nobody is sitting in', () => {
    const room = tableOfThree();
    assert.equal(reclaimSeat(room.state.roomCode, 'stranger'), null);
  });

  it('lets the seat go once the hold has run out', () => {
    const room = tableOfThree();
    markDisconnected(room.state.roomCode, 'b');
    room.state.disconnectedAtMs!.b = Date.now() - RECONNECT_GRACE_MS - 1000;

    assert.equal(reclaimSeat(room.state.roomCode, 'b'), null, 'too late to come back');
    assert.deepEqual(dropExpiredSeats(room.state.roomCode), ['b']);
    assert.deepEqual(room.state.seatOrder, ['a', 'c']);
  });

  it('ignores the old socket closing after a refresh has reconnected', () => {
    // A refresh races: the new connection can land first, and the late close
    // from the old socket must not mark the player away again.
    const room = tableOfThree();
    const oldSocket = { id: 'old' } as unknown as import('ws').WebSocket;
    const newSocket = { id: 'new' } as unknown as import('ws').WebSocket;
    addSocket(room.state.roomCode, 'b', oldSocket);

    // The refreshed page reconnects and takes the seat over.
    reclaimSeat(room.state.roomCode, 'b');
    addSocket(room.state.roomCode, 'b', newSocket);

    assert.equal(
      isCurrentSocket(room.state.roomCode, 'b', oldSocket),
      false,
      'the stale close is recognised and ignored'
    );
    assert.equal(isCurrentSocket(room.state.roomCode, 'b', newSocket), true);
    assert.equal(isDisconnected(room.state, 'b'), false, 'still connected');
  });

  it('keeps seats whose hold is still good', () => {
    const room = tableOfThree();
    markDisconnected(room.state.roomCode, 'b');
    assert.deepEqual(dropExpiredSeats(room.state.roomCode), []);
    assert.deepEqual(room.state.seatOrder, ['a', 'b', 'c']);
  });
});
