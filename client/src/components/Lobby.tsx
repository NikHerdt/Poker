import { useState } from 'react';
import type { BlindIncreaseMode, RoomConfig } from 'shared/types';
import { blindsForLevel } from 'shared/blinds';
import { TestScenarioPicker } from './TestScenarioPicker';
import './Lobby.css';

interface LobbyProps {
  roomCode?: string;
  playerId?: string;
  isHost?: boolean;
  playerCount?: number;
  /** Config of the room being waited in (absent on the create/join screen). */
  config?: RoomConfig;
  pendingTestScenario?: string;
  onLeave?: () => void;
  onStartGame?: () => void;
  onCreateRoom?: (playerName: string, config?: Partial<RoomConfig>) => void;
  onJoinRoom?: (roomCode: string, playerName: string) => void;
  onSelectTestScenario?: (scenarioId: string | null) => void;
}

export function Lobby({
  roomCode,
  isHost,
  playerCount = 0,
  config,
  pendingTestScenario,
  onLeave,
  onStartGame,
  onCreateRoom,
  onJoinRoom,
  onSelectTestScenario,
}: LobbyProps) {
  const [createName, setCreateName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [joinName, setJoinName] = useState('');
  const [createConfig, setCreateConfig] = useState({ smallBlind: '5', bigBlind: '10', buyIn: '200' });
  const [blindMode, setBlindMode] = useState<BlindIncreaseMode>('none');
  const [handsPerLevel, setHandsPerLevel] = useState('10');
  const [minutesPerLevel, setMinutesPerLevel] = useState('15');
  const [blindMultiplier, setBlindMultiplier] = useState('2');
  const [testMode, setTestMode] = useState(false);

  const parsedSmallBlind = Math.max(1, Math.floor(Number(createConfig.smallBlind)) || 5);
  const parsedBigBlind = Math.max(1, Math.floor(Number(createConfig.bigBlind)) || 10);
  const parsedMultiplier = Number(blindMultiplier) > 1 ? Number(blindMultiplier) : 2;

  const buildBlindStructure = (): RoomConfig['blindStructure'] => {
    if (blindMode === 'none') return undefined;
    if (blindMode === 'hands') {
      return {
        mode: 'hands',
        handsPerLevel: Math.max(1, Math.floor(Number(handsPerLevel)) || 10),
        multiplier: parsedMultiplier,
      };
    }
    return {
      mode: 'time',
      minutesPerLevel: Math.max(1, Number(minutesPerLevel) || 15),
      multiplier: parsedMultiplier,
    };
  };

  const previewLevels = [1, 2, 3].map((level) => ({
    level,
    ...blindsForLevel(
      { smallBlind: parsedSmallBlind, bigBlind: parsedBigBlind, blindStructure: buildBlindStructure() },
      level
    ),
  }));

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const name = createName.trim() || 'Player';
    const buyIn = Math.max(1, Math.floor(Number(createConfig.buyIn)) || 200);
    onCreateRoom?.(name, {
      smallBlind: parsedSmallBlind,
      bigBlind: parsedBigBlind,
      buyIn,
      blindStructure: buildBlindStructure(),
      testMode,
    });
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
        {config && (
          <p className="meta">
            Blinds {config.smallBlind}/{config.bigBlind} · buy-in {config.buyIn}
            {config.blindStructure?.mode === 'hands' &&
              ` · blinds up every ${config.blindStructure.handsPerLevel} hands`}
            {config.blindStructure?.mode === 'time' &&
              ` · blinds up every ${config.blindStructure.minutesPerLevel} min`}
          </p>
        )}
        {config?.testMode && onSelectTestScenario && (
          <TestScenarioPicker
            isHost={isHost === true}
            pendingScenario={pendingTestScenario}
            onSelect={onSelectTestScenario}
          />
        )}
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

      <form onSubmit={handleCreate} className="lobby-section lobby-form">
        <h2>Create room</h2>
        <div className="field">
          <input
            type="text"
            placeholder="Your name"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
          />
        </div>
        <div className="row">
          <div className="row-cell">
            <input
              type="number"
              min={1}
              placeholder="SB"
              value={createConfig.smallBlind}
              onChange={(e) => setCreateConfig((c) => ({ ...c, smallBlind: e.target.value }))}
            />
          </div>
          <div className="row-cell">
            <input
              type="number"
              min={1}
              placeholder="BB"
              value={createConfig.bigBlind}
              onChange={(e) => setCreateConfig((c) => ({ ...c, bigBlind: e.target.value }))}
            />
          </div>
          <div className="row-cell">
            <input
              type="number"
              min={1}
              placeholder="Buy-in"
              value={createConfig.buyIn}
              onChange={(e) => setCreateConfig((c) => ({ ...c, buyIn: e.target.value }))}
            />
          </div>
        </div>

        <fieldset className="blind-structure">
          <legend>Raise blinds (tournament)</legend>
          <div className="blind-mode-row">
            {(
              [
                ['none', 'Never'],
                ['hands', 'Every N hands'],
                ['time', 'Every N minutes'],
              ] as [BlindIncreaseMode, string][]
            ).map(([mode, label]) => (
              <label key={mode} className="blind-mode-option">
                <input
                  type="radio"
                  name="blind-mode"
                  value={mode}
                  checked={blindMode === mode}
                  onChange={() => setBlindMode(mode)}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>

          {blindMode !== 'none' && (
            <>
              <div className="row">
                <div className="row-cell">
                  <label className="field-label">
                    {blindMode === 'hands' ? 'Hands per level' : 'Minutes per level'}
                  </label>
                  {blindMode === 'hands' ? (
                    <input
                      type="number"
                      min={1}
                      value={handsPerLevel}
                      onChange={(e) => setHandsPerLevel(e.target.value)}
                    />
                  ) : (
                    <input
                      type="number"
                      min={1}
                      step="any"
                      value={minutesPerLevel}
                      onChange={(e) => setMinutesPerLevel(e.target.value)}
                    />
                  )}
                </div>
                <div className="row-cell">
                  <label className="field-label">Multiplier per level</label>
                  <input
                    type="number"
                    min={1.1}
                    step={0.1}
                    value={blindMultiplier}
                    onChange={(e) => setBlindMultiplier(e.target.value)}
                  />
                </div>
              </div>
              <p className="blind-preview">
                {previewLevels
                  .map((l) => `L${l.level}: ${l.smallBlind}/${l.bigBlind}`)
                  .join('  ·  ')}
                {'  ·  …'}
              </p>
            </>
          )}
        </fieldset>

        <label className="test-mode-toggle">
          <input type="checkbox" checked={testMode} onChange={(e) => setTestMode(e.target.checked)} />
          <span>Test mode (host can deal rigged hands to check house rules)</span>
        </label>

        <button type="submit" className="primary">Create room</button>
      </form>

      <form onSubmit={handleJoin} className="lobby-section lobby-form">
        <h2>Join room</h2>
        <div className="field">
          <input
            type="text"
            placeholder="Room code"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            maxLength={6}
          />
        </div>
        <div className="field">
          <input
            type="text"
            placeholder="Your name"
            value={joinName}
            onChange={(e) => setJoinName(e.target.value)}
          />
        </div>
        <button type="submit" className="primary">Join</button>
      </form>
    </div>
  );
}
