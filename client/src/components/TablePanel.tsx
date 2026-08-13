import type { Player, RoomState } from 'shared/types';
import type { UseGameSocketResult } from '../hooks/useGameSocket';

interface TablePanelProps {
  state: RoomState;
  playerId: string;
  players: Player[];
  socket: UseGameSocketResult;
}

/** Between-hands control for voting somebody off the table. */
export function TablePanel({ state, playerId, players, socket }: TablePanelProps) {
  const others = players.filter((p) => p.id !== playerId && state.playerIdToName[p.id]);
  const canKick = players.filter((p) => state.playerIdToName[p.id]).length >= 3;
  if (others.length === 0 || !canKick || state.kickVote) return null;

  return (
    <div className="table-panel">
      <div className="table-panel-title">Table</div>
      <ul className="player-rows">
        {others.map((p) => (
          <li key={p.id} className="player-row">
            <span className="player-row-name">{state.playerIdToName[p.id] ?? p.name}</span>
            <button
              type="button"
              className="mini-btn danger"
              onClick={() => socket.startKickVote(p.id)}
              title="Call a vote to remove this player"
            >
              Kick
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Asking to see a hand, offered only to a player who has folded and only while
 * the hand is still live. Once it is over there is nothing to ask for — anyone
 * who wants to show can just show.
 */
export function PeekBar({
  state,
  playerId,
  players,
  socket,
}: {
  state: RoomState;
  playerId: string;
  players: Player[];
  socket: UseGameSocketResult;
}) {
  const granted = new Set(state.peekGrants?.[playerId] ?? []);
  const asked = new Set(
    (state.peekRequests ?? []).filter((r) => r.viewerId === playerId).map((r) => r.targetId)
  );
  const others = players.filter(
    (p) => p.id !== playerId && !p.folded && state.playerIdToName[p.id]
  );
  if (others.length === 0) return null;

  return (
    <div className="peek-bar">
      <span className="peek-bar-label">You are out of this hand. Ask to see:</span>
      <span className="peek-bar-buttons">
        {others.map((p) => {
          const name = state.playerIdToName[p.id] ?? p.name;
          if (granted.has(p.id)) {
            return (
              <span key={p.id} className="peek-granted">
                {name} is showing you
              </span>
            );
          }
          if (asked.has(p.id)) {
            return (
              <span key={p.id} className="peek-pending">
                asked {name}…
              </span>
            );
          }
          return (
            <button
              key={p.id}
              type="button"
              className="mini-btn"
              onClick={() => socket.requestPeek(p.id)}
              title={`Ask ${name} to show you their hand`}
            >
              {name}
            </button>
          );
        })}
      </span>
    </div>
  );
}

/** Someone wants to see your hand. */
export function PeekPrompts({
  state,
  playerId,
  socket,
}: {
  state: RoomState;
  playerId: string;
  socket: UseGameSocketResult;
}) {
  const forMe = (state.peekRequests ?? []).filter((r) => r.targetId === playerId);
  if (forMe.length === 0) return null;

  return (
    <div className="notice peek-prompts">
      {forMe.map((request) => (
        <div key={request.viewerId} className="peek-prompt">
          <span>
            <b>{state.playerIdToName[request.viewerId] ?? 'A player'}</b> wants to see your hand.
          </span>
          <span className="peek-actions">
            <button
              type="button"
              className="btn admit"
              onClick={() => socket.answerPeek(request.viewerId, true)}
            >
              Show them
            </button>
            <button
              type="button"
              className="btn decline"
              onClick={() => socket.answerPeek(request.viewerId, false)}
            >
              No
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}

/** A vote to remove somebody, shown to everyone but the player being voted on. */
export function KickVoteBanner({
  state,
  playerId,
  socket,
}: {
  state: RoomState;
  playerId: string;
  socket: UseGameSocketResult;
}) {
  const vote = state.kickVote;
  if (!vote) return null;

  const targetName = state.playerIdToName[vote.targetId] ?? 'a player';
  if (vote.targetId === playerId) {
    return (
      <div className="notice kick-banner">
        The table is voting on whether to remove you.
      </div>
    );
  }

  const yes = Object.values(vote.votes).filter((v) => v === 'yes').length;
  const no = Object.values(vote.votes).filter((v) => v === 'no').length;
  const myVote = vote.votes[playerId];

  return (
    <div className="notice kick-banner">
      <span>
        <b>{state.playerIdToName[vote.initiatorId] ?? 'Someone'}</b> wants to remove{' '}
        <b>{targetName}</b>. Yes {yes} · No {no}
      </span>
      {myVote ? (
        <span className="kick-voted">You voted {myVote}</span>
      ) : (
        <span className="kick-actions">
          <button type="button" className="btn admit" onClick={() => socket.sendKickVote(true)}>
            Yes
          </button>
          <button type="button" className="btn decline" onClick={() => socket.sendKickVote(false)}>
            No
          </button>
        </span>
      )}
    </div>
  );
}
