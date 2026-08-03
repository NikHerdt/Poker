import type { BlindStructure, RoomConfig, TournamentState } from './types';

export const DEFAULT_BLIND_MULTIPLIER = 2;
export const DEFAULT_MAX_BLIND_LEVEL = 12;

/** A structure that actually raises blinds (mode set and interval valid). */
export function isBlindStructureActive(structure: BlindStructure | undefined): boolean {
  if (!structure || structure.mode === 'none') return false;
  if (structure.mode === 'hands') return (structure.handsPerLevel ?? 0) >= 1;
  return (structure.minutesPerLevel ?? 0) > 0;
}

function multiplierOf(structure: BlindStructure | undefined): number {
  const m = structure?.multiplier ?? DEFAULT_BLIND_MULTIPLIER;
  return m > 1 ? m : DEFAULT_BLIND_MULTIPLIER;
}

function maxLevelOf(structure: BlindStructure | undefined): number {
  const max = structure?.maxLevel ?? DEFAULT_MAX_BLIND_LEVEL;
  return max >= 1 ? Math.floor(max) : DEFAULT_MAX_BLIND_LEVEL;
}

/** Blinds at a given 1-based level. Level 1 is always the configured base blinds. */
export function blindsForLevel(
  config: Pick<RoomConfig, 'smallBlind' | 'bigBlind' | 'blindStructure'>,
  level: number
): { smallBlind: number; bigBlind: number } {
  const structure = config.blindStructure;
  const capped = Math.min(Math.max(1, Math.floor(level)), maxLevelOf(structure));
  const factor = Math.pow(multiplierOf(structure), capped - 1);
  const smallBlind = Math.max(1, Math.round(config.smallBlind * factor));
  const bigBlind = Math.max(smallBlind, Math.round(config.bigBlind * factor));
  return { smallBlind, bigBlind };
}

/**
 * Level for a hand about to be dealt.
 * 'hands' mode counts hands played; 'time' mode counts elapsed time since the
 * first hand. Both are evaluated only at the start of a hand, so blinds never
 * change mid-hand.
 */
export function levelForHand(
  structure: BlindStructure | undefined,
  handNumber: number,
  elapsedMs: number
): number {
  if (!isBlindStructureActive(structure)) return 1;
  const max = maxLevelOf(structure);
  let level: number;
  if (structure!.mode === 'hands') {
    const per = Math.max(1, Math.floor(structure!.handsPerLevel ?? 1));
    level = 1 + Math.floor((Math.max(1, handNumber) - 1) / per);
  } else {
    const perMs = Math.max(1, (structure!.minutesPerLevel ?? 1) * 60_000);
    level = 1 + Math.floor(Math.max(0, elapsedMs) / perMs);
  }
  return Math.min(level, max);
}

/**
 * Tournament bookkeeping for a hand that is about to start.
 * `startedAtMs` is when hand 1 was dealt; `nowMs` is the current server clock.
 */
export function tournamentStateForHand(
  config: RoomConfig,
  handNumber: number,
  startedAtMs: number,
  nowMs: number,
  previous?: TournamentState
): TournamentState {
  const structure = config.blindStructure;
  const level = levelForHand(structure, handNumber, nowMs - startedAtMs);
  const { smallBlind, bigBlind } = blindsForLevel(config, level);
  const max = maxLevelOf(structure);
  const levelStartedAtHand =
    previous && previous.level === level ? previous.levelStartedAtHand : handNumber;

  const state: TournamentState = {
    level,
    smallBlind,
    bigBlind,
    startedAtMs,
    levelStartedAtHand,
    atMaxLevel: isBlindStructureActive(structure) ? level >= max : true,
  };

  if (!isBlindStructureActive(structure) || level >= max) return state;

  if (structure!.mode === 'hands') {
    const per = Math.max(1, Math.floor(structure!.handsPerLevel ?? 1));
    state.nextLevelAtHand = 1 + level * per;
  } else {
    const perMs = Math.max(1, (structure!.minutesPerLevel ?? 1) * 60_000);
    state.nextLevelAtMs = startedAtMs + level * perMs;
  }
  return state;
}

/** "5 / 10" style label. */
export function formatBlinds(smallBlind: number, bigBlind: number): string {
  return `${smallBlind} / ${bigBlind}`;
}
