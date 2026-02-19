import { useCallback, useEffect, useRef, useState } from 'react';
import type { RoomState, ClientMessage, ServerMessage } from 'shared/types';

const WS_URL =
  typeof window !== 'undefined'
    ? (window.location.protocol === 'https:' ? 'wss://' : 'ws://') + window.location.hostname + ':3001'
    : '';

export interface UseGameSocketResult {
  state: RoomState | null;
  playerId: string | null;
  roomCode: string | null;
  error: string | null;
  connected: boolean;
  createRoom: (playerName: string, config?: { smallBlind?: number; bigBlind?: number; buyIn?: number }) => void;
  joinRoom: (roomCode: string, playerName: string) => void;
  startGame: () => void;
  sendAction: (action: { type: 'fold' | 'check' | 'call' | 'raise' | 'all_in'; amount?: number }) => void;
  leaveRoom: () => void;
  clearError: () => void;
  sendFieldGoalAttempt: (success: boolean) => void;
}

export function useGameSocket(): UseGameSocketResult {
  const [state, setState] = useState<RoomState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const send = useCallback((msg: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const createRoom = useCallback(
    (playerName: string, config?: { smallBlind?: number; bigBlind?: number; buyIn?: number }) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        send({ type: 'create_room', playerName, config });
      }
    },
    [send]
  );

  const joinRoom = useCallback(
    (code: string, playerName: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        send({ type: 'join_room', roomCode: code.trim().toUpperCase(), playerName });
      }
    },
    [send]
  );

  const startGame = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      send({ type: 'start_game' });
    }
  }, [send]);

  const sendAction = useCallback(
    (action: { type: 'fold' | 'check' | 'call' | 'raise' | 'all_in'; amount?: number }) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        send({ type: 'action', action });
      }
    },
    [send]
  );

  const leaveRoom = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      send({ type: 'leave_room' });
    }
    setState(null);
    setPlayerId(null);
    setRoomCode(null);
    setError(null);
  }, [send]);

  const sendFieldGoalAttempt = useCallback(
    (success: boolean) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        send({ type: 'field_goal_attempt', fieldGoalSuccess: success });
      }
    },
    [send]
  );

  const clearError = useCallback(() => setError(null), []);

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => {
      setConnected(false);
      setState(null);
      setPlayerId(null);
      setRoomCode(null);
    };
    ws.onerror = () => setError('Connection error');

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as ServerMessage & { state?: RoomState; playerId?: string; roomCode?: string };
        if (data.type === 'room_created' && data.state != null) {
          setState(data.state);
          setPlayerId(data.playerId ?? null);
          setRoomCode(data.roomCode ?? null);
          setError(null);
        } else if (data.type === 'room_joined' && data.state != null) {
          setState(data.state);
          setPlayerId(data.playerId ?? null);
          setRoomCode(data.roomCode ?? null);
          setError(null);
        } else if (data.type === 'room_state' && data.state != null) {
          setState(data.state);
        } else if (data.type === 'game_started' && data.state != null) {
          setState(data.state);
          setError(null);
        } else if (data.type === 'error' && data.error) {
          setError(data.error);
        }
      } catch {
        setError('Invalid message');
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, []);

  return {
    state,
    playerId,
    roomCode,
    error,
    connected,
    createRoom,
    joinRoom,
    startGame,
    sendAction,
    leaveRoom,
    clearError,
    sendFieldGoalAttempt,
  };
}
