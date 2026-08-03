import { useEffect, useRef, useState } from 'react';
import type { GameState, RoomState } from 'shared/types';
import { isBlindStructureActive } from 'shared/blinds';

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Current blinds plus, when a blind structure is configured, how much longer
 * this level lasts. The countdown is anchored to the server clock stamped on
 * each room update, so a skewed client clock does not drift the timer.
 */
export function BlindLevelBadge({ state, game }: { state: RoomState; game: GameState }) {
  const tournament = state.tournament;
  const structureActive = isBlindStructureActive(state.config.blindStructure);
  const clockBase = useRef({ serverNowMs: Date.now(), localNowMs: Date.now() });
  const [, forceTick] = useState(0);

  const serverNowMs = tournament?.serverNowMs;
  useEffect(() => {
    if (serverNowMs != null) clockBase.current = { serverNowMs, localNowMs: Date.now() };
  }, [serverNowMs]);

  const nextLevelAtMs = tournament?.nextLevelAtMs;
  useEffect(() => {
    if (nextLevelAtMs == null) return;
    const t = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [nextLevelAtMs]);

  const blinds = `${game.smallBlind} / ${game.bigBlind}`;

  if (!structureActive || !tournament) {
    return <span className="blind-badge">Blinds {blinds}</span>;
  }

  let next: string | null = null;
  if (tournament.atMaxLevel) {
    next = 'top level';
  } else if (tournament.nextLevelAtHand != null) {
    const handsLeft = Math.max(0, tournament.nextLevelAtHand - game.handNumber);
    next = handsLeft <= 0 ? 'up next hand' : `up in ${handsLeft} hand${handsLeft === 1 ? '' : 's'}`;
  } else if (nextLevelAtMs != null) {
    const estimatedServerNow =
      clockBase.current.serverNowMs + (Date.now() - clockBase.current.localNowMs);
    const remaining = nextLevelAtMs - estimatedServerNow;
    next = remaining <= 0 ? 'up next hand' : `up in ${formatCountdown(remaining)}`;
  }

  return (
    <span className="blind-badge">
      Level {tournament.level} – blinds {blinds}
      {next && <span className="blind-badge-next"> ({next})</span>}
    </span>
  );
}
