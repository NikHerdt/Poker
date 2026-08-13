import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { KickVote } from '../shared/types';
import { tallyKickVote } from '../room-manager';

const vote = (votes: Record<string, 'yes' | 'no'>): KickVote => ({
  targetId: 'target',
  initiatorId: 'a',
  votes,
});

describe('a vote to kick', () => {
  const table = ['a', 'b', 'c', 'target'];

  it('does not count the player being voted on', () => {
    const result = tallyKickVote(vote({ a: 'yes', target: 'no' }), table);
    assert.equal(result.yes, 1);
    assert.equal(result.no, 0, 'their own vote is ignored');
    assert.equal(result.needed, 2, 'majority of the other three');
  });

  it('waits while the table is still deciding', () => {
    assert.equal(tallyKickVote(vote({ a: 'yes' }), table).outcome, 'pending');
  });

  it('removes the player on a majority', () => {
    assert.equal(tallyKickVote(vote({ a: 'yes', b: 'yes' }), table).outcome, 'kick');
  });

  it('keeps the player when enough say no', () => {
    assert.equal(tallyKickVote(vote({ a: 'yes', b: 'no', c: 'no' }), table).outcome, 'keep');
  });

  it('settles rather than hanging when everyone has voted', () => {
    const result = tallyKickVote(vote({ a: 'yes', b: 'no', c: 'no' }), table);
    assert.equal(result.outcome, 'keep');
    assert.equal(result.yes + result.no, 3);
  });

  it('needs two of three others, not just the one who called it', () => {
    assert.equal(tallyKickVote(vote({ a: 'yes' }), table).outcome, 'pending');
    assert.equal(tallyKickVote(vote({ a: 'yes', c: 'yes' }), table).outcome, 'kick');
  });

  it('lets one of two remaining players carry a vote', () => {
    // Three at the table: the target plus two others, so a single yes is a majority.
    assert.equal(tallyKickVote(vote({ a: 'yes' }), ['a', 'b', 'target']).outcome, 'pending');
    assert.equal(tallyKickVote(vote({ a: 'yes', b: 'yes' }), ['a', 'b', 'target']).outcome, 'kick');
  });
});
