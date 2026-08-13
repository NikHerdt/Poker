import { useEffect, useState } from 'react';
import type { Player, RoomState } from 'shared/types';
import { MAX_PLO_PLAYERS } from 'shared/constants';
import type { UseGameSocketResult } from '../hooks/useGameSocket';
import { TestScenarioPicker } from './TestScenarioPicker';

interface GameMenuProps {
  state: RoomState;
  playerId: string;
  players: Player[];
  socket: UseGameSocketResult;
}

/**
 * Everything that is not a betting decision, tucked behind one button so the
 * table stays uncluttered: the room code, calling a vote on somebody, switching
 * the game to Omaha, test scenarios and leaving.
 */
export function GameMenu({ state, playerId, players, socket }: GameMenuProps) {
  const [open, setOpen] = useState(false);

  // Escape closes it, as with any dialog.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const seated = players.filter((p) => state.playerIdToName[p.id]);
  const others = seated.filter((p) => p.id !== playerId);
  const canKick = seated.length >= 3 && !state.kickVote;
  const handOver = state.game?.phase === 'finished';
  const ploAllowed = players.length <= MAX_PLO_PLAYERS;
  const isHost = state.hostId === playerId;

  return (
    <>
      <button
        type="button"
        className="menu-btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Game menu"
      >
        Menu
      </button>

      {open && (
        <>
          <div className="menu-scrim" onClick={() => setOpen(false)} role="presentation" />
          <div className="game-menu" role="dialog" aria-label="Game menu">
            <div className="menu-header">
              <span>
                Room <b>{state.roomCode}</b>
              </span>
              <button type="button" className="mini-btn" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>

            <section className="menu-section">
              <h3>Players</h3>
              {others.length === 0 ? (
                <p className="menu-note">Nobody else at the table yet.</p>
              ) : (
                <ul className="player-rows">
                  {others.map((p) => (
                    <li key={p.id} className="player-row">
                      <span className="player-row-name">
                        {state.playerIdToName[p.id] ?? p.name}
                        {state.disconnectedAtMs?.[p.id] !== undefined && (
                          <span className="menu-tag">away</span>
                        )}
                      </span>
                      <button
                        type="button"
                        className="mini-btn danger"
                        disabled={!canKick}
                        title={
                          state.kickVote
                            ? 'A vote is already running'
                            : seated.length < 3
                              ? 'A kick needs at least three players'
                              : `Call a vote to remove ${state.playerIdToName[p.id] ?? 'this player'}`
                        }
                        onClick={() => {
                          socket.startKickVote(p.id);
                          setOpen(false);
                        }}
                      >
                        Vote to kick
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="menu-section">
              <h3>Game</h3>
              <div className="menu-actions">
                <button
                  type="button"
                  className="mini-btn"
                  disabled={!handOver || !ploAllowed || Boolean(state.ploVote) || state.ploVoteConcluded}
                  title={
                    !ploAllowed
                      ? `Omaha only works with up to ${MAX_PLO_PLAYERS} players`
                      : !handOver
                        ? 'Can be voted on between hands'
                        : 'Vote to play the next round as Pot Limit Omaha'
                  }
                  onClick={() => {
                    socket.sendPloVoteStart();
                    setOpen(false);
                  }}
                >
                  Vote for PLO
                </button>
                <button
                  type="button"
                  className="mini-btn danger"
                  onClick={() => {
                    setOpen(false);
                    socket.leaveRoom();
                  }}
                >
                  Leave table
                </button>
              </div>
            </section>

            {state.config.testMode && (
              <section className="menu-section">
                <h3>Test mode</h3>
                <TestScenarioPicker
                  isHost={isHost}
                  pendingScenario={state.pendingTestScenario}
                  onSelect={socket.sendTestScenario}
                />
              </section>
            )}
          </div>
        </>
      )}
    </>
  );
}
