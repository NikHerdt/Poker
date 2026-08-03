import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateHand, evaluateHandOmaha, compareHandResults } from '../hand-eval';
import { parseCardCode } from '../shared/test-scenarios';

const cards = (codes: string) => codes.split(' ').map(parseCardCode);
const rankOf = (hole: string, board: string) => evaluateHand(cards(hole), cards(board)).rank;

describe('hand ranking', () => {
  it('identifies each hand class from seven cards', () => {
    assert.equal(rankOf('Ah Kh', 'Qh Jh Th 2c 3d'), 'straight_flush');
    assert.equal(rankOf('9c 9d', '9h 9s 2c 5d 7h'), 'four_of_a_kind');
    assert.equal(rankOf('Kc Kd', 'Kh 4s 4c 8d 9h'), 'full_house');
    assert.equal(rankOf('2h 7h', 'Th Jh 4h 9c Kd'), 'flush');
    assert.equal(rankOf('5c 6d', '7h 8s 9c Kd 2h'), 'straight');
    assert.equal(rankOf('Qc Qd', 'Qh 4s 8c 9d 2h'), 'three_of_a_kind');
    assert.equal(rankOf('Ac Ad', 'Kh Ks 8c 9d 2h'), 'two_pair');
    assert.equal(rankOf('Ac Ad', '7h 2s 8c 9d 4h'), 'pair');
    assert.equal(rankOf('Ac 3d', '7h 2s 8c Td 4h'), 'high_card');
  });

  it('reads the wheel as a five-high straight', () => {
    const result = evaluateHand(cards('Ac 2d'), cards('3h 4s 5c Kd 9h'));
    assert.equal(result.rank, 'straight');
    assert.deepEqual(result.tiebreak, [5]);
  });

  it('orders hand classes correctly', () => {
    const flush = evaluateHand(cards('2h 7h'), cards('Th Jh 4h 9c Kd'));
    const straight = evaluateHand(cards('5c 6d'), cards('7h 8s 9c Kd 2h'));
    assert.ok(compareHandResults(flush, straight) > 0);
  });

  it('breaks ties on kickers', () => {
    const board = cards('Ah 7s 4d 9c 2h');
    const better = evaluateHand(cards('Ac Kd'), board);
    const worse = evaluateHand(cards('As Qd'), board);
    assert.equal(better.rank, 'pair');
    assert.ok(compareHandResults(better, worse) > 0);
  });
});

describe('house rule flags', () => {
  it('flags 7-2 whenever the hole cards hold a seven and a deuce', () => {
    assert.equal(evaluateHand(cards('7c 2d'), cards('As Kd Qc 9h 5s')).is72, true);
    assert.equal(evaluateHand(cards('7c 2d'), cards('7s Kd Qc 9h 5s')).is72, true, 'a made hand still counts');
    assert.equal(evaluateHand(cards('7c 2d'), cards('7s 7h 2c 2h 5s')).is72, true, 'even a full house');
    assert.equal(evaluateHand(cards('7c 3d'), cards('As Kd Qc 9h 5s')).is72, false);
  });

  it('flags 6-9 whenever the hole cards hold a six and a nine', () => {
    assert.equal(evaluateHand(cards('6c 9d'), cards('As Kd Qc Jh 4d')).is69, true);
    assert.equal(evaluateHand(cards('6c 9d'), cards('9s Kd Qc Jh 4d')).is69, true);
    assert.equal(evaluateHand(cards('6c 8d'), cards('9s Kd Qc Jh 4d')).is69, false);
  });

  it('counts the pairs across all seven cards for the three-pair rule', () => {
    const board = cards('8c 8d Th Ts 3c');
    assert.equal(evaluateHand(cards('Ad Kc'), board).pairCountIn7, 2);
    assert.equal(evaluateHand(cards('As 3d'), board).pairCountIn7, 3);
  });

  it('prefers three pair when the played two pair is identical', () => {
    const board = cards('8c 8d Th Ts 3c');
    const twoPair = evaluateHand(cards('Ad Kc'), board);
    const threePair = evaluateHand(cards('As 3d'), board);
    assert.deepEqual(twoPair.tiebreak, threePair.tiebreak);
    assert.ok(compareHandResults(threePair, twoPair) > 0);
  });

  it('does not let a third pair outrank a genuinely better two pair', () => {
    const board = cards('8c 8d Th Ts 3c');
    const betterTwoPair = evaluateHand(cards('Ad As'), board); // aces and tens
    const threePair = evaluateHand(cards('Ac 3d'), board);
    assert.ok(compareHandResults(betterTwoPair, threePair) > 0);
  });
});

describe('omaha evaluation', () => {
  it('requires exactly two hole cards', () => {
    // Four hearts in hand plus one on the board is not a flush in Omaha.
    const result = evaluateHandOmaha(cards('Ah Kh Qh Jh'), cards('2h 7c 9d 4s 3c'));
    assert.notEqual(result.rank, 'flush');
  });

  it('makes a flush from two hole cards and three board cards', () => {
    const result = evaluateHandOmaha(cards('Ah Kh 2c 3d'), cards('7h 9h Th 4s Qc'));
    assert.equal(result.rank, 'flush');
  });
});
