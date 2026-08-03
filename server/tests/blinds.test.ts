import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { BlindStructure, RoomConfig } from '../shared/types';
import { blindsForLevel, isBlindStructureActive, levelForHand, tournamentStateForHand } from '../shared/blinds';
import { sanitizeBlindStructure } from '../room-manager';
import { TEST_CONFIG, playerById, startTestHand } from './helpers';

const MINUTE = 60_000;
const base: RoomConfig = { smallBlind: 5, bigBlind: 10, buyIn: 200 };

describe('blind level math', () => {
  it('treats an absent or "none" structure as no increases', () => {
    assert.equal(isBlindStructureActive(undefined), false);
    assert.equal(isBlindStructureActive({ mode: 'none' }), false);
    assert.equal(levelForHand(undefined, 99, 10 * 60 * MINUTE), 1);
  });

  it('advances one level per N hands', () => {
    const structure: BlindStructure = { mode: 'hands', handsPerLevel: 3 };
    assert.equal(levelForHand(structure, 1, 0), 1);
    assert.equal(levelForHand(structure, 3, 0), 1);
    assert.equal(levelForHand(structure, 4, 0), 2);
    assert.equal(levelForHand(structure, 7, 0), 3);
  });

  it('advances one level per N minutes', () => {
    const structure: BlindStructure = { mode: 'time', minutesPerLevel: 15 };
    assert.equal(levelForHand(structure, 1, 0), 1);
    assert.equal(levelForHand(structure, 1, 14 * MINUTE), 1);
    assert.equal(levelForHand(structure, 1, 15 * MINUTE), 2);
    assert.equal(levelForHand(structure, 1, 44 * MINUTE), 3);
  });

  it('stops raising at maxLevel', () => {
    const structure: BlindStructure = { mode: 'hands', handsPerLevel: 1, maxLevel: 4 };
    assert.equal(levelForHand(structure, 12, 0), 4);
    assert.equal(blindsForLevel({ ...base, blindStructure: structure }, 12).bigBlind, 10 * 2 ** 3);
  });

  it('multiplies the configured blinds by level', () => {
    const config = { ...base, blindStructure: { mode: 'hands', handsPerLevel: 5 } as BlindStructure };
    assert.deepEqual(blindsForLevel(config, 1), { smallBlind: 5, bigBlind: 10 });
    assert.deepEqual(blindsForLevel(config, 3), { smallBlind: 20, bigBlind: 40 });
  });

  it('supports a non-doubling multiplier and rounds to whole chips', () => {
    const config = {
      ...base,
      blindStructure: { mode: 'hands', handsPerLevel: 5, multiplier: 1.5 } as BlindStructure,
    };
    assert.deepEqual(blindsForLevel(config, 2), { smallBlind: 8, bigBlind: 15 });
    assert.deepEqual(blindsForLevel(config, 3), { smallBlind: 11, bigBlind: 23 });
  });
});

