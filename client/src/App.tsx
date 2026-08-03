import { useGameSocket } from './hooks/useGameSocket';
import { Lobby } from './components/Lobby';
import { Table } from './components/Table';

export default function App() {
  const socket = useGameSocket();
  const { state, playerId, error, connected, clearError, leaveRoom } = socket;

  // The table lays itself out to the full screen, so the shell drops its padding.
  const atTable = connected && Boolean(state?.game);

  return (
    <div className={`app-shell ${atTable ? 'app-shell-table' : ''}`}>
      {error && (
        <div role="alert" className="app-alert">
          <span>{error}</span>
          <button type="button" onClick={clearError}>
            Dismiss
          </button>
        </div>
      )}
      {!connected && (
        <p className="app-connecting">Connecting to server...</p>
      )}
      {connected && !state && (
        <Lobby
          onCreateRoom={socket.createRoom}
          onJoinRoom={socket.joinRoom}
        />
      )}
      {connected && state && !state.game && (
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
      {connected && state?.game && (
        <Table
          state={state}
          playerId={playerId ?? ''}
          socket={socket}
        />
      )}
    </div>
  );
}
