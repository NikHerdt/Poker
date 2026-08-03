import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TEST_SCENARIOS, getTestScenario } from '../shared/test-scenarios';
import { evaluateHand, compareHandResults } from '../hand-eval';
import { applyAction } from '../game-engine';
import { parseCardCode } from '../shared/test-scenarios';
import {
  TEST_CONFIG,
  boardCodes,
  holeCodes,
  playPassivelyToEnd,
  playerById,
  startTestHand,
  totalChips,
} from './helpers';

const cards = (codes: string[]) => codes.map(parseCardCode);

describe('rigged deals', () => {
  it('deals exactly the cards a scenario asks for', () => {
    const scenario = getTestScenario('seven_deuce')!;
    const state = startTestHand(2, { rig: scenario.deal });

    assert.deepEqual(holeCodes(state, 0), ['7c', '2d']);
    assert.deepEqual(holeCodes(state, 1), ['3d', '4c']);

    playPassivelyToEnd(state);
    assert.deepEqual(boardCodes(state), scenario.deal.board);
  });

  it('deals a full, duplicate-free board and hole cards', () => {
    const state = startTestHand(3, { rig: getTestScenario('six_nine')!.deal });
    playPassivelyToEnd(state);
    const dealt = [...state.players.flatMap((p) => p.holeCards), ...state.communityCards];
    const unique = new Set(dealt.map((c) => `${c.rank}${c.suit}`));
    assert.equal(unique.size, dealt.length);
    assert.equal(state.communityCards.length, 5);
  });
});

describe('7-2 house rule', () => {
  it('pays the winner a big blind from every other player in the hand', () => {
    const state = startTestHand(2, { rig: getTestScenario('seven_deuce')!.deal });
    playPassivelyToEnd(state);

    assert.deepEqual(state.winnerIds, ['a']);
    assert.deepEqual(state.houseRuleBonuses, [
      { playerId: 'a', type: '72', amount: TEST_CONFIG.bigBlind },
    ]);
    // 200 - 10 posted + 20 pot + 10 bonus
    assert.equal(playerById(state, 'a').chips, 220);
    // 200 - 10 posted - 10 bonus
    assert.equal(playerById(state, 'b').chips, 180);
  });

  it('scales the bonus with the number of other players in the hand', () => {
    const deal = getTestScenario('seven_deuce')!.deal;
    const state = startTestHand(3, {
      rig: { ...deal, holeCards: { ...deal.holeCards, 2: ['3s', '4h'] } },
    });
    playPassivelyToEnd(state);

    assert.deepEqual(state.winnerIds, ['a']);
    assert.equal(state.houseRuleBonuses?.[0].amount, 2 * TEST_CONFIG.bigBlind);
    assert.equal(playerById(state, 'b').chips, 180);
    assert.equal(playerById(state, 'c').chips, 180);
  });

  it('does not move more chips than the table holds', () => {
    const state = startTestHand(3, { rig: getTestScenario('seven_deuce')!.deal });
    playPassivelyToEnd(state);
    assert.equal(totalChips(state), 3 * TEST_CONFIG.buyIn);
  });

  it('is not awarded when 7-2 makes a made hand rather than winning as high card', () => {
    const state = startTestHand(2, {
      rig: {
        holeCards: { 0: ['7c', '2d'], 1: ['3d', '4c'] },
        board: ['7s', 'Kd', 'Qc', '9h', '5s'],
      },
    });
    playPassivelyToEnd(state);

    assert.deepEqual(state.winnerIds, ['a']);
    assert.equal(state.houseRuleBonuses, undefined);
  });

  it('is awarded when the 7-2 wins by making everyone fold', () => {
    const state = startTestHand(2, { rig: getTestScenario('seven_deuce')!.deal });
    // Seat b posts the small blind and acts first preflop.
    assert.equal(state.players[state.actingPlayerIndex].id, 'b');
    applyAction(state, 'b', { type: 'fold' });

    assert.equal(state.phase, 'finished');
    assert.deepEqual(state.winnerIds, ['a']);
    assert.deepEqual(state.houseRuleBonuses, [
      { playerId: 'a', type: '72', amount: TEST_CONFIG.bigBlind },
    ]);
    // 200 - 10 posted + 15 pot + 10 bonus
    assert.equal(playerById(state, 'a').chips, 215);
    assert.equal(playerById(state, 'b').chips, 185);
    assert.equal(totalChips(state), 2 * TEST_CONFIG.buyIn);
  });

  it('collects from players who folded along the way', () => {
    const deal = getTestScenario('seven_deuce')!.deal;
    const state = startTestHand(3, {
      rig: { ...deal, holeCards: { ...deal.holeCards, 2: ['3s', '4h'] } },
    });
    // c (the big blind) folds preflop; a and b go to a showdown that a wins.
    applyAction(state, 'a', { type: 'call' });
    applyAction(state, 'b', { type: 'call' });
    applyAction(state, 'c', { type: 'fold' });
    playPassivelyToEnd(state);

    assert.deepEqual(state.winnerIds, ['a']);
    assert.equal(state.houseRuleBonuses?.[0].amount, 2 * TEST_CONFIG.bigBlind);
    // 200 - 10 in the pot - 10 bonus, even though c was not there at the end
    assert.equal(playerById(state, 'c').chips, 180, 'the folder still pays the bonus');
    assert.equal(totalChips(state), 3 * TEST_CONFIG.buyIn);
  });

  it('is not awarded to a fold-out winner without the cards', () => {
    const state = startTestHand(2, {
      rig: { holeCards: { 0: ['Ac', 'Kd'], 1: ['3d', '4c'] } },
    });
    applyAction(state, 'b', { type: 'fold' });
    assert.equal(state.houseRuleBonuses, undefined);
  });
});

