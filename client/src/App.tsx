import { useGameSocket } from './hooks/useGameSocket';
import { Lobby } from './components/Lobby';
import { Table } from './components/Table';

export default function App() {
  const socket = useGameSocket();
  const { state, playerId, error, connected, staleServer, clearError, leaveRoom } = socket;

  // The table lays itself out to the full screen, so the shell drops its
  // padding. It stays up through a dropped connection, so a blip does not look
  // like being thrown out of the game.
  const atTable = Boolean(state?.game);

  return (
    <div className={`app-shell ${atTable ? 'app-shell-table' : ''}`}>
      {staleServer && (
        <div role="alert" className="app-alert app-alert-stale">
          <span>
            <b>The game server is running an older build than this page.</b> Betting amounts,
            showing cards and blind levels will misbehave until it is restarted — stop it and run{' '}
            <code>npm run server</code> again.
          </span>
        </div>
      )}
      {error && (
        <div role="alert" className="app-alert">
          <span>{error}</span>
          <button type="button" onClick={clearError}>
            Dismiss
          </button>
        </div>
      )}
      {!connected && !state && <p className="app-connecting">Connecting to server…</p>}
      {!connected && state && (
        <div role="status" className="app-alert app-alert-reconnecting">
          <span>Connection lost — reconnecting. Your seat is being held.</span>
        </div>
      )}
      {connected && socket.rejoining && !state && (
        <p className="app-connecting">Getting your seat back…</p>
      )}
      {connected && !state && !socket.rejoining && (
        <Lobby
          onCreateRoom={socket.createRoom}
          onJoinRoom={socket.joinRoom}
        />
      )}
      {state && !state.game && (
        <Lobby
          roomCode={state.roomCode}
          playerId={playerId ?? undefined}
          isHost={state.hostId === playerId}
          playerCount={Object.keys(state.playerIdToName).length}
          config={state.config}
          pendingTestScenario={state.pendingTestScenario}
          onLeave={leaveRoom}
          onStartGame={socket.startGame}
          onSelectTestScenario={socket.sendTestScenario}
        />
      )}
      {state?.game && (
        <Table
          state={state}
          playerId={playerId ?? ''}
          socket={socket}
        />
      )}
    </div>
  );
}
