import { useEffect, useRef, useState } from 'react';
import type { GameState, Player } from 'shared/types';
import type { SeatPosition } from './PlayerSeat';

export interface Flight {
  key: string;
  amount: number;
  from: { left: number; top: number };
  to: { left: number; top: number };
  /** Chips heading out to a winner get a brighter treatment than a rake-in. */
  kind: 'to-pot' | 'to-winner';
}

const CENTRE = { left: 50, top: 50 };
const FLIGHT_MS = 520;

/**
 * Chips in motion: bets raked into the middle when a betting round closes, and
 * the pot pushed out to whoever won it. Purely visual — the amounts come from
 * state the server has already settled.
 */
export function ChipFlights({ flights }: { flights: Flight[] }) {
  return (
    <>
      {flights.map((flight) => (
        <div
          key={flight.key}
          className={`chip-flight ${flight.kind}`}
          style={{
            left: `${flight.to.left}%`,
            top: `${flight.to.top}%`,
            ['--from-left' as string]: `${flight.from.left}%`,
            ['--from-top' as string]: `${flight.from.top}%`,
            ['--to-left' as string]: `${flight.to.left}%`,
            ['--to-top' as string]: `${flight.to.top}%`,
          }}
        >
          <span className="chip-dot" />
          {flight.amount}
        </div>
      ))}
    </>
  );
}

/**
 * Watches the hand for the two moments chips actually move, and returns the
 * short-lived flights to draw for each.
 */
export function useChipFlights(
  game: GameState,
  seats: Player[],
  betPositions: SeatPosition[]
): Flight[] {
  const [flights, setFlights] = useState<Flight[]>([]);
  const previousBets = useRef<Record<string, number>>({});
  const settledHand = useRef<number | null>(null);
  // Read positions through a ref so the effects depend only on the game state.
  const layout = useRef({ seats, betPositions });
  layout.current = { seats, betPositions };

  // Bets pushed into the middle when a betting round closes.
  useEffect(() => {
    const current: Record<string, number> = {};
    for (const p of game.players) current[p.id] = p.currentBet;
    const previous = previousBets.current;
    previousBets.current = current;

    if (game.phase === 'finished') return;
    const raked = game.players.filter((p) => (previous[p.id] ?? 0) > 0 && p.currentBet === 0);
    if (raked.length === 0) return;

    const { seats: seatOrder, betPositions: positions } = layout.current;
    const next: Flight[] = [];
    for (const player of raked) {
      const index = seatOrder.findIndex((s) => s.id === player.id);
      const from = positions[index];
      if (!from) continue;
      next.push({
        key: `pot-${game.handNumber}-${game.phase}-${player.id}`,
        amount: previous[player.id],
        from: { left: from.left, top: from.top },
        to: CENTRE,
        kind: 'to-pot',
      });
    }
    if (next.length === 0) return;

    setFlights(next);
    const timer = setTimeout(() => setFlights([]), FLIGHT_MS);
    return () => clearTimeout(timer);
  }, [game.players, game.phase, game.handNumber]);

  // The pot going out to the winner (or split between winners).
  useEffect(() => {
    if (game.phase !== 'finished' || !game.winnerIds?.length) return;
    if (settledHand.current === game.handNumber) return;
    settledHand.current = game.handNumber;

    const { seats: seatOrder, betPositions: positions } = layout.current;
    const pot = game.players.reduce((sum, p) => sum + p.totalBetThisHand, 0);
    const share = Math.floor(pot / game.winnerIds.length);
    const next: Flight[] = [];
    for (const winnerId of game.winnerIds) {
      const index = seatOrder.findIndex((s) => s.id === winnerId);
      const to = positions[index];
      if (!to) continue;
      next.push({
        key: `win-${game.handNumber}-${winnerId}`,
        amount: share,
        from: CENTRE,
        to: { left: to.left, top: to.top },
        kind: 'to-winner',
      });
    }
    if (next.length === 0) return;

    setFlights(next);
    const timer = setTimeout(() => setFlights([]), FLIGHT_MS + 200);
    return () => clearTimeout(timer);
  }, [game.phase, game.winnerIds, game.handNumber, game.players]);

  return flights;
}