describe('6-9 house rule', () => {
  it('pays the winner a small blind from every other player in the hand', () => {
    const state = startTestHand(2, { rig: getTestScenario('six_nine')!.deal });
    playPassivelyToEnd(state);

    assert.deepEqual(state.winnerIds, ['a']);
    assert.deepEqual(state.houseRuleBonuses, [
      { playerId: 'a', type: '69', amount: TEST_CONFIG.smallBlind },
    ]);
    assert.equal(playerById(state, 'a').chips, 215);
    assert.equal(playerById(state, 'b').chips, 185);
    assert.equal(totalChips(state), 2 * TEST_CONFIG.buyIn);
  });
});

describe('three pair house rule', () => {
  it('breaks an identical two pair in favour of the hand holding a third pair', () => {
    const scenario = getTestScenario('three_pair')!;
    const state = startTestHand(2, { rig: scenario.deal });
    playPassivelyToEnd(state);

    const board = cards(scenario.deal.board!);
    const seatA = evaluateHand(cards(scenario.deal.holeCards![0]), board);
    const seatB = evaluateHand(cards(scenario.deal.holeCards![1]), board);

    assert.equal(seatA.rank, 'two_pair');
    assert.equal(seatB.rank, 'two_pair');
    assert.deepEqual(seatA.tiebreak.slice(0, 3), seatB.tiebreak.slice(0, 3));
    assert.equal(seatA.pairCountIn7, 2);
    assert.equal(seatB.pairCountIn7, 3);
    assert.ok(compareHandResults(seatB, seatA) > 0);

    assert.deepEqual(state.winnerIds, ['b']);
  });
});

describe('split pots', () => {
  it('splits evenly when the board plays for both players', () => {
    const state = startTestHand(2, { rig: getTestScenario('split_pot')!.deal });
    playPassivelyToEnd(state);

    assert.deepEqual([...state.winnerIds!].sort(), ['a', 'b']);
    assert.equal(playerById(state, 'a').chips, TEST_CONFIG.buyIn);
    assert.equal(playerById(state, 'b').chips, TEST_CONFIG.buyIn);
  });
});

describe('scenario catalogue', () => {
  it('every scenario uses distinct, valid cards', () => {
    for (const scenario of TEST_SCENARIOS) {
      const codes = [
        ...Object.values(scenario.deal.holeCards ?? {}).flat(),
        ...(scenario.deal.board ?? []),
      ];
      for (const code of codes) parseCardCode(code); // throws on a bad code
      assert.equal(new Set(codes).size, codes.length, `duplicate card in ${scenario.id}`);
    }
  });

  it('every scenario plays out the way its description claims', () => {
    for (const scenario of TEST_SCENARIOS) {
      const state = startTestHand(Math.max(2, scenario.minPlayers), { rig: scenario.deal });
      playPassivelyToEnd(state);
      assert.equal(state.phase, 'finished', `${scenario.id} did not finish`);
      assert.ok(state.winnerIds && state.winnerIds.length > 0, `${scenario.id} had no winner`);
      assert.equal(
        totalChips(state),
        Math.max(2, scenario.minPlayers) * TEST_CONFIG.buyIn,
        `${scenario.id} leaked chips`
      );
    }
  });
});
