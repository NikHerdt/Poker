import { useGameSocket } from './hooks/useGameSocket';
import { Lobby } from './components/Lobby';
import { Table } from './components/Table';

export default function App() {
  const socket = useGameSocket();
  const { state, playerId, error, connected, clearError, leaveRoom } = socket;

  return (
    <div style={{ minHeight: '100vh', padding: '1rem' }}>
      {error && (
        <div
          role="alert"
          style={{
            padding: '0.75rem 1rem',
            marginBottom: '1rem',
            background: '#5c2a2a',
            borderRadius: 8,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{error}</span>
          <button type="button" onClick={clearError}>
            Dismiss
          </button>
        </div>
      )}
      {!connected && (
        <p style={{ color: '#b0a090' }}>Connecting to server...</p>
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
          onLeave={leaveRoom}
          onStartGame={socket.startGame}
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