describe('tournament state', () => {
  it('reports the hand the next level starts on', () => {
    const config = { ...base, blindStructure: { mode: 'hands', handsPerLevel: 4 } as BlindStructure };
    const first = tournamentStateForHand(config, 1, 0, 0);
    assert.equal(first.level, 1);
    assert.equal(first.nextLevelAtHand, 5);
    assert.equal(first.levelStartedAtHand, 1);

    const fifth = tournamentStateForHand(config, 5, 0, 0, first);
    assert.equal(fifth.level, 2);
    assert.equal(fifth.levelStartedAtHand, 5);
    assert.equal(fifth.nextLevelAtHand, 9);
    assert.deepEqual([fifth.smallBlind, fifth.bigBlind], [10, 20]);
  });

  it('reports when the next level starts in time mode', () => {
    const config = { ...base, blindStructure: { mode: 'time', minutesPerLevel: 10 } as BlindStructure };
    const start = 1_000_000;
    const first = tournamentStateForHand(config, 1, start, start);
    assert.equal(first.level, 1);
    assert.equal(first.nextLevelAtMs, start + 10 * MINUTE);

    const later = tournamentStateForHand(config, 6, start, start + 21 * MINUTE, first);
    assert.equal(later.level, 3);
    assert.equal(later.nextLevelAtMs, start + 30 * MINUTE);
    assert.deepEqual([later.smallBlind, later.bigBlind], [20, 40]);
  });

  it('keeps the level start hand while the level does not change', () => {
    const config = { ...base, blindStructure: { mode: 'hands', handsPerLevel: 10 } as BlindStructure };
    const first = tournamentStateForHand(config, 1, 0, 0);
    const third = tournamentStateForHand(config, 3, 0, 0, first);
    assert.equal(third.level, 1);
    assert.equal(third.levelStartedAtHand, 1);
  });

  it('flags the top level so clients stop showing a countdown', () => {
    const config = {
      ...base,
      blindStructure: { mode: 'hands', handsPerLevel: 1, maxLevel: 2 } as BlindStructure,
    };
    const top = tournamentStateForHand(config, 9, 0, 0);
    assert.equal(top.level, 2);
    assert.equal(top.atMaxLevel, true);
    assert.equal(top.nextLevelAtHand, undefined);
  });
});

describe('blind structure sanitising', () => {
  it('drops structures that cannot raise blinds', () => {
    assert.equal(sanitizeBlindStructure(undefined), undefined);
    assert.equal(sanitizeBlindStructure({ mode: 'none' }), undefined);
    assert.equal(sanitizeBlindStructure({ mode: 'hands', handsPerLevel: 0 }), undefined);
    assert.equal(sanitizeBlindStructure({ mode: 'time', minutesPerLevel: -5 }), undefined);
    assert.equal(sanitizeBlindStructure({ mode: 'wat' } as unknown as BlindStructure), undefined);
  });

  it('fills in defaults and clamps nonsense values', () => {
    const sanitized = sanitizeBlindStructure({
      mode: 'hands',
      handsPerLevel: 7.9,
      multiplier: 0.2,
      maxLevel: 9999,
    });
    assert.deepEqual(sanitized, { mode: 'hands', handsPerLevel: 7, multiplier: 2, maxLevel: 50 });
  });
});

describe('blinds posted in a hand', () => {
  it('posts the level blinds rather than the base blinds', () => {
    const state = startTestHand(3, { handNumber: 5, smallBlind: 20, bigBlind: 40, blindLevel: 3 });
    assert.equal(state.smallBlind, 20);
    assert.equal(state.bigBlind, 40);
    assert.equal(state.blindLevel, 3);
    assert.equal(state.currentBet, 40);
    assert.equal(state.minRaise, 40);

    const posted = state.players.filter((p) => p.currentBet > 0).map((p) => p.currentBet).sort((a, b) => a - b);
    assert.deepEqual(posted, [20, 40]);
  });

  it('doubles the level blinds for a PLO hand', () => {
    const state = startTestHand(3, { isPlo: true, smallBlind: 20, bigBlind: 40, blindLevel: 3 });
    assert.equal(state.smallBlind, 40);
    assert.equal(state.bigBlind, 80);
    assert.equal(state.players[0].holeCards.length, 4);
  });

  it('puts a player shorter than the blind all-in for what they have', () => {
    const state = startTestHand(3, {
      smallBlind: 50,
      bigBlind: 100,
      chips: { a: 200, b: 30, c: 200 },
    });
    const short = playerById(state, 'b'); // seat 1 is the small blind on hand 1
    assert.equal(short.isSmallBlind, true);
    assert.equal(short.chips, 0);
    assert.equal(short.currentBet, 30);
    assert.equal(short.totalBetThisHand, 30);
    assert.equal(short.allIn, true);
  });

  it('defaults to the room config blinds when no level is supplied', () => {
    const state = startTestHand(2);
    assert.equal(state.smallBlind, TEST_CONFIG.smallBlind);
    assert.equal(state.bigBlind, TEST_CONFIG.bigBlind);
    assert.equal(state.blindLevel, 1);
  });
});
