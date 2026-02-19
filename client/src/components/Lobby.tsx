import { useState } from 'react';
import './Lobby.css';

interface LobbyProps {
  roomCode?: string;
  playerId?: string;
  isHost?: boolean;
  playerCount?: number;
  onLeave?: () => void;
  onStartGame?: () => void;
  onCreateRoom?: (playerName: string, config?: { smallBlind?: number; bigBlind?: number; buyIn?: number }) => void;
  onJoinRoom?: (roomCode: string, playerName: string) => void;
}

export function Lobby({
  roomCode,
  isHost,
  playerCount = 0,
  onLeave,
  onStartGame,
  onCreateRoom,
  onJoinRoom,
}: LobbyProps) {
  const [createName, setCreateName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [joinName, setJoinName] = useState('');
  const [createConfig, setCreateConfig] = useState({ smallBlind: 5, bigBlind: 10, buyIn: 200 });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const name = createName.trim() || 'Player';
    onCreateRoom?.(name, createConfig);
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    const name = joinName.trim() || 'Player';
    onJoinRoom?.(code, name);
  };

  if (roomCode != null) {
    return (
      <div className="room-view">
        <h1>Room</h1>
        <div className="code">{roomCode}</div>
        <p className="meta">
          {playerCount} player{playerCount !== 1 ? 's' : ''} in room
          {isHost && ' (you are host)'}
        </p>
        <p className="hint">Share the room code with friends so they can join.</p>
        <div className="actions">
          {isHost && onStartGame && (
            <button type="button" className="start-btn" onClick={onStartGame}>
              Start game
            </button>
          )}
          {onLeave && (
            <button type="button" className="leave-btn" onClick={onLeave}>
              Leave room
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="lobby-page">
      <h1>Poker</h1>

      <form onSubmit={handleCreate} className="lobby-section">
        <h2>Create room</h2>
        <input
          type="text"
          placeholder="Your name"
          value={createName}
          onChange={(e) => setCreateName(e.target.value)}
        />
        <div className="row">
          <input
            type="number"
            min={1}
            placeholder="SB"
            value={createConfig.smallBlind}
            onChange={(e) => setCreateConfig((c) => ({ ...c, smallBlind: Number(e.target.value) || 5 }))}
          />
          <input
            type="number"
            min={1}
            placeholder="BB"
            value={createConfig.bigBlind}
            onChange={(e) => setCreateConfig((c) => ({ ...c, bigBlind: Number(e.target.value) || 10 }))}
          />
          <input
            type="number"
            min={1}
            placeholder="Buy-in"
            value={createConfig.buyIn}
            onChange={(e) => setCreateConfig((c) => ({ ...c, buyIn: Number(e.target.value) || 200 }))}
          />
        </div>
        <button type="submit" className="primary">Create room</button>
      </form>

      <form onSubmit={handleJoin} className="lobby-section">
        <h2>Join room</h2>
        <input
          type="text"
          placeholder="Room code"
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
          maxLength={6}
        />
        <input
          type="text"
          placeholder="Your name"
          value={joinName}
          onChange={(e) => setJoinName(e.target.value)}
        />
        <button type="submit" className="primary">Join</button>
      </form>
    </div>
  );
}
